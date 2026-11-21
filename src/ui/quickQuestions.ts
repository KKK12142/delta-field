// 선생님 창에서 바로 문제 내기(design/quick-specs/emote-sfx-quick-questions-2026-11-22.md).
// - openQuickSet: 강당으로 모으기에서 "바로 내기"를 고르면 뜨는 창. 한 문제씩 쓰거나 여러 줄을 붙여 넣어 목록을 만들고 서버에 보낸다(gbQuickSet).
//   서버가 받으면 이 브라우저의 "내 문제"(localStorage)에 남겨 다음에 다시 고를 수 있다.
// - openQuickOne: 골든벨 중 즉석 문제 하나(gbQuickAdd). 지금 문제 바로 뒤에 들어간다.
// 형식 확인은 서버와 같은 규칙(shared/quickQuestions.ts)이고, 서버가 한 번 더 확인한다. 정답은 서버만 갖는다(학생 화면에 가지 않음).
import {
  QUICK_DEFAULT_SECONDS,
  QUICK_DEFAULT_TITLE,
  QUICK_MAX_ANSWERS,
  QUICK_MAX_CHOICE,
  QUICK_MAX_EXPLAIN,
  QUICK_MAX_QUESTION,
  QUICK_MAX_QUESTIONS,
  QUICK_MAX_SECONDS,
  QUICK_MAX_TITLE,
  QUICK_MIN_SECONDS,
  checkQuickQuestion,
  checkQuickSet,
  parsePaste,
  splitAnswers,
  type QuickAddMessage,
  type QuickQuestion,
  type QuickReply,
  type QuickSetMessage,
} from '../../shared/quickQuestions.ts';
import type { GbQuestionType } from '../../shared/goldenbell.ts';
import type { Net } from '../net/connection';
import { el, uiRoot } from './dom';
import './feature.css';

const STORE_KEY = 'df-quick-sets';
const MAX_SAVED = 20;
const TYPE_NAMES: Record<GbQuestionType, string> = { ox: 'OX', choice: '객관식', short: '단답형' };
const NO_REPLY = '서버에서 답을 받지 못했습니다. 잠시 뒤 다시 누릅니다.';

export const PASTE_HELP = [
  '한 줄에 한 문제, 칸은 |로 나눕니다. 해설은 없어도 됩니다. 끝 칸에 "30초"처럼 쓰면 그 문제의 제한 시간입니다.',
  'OX: 문제 | O | 해설',
  '객관식: 문제 | 보기1 / 보기2 / 보기3 / 보기4 | 2 | 해설',
  '단답형: 문제 | =답1, 답2 | 해설',
  '보기에 m/s처럼 /가 들어가면 보기 사이를 앞뒤 빈칸이 있는 " / "로 나눕니다.',
].join('\n');

/** 이 브라우저에 남긴 바로 낸 문제 묶음 */
export interface SavedSet {
  title: string;
  savedAt: number;
  questions: QuickQuestion[];
}

/** 저장한 "내 문제"를 읽는다(형식이 틀린 묶음은 버린다). 못 읽으면 빈 목록 */
export function loadSaved(): SavedSet[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    const out: SavedSet[] = [];
    for (const item of raw) {
      const r = checkQuickSet(item);
      if (Array.isArray(r)) continue;
      out.push({ title: r.title, questions: r.questions, savedAt: Number((item as { savedAt?: unknown }).savedAt) || 0 });
    }
    return out;
  } catch {
    return [];
  }
}

function writeSaved(list: SavedSet[]) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, MAX_SAVED)));
  } catch {
    // 저장하지 못해도 문제 내기는 그대로 된다.
  }
}

/** 같은 제목의 묶음은 바꾸고, 새 것은 맨 앞에 넣는다. */
export function saveSet(title: string, questions: QuickQuestion[]) {
  const list = loadSaved().filter((s) => s.title !== title);
  list.unshift({ title, questions, savedAt: Date.now() });
  writeSaved(list);
}

