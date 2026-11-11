import { Input } from 'phaser';
import type { ActivityKind } from '../../shared/protocol.ts';
import { areaAt, type RoomObject } from '../data/room';
import { byClassAndNickname, classCounts, describeStudent } from '../game/cctv';
import { formatDuration, RunState } from '../game/state';
import { CctvPanel } from '../ui/cctv';
import { objectParticle } from '../ui/dom';
import { Hud } from '../ui/hud';
import { color, size } from '../theme';
import { MapScene, type MapContext, type Reserved } from './MapScene';

/** 선생님의 CCTV 모드 */
interface Cctv {
  panel: CctvPanel;
  /** 따라가는 학생의 접속 id. 전체 보기면 null */
  following: string | null;
}

/** 닫은 키가 곧바로 다시 살펴보기로 이어지지 않게 두는 틈(ms) */
const REOPEN_GUARD = 250;

/**
 * 학교: 교실, 복도, 실험실, 운동장이 이어진 맵을 돌아다니며 사물을 살펴보는 방탈출. 장소 사이 문은 잠겨 있다가 열면 지나갈 수 있다.
 * 화면은 내 아바타를 따라간다. 선생님은 CCTV 모드로 학생을 지켜보고 골든벨을 시작한다.
 */
export class RoomScene extends MapScene {
  readonly mapId = 'school';
  private hud!: Hud;
  private highlight!: Phaser.GameObjects.Graphics;
  private target: RoomObject | null = null;
  private busy = false;
  private studentCount = -1;
  private cctv: Cctv | null = null;
  /** 지금 서 있는 장소 이름(안내에 보인 것) */
  private place = '';

  constructor() {
    super('school');
  }

  private get state(): RunState {
    return this.ctx.state;
  }

  init(ctx: MapContext) {
    super.init(ctx);
    this.target = null;
    this.busy = false;
    this.studentCount = -1;
    this.cctv = null;
    this.place = '';
    // 단서·퀴즈 창을 띄운 채 맵을 옮겼으면 그때의 '하는 일'이 남아 있으므로 지운다.
    ctx.state.activity = { kind: '', object: '' };
  }

  create() {
    super.create();
    this.highlight = this.add.graphics().setDepth(Number.MAX_SAFE_INTEGER);

    const teacher = this.net.role === 'teacher';
    this.hud = new Hud(this.room.goal, this.touch, teacher);
    this.hud.setRoomCode(this.net.code);
    this.updatePlace();
    // 골든벨에 다녀왔으면 연 문이 그대로 열려 있다.
    for (const o of this.room.objects) if (this.isOpenDoor(o)) this.objectViews.get(o.id)?.setOpen(true);
    // 골든벨에 다녀왔으면 가진 물건이 그대로 있다.
    this.hud.setItems([...this.state.items].map((id) => this.room.items[id]));
    this.hud.onAction(this.onActionButton);
    this.hud.cctv.addEventListener('click', this.onCctvButton);
    this.hud.goldenbell.addEventListener('click', this.onGoldenBellButton);
    if (teacher) {
      this.input.on('pointerdown', this.onPointerDown, this);
      this.input.on('pointermove', this.onPointerMove, this);
    }
    this.events.once('shutdown', () => {
      this.cctv?.panel.destroy();
      this.cctv = null;
      this.game.canvas.style.cursor = '';
      this.input.off('pointerdown', this.onPointerDown, this);
      this.input.off('pointermove', this.onPointerMove, this);
      this.hud.destroy();
    });
    this.fitCamera();

    this.exposeDevHooks({
      items: () => [...this.state.items],
      place: () => this.place,
      target: () => this.target?.id ?? null,
      escaped: () => this.state.escapedAt !== null,
      cctv: () => {
        if (!this.cctv) return null;
        const cam = this.cameras.main;
        const following = this.cctv.following ? this.net.room.state.players.get(this.cctv.following) : undefined;
        return {
          following: following?.nickname ?? null,
          zoom: cam.zoom / this.dpr,
          center: { col: cam.midPoint.x / size.tile, row: cam.midPoint.y / size.tile },
          tags: [...this.remotes.values()].filter((r) => r.avatar.tag?.visible).map((r) => r.avatar.tag!.text),
        };
      },
    });
  }

  /** 골든벨에서 돌아왔으면 떠날 때 서 있던 자리에, 아니면 시작 위치 둘레에 선다. */
  protected startPoint() {
    const back = this.ctx.schoolPos;
    this.ctx.schoolPos = null;
    if (back && this.free(back.col, back.row)) return back;
    return this.spawnPoint();
  }

