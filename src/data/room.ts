// 맵 데이터의 형식. 맵 내용(바닥, 장소, 사물, 단서, 퀴즈, 아이템)은 코드가 아니라 JSON 파일에 둔다.
// 나중에 Unity로 옮길 때도 같은 JSON을 쓸 수 있게, 좌표는 픽셀이 아니라 칸 단위로 적는다.
// 바닥·벽·사물 종류 목록과 그림 크기는 docs/map.md에 정리해 두었다.
// scripts/lib/bots.mjs도 이 파일을 Node로 그대로 불러 쓰므로, import에는 .ts를 붙이고 타입만 가져올 때는 import type을 쓴다.
import { DOOR_KINDS } from '../../shared/escape.ts';
import type { Zone, Zones } from '../../shared/goldenbell.ts';

/** layout 한 줄. 글자 하나가 한 칸이고, 글자의 뜻은 TILES에 있다. */
export type Layout = string[];

/** 칸 종류. 바닥은 걸을 수 있고 벽은 막는다. id는 그리기(src/scenes/painter.ts)와 색(src/theme.ts의 color.tile)에 쓴다. */
export const TILES = {
  '.': { id: 'classroomFloor', name: '교실 바닥', floor: true },
  ',': { id: 'hallFloor', name: '복도 바닥', floor: true },
  ':': { id: 'labFloor', name: '실험실 바닥', floor: true },
  '"': { id: 'field', name: '운동장 흙', floor: true },
  '#': { id: 'wall', name: '건물 벽', floor: false },
  '%': { id: 'fence', name: '울타리', floor: false },
} as const;
export type TileChar = keyof typeof TILES;
export type TileId = (typeof TILES)[TileChar]['id'];

export function tileOf(ch: string | undefined) {
  return ch !== undefined && ch in TILES ? TILES[ch as TileChar] : undefined;
}

/** 걸을 수 있는 바닥 칸인지(맵 밖과 모르는 글자는 막힌 것으로 본다) */
export function isFloor(ch: string | undefined) {
  return tileOf(ch)?.floor === true;
}

export const OBJECT_KINDS = [
  // 교실
  'blackboard',
  'teacherDesk',
  'desk',
  'locker',
  // 복도
  'bulletinBoard',
  'shoeRack',
  // 실험실
  'labBench',
  'cabinet',
  // 운동장
  'tree',
  'goalpost',
  // 문(장소 사이)과 출구
  'door',
  'entrance',
  'gate',
  // 바닥에 놓인 작은 물건(주워 가는 미션)
  'item',
] as const;
export type ObjectKind = (typeof OBJECT_KINDS)[number];

export interface RoomObject {
  id: string;
  name: string;
  kind: ObjectKind;
  /** 왼쪽 위 칸과 크기(칸). 사물은 지나갈 수 없다(연 문만 지나갈 수 있다). */
  col: number;
  row: number;
  w: number;
  h: number;
  /**
   * 미션 id. 미션의 종류·문제·정답·힌트 카드는 서버만 읽는 방탈출 자료 파일(escape/*.yaml)에 있다(shared/escape.ts).
   * 없으면 살펴볼 수 없는 사물(가구 등)이다. 여러 사물이 같은 미션 id를 쓸 수 있다.
   */
  mission?: string;
}

/** 칸 단위 네모 */
export interface Rect {
  col: number;
  row: number;
  w: number;
  h: number;
}

/** 장소(교실, 복도 등). 안내와 CCTV에 지금 장소 이름을 보일 때 쓴다. 네모는 걸을 수 있는 안쪽만 둘러도 된다. */
export interface Area extends Rect {
  id: string;
  name: string;
}

export interface Room {
  id: string;
  name: string;
  goal: string;
  layout: Layout;
  /** 장소 목록. 없으면 맵 이름 하나로 본다. */
  areas?: Area[];
  /** 시작 위치(칸 좌표, 칸 가운데는 .5) */
  start: { col: number; row: number };
  objects: RoomObject[];
  /** 골든벨 맵: 답 구역 */
  zones?: Zones;
  /** 골든벨 맵: 서버가 학생의 발밑을 처음 세우는 곳(벽과 구역에 닿지 않게 띄워 둔다) */
  spawn?: Rect;
}

