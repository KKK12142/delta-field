// 맵 하나를 돌아다니는 장면의 바탕. 학교(RoomScene)와 골든벨(GoldenBellScene)이 이어받는다.
// 맵 그리기(그리는 방법은 painter.ts), 내 아바타와 다른 사람 아바타, 움직임과 충돌, 화면 맞추기·따라가기, 맵 옮기기를 맡는다.
import { Scene } from 'phaser';
import type { MapId } from '../../shared/protocol.ts';
import type { Player } from '../../shared/schema.ts';
import { isFloor, mapSize, type Room, type RoomObject } from '../data/room';
import type { RunState } from '../game/state';
import type { Net } from '../net/connection';
import type { Dialog } from '../ui/dialog';
import { Joystick } from '../ui/joystick';
import { snapZoom } from '../render';
import { color, motion, size } from '../theme';
import { Avatar, loadCharacters, prepareCharacters, type TagStyle } from './avatar';
import { MapPainter, type ObjectView } from './painter';

/** 장면이 바뀌어도 이어지는 것 */
export interface MapContext {
  rooms: Record<MapId, Room>;
  /** 학교 방탈출 진행. 골든벨에 다녀와도 그대로 둔다. */
  state: RunState;
  dialog: Dialog;
  touch: boolean;
  net: Net;
  /** 학교 맵을 떠날 때 서 있던 자리. 학교 맵으로 돌아오면 이 자리에 선다. */
  schoolPos: { col: number; row: number } | null;
}

/** 다른 접속자의 아바타. 서버가 알려 준 위치(target)로 부드럽게 따라간다. */
export interface Remote {
  /** 머리 위 짧은 글은 avatar.tag(CCTV의 학생, 골든벨의 학생) */
  avatar: Avatar;
  target: { x: number; y: number };
}

