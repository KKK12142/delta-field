import { el, uiRoot } from './dom';

const MAX_NICKNAME = 12;

/** 닉네임 입력 화면. 들어가기를 누르면 닉네임을 돌려준다. */
export function askNickname(): Promise<string> {
  return new Promise((resolve) => {
    const wrap = el('div', 'df-start');
    const form = el('form', 'df-panel');
    const title = el('h1', 'df-title', 'Delta Field');
    const label = el('label', 'df-text', '닉네임을 입력하고 들어갑니다.');
    const input = el('input', 'df-input');
    input.id = 'df-nickname';
    input.maxLength = MAX_NICKNAME;
    input.autocomplete = 'off';
    input.placeholder = `닉네임(${MAX_NICKNAME}자까지)`;
    label.htmlFor = input.id;
    const error = el('p', 'df-error');
    error.hidden = true;
    const row = el('div', 'df-row');
    const submit = el('button', 'df-button', '들어가기');
    submit.type = 'submit';
    row.append(submit);
    form.append(title, label, input, error, row);
    wrap.append(form);
    uiRoot().append(wrap);
    input.focus();

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const nickname = input.value.trim();
      if (!nickname) {
        error.textContent = '닉네임을 입력해야 들어갈 수 있습니다.';
        error.hidden = false;
        input.focus();
        return;
      }
      wrap.remove();
      resolve(nickname);
    });
  });
}
