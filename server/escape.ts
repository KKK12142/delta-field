// 방탈출 자료 파일(YAML)을 읽고 형식을 확인한다. 형식은 escape/example.yaml에 적어 두었다.
// 파일은 저장소 맨 위 escape/ 폴더에 둔다. 확인용으로 다른 폴더를 쓸 때는 DF_ESCAPE_DIR로 바꾼다.
// 정답과 힌트 카드 글이 들어 있어 서버만 읽는다(학생에게는 미션을 마쳤을 때 그 학생에게만 보낸다).
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { YAMLParseError, parse } from 'yaml';
import school from '../src/data/school.json' with { type: 'json' };
import { DOOR_KINDS, MAX_CODE_DIGITS, MISSION_TYPES, type EscapeFileInfo, type HintCard, type MissionType } from '../shared/escape.ts';
import { GB_MAX_ANSWER, matchAnswer, normalizeAnswer } from '../shared/goldenbell.ts';
import { CLASS_GROUPS } from '../shared/protocol.ts';

/** 문제 하나. choices가 있으면 객관식(answer는 1부터의 보기 번호), 없으면 단답형(answers) */
export interface MissionQuiz {
  question: string;
  choices: string[];
  answer: number;
  answers: string[];
}

export interface Mission {
  id: string;
  type: MissionType;
  /** clue의 글 */
  text: string;
  /** 모두에게 같은 문제(없으면 null) */
  quiz: MissionQuiz | null;
  /** 반 자물쇠: 반 id → 문제 */
  classes: Partial<Record<string, MissionQuiz>>;
  /** 이 아이템이 있어야 살펴볼 수 있다 */
  requires: string;
  /** requires가 없을 때 보이는 글 */
  locked: string;
  /** 마치면 주는 아이템 id */
  gives: string;
  /** 마치면 주는 힌트 카드 id */
  hint: string;
  /** 마친 뒤 다시 살펴볼 때 보이는 글 */
  done: string;
  /** 교사가 바꿔 넣을 예시 문제이면 true(문제 창에 "예시 문제"가 보인다) */
  example: boolean;
  /** 마친 뒤 보이는 글(예: 숫자 자물쇠 번호의 실마리) */
  after: string;
  /** code: 숫자 자물쇠 번호(숫자 글) */
  code: string;
  /** deliver: 가져와야 하는 아이템 id(마치면 내려놓아 가진 물건에서 빠진다) */
  needs: string[];
  /** order: 살펴볼 사물 id의 맞는 순서 */
  order: string[];
  /** order: 사물 id → 살펴볼 때 보이는 글 */
  texts: Record<string, string>;
}

export interface EscapeSet {
  file: string;
  title: string;
  /** 아이템 id → 이름 */
  items: Record<string, string>;
  /** 힌트 카드(파일에 적은 순서) */
  hints: HintCard[];
  missions: Map<string, Mission>;
}

const dir = process.env.DF_ESCAPE_DIR ? resolve(process.env.DF_ESCAPE_DIR) : fileURLToPath(new URL('../escape/', import.meta.url));

const isEscapeFile = (name: string) => /\.ya?ml$/i.test(name);

/** 맵의 미션 id → 그 미션을 단 사물들 */
const MAP_MISSIONS = new Map<string, { id: string; kind: string }[]>();
/** 맵의 사물 id → 미션 id */
export const OBJECT_MISSIONS = new Map<string, string>();
for (const o of school.objects as { id: string; kind: string; mission?: string }[]) {
  if (!o.mission) continue;
  MAP_MISSIONS.set(o.mission, [...(MAP_MISSIONS.get(o.mission) ?? []), o]);
  OBJECT_MISSIONS.set(o.id, o.mission);
}

const CLASS_IDS: string[] = CLASS_GROUPS.map((g) => g.id);

/** 폴더의 자료 파일과 각 파일의 형식 확인 결과 */
export function listEscapeFiles(): EscapeFileInfo[] {
  let names: string[];
  try {
    names = readdirSync(dir).filter(isEscapeFile);
  } catch {
    return [];
  }
  names.sort((a, b) => a.localeCompare(b, 'ko'));
  return names.map((file) => {
    try {
      const set = loadEscapeSet(file);
      return { file, title: set.title, missions: set.missions.size, hints: set.hints.length, error: null };
    } catch (e) {
      return { file, title: file, missions: 0, hints: 0, error: (e as Error).message };
    }
  });
}

