import { GB_MAX_ANSWER } from '../../shared/goldenbell.ts';
import { el, uiRoot } from './dom';
import { objectPicture, pixelImage, uiIcon } from './pictures';

/** 미션 문제(정답은 서버만 안다). choices가 비어 있으면 단답형 */
export interface QuizView {
  question: string;
  choices: string[];
  /** 교사가 바꿔 넣을 예시 문제 */
  example: boolean;
}

/** 답을 서버에 보내 채점한 결과: 맞음, 틀림, 또는 낼 수 없는 까닭(글) */
export type QuizCheck = (answer: string) => Promise<boolean | string>;

/** 창이 뜬 뒤 이 시간(ms) 동안은 키로 누른 것을 받지 않는다. */
const OPEN_GUARD_MS = 200;

/** 힌트 수첩에 보일 카드 */
export interface NoteCard {
  title: string;
  text: string;
}

export interface ChoiceOption {
  label: string;
  /** 아래에 작게 적는 글 */
  detail?: string;
  /** 고를 수 없으면 true(detail에 까닭을 적는다) */
  disabled?: boolean;
}

/** 대화상자 제목 옆에 그림을 넣을 사물(맵 사물의 이름·종류·그림 이름) */
export interface DialogSubject {
  name: string;
  kind: string;
  sprite?: string;
}

/** 단서, 퀴즈, 끝 화면, 고르기를 띄우는 대화상자. 한 번에 하나만 띄운다. */
export class Dialog {
  private current: { node: HTMLElement; onKey: (e: KeyboardEvent) => void } | null = null;
  /** 지금 살펴보는 사물. 제목이 이 사물 이름인 창에는 사물 그림을 넣는다. */
  private subject: DialogSubject | null = null;
  /** 닫힌 시각. 닫을 때 누른 키가 곧바로 다시 살펴보기로 이어지지 않게 쓴다. */
  lastClosedAt = 0;

  isOpen() {
    return this.current !== null;
  }

