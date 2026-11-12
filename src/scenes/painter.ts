// 맵 그리기를 한곳에 모았다. public/sprites/tiles·objects의 도트 그림을 깔고, 그림이 없는 칸·사물은 src/theme.ts의 색 네모로 그린다.
// 그림 규격과 놓는 법은 docs/art.md "타일·사물 만들기", 칸 종류(TILES)와 사물 종류(OBJECT_KINDS)는 src/data/room.ts, 목록은 docs/map.md에 있다.
// - 타일: tiles/<id>.png는 30×30 변형을 가로로 이은 것이다. 칸마다 변형 하나를 고른다(칸 자리로 정해 모든 화면에서 같다).
//   벽(#)·울타리(%)는 아래 칸이 바닥이면 앞면(<id>Face), 아니면 윗면(<id>Top). 울타리 윗면이 위아래로 이어지면 세로 가로대(fenceTopV).
//   울타리 앞면의 투명한 곳 아래에는 운동장 흙을 깐다.
// - 사물: objects/<sprite 또는 kind>.png를 차지 칸의 아래에 맞추고 가로 가운데에 놓는다(그림이 차지 칸과 같은 너비면 왼쪽 아래가 맞는다).
//   열린 모양은 <이름>-open.png. flip이면 좌우로 뒤집는다. 도트 하나는 size.dotScale 픽셀이다.
import { GameObjects, Textures, type Scene } from 'phaser';
import { isFloor, mapSize, tileOf, type ObjectKind, type Room, type RoomObject, type TILES, type TileChar } from '../data/room';
import { alpha, color, fontFamily, size } from '../theme';

type FloorId = Extract<(typeof TILES)[TileChar], { floor: true }>['id'];
type WallId = Extract<(typeof TILES)[TileChar], { floor: false }>['id'];

/** 이름표를 어두운 글자로 쓰는 밝은 사물 */
const LIGHT_KINDS: ReadonlySet<ObjectKind> = new Set<ObjectKind>(['desk', 'goalpost', 'item', 'timetable', 'calendar', 'lightBulb', 'sundial']);

/** 있는 그림 이름('tiles/wallTop', 'objects/door-open' …). 빌드할 때 public/sprites를 훑어 정한다(없는 그림을 부르지 않게). */
const SPRITES: ReadonlySet<string> = new Set(
  Object.keys(import.meta.glob('/public/sprites/{tiles,objects}/*.png')).map((p) => p.replace('/public/sprites/', '').replace(/\.png$/, '')),
);

/** 맵 그림을 불러오게 건다(장면의 preload에서). 이미 불러온 것은 건너뛴다. */
export function loadMapSprites(scene: Scene) {
  for (const name of SPRITES) {
    if (!scene.textures.exists(name)) scene.load.image(name, `${import.meta.env.BASE_URL}sprites/${name}.png`);
  }
}

/** 불러온 맵 그림에 도트가 흐려지지 않게 NEAREST를 건다. */
export function prepareMapSprites(scene: Scene) {
  for (const name of SPRITES) if (scene.textures.exists(name)) scene.textures.get(name).setFilter(Textures.FilterMode.NEAREST);
}

/** 칸 자리로 정하는 변형 번호(모든 화면에서 같은 무늬가 깔린다) */
function variantAt(col: number, row: number, count: number) {
  let h = (Math.imul(col, 73856093) ^ Math.imul(row, 19349663)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) % count;
}

/** 순서 맞추기 번호의 깊이: 사물·아바타(깊이 = 아래 끝 y 픽셀)보다 위 */
const MARK_DEPTH = 900_000;

/** 칸 하나의 도트 수(바닥을 구울 때 칸 하나의 픽셀) */
const DOT_TILE = size.tile / size.dotScale;

