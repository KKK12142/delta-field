// 선생님 창에서 바로 문제 내기(2026-11-22 교사 요청, design/quick-specs/emote-sfx-quick-questions-2026-11-22.md).
// 선생님 화면(쓰기·붙여넣기 확인)과 서버(다시 확인)가 같은 규칙을 쓴다. 정답이 들어 있으므로 서버는 방의 메모리에만 두고 상태에 넣지 않는다.
import { GB_MAX_ANSWER, normalizeAnswer, type GbQuestionType } from './goldenbell.ts';

/** 강당으로 모으기·골든벨 시작에서 문제 파일 이름 대신 쓰면 그 방의 "바로 낸 문제"로 시작한다. */
export const QUICK_FILE = '@quick';
/** 한 묶음에 넣을 수 있는 문제 수 */
export const QUICK_MAX_QUESTIONS = 50;
export const QUICK_MAX_TITLE = 30;
export const QUICK_MAX_QUESTION = 200;
export const QUICK_MAX_CHOICE = 60;
export const QUICK_MAX_EXPLAIN = 200;
/** 단답형 정답 표현 수 */
export const QUICK_MAX_ANSWERS = 10;
export const QUICK_MIN_SECONDS = 3;
export const QUICK_MAX_SECONDS = 600;
export const QUICK_DEFAULT_SECONDS = 20;
export const QUICK_DEFAULT_TITLE = '바로 낸 문제';

/** 바로 낸 문제 하나(서버의 GbQuestion과 같은 꼴, 넌센스는 없다). answer: OX는 'O'·'X', 객관식은 '1'~'4', 단답형은 answers[0] */
export interface QuickQuestion {
  type: GbQuestionType;
  question: string;
  choices: string[];
  answer: string;
  answers: string[];
  explain: string;
  seconds: number;
}

/** 선생님 → 서버: 바로 낸 문제 한 묶음(요청 'gbQuickSet', 답은 QuickReply) */
export interface QuickSetMessage {
  title: string;
  questions: QuickQuestion[];
}

/** 선생님 → 서버: 골든벨 중 즉석 문제 하나(요청 'gbQuickAdd', 답은 QuickReply) */
export interface QuickAddMessage {
  question: QuickQuestion;
}

/** 할 수 없으면 error에 까닭. 받았으면 count(묶음의 문제 수), started(즉석 문제를 바로 시작했는지) */
export interface QuickReply {
  error: string | null;
  count?: number;
  started?: boolean;
}

const text = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');

/**
 * 받은 값을 문제 하나로 고른다. 틀리면 까닭(글)을 돌려준다. 화면이 만든 값도, 서버가 받은 값도 이것으로 확인한다.
 */
export function checkQuickQuestion(raw: unknown): QuickQuestion | string {
  const q = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const type = text(q.type);
  const question = text(q.question);
  const explain = text(q.explain);
  const seconds = Number(q.seconds);
  if (!question) return '문제 글이 비어 있습니다.';
  if (question.length > QUICK_MAX_QUESTION) return `문제 글은 ${QUICK_MAX_QUESTION}자 안으로 씁니다.`;
  if (explain.length > QUICK_MAX_EXPLAIN) return `해설은 ${QUICK_MAX_EXPLAIN}자 안으로 씁니다.`;
  if (!Number.isInteger(seconds) || seconds < QUICK_MIN_SECONDS || seconds > QUICK_MAX_SECONDS) {
    return `제한 시간은 ${QUICK_MIN_SECONDS}~${QUICK_MAX_SECONDS}초 사이의 정수로 씁니다.`;
  }
  if (type === 'ox') {
    const answer = oxAnswer(text(q.answer));
    if (!answer) return 'OX 문제의 정답은 O 또는 X로 씁니다.';
    return { type, question, choices: [], answer, answers: [], explain, seconds };
  }
  if (type === 'choice') {
    const choices = Array.isArray(q.choices) ? q.choices.map(text) : [];
    if (choices.length < 2 || choices.length > 4 || choices.some((c) => !c)) return '객관식 보기는 빈 보기 없이 2~4개로 씁니다.';
    if (choices.some((c) => c.length > QUICK_MAX_CHOICE)) return `보기는 ${QUICK_MAX_CHOICE}자 안으로 씁니다.`;
    const answer = Number(text(q.answer));
    if (!Number.isInteger(answer) || answer < 1 || answer > choices.length) return `객관식 정답은 1~${choices.length} 사이의 보기 번호로 씁니다.`;
    return { type, question, choices, answer: String(answer), answers: [], explain, seconds };
  }
  if (type === 'short') {
    const answers = (Array.isArray(q.answers) ? q.answers.map(text) : []).filter(Boolean);
    if (!answers.length || answers.some((a) => !normalizeAnswer(a))) return '단답형 정답을 씁니다. 여럿이면 쉼표로 나눕니다.';
    if (answers.length > QUICK_MAX_ANSWERS) return `단답형 정답 표현은 ${QUICK_MAX_ANSWERS}개까지 씁니다.`;
    if (answers.some((a) => a.length > GB_MAX_ANSWER)) return `단답형 정답은 ${GB_MAX_ANSWER}자 안으로 씁니다.`;
    return { type, question, choices: [], answer: answers[0], answers, explain, seconds };
  }
  return '종류는 OX, 객관식, 단답형 가운데 하나입니다.';
}

