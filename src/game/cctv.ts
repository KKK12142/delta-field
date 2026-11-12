// CCTV 모드에서 학생 한 명을 어떻게 적어 보일지 정한다. 서버가 맞춰 준 학생 상태와 방 데이터만 쓴다.
import { STUCK_SECONDS, STUCK_WRONGS } from '../../shared/escape.ts';
import { CLASS_GROUPS, classGroupName } from '../../shared/protocol.ts';
import type { Escape, Player } from '../../shared/schema.ts';
import { areaAt, type Room } from '../data/room';
import { hintSummary, openMissions } from './progress';

/** 학생이 지금 하는 일의 종류(CCTV 목록에서 색으로 나눈다). stuck(막힘)은 막힌 학생을 알아내는 규칙이 생기면 채운다. */
export type StudentState = 'walk' | 'look' | 'quiz' | 'stuck' | 'escaped' | 'offline';

export interface StudentView {
  id: string;
  nickname: string;
  /** 캐릭터 id(목록의 얼굴) */
  character: string;
  state: StudentState;
  /** 반 id와 이름(반을 모르면 '') */
  classGroup: string;
  className: string;
  /** 지금 장소와 하는 일(목록과 정보 창). 예: "복도 · 신발장 퀴즈 푸는 중" */
  doing: string;
  /** 지도의 아바타 위에 띄울 짧은 표시. 돌아다니는 중이면 null */
  tag: string | null;
  /** "미션 5/12 · 힌트 1부 3/8 · 2부 0/8 · 보너스" */
  progress: string;
  /** 가진 물건 이름 */
  items: string[];
  /** 열린 부까지 마친 미션 수와 모두(정렬: 진행 낮은 순) */
  done: number;
  total: number;
  finished: boolean;
  /** 보너스 미션을 마침 */
  bonus: boolean;
  /** 오래 막혀 있으면 그 까닭(예: "교탁 4번 틀림", "6분째 그대로"). 아니면 null */
  stuck: string | null;
}

/** 지금 방의 상황: 열린 부와 방의 시계(초, ClassState.now) */
export interface CctvContext {
  part: number;
  now: number;
}

/** 미션 id의 이름(그 미션을 단 첫 사물의 이름표) */
function missionName(room: Room, escape: Escape, mission: string) {
  const o = room.objects.find((x) => x.mission === mission);
  return o ? (escape.labels.get(o.id) ?? o.name) : mission;
}

/** escape: 선생님이 고른 방탈출 자료의 공개 정보(아이템 이름, 힌트 카드 수) */
export function describeStudent(room: Room, escape: Escape, id: string, p: Player, ctx: CctvContext): StudentView {
  const found = room.objects.find((o) => o.id === p.activityObject);
  // 자료 파일의 이름표(labels)가 있으면 그 이름으로 적는다.
  const object = found ? { name: escape.labels.get(found.id) ?? found.name } : undefined;
  let doing = '돌아다니는 중';
  let tag: string | null = null;
  let state: StudentState = 'walk';
  if (!p.online) {
    doing = tag = '연결 끊김';
    state = 'offline';
  } else if (object && p.activity === 'quiz') {
    doing = `${object.name} 퀴즈 푸는 중`;
    tag = `${object.name} 퀴즈`;
    state = 'quiz';
  } else if (object && p.activity === 'look') {
    doing = `${object.name} 살펴보는 중`;
    tag = object.name;
    state = 'look';
  } else if (p.finished) {
    doing = tag = '1부 완료';
    state = 'escaped';
  }
  // 연결이 끊긴 학생 말고는 지금 장소를 앞에 붙인다.
  const place = p.online ? areaAt(room, p.col, p.row)?.name : undefined;
  if (place) doing = `${place} · ${doing}`;
  const missions = openMissions(room, escape, p, ctx.part);
  const bonus = escape.bonus.some((m) => p.done.includes(m));
  const stuck = stuckReason(room, escape, p, ctx, missions.done >= missions.total);
  // 돌아다니거나 살펴보는 중에 오래 막혀 있으면 상태 표시를 '막힘'으로(퀴즈를 푸는 중·연결 끊김은 그대로)
  if (stuck && (state === 'walk' || state === 'look')) state = 'stuck';
  return {
    id,
    nickname: p.nickname,
    character: p.character,
    state,
    classGroup: p.classGroup,
    className: classGroupName(p.classGroup),
    doing,
    tag,
    progress: [`미션 ${missions.done}/${missions.total}`, `힌트 ${hintSummary(escape, [...p.hints])}`, ...(bonus ? ['보너스'] : []), ...(p.miniHeart ? ['미니게임 하트'] : [])].join(' · '),
    items: [...p.items].map((itemId) => escape.items.get(itemId) ?? itemId),
    done: missions.done,
    total: missions.total,
    finished: p.finished,
    bonus,
    stuck,
  };
}

/**
 * 오래 막힌 까닭(대장 결정): 마치지 않은 한 자물쇠를 STUCK_WRONGS번 넘게 틀렸거나, 미션을 STUCK_SECONDS 넘게 하나도 마치지 못함.
 * 학교 맵에 있는 접속 중인 학생만 본다. 열린 미션을 다 마쳤거나, 1부를 마치고 2부를 기다리는 학생은 막힌 것으로 치지 않는다.
 */
function stuckReason(room: Room, escape: Escape, p: Player, ctx: CctvContext, allDone: boolean): string | null {
  if (!p.online || p.map !== 'school' || !escape.file || allDone) return null;
  let worst: [string, number] | null = null;
  p.wrongs.forEach((n, mission) => {
    if (n > STUCK_WRONGS && !p.done.includes(mission) && (!worst || n > worst[1])) worst = [mission, n];
  });
  if (worst) return `${missionName(room, escape, worst[0])} ${worst[1]}번 틀림`;
  if (p.finished && ctx.part === 1) return null;
  const idle = ctx.now - p.lastProgressAt;
  return idle > STUCK_SECONDS ? `${Math.floor(idle / 60)}분째 그대로` : null;
}

/** 진행 낮은 순(마친 미션 수), 같으면 반 순서·닉네임 순 */
export function byProgress(a: StudentView, b: StudentView) {
  return a.done - b.done || byClassAndNickname(a, b);
}

/** CCTV 머리의 진행 요약: "1부 완료 3명 · 보너스 1명 · 막힌 학생 2명" */
export function summaryLine(students: StudentView[]) {
  const n = (f: (s: StudentView) => boolean) => students.filter(f).length;
  return `1부 완료 ${n((s) => s.finished)}명 · 보너스 ${n((s) => s.bonus)}명 · 막힌 학생 ${n((s) => s.stuck !== null)}명`;
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
