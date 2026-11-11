import type { CardView, MineView, PanelView } from '../game/goldenbell';
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

  constructor(teacher: boolean) {
    const card = el('div', 'df-hud-box df-gb-card');
    card.append(this.head, this.question, this.line, this.result, this.ranking, this.status);
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
    setText(this.head, v.head);
    setText(this.question, v.question);
    setText(this.line, v.line);
    setText(this.result, v.result);
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

  constructor(handlers: { next: () => void; end: () => void }) {
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
    this.node.append(head, this.counts, row, this.ranking);
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
  }

  destroy() {
    this.node.remove();
  }
}