function removeSaved(title: string) {
  writeSaved(loadSaved().filter((s) => s.title !== title));
}

/** 목록에 보일 한 줄 요약(정답 포함, 선생님 화면에만) */
export function summary(q: QuickQuestion): string {
  const answer = q.type === 'ox' ? q.answer : q.type === 'choice' ? `${q.answer}번(${q.choices[Number(q.answer) - 1]})` : q.answers.join(', ');
  return `${TYPE_NAMES[q.type]} · 정답 ${answer} · ${q.seconds}초${q.explain ? ' · 해설 있음' : ''}`;
}

/** 창 틀: 대화상자와 같은 겉모양(df-dialog, df-panel). Esc로 닫는다. */
function frame(title: string, onEscape: () => void) {
  const node = el('div', 'df-dialog');
  const panel = el('div', 'df-panel df-fx-quick');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', title);
  panel.append(el('h2', 'df-title', title));
  node.append(panel);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onEscape();
  };
  window.addEventListener('keydown', onKey);
  uiRoot().append(node);
  return {
    panel,
    close() {
      window.removeEventListener('keydown', onKey);
      node.remove();
    },
  };
}

function field(label: string, input: HTMLElement) {
  const wrap = el('label', 'df-fx-field');
  wrap.append(el('span', 'df-muted', label), input);
  return wrap;
}

function input(placeholder: string, maxLength: number) {
  const i = el('input', 'df-input');
  i.type = 'text';
  i.placeholder = placeholder;
  i.maxLength = maxLength;
  i.autocomplete = 'off';
  return i;
}

function button(text: string, className = 'df-button df-button-small df-button-light') {
  const b = el('button', className, text);
  b.type = 'button';
  return b;
}

/** 누름 단추 묶음(하나만 고름). 고른 값은 value */
function toggleGroup<T extends string>(options: readonly { value: T; label: string }[], initial: T, onPick: (v: T) => void = () => {}) {
  const node = el('div', 'df-fx-types');
  node.setAttribute('role', 'group');
  let value = initial;
  const buttons = options.map((o) => {
    const b = button(o.label);
    b.addEventListener('click', () => set(o.value));
    node.append(b);
    return { b, v: o.value };
  });
  const set = (v: T) => {
    value = v;
    for (const x of buttons) x.b.setAttribute('aria-pressed', String(x.v === v));
    onPick(v);
  };
  for (const x of buttons) x.b.setAttribute('aria-pressed', String(x.v === initial));
  return {
    node,
    get value() {
      return value;
    },
    set,
  };
}

