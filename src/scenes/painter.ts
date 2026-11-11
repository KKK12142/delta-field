// 맵 그리기를 한곳에 모았다. 지금은 src/theme.ts의 색으로 단순 도형을 그린다.
// 나중에 타일·사물 그림(도트 그림)으로 바꿀 때는 이 파일의 floor(), wall(), object()만 바꾸면 된다.
// 칸 종류(TILES)와 사물 종류(OBJECT_KINDS)는 src/data/room.ts에, 목록과 그림 크기는 docs/map.md에 있다.
import type { Scene } from 'phaser';
import { isFloor, mapSize, tileOf, type ObjectKind, type Room, type RoomObject, type TILES, type TileChar } from '../data/room';
import { alpha, color, fontFamily, size } from '../theme';

type FloorId = Extract<(typeof TILES)[TileChar], { floor: true }>['id'];
type WallId = Extract<(typeof TILES)[TileChar], { floor: false }>['id'];

/** 이름표를 어두운 글자로 쓰는 밝은 사물 */
const LIGHT_KINDS: ReadonlySet<ObjectKind> = new Set<ObjectKind>(['desk', 'goalpost']);

/** 화면에 그린 사물 하나. 문은 열림과 닫힘 모양을 바꾼다. */
export interface ObjectView {
  setOpen(open: boolean): void;
}

export class MapPainter {
  constructor(
    private readonly scene: Scene,
    private readonly room: Room,
  ) {}

  /** 바닥과 벽(바뀌지 않는 것)을 한 장의 그림으로 구워 맨 아래에 깐다. 같은 맵은 한 번만 굽는다. */
  ground() {
    const key = `df-ground-${this.room.id}`;
    if (!this.scene.textures.exists(key)) {
      const { cols, rows } = mapSize(this.room);
      const g = this.scene.make.graphics({}, false);
      this.room.layout.forEach((line, row) => {
        [...line].forEach((ch, col) => {
          const tile = tileOf(ch);
          if (!tile) return;
          if (tile.floor) this.floor(g, tile.id, col, row);
          // 아래 칸이 바닥이면 벽 앞면을 그려 위에서 비스듬히 본 느낌을 준다.
          else this.wall(g, tile.id, col, row, isFloor(this.room.layout[row + 1]?.[col]));
        });
      });
      g.generateTexture(key, cols * size.tile, rows * size.tile);
      g.destroy();
    }
    return this.scene.add.image(0, 0, key).setOrigin(0, 0).setDepth(0);
  }

  /** 바닥 한 칸 */
  private floor(g: Phaser.GameObjects.Graphics, id: FloorId, col: number, row: number) {
    const t = size.tile;
    const style = color.tile[id];
    g.fillStyle((col + row) % 2 === 0 ? style.fill : style.alt, 1).fillRect(col * t, row * t, t, t);
    if (style.line !== null) g.lineStyle(size.floorLine, style.line, alpha.floorLine).strokeRect(col * t, row * t, t, t);
  }

  /**
   * 벽 한 칸. face는 아래 칸이 바닥이라 앞면이 보이는 벽이다. 지금은 아래쪽 size.wallFace 픽셀을 앞면으로 칠한다.
   * 도트 그림에서는 face인 칸을 통째로 앞면 그림(wall-face), 아닌 칸을 윗면 그림(wall-top)으로 바꾸면 된다.
   */
  private wall(g: Phaser.GameObjects.Graphics, id: WallId, col: number, row: number, face: boolean) {
    const t = size.tile;
    const style = color.tile[id];
    g.fillStyle(style.top, 1).fillRect(col * t, row * t, t, t);
    if (face) g.fillStyle(style.face, 1).fillRect(col * t, (row + 1) * t - size.wallFace, t, size.wallFace);
  }

  /** 사물 하나. 아래쪽에 있는 것이 앞에 보이게 깊이를 사물의 아래 끝(픽셀)으로 둔다. 살펴볼 수 있는 사물에는 이름을 적는다. */
  object(o: RoomObject): ObjectView {
    const t = size.tile;
    const x = o.col * t;
    const y = o.row * t;
    const depth = (o.row + o.h) * t;
    const body = this.scene.add.rectangle(x, y, o.w * t, o.h * t, color.object[o.kind]).setOrigin(0, 0).setDepth(depth);
    const label = o.action
      ? this.scene.add
          .text(x + (o.w * t) / 2, y + (o.h * t) / 2, o.name, {
            fontFamily,
            fontSize: size.labelFont,
            color: LIGHT_KINDS.has(o.kind) ? color.label : color.labelOnDark,
            resolution: size.textResolution,
          })
          .setOrigin(0.5)
          .setDepth(depth + 1)
      : null;
    return {
      setOpen(open: boolean) {
        const a = open ? alpha.openDoor : 1;
        body.setAlpha(a);
        label?.setAlpha(a);
      },
    };
  }
}