/** 0xRRGGBB → CSS 색 */
const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** 화면에 그린 사물 하나. 문은 열림과 닫힘 모양을 바꾼다. */
export interface ObjectView {
  setOpen(open: boolean): void;
  /** 주운 물건처럼 화면에서 감춘다. */
  setHidden(hidden: boolean): void;
  /** 켜짐 그림(<이름>-on.png)이 있으면 켜짐·꺼짐을 바꾼다(전구). 없으면 아무 일도 하지 않는다. */
  setLit(lit: boolean): void;
  /** 이름표 글을 바꾼다(자료 파일의 labels). 이름표가 없는 사물이면 아무 일도 하지 않는다. */
  setName(name: string): void;
  /** 순서 맞추기: 몇째로 맞게 눌렀는지 사물 위에 번호로 보인다. 0이면 감춘다. */
  setMark(n: number): void;
}

export class MapPainter {
  constructor(
    private readonly scene: Scene,
    private readonly room: Room,
  ) {}

  /**
   * 바닥과 벽(바뀌지 않는 것)을 그림으로 구워 맨 아래에 깐다. 같은 맵은 한 번만 굽는다.
   * 도트 크기(칸 하나 = 30픽셀)로 구워 dotScale배로 보인다(그래픽 메모리가 4분의 1이고, 도트 그림이라 모양은 같다).
   * 맵이 커도 그래픽 카드의 텍스처 크기 한도를 넘지 않게 groundChunk칸씩 나눠 굽는다.
   */
  ground() {
    const { cols, rows } = mapSize(this.room);
    const n = size.groundChunk;
    const t = DOT_TILE;
    for (let r0 = 0; r0 < rows; r0 += n) {
      for (let c0 = 0; c0 < cols; c0 += n) {
        const key = `df-ground-${this.room.id}-${c0}-${r0}`;
        const w = Math.min(n, cols - c0);
        const h = Math.min(n, rows - r0);
        if (!this.scene.textures.exists(key)) {
          const tex = this.scene.textures.createCanvas(key, w * t, h * t);
          if (!tex) throw new Error('바닥 그림을 만들지 못했습니다.');
          const ctx = tex.getContext();
          ctx.imageSmoothingEnabled = false;
          for (let row = r0; row < r0 + h; row++) {
            for (let col = c0; col < c0 + w; col++) this.cell(ctx, col, row, (col - c0) * t, (row - r0) * t);
          }
          tex.refresh();
          tex.setFilter(Textures.FilterMode.NEAREST);
        }
        this.scene.add
          .image(c0 * size.tile, r0 * size.tile, key)
          .setOrigin(0, 0)
          .setScale(size.dotScale)
          .setDepth(0);
      }
    }
  }

  /** 한 칸을 (x, y)에 그린다. */
  private cell(ctx: CanvasRenderingContext2D, col: number, row: number, x: number, y: number) {
    const L = this.room.layout;
    const ch = L[row][col];
    const tile = tileOf(ch);
    if (!tile) return;
    if (tile.floor) {
      if (!this.tile(ctx, `tiles/${tile.id}`, col, row, x, y)) this.floor(ctx, tile.id, col, row, x, y);
      return;
    }
    if (ch === '&') {
      this.roof(ctx, col, row, x, y);
      return;
    }
    const face = isFloor(L[row + 1]?.[col]);
    let name: string;
    if (face) {
      // 울타리 앞면은 사이사이가 비어 있어 아래에 운동장 흙을 먼저 깐다.
      if (ch === '%' && !this.tile(ctx, 'tiles/field', col, row, x, y)) this.floor(ctx, 'field', col, row, x, y);
      name = `${tile.id}Face`;
    } else if (ch === '%' && this.vertical(col, row)) {
      name = 'fenceTopV';
    } else {
      name = `${tile.id}Top`;
    }
    if (!this.tile(ctx, `tiles/${name}`, col, row, x, y)) this.wall(ctx, tile.id, x, y, face);
  }

