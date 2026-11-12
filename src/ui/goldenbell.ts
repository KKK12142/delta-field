import { GB_MAX_ANSWER } from '../../shared/goldenbell.ts';
import type { AnswerGroup, CardView, MineView, PanelView, RankRow } from '../game/goldenbell';
import { timeBar } from '../theme';
import { el, uiRoot } from './dom';
import { face, uiIcon } from './pictures';

/** 1·2·3위 메달(public/sprites/ui/medal-*.png) */
const MEDAL: Record<number, string> = { 1: 'medal-gold', 2: 'medal-silver', 3: 'medal-bronze' };
/** 목숨 글자를 그림으로(public/sprites/ui): ♥ 남은 목숨, ♡ 잃은 목숨, 💀 탈락 */
const LIFE_ICON: Record<string, string> = { '♥': 'heart', '♡': 'heart-empty', '💀': 'skull' };

/** 글이 달라졌을 때만 바꾼다(매 프레임 불러도 화면이 흔들리지 않게). */
function setText(node: HTMLElement, text: string) {
  if (node.textContent !== text) node.textContent = text;
  node.hidden = text === '';
}

/**
 * 순위: 위에 1·2·3위 시상대(얼굴), 아래에 한 줄씩 "1위 닉네임 3점"(얼굴). 내 줄은 강조한다.
 * 목록이 달라졌을 때만 다시 만든다. podium은 시상대 자리, list는 줄 목록(ol)
 */
function setRanking(podium: HTMLElement, list: HTMLElement, rows: RankRow[]) {
  const key = JSON.stringify(rows);
  if (list.dataset.key === key) return;
  list.dataset.key = key;
  list.replaceChildren(
    ...rows.map((r) => {
      const li = el('li', r.me ? 'df-rank is-me' : 'df-rank');
      // 글 사이의 빈칸은 글로 넣는다(화면을 읽는 쪽에서 "1위 가람 9점"으로 읽히게).
      const medal = MEDAL[r.rank] ? uiIcon('ui', MEDAL[r.rank], 'df-rank-medal') : el('span', 'df-rank-medal');
      li.append(medal, face(r.character, 'df-rank-face'), el('span', 'df-rank-no', `${r.rank}위`), ' ', el('span', 'df-rank-name', r.nickname), ' ', el('span', 'df-rank-score', `${r.score}점`));
      return li;
    }),
  );
  list.hidden = rows.length === 0;
  // 시상대: 순위 목록의 앞 세 사람을 가운데(첫째), 왼쪽(둘째), 오른쪽(셋째)에 놓고 등수를 적는다(같은 점수면 같은 등수).
  podium.replaceChildren(
    ...[1, 0, 2].map((i) => {
      const place = el('div', `df-podium-place is-${i + 1}`);
      const r = rows[i];
      if (!r) return place;
      if (MEDAL[r.rank]) place.append(uiIcon('ui', MEDAL[r.rank], 'df-podium-medal'));
      place.append(face(r.character, 'df-podium-face'), el('span', r.me ? 'df-podium-name is-me' : 'df-podium-name', r.nickname));
      place.append(el('span', 'df-podium-step', String(r.rank)));
      return place;
    }),
  );
  podium.hidden = rows.length === 0;
}

/** 순위 줄 목록만(시상대 없이): 합산 순위에 쓴다. 줄 모양은 setRanking과 같다. */
function setRankList(list: HTMLElement, rows: RankRow[]) {
  const key = JSON.stringify(rows);
  if (list.dataset.key === key) return;
  list.dataset.key = key;
  list.replaceChildren(
    ...rows.map((r) => {
      const li = el('li', r.me ? 'df-rank is-me' : 'df-rank');
      li.append(face(r.character, 'df-rank-face'), el('span', 'df-rank-no', `${r.rank}위`), ' ', el('span', 'df-rank-name', r.nickname), ' ', el('span', 'df-rank-score', `${r.score}점`));
      return li;
    }),
  );
  list.hidden = rows.length === 0;
}