/** 묶음 전체를 확인한다. 틀린 문제가 있으면 "3번 문제: …" 까닭 목록 */
export function checkQuickSet(raw: unknown): { title: string; questions: QuickQuestion[] } | string[] {
  const m = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const title = text(m.title).slice(0, QUICK_MAX_TITLE) || QUICK_DEFAULT_TITLE;
  const list: unknown[] = Array.isArray(m.questions) ? m.questions : [];
  if (!list.length) return ['문제를 하나 이상 넣습니다.'];
  if (list.length > QUICK_MAX_QUESTIONS) return [`문제는 ${QUICK_MAX_QUESTIONS}개까지 넣을 수 있습니다.`];
  const errors: string[] = [];
  const questions: QuickQuestion[] = [];
  list.forEach((q, i) => {
    const r = checkQuickQuestion(q);
    if (typeof r === 'string') errors.push(`${i + 1}번 문제: ${r}`);
    else questions.push(r);
  });
  return errors.length ? errors : { title, questions };
}

/** O·X로 볼 수 있는 글이면 'O'·'X', 아니면 '' */
function oxAnswer(v: string): 'O' | 'X' | '' {
  const s = v.normalize('NFKC').toUpperCase();
  if (s === 'O' || s === '○') return 'O';
  if (s === 'X' || s === '×' || s === '✕') return 'X';
  return '';
}

/** 끝 칸의 "30초"·"30s"(제한 시간)를 읽는다. 아니면 null */
function secondsCell(v: string): number | null {
  const m = /^(\d+)\s*(초|s|sec)$/i.exec(v);
  return m ? Number(m[1]) : null;
}

/** 보기 칸을 나눈다. 앞뒤에 빈칸이 있는 " / "가 있으면 그것으로만 나눈다(보기에 m/s처럼 /가 들어갈 때). 없으면 /로 나눈다. */
export function splitChoices(cell: string): string[] {
  return (/\s\/\s/.test(cell) ? cell.split(/\s+\/\s+/) : cell.split('/')).map((c) => c.trim());
}

/** 단답형 정답 칸을 쉼표로 나눈다. 숫자 사이의 쉼표(1,000)는 나누지 않는다. */
export function splitAnswers(cell: string): string[] {
  return cell.split(/(?<!\d),|,(?!\d)|[，、]/).map((a) => a.trim()).filter(Boolean);
}

/** 붙여넣기 한 줄의 결과: 문제나 까닭 */
export type PasteLine = { line: number; question: QuickQuestion } | { line: number; error: string };

/**
 * 여러 줄 붙여넣기를 읽는다(빈 줄은 건너뜀). 칸은 |로 나누고, 끝 칸이 "30초"면 그 문제의 제한 시간(없으면 seconds).
 * - OX: 문제 | O | 해설
 * - 객관식: 문제 | 보기1 / 보기2 / 보기3 / 보기4 | 2 | 해설 (보기에 /가 들어가면 보기 사이를 앞뒤 빈칸 있는 " / "로)
 * - 단답형: 문제 | =답1, 답2 | 해설 (숫자 사이의 쉼표 1,000은 나누지 않는다)
 */
export function parsePaste(source: string, seconds: number): PasteLine[] {
  const out: PasteLine[] = [];
  source.split(/\r?\n/).forEach((rawLine, i) => {
    const line = i + 1;
    if (!rawLine.trim()) return;
    const cells = rawLine.split('|').map((c) => c.trim());
    let time = seconds;
    const last = secondsCell(cells[cells.length - 1] ?? '');
    if (last !== null && cells.length > 2) {
      time = last;
      cells.pop();
    }
    const fail = (error: string) => out.push({ line, error });
    if (cells.length < 2 || !cells[0]) return fail('"문제 | 정답" 꼴로 씁니다(칸은 |로 나눕니다).');
    const [question, second, ...rest] = cells;
    let raw: Record<string, unknown>;
    if (second.startsWith('=')) {
      if (rest.length > 1) return fail('단답형은 "문제 | =답1, 답2 | 해설" 꼴로 씁니다.');
      raw = { type: 'short', question, answers: splitAnswers(second.slice(1)), explain: rest[0] ?? '' };
    } else if (oxAnswer(second)) {
      if (rest.length > 1) return fail('OX는 "문제 | O | 해설" 꼴로 씁니다.');
      raw = { type: 'ox', question, answer: second, explain: rest[0] ?? '' };
    } else if (second.includes('/')) {
      if (!rest.length || rest.length > 2) return fail('객관식은 "문제 | 보기1 / 보기2 / 보기3 / 보기4 | 정답 번호 | 해설" 꼴로 씁니다.');
      raw = { type: 'choice', question, choices: splitChoices(second), answer: rest[0], explain: rest[1] ?? '' };
    } else {
      return fail('둘째 칸은 O·X, 보기(/로 나눔), =단답 정답 가운데 하나로 씁니다.');
    }
    const r = checkQuickQuestion({ ...raw, seconds: time });
    if (typeof r === 'string') fail(r);
    else out.push({ line, question: r });
  });
  return out;
}

/** 문제 하나를 붙여넣기 한 줄 꼴로(내 문제 목록·다시 고치기에 쓴다) */
export function toPasteLine(q: QuickQuestion, defaultSeconds = QUICK_DEFAULT_SECONDS): string {
  const second = q.type === 'ox' ? q.answer : q.type === 'choice' ? `${q.choices.join(' / ')} | ${q.answer}` : `=${q.answers.join(', ')}`;
  const cells = [q.question, second];
  if (q.explain) cells.push(q.explain);
  if (q.seconds !== defaultSeconds) cells.push(`${q.seconds}초`);
  return cells.join(' | ');
}
