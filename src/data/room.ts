// 방 데이터의 형식. 방 내용(사물, 단서, 퀴즈, 아이템)은 코드가 아니라 JSON 파일에 둔다.
// 나중에 Unity로 옮길 때도 같은 JSON을 쓸 수 있게, 좌표는 픽셀이 아니라 칸 단위로 적는다.
import type { Zone, Zones } from '../../shared/goldenbell.ts';

/** layout 글자: '#' 벽, '.' 바닥 */
export type Layout = string[];

export type ObjectKind = 'blackboard' | 'teacherDesk' | 'desk' | 'locker' | 'door';

export type Action =
  | { type: 'clue'; text: string; gives?: string } // 글을 보여 주고, 아이템을 줄 수 있다
  | { type: 'quiz'; quiz: string; gives?: string } // 퀴즈를 맞히면 아이템을 준다
  | { type: 'exit'; quiz?: string }; // (퀴즈를 맞히면) 방을 나간다

export interface RoomObject {
  id: string;
  name: string;
  kind: ObjectKind;
  /** 왼쪽 위 칸과 크기(칸). 사물은 모두 지나갈 수 없다. */
  col: number;
  row: number;
  w: number;
  h: number;
  /** 없으면 살펴볼 수 없는 사물(가구 등) */
  action?: Action;
  /** 이 아이템이 있어야 action을 할 수 있다 */
  requires?: string;
  lockedText?: string;
  /** action을 마친 뒤 다시 살펴볼 때 보이는 글 */
  doneText?: string;
}

export interface Quiz {
  /** 교사가 바꿔 넣을 예시 문제이면 true */
  example?: boolean;
  question: string;
  choices: string[];
  /** 정답의 choices 번호(0부터) */
  answer: number;
}

/** 칸 단위 네모 */
export interface Rect {
  col: number;
  row: number;
  w: number;
  h: number;
}

export interface Room {
  id: string;
  name: string;
  goal: string;
  layout: Layout;
  /** 시작 위치(칸 좌표, 칸 가운데는 .5) */
  start: { col: number; row: number };
  /** 아이템 id → 이름 */
  items: Record<string, string>;
  objects: RoomObject[];
  quizzes: Record<string, Quiz>;
  /** 골든벨 맵: 답 구역 */
  zones?: Zones;
  /** 골든벨 맵: 서버가 학생의 발밑을 처음 세우는 곳(벽과 구역에 닿지 않게 띄워 둔다) */
  spawn?: Rect;
}

const KINDS: ObjectKind[] = ['blackboard', 'teacherDesk', 'desk', 'locker', 'door'];

/** JSON을 읽고 서로 가리키는 id가 맞는지 확인한다. 틀린 곳이 있으면 모두 모아 오류를 낸다. */
export function loadRoom(data: unknown): Room {
  const room = data as Room;
  const errors: string[] = [];
  const rows = room.layout.length;
  const cols = room.layout[0]?.length ?? 0;
  room.layout.forEach((line, r) => {
    if (line.length !== cols) errors.push(`layout ${r}번째 줄의 길이가 다릅니다.`);
    if (/[^#.]/.test(line)) errors.push(`layout ${r}번째 줄에 '#', '.' 말고 다른 글자가 있습니다.`);
  });
  const quizIds = new Set(Object.keys(room.quizzes));
  const itemIds = new Set(Object.keys(room.items));
  const seen = new Set<string>();
  for (const o of room.objects) {
    if (seen.has(o.id)) errors.push(`사물 id '${o.id}'가 두 번 나옵니다.`);
    seen.add(o.id);
    if (!KINDS.includes(o.kind)) errors.push(`사물 '${o.id}'의 kind '${o.kind}'를 모릅니다.`);
    if (o.col < 0 || o.row < 0 || o.col + o.w > cols || o.row + o.h > rows) {
      errors.push(`사물 '${o.id}'가 방 밖으로 나갑니다.`);
    }
    if (o.requires && !itemIds.has(o.requires)) errors.push(`사물 '${o.id}'의 requires '${o.requires}'가 items에 없습니다.`);
    const a = o.action;
    if (a && 'quiz' in a && a.quiz && !quizIds.has(a.quiz)) errors.push(`사물 '${o.id}'의 퀴즈 '${a.quiz}'가 quizzes에 없습니다.`);
    if (a && 'gives' in a && a.gives && !itemIds.has(a.gives)) errors.push(`사물 '${o.id}'의 gives '${a.gives}'가 items에 없습니다.`);
  }
  const inside = (r: Rect) => r.col >= 0 && r.row >= 0 && r.col + r.w <= cols && r.row + r.h <= rows;
  const zones: Zone[] = room.zones ? [...room.zones.ox, ...room.zones.choice] : [];
  for (const z of zones) {
    if (!inside(z)) errors.push(`답 구역 '${z.label}'이 방 밖으로 나갑니다.`);
  }
  if (room.zones && (room.zones.ox.length !== 2 || room.zones.choice.length !== 4)) {
    errors.push('답 구역은 OX 2개, 객관식 4개여야 합니다.');
  }
  if (room.spawn && !inside(room.spawn)) errors.push('spawn이 방 밖으로 나갑니다.');
  for (const [id, q] of Object.entries(room.quizzes)) {
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.choices.length) {
      errors.push(`퀴즈 '${id}'의 answer 번호가 choices 범위를 벗어납니다.`);
    }
  }
  if (errors.length) throw new Error(`방 '${room.id}' 데이터 오류\n- ${errors.join('\n- ')}`);
  return room;
}
