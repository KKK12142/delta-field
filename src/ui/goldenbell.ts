import { GB_MAX_ANSWER } from '../../shared/goldenbell.ts';
import type { AnswerGroup, CardView, MineView, PanelView } from '../game/goldenbell';
import { el, uiRoot } from './dom';

/** 글이 달라졌을 때만 바꾼다(매 프레임 불러도 화면이 흔들리지 않게). */
function setText(node: HTMLElement, text: string) {
  if (node.textContent !== text) node.textContent = text;
  node.hidden = text === '';
}

/** 목록이 달라졌을 때만 다시 만든다. */
function setList(list: HTMLElement, rows: string[]) {
  const key = rows.join('\n');
  if (list.dataset.key === key) return;
  list.dataset.key = key;
  list.replaceChildren(...rows.map((r) => el('li', '', r)));
  list.hidden = rows.length === 0;
}

const MARK: Record<AnswerGroup['mark'], string> = { correct: '정답', accepted: '선생님이 인정', wrong: '오답', none: '오답' };

/** 골든벨 위쪽: 문제 카드(왼쪽)와 내 상태(오른쪽, 학생만) */
export class GbHud {
  private readonly top = el('div', 'df-hud df-gb');
  private readonly head = el('span', 'df-muted');
  private readonly question = el('strong', 'df-gb-question');
  private readonly line = el('span', 'df-text');
  private readonly result = el('span', 'df-text df-gb-result');
  private readonly ranking = el('ol', 'df-gb-ranking');
  private readonly mine = el('div', 'df-hud-box');
  private readonly lives = el('strong', '');
  private readonly score = el('span', 'df-text');
  private readonly where = el('span', 'df-muted');
  private readonly status = el('span', 'df-status');
  /** 단답형 답 칸(학생) */
  private readonly answerForm = el('form', 'df-row df-gb-answer-form');
  private readonly answerInput = el('input', 'df-input df-gb-answer-input');
  private readonly answerButton = el('button', 'df-button', '내기');
  private readonly answerSent = el('span', 'df-text');
  private readonly answerError = el('span', 'df-error');
  private readonly explain = el('span', 'df-text df-gb-explain');
  private answerShown = false;

  /** onSubmit: 학생이 단답형 답을 냈을 때(빈 글은 부르지 않는다) */
  constructor(teacher: boolean, onSubmit: (text: string) => void = () => {}) {
    const card = el('div', 'df-hud-box df-gb-card');
    this.answerInput.type = 'text';
    this.answerInput.maxLength = GB_MAX_ANSWER;
    this.answerInput.placeholder = '답을 씁니다';
    this.answerInput.autocomplete = 'off';
    this.answerInput.setAttribute('aria-label', '단답형 답');
    // 글을 쓰는 동안 W·A·S·D, 화살표, 빈칸 키가 캐릭터를 움직이거나 게임이 키를 가로채지 않게 한다.
    for (const type of ['keydown', 'keyup'] as const) this.answerInput.addEventListener(type, (e) => e.stopPropagation());
    this.answerButton.type = 'submit';
    this.answerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.answerInput.value.trim();
      if (text) onSubmit(text);
      // 낸 뒤에는 방향키로 다시 걸을 수 있게 칸에서 나온다(칸을 누르면 고쳐 쓸 수 있다).
      this.answerInput.blur();
    });
    this.answerForm.append(this.answerInput, this.answerButton);
    this.answerForm.hidden = true;
    this.answerSent.hidden = true;
    this.answerError.hidden = true;
    card.append(
      this.head,
      this.question,
      this.line,
      this.answerForm,
      this.answerSent,
      this.answerError,
      this.result,
      this.explain,
      this.ranking,
      this.status,
    );
    this.mine.append(this.lives, this.score, this.where);
    this.mine.hidden = teacher;
    // 선생님은 오른쪽을 골든벨 창이 쓴다.
    this.top.classList.toggle('has-panel', teacher);
    this.top.append(card, this.mine);
    this.status.hidden = true;
    uiRoot().append(this.top);
  }

  /** 안내 아래 끝의 화면 y 좌표(픽셀). 지도를 이 아래에 놓을 때 쓴다. */
  get bottom() {
    return this.top.getBoundingClientRect().bottom;
  }

  showCard(v: CardView) {
    if (v.answerBox !== this.answerShown) {
      // 새 단답형 문제가 시작되거나 끝나면 칸을 비운다.
      this.answerShown = v.answerBox;
      this.answerForm.hidden = !v.answerBox;
      this.answerInput.value = '';
      this.setSent('');
      if (!v.answerBox) this.answerInput.blur();
    }
    setText(this.head, v.head);
    setText(this.question, v.question);
    setText(this.line, v.line);
    setText(this.result, v.result);
    setText(this.explain, v.explain);
    this.result.classList.toggle('is-good', v.tone === 'good');
    this.result.classList.toggle('is-bad', v.tone === 'bad');
    setList(this.ranking, v.ranking);
  }

  showMine(v: MineView) {
    setText(this.lives, v.lives);
    setText(this.score, v.score);
    setText(this.where, v.where);
  }

  setStatus(text: string | null) {
    setText(this.status, text ?? '');
  }

  /** 서버가 받은 내 단답형 답(빈 글이면 감춘다)과 내지 못한 까닭 */
  setSent(text: string, error = '') {
    if (text || !error) setText(this.answerSent, text ? `낸 답: ${text} · 시간 안에는 고쳐 낼 수 있습니다.` : '');
    setText(this.answerError, error);
  }

  /** 답 칸에 글자를 쓰게 한다(키보드가 있는 기기에서 문제가 시작될 때). */
  focusAnswer() {
    if (!this.answerForm.hidden) this.answerInput.focus();
  }

  /** 답을 보내는 동안 내기 단추를 잠근다. */
  setSending(sending: boolean) {
    this.answerButton.disabled = sending;
  }

  destroy() {
    this.top.remove();
  }
}

