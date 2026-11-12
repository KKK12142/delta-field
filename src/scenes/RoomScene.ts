import { Input } from 'phaser';
import { DOOR_KINDS, type MissionReward } from '../../shared/escape.ts';
import { GATHER_SECONDS, type ActivityKind } from '../../shared/protocol.ts';
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
  /** 강당으로 모으기 안내에 보인 남은 시간(초). 바뀔 때만 고친다. */
  private gatherShown = -1;
  /** 화면에 맞춰 둔 방탈출 진행(자료 버전, 잠긴 문, 마친 미션, 물건, 힌트). 서버 값이 바뀌면 문 모양과 안내를 고친다. */
  private escapeShown = '';

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
    this.gatherShown = -1;
    this.escapeShown = '';
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
    // 연 문, 가진 물건, 힌트 카드 수는 서버의 진행을 따른다(골든벨에 다녀와도 그대로).
    this.syncEscape();
    this.hud.onAction(this.onActionButton);
    this.hud.notebook.addEventListener('click', this.onNotebookButton);
    this.hud.escapeFile.addEventListener('click', this.onEscapeFileButton);
    this.hud.cctv.addEventListener('click', this.onCctvButton);
    this.hud.goldenbell.addEventListener('click', this.onGoldenBellButton);
    this.hud.part.addEventListener('click', this.onPartButton);
    this.updateGather();
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
    // 선생님이 방을 만들었는데 방탈출 자료를 아직 고르지 않았으면 바로 고르게 한다(이 접속에서 한 번).
    if (teacher && !this.net.escape.file && !this.ctx.askedEscape) {
      this.ctx.askedEscape = true;
      void this.pickEscapeFile();
    }

    this.exposeDevHooks({
      items: () => [...(this.net.me()?.items ?? [])],
      hints: () => [...(this.net.me()?.hints ?? [])],
      /** 내 화면에서 감춘(주운) 사물 id */
      picked: () => this.room.objects.filter((o) => this.isPicked(o)).map((o) => o.id),
      escapeFile: () => this.net.escape.file,
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

  /** 연 문과 주운 물건은 지나갈 수 있다(나만). */
  protected objectBlocks(o: RoomObject) {
    return !this.isOpenDoor(o) && !this.isPicked(o);
  }

  /** 내가 주워 간 물건(줍기 미션을 마침)이면 화면에서 감춘다. */
  private isPicked(o: RoomObject) {
    return !!o.mission && this.net.escape.pickups.includes(o.mission) && this.hasDone(o.mission);
  }

  /** 문 사물이고, 자료 파일에서 잠긴 문이 아니거나 내가 연 문이면 열려 있다. */
  private isOpenDoor(o: RoomObject) {
    if (!(DOOR_KINDS as readonly string[]).includes(o.kind)) return false;
    if (!o.mission || !this.net.escape.doors.includes(o.mission)) return true;
    return this.hasDone(o.mission);
  }

  private hasDone(mission: string) {
    return this.net.me()?.done.includes(mission) ?? false;
  }

  /** 살펴볼 수 있는 사물: 자료 파일에 미션이 있고, 연 문이나 주운 물건이 아닌 것 */
  private canLook(o: RoomObject) {
    return !!o.mission && this.net.escape.missions.includes(o.mission) && !this.isOpenDoor(o) && !this.isPicked(o);
  }

  /** 서버의 방탈출 진행이 바뀌었으면 문 모양, 가진 물건, 힌트 수첩 단추를 맞춘다. 매 프레임 부르고 바뀐 때만 고친다. */
  private syncEscape() {
    const e = this.net.escape;
    const me = this.net.me();
    const items = [...(me?.items ?? [])];
    const key = [e.version, [...e.doors], [...e.pickups], [...(me?.done ?? [])], items, me?.hints.length ?? 0, e.hintTotal].join('|');
    if (key === this.escapeShown) return;
    this.escapeShown = key;
    for (const o of this.room.objects) {
      const view = this.objectViews.get(o.id);
      view?.setOpen(this.isOpenDoor(o));
      view?.setHidden(this.isPicked(o));
    }
    this.hud.setItems(items.map((id) => e.items.get(id) ?? id));
    this.hud.setHints(me?.hints.length ?? 0, e.hintTotal);
    // 연 문 위에 서 있던 사물 강조를 다시 고른다.
    this.target = null;
    this.highlight.clear();
    this.hud.setTarget(null);
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
    this.updateGather();
    this.syncEscape();
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

  // ---- 강당으로 모으기·2부 열기(선생님) ----

  /** 강당으로 모으는 중이면 남은 시간과 안내를 모두에게 보인다. 선생님 단추는 "모으기 그만두기"가 된다. */
  private updateGather() {
    const { left, title } = this.net.gather;
    if (this.net.role === 'teacher') this.hud.setPart(this.net.part);
    if (left === this.gatherShown) return;
    this.gatherShown = left;
    this.hud.setGathering(left > 0);
    this.hud.setNotice(
      left > 0
        ? `강당으로 모입니다 · 남은 시간 ${formatDuration(left * 1000)}\n시간이 되면 모두 강당으로 옮겨 가 골든벨(${title})을 합니다.`
        : null,
    );
  }

  private onGoldenBellButton = () => {
    this.hud.goldenbell.blur();
    void (this.net.gather.left > 0 ? this.cancelGather() : this.gather());
  };

  /**
   * 문제 파일과 남은 시간(바로, 1·3·5분)을 고르면 서버가 남은 시간을 모두에게 띄우고,
   * 0이 되면 모두를 골든벨 맵으로 옮긴다(장면은 update()에서 바뀐다).
   */
  private async gather() {
    if (this.dialog.isOpen() || this.busy || this.cctv) return;
    this.busy = true;
    try {
      const files = await this.net.gbFiles();
      if (!files.length) {
        await this.dialog.message('강당으로 모으기', '문제 파일이 없습니다. 서버의 goldenbell 폴더에 .yaml 파일을 넣습니다.');
        return;
      }
      const picked = await this.dialog.choose(
        '강당으로 모으기',
        '골든벨 문제 파일을 고릅니다.',
        files.map((f) => ({
          label: f.error ? f.file : `${f.title} (${f.count}문제)`,
          detail: f.error ?? f.file,
          disabled: f.error !== null,
        })),
      );
      if (picked === null) return;
      const file = files[picked];
      const when = await this.dialog.choose(
        '강당으로 모으기',
        `${file.title}: 언제 모을지 고릅니다. 남은 시간이 모든 학생 화면에 보이고, 0이 되면 모두 강당(골든벨 맵)으로 옮겨 갑니다.`,
        GATHER_SECONDS.map((sec) => ({ label: sec === 0 ? '지금 바로 옮기기' : `${sec / 60}분 뒤` })),
      );
      if (when === null) return;
      const reply = await this.net.gbGather(file.file, GATHER_SECONDS[when]);
      if (reply.error) await this.dialog.message('강당으로 모으기', reply.error);
    } catch {
      await this.dialog.message('강당으로 모으기', '서버에서 답을 받지 못했습니다. 잠시 뒤 다시 누릅니다.');
    } finally {
      this.busy = false;
    }
  }

  private async cancelGather() {
    if (this.dialog.isOpen() || this.busy || this.cctv) return;
    this.busy = true;
    try {
      const reply = await this.net.gbGatherCancel();
      if (reply.error) await this.dialog.message('강당으로 모으기', reply.error);
    } catch {
      await this.dialog.message('강당으로 모으기', '서버에서 답을 받지 못했습니다. 잠시 뒤 다시 누릅니다.');
    } finally {
      this.busy = false;
    }
  }

  private onPartButton = () => {
    this.hud.part.blur();
    void this.openPart2();
  };

  /** 2부 열기. 지금은 서버 상태만 바뀐다(2부 장소의 문은 맵을 넓힐 때 잇는다). */
  private async openPart2() {
    if (this.dialog.isOpen() || this.busy || this.cctv || this.net.part >= 2) return;
    this.busy = true;
    try {
      const reply = await this.net.openPart(2);
      if (reply.error) await this.dialog.message('2부 열기', reply.error);
    } catch {
      await this.dialog.message('2부 열기', '서버에서 답을 받지 못했습니다. 잠시 뒤 다시 누릅니다.');
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
      .map(([id, p]) => describeStudent(this.room, this.net.escape, id, p))
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
      if (!this.canLook(o)) continue;
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

  /** 미션을 단 사물을 살펴본다. 서버가 단서·문제를 보내고, 답을 채점한다. */
  private async interact(o: RoomObject) {
    if (!o.mission) return;
    this.busy = true;
    this.setActivity('look', o.id);
    let reward: MissionReward | null = null;
    /** 답을 서버에 내고 맞았는지 받는다(맞으면 얻은 것을 reward에 둔다). */
    const check = async (answer: string) => {
      const reply = await this.net.missionAnswer(o.id, answer);
      if (reply.error) return reply.error;
      reward = reply.reward;
      return reply.correct;
    };
    try {
      const view = await this.net.missionOpen(o.id);
      switch (view.kind) {
        case 'none':
        case 'locked':
        case 'done':
          await this.dialog.message(o.name, view.text);
          break;
        case 'clue':
          if (view.text) await this.dialog.message(o.name, view.text);
          await this.reward(o, view.reward, '');
          break;
        case 'quiz':
          this.setActivity('quiz', o.id);
          if ((await this.dialog.quiz(o.name, view, check)) && reward) await this.reward(o, reward, '맞았습니다. ');
          break;
        case 'code':
          this.setActivity('quiz', o.id);
          if ((await this.dialog.code(o.name, view.text, view.digits, view.example, check)) && reward) {
            await this.reward(o, reward, '번호가 맞았습니다. ');
          }
          break;
        case 'step': {
          const lead = view.text ? `${view.text}\n` : '';
          if (view.wrong) await this.dialog.message(o.name, `${lead}순서가 맞지 않습니다. 처음부터 다시 합니다.`);
          else if (!view.reward) await this.dialog.message(o.name, `${lead}순서 ${view.step}/${view.total}`);
          else {
            await this.dialog.message(o.name, `${lead}순서를 모두 맞혔습니다.`);
            await this.reward(o, view.reward, '');
          }
          break;
        }
      }
    } catch {
      await this.dialog.message(o.name, '서버에서 답을 받지 못했습니다. 잠시 뒤 다시 살펴봅니다.');
    } finally {
      this.busy = false;
      this.setActivity('', '');
    }
  }

  /** 지금 하는 일. 서버로는 tick()에서 보낸다. */
  private setActivity(kind: ActivityKind, object: string) {
    this.state.activity = { kind, object };
  }

  /** 미션을 마치고 얻은 것을 알린다: 문 열림, 아이템, 힌트 카드(글을 바로 보이고 수첩에 넣는다), 탈출 */
  private async reward(o: RoomObject, r: MissionReward, prefix: string) {
    // 서버가 바꾼 진행(연 문, 물건)이 오기 전에 화면을 먼저 맞추지 않는다. 문 모양은 syncEscape()가 맞춘다.
    if (r.escaped) {
      await this.escape();
      return;
    }
    if (r.picked) {
      this.objectViews.get(o.id)?.setHidden(true);
      this.target = null;
      this.highlight.clear();
      this.hud.setTarget(null);
    }
    if (r.opened) {
      this.objectViews.get(o.id)?.setOpen(true);
      this.target = null;
      this.highlight.clear();
      this.hud.setTarget(null);
      await this.dialog.message(o.name, `${prefix}${o.name}${objectParticle(o.name)} 열었습니다. 지나갈 수 있습니다.`);
    } else if (r.item) {
      await this.dialog.message(o.name, `${prefix}${r.item}${objectParticle(r.item)} 얻었습니다.`);
    } else if (prefix) {
      await this.dialog.message(o.name, prefix.trim());
    }
    if (r.after) await this.dialog.message(o.name, r.after);
    if (r.hint) await this.dialog.message(`힌트 카드: ${r.hint.title}`, r.hint.text, '수첩에 넣기');
  }

  // ---- 힌트 수첩·방탈출 자료 ----

  private onNotebookButton = () => {
    this.hud.notebook.blur();
    void this.openNotebook();
  };

  private async openNotebook() {
    if (this.dialog.isOpen() || this.busy || this.cctv) return;
    this.busy = true;
    try {
      const cards = await this.net.myHints();
      await this.dialog.notebook(cards, this.net.escape.hintTotal);
    } catch {
      await this.dialog.message('힌트 수첩', '서버에서 답을 받지 못했습니다. 잠시 뒤 다시 누릅니다.');
    } finally {
      this.busy = false;
    }
  }

  private onEscapeFileButton = () => {
    this.hud.escapeFile.blur();
    void this.pickEscapeFile();
  };

  /** 선생님: 방탈출 자료 파일을 고른다. 고르면 모든 사람의 방탈출 진행이 처음으로 돌아간다. */
  private async pickEscapeFile() {
    if (this.dialog.isOpen() || this.busy || this.cctv) return;
    this.busy = true;
    try {
      const files = await this.net.escapeFiles();
      if (!files.length) {
        await this.dialog.message('방탈출 자료', '자료 파일이 없습니다. 서버의 escape 폴더에 .yaml 파일을 넣습니다.');
        return;
      }
      const now = this.net.escape;
      const picked = await this.dialog.choose(
        '방탈출 자료',
        now.file
          ? `지금 자료: ${now.title}. 다른 자료를 고르면 모든 학생의 방탈출 진행(가진 물건, 마친 미션, 힌트 카드)이 처음으로 돌아갑니다.`
          : '이 방에서 쓸 방탈출 자료(미션, 문제, 힌트 카드)를 고릅니다. 나중에 "방탈출 자료" 단추로 바꿀 수 있습니다.',
        files.map((f) => ({
          label: f.error ? f.file : `${f.title} (미션 ${f.missions}개, 힌트 카드 ${f.hints}장)`,
          detail: f.error ?? (f.file === now.file ? `${f.file} · 지금 쓰는 자료` : f.file),
          disabled: f.error !== null,
        })),
      );
      if (picked === null) return;
      const reply = await this.net.escapeLoad(files[picked].file);
      if (reply.error) await this.dialog.message('방탈출 자료', reply.error);
    } catch {
      await this.dialog.message('방탈출 자료', '서버에서 답을 받지 못했습니다. 잠시 뒤 다시 누릅니다.');
    } finally {
      this.busy = false;
    }
  }

  private async escape() {
    this.state.escapedAt = performance.now();
    const time = formatDuration(this.state.elapsedMs());
    await this.dialog.message(
      '탈출했습니다',
      `${this.state.nickname}님이 ${this.room.name}${objectParticle(this.room.name)} 탈출했습니다.\n걸린 시간: ${time}`,
      '다시 하기',
    );
    // 서버의 진행(물건, 마친 미션, 탈출)을 처음으로 돌린다. 얻은 힌트 카드는 수첩에 남는다.
    try {
      await this.net.escapeRestart();
    } catch {
      // 연결이 잠깐 끊겼으면 진행은 그대로 두고 자리만 처음으로 돌아간다.
    }
    this.ctx.state = new RunState(this.state.nickname);
    this.ctx.schoolPos = null;
    this.scene.restart(this.ctx);
  }
}
