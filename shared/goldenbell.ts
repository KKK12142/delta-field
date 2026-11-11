// 골든벨 규칙. 서버(채점)와 화면(표시)이 함께 쓴다. 교사가 정한 규칙은 docs/design.md의 2단계 ③에 있다.

/** 처음 목숨 */
export const GB_LIVES = 3;
/** 탈락한 뒤 이만큼 맞히면(연속이 아니어도) 다시 살아난다. */
export const GB_REVIVE_CORRECT = 3;
/** 다시 살아날 때 받는 목숨 */
export const GB_REVIVE_LIVES = 1;

export type GbQuestionType = 'ox' | 'choice';
/** '' 꺼짐 | 'ready' 첫 문제 전 | 'question' 푸는 중 | 'reveal' 정답 공개 | 'end' 모든 문제를 마침 */
export type GbPhase = '' | 'ready' | 'question' | 'reveal' | 'end';
/** 한 문제의 채점 결과. ''은 아직 채점하지 않음 */
export type GbResult = '' | 'correct' | 'wrong' | 'out' | 'revived';

/** 답 구역(칸 단위 네모). label은 OX면 'O'·'X', 객관식이면 '1'~'4' */
export interface Zone {
  label: string;
  col: number;
  row: number;
  w: number;
  h: number;
}

export interface Zones {
  ox: Zone[];
  choice: Zone[];
}

/** 이 문제에서 쓰는 구역. 객관식은 보기 수만큼 앞에서부터 쓴다. */
export function activeZones(zones: Zones, type: string, choiceCount: number): Zone[] {
  if (type === 'ox') return zones.ox;
  if (type === 'choice') return zones.choice.slice(0, choiceCount);
  return [];
}

/** (col, row)가 들어 있는 구역의 이름. 어느 구역에도 없으면 '' */
export function zoneAt(list: Zone[], col: number, row: number): string {
  return list.find((z) => col >= z.col && col < z.col + z.w && row >= z.row && row < z.row + z.h)?.label ?? '';
}

export interface GbScore {
  gbLives: number;
  gbScore: number;
  gbOut: boolean;
  /** 탈락한 뒤 맞힌 수 */
  gbRevive: number;
  gbResult: string;
}

/** 한 학생을 채점해 상태를 바꾼다. 탈락해 있는 동안 맞힌 문제는 점수에 넣지 않고 부활에만 센다. */
export function judge(p: GbScore, correct: boolean) {
  if (!p.gbOut) {
    if (correct) {
      p.gbScore += 1;
      p.gbResult = 'correct';
      return;
    }
    p.gbLives = Math.max(0, p.gbLives - 1);
    if (p.gbLives > 0) {
      p.gbResult = 'wrong';
      return;
    }
    p.gbOut = true;
    p.gbRevive = 0;
    p.gbResult = 'out';
    return;
  }
  if (!correct) {
    p.gbResult = 'wrong';
    return;
  }
  p.gbRevive += 1;
  if (p.gbRevive < GB_REVIVE_CORRECT) {
    p.gbResult = 'correct';
    return;
  }
  p.gbOut = false;
  p.gbLives = GB_REVIVE_LIVES;
  p.gbRevive = 0;
  p.gbResult = 'revived';
}
