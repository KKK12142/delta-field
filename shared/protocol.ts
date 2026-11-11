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

export interface JoinOptions {
  nickname: string;
  /** 선생님만 넣는다. */
  password?: string;
}

export interface MoveMessage {
  col: number;
  row: number;
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
