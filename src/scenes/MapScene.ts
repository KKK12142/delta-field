// 맵 하나를 돌아다니는 장면의 바탕. 교실(RoomScene)과 골든벨(GoldenBellScene)이 이어받는다.
// 맵 그리기, 내 아바타와 다른 사람 아바타, 움직임과 충돌, 화면 맞추기, 맵 옮기기를 맡는다.
import { Scene } from 'phaser';
import type { MapId } from '../../shared/protocol.ts';
import type { Player } from '../../shared/schema.ts';
import type { Room } from '../data/room';
import type { RunState } from '../game/state';
import type { Net } from '../net/connection';
import type { Dialog } from '../ui/dialog';
import { Joystick } from '../ui/joystick';
import { alpha, color, fontFamily, motion, size } from '../theme';

/** 장면이 바뀌어도 이어지는 것 */
export interface MapContext {
  rooms: Record<MapId, Room>;
  /** 교실 방탈출 진행. 골든벨에 다녀와도 그대로 둔다. */
  state: RunState;
  dialog: Dialog;
  touch: boolean;
  net: Net;
  /** 교실을 떠날 때 서 있던 자리. 교실로 돌아오면 이 자리에 선다. */
  classroomPos: { col: number; row: number } | null;
}

/** 다른 접속자의 아바타. 서버가 알려 준 위치(target)로 부드럽게 따라간다. */
export interface Remote {
  avatar: Phaser.GameObjects.Container;
  target: { x: number; y: number };
  /** 아바타 위에 띄우는 짧은 글(선생님 화면의 학생만) */
  tag: Phaser.GameObjects.Text | null;
}

/** 아바타 위 짧은 글의 모양: CCTV에서 지금 하는 일, 골든벨에서 목숨 */
export type TagStyle = 'cctv' | 'lives';

/** 위쪽 안내, 아래쪽 조이스틱, 오른쪽 창이 가리는 화면 픽셀 */
export interface Reserved {
  top: number;
  bottom: number;
  right: number;
}

export abstract class MapScene extends Scene {
  abstract readonly mapId: MapId;
  protected ctx!: MapContext;
  protected room!: Room;
  protected net!: Net;
  protected dialog!: Dialog;
  protected touch = false;
  protected readonly remotes = new Map<string, Remote>();
  protected joystick: Joystick | null = null;
  /** 발밑 위치(칸 단위). 칸 (c, r)은 [c, c+1) × [r, r+1)을 차지한다. */
  protected pos = { col: 0, row: 0 };
  protected avatar!: Phaser.GameObjects.Container;
  /** 내 아바타 위의 짧은 글(골든벨의 목숨). 없으면 null */
  protected ownTag: Phaser.GameObjects.Text | null = null;
  protected keys!: Record<string, Phaser.Input.Keyboard.Key>;
  /** 다른 맵으로 옮기는 중이면 true(이 장면의 일을 멈춘다) */
  private leaving = false;

  init(ctx: MapContext) {
    this.ctx = ctx;
    this.room = ctx.rooms[this.mapId];
    this.net = ctx.net;
    this.dialog = ctx.dialog;
    this.touch = ctx.touch;
    this.remotes.clear();
    this.leaving = false;
  }

  /** 이어받는 장면은 super.create() 뒤에 제 안내를 만들고 fitCamera()를 부른다. */
  create() {
    this.drawRoom();
    const own = this.makeAvatar(this.net.nickname, color.avatar, color.nickname, this.ownTagStyle());
    this.avatar = own.avatar;
    this.ownTag = own.tag;

    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('키보드 입력을 쓸 수 없습니다.');
    this.keys = keyboard.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D,SPACE,E,ESC') as Record<string, Phaser.Input.Keyboard.Key>;

    if (this.touch) this.joystick = new Joystick();
    const offStatus = this.net.onStatus((s) =>
      this.setConnectionText(s === 'reconnecting' ? '연결이 끊겨 다시 연결하는 중입니다.' : null),
    );
    this.scale.on('resize', this.fitCamera, this);
    this.events.once('shutdown', () => {
      offStatus();
      this.scale.off('resize', this.fitCamera, this);
      this.joystick?.destroy();
      this.joystick = null;
    });

    this.pos = this.startPoint();
    this.placeAvatar();
    // 처음 위치(맵을 옮긴 뒤, 다시 하기 뒤에도)를 서버에 알린다.
    this.net.sendMove(this.mapId, this.pos.col, this.pos.row, true);
  }