  protected beforeLeave() {
    this.ctx.schoolPos = { ...this.pos };
  }

  /** 연 문은 지나갈 수 있다(나만). */
  protected objectBlocks(o: RoomObject) {
    return !this.isOpenDoor(o);
  }

  private isOpenDoor(o: RoomObject) {
    return o.action?.type === 'open' && this.state.done.has(o.id);
  }

  /** 지금 장소 이름을 안내에 보인다(바뀌었을 때만). */
  private updatePlace() {
    const name = areaAt(this.room, this.pos.col, this.pos.row)?.name ?? this.room.name;
    if (name === this.place) return;
    this.place = name;
    this.hud.setPlace(name);
  }

  protected setConnectionText(text: string | null) {
    this.hud.setStatus(text);
  }

  protected tick(delta: number) {
    // 진행 상태가 바뀌었으면 서버로 보낸다(바뀌지 않았으면 보내지 않는다).
    if (this.net.role === 'student') this.net.sendStatus(this.state.toStatus());
    if (this.net.role === 'teacher') {
      const n = this.net.studentCount();
      if (n !== this.studentCount) {
        this.studentCount = n;
        this.hud.setStudentCount(n);
      }
    }
    if (this.cctv) {
      this.updateCctv();
      return;
    }
    if (this.dialog.isOpen() || this.busy) return;

    this.moveByInput(delta);
    this.updatePlace();
    this.updateTarget();

    // 두 키의 눌림 표시를 함께 지운다.
    const space = Input.Keyboard.JustDown(this.keys.SPACE);
    const e = Input.Keyboard.JustDown(this.keys.E);
    if ((space || e) && this.target && performance.now() - this.dialog.lastClosedAt > REOPEN_GUARD) {
      void this.interact(this.target);
    }
  }

  // ---- 화면 맞추기 ----

  /** CCTV 모드에서는 오른쪽을 CCTV 창이 쓴다. */
  protected reserved(): Reserved {
    const cam = this.cameras.main;
    return {
      top: this.css(size.reserveTop),
      bottom: 0,
      right: this.cctv ? Math.max(0, cam.width - this.css(this.cctv.panel.left)) : 0,
    };
  }

  /**
   * 평소에는 내 아바타를 따라간다(맵 밖은 비추지 않는다). CCTV 전체 보기는 학교 맵 전체를 맞추고,
   * 학생을 고르면 그 학생을 내 화면과 같은 배율로 따라간다(그 학생이 가운데에 오게, 맵 밖도 비춘다).
   */
  protected fitCamera() {
    if (!this.cctv) {
      this.followCamera(this.avatar, true);
      return;
    }
    const following = this.cctv.following ? this.remotes.get(this.cctv.following) : undefined;
    if (following) this.followCamera(following.avatar, false);
    else super.fitCamera();
  }

  /** CCTV 전체 보기에서는 작은 지도 위에서도 학생이 보이게 캐릭터와 글을 따로 키운다. */
  protected remoteScale() {
    if (!this.cctv || this.cctv.following) return { sprite: 1, text: 1 };
    const zoom = this.cameras.main.zoom / this.dpr;
    return { sprite: Math.max(1, size.cctvAvatarZoom / zoom), text: Math.max(1, size.cctvTextZoom / zoom) };
  }

  // ---- 골든벨 시작(선생님) ----

  private onGoldenBellButton = () => {
    this.hud.goldenbell.blur();
    void this.startGoldenBell();
  };

  /** 문제 파일을 고르면 서버가 모두를 골든벨 맵으로 옮긴다(장면은 update()에서 바뀐다). */
  private async startGoldenBell() {
    if (this.dialog.isOpen() || this.busy || this.cctv) return;
    this.busy = true;
    try {
      const files = await this.net.gbFiles();
      if (!files.length) {
        await this.dialog.message('골든벨', '문제 파일이 없습니다. 서버의 goldenbell 폴더에 .yaml 파일을 넣습니다.');
        return;
      }
      const picked = await this.dialog.choose(
        '골든벨 시작',
        '문제 파일을 고릅니다. 고르면 모든 학생이 골든벨 맵으로 옮겨 갑니다.',
        files.map((f) => ({
          label: f.error ? f.file : `${f.title} (${f.count}문제)`,
          detail: f.error ?? f.file,
          disabled: f.error !== null,
        })),
      );
      if (picked === null) return;
      const reply = await this.net.gbStart(files[picked].file);
      if (reply.error) await this.dialog.message('골든벨', reply.error);
    } catch {
      await this.dialog.message('골든벨', '서버에서 답을 받지 못했습니다. 잠시 뒤 다시 누릅니다.');
    } finally {
      this.busy = false;
    }
  }

