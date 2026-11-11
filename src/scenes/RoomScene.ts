import { Input, Scene } from 'phaser';
import type { Room, RoomObject } from '../data/room';
import { formatDuration, RunState } from '../game/state';
import type { Net } from '../net/connection';
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
    this.pos = { ...this.room.start };
    this.target = null;
    this.busy = false;
  }

  create() {
    this.drawRoom();

    this.avatar = this.makeAvatar(this.state.nickname, color.avatar, color.nickname);
    this.highlight = this.add.graphics().setDepth(Number.MAX_SAFE_INTEGER);

    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('키보드 입력을 쓸 수 없습니다.');
    this.keys = keyboard.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D,SPACE,E') as Record<string, Phaser.Input.Keyboard.Key>;

    this.hud = new Hud(this.room.name, this.room.goal, this.touch);
    this.hud.setRoomCode(this.net.code);
    this.hud.action.addEventListener('click', this.onActionButton);
    if (this.touch) this.joystick = new Joystick();
    const offStatus = this.net.onStatus((s) =>
      this.hud.setStatus(s === 'reconnecting' ? '연결이 끊겨 다시 연결하는 중입니다.' : null),
    );
    this.events.once('shutdown', () => {
      offStatus();
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
          others: () => this.net.others().map(([, p]) => ({ nickname: p.nickname, role: p.role, col: p.col, row: p.row })),
          drawn: () => [...this.remotes.values()].map((r) => ({ x: r.avatar.x, y: r.avatar.y })),
          teleport: (col: number, row: number) => {
            this.pos = { col, row };
            this.placeAvatar();
          },
        },
      });
    }
  }

  update(_time: number, delta: number) {
    // 대화상자가 떠 있어도 다른 사람은 계속 움직여 보인다.
    this.syncRemotes(delta);
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
          })
          .setOrigin(0.5)
          .setDepth(bottom + 1);
      }
    }
  }

  private fitCamera() {
    const cam = this.cameras.main;
    const roomW = this.room.layout[0].length * size.tile;
    const roomH = this.room.layout.length * size.tile;
    // 위쪽 안내와 (터치 기기의) 아래쪽 조이스틱이 방을 가리지 않게 그만큼 비워 둔다.
    const top = size.reserveTop;
    const bottom = this.touch ? size.reserveBottomTouch : 0;
    const zoom = Math.min(
      size.zoomMax,
      Math.max(size.zoomMin, Math.min(cam.width / roomW, (cam.height - top - bottom) / roomH) * size.viewMargin),
    );
    cam.setZoom(zoom);
    cam.centerOn(roomW / 2, roomH / 2 - (top - bottom) / 2 / zoom);
  }

  private makeAvatar(nickname: string, bodyColor: number, nameColor: string) {
    const shadow = this.add.ellipse(0, 0, size.avatarShadowWidth, size.avatarShadowHeight, color.avatarShadow, alpha.avatarShadow);
    const body = this.add.ellipse(0, -size.avatarHeight / 2, size.avatarWidth, size.avatarHeight, bodyColor);
    const name = this.add
      .text(0, -size.avatarHeight - size.nicknameGap, nickname, {
        fontFamily,
        fontSize: size.nicknameFont,
        color: nameColor,
      })
      .setOrigin(0.5, 1);
    return this.add.container(0, 0, [shadow, body, name]);
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
        const avatar = this.makeAvatar(
          p.nickname,
          teacher ? color.teacherAvatar : color.remoteAvatar,
          teacher ? color.teacherNickname : color.remoteNickname,
        );
        avatar.setPosition(x, y);
        r = { avatar, target: { x, y } };
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
    }
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