/** 한 문제 쓰기 칸(종류·문제·정답·해설·제한 시간). read()는 확인한 문제나 까닭 글 */
function questionForm() {
  const node = el('div', 'df-fx-field');
  const question = el('textarea', 'df-input');
  question.rows = 2;
  question.maxLength = QUICK_MAX_QUESTION;
  question.placeholder = '문제를 씁니다';
  const choiceInputs = [1, 2, 3, 4].map((n) => input(`보기 ${n}${n > 2 ? '(없어도 됨)' : ''}`, QUICK_MAX_CHOICE));
  const shortAnswer = input('정답(여럿이면 쉼표로 나눕니다)', 200);
  const explain = input('해설(없어도 됩니다)', QUICK_MAX_EXPLAIN);
  const seconds = el('input', 'df-input');
  seconds.type = 'number';
  seconds.min = String(QUICK_MIN_SECONDS);
  seconds.max = String(QUICK_MAX_SECONDS);
  seconds.value = String(QUICK_DEFAULT_SECONDS);
  const ox = toggleGroup(
    [
      { value: 'O', label: 'O' },
      { value: 'X', label: 'X' },
    ] as const,
    'O',
  );
  const choiceAnswer = toggleGroup(
    (['1', '2', '3', '4'] as const).map((v) => ({ value: v, label: `${v}번` })),
    '1',
  );
  const oxBox = field('정답', ox.node);
  const choiceBox = el('div', 'df-fx-field');
  const grid = el('div', 'df-fx-grid');
  grid.append(...choiceInputs);
  choiceBox.append(grid, field('정답 보기', choiceAnswer.node));
  const shortBox = field('정답', shortAnswer);
  const type = toggleGroup(
    (['ox', 'choice', 'short'] as const).map((v) => ({ value: v, label: TYPE_NAMES[v] })),
    'ox',
    (v) => {
      oxBox.hidden = v !== 'ox';
      choiceBox.hidden = v !== 'choice';
      shortBox.hidden = v !== 'short';
    },
  );
  type.set('ox');
  const bottom = el('div', 'df-fx-grid');
  bottom.append(field('해설', explain), field(`제한 시간(초, ${QUICK_MIN_SECONDS}~${QUICK_MAX_SECONDS})`, seconds));
  node.append(field('종류', type.node), field('문제', question), oxBox, choiceBox, shortBox, bottom);
  return {
    node,
    read(): QuickQuestion | string {
      const t = type.value;
      const choices = choiceInputs.map((i) => i.value.trim());
      // 빈 보기는 뒤에서부터만 뺀다(가운데가 비면 틀린 것으로 알린다).
      while (choices.length > 2 && !choices[choices.length - 1]) choices.pop();
      return checkQuickQuestion({
        type: t,
        question: question.value,
        answer: t === 'ox' ? ox.value : choiceAnswer.value,
        choices,
        answers: splitAnswers(shortAnswer.value).slice(0, QUICK_MAX_ANSWERS + 1),
        explain: explain.value,
        seconds: Number(seconds.value),
      });
    },
    /** 더한 뒤 다음 문제를 쓰게 비운다(종류·제한 시간은 그대로) */
    clear() {
      question.value = '';
      for (const i of choiceInputs) i.value = '';
      shortAnswer.value = '';
      explain.value = '';
      question.focus();
    },
    get seconds() {
      const n = Number(seconds.value);
      return Number.isInteger(n) && n >= QUICK_MIN_SECONDS && n <= QUICK_MAX_SECONDS ? n : QUICK_DEFAULT_SECONDS;
    },
    focus() {
      question.focus();
    },
  };
}

/** 까닭 목록(빨간 글) */
function errorList() {
  const node = el('ul', 'df-fx-errors');
  node.setAttribute('role', 'alert');
  node.hidden = true;
  return {
    node,
    show(lines: string[]) {
      node.replaceChildren(...lines.map((l) => el('li', '', l)));
      node.hidden = lines.length === 0;
      // 창이 길어 아래에 있으면 보이게 넘긴다.
      if (lines.length) node.scrollIntoView({ block: 'nearest' });
    },
  };
}

/**
 * 강당으로 모으기의 "바로 내기": 문제 목록을 만들어 서버에 보낸다. 서버가 받으면 { title, count }, 닫으면 null.
 * 받은 묶음은 이 브라우저의 "내 문제"에 남긴다.
 */