  // ---- CCTV 모드(선생님) ----

  private onCctvButton = () => {
    // 단추에 남은 포커스 때문에 스페이스바가 단추를 다시 누르지 않게 한다.
    this.hud.cctv.blur();
    this.enterCctv();
  };

  private enterCctv() {
    if (this.cctv || this.dialog.isOpen() || this.busy) return;
    const panel = new CctvPanel(
      {
        pick: (id) => this.follow(id),
        back: () => this.unfollow(),
        close: () => this.exitCctv(),
      },
      this.touch,
    );
    this.cctv = { panel, following: null };
    this.hud.setCctv(true);
    this.joystick?.setHidden(true);
    this.target = null;
    this.highlight.clear();
    this.hud.setTarget(null);
    this.updateCctv();
    this.fitCamera();
  }

  private exitCctv() {
    if (!this.cctv) return;
    this.cctv.panel.destroy();
    this.cctv = null;
    for (const r of this.remotes.values()) r.avatar.tag?.setVisible(false);
    this.game.canvas.style.cursor = '';
    this.hud.setCctv(false);
    this.joystick?.setHidden(false);
    this.fitCamera();
  }

  private follow(id: string) {
    if (!this.cctv || !this.remotes.has(id)) return;
    this.cctv.following = id;
    this.updateCctv();
    this.fitCamera();
  }

  private unfollow() {
    if (!this.cctv) return;
    this.cctv.following = null;
    this.updateCctv();
    this.fitCamera();
  }

  /** 학생 목록·정보 창과 아바타 위 표시를 서버 상태에 맞춘다. 매 프레임 부르고, 바뀐 글만 고친다. */
  private updateCctv() {
    const cctv = this.cctv;
    if (!cctv) return;
    if (Input.Keyboard.JustDown(this.keys.ESC) && cctv.following) {
      this.unfollow();
      return;
    }
    const students = this.net
      .students(this.mapId)
      .map(([id, p]) => describeStudent(this.room, id, p))
      .sort(byClassAndNickname);
    for (const s of students) {
      const tag = this.remotes.get(s.id)?.avatar.tag;
      if (!tag) continue;
      if (s.tag !== null && tag.text !== s.tag) tag.setText(s.tag);
      tag.setVisible(s.tag !== null);
    }
    cctv.panel.setInfo(this.net.code, students.length, classCounts(students));
    const followed = students.find((s) => s.id === cctv.following);
    if (cctv.following && !followed) {
      // 따라가던 학생이 나갔으면 전체 보기로 돌아간다.
      this.unfollow();
      return;
    }
    if (followed) cctv.panel.showDetail(followed);
    else cctv.panel.showList(students);
  }

  /**
   * 화면 좌표에 있는 학생. 아바타 몸(발에서 머리까지) 안이거나 몸통 가운데에서 pickRadius(화면 픽셀) 안이면 고른다.
   * 여럿이면 앞에 그려진(발이 아래인) 학생, 그다음 몸통 가운데가 가까운 학생
   */
  private pickStudent(screenX: number, screenY: number): string | null {
    const cam = this.cameras.main;
    const p = cam.getWorldPoint(screenX, screenY);
    let best: { id: string; hit: boolean; y: number; d: number } | null = null;
    for (const [id] of this.net.students(this.mapId)) {
      const a = this.remotes.get(id)?.avatar;
      if (!a) continue;
      const d = Math.hypot(p.x - a.x, p.y - (a.y - a.bodyOffset));
      const hit = a.hit(p.x, p.y);
      if (!hit && d > this.css(size.pickRadius) / cam.zoom) continue;
      const better = !best || (hit && !best.hit) || (hit === best.hit && (hit ? a.y > best.y : d < best.d));
      if (better) best = { id, hit, y: a.y, d };
    }
    return best?.id ?? null;
  }

  private onPointerDown(pointer: Phaser.Input.Pointer) {
    if (!this.cctv) return;
    const id = this.pickStudent(pointer.x, pointer.y);
    if (id) this.follow(id);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer) {
    if (!this.cctv) return;
    this.game.canvas.style.cursor = this.pickStudent(pointer.x, pointer.y) ? 'pointer' : '';
  }

  // ---- 살펴보기 ----

