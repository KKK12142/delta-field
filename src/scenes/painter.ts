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

/** 0xRRGGBB → CSS 색 */
const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** 화면에 그린 사물 하나. 문은 열림과 닫힘 모양을 바꾼다. */
export interface ObjectView {
  setOpen(open: boolean): void;
  /** 주운 물건처럼 화면에서 감춘다. */
  setHidden(hidden: boolean): void;
  /** 켜짐 그림(<이름>-on.png)이 있으면 켜짐·꺼짐을 바꾼다(전구). 없으면 아무 일도 하지 않는다. */
  setLit(lit: boolean): void;
}

export class MapPainter {
  constructor(
    private readonly scene: Scene,
    private readonly room: Room,
  ) {}

  /** 바닥과 벽(바뀌지 않는 것)을 그림으로 구워 맨 아래에 깐다. 같은 맵은 한 번만 굽는다. */
  ground() {
    // 맵이 커도 그래픽 카드의 텍스처 크기 한도(낮은 기기 4096px)를 넘지 않게 groundChunk칸씩 나눠 굽는다.
    const { cols, rows } = mapSize(this.room);
    const n = size.groundChunk;
    const t = size.tile;
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
        this.scene.add.image(c0 * t, r0 * t, key).setOrigin(0, 0).setDepth(0);
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
    const dot = size.tile / size.dotScale;
    const v = variantAt(col, row, Math.max(1, Math.round(img.width / dot)));
    ctx.drawImage(img, v * dot, 0, dot, dot, x, y, size.tile, size.tile);
    return true;
  }

  /** 그림이 없는 바닥 한 칸(색 네모, 칸 번갈이와 줄) */
  private floor(ctx: CanvasRenderingContext2D, id: FloorId, col: number, row: number, x: number, y: number) {
    const t = size.tile;
    const style = color.tile[id];
    ctx.fillStyle = css((col + row) % 2 === 0 ? style.fill : style.alt);
    ctx.fillRect(x, y, t, t);
    if (style.line === null) return;
    ctx.globalAlpha = alpha.floorLine;
    ctx.strokeStyle = css(style.line);
    ctx.lineWidth = size.floorLine;
    ctx.strokeRect(x + 0.5, y + 0.5, t - 1, t - 1);
    ctx.globalAlpha = 1;
  }

  /** 그림이 없는 벽 한 칸. face는 아래 칸이 바닥이라 앞면이 보이는 벽(아래쪽 size.wallFace 픽셀을 앞면으로 칠한다) */
  private wall(ctx: CanvasRenderingContext2D, id: WallId, x: number, y: number, face: boolean) {
    const t = size.tile;
    const style = color.tile[id];
    ctx.fillStyle = css(style.top);
    ctx.fillRect(x, y, t, t);
    if (!face) return;
    ctx.fillStyle = css(style.face);
    ctx.fillRect(x, y + t - size.wallFace, t, size.wallFace);
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
    return {
      setOpen(open: boolean) {
        const a = open ? alpha.openDoor : 1;
        label?.setAlpha(a);
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
    };
  }
}