  /**
   * 강당 지붕(&) 한 칸(docs/art.md "강당 지붕", scripts/art/mock.mjs의 roof()와 같다).
   * 세로로 이어진 지붕 줄의 가운데는 용마루(roofRidge), 그 위는 roofN, 아래는 roofS.
   * 지붕이 아닌 쪽(맵 밖 포함)에는 테(roofEdgeN·S·W·E)를, 두 변이 함께면 모서리(NW·NE·SW·SE)를 그 뒤에 겹친다.
   */
  private roof(ctx: CanvasRenderingContext2D, col: number, row: number, x: number, y: number) {
    const L = this.room.layout;
    const isRoof = (c: number, r: number) => L[r]?.[c] === '&';
    let r0 = row;
    let r1 = row;
    while (isRoof(col, r0 - 1)) r0--;
    while (isRoof(col, r1 + 1)) r1++;
    const mid = r0 + Math.floor((r1 - r0 + 1) / 2);
    const name = row < mid ? 'roofN' : row === mid ? 'roofRidge' : 'roofS';
    if (!this.tile(ctx, `tiles/${name}`, col, row, x, y)) {
      // 그림이 없으면 위 비탈·아래 비탈을 두 색으로 칠한다.
      ctx.fillStyle = css(row <= mid ? color.tile.roof.top : color.tile.roof.face);
      ctx.fillRect(x, y, DOT_TILE, DOT_TILE);
      return;
    }
    const n = !isRoof(col, row - 1);
    const s = !isRoof(col, row + 1);
    const w = !isRoof(col - 1, row);
    const e = !isRoof(col + 1, row);
    const edges: [boolean, string][] = [[n, 'N'], [s, 'S'], [w, 'W'], [e, 'E'], [n && w, 'NW'], [n && e, 'NE'], [s && w, 'SW'], [s && e, 'SE']];
    for (const [on, d] of edges) if (on) this.tile(ctx, `tiles/roofEdge${d}`, col, row, x, y);
  }

  /** 울타리가 위아래로 이어지는 칸(세로 가로대를 그린다) */
  private vertical(col: number, row: number) {
    const L = this.room.layout;
    const up = L[row - 1]?.[col] === '%';
    const down = L[row + 1]?.[col] === '%';
    if (up && down) return true;
    return (up || down) && L[row][col - 1] !== '%' && L[row][col + 1] !== '%';
  }

  /** 타일 그림의 변형 하나를 칸에 그린다. 그림이 없으면 false */
  private tile(ctx: CanvasRenderingContext2D, name: string, col: number, row: number, x: number, y: number) {
    if (!this.scene.textures.exists(name)) return false;
    const img = this.scene.textures.get(name).getSourceImage() as CanvasImageSource & { width: number };
    const v = variantAt(col, row, Math.max(1, Math.round(img.width / DOT_TILE)));
    ctx.drawImage(img, v * DOT_TILE, 0, DOT_TILE, DOT_TILE, x, y, DOT_TILE, DOT_TILE);
    return true;
  }

