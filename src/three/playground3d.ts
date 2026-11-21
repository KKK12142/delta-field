// 3D 골든벨 운동장의 바닥 무늬와 둘레 꾸밈(design/quick-specs/goldenbell-playground.md). 맵 칸·울타리 상자는 world.ts가 그리고, 여기서는 보이는 모습만 더한다.
// 그리기 수를 늘리지 않게: 바닥 무늬(잔디 줄무늬·흰 선·트랙·출발 자리 점선)는 캔버스 판 하나, 울타리 밖 땅 판 하나,
// 나무는 줄기·잎 InstancedMesh 둘, 학교 건물(몸·지붕·창·문)은 상자 InstancedMesh 하나로 그린다(모두 5번).
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type Material,
  type BufferGeometry,
  type Texture,
} from 'three';
import { mapSize, tileOf, type Room } from '../data/room';
import { playground as P } from '../theme';

export class Playground {
  readonly group = new Group();
  private readonly disposables: { dispose(): void }[] = [];

  constructor(private readonly room: Room) {
    this.group.add(this.ground(), this.outer(), ...this.trees(), this.building());
  }

  private keep<T extends Material | BufferGeometry | Texture>(x: T): T {
    this.disposables.push(x);
    return x;
  }

  /** 바닥 무늬: 잔디(줄무늬), 트랙, 잔디 둘레 흰 선, 트랙 가운데 흰 선, 출발 자리(spawn) 점선 네모, 가운데 세로선. */
  private ground() {
    const { cols, rows } = mapSize(this.room);
    const px = P.texturePx;
    const canvas = document.createElement('canvas');
    canvas.width = cols * px;
    canvas.height = rows * px;
    const g = canvas.getContext('2d');
    if (!g) throw new Error('운동장 바닥을 그리지 못했습니다.');
    // 칸마다: 잔디는 stripeTiles칸마다 밝기를 바꾼 세로 줄무늬, 나머지 바닥(트랙)·울타리 밑은 트랙 색
    let grass = { c0: Infinity, r0: Infinity, c1: -Infinity, r1: -Infinity };
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tile = tileOf(this.room.layout[r][c]);
        const isGrass = tile?.id === 'gardenGrass';
        if (isGrass) grass = { c0: Math.min(grass.c0, c), r0: Math.min(grass.r0, r), c1: Math.max(grass.c1, c + 1), r1: Math.max(grass.r1, r + 1) };
        g.fillStyle = isGrass ? (Math.floor(c / P.stripeTiles) % 2 ? P.grassAlt : P.grass) : P.track;
        g.fillRect(c * px, r * px, px, px);
      }
    }
    g.strokeStyle = P.line;
    g.globalAlpha = P.lineOpacity;
    g.lineWidth = P.lineWidth * px;
    if (grass.c0 < grass.c1) {
      // 잔디 둘레 선, 트랙 가운데 선(잔디 둘레와 맵 가장자리 사이)
      g.strokeRect(grass.c0 * px, grass.r0 * px, (grass.c1 - grass.c0) * px, (grass.r1 - grass.r0) * px);
      const m = grass.c0 / 2;
      g.strokeRect((m + 0.5) * px, (grass.r0 / 2 + 0.5) * px, (cols - 2 * m - 1) * px, (rows - grass.r0 - 1) * px);
      // 가운데 세로선
      const mid = (grass.c0 + grass.c1) / 2;
      g.beginPath();
      g.moveTo(mid * px, grass.r0 * px);
      g.lineTo(mid * px, grass.r1 * px);
      g.stroke();
    }
    // 출발 자리: 점선 네모
    const s = this.room.spawn;
    if (s) {
      g.setLineDash([P.spawnDash * px, P.spawnDash * px]);
      g.strokeRect(s.col * px, s.row * px, s.w * px, s.h * px);
      g.setLineDash([]);
    }
    const texture = this.keep(new CanvasTexture(canvas));
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    const geometry = this.keep(new PlaneGeometry(cols, rows).rotateX(-Math.PI / 2).translate(cols / 2, P.groundLift, rows / 2));
    return new Mesh(geometry, this.keep(new MeshLambertMaterial({ map: texture })));
  }

  /** 울타리 밖 땅(맵 바닥보다 조금 아래) */
  private outer() {
    const { cols, rows } = mapSize(this.room);
    const geometry = this.keep(new PlaneGeometry(P.outerSize, P.outerSize).rotateX(-Math.PI / 2).translate(cols / 2, -0.02, rows / 2));
    return new Mesh(geometry, this.keep(new MeshLambertMaterial({ color: P.outer })));
  }

  /** 나무: 울타리 밖 왼쪽·오른쪽·위쪽에 줄지어(카메라 쪽 아래는 비워 운동장을 가리지 않게). 줄기·잎 InstancedMesh 둘 */
  private trees() {
    const { cols, rows } = mapSize(this.room);
    const spots: { x: number; z: number; s: number }[] = [];
    // 칸 좌표로 정해지는 흔들림(매번 같은 모습)
    const jitter = (i: number) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
    let n = 0;
    const add = (x: number, z: number) => {
      const j = jitter(n++);
      spots.push({ x: x + (j - 0.5), z: z + (jitter(n++) - 0.5), s: P.treeScaleMin + (P.treeScaleMax - P.treeScaleMin) * j });
    };
    for (let k = 0; k < P.treeRows; k++) {
      const out = P.treeOut + k * P.treeGap * 0.8;
      for (let z = 1; z < rows + P.treeGap; z += P.treeGap) {
        add(-out, z + k * 1.5);
        add(cols + out, z + k * 1.5);
      }
      for (let x = -out; x <= cols + out; x += P.treeGap) add(x + k * 1.5, -out);
    }
    const trunkGeo = this.keep(new CylinderGeometry(P.trunkRadius, P.trunkRadius * 1.2, P.trunkHeight, 6).translate(0, P.trunkHeight / 2, 0));
    const leafGeo = this.keep(new ConeGeometry(P.leafRadius, P.leafHeight, 7).translate(0, P.trunkHeight + P.leafHeight / 2 - 0.15, 0));
    const trunks = new InstancedMesh(trunkGeo, this.keep(new MeshLambertMaterial({ color: P.trunk })), spots.length);
    const leaves = new InstancedMesh(leafGeo, this.keep(new MeshLambertMaterial({ color: P.leaf })), spots.length);
    const m = new Matrix4();
    spots.forEach((t, i) => {
      m.makeScale(t.s, t.s, t.s).setPosition(t.x, 0, t.z);
      trunks.setMatrixAt(i, m);
      leaves.setMatrixAt(i, m);
    });
    trunks.computeBoundingSphere();
    leaves.computeBoundingSphere();
    return [trunks, leaves];
  }

  /** 학교 건물(운동장 위쪽 뒤): 몸·지붕·층마다 창·가운데 문을 상자 InstancedMesh 하나로 */
  private building() {
    const { cols } = mapSize(this.room);
    const w = cols * P.buildingWidth;
    const x0 = (cols - w) / 2;
    const front = -P.buildingOut;
    const back = front - P.buildingDepth;
    const boxes: { x: number; y: number; z: number; w: number; h: number; d: number; color: number }[] = [];
    boxes.push({ x: x0 + w / 2, y: 0, z: (front + back) / 2, w, h: P.buildingHeight, d: P.buildingDepth, color: P.building });
    boxes.push({ x: x0 + w / 2, y: P.buildingHeight, z: (front + back) / 2, w: w + 0.6, h: 0.5, d: P.buildingDepth + 0.6, color: P.roof });
    const floorH = P.buildingHeight / (P.windowFloors + 0.5);
    const per = Math.floor((w - P.windowGap) / (P.windowW + P.windowGap));
    const span = per * (P.windowW + P.windowGap) - P.windowGap;
    for (let f = 0; f < P.windowFloors; f++) {
      for (let i = 0; i < per; i++) {
        const x = x0 + (w - span) / 2 + i * (P.windowW + P.windowGap) + P.windowW / 2;
        // 1층 가운데는 문 자리
        if (f === 0 && Math.abs(x - (x0 + w / 2)) < P.windowW + P.windowGap / 2) continue;
        boxes.push({ x, y: floorH * (f + 0.5), z: front + 0.05, w: P.windowW, h: P.windowH, d: 0.12, color: P.window });
      }
    }
    boxes.push({ x: x0 + w / 2, y: 0, z: front + 0.05, w: P.windowW * 1.6, h: floorH * 0.9, d: 0.14, color: P.door });
    const geo = this.keep(new BoxGeometry(1, 1, 1).translate(0, 0.5, 0));
    const mesh = new InstancedMesh(geo, this.keep(new MeshLambertMaterial()), boxes.length);
    const m = new Matrix4();
    const c = new Color();
    boxes.forEach((b, i) => {
      m.makeScale(b.w, b.h, b.d).setPosition(b.x, b.y, b.z);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.setHex(b.color));
    });
    mesh.computeBoundingSphere();
    return mesh;
  }

  dispose() {
    this.group.removeFromParent();
    for (const d of this.disposables) d.dispose();
  }
}