/** 폴더 안의 자료 파일 하나를 읽는다. 형식이 틀리면 까닭을 모두 모아 오류를 낸다. */
export function loadEscapeSet(file: string): EscapeSet {
  if (file !== basename(file) || !isEscapeFile(file)) throw new Error('자료 파일 이름이 알맞지 않습니다.');
  let text: string;
  try {
    text = readFileSync(join(dir, file), 'utf8');
  } catch {
    throw new Error(`자료 파일 ${file}을(를) 읽지 못했습니다.`);
  }
  return parseEscapeSet(text, file);
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

const objectOf = (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null);

/** 문제 한 개를 읽는다. 틀린 곳은 errors에 넣고 null을 돌려준다. */
function parseQuiz(raw: Record<string, unknown>, where: string, errors: string[]): MissionQuiz | null {
  const before = errors.length;
  const question = textOf(raw.question);
  if (!question) errors.push(`${where}: question(문제 글)이 비어 있습니다.`);
  if (raw.choices !== undefined) {
    const choices = Array.isArray(raw.choices) ? raw.choices.map(textOf) : [];
    if (choices.length < 2 || choices.some((c) => !c)) errors.push(`${where}: choices(보기)는 빈 보기 없이 2개 이상 씁니다.`);
    const answer = Number(raw.answer);
    if (!Number.isInteger(answer) || answer < 1 || answer > Math.max(choices.length, 1)) {
      errors.push(`${where}: answer는 1~${Math.max(choices.length, 1)} 사이의 보기 번호로 씁니다.`);
    }
    return errors.length === before ? { question, choices, answer, answers: [] } : null;
  }
  const list = Array.isArray(raw.answers) ? raw.answers : raw.answers === undefined ? [] : [raw.answers];
  const answers = list.map(textOf);
  if (!answers.length || answers.some((a) => !normalizeAnswer(a))) {
    errors.push(`${where}: 객관식은 choices와 answer를, 단답형은 answers(정답)를 빈 것 없이 씁니다.`);
  } else if (answers.some((a) => a.length > GB_MAX_ANSWER)) {
    errors.push(`${where}: answers(정답)는 ${GB_MAX_ANSWER}자 안으로 씁니다.`);
  }
  return errors.length === before ? { question, choices: [], answer: 0, answers } : null;
}

export function parseEscapeSet(text: string, file: string): EscapeSet {
  let data: unknown;
  try {
    data = parse(text);
  } catch (e) {
    const line = e instanceof YAMLParseError ? e.linePos?.[0]?.line : undefined;
    throw new Error(`YAML 문법이 맞지 않습니다${line ? `(${line}번째 줄)` : ''}. 들여쓰기와 콜론(:)을 확인합니다.`);
  }
  const root = objectOf(data) ?? {};
  const title = textOf(root.title) || file.replace(/\.ya?ml$/i, '');
  const errors: string[] = [];

  const items: Record<string, string> = {};
  for (const [id, name] of Object.entries(objectOf(root.items) ?? {})) {
    if (!textOf(name)) errors.push(`items의 ${id}: 이름이 비어 있습니다.`);
    items[id] = textOf(name);
  }

  const hints: HintCard[] = [];
  for (const [id, raw] of Object.entries(objectOf(root.hints) ?? {})) {
    const h = objectOf(raw) ?? {};
    const card = { id, title: textOf(h.title), text: textOf(h.text) };
    if (!card.title || !card.text) errors.push(`hints의 ${id}: title(제목)과 text(글)를 씁니다.`);
    hints.push(card);
  }
  const hintIds = new Set(hints.map((h) => h.id));

  const missions = new Map<string, Mission>();
  const rawMissions = objectOf(root.missions) ?? {};
  if (!Object.keys(rawMissions).length) errors.push('missions에 미션이 없습니다.');
  for (const [id, raw] of Object.entries(rawMissions)) {
    const m = objectOf(raw) ?? {};
    const where = `${id} 미션`;
    const before = errors.length;
    const type = textOf(m.type) as MissionType;
    const objects = MAP_MISSIONS.get(id);
    const kinds = objects?.map((o) => o.kind);
    if (!objects) errors.push(`${where}: 맵(school.json)에 mission이 "${id}"인 사물이 없습니다.`);
    if (!MISSION_TYPES.includes(type)) errors.push(`${where}: type은 ${MISSION_TYPES.join(', ')} 가운데 하나로 씁니다.`);
    if (type === 'open' && kinds?.some((k) => !(DOOR_KINDS as readonly string[]).includes(k))) {
      errors.push(`${where}: open(문) 미션은 맵의 문 사물(${DOOR_KINDS.join(', ')})에만 둡니다.`);
    }
    const requires = textOf(m.requires);
    const gives = textOf(m.gives);
    const hint = textOf(m.hint);
    if (requires && !(requires in items)) errors.push(`${where}: requires의 아이템 "${requires}"가 items에 없습니다.`);
    if (gives && !(gives in items)) errors.push(`${where}: gives의 아이템 "${gives}"가 items에 없습니다.`);
    if (hint && !hintIds.has(hint)) errors.push(`${where}: hint의 힌트 카드 "${hint}"가 hints에 없습니다.`);
    if (m.example !== undefined && typeof m.example !== 'boolean') errors.push(`${where}: example은 true 또는 false로 씁니다.`);

    const text = textOf(m.text);
    let quiz: MissionQuiz | null = null;
    const classes: Partial<Record<string, MissionQuiz>> = {};
    const rawClasses = objectOf(m.classes);
    if (m.classes !== undefined) {
      if (!rawClasses || !Object.keys(rawClasses).length) errors.push(`${where}: classes(반 자물쇠)에는 반마다 문제를 씁니다.`);
      for (const [cls, q] of Object.entries(rawClasses ?? {})) {
        if (!CLASS_IDS.includes(cls)) {
          errors.push(`${where}: classes의 반은 ${CLASS_IDS.join(', ')} 가운데에서 씁니다("${cls}"는 모릅니다).`);
          continue;
        }
        const parsed = parseQuiz(objectOf(q) ?? {}, `${where}(${cls})`, errors);
        if (parsed) classes[cls] = parsed;
      }
    } else if (m.question !== undefined) {
      quiz = parseQuiz(m, where, errors);
    }
    const hasQuiz = m.classes !== undefined || m.question !== undefined;
    if (type === 'clue' && !text) errors.push(`${where}: clue(단서) 미션은 text(글)를 씁니다.`);
    if (hasQuiz && !['quiz', 'open', 'exit'].includes(type)) {
      errors.push(`${where}: question·classes(문제)는 quiz, open, exit 미션에만 씁니다.`);
    }
    if (type === 'quiz' && !hasQuiz) errors.push(`${where}: quiz 미션은 question(문제)이나 classes(반 자물쇠)를 씁니다.`);

    // 숫자 자물쇠: 번호는 0으로 시작할 수 있어 글(큰따옴표)로 받는다.
    let code = '';
    if (type === 'code') {
      if (typeof m.code === 'number') errors.push(`${where}: code(번호)는 큰따옴표로 감싸 씁니다. 예: code: "0412"`);
      code = typeof m.code === 'string' ? m.code.trim() : '';
      if (typeof m.code !== 'number' && !new RegExp(`^\\d{1,${MAX_CODE_DIGITS}}$`).test(code)) {
        errors.push(`${where}: code(번호)는 숫자 1~${MAX_CODE_DIGITS}자리로 씁니다.`);
      }
    }
    if (type === 'pickup' && !gives) errors.push(`${where}: pickup(줍기) 미션은 gives(주울 아이템)를 씁니다.`);
    const needs = Array.isArray(m.needs) ? m.needs.map(textOf) : m.needs === undefined ? [] : [textOf(m.needs)];
    if (type === 'deliver') {
      if (!needs.length) errors.push(`${where}: deliver(가져다주기) 미션은 needs(가져올 아이템 목록)를 씁니다.`);
      for (const n of needs) if (!(n in items)) errors.push(`${where}: needs의 아이템 "${n}"가 items에 없습니다.`);
    }
    const order = Array.isArray(m.order) ? m.order.map(textOf) : [];
    const texts: Record<string, string> = {};
    if (type === 'order') {
      const own = new Set(objects?.map((o) => o.id) ?? []);
      if (order.length < 2) errors.push(`${where}: order(순서)는 맵 사물 id를 2개 이상 [사물1, 사물2]처럼 씁니다.`);
      for (const o of order) {
        if (!own.has(o)) errors.push(`${where}: order의 "${o}"는 맵에서 mission이 "${id}"인 사물이 아닙니다.`);
      }
      for (const [o, t] of Object.entries(objectOf(m.texts) ?? {})) {
        if (!own.has(o)) errors.push(`${where}: texts의 "${o}"는 맵에서 mission이 "${id}"인 사물이 아닙니다.`);
        texts[o] = textOf(t);
      }
    }
    if (errors.length !== before) continue;
    missions.set(id, {
      id,
      type,
      text,
      quiz,
      classes,
      requires,
      locked: textOf(m.locked),
      gives,
      hint,
      done: textOf(m.done),
      example: m.example === true,
      after: textOf(m.after),
      code,
      needs,
      order,
      texts,
    });
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return { file, title, items, hints, missions };
}

/** 이 학생(반)에게 낼 문제. 반 자물쇠에서 학생의 반 문제가 없으면(선생님, 반 없음) 반 목록 순서로 처음 있는 문제 */
export function quizFor(m: Mission, classGroup: string): MissionQuiz | null {
  if (m.quiz) return m.quiz;
  return m.classes[classGroup] ?? CLASS_IDS.map((c) => m.classes[c]).find((q) => q !== undefined) ?? null;
}

/** 낸 답이 맞는지. 객관식은 보기 번호(1부터)를 글로 받는다. 단답형은 골든벨과 같은 규칙(matchAnswer)으로 본다. */
export function checkQuiz(q: MissionQuiz, answer: string): boolean {
  if (q.choices.length) return Number(answer) === q.answer;
  return matchAnswer(answer, q.answers);
}
