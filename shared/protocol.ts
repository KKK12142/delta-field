// 서버와 게임 화면이 함께 쓰는 약속. Node가 그대로 실행할 수 있게 타입만 지우면 되는 문법만 쓴다.

export const ROOM_NAME = 'class';
/** 학생 35명 + 선생님 + 여유 */
export const MAX_CLIENTS = 40;
export const MAX_NICKNAME = 12;
export const CODE_LENGTH = 4;
/** 와이파이가 잠깐 끊겨도 이 시간(초) 안에 돌아오면 같은 자리로 다시 붙는다. */
export const RECONNECT_SECONDS = 20;
/** 내 위치를 서버로 보내는 가장 짧은 간격(ms) */
export const MOVE_INTERVAL_MS = 66;

export type Role = 'student' | 'teacher';

/** 맵 id. 맵 데이터 JSON(src/data/)의 id와 같다. 'school'은 교실·복도·실험실·운동장이 이어진 방탈출 맵 */
export type MapId = 'school' | 'goldenbell';
export const MAP_IDS: MapId[] = ['school', 'goldenbell'];

/** 캐릭터 id를 모르거나 주지 않으면 이 캐릭터로 받는다. 캐릭터 목록은 src/data/characters.json */
export const DEFAULT_CHARACTER = 'char-01';

/** 학생이 첫 화면에서 고르는 반(2026-11-12 교사 결정). 선생님은 고르지 않는다. */
export const CLASS_GROUPS = [
  { id: 'science', name: '수과학반' },
  { id: 'aisw', name: 'AI.SW반' },
] as const;
export type ClassGroupId = (typeof CLASS_GROUPS)[number]['id'];

/** 반 id의 이름. 모르는 id나 ''(선생님, 반 없음)이면 '' */
export function classGroupName(id: string): string {
  return CLASS_GROUPS.find((g) => g.id === id)?.name ?? '';
}

export interface JoinOptions {
  nickname: string;
  /** 고른 캐릭터 id(src/data/characters.json). 여럿이 같은 캐릭터를 골라도 된다. */
  character?: string;
  /** 학생의 반 id(CLASS_GROUPS). 선생님은 넣지 않는다. */
  classGroup?: string;
  /** 선생님만 넣는다. */
  password?: string;
}

export interface MoveMessage {
  col: number;
  row: number;
  /** 어느 맵에서의 위치인지. 서버가 아는 맵과 다르면(맵을 옮기는 중) 버린다. */
  map: MapId;
}

/** 학생이 지금 하는 일. ''은 돌아다니는 중, 'look'은 사물을 살펴보는 중, 'quiz'는 퀴즈를 푸는 중 */
export type ActivityKind = '' | 'look' | 'quiz';

/** 학생 화면이 서버에 알리는 지금 하는 일. 선생님의 CCTV 모드에 쓴다. 가진 물건·마친 미션은 서버가 채점하며 정한다. */
export interface StatusMessage {
  activity: ActivityKind;
  /** activity가 있을 때 그 사물의 id, 없으면 '' */
  object: string;
}

/** 선생님이 고를 수 있는 골든벨 문제 파일(서버의 goldenbell/ 폴더) */
export interface GbFileInfo {
  file: string;
  title: string;
  count: number;
  /** 형식이 틀렸으면 그 까닭 */
  error: string | null;
}

/** 강당으로 모으기(2026-11-12 교사 결정): 선생님이 고르는 남은 시간(초). 0은 바로 옮긴다. */
export const GATHER_SECONDS = [0, 60, 180, 300] as const;

/** 선생님이 강당으로 모으기를 건다. 남은 시간이 0이 되면 그 문제 파일로 골든벨을 시작한다(모두 골든벨 맵으로 옮김). */
export interface GatherMessage {
  file: string;
  /** GATHER_SECONDS 가운데 하나 */
  seconds: number;
}

/** 전체 공지(2026-11-13 교사 결정): 선생님이 보낸 글이 모두의 화면 가운데에 잠깐 뜬다. 상태에 남기지 않는다(나중에 들어온 사람은 보지 않음). */
export const MAX_ANNOUNCE = 100;
/** 같은 선생님이 이 시간(ms) 안에 다시 보내면 받지 않는다. */
export const ANNOUNCE_INTERVAL_MS = 2000;

/** 선생님이 서버로 보내는 공지(요청 'announce', 답은 GbReply) */
export interface AnnounceMessage {
  text: string;
}

/** 서버가 방의 모두에게 보내는 공지(메시지 'announce') */
export interface AnnounceBroadcast {
  text: string;
  /** 보낸 선생님의 닉네임 */
  from: string;
}

/** 앞뒤 빈칸을 지우고 MAX_ANNOUNCE자로 자른다. 글이 아니거나 비면 '' */
export function cleanAnnounce(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, MAX_ANNOUNCE).trim();
}

/** 방탈출 부. 1부 장소로 시작하고, 선생님이 "2부 열기"를 누르면 2가 된다(2부 장소의 문 잇기는 맵을 넓힐 때 한다). */
export const PARTS = [1, 2] as const;

/** 골든벨 요청(gbStart, gbGather, gbGatherCancel, gbNext, gbEnd, gbSubmit, gbAccept, openPart)과 announce의 답. 할 수 없으면 error에 까닭을 적는다. */
export interface GbReply {
  error: string | null;
}

/** 학생이 단답형 답을 낸다. 제한 시간 안에는 다시 낼 수 있고 마지막에 낸 답으로 채점한다. */
export interface GbSubmitMessage {
  text: string;
}

/** 선생님이 단답형 정답 공개 뒤 낸 답 하나(answerKey)를 정답으로 인정하거나 인정을 거둔다. */
export interface GbAcceptMessage {
  key: string;
  accept: boolean;
}

/** 서버가 들어오기를 거절할 때 쓰는 번호. 방 만들기 오류는 HTTP 응답 번호로도 쓰이므로 200~599 안에서 고르고, Colyseus의 번호(520~526)와 겹치지 않게 했다. */
export const RejectCode = {
  noTeacherPassword: 503,
  wrongPassword: 403,
  nicknameTaken: 409,
  badNickname: 422,
} as const;

/** 앞뒤 빈칸을 지우고 1~MAX_NICKNAME자인지 본다. 맞지 않으면 null */
export function cleanNickname(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const nickname = value.trim();
  if (nickname.length < 1 || nickname.length > MAX_NICKNAME) return null;
  return nickname;
}
