// 골든벨 규칙. 서버(채점)와 화면(표시)이 함께 쓴다. 교사가 정한 규칙은 docs/design.md의 2단계 ③에 있다.

/** 처음 목숨 */
export const GB_LIVES = 3;
/** 탈락한 뒤 이만큼 맞히면(연속이 아니어도) 다시 살아난다. */
export const GB_REVIVE_CORRECT = 3;
/** 다시 살아날 때 받는 목숨 */
export const GB_REVIVE_LIVES = 1;

/** ox: O·X 구역, choice: 객관식 1~4 구역, short: 단답형(화면에 글자로 써서 낸다. 구역이 없다) */
export type GbQuestionType = 'ox' | 'choice' | 'short';
/** 단답형 답의 가장 긴 글자 수 */
export const GB_MAX_ANSWER = 40;
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

/** 이 문제에서 쓰는 구역. 객관식은 보기 수만큼 앞에서부터 쓴다. 단답형은 구역이 없다. */
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

/** 채점에서 맞은 것으로 친 결과인지 */
export const isCorrectResult = (result: string) => result === 'correct' || result === 'revived';

// ---- 단답형 채점 ----
// 서버가 채점하고, 선생님 화면은 같은 규칙으로 낸 답을 묶어 보인다(정답 인정 단추).

const SUPERSCRIPT: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+',
};

/**
 * 비교하려고 답을 고른 꼴로 바꾼다.
 * 위 첨자는 ^로(m/s² → m/s^2, 10⁸ → 10^8), 전각 글자는 반각으로(NFKC, ℃ → °C), 여러 가지 빼기 기호(−, –)는 -로,
 * 대문자는 소문자로 바꾸고, 빈칸 전부, 곱하기 점(·), 숫자 사이의 천 단위 쉼표, 끝의 마침표를 지운다.
 * 남은 쉼표(、 포함)는 여러 답을 나누는 것으로 본다(listKey).
 */
export function normalizeAnswer(text: string): string {
  return text
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+/g, (m) => `^${[...m].map((c) => SUPERSCRIPT[c]).join('')}`)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[−–—]/g, '-')
    .replace(/、/g, ',')
    .replace(/\s+/g, '')
    .replace(/[·⋅∙]/g, '')
    .replace(/(\d),(?=\d{3}(?!\d))/g, '$1')
    .replace(/[.。]+$/, '');
}

/** 쉼표로 나뉜 여러 답이면 순서와 상관없이 같은 꼴(조각을 정렬해 이음). 아니면 그대로 */
export function listKey(norm: string): string {
  const parts = norm.split(',').filter(Boolean);
  return parts.length > 1 ? parts.sort().join(',') : norm;
}

/** 같은 답으로 묶는 열쇠(선생님 화면의 답 묶음, 정답 인정): 고른 꼴, 쉼표 답은 순서 무시 */
export const answerKey = (text: string) => listKey(normalizeAnswer(text));

/** 정답 공개 때 보일 정답 표현: 같은 꼴(normalizeAnswer, 쉼표 답은 순서 무시)은 처음 것만 남긴다. */
export function answerDisplay(answers: readonly string[]): string {
  const seen = new Set<string>();
  return answers
    .filter((a) => {
      const key = answerKey(a);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(' / ');
}

/** 앞쪽의 수(1.5, -3, 3×10^8, 3e8)와 나머지(단위). 수로 시작하지 않으면 null */
function splitNumber(norm: string): { value: number; unit: string } | null {
  const m = /^([+-]?\d+(?:\.\d+)?)(?:(?:×|x|\*)10\^?([+-]?\d+)|e([+-]?\d+))?(.*)$/.exec(norm);
  if (!m) return null;
  const exp = Number(m[2] ?? m[3] ?? 0);
  return { value: Number(m[1]) * 10 ** exp, unit: m[4] };
}

/** 단위로 볼 수 있는 시작 글자(수, 연산 기호, 분수·비율 기호가 아님) */
const UNIT_START = /^[^\d/^+\-*×x.,:()=]/;

const sameNumber =(a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/**
 * 낸 답이 정답(여러 표현) 가운데 하나와 맞는지. 고른 꼴(normalizeAnswer)로 비교하고,
 * 정답이 수와 단위면 수가 같고 단위가 같거나 단위를 쓰지 않은 답도 맞는 것으로 본다(10 m/s ← 10, 10m/s, 10.0 m/s).
 * 단위를 다르게 쓴 답(10 km/s)은 틀린 것으로 본다. 쉼표로 나뉜 여러 답은 순서가 달라도 맞는 것으로 본다.
 */
export function matchAnswer(text: string, answers: readonly string[]): boolean {
  const mine = normalizeAnswer(text);
  if (!mine) return false;
  const mineNum = splitNumber(mine);
  return answers.some((a) => {
    const right = normalizeAnswer(a);
    if (mine === right || listKey(mine) === listKey(right)) return true;
    const rightNum = splitNumber(right);
    if (!mineNum || !rightNum || !sameNumber(mineNum.value, rightNum.value)) return false;
    // 1/2, 1:2처럼 수가 이어지는 정답은 앞의 수만 써서는 맞지 않는다.
    return mineNum.unit === rightNum.unit || (mineNum.unit === '' && UNIT_START.test(rightNum.unit));
  });
}