  /** 손이 닿는 거리 안에서 가장 가까운, 살펴볼 수 있는 사물 */
  private updateTarget() {
    let best: RoomObject | null = null;
    let bestDist: number = size.reach;
    for (const o of this.room.objects) {
      // 연 문은 지나가는 길이므로 살펴볼 대상에서 뺀다.
      if (!o.action || this.isOpenDoor(o)) continue;
      const nx = Math.max(o.col, Math.min(this.pos.col, o.col + o.w));
      const ny = Math.max(o.row, Math.min(this.pos.row, o.row + o.h));
      const d = Math.hypot(this.pos.col - nx, this.pos.row - ny);
      if (d <= bestDist) {
        best = o;
        bestDist = d;
      }
    }
    if (best === this.target) return;
    this.target = best;
    this.highlight.clear();
    if (best) {
      const t = size.tile;
      this.highlight
        .lineStyle(size.highlightLine, color.highlight, 1)
        .strokeRect(best.col * t, best.row * t, best.w * t, best.h * t);
    }
    this.hud.setTarget(best?.name ?? null);
  }

  private onActionButton = () => {
    if (this.target && !this.dialog.isOpen() && !this.busy) void this.interact(this.target);
  };

  private async interact(o: RoomObject) {
    const action = o.action;
    if (!action) return;
    this.busy = true;
    this.setActivity(this.opensQuiz(o) ? 'quiz' : 'look', o.id);
    try {
      if (this.state.done.has(o.id)) {
        await this.dialog.message(o.name, o.doneText ?? (action.type === 'clue' ? action.text : '이미 마쳤습니다.'));
        return;
      }
      if (o.requires && !this.state.items.has(o.requires)) {
        await this.dialog.message(o.name, o.lockedText ?? '잠겨 있습니다.');
        return;
      }
      switch (action.type) {
        case 'clue': {
          await this.dialog.message(o.name, action.text);
          if (action.gives) await this.give(o, action.gives, '');
          else this.state.done.add(o.id);
          break;
        }
        case 'quiz': {
          const quiz = this.room.quizzes[action.quiz];
          if (!(await this.dialog.quiz(o.name, quiz))) return;
          if (action.gives) await this.give(o, action.gives, '맞았습니다. ');
          else {
            this.state.done.add(o.id);
            await this.dialog.message(o.name, '맞았습니다.');
          }
          break;
        }
        case 'open': {
          if (action.quiz && !(await this.dialog.quiz(o.name, this.room.quizzes[action.quiz]))) return;
          this.state.done.add(o.id);
          this.objectViews.get(o.id)?.setOpen(true);
          this.target = null;
          this.highlight.clear();
          this.hud.setTarget(null);
          await this.dialog.message(o.name, `${action.quiz ? '맞았습니다. ' : ''}${o.name}${objectParticle(o.name)} 열었습니다. 지나갈 수 있습니다.`);
          break;
        }
        case 'exit': {
          if (action.quiz && !(await this.dialog.quiz(o.name, this.room.quizzes[action.quiz]))) return;
          await this.escape();
          break;
        }
      }
    } finally {
      this.busy = false;
      this.setActivity('', '');
    }
  }

  /** 지금 살펴보면 퀴즈가 뜨는지(마쳤거나 잠겨 있으면 글만 보인다) */
  private opensQuiz(o: RoomObject) {
    const a = o.action;
    if (!a || this.state.done.has(o.id)) return false;
    if (o.requires && !this.state.items.has(o.requires)) return false;
    return a.type === 'quiz' || ((a.type === 'exit' || a.type === 'open') && a.quiz !== undefined);
  }

  /** 지금 하는 일. 서버로는 tick()에서 보낸다. */
  private setActivity(kind: ActivityKind, object: string) {
    this.state.activity = { kind, object };
  }

  private async give(o: RoomObject, itemId: string, prefix: string) {
    const item = this.room.items[itemId];
    this.state.items.add(itemId);
    this.state.done.add(o.id);
    this.hud.setItems([...this.state.items].map((id) => this.room.items[id]));
    await this.dialog.message(o.name, `${prefix}${item}${objectParticle(item)} 얻었습니다.`);
  }

  private async escape() {
    this.state.escapedAt = performance.now();
    const time = formatDuration(this.state.elapsedMs());
    await this.dialog.message(
      '탈출했습니다',
      `${this.state.nickname}님이 ${this.room.name}${objectParticle(this.room.name)} 탈출했습니다.\n걸린 시간: ${time}`,
      '다시 하기',
    );
    this.ctx.state = new RunState(this.state.nickname);
    this.ctx.schoolPos = null;
    this.scene.restart(this.ctx);
  }
}
