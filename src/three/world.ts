// 3D 맵: 바닥, 막힌 칸, 사물을 코드로 만든 단순한 모양으로 그린다(그림은 다음 단계).
// 바닥 칸 (c, r)은 x ∈ [c, c+1), z ∈ [r, r+1)을 차지한다(서버 좌표 칸 = 3D 한 칸).
// 그리기 호출을 줄이려고 바닥은 칸마다 한 점인 텍스처를 붙인 판 하나, 막힌 칸과 사물은 각각 InstancedMesh 하나로 그린다.
import {
  BoxGeometry,
  Color,
  DataTexture,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  NearestFilter,
  PlaneGeometry,
  Quaternion,
  RGBAFormat,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { mapSize, tileOf, type Room } from '../data/room';
import { color, three } from '../theme';
import type { ObjectLook } from './rules';

type TileColor = { fill: number; alt: number } | { top: number; face: number };
const tileColors = color.tile as Record<string, TileColor>;
const objectColors = color.object as Record<string, number>;

export class World {
  readonly group = new Group();
  private readonly objects: InstancedMesh;
  private readonly box = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  private readonly disposables: { dispose(): void }[] = [];
  private readonly looks: ObjectLook[] = [];

  constructor(private readonly room: Room) {
    this.disposables.push(this.box);
    this.group.add(this.floor(), this.walls());
    this.objects = this.makeObjects();
    this.group.add(this.objects);
  }

  /** 바닥: 칸마다 한 점(fill·alt 체크무늬)인 텍스처를 맵 크기 판 하나에 붙인다. */
  private floor() {
    const { cols, rows } = mapSize(this.room);
    const data = new Uint8Array(cols * rows * 4);
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const tile = tileOf(this.room.layout[r][col]);
        const tc = tile ? tileColors[tile.id] : undefined;
        const hex = !tc ? three.background : 'fill' in tc ? ((col + r) % 2 ? tc.alt : tc.fill) : tc.top;
        // DataTexture는 아래 줄부터 채운다(v = 0이 판의 아래쪽 = 큰 row). theme의 색은 sRGB 값이다.
        const i = ((rows - 1 - r) * cols + col) * 4;
        data[i] = (hex >> 16) & 255;
        data[i + 1] = (hex >> 8) & 255;
        data[i + 2] = hex & 255;
        data[i + 3] = 255;
      }
    }
    const texture = new DataTexture(data, cols, rows, RGBAFormat);
    texture.colorSpace = SRGBColorSpace;
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    texture.needsUpdate = true;
    const geometry = new PlaneGeometry(cols, rows).rotateX(-Math.PI / 2).translate(cols / 2, 0, rows / 2);
    const material = new MeshLambertMaterial({ map: texture });
    this.disposables.push(texture, geometry, material);
    return new Mesh(geometry, material);
  }

  /** 막힌 칸(벽, 울타리, 강당): 칸 종류별 높이의 상자 */
  private walls() {
    const { cols, rows } = mapSize(this.room);
    const cells: { c: number; r: number; id: string }[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tile = tileOf(this.room.layout[r][c]);
        if (tile && !tile.floor) cells.push({ c, r, id: tile.id });
      }
    }
    const material = new MeshLambertMaterial();
    this.disposables.push(material);
    const mesh = new InstancedMesh(this.box, material, Math.max(1, cells.length));
    mesh.count = cells.length;
    const m = new Matrix4();
    const col = new Color();
    cells.forEach(({ c, r, id }, i) => {
      const h = three.wallHeight[id] ?? three.wallHeight.wall;
      m.makeScale(1, h, 1).setPosition(c + 0.5, 0, r + 0.5);
      mesh.setMatrixAt(i, m);
      const tc = tileColors[id];
      col.setHex(tc && 'top' in tc ? tc.top : color.tile.wall.top);
      mesh.setColorAt(i, col);
    });
    mesh.computeBoundingSphere();
    return mesh;
  }

  /** 사물: 차지 칸 크기의 낮은 상자(종류별 색). 열린 문·지나가는 사물은 납작하게, 감춘 사물은 크기 0 */
  private makeObjects() {
    const list = this.room.objects;
    const material = new MeshLambertMaterial();
    this.disposables.push(material);
    const mesh = new InstancedMesh(this.box, material, Math.max(1, list.length));
    mesh.count = list.length;
    const col = new Color();
    list.forEach((o, i) => {
      col.setHex(objectColors[o.kind] ?? objectColors.decor);
      mesh.setColorAt(i, col);
      this.looks.push('hidden');
    });
    return mesh;
  }

  private readonly m = new Matrix4();
  private readonly p = new Vector3();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();

  /** 사물 모습을 맞춘다. 바뀐 사물만 고친다. */
  setLooks(looks: readonly ObjectLook[]) {
    let changed = false;
    const list = this.room.objects;
    for (let i = 0; i < list.length; i++) {
      if (this.looks[i] === looks[i]) continue;
      this.looks[i] = looks[i];
      changed = true;
      const o = list[i];
      const inset = three.objectInset;
      const flat = looks[i] === 'open' || o.walk || o.flat;
      const h = looks[i] === 'hidden' ? 0 : flat ? three.flatHeight : three.objectHeight;
      const w = looks[i] === 'hidden' ? 0 : Math.max(0.1, o.w - inset * 2);
      const d = looks[i] === 'hidden' ? 0 : Math.max(0.1, o.h - inset * 2);
      this.p.set(o.col + o.w / 2, 0, o.row + o.h / 2);
      this.s.set(w, h, d);
      this.m.compose(this.p, this.q, this.s);
      this.objects.setMatrixAt(i, this.m);
    }
    if (changed) {
      this.objects.instanceMatrix.needsUpdate = true;
      this.objects.computeBoundingSphere();
    }
  }

  dispose() {
    this.group.removeFromParent();
    for (const d of this.disposables) d.dispose();
  }
}
