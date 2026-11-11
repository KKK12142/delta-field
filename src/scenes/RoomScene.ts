import { Input, Scene } from 'phaser';
import type { ActivityKind } from '../../shared/protocol.ts';
import type { Room, RoomObject } from '../data/room';
import { byNickname, describeStudent } from '../game/cctv';
import { formatDuration, RunState } from '../game/state';
import type { Net } from '../net/connection';
import { CctvPanel } from '../ui/cctv';
import type { Dialog } from '../ui/dialog';
import { objectParticle } from '../ui/dom';
import { Hud } from '../ui/hud';
import { Joystick } from '../ui/joystick';
import { alpha, color, fontFamily, motion, size } from '../theme';

export interface RoomSceneData {
  room: Room;
  state: RunState;
  dialog: Dialog;
  touch: boolean;
  net: Net;
}

/** 다른 접속자의 아바타. 서버가 알려 준 위치(target)로 부드럽게 따라간다. */
interface Remote {
  avatar: Phaser.GameObjects.Container;
  target: { x: number; y: number };
  /** CCTV 모드에서 지금 하는 일을 띄우는 글(선생님 화면의 학생만) */
  tag: Phaser.GameObjects.Text | null;
}

/** 선생님의 CCTV 모드 */
interface Cctv {
  panel: CctvPanel;
  /** 따라가는 학생의 접속 id. 전체 보기면 null */
  following: string | null;
}

/** 닫은 키가 곧바로 다시 살펴보기로 이어지지 않게 두는 틈(ms) */
const REOPEN_GUARD = 250;

/** 방 하나를 돌아다니며 사물을 살펴보는 장면 */
export class RoomScene extends Scene {
  private room!: Room;
  private state!: RunState;
  private dialog!: Dialog;
  private touch = false;
  private hud!: Hud;
  private joystick: Joystick | null = null;
  private net!: Net;
  private readonly remotes = new Map<string, Remote>();
  private studentCount = -1;
  private cctv: Cctv | null = null;

  /** 발밑 위치(칸 단위). 칸 (c, r)은 [c, c+1) × [r, r+1)을 차지한다. */
  private pos = { col: 0, row: 0 };
  private avatar!: Phaser.GameObjects.Container;
  private highlight!: Phaser.GameObjects.Graphics;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private target: RoomObject | null = null;
  private busy = false;

  constructor() {
    super('room');
  }

  init(data: RoomSceneData) {
    this.room = data.room;
    this.state = data.state;
    this.dialog = data.dialog;
    this.touch = data.touch;
    this.net = data.net;
    this.remotes.clear();
    this.studentCount = -1;
    this.cctv = null;
    this.pos = { ...this.room.start };
    this.target = null;
    this.busy = false;
  }

  create() {
    this.drawRoom();

    this.avatar = this.makeAvatar(this.state.nickname, color.avatar, color.nickname).avatar;
    this.highlight = this.add.graphics().setDepth(Number.MAX_SAFE_INTEGER);

    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('키보드 입력을 쓸 수 없습니다.');
    this.keys = keyboard.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D,SPACE,E,ESC') as Record<string, Phaser.Input.Keyboard.Key>;

    const teacher = this.net.role === 'teacher';
    this.hud = new Hud(this.room.name, this.room.goal, this.touch, teacher);
    this.hud.setRoomCode(this.net.code);
    this.hud.action.addEventListener('click', this.onActionButton);
    this.hud.cctv.addEventListener('click', this.onCctvButton);
    if (this.touch) this.joystick = new Joystick();
    const offStatus = this.net.onStatus((s) =>
      this.hud.setStatus(s === 'reconnecting' ? '연결이 끊겨 다시 연결하는 중입니다.' : null),
    );
    if (teacher) {
      this.input.on('pointerdown', this.onPointerDown, this);
      this.input.on('pointermove', this.onPointerMove, this);
    }
    this.events.once('shutdown', () => {
      offStatus();
      this.cctv?.panel.destroy();
      this.cctv = null;
      this.input.off('pointerdown', this.onPointerDown, this);
      this.input.off('pointermove', this.onPointerMove, this);
      this.hud.destroy();
      this.joystick?.destroy();
      this.joystick = null;
    });

    this.fitCamera();
    this.scale.on('resize', this.fitCamera, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.fitCamera, this));
    this.pos = this.spawnPoint();
    this.placeAvatar();
    // 처음 위치(다시 하기 뒤에도)를 서버에 알린다.
    this.net.sendMove(this.pos.col, this.pos.row, true);