export function openQuickSet(net: Net): Promise<{ title: string; count: number } | null> {
  return new Promise((resolve) => {
    let questions: QuickQuestion[] = [];
    let busy = false;
    const win = frame('바로 내기', () => finish(null));
    const finish = (result: { title: string; count: number } | null) => {
      win.close();
      resolve(result);
    };
    const { panel } = win;
    panel.append(el('p', 'df-text', '문제 파일 없이 여기서 쓰거나 붙여 넣은 문제로 골든벨을 합니다. 문제와 정답은 이 방의 서버에만 두고 파일로 남기지 않습니다.'));

    const title = input(QUICK_DEFAULT_TITLE, QUICK_MAX_TITLE);
    panel.append(field('제목', title));

    // 지금 목록
    const listTitle = el('strong', '');
    const list = el('ol', 'df-fx-list');
    const clearAll = button('목록 모두 지우기');
    const listHead = el('div', 'df-row df-row-split');
    listHead.append(listTitle, clearAll);
    const listSection = el('section', 'df-fx-section');
    listSection.append(listHead, list);
    const renderList = () => {
      listTitle.textContent = `지금 목록 ${questions.length}문제`;
      clearAll.hidden = questions.length === 0;
      list.replaceChildren(
        ...questions.map((q, i) => {
          const li = el('li');
          const text = el('span', 'df-text');
          text.append(q.question, el('span', 'df-muted', summary(q)));
          const remove = button('지우기');
          remove.setAttribute('aria-label', `${i + 1}번 문제 지우기`);
          remove.addEventListener('click', () => {
            questions = questions.filter((_, j) => j !== i);
            renderList();
          });
          li.append(el('span', 'df-muted', `${i + 1}`), text, remove);
          return li;
        }),
      );
      list.hidden = questions.length === 0;
      send.disabled = questions.length === 0;
    };
    clearAll.addEventListener('click', () => {
      questions = [];
      renderList();
    });
    const notice = el('p', 'df-fx-ok');
    notice.setAttribute('role', 'status');
    notice.hidden = true;
    const say = (text: string) => {
      notice.textContent = text;
      notice.hidden = !text;
    };
    /** 목록에 더한다(상한을 넘으면 더하지 않고 까닭) */
    const add = (more: QuickQuestion[]): string | null => {
      if (questions.length + more.length > QUICK_MAX_QUESTIONS) return `문제는 ${QUICK_MAX_QUESTIONS}개까지 넣을 수 있습니다(지금 ${questions.length}문제).`;
      questions = [...questions, ...more];
      renderList();
      say(`${more.length}문제를 목록에 더했습니다.`);
      return null;
    };

    // 한 문제씩 쓰기
    const form = questionForm();
    const formErrors = errorList();
    const addOne = button('목록에 더하기', 'df-button df-button-small');
    addOne.addEventListener('click', () => {
      const q = form.read();
      if (typeof q === 'string') return formErrors.show([q]);
      const full = add([q]);
      formErrors.show(full ? [full] : []);
      if (!full) form.clear();
    });
    const one = el('section', 'df-fx-section');
    const oneRow = el('div', 'df-row');
    oneRow.append(addOne);
    one.append(el('strong', '', '한 문제씩 쓰기'), form.node, formErrors.node, oneRow);

    // 여러 줄 붙여넣기
    const paste = el('textarea', 'df-input df-fx-paste');
    paste.placeholder = '물체의 운동 상태를 유지하려는 성질은 관성이다 | O | 뉴턴 제1법칙\n힘의 단위는? | N / J / W / Pa | 1\n빛의 속력은 약 몇 m/s? | =3×10^8 m/s, 3억 m/s | 30초';
    paste.setAttribute('aria-label', '여러 줄 붙여넣기');
    const pasteErrors = errorList();
    const addPaste = button('목록에 더하기', 'df-button df-button-small');
    addPaste.addEventListener('click', () => {
      const lines = parsePaste(paste.value, form.seconds);
      if (!lines.length) return pasteErrors.show(['붙여 넣은 문제가 없습니다.']);
      const errors = lines.flatMap((l) => ('error' in l ? [`${l.line}번째 줄: ${l.error}`] : []));
      if (errors.length) return pasteErrors.show([`형식이 틀린 줄이 있어 하나도 더하지 않았습니다(${errors.length}줄).`, ...errors]);
      const full = add(lines.flatMap((l) => ('question' in l ? [l.question] : [])));
      pasteErrors.show(full ? [full] : []);
      if (!full) paste.value = '';
    });
    const many = el('section', 'df-fx-section');
    const manyRow = el('div', 'df-row');
    manyRow.append(addPaste);
    many.append(
      el('strong', '', '여러 줄 붙여넣기'),
      el('p', 'df-fx-help', `${PASTE_HELP}\n제한 시간을 쓰지 않은 줄은 위 "한 문제씩 쓰기"의 제한 시간을 씁니다.`),
      paste,
      pasteErrors.node,
      manyRow,
    );

    // 내 문제(이 브라우저)
    const saved = el('section', 'df-fx-section df-fx-saved');
    const renderSaved = () => {
      const sets = loadSaved();
      saved.replaceChildren(el('strong', '', '내 문제(이 브라우저에 남긴 묶음)'));
      if (!sets.length) {
        saved.append(el('p', 'df-muted', '아직 없습니다. 바로 낸 문제는 여기에 남아 다음에 다시 고를 수 있습니다.'));
        return;
      }
      const rows = el('ul', 'df-fx-list');
      for (const s of sets) {
        const li = el('li');
        const load = button(`${s.title} (${s.questions.length}문제)`);
        load.addEventListener('click', () => {
          title.value = s.title;
          questions = s.questions.slice(0, QUICK_MAX_QUESTIONS);
          renderList();
          say(`"${s.title}"을(를) 불러왔습니다.`);
        });
        const remove = button('지우기');
        remove.setAttribute('aria-label', `${s.title} 지우기`);
        remove.addEventListener('click', () => {
          removeSaved(s.title);
          renderSaved();
        });
        li.append(el('span', 'df-muted', new Date(s.savedAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })), load, remove);
        rows.append(li);
      }
      saved.append(rows);
    };

    const sendErrors = errorList();
    const close = button('닫기', 'df-button df-button-light');
    const send = button('이 문제로 골든벨', 'df-button df-button-gold');
    close.addEventListener('click', () => finish(null));
    send.addEventListener('click', async () => {
      if (busy || !questions.length) return;
      busy = true;
      send.disabled = true;
      const message: QuickSetMessage = { title: title.value.trim() || QUICK_DEFAULT_TITLE, questions };
      try {
        const reply: QuickReply = await net.room.request('gbQuickSet', message);
        if (reply.error) {
          sendErrors.show(reply.error.split('\n'));
          return;
        }
        saveSet(message.title, questions);
        finish({ title: message.title, count: reply.count ?? questions.length });
      } catch {
        sendErrors.show([NO_REPLY]);
      } finally {
        busy = false;
        send.disabled = questions.length === 0;
      }
    });
    const row = el('div', 'df-row');
    row.append(close, send);
    panel.append(one, many, listSection, notice, saved, sendErrors.node, row);
    renderList();
    renderSaved();
    form.focus();
  });
}