/** 위쪽 안내, 아래쪽, 오른쪽 창이 가리는 화면 픽셀 */
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
  /** 사물 id → 화면에 그린 사물(문 열림 모양을 바꿀 때 쓴다) */
  protected readonly objectViews = new Map<string, ObjectView>();
  protected joystick: Joystick | null = null;
  /** 발밑 위치(칸 단위). 칸 (c, r)은 [c, c+1) × [r, r+1)을 차지한다. */
  protected pos = { col: 0, row: 0 };
  protected avatar!: Avatar;
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
    this.objectViews.clear();
    this.leaving = false;
  }

  preload() {
    loadCharacters(this);
  }

  /** 이어받는 장면은 super.create() 뒤에 제 안내를 만들고 fitCamera()를 부른다. */
  create() {
    prepareCharacters(this);
    this.drawMap();
    this.avatar = new Avatar(this, this.net.me()?.character ?? this.net.character, this.net.nickname, color.nickname, this.ownTagStyle());

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

  /** 다른 맵으로 옮기기 직전에 할 일(학교 맵은 서 있던 자리를 기억한다) */
  protected beforeLeave() {}

  private leave(map: MapId) {
    this.leaving = true;
    // 떠 있던 단서·퀴즈 창은 거둔다. 그 창을 기다리던 이 맵의 일은 이어지지 않는다.
    this.dialog.abandon();
    this.beforeLeave();
    this.scene.start(map, this.ctx);
  }

  // ---- 그리기 ----

  private drawMap() {
    const painter = new MapPainter(this, this.room);
    painter.ground();
    for (const o of this.room.objects) this.objectViews.set(o.id, painter.object(o));
  }

  /** 화면(CSS) 픽셀 하나가 캔버스 픽셀 몇 개인지(src/render.ts의 renderRatio. dpr 방식이면 보통 devicePixelRatio) */
  protected get dpr() {
    return 1 / this.scale.zoom;
  }

  /** 화면(CSS) 픽셀 길이를 캔버스 픽셀로. 카메라와 장면 안의 화면 좌표는 캔버스 픽셀이다. */
  protected css(px: number) {
    return px * this.dpr;
  }

  /** 가리는 것이 없을 때의 화면 비움(캔버스 픽셀). 이어받는 장면이 안내 크기에 맞춰 바꾼다. */
  protected reserved(): Reserved {
    return { top: this.css(size.reserveTop), bottom: 0, right: 0 };
  }

  /** 맵 크기(픽셀) */
  protected mapPixels() {
    const { cols, rows } = mapSize(this.room);
    return { w: cols * size.tile, h: rows * size.tile };
  }

  /** 맵 전체가 가리는 것 없는 자리에 들어가는 확대 배율 */
  protected fitZoom({ top, bottom, right }: Reserved) {
    const cam = this.cameras.main;
    const map = this.mapPixels();
    return Math.min(
      this.css(size.zoomMax),
      Math.max(this.css(size.zoomMin), Math.min((cam.width - right) / map.w, (cam.height - top - bottom) / map.h) * size.viewMargin),
    );
  }

  /**
   * 아바타를 따라갈 때의 확대 배율(캔버스 픽셀 기준): 화면 짧은 쪽에 viewTiles칸쯤 보이게 하고,
   * 그리는 방식(src/render.ts)이 맞추라고 하면 가장 가까운 1/zoomSnap 단위(가장 작게 1/zoomSnap)로 맞춰 도트 하나가 캔버스 픽셀 정수가 되게 한다.
   * 화면(CSS) 배율로는 캔버스 비율 1이면 0.5 단위, 2면 0.25 단위다.
   */
  protected viewZoom() {
    const cam = this.cameras.main;
    let zoom = Math.min(cam.width, cam.height) / (size.viewTiles * size.tile);
    if (snapZoom) zoom = Math.max(1, Math.round(zoom * size.zoomSnap)) / size.zoomSnap;
    return Math.min(this.css(size.zoomMax), Math.max(this.css(size.zoomMin), zoom));
  }

  /** 맵 전체를 가리는 것 없는 자리의 가운데에 맞춘다(골든벨, CCTV 전체 보기). */
  protected fitCamera() {
    const cam = this.cameras.main;
    const r = this.reserved();
    const zoom = this.fitZoom(r);
    const map = this.mapPixels();
    cam.stopFollow();
    cam.removeBounds();
    cam.setZoom(zoom);
    cam.centerOn(map.w / 2 + r.right / 2 / zoom, map.h / 2 - (r.top - r.bottom) / 2 / zoom);
  }

  /**
   * 아바타를 viewZoom() 배율로 따라간다. 아바타 몸통이 가리는 것 없는 자리의 가운데에 오게 한다.
   * inBounds면 맵 밖(가리는 자리 몫은 빼고)을 비추지 않는다. 맵이 화면보다 작은 쪽은 가운데에 둔다.
   */
  protected followCamera(target: Phaser.GameObjects.Container, inBounds: boolean) {
    const cam = this.cameras.main;
    const r = this.reserved();
    const zoom = this.viewZoom();
    cam.setZoom(zoom);
    if (inBounds) {
      const map = this.mapPixels();
      const viewW = cam.width / zoom;
      const viewH = cam.height / zoom;
      let x = 0;
      let w = map.w + r.right / zoom;
      let y = -r.top / zoom;
      let h = map.h + (r.top + r.bottom) / zoom;
      if (w < viewW) {
        x -= (viewW - w) / 2;
        w = viewW;
      }
      if (h < viewH) {
        y -= (viewH - h) / 2;
        h = viewH;
      }
      cam.setBounds(x, y, w, h);
    } else {
      cam.removeBounds();
    }
    // 카메라 가운데 = 대상 - offset
    cam.startFollow(target, false, size.followLerp, size.followLerp, -r.right / 2 / zoom, size.avatarHeight / 2 + (r.top - r.bottom) / 2 / zoom);
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

  /** 다른 사람 아바타의 캐릭터와 글을 키우는 배율(CCTV 전체 보기에서는 작은 지도 위에서도 보이게 키운다) */
  protected remoteScale() {
    return { sprite: 1, text: 1 };
  }

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
        const avatar = new Avatar(this, p.character, p.nickname, teacher ? color.teacherNickname : color.remoteNickname, this.wantsTag(p));
        avatar.setPosition(x, y);
        r = { avatar, target: { x, y } };
        this.remotes.set(id, r);
      }
      r.target.x = x;
      r.target.y = y;
      const dx = x - r.avatar.x;
      const dy = y - r.avatar.y;
      // 서버 위치와 떨어져 있는 동안 그쪽으로 걷는다.
      r.avatar.step(dx, dy, Math.hypot(dx, dy) > motion.remoteWalkGap);
      r.avatar.x += dx * k;
      r.avatar.y += dy * k;
      r.avatar.setDepth(r.avatar.y);
      const scale = this.remoteScale();
      r.avatar.setMarkScale(scale.sprite, scale.text);
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
    const before = { ...this.pos };
    if (dx !== 0 || dy !== 0) this.move(dx, dy, (motion.speed * delta) / 1000);
    // 누른 쪽을 보고, 실제로 움직였을 때만 걷는다(벽을 밀면 그쪽을 보고 선다).
    this.avatar.step(dx, dy, this.pos.col !== before.col || this.pos.row !== before.row);
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

  /** 발밑 네모(반경 avatarFeet)가 벽과 사물(연 문은 빼고)에 닿지 않는지 */
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
    if (!isFloor(this.room.layout[Math.floor(row)]?.[Math.floor(col)])) return true;
    return this.room.objects.some(
      (o) => col >= o.col && col < o.col + o.w && row >= o.row && row < o.row + o.h && this.objectBlocks(o),
    );
  }

  /** 이 사물이 길을 막는지. 학교 맵은 연 문을 지나갈 수 있게 한다. */
  protected objectBlocks(_o: RoomObject) {
    return true;
  }

  /** 확인용: 아바타 몸통 가운데의 화면(CSS) 좌표(아바타 크기 배율을 따진다) */
  protected bodyOnScreen(avatar: Avatar) {
    const cam = this.cameras.main;
    return {
      x: (cam.x + (avatar.x - cam.worldView.x) * cam.zoom) / this.dpr,
      y: (cam.y + (avatar.y - avatar.bodyOffset - cam.worldView.y) * cam.zoom) / this.dpr,
    };
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
            character: p.character,
            classGroup: p.classGroup,
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
        drawn: () =>
          [...this.remotes.values()].map((r) => ({ x: r.avatar.x, y: r.avatar.y, ...r.avatar.look() })),
        /** 내 아바타: 캐릭터, 걷기 애니메이션(멈췄으면 null), 프레임 번호, 몸 높이(화면 CSS 픽셀) */
        avatar: () => ({ ...this.avatar.look(), height: (this.avatar.sprite.displayHeight * this.cameras.main.zoom) / this.dpr }),
        teleport: (col: number, row: number) => {
          this.pos = { col, row };
          this.placeAvatar();
        },
        /** 다른 접속자 아바타 몸통 가운데의 화면 좌표 */
        screenOf: (nickname: string) => {
          const id = this.net.others(this.mapId).find(([, p]) => p.nickname === nickname)?.[0];
          const r = id ? this.remotes.get(id) : undefined;
          return r ? this.bodyOnScreen(r.avatar) : null;
        },
        /**
         * 카메라: 화면(CSS) 확대 배율, 기기 픽셀 확대 배율(deviceZoom), DPR, 비추는 곳(칸),
         * 내 아바타 몸통의 화면 좌표, 맵 전체의 화면 네모(모두 CSS 픽셀)
         */
        camera: () => {
          const cam = this.cameras.main;
          const v = cam.worldView;
          const map = this.mapPixels();
          const t = size.tile;
          const z = cam.zoom / this.dpr;
          return {
            zoom: z,
            deviceZoom: cam.zoom,
            dpr: this.dpr,
            view: { col: v.x / t, row: v.y / t, w: v.width / t, h: v.height / t },
            me: this.bodyOnScreen(this.avatar),
            map: { x: (cam.x - v.x * cam.zoom) / this.dpr, y: (cam.y - v.y * cam.zoom) / this.dpr, w: map.w * z, h: map.h * z },
          };
        },
        ...extra,
      },
    });
  }
}