    if (import.meta.env.DEV) {
      // 개발 중 자동 확인용(헤드리스 크롬). 빌드에는 들어가지 않는다.
      Object.assign(window, {
        __df: {
          pos: () => ({ ...this.pos }),
          items: () => [...this.state.items],
          target: () => this.target?.id ?? null,
          escaped: () => this.state.escapedAt !== null,
          code: () => this.net.code,
          role: () => this.net.role,
          others: () =>
            this.net.others().map(([, p]) => ({
              nickname: p.nickname,
              role: p.role,
              col: p.col,
              row: p.row,
              online: p.online,
              activity: p.activity,
              activityObject: p.activityObject,
              items: [...p.items],
              done: [...p.done],
              escaped: p.escaped,
            })),
          drawn: () => [...this.remotes.values()].map((r) => ({ x: r.avatar.x, y: r.avatar.y })),
          teleport: (col: number, row: number) => {
            this.pos = { col, row };
            this.placeAvatar();
          },
          cctv: () => {
            if (!this.cctv) return null;
            const cam = this.cameras.main;
            const following = this.cctv.following ? this.net.room.state.players.get(this.cctv.following) : undefined;
            return {
              following: following?.nickname ?? null,
              zoom: cam.zoom,
              center: { col: cam.midPoint.x / size.tile, row: cam.midPoint.y / size.tile },
              tags: [...this.remotes.values()].filter((r) => r.tag?.visible).map((r) => r.tag!.text),
            };
          },
          /** 다른 접속자 아바타 몸통 가운데의 화면 좌표 */
          screenOf: (nickname: string) => {
            const id = this.net.others().find(([, p]) => p.nickname === nickname)?.[0];
            const r = id ? this.remotes.get(id) : undefined;
            if (!r) return null;
            const cam = this.cameras.main;
            return {
              x: cam.x + (r.avatar.x - cam.worldView.x) * cam.zoom,
              y: cam.y + (r.avatar.y - size.avatarHeight / 2 - cam.worldView.y) * cam.zoom,
            };
          },
        },
      });
    }
  }

  update(_time: number, delta: number) {
    // 대화상자가 떠 있어도 다른 사람은 계속 움직여 보인다.
    this.syncRemotes(delta);
    // 진행 상태가 바뀌었으면 서버로 보낸다(바뀌지 않았으면 보내지 않는다).
    if (this.net.role === 'student') this.net.sendStatus(this.state.toStatus());
    if (this.cctv) {
      this.updateCctv();
      return;
    }
    if (this.dialog.isOpen() || this.busy) return;

    const k = this.keys;
    let dx = (k.RIGHT.isDown || k.D.isDown ? 1 : 0) - (k.LEFT.isDown || k.A.isDown ? 1 : 0);
    let dy = (k.DOWN.isDown || k.S.isDown ? 1 : 0) - (k.UP.isDown || k.W.isDown ? 1 : 0);
    if (dx !== 0 || dy !== 0) {
      // 대각선으로 갈 때도 같은 빠르기가 되게 한다.
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;
    } else if (this.joystick) {
      dx = this.joystick.vector.x;
      dy = this.joystick.vector.y;
    }
    if (dx !== 0 || dy !== 0) this.move(dx, dy, (motion.speed * delta) / 1000);
    this.net.sendMove(this.pos.col, this.pos.row);

    this.updateTarget();

    // 두 키의 눌림 표시를 함께 지운다.
    const space = Input.Keyboard.JustDown(k.SPACE);
    const e = Input.Keyboard.JustDown(k.E);
    const pressed = space || e;
    if (pressed && this.target && performance.now() - this.dialog.lastClosedAt > REOPEN_GUARD) {
      void this.interact(this.target);
    }
  }

  // ---- 그리기 ----

  private drawRoom() {
    const t = size.tile;
    const g = this.add.graphics();
    const layout = this.room.layout;
    layout.forEach((line, row) => {
      [...line].forEach((ch, col) => {
        const x = col * t;
        const y = row * t;
        if (ch === '#') {
          g.fillStyle(color.wallTop, 1).fillRect(x, y, t, t);
          // 아래가 바닥이면 벽 앞면을 그려 위에서 비스듬히 본 느낌을 준다.
          if (layout[row + 1]?.[col] === '.') {
            g.fillStyle(color.wall, 1).fillRect(x, y + t - size.wallFace, t, size.wallFace);
          }
        } else {
          g.fillStyle((col + row) % 2 === 0 ? color.floor : color.floorAlt, 1).fillRect(x, y, t, t);
          g.lineStyle(size.floorLine, color.floorLine, alpha.floorLine).strokeRect(x, y, t, t);
        }
      });
    });

    for (const o of this.room.objects) {
      const x = o.col * t;
      const y = o.row * t;
      const bottom = (o.row + o.h) * t;
      this.add
        .rectangle(x, y, o.w * t, o.h * t, color.object[o.kind])
        .setOrigin(0, 0)
        .setDepth(bottom);
      if (o.action) {
        this.add
          .text(x + (o.w * t) / 2, y + (o.h * t) / 2, o.name, {
            fontFamily,
            fontSize: size.labelFont,
            color: o.kind === 'desk' ? color.label : color.labelOnDark,
            resolution: size.textResolution,
          })
          .setOrigin(0.5)
          .setDepth(bottom + 1);
      }
    }
  }

  /** 방 전체를 화면에 맞춘다. CCTV 모드에서 학생을 따라갈 때는 그 학생을 크게 보며 따라간다. */
  private fitCamera() {
    const cam = this.cameras.main;
    const roomW = this.room.layout[0].length * size.tile;
    const roomH = this.room.layout.length * size.tile;
    // 위쪽 안내, (터치 기기의) 아래쪽 조이스틱, (CCTV 모드의) 오른쪽 창이 방을 가리지 않게 그만큼 비워 둔다.
    const top = size.reserveTop;
    const bottom = this.touch && !this.cctv ? size.reserveBottomTouch : 0;
    const right = this.cctv ? Math.max(0, cam.width - this.cctv.panel.left) : 0;
    const zoom = Math.min(
      size.zoomMax,
      Math.max(size.zoomMin, Math.min((cam.width - right) / roomW, (cam.height - top - bottom) / roomH) * size.viewMargin),
    );
    const following = this.cctv?.following ? this.remotes.get(this.cctv.following) : undefined;
    if (following) {
      const followZoom = Math.min(size.followZoomMax, zoom * size.followZoomScale);
      cam.setZoom(followZoom);
      // 따라가는 학생의 몸통이 가리는 것 없는 자리의 가운데에 오게 한다(카메라 가운데 = 대상 - offset).
      cam.startFollow(
        following.avatar,
        false,
        size.followLerp,
        size.followLerp,
        -right / 2 / followZoom,
        size.avatarHeight / 2 + top / 2 / followZoom,
      );
      return;
    }
    cam.stopFollow();
    cam.setZoom(zoom);
    cam.centerOn(roomW / 2 + right / 2 / zoom, roomH / 2 - (top - bottom) / 2 / zoom);
  }

  /** 아바타 하나. withTag면 닉네임 위에 CCTV 모드용 글을 (감춰 둔 채로) 붙인다. */
  private makeAvatar(nickname: string, bodyColor: number, nameColor: string, withTag = false) {
    const shadow = this.add.ellipse(0, 0, size.avatarShadowWidth, size.avatarShadowHeight, color.avatarShadow, alpha.avatarShadow);
    const body = this.add.ellipse(0, -size.avatarHeight / 2, size.avatarWidth, size.avatarHeight, bodyColor);
    const name = this.add
      .text(0, -size.avatarHeight - size.nicknameGap, nickname, {
        fontFamily,
        fontSize: size.nicknameFont,
        color: nameColor,
        resolution: size.textResolution,
      })
      .setOrigin(0.5, 1);
    const parts: Phaser.GameObjects.GameObject[] = [shadow, body, name];
    let tag: Phaser.GameObjects.Text | null = null;
    if (withTag) {
      tag = this.add
        .text(0, name.y - name.height - size.tagGap, '', {
          fontFamily,
          fontSize: size.tagFont,
          color: color.tagText,
          backgroundColor: color.tagBackground,
          padding: { x: size.tagPadX, y: size.tagPadY },
          resolution: size.textResolution,
        })
        .setOrigin(0.5, 1)
        .setVisible(false);
      parts.push(tag);
    }
    return { avatar: this.add.container(0, 0, parts), tag };
  }

  // ---- 다른 접속자 ----

  private syncRemotes(delta: number) {
    const seen = new Set<string>();
    // 프레임 빠르기와 상관없이 같은 정도로 따라가게 한다.
    const k = 1 - Math.exp(-delta / motion.remoteSmoothing);
    for (const [id, p] of this.net.others()) {
      seen.add(id);
      const x = p.col * size.tile;
      const y = p.row * size.tile;
      let r = this.remotes.get(id);
      if (!r) {
        const teacher = p.role === 'teacher';
        const { avatar, tag } = this.makeAvatar(
          p.nickname,
          teacher ? color.teacherAvatar : color.remoteAvatar,
          teacher ? color.teacherNickname : color.remoteNickname,
          !teacher && this.net.role === 'teacher',
        );
        avatar.setPosition(x, y);
        r = { avatar, target: { x, y }, tag };
        this.remotes.set(id, r);
      }
      r.target.x = x;
      r.target.y = y;
      r.avatar.x += (x - r.avatar.x) * k;
      r.avatar.y += (y - r.avatar.y) * k;
      r.avatar.setDepth(r.avatar.y);
    }
    for (const [id, r] of this.remotes) {
      if (seen.has(id)) continue;
      r.avatar.destroy();
      this.remotes.delete(id);
    }
    if (this.net.role === 'teacher') {
      const n = this.net.studentCount();
      if (n !== this.studentCount) {
        this.studentCount = n;
        this.hud.setStudentCount(n);
      }
    }
  }

  private placeAvatar() {
    const x = this.pos.col * size.tile;
    const y = this.pos.row * size.tile;
    this.avatar.setPosition(x, y);
    // 아래쪽에 있는 것이 앞에 보이게 한다.
    this.avatar.setDepth(y);
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
    for (const r of this.remotes.values()) r.tag?.setVisible(false);
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
      .students()
      .map(([id, p]) => describeStudent(this.room, id, p))
      .sort(byNickname);
    for (const s of students) {
      const tag = this.remotes.get(s.id)?.tag;
      if (!tag) continue;
      if (s.tag !== null && tag.text !== s.tag) tag.setText(s.tag);
      tag.setVisible(s.tag !== null);
    }
    cctv.panel.setInfo(this.net.code, students.length);
    const followed = students.find((s) => s.id === cctv.following);
    if (cctv.following && !followed) {
      // 따라가던 학생이 나갔으면 전체 보기로 돌아간다.
      this.unfollow();
      return;
    }
    if (followed) cctv.panel.showDetail(followed);
    else cctv.panel.showList(students);
  }

  /** 화면 좌표에서 가장 가까운 학생(아바타 몸통 가운데에서 pickRadius 안) */
  private pickStudent(screenX: number, screenY: number): string | null {
    const cam = this.cameras.main;
    const p = cam.getWorldPoint(screenX, screenY);
    let best: string | null = null;
    let bestDist = size.pickRadius / cam.zoom;
    for (const [id] of this.net.students()) {
      const r = this.remotes.get(id);
      if (!r) continue;
      const d = Math.hypot(p.x - r.avatar.x, p.y - (r.avatar.y - size.avatarHeight / 2));
      if (d <= bestDist) {
        best = id;
        bestDist = d;
      }
    }
    return best;
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

  // ---- 움직임 ----

  /** 여럿이 한 점에 겹쳐 나타나지 않게 시작 위치 둘레의 빈 곳을 고른다. */
  private spawnPoint() {
    const { col, row } = this.room.start;
    for (let i = 0; i < 30; i++) {
      const c = col + (Math.random() * 2 - 1) * size.spawnSpread;
      const r = row + (Math.random() * 2 - 1) * size.spawnSpread;
      if (this.free(c, r)) return { col: c, row: r };
    }
    return { col, row };
  }

  /** 가로, 세로를 따로 옮겨 벽에 닿으면 벽을 따라 미끄러지게 한다. */
  private move(dx: number, dy: number, step: number) {
    const nextCol = this.pos.col + dx * step;
    if (this.free(nextCol, this.pos.row)) this.pos.col = nextCol;
    const nextRow = this.pos.row + dy * step;
    if (this.free(this.pos.col, nextRow)) this.pos.row = nextRow;
    this.placeAvatar();
  }

  /** 발밑 네모(반경 avatarFeet)가 벽과 사물에 닿지 않는지 */
  private free(col: number, row: number) {
    const r = size.avatarFeet;
    const corners = [
      [col - r, row - r],
      [col + r, row - r],
      [col - r, row + r],
      [col + r, row + r],
    ];
    return corners.every(([c, w]) => !this.blocked(c, w));
  }

  private blocked(col: number, row: number) {
    const ch = this.room.layout[Math.floor(row)]?.[Math.floor(col)];
    if (ch !== '.') return true;
    return this.room.objects.some((o) => col >= o.col && col < o.col + o.w && row >= o.row && row < o.row + o.h);
  }

  // ---- 살펴보기 ----

  /** 손이 닿는 거리 안에서 가장 가까운, 살펴볼 수 있는 사물 */
  private updateTarget() {
    let best: RoomObject | null = null;
    let bestDist: number = size.reach;
    for (const o of this.room.objects) {
      if (!o.action) continue;
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
    return a.type === 'quiz' || (a.type === 'exit' && a.quiz !== undefined);
  }

  /** 지금 하는 일. 서버로는 update()에서 보낸다. */
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
    const data: RoomSceneData = {
      room: this.room,
      state: new RunState(this.state.nickname),
      dialog: this.dialog,
      touch: this.touch,
      net: this.net,
    };
    this.scene.restart(data);
  }
}