/** 글 목록: 달라졌을 때만 다시 만든다(반 대항). */
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
  private readonly head = el('span', 'df-muted df-gb-head');
  /** 남은 시간: 막대(처음 본 남은 시간을 전체로 친다)와 초 */
  private readonly timer = el('div', 'df-gb-timer');
  private readonly bar = el('div', 'df-bar');
  private readonly barFill = el('i', 'df-bar-fill');
  private readonly seconds = el('span', 'df-gb-seconds');
  private timeTotal = 0;
  private readonly question = el('strong', 'df-gb-question');
  private readonly line = el('span', 'df-text');
  private readonly result = el('span', 'df-text df-gb-result');
  private readonly podium = el('div', 'df-podium');
  private readonly ranking = el('ol', 'df-gb-ranking');
  /** 끝났을 때 합산 순위·반 대항(두 판 넘게 했을 때) */
  private readonly totalsTitle = el('strong', 'df-gb-totals-title');
  private readonly totals = el('ol', 'df-gb-ranking df-gb-totals');
  private readonly classes = el('ol', 'df-gb-ranking df-gb-classes');
  private readonly mine = el('div', 'df-hud-box df-gb-mine');
  private readonly lives = el('strong', 'df-gb-lives');
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
  /** 힌트 수첩(학생): 방탈출에서 얻은 힌트 카드를 골든벨 중에도 본다. */
  readonly notebook = el('button', 'df-button df-button-small df-button-light', '힌트 수첩');
  private answerShown = false;

  /** onSubmit: 학생이 단답형 답을 냈을 때(빈 글은 부르지 않는다), onNotebook: 힌트 수첩 단추를 눌렀을 때 */
  constructor(teacher: boolean, onSubmit: (text: string) => void = () => {}, onNotebook: () => void = () => {}) {
    const card = el('div', 'df-hud-box df-gb-card');
    this.answerInput.type = 'text';
    this.answerInput.maxLength = GB_MAX_ANSWER;
    this.answerInput.placeholder = '답을 씁니다';
    this.answerInput.autocomplete = 'off';
    this.answerInput.setAttribute('aria-label', '단답형 답');
    // 글을 쓰는 동안 W·A·S·D, 화살표, 빈칸 키가 캐릭터를 움직이거나 게임이 키를 가로채지 않게 누름(keydown)을 막는다.
    // 뗌(keyup)은 막지 않는다(칸에 들어오기 전에 누른 키를 게임이 계속 누른 것으로 알지 않게).
    this.answerInput.addEventListener('keydown', (e) => e.stopPropagation());
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
    this.bar.append(this.barFill);
    this.timer.append(this.bar, this.seconds);
    this.timer.hidden = true;
    this.podium.hidden = true;
    card.append(
      this.head,
      this.timer,
      this.question,
      this.line,
      this.answerForm,
      this.answerSent,
      this.answerError,
      this.result,
      this.explain,
      this.podium,
      this.ranking,
      this.totalsTitle,
      this.totals,
      this.classes,
      this.status,
    );
    this.notebook.addEventListener('click', () => {
      this.notebook.blur();
      onNotebook();
    });
    this.mine.append(this.lives, this.score, this.where, this.notebook);
    this.mine.hidden = teacher;
    // 선생님은 오른쪽을 골든벨 창이 쓴다. 선생님 화면은 프로젝터에 띄우므로 문제와 남은 시간을 크게 보인다.
    this.top.classList.toggle('has-panel', teacher);
    this.top.classList.toggle('is-teacher', teacher);
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
    this.showTime(v.timeLeft);
    setText(this.question, v.question);
    setText(this.line, v.line);
    setText(this.result, v.result);
    setText(this.explain, v.explain);
    this.result.classList.toggle('is-good', v.tone === 'good');
    this.result.classList.toggle('is-bad', v.tone === 'bad');
    setRanking(this.podium, this.ranking, v.ranking);
    setText(this.totalsTitle, v.totalsTitle);
    setRankList(this.totals, v.totals);
    setList(this.classes, v.classes);
  }

  /** 남은 시간 막대: 처음 본 값이 전체, 50% 이하 노랑, 20% 이하 빨강(theme timeBar) */
  private showTime(left: number | null) {
    this.timer.hidden = left === null;
    if (left === null) {
      this.timeTotal = 0;
      return;
    }
    this.timeTotal = Math.max(this.timeTotal, left, 1);
    const ratio = left / this.timeTotal;
    this.barFill.style.setProperty('--df-ratio', String(ratio));
    this.barFill.classList.toggle('is-warn', ratio <= timeBar.warn && ratio > timeBar.low);
    this.barFill.classList.toggle('is-low', ratio <= timeBar.low);
    setText(this.seconds, `${left}초`);
  }

  showMine(v: MineView) {
    this.showLives(v.lives);
    setText(this.score, v.score);
    setText(this.where, v.where);
  }

  setStatus(text: string | null) {
    setText(this.status, text ?? '');
  }

  /** 목숨: 글(♥♥♡, 💀)의 하트·해골을 도트 그림으로 바꿔 보인다. 원래 글은 읽어 주기용으로 함께 둔다. */
  private showLives(text: string) {
    if (this.lives.dataset.key === text) return;
    this.lives.dataset.key = text;
    const m = /^(.*?)((?:♥|♡|💀)+)(.*)$/su.exec(text);
    if (!m) {
      this.lives.replaceChildren(text);
      return;
    }
    const shown = el('span', 'df-lives-shown');
    shown.setAttribute('aria-hidden', 'true');
    shown.append(m[1], ...[...m[2]].map((c) => uiIcon('ui', LIFE_ICON[c], 'df-life')), m[3]);
    this.lives.replaceChildren(el('span', 'df-sr', text), shown);
  }

  /** 힌트 수첩 단추에 얻은 수를 적는다(예: "1부 3/8 · 2부 0/8"). */
  setHints(summary: string) {
    const label = `힌트 수첩 ${summary}`;
    if (this.notebook.textContent !== label) this.notebook.textContent = label;
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
  private readonly next = el('button', 'df-button df-button-gold df-gb-next');
  private readonly podium = el('div', 'df-podium');
  private readonly ranking = el('ol', 'df-gb-ranking df-cctv-list');
  /** 되돌릴 수 없는 단추라 다음 단추와 떨어진 왼쪽에, 크림색으로 둔다. */
  private readonly end = el('button', 'df-button df-button-small df-button-light', '골든벨 끝내기');
  /** 마감(푸는 중에만). 모두 답을 내면 is-ready로 강조한다. */
  private readonly close = el('button', 'df-button df-gb-close', '마감');
  /** 끝났을 때 합산 순위·반 대항과 합계를 처음으로 돌리는 단추 */
  private readonly totalsTitle = el('strong', 'df-gb-totals-title');
  private readonly totals = el('ol', 'df-gb-ranking df-gb-totals df-cctv-list');
  private readonly classes = el('ol', 'df-gb-ranking df-gb-classes');
  private readonly resetTotal = el('button', 'df-button df-button-small df-gb-reset', '합계 처음으로');
  /** 단답형 정답 공개 뒤 낸 답 묶음 */
  private readonly answers = el('ul', 'df-gb-answers df-cctv-list');
  private readonly onAccept: (key: string, accept: boolean) => void;

  constructor(handlers: {
    next: () => void;
    end: () => void;
    accept: (key: string, accept: boolean) => void;
    close: () => void;
    resetTotal: () => void;
  }) {
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
    this.close.addEventListener('click', () => {
      this.close.blur();
      handlers.close();
    });
    this.resetTotal.addEventListener('click', () => {
      this.resetTotal.blur();
      handlers.resetTotal();
    });
    const row = el('div', 'df-row df-row-split');
    row.append(this.end, this.close, this.next);
    this.node.setAttribute('aria-label', '골든벨 진행');
    this.answers.hidden = true;
    this.podium.hidden = true;
    this.node.append(head, this.counts, row, this.answers, this.podium, this.ranking, this.totalsTitle, this.totals, this.classes, this.resetTotal);
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
    // setText는 글이 있으면 보이게 하므로 글을 먼저 넣고 숨김을 정한다.
    setText(this.close, v.close?.ready ? '마감(모두 냄)' : '마감');
    this.close.hidden = v.close === null;
    this.close.disabled = waiting;
    this.close.classList.toggle('is-ready', v.close?.ready === true);
    setRanking(this.podium, this.ranking, v.ranking);
    setText(this.totalsTitle, v.totalsTitle);
    setRankList(this.totals, v.totals);
    setList(this.classes, v.classes);
    this.resetTotal.hidden = !v.canReset;
    this.resetTotal.disabled = waiting;
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
            const button = el('button', accept ? 'df-button df-button-small' : 'df-button df-button-small df-button-light', accept ? '정답으로 인정' : '인정 거두기');
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
