import { CLASS_GROUPS, CODE_LENGTH, MAX_NICKNAME } from '../../shared/protocol.ts';
import characters from '../data/characters.json';
import type { Entry } from '../net/connection';
import { characterSheet } from '../scenes/avatar';
import { el, uiRoot } from './dom';

/** 이 기기에서 마지막으로 고른 캐릭터를 기억해 두는 곳(다음에 들어올 때 미리 골라 둔다) */
const CHARACTER_KEY = 'df-character';

function rememberedCharacter(): string {
  try {
    const id = localStorage.getItem(CHARACTER_KEY);
    if (id && characters.some((c) => c.id === id)) return id;
  } catch {
    // 저장소를 쓸 수 없는 창(사생활 보호 등)이면 기억하지 않는다.
  }
  // 처음이면 아무거나 골라 두어 모두 같은 캐릭터가 되지 않게 한다.
  return characters[Math.floor(Math.random() * characters.length)].id;
}

function rememberCharacter(id: string) {
  try {
    localStorage.setItem(CHARACTER_KEY, id);
  } catch {
    // 기억하지 못해도 들어가는 데는 상관없다.
  }
}

/** 이 기기에서 마지막으로 고른 반 */
const CLASS_KEY = 'df-class-group';

function rememberedClass(): string {
  try {
    const id = localStorage.getItem(CLASS_KEY);
    if (id && CLASS_GROUPS.some((g) => g.id === id)) return id;
  } catch {
    // 저장소를 쓸 수 없으면 기억하지 않는다.
  }
  return '';
}

function rememberClass(id: string) {
  try {
    localStorage.setItem(CLASS_KEY, id);
  } catch {
    // 기억하지 못해도 들어가는 데는 상관없다.
  }
}

/** 반 고르기(학생만): 반마다 단추 하나. 처음에는 아무것도 고르지 않고, 이 기기에서 전에 고른 반이 있으면 골라 둔다. */
function classPicker() {
  let selected = rememberedClass();
  const label = el('p', 'df-muted', '반');
  label.id = 'df-class-label';
  const group = el('div', 'df-classes');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-labelledby', label.id);
  const buttons = CLASS_GROUPS.map((g) => {
    const button = el('button', 'df-class', g.name);
    button.type = 'button';
    button.dataset.id = g.id;
    button.addEventListener('click', () => {
      selected = g.id;
      render();
    });
    group.append(button);
    return button;
  });
  const render = () => {
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.id === selected));
  };
  render();
  return { label, group, selected: () => selected, focus: () => buttons[0].focus() };
}

/** 캐릭터 고르기: 앞모습 서기 프레임과 이름을 단추로 늘어놓는다. 고른 id는 selected() */
function characterPicker() {
  let selected = rememberedCharacter();
  const label = el('p', 'df-muted', '캐릭터');
  label.id = 'df-character-label';
  const grid = el('div', 'df-chars');
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-labelledby', label.id);
  const buttons = characters.map((c) => {
    const button = el('button', 'df-char');
    button.type = 'button';
    button.dataset.id = c.id;
    const face = el('span', 'df-char-face');
    face.style.backgroundImage = `url("${characterSheet(c.id)}")`;
    button.append(face, el('span', 'df-char-name', c.name));
    button.addEventListener('click', () => {
      selected = c.id;
      render();
    });
    grid.append(button);
    return button;
  });
  const render = () => {
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.id === selected));
  };
  render();
  return { label, grid, selected: () => selected };
}

/**
 * 첫 화면. 학생은 닉네임과 방 코드와 반, 선생님은 닉네임과 비밀번호(방 코드는 비우면 새 방)를 넣고, 모두 캐릭터를 고른다.
 * tryEnter가 실패하면 그 까닭을 보여 주고 다시 입력받는다. 성공하면 tryEnter의 결과를 돌려준다.
 */
export function askEntry<T>(tryEnter: (entry: Entry) => Promise<T>, describeError: (e: unknown, entry: Entry) => string): Promise<T> {
  return new Promise((resolve) => {
    let teacher = false;
    const wrap = el('div', 'df-start');
    const form = el('form', 'df-panel');
    // 로고 자리: 그림 담당의 로고 그림이 오면 이 안에 넣는다(지금은 글자).
    const logo = el('header', 'df-logo');
    const title = el('h1', 'df-title', 'Delta Field');
    logo.append(title);
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

    const classes = classPicker();
    const picker = characterPicker();

    const error = el('p', 'df-error');
    error.hidden = true;
    const row = el('div', 'df-row df-row-split');
    const switchRole = el('button', 'df-button df-button-light df-link');
    switchRole.type = 'button';
    const submit = el('button', 'df-button df-button-enter', '들어가기');
    submit.type = 'submit';
    row.append(switchRole, submit);

    // 입력 칸(닉네임, 방 코드, 비밀번호)은 넓은 화면에서 한 줄에 놓는다.
    const field = (...nodes: HTMLElement[]) => {
      const box = el('div', 'df-field');
      box.append(...nodes);
      return box;
    };
    const passField = field(passLabel, password);
    const fields = el('div', 'df-fields');
    fields.append(field(nickLabel, nickname), field(codeLabel, code), passField);
    const classField = field(classes.label, classes.group);
    form.append(logo, intro, fields, classField, field(picker.label, picker.grid), error, row);
    wrap.append(form);
    uiRoot().append(wrap);

    const render = () => {
      intro.textContent = teacher
        ? '비밀번호를 넣고 새 방을 만듭니다. 이미 만든 방으로 돌아갈 때는 방 코드도 넣습니다.'
        : '선생님이 알려 준 방 코드와 닉네임을 넣고 들어갑니다.';
      passField.hidden = !teacher;
      classField.hidden = teacher;
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

    const showError = (text: string, focus: { focus: () => void }) => {
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
      const classGroup = classes.selected();
      if (!teacher && !classGroup) return showError('반을 골라야 들어갈 수 있습니다.', classes);

      const character = picker.selected();
      const entry: Entry = teacher
        ? { role: 'teacher', nickname: nick, character, password: password.value, code: roomCode }
        : { role: 'student', nickname: nick, character, classGroup, code: roomCode };
      submit.disabled = true;
      submit.textContent = '들어가는 중';
      try {
        const result = await tryEnter(entry);
        rememberCharacter(character);
        if (!teacher) rememberClass(classGroup);
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
