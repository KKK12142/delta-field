import { CODE_LENGTH, MAX_NICKNAME } from '../../shared/protocol.ts';
import type { Entry } from '../net/connection';
import { el, uiRoot } from './dom';

/**
 * 첫 화면. 학생은 닉네임과 방 코드, 선생님은 닉네임과 비밀번호(방 코드는 비우면 새 방)를 넣는다.
 * tryEnter가 실패하면 그 까닭을 보여 주고 다시 입력받는다. 성공하면 tryEnter의 결과를 돌려준다.
 */
export function askEntry<T>(tryEnter: (entry: Entry) => Promise<T>, describeError: (e: unknown, entry: Entry) => string): Promise<T> {
  return new Promise((resolve) => {
    let teacher = false;
    const wrap = el('div', 'df-start');
    const form = el('form', 'df-panel');
    const title = el('h1', 'df-title', 'Delta Field');
    const intro = el('p', 'df-text');

    const nickLabel = el('label', 'df-muted', '닉네임');
    const nickname = el('input', 'df-input');
    nickname.id = 'df-nickname';
    nickname.maxLength = MAX_NICKNAME;
    nickname.autocomplete = 'off';
    nickname.placeholder = `${MAX_NICKNAME}자까지`;
    nickLabel.htmlFor = nickname.id;

    const passLabel = el('label', 'df-muted', '선생님 비밀번호');
    const password = el('input', 'df-input');
    password.id = 'df-password';
    password.type = 'password';
    password.autocomplete = 'current-password';
    passLabel.htmlFor = password.id;

    const codeLabel = el('label', 'df-muted');
    const code = el('input', 'df-input');
    code.id = 'df-code';
    code.inputMode = 'numeric';
    code.maxLength = CODE_LENGTH;
    code.autocomplete = 'off';
    code.placeholder = `숫자 ${CODE_LENGTH}자리`;
    codeLabel.htmlFor = code.id;

    const error = el('p', 'df-error');
    error.hidden = true;
    const row = el('div', 'df-row df-row-split');
    const switchRole = el('button', 'df-link');
    switchRole.type = 'button';
    const submit = el('button', 'df-button', '들어가기');
    submit.type = 'submit';
    row.append(switchRole, submit);

    form.append(title, intro, nickLabel, nickname, passLabel, password, codeLabel, code, error, row);
    wrap.append(form);
    uiRoot().append(wrap);

    const render = () => {
      intro.textContent = teacher
        ? '비밀번호를 넣고 새 방을 만듭니다. 이미 만든 방으로 돌아갈 때는 방 코드도 넣습니다.'
        : '선생님이 알려 준 방 코드와 닉네임을 넣고 들어갑니다.';
      passLabel.hidden = password.hidden = !teacher;
      codeLabel.textContent = teacher ? '방 코드(새 방이면 비워 둡니다)' : '방 코드';
      switchRole.textContent = teacher ? '학생으로 들어가기' : '선생님으로 들어가기';
      if (teacher && !nickname.value) nickname.value = '선생님';
      error.hidden = true;
    };
    render();
    nickname.focus();

    switchRole.addEventListener('click', () => {
      teacher = !teacher;
      render();
    });

    const showError = (text: string, focus: HTMLInputElement) => {
      error.textContent = text;
      error.hidden = false;
      focus.focus();
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nick = nickname.value.trim();
      const roomCode = code.value.trim();
      if (!nick) return showError('닉네임을 입력해야 들어갈 수 있습니다.', nickname);
      const codeOk = new RegExp(`^\\d{${CODE_LENGTH}}$`).test(roomCode);
      if (!teacher && !codeOk) return showError(`방 코드는 숫자 ${CODE_LENGTH}자리입니다.`, code);
      if (teacher && roomCode && !codeOk) return showError(`방 코드는 숫자 ${CODE_LENGTH}자리이거나 비어 있어야 합니다.`, code);
      if (teacher && !password.value) return showError('선생님 비밀번호를 입력합니다.', password);

      const entry: Entry = teacher
        ? { role: 'teacher', nickname: nick, password: password.value, code: roomCode }
        : { role: 'student', nickname: nick, code: roomCode };
      submit.disabled = true;
      submit.textContent = '들어가는 중';
      try {
        const result = await tryEnter(entry);
        wrap.remove();
        resolve(result);
      } catch (err) {
        showError(describeError(err, entry), teacher && !roomCode ? password : nickname);
      } finally {
        submit.disabled = false;
        submit.textContent = '들어가기';
      }
    });
  });
}
