// CCTV 모드에서 학생 한 명을 어떻게 적어 보일지 정한다. 서버가 맞춰 준 학생 상태와 방 데이터만 쓴다.
import { CLASS_GROUPS, classGroupName } from '../../shared/protocol.ts';
import type { Player } from '../../shared/schema.ts';
import { areaAt, type Room } from '../data/room';

export interface StudentView {
  id: string;
  nickname: string;
  /** 반 id와 이름(반을 모르면 '') */
  classGroup: string;
  className: string;
  /** 지금 장소와 하는 일(목록과 정보 창). 예: "복도 · 신발장 퀴즈 푸는 중" */
  doing: string;
  /** 지도의 아바타 위에 띄울 짧은 표시. 돌아다니는 중이면 null */
  tag: string | null;
  /** "진행 2/4" */
  progress: string;
  /** 가진 물건 이름 */
  items: string[];
}

/** 살펴볼 수 있는 사물(단서, 퀴즈, 문, 출구) 수 = 진행의 전체 단계 수 */
function stepCount(room: Room) {
  return room.objects.filter((o) => o.action).length;
}

export function describeStudent(room: Room, id: string, p: Player): StudentView {
  const object = room.objects.find((o) => o.id === p.activityObject);
  let doing = '돌아다니는 중';
  let tag: string | null = null;
  if (!p.online) {
    doing = tag = '연결 끊김';
  } else if (p.escaped) {
    doing = tag = '탈출 완료';
  } else if (object && p.activity === 'quiz') {
    doing = `${object.name} 퀴즈 푸는 중`;
    tag = `${object.name} 퀴즈`;
  } else if (object && p.activity === 'look') {
    doing = `${object.name} 살펴보는 중`;
    tag = object.name;
  }
  // 연결이 끊긴 학생 말고는 지금 장소를 앞에 붙인다.
  const place = p.online ? areaAt(room, p.col, p.row)?.name : undefined;
  if (place) doing = `${place} · ${doing}`;
  // 출구(탈출)는 마친 사물에 들어가지 않으므로 탈출했으면 한 단계를 더한다. 연 문은 마친 사물에 들어간다.
  const steps = stepCount(room);
  const done = Math.min(steps, p.done.length + (p.escaped ? 1 : 0));
  return {
    id,
    nickname: p.nickname,
    classGroup: p.classGroup,
    className: classGroupName(p.classGroup),
    doing,
    tag,
    progress: `진행 ${done}/${steps}`,
    items: [...p.items].map((itemId) => room.items[itemId] ?? itemId),
  };
}

/** 반 순서(CLASS_GROUPS, 반을 모르면 맨 뒤), 같은 반 안에서는 닉네임 가나다순 */
export function byClassAndNickname(a: StudentView, b: StudentView) {
  return classOrder(a.classGroup) - classOrder(b.classGroup) || a.nickname.localeCompare(b.nickname, 'ko');
}

function classOrder(id: string) {
  const i = CLASS_GROUPS.findIndex((g) => g.id === id);
  return i < 0 ? CLASS_GROUPS.length : i;
}

/** 반마다 학생 수. 예: "수과학반 3 · AI.SW반 2" (반을 모르는 학생은 세지 않는다) */
export function classCounts(students: StudentView[]) {
  return CLASS_GROUPS.map((g) => `${g.name} ${students.filter((s) => s.classGroup === g.id).length}`).join(' · ');
}