/** 맵 크기(칸) */
export function mapSize(room: Room) {
  return { cols: room.layout[0]?.length ?? 0, rows: room.layout.length };
}

/** 칸 좌표가 들어 있는 장소. 어느 네모에도 없으면(문턱, 벽 옆) 가장 가까운 장소. 장소가 없으면 null */
export function areaAt(room: Room, col: number, row: number): Area | null {
  let best: Area | null = null;
  let bestDist = Infinity;
  for (const a of room.areas ?? []) {
    const dx = Math.max(a.col - col, 0, col - (a.col + a.w));
    const dy = Math.max(a.row - row, 0, row - (a.row + a.h));
    const d = Math.hypot(dx, dy);
    if (d === 0) return a;
    if (d < bestDist) {
      best = a;
      bestDist = d;
    }
  }
  return best;
}

/** JSON을 읽고 서로 가리키는 id가 맞는지 확인한다. 틀린 곳이 있으면 모두 모아 오류를 낸다. */
export function loadRoom(data: unknown): Room {
  const room = data as Room;
  const errors: string[] = [];
  const { rows, cols } = mapSize(room);
  room.layout.forEach((line, r) => {
    if (line.length !== cols) errors.push(`layout ${r}번째 줄의 길이가 다릅니다.`);
    const unknown = [...new Set([...line].filter((ch) => !tileOf(ch)))];
    if (unknown.length) errors.push(`layout ${r}번째 줄에 모르는 글자 ${unknown.map((ch) => `'${ch}'`).join(', ')}가 있습니다.`);
  });
  const inside = (r: Rect) => r.col >= 0 && r.row >= 0 && r.col + r.w <= cols && r.row + r.h <= rows;
  const seen = new Set<string>();
  for (const o of room.objects) {
    if (seen.has(o.id)) errors.push(`사물 id '${o.id}'가 두 번 나옵니다.`);
    seen.add(o.id);
    if (!OBJECT_KINDS.includes(o.kind)) errors.push(`사물 '${o.id}'의 kind '${o.kind}'를 모릅니다.`);
    if (!inside(o)) errors.push(`사물 '${o.id}'가 맵 밖으로 나갑니다.`);
    // 문은 열면 지나갈 수 있어야 하므로 그 밑이 바닥 칸이어야 한다.
    if ((DOOR_KINDS as readonly string[]).includes(o.kind) && inside(o)) {
      for (let r = o.row; r < o.row + o.h; r++) {
        for (let c = o.col; c < o.col + o.w; c++) {
          if (!isFloor(room.layout[r][c])) errors.push(`문 '${o.id}' 밑의 칸 (${c}, ${r})이 바닥이 아닙니다.`);
        }
      }
    }
  }
  const areaIds = new Set<string>();
  for (const a of room.areas ?? []) {
    if (areaIds.has(a.id)) errors.push(`장소 id '${a.id}'가 두 번 나옵니다.`);
    areaIds.add(a.id);
    if (!inside(a)) errors.push(`장소 '${a.id}'가 맵 밖으로 나갑니다.`);
  }
  if (!isFloor(room.layout[Math.floor(room.start.row)]?.[Math.floor(room.start.col)])) errors.push('start가 바닥 칸이 아닙니다.');
  const zones: Zone[] = room.zones ? [...room.zones.ox, ...room.zones.choice] : [];
  for (const z of zones) {
    if (!inside(z)) errors.push(`답 구역 '${z.label}'이 맵 밖으로 나갑니다.`);
  }
  if (room.zones && (room.zones.ox.length !== 2 || room.zones.choice.length !== 4)) {
    errors.push('답 구역은 OX 2개, 객관식 4개여야 합니다.');
  }
  if (room.spawn && !inside(room.spawn)) errors.push('spawn이 맵 밖으로 나갑니다.');
  if (errors.length) throw new Error(`맵 '${room.id}' 데이터 오류\n- ${errors.join('\n- ')}`);
  return room;
}