  /** 살펴보기를 시작할 때 사물을, 끝나면 null을 준다(제목이 사물 이름인 창에 그 그림이 들어간다). */
  setSubject(subject: DialogSubject | null) {
    this.subject = subject;
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

  /**
   * 미션 문제를 보여 준다. 답은 check(서버 채점)로 맞춰 보고, 맞히면 true, 닫으면 false.
   * 객관식은 틀린 보기를 지우고 다시 고르고, 단답형은 고쳐 써서 다시 낸다.
   */
  quiz(title: string, quiz: QuizView, check: QuizCheck): Promise<boolean> {
    return new Promise((resolve) => {
      const panel = this.panel(title);
      if (quiz.example) panel.append(el('span', 'df-badge', '예시 문제'));
      panel.append(el('p', 'df-text', quiz.question));
      const feedback = el('p', 'df-text df-feedback');
      feedback.hidden = true;
      const row = el('div', 'df-row');
      const close = el('button', 'df-button df-button-light', '닫기');
      row.append(close);
      let busy = false;
      const finish = (correct: boolean) => {
        this.close();
        resolve(correct);
      };
      const showWrong = (text: string) => {
        feedback.textContent = text;
        feedback.classList.add('is-wrong');
        feedback.hidden = false;
      };
      /** 답을 보내고 결과를 기다린다. 틀리면 false */
      const send = async (answer: string, lock: HTMLButtonElement[]): Promise<boolean> => {
        busy = true;
        for (const b of lock) b.disabled = true;
        try {
          const result = await check(answer);
          if (result === true) {
            finish(true);
            return true;
          }
          showWrong(typeof result === 'string' ? result : quiz.choices.length ? '틀렸습니다. 다른 답을 고릅니다.' : '틀렸습니다. 다시 써서 냅니다.');
        } catch {
          showWrong('서버에서 답을 받지 못했습니다. 잠시 뒤 다시 냅니다.');
        } finally {
          busy = false;
        }
        return false;
      };

      let pick: (i: number) => void = () => {};
      if (quiz.choices.length) {
        const list = el('div', 'df-choices');
        const buttons = quiz.choices.map((choice, i) => {
          const b = el('button', 'df-choice', `${i + 1}. ${choice}`);
          b.addEventListener('click', () => pick(i));
          list.append(b);
          return b;
        });
        pick = (i) => {
          const b = buttons[i];
          if (!b || b.disabled || busy) return;
          const others = buttons.filter((x) => !x.disabled);
          void send(String(i + 1), others).then((correct) => {
            for (const x of others) x.disabled = false;
            if (correct) return;
            b.disabled = true;
            b.classList.add('is-wrong');
          });
        };
        panel.append(list);
      } else {
        const form = el('form', 'df-row df-quiz-answer');
        const input = el('input', 'df-input');
        input.type = 'text';
        input.maxLength = GB_MAX_ANSWER;
        input.placeholder = '답을 씁니다';
        input.autocomplete = 'off';
        input.setAttribute('aria-label', '답');
        // 글을 쓰는 동안 빈칸·방향키를 게임이 가로채지 않게 누름(keydown)만 막는다(Esc는 창을 닫게 둔다).
        // 뗌(keyup)은 막지 않는다. 막으면 이 창을 연 스페이스바를 게임이 계속 누른 것으로 알아 다음 살펴보기가 되지 않는다.
        input.addEventListener('keydown', (e) => {
          if (e.key !== 'Escape') e.stopPropagation();
        });
        const submit = el('button', 'df-button', '내기');
        submit.type = 'submit';
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const text = input.value.trim();
          if (!text || busy) return;
          void send(text, [submit]).then((correct) => {
            if (correct) return;
            submit.disabled = false;
            input.select();
          });
        });
        form.append(input, submit);
        panel.append(form);
        queueMicrotask(() => input.focus());
      }
      panel.append(feedback, row);
      close.addEventListener('click', () => finish(false));
      this.open(panel, (e) => {
        if (e.key === 'Escape') finish(false);
        const n = Number(e.key);
        if (quiz.choices.length && Number.isInteger(n) && n >= 1) pick(n - 1);
      });
    });
  }

  /**
   * 숫자 자물쇠: 번호 단추(0~9)를 눌러 digits자리를 채우고 "열기"를 누른다(키보드 숫자·Backspace·Enter도 된다).
   * 번호는 check(서버 채점)로 맞춰 보고, 맞으면 true, 닫으면 false. 틀리면 칸을 비우고 다시 누른다.
   */
  code(title: string, text: string, digits: number, example: boolean, check: QuizCheck): Promise<boolean> {
    return new Promise((resolve) => {
      const panel = this.panel(title);
      if (example) panel.append(el('span', 'df-badge', '예시 문제'));
      panel.append(el('p', 'df-text', text));
      const display = el('div', 'df-code-display');
      display.setAttribute('aria-live', 'polite');
      const feedback = el('p', 'df-text df-feedback');
      feedback.hidden = true;
      const pad = el('div', 'df-code-pad');
      let entered = '';
      let busy = false;
      const show = () => {
        display.textContent = [...Array(digits)].map((_, i) => entered[i] ?? '_').join(' ');
        open.disabled = busy || entered.length !== digits;
      };
      const finish = (correct: boolean) => {
        this.close();
        resolve(correct);
      };
      const press = (d: string) => {
        if (busy || entered.length >= digits) return;
        entered += d;
        feedback.hidden = true;
        show();
      };
      const erase = () => {
        if (busy) return;
        entered = entered.slice(0, -1);
        show();
      };
      const submit = async () => {
        if (busy || entered.length !== digits) return;
        busy = true;
        show();
        try {
          const result = await check(entered);
          if (result === true) {
            finish(true);
            return;
          }
          feedback.textContent = typeof result === 'string' ? result : '번호가 맞지 않습니다. 다시 누릅니다.';
        } catch {
          feedback.textContent = '서버에서 답을 받지 못했습니다. 잠시 뒤 다시 엽니다.';
        }
        feedback.classList.add('is-wrong');
        feedback.hidden = false;
        entered = '';
        busy = false;
        show();
      };
      for (const d of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) {
        const b = el('button', 'df-choice df-code-key', d);
        b.addEventListener('click', () => press(d));
        pad.append(b);
      }
      const back = el('button', 'df-choice df-code-key', '지우기');
      back.addEventListener('click', erase);
      const zero = el('button', 'df-choice df-code-key', '0');
      zero.addEventListener('click', () => press('0'));
      const open = el('button', 'df-button df-code-key', '열기');
      open.addEventListener('click', () => void submit());
      pad.append(back, zero, open);
      const row = el('div', 'df-row');
      const close = el('button', 'df-button df-button-light', '닫기');
      close.addEventListener('click', () => finish(false));
      row.append(close);
      panel.append(display, pad, feedback, row);
      show();
      this.open(panel, (e) => {
        if (e.key === 'Escape') finish(false);
        else if (/^\d$/.test(e.key)) press(e.key);
        else if (e.key === 'Backspace') erase();
        else if (e.key === 'Enter') void submit();
      });
    });
  }

  /**
   * 큰 지도: content(그림)를 넓은 창에 보인다. 닫기, Esc, 창 바깥 누르기로 닫는다.
   * 창 안의 너비(CSS 픽셀)를 draw에 넘겨 그 너비에 맞춰 그리게 한다.
   */
  map(title: string, draw: (width: number) => HTMLElement): Promise<void> {
    return new Promise((resolve) => {
      const panel = this.panel(title);
      panel.classList.add('df-map-panel');
      const row = el('div', 'df-row');
      const ok = el('button', 'df-button', '닫기');
      row.append(ok);
      const done = () => {
        this.close();
        resolve();
      };
      ok.addEventListener('click', done);
      this.open(panel, (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') done();
      });
      const box = el('div', 'df-map-big');
      panel.append(box, row);
      box.append(draw(panel.clientWidth - 2 * parseFloat(getComputedStyle(panel).paddingLeft)));
      // 창 바깥(어두운 바탕)을 누르면 닫는다.
      panel.parentElement?.addEventListener('click', (e) => {
        if (e.target === panel.parentElement) done();
      });
      ok.focus();
    });
  }

  /** 힌트 수첩: 얻은 힌트 카드를 모두 보인다. */
  notebook(cards: NoteCard[], total: number): Promise<void> {
    return new Promise((resolve) => {
      const panel = this.panel(`힌트 수첩 (${cards.length}/${total})`);
      if (!cards.length) panel.append(el('p', 'df-muted', '아직 얻은 힌트 카드가 없습니다. 미션을 마치면 카드를 얻습니다.'));
      const list = el('div', 'df-cards');
      for (const c of cards) {
        const card = el('section', 'df-card');
        const body = el('div', 'df-card-body');
        body.append(el('strong', '', c.title), el('p', 'df-text', c.text));
        card.append(uiIcon('ui', 'hintCard', 'df-card-img'), body);
        list.append(card);
      }
      const row = el('div', 'df-row');
      const ok = el('button', 'df-button', '닫기');
      row.append(ok);
      panel.append(list, row);
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
      const close = el('button', 'df-button df-button-light', closeText);
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
    const heading = el('h2', 'df-title', title);
    const picture = this.subject?.name === title ? objectPicture(this.subject) : null;
    if (picture) {
      // 살펴본 사물 그림(물건 칸 틀 안)과 제목을 한 줄에 둔다.
      const head = el('div', 'df-dialog-head');
      const frame = el('div', 'df-picture');
      frame.append(pixelImage(picture, 'df-picture-img'));
      head.append(frame, heading);
      panel.append(head);
    } else panel.append(heading);
    return panel;
  }

  private open(panel: HTMLElement, handleKey: (e: KeyboardEvent) => void) {
    const node = el('div', 'df-dialog');
    node.append(panel);
    // 앞 창을 닫은 Enter가 곧바로 이어 뜬 창의 단추를 누르지 않게(키를 누를 때 keypress·click이 뒤따른다) 잠깐 받지 않는다.
    const openedAt = performance.now();
    const settling = () => performance.now() - openedAt < OPEN_GUARD_MS;
    node.addEventListener(
      'click',
      (e) => {
        if (settling() && e.detail === 0) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true,
    );
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || settling()) return;
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
