// 골든벨 문제 파일(YAML)을 읽고 형식을 확인한다.
// 파일은 저장소 맨 위 goldenbell/ 폴더에 둔다. 확인용으로 다른 폴더를 쓸 때는 DF_GOLDENBELL_DIR로 바꾼다.
// 서버만 이 파일을 읽으므로 정답은 학생 화면에 미리 가지 않는다.
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { YAMLParseError, parse } from 'yaml';
import { GB_MAX_ANSWER, normalizeAnswer, type GbQuestionType } from '../shared/goldenbell.ts';
import type { GbFileInfo } from '../shared/protocol.ts';

export interface GbQuestion {
  type: GbQuestionType;
  question: string;
  /** 객관식 보기(OX는 빈 목록) */
  choices: string[];
  /** 정답 구역 이름: OX는 'O'·'X', 객관식은 '1'~'4'. 단답형은 answers의 첫 표현 */
  answer: string;
  /** 단답형 정답 표현들(OX·객관식은 빈 목록) */
  answers: string[];
  /** 해설(정답 공개 때 모두에게 보인다). 없으면 '' */
  explain: string;
  seconds: number;
}

export interface QuestionSet {
  title: string;
  questions: GbQuestion[];
}

const MIN_SECONDS = 3;
const MAX_SECONDS = 600;
/** 골든벨 맵의 객관식 구역 수 */
const MAX_CHOICES = 4;

const dir = process.env.DF_GOLDENBELL_DIR
  ? resolve(process.env.DF_GOLDENBELL_DIR)
  : fileURLToPath(new URL('../goldenbell/', import.meta.url));

const isQuestionFile = (name: string) => /\.ya?ml$/i.test(name);

/** 폴더의 문제 파일과 각 파일의 형식 확인 결과 */
export function listQuestionFiles(): GbFileInfo[] {
  let names: string[];
  try {
    names = readdirSync(dir).filter(isQuestionFile);
  } catch {
    return [];
  }
  names.sort((a, b) => a.localeCompare(b, 'ko'));
  return names.map((file) => {
    try {
      const set = loadQuestionSet(file);
      return { file, title: set.title, count: set.questions.length, error: null };
    } catch (e) {
      return { file, title: file, count: 0, error: (e as Error).message };
    }
  });
}

/** 폴더 안의 문제 파일 하나를 읽는다. 형식이 틀리면 까닭을 모두 모아 오류를 낸다. */
export function loadQuestionSet(file: string): QuestionSet {
  // 폴더 밖의 파일을 읽지 않게 파일 이름만 받는다.
  if (file !== basename(file) || !isQuestionFile(file)) throw new Error('문제 파일 이름이 알맞지 않습니다.');
  let text: string;
  try {
    text = readFileSync(join(dir, file), 'utf8');
  } catch {
    throw new Error(`문제 파일 ${file}을(를) 읽지 못했습니다.`);
  }
  return parseQuestionSet(text, file);
}

/** 글(문자열이나 숫자)이면 앞뒤 빈칸을 지워 돌려준다. */
function textOf(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

export function parseQuestionSet(text: string, file: string): QuestionSet {
  let data: unknown;
  try {
    data = parse(text);
  } catch (e) {
    const line = e instanceof YAMLParseError ? e.linePos?.[0]?.line : undefined;
    throw new Error(`YAML 문법이 맞지 않습니다${line ? `(${line}번째 줄)` : ''}. 들여쓰기와 콜론(:)을 확인합니다.`);
  }
  const root = (data && typeof data === 'object' ? data : {}) as { title?: unknown; questions?: unknown };
  const title = textOf(root.title) || file.replace(/\.ya?ml$/i, '');
  const list: unknown[] = Array.isArray(root.questions) ? root.questions : [];
  const errors: string[] = [];
  if (!list.length) errors.push('questions에 문제가 없습니다.');

  const questions: GbQuestion[] = [];
  list.forEach((raw, i) => {
    const n = i + 1;
    const q = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const type = textOf(q.type).toLowerCase();
    const question = textOf(q.question);
    const seconds = Number(q.seconds);
    const explain = textOf(q.explain);
    const before = errors.length;
    if (!question) errors.push(`${n}번 문제: question(문제 글)이 비어 있습니다.`);
    if (!Number.isInteger(seconds) || seconds < MIN_SECONDS || seconds > MAX_SECONDS) {
      errors.push(`${n}번 문제: seconds(제한 시간)는 ${MIN_SECONDS}~${MAX_SECONDS} 사이의 정수(초)로 씁니다.`);
    }
    if (type === 'ox') {
      const answer = textOf(q.answer).toUpperCase();
      if (answer !== 'O' && answer !== 'X') errors.push(`${n}번 문제: OX 문제의 answer는 O 또는 X로 씁니다.`);
      if (errors.length === before) questions.push({ type, question, choices: [], answer, answers: [], explain, seconds });
    } else if (type === 'choice') {
      const choices = Array.isArray(q.choices) ? q.choices.map(textOf) : [];
      if (choices.length < 2 || choices.length > MAX_CHOICES || choices.some((c) => !c)) {
        errors.push(`${n}번 문제: choices(보기)는 빈 보기 없이 2~${MAX_CHOICES}개로 씁니다.`);
      }
      const answer = Number(q.answer);
      if (!Number.isInteger(answer) || answer < 1 || answer > Math.max(choices.length, 1)) {
        errors.push(`${n}번 문제: answer는 1~${Math.max(choices.length, 1)} 사이의 보기 번호로 씁니다.`);
      }
      if (errors.length === before) questions.push({ type, question, choices, answer: String(answer), answers: [], explain, seconds });
    } else if (type === 'short') {
      // 정답이 하나면 answers: 관성처럼, 여럿이면 [10 m/s, 10m/s]처럼 쓴다.
      const raw = Array.isArray(q.answers) ? q.answers : q.answers === undefined ? [] : [q.answers];
      const answers = raw.map(textOf);
      if (!answers.length || answers.some((a) => !normalizeAnswer(a))) {
        errors.push(`${n}번 문제: 단답형 문제의 answers(정답)는 빈 것 없이 씁니다. 여럿이면 [정답1, 정답2]처럼 씁니다.`);
      } else if (answers.some((a) => a.length > GB_MAX_ANSWER)) {
        errors.push(`${n}번 문제: answers(정답)는 ${GB_MAX_ANSWER}자 안으로 씁니다.`);
      }
      if (errors.length === before) questions.push({ type, question, choices: [], answer: answers[0], answers, explain, seconds });
    } else {
      errors.push(`${n}번 문제: type은 ox, choice, short 가운데 하나로 씁니다.`);
    }
  });
  if (errors.length) throw new Error(errors.join('\n'));
  return { title, questions };
}
