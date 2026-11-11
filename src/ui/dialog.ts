import type { Quiz } from '../data/room';
import { el, uiRoot } from './dom';

export interface ChoiceOption {
  label: string;
  /** 아래에 작게 적는 글 */
  detail?: string;
  /** 고를 수 없으면 true(detail에 까닭을 적는다) */
  disabled?: boolean;
}

/** 단서, 퀴즈, 끝 화면, 고르기를 띄우는 대화상자. 한 번에 하나만 띄운다. */
export class Dialog {
  private current: { node: HTMLElement; onKey: (e: KeyboardEvent) => void } | null = null;
  /** 닫힌 시각. 닫을 때 누른 키가 곧바로 다시 살펴보기로 이어지지 않게 쓴다. */
  lastClosedAt = 0;

  isOpen() {
    return this.current !== null;
  }

  /** 글을 보여 준다. 확인을 누르면 끝난다. */
  message(title: string, text: string, buttonText = '확인'): Promise<void> {
    return new Promise((resolve) => {
      const panel = this.panel(title);
      panel.append(el('p', 'df-text', text));
      const row = el('div', 'df-row');
      const ok = el('button', 'df-button', buttonText);
      row.append(ok);
      panel.append(row);
      const done = () => {
        this.close();
        resolve();
      };
      ok.addEventListener('click', done);
      this.open(panel, (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') done();
      });
      ok.focus();
    });
  }

  /** 퀴즈를 보여 준다. 맞히면 true, 닫으면 false. 틀리면 다시 고른다. */
  quiz(title: string, quiz: Quiz): Promise<boolean> {
    return new Promise((resolve) => {
      const panel = this.panel(title);
      if (quiz.example) panel.append(el('span', 'df-badge', '예시 문제'));
      panel.append(el('p', 'df-text', quiz.question));
      const list = el('div', 'df-choices');
      const feedback = el('p', 'df-text df-feedback');
      feedback.hidden = true;
      const buttons = quiz.choices.map((choice, i) => {
        const b = el('button', 'df-choice', `${i + 1}. ${choice}`);
        b.addEventListener('click', () => pick(i));
        list.append(b);
        return b;
      });
      const row = el('div', 'df-row');
      const close = el('button', 'df-button', '닫기');
      row.append(close);
      panel.append(list, feedback, row);

      const finish = (correct: boolean) => {
        this.close();
        resolve(correct);
      };
      const pick = (i: number) => {
        const b = buttons[i];
        if (!b || b.disabled) return;
        if (i === quiz.answer) {
          finish(true);
          return;
        }
        b.disabled = true;
        b.classList.add('is-wrong');
        feedback.textContent = '틀렸습니다. 다른 답을 고릅니다.';
        feedback.classList.add('is-wrong');
        feedback.hidden = false;
      };
      close.addEventListener('click', () => finish(false));
      this.open(panel, (e) => {
        if (e.key === 'Escape') finish(false);
        const n = Number(e.key);
        if (Number.isInteger(n) && n >= 1) pick(n - 1);
      });
    });
  }

  /** 여러 가지 가운데 하나를 고른다. 고른 번호를 돌려주고, 닫으면 null */
  choose(title: string, text: string, options: ChoiceOption[], closeText = '닫기'): Promise<number | null> {
    return new Promise((resolve) => {
      const panel = this.panel(title);
      panel.append(el('p', 'df-text', text));
      const list = el('div', 'df-choices');
      const finish = (picked: number | null) => {
        this.close();
        resolve(picked);
      };
      options.forEach((o, i) => {
        const b = el('button', 'df-choice');
        b.append(el('span', '', o.label));
        if (o.detail) b.append(el('span', o.disabled ? 'df-choice-detail is-wrong' : 'df-choice-detail', o.detail));
        b.disabled = !!o.disabled;
        b.addEventListener('click', () => finish(i));
        list.append(b);
      });
      const row = el('div', 'df-row');
      const close = el('button', 'df-button', closeText);
      close.addEventListener('click', () => finish(null));
      row.append(close);
      panel.append(list, row);
      this.open(panel, (e) => {
        if (e.key === 'Escape') finish(null);
      });
    });
  }

  /** 떠 있는 대화상자를 거둔다. 기다리던 쪽에는 아무 답도 돌려주지 않는다(맵을 옮길 때 그 맵의 일을 멈추려고). */
  abandon() {
    this.close();
  }

  private panel(title: string) {
    const panel = el('div', 'df-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.append(el('h2', 'df-title', title));
    return panel;
  }

  private open(panel: HTMLElement, handleKey: (e: KeyboardEvent) => void) {
    const node = el('div', 'df-dialog');
    node.append(panel);
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      handleKey(e);
    };
    window.addEventListener('keydown', onKey);
    uiRoot().append(node);
    this.current = { node, onKey };
  }

  private close() {
    if (!this.current) return;
    window.removeEventListener('keydown', this.current.onKey);
    this.current.node.remove();
    this.current = null;
    this.lastClosedAt = performance.now();
  }
}