  update(_time: number, delta: number) {
    if (this.leaving) return;
    // 서버가 나를 다른 맵으로 옮겼으면(골든벨 시작·끝) 그 맵의 장면으로 바꾼다.
    const map = this.net.me()?.map as MapId | undefined;
    if (map && map !== this.mapId && this.ctx.rooms[map]) {
      this.leave(map);
      return;
    }
    // 대화상자가 떠 있어도 다른 사람은 계속 움직여 보인다.
    this.syncRemotes(delta);
    this.tick(delta);
  }

  /** 매 프레임 장면마다 할 일 */
  protected abstract tick(delta: number): void;

  /** 접속이 끊겨 다시 연결하는 중이면 그 안내를 보인다(null이면 지운다). */
  protected abstract setConnectionText(text: string | null): void;

  /** 처음 설 자리. 기본은 시작 위치 둘레의 빈 곳 */
  protected startPoint() {
    return this.spawnPoint();
  }

  /** 다른 맵으로 옮기기 직전에 할 일(교실은 서 있던 자리를 기억한다) */
  protected beforeLeave() {}

  private leave(map: MapId) {
    this.leaving = true;
    // 떠 있던 단서·퀴즈 창은 거둔다. 그 창을 기다리던 이 맵의 일은 이어지지 않는다.
    this.dialog.abandon();
    this.beforeLeave();
    this.scene.start(map, this.ctx);
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

  /** 가리는 것이 없을 때의 화면 비움. 이어받는 장면이 안내 크기에 맞춰 바꾼다. */
  protected reserved(): Reserved {
    return { top: size.reserveTop, bottom: this.touch ? size.reserveBottomTouch : 0, right: 0 };
  }

  /** 방 전체가 가리는 것 없는 자리에 들어가는 확대 배율 */
  protected fitZoom({ top, bottom, right }: Reserved) {
    const cam = this.cameras.main;
    const roomW = this.room.layout[0].length * size.tile;
    const roomH = this.room.layout.length * size.tile;
    return Math.min(
      size.zoomMax,
      Math.max(size.zoomMin, Math.min((cam.width - right) / roomW, (cam.height - top - bottom) / roomH) * size.viewMargin),
    );
  }

  /** 방 전체를 가리는 것 없는 자리의 가운데에 맞춘다. */
  protected fitCamera() {
    const cam = this.cameras.main;
    const r = this.reserved();
    const zoom = this.fitZoom(r);
    const roomW = this.room.layout[0].length * size.tile;
    const roomH = this.room.layout.length * size.tile;
    cam.stopFollow();
    cam.setZoom(zoom);
    cam.centerOn(roomW / 2 + r.right / 2 / zoom, roomH / 2 - (r.top - r.bottom) / 2 / zoom);
  }

  /** 아바타 하나. tagStyle을 주면 닉네임 위에 짧은 글을 (감춰 둔 채로) 붙인다. */
  protected makeAvatar(nickname: string, bodyColor: number, nameColor: string, tagStyle: TagStyle | null = null) {
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
    if (tagStyle) {
      // CCTV 글은 어두운 바탕에 흰 글, 목숨(하트)은 바탕 없이 테두리만 두른다.
      const style: Phaser.Types.GameObjects.Text.TextStyle =
        tagStyle === 'lives'
          ? { fontSize: size.livesFont, color: color.livesText, stroke: color.livesStroke, strokeThickness: size.livesStroke }
          : { fontSize: size.tagFont, color: color.tagText, backgroundColor: color.tagBackground };
      tag = this.add
        .text(0, name.y - name.height - size.tagGap, '', {
          fontFamily,
          padding: { x: size.tagPadX, y: size.tagPadY },
          resolution: size.textResolution,
          ...style,
        })
        .setOrigin(0.5, 1)
        .setVisible(false);
      parts.push(tag);
    }
    return { avatar: this.add.container(0, 0, parts), tag };
  }

  /** 다른 사람 아바타에 붙일 짧은 글. 기본은 선생님 화면의 학생에게 CCTV 글 */
  protected wantsTag(p: Player): TagStyle | null {
    return p.role === 'student' && this.net.role === 'teacher' ? 'cctv' : null;
  }

  /** 내 아바타에 붙일 짧은 글 */
  protected ownTagStyle(): TagStyle | null {
    return null;
  }

  /** 매 프레임 다른 사람 아바타마다 할 일(골든벨은 탈락한 학생을 흐리게 한다) */
  protected decorateRemote(_r: Remote, _p: Player) {}

  // ---- 다른 접속자(같은 맵에 있는 사람만) ----

  private syncRemotes(delta: number) {
    const seen = new Set<string>();
    // 프레임 빠르기와 상관없이 같은 정도로 따라가게 한다.
    const k = 1 - Math.exp(-delta / motion.remoteSmoothing);
    for (const [id, p] of this.net.others(this.mapId)) {
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
          this.wantsTag(p),
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
      this.decorateRemote(r, p);
    }
    for (const [id, r] of this.remotes) {
      if (seen.has(id)) continue;
      r.avatar.destroy();
      this.remotes.delete(id);
    }
  }

  protected placeAvatar() {
    const x = this.pos.col * size.tile;
    const y = this.pos.row * size.tile;
    this.avatar.setPosition(x, y);
    // 아래쪽에 있는 것이 앞에 보이게 한다.
    this.avatar.setDepth(y);
  }

  // ---- 움직임 ----

  /** 방향키·WASD(없으면 조이스틱)대로 움직이고 서버에 알린다. */
  protected moveByInput(delta: number) {
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
    this.net.sendMove(this.mapId, this.pos.col, this.pos.row);
  }

  /** 여럿이 한 점에 겹쳐 나타나지 않게 시작 위치 둘레의 빈 곳을 고른다. */
  protected spawnPoint() {
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
  protected free(col: number, row: number) {
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

  // ---- 개발 중 자동 확인용(헤드리스 크롬). 빌드에는 들어가지 않는다. ----

  /** 이어받는 장면은 extra에 제 것을 더한다. */
  protected exposeDevHooks(extra: Record<string, unknown> = {}) {
    if (!import.meta.env.DEV) return;
    Object.assign(window, {
      __df: {
        map: () => this.mapId,
        pos: () => ({ ...this.pos }),
        code: () => this.net.code,
        role: () => this.net.role,
        others: () =>
          this.net.others().map(([, p]) => ({
            nickname: p.nickname,
            role: p.role,
            map: p.map,
            col: p.col,
            row: p.row,
            online: p.online,
            activity: p.activity,
            activityObject: p.activityObject,
            items: [...p.items],
            done: [...p.done],
            escaped: p.escaped,
            gbLives: p.gbLives,
            gbScore: p.gbScore,
            gbOut: p.gbOut,
            gbRevive: p.gbRevive,
            gbResult: p.gbResult,
            gbAnswer: p.gbAnswer,
          })),
        drawn: () => [...this.remotes.values()].map((r) => ({ x: r.avatar.x, y: r.avatar.y })),
        teleport: (col: number, row: number) => {
          this.pos = { col, row };
          this.placeAvatar();
        },
        /** 다른 접속자 아바타 몸통 가운데의 화면 좌표 */
        screenOf: (nickname: string) => {
          const id = this.net.others(this.mapId).find(([, p]) => p.nickname === nickname)?.[0];
          const r = id ? this.remotes.get(id) : undefined;
          if (!r) return null;
          const cam = this.cameras.main;
          return {
            x: cam.x + (r.avatar.x - cam.worldView.x) * cam.zoom,
            y: cam.y + (r.avatar.y - size.avatarHeight / 2 - cam.worldView.y) * cam.zoom,
          };
        },
        ...extra,
      },
    });
  }
}