/** 선생님 오른쪽 창: 진행 상황, 다음 문제·끝내기 단추, 끝난 뒤 순위 */
export class GbPanel {
  private readonly node = el('aside', 'df-cctv df-gb-panel');
  private readonly title = el('strong', '');
  private readonly status = el('span', 'df-text');
  private readonly counts = el('div', 'df-cctv-title');
  private readonly next = el('button', 'df-button');
  private readonly ranking = el('ol', 'df-gb-ranking df-cctv-list');
  private readonly end = el('button', 'df-button df-button-small', '골든벨 끝내기');
  /** 단답형 정답 공개 뒤 낸 답 묶음 */
  private readonly answers = el('ul', 'df-gb-answers df-cctv-list');
  private readonly onAccept: (key: string, accept: boolean) => void;

  constructor(handlers: { next: () => void; end: () => void; accept: (key: string, accept: boolean) => void }) {
    this.onAccept = handlers.accept;
    const head = el('div', 'df-cctv-title');
    head.append(this.title, this.status);
    this.next.addEventListener('click', () => {
      this.next.blur();
      handlers.next();
    });
    this.end.addEventListener('click', () => {
      this.end.blur();
      handlers.end();
    });
    const row = el('div', 'df-row df-row-split');
    row.append(this.end, this.next);
    this.node.setAttribute('aria-label', '골든벨 진행');
    this.answers.hidden = true;
    this.node.append(head, this.counts, row, this.answers, this.ranking);
    uiRoot().append(this.node);
  }

  /** 창 왼쪽 끝의 화면 x 좌표(픽셀) */
  get left() {
    return this.node.getBoundingClientRect().left;
  }

  show(v: PanelView, waiting: boolean) {
    setText(this.title, v.title);
    setText(this.status, v.status);
    const key = v.counts.join('\n');
    if (this.counts.dataset.key !== key) {
      this.counts.dataset.key = key;
      this.counts.replaceChildren(...v.counts.map((c) => el('span', 'df-muted', c)));
    }
    this.next.hidden = v.next === null;
    if (v.next) {
      setText(this.next, v.next.label);
      this.next.disabled = !v.next.enabled || waiting;
    }
    this.end.disabled = waiting;
    setList(this.ranking, v.ranking);
    this.showAnswers(v.answers, waiting);
  }

  /** 낸 답 묶음: 답, 학생 수와 채점, 낸 학생, 정답 인정·인정 취소 단추 */
  private showAnswers(groups: AnswerGroup[], waiting: boolean) {
    const key = JSON.stringify(groups);
    if (this.answers.dataset.key !== key) {
      this.answers.dataset.key = key;
      this.answers.replaceChildren(
        ...groups.map((g) => {
          const li = el('li', `df-gb-answer is-${g.mark}`);
          const head = el('div', 'df-row df-row-split');
          head.append(el('strong', 'df-gb-answer-text', g.text), el('span', 'df-muted', `${g.names.length}명 · ${MARK[g.mark]}`));
          li.append(head, el('span', 'df-muted', g.names.join(', ')));
          if (g.mark === 'wrong' || g.mark === 'accepted') {
            const accept = g.mark === 'wrong';
            const button = el('button', 'df-button df-button-small', accept ? '정답으로 인정' : '인정 거두기');
            button.addEventListener('click', () => {
              button.blur();
              this.onAccept(g.key, accept);
            });
            li.append(button);
          }
          return li;
        }),
      );
      this.answers.hidden = groups.length === 0;
    }
    for (const b of this.answers.querySelectorAll('button')) b.disabled = waiting;
  }

  destroy() {
    this.node.remove();
  }
}