/** 골든벨 중 즉석 문제 하나를 써서 낸다. 서버가 받으면 그 답(started: 바로 시작했는지), 닫으면 null */
export function openQuickOne(net: Net): Promise<QuickReply | null> {
  return new Promise((resolve) => {
    let busy = false;
    const win = frame('즉석 문제', () => finish(null));
    const finish = (r: QuickReply | null) => {
      win.close();
      resolve(r);
    };
    const { panel } = win;
    panel.append(el('p', 'df-text', '지금 문제 바로 뒤에 넣습니다. 첫 문제 전이나 정답 공개 뒤면 바로 시작하고, 푸는 중이면 다음 문제로 나옵니다.'));
    const form = questionForm();
    const errors = errorList();
    const close = button('닫기', 'df-button df-button-light');
    const send = button('지금 내기', 'df-button df-button-gold');
    close.addEventListener('click', () => finish(null));
    send.addEventListener('click', async () => {
      if (busy) return;
      const q = form.read();
      if (typeof q === 'string') return errors.show([q]);
      busy = true;
      send.disabled = true;
      try {
        const message: QuickAddMessage = { question: q };
        const reply: QuickReply = await net.room.request('gbQuickAdd', message);
        if (reply.error) errors.show([reply.error]);
        else finish(reply);
      } catch {
        errors.show([NO_REPLY]);
      } finally {
        busy = false;
        send.disabled = false;
      }
    });
    const row = el('div', 'df-row');
    row.append(close, send);
    panel.append(form.node, errors.node, row);
    form.focus();
  });
}