  /** 그림이 없는 바닥 한 칸(색 네모, 칸 번갈이와 줄) */
  private floor(ctx: CanvasRenderingContext2D, id: FloorId, col: number, row: number, x: number, y: number) {
    const t = DOT_TILE;
    const style = color.tile[id];
    ctx.fillStyle = css((col + row) % 2 === 0 ? style.fill : style.alt);
    ctx.fillRect(x, y, t, t);
    if (style.line === null) return;
    ctx.globalAlpha = alpha.floorLine;
    ctx.strokeStyle = css(style.line);
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, t - 1, t - 1);
    ctx.globalAlpha = 1;
  }

  /** 그림이 없는 벽 한 칸. face는 아래 칸이 바닥이라 앞면이 보이는 벽(아래쪽 size.wallFace 픽셀을 앞면으로 칠한다) */
  private wall(ctx: CanvasRenderingContext2D, id: WallId, x: number, y: number, face: boolean) {
    const t = DOT_TILE;
    const faceH = size.wallFace / size.dotScale;
    const style = color.tile[id];
    ctx.fillStyle = css(style.top);
    ctx.fillRect(x, y, t, t);
    if (!face) return;
    ctx.fillStyle = css(style.face);
    ctx.fillRect(x, y + t - faceH, t, faceH);
  }

  /** 사물 하나. 아래쪽에 있는 것이 앞에 보이게 깊이를 사물의 아래 끝(픽셀)으로 둔다. 살펴볼 수 있는 사물에는 이름을 적는다. */
  object(o: RoomObject): ObjectView {
    const t = size.tile;
    const x = o.col * t;
    const y = o.row * t;
    const depth = (o.row + o.h) * t;
    const name = `objects/${o.sprite ?? o.kind}`;
    const openName = `${name}-open`;
    const onName = `${name}-on`;
    const hasSprite = this.scene.textures.exists(name);
    const hasOpen = hasSprite && this.scene.textures.exists(openName);
    const hasOn = hasSprite && this.scene.textures.exists(onName);
    let body: GameObjects.Image | GameObjects.Rectangle;
    if (hasSprite) {
      const img = this.scene.add.image(0, depth, name).setScale(size.dotScale).setOrigin(0, 1).setDepth(depth).setFlipX(o.flip === true);
      img.setX(x + Math.floor((o.w * t - img.displayWidth) / 2));
      body = img;
    } else {
      body = this.scene.add.rectangle(x, y, o.w * t, o.h * t, color.object[o.kind]).setOrigin(0, 0).setDepth(depth);
    }
    const label = o.mission
      ? this.scene.add
          .text(x + (o.w * t) / 2, y + (o.h * t) / 2, o.name, {
            fontFamily,
            fontSize: size.labelFont,
            color: hasSprite || !LIGHT_KINDS.has(o.kind) ? color.labelOnDark : color.label,
            resolution: size.textResolution,
            ...(hasSprite ? { backgroundColor: color.labelBackground, padding: { x: size.labelPad, y: 1 } } : {}),
          })
          .setOrigin(0.5)
          .setDepth(depth + 1)
      : null;
    let mark: GameObjects.Text | null = null;
    const scene = this.scene;
    return {
      setOpen(open: boolean) {
        const a = open ? alpha.openDoor : 1;
        label?.setAlpha(a);
        // 연 문은 지나가는 길이므로 그 위에 선 캐릭터(깊이 = 발 y)보다 뒤에 그린다(문의 위 끝을 깊이로).
        body.setDepth(open ? y : depth);
        label?.setDepth(open ? y + 1 : depth + 1);
        // 열린 그림이 있으면 바꿔 끼우고, 없으면 닫힌 모양을 흐리게 그린다.
        if (hasOpen && body instanceof GameObjects.Image) body.setTexture(open ? openName : name);
        else body.setAlpha(a);
      },
      setHidden(hidden: boolean) {
        body.setVisible(!hidden);
        label?.setVisible(!hidden);
      },
      setLit(lit: boolean) {
        if (hasOn && body instanceof GameObjects.Image) body.setTexture(lit ? onName : name);
      },
      setName(text: string) {
        if (label && label.text !== text) label.setText(text);
      },
      setMark(n: number) {
        if (!n) {
          mark?.setVisible(false);
          return;
        }
        // 사물 그림의 위 끝 바로 위(그림이 없으면 차지 칸의 위 끝)에 둔다. 캐릭터에 가려지지 않게 이름표보다 위에 그린다.
        const top = Math.min(y, body instanceof GameObjects.Image ? body.y - body.displayHeight : y);
        mark ??= scene.add
          .text(x + (o.w * t) / 2, top, '', {
            fontFamily,
            fontSize: size.stepMarkFont,
            color: color.stepMark,
            backgroundColor: color.stepMarkBackground,
            padding: { x: size.stepMarkPad, y: size.stepMarkPad / 2 },
            resolution: size.textResolution,
          })
          .setOrigin(0.5, 1)
          .setDepth(MARK_DEPTH);
        mark.setText(String(n)).setVisible(true);
      },
    };
  }
}
