import { CLASS_GROUPS, CODE_LENGTH, MAX_NICKNAME, PIN_LENGTH, RejectCode, cleanPin, type OpenRoomInfo } from '../../shared/protocol.ts';
import characters from '../data/characters.json';
import { closeRoom, listRooms, type Entry } from '../net/connection';
import { Dialog } from './dialog';
import { characterSheet } from '../scenes/avatar';
import { el, uiRoot } from './dom';
import { emblem, uiIcon } from './pictures';
import { accessQr } from './qr';

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

/** 이 기기에서 마지막으로 들어간 방(역할, 닉네임, 방 코드, 기억한 때). 끊겨서 첫 화면으로 돌아오면 다시 채운다. 비밀번호는 넣지 않는다. */
const ENTRY_KEY = 'df-last-entry';
/** 이보다 오래된 기억은 쓰지 않는다(다음 수업의 첫 화면에 지난 방 코드가 남지 않게). */
const ENTRY_KEEP_MS = 3 * 60 * 60 * 1000;

interface LastEntry {
  role: 'student' | 'teacher';
  nickname: string;
  code: string;
  at: number;
}

export function rememberEntry(role: 'student' | 'teacher', nickname: string, code: string) {
  try {
    const entry: LastEntry = { role, nickname, code, at: Date.now() };
    localStorage.setItem(ENTRY_KEY, JSON.stringify(entry));
  } catch {
    // 기억하지 못해도 들어가는 데는 상관없다.
  }
}

function rememberedEntry(): LastEntry | null {
  try {
    const v = JSON.parse(localStorage.getItem(ENTRY_KEY) ?? 'null') as Partial<LastEntry> | null;
    if (!v || (v.role !== 'student' && v.role !== 'teacher') || typeof v.nickname !== 'string' || typeof v.code !== 'string') return null;
    if (typeof v.at !== 'number' || Date.now() - v.at > ENTRY_KEEP_MS) return null;
    return { role: v.role, nickname: v.nickname.slice(0, MAX_NICKNAME), code: v.code.slice(0, CODE_LENGTH), at: v.at };
  } catch {
    return null;
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
    const button = el('button', 'df-class');
    button.append(emblem(g.id), g.name);
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

/** 만든 시각(시:분) */
function clockText(ms: number) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * 선생님: 열린 방 목록(방 코드, 만든 시각, 접속 중인 선생님·학생 수, 지금 하는 일). 비밀번호가 맞아야 서버가 목록을 준다.
 * 줄마다 "들어가기"(그 코드로 선생님 입장)와 "닫기"(확인 창 뒤 방 안 모두를 내보내고 방을 없앰).
 */
function roomList(password: () => string, enter: (code: string) => void, showError: (text: string) => void) {
  const open = el('button', 'df-button df-button-small df-button-light df-rooms-open', '열린 방 보기');
  open.type = 'button';
  const box = el('div', 'df-rooms');
  const list = el('ul', 'df-rooms-list');
  box.append(el('p', 'df-muted', '열린 방'), list);
  box.hidden = true;
  const dialog = new Dialog();
  let busy = false;

  const row = (r: OpenRoomInfo) => {
    const li = el('li', 'df-room');
    li.dataset.code = r.code;
    const info = el('span', 'df-room-info');
    info.append(
      el('strong', 'df-room-name', `방 ${r.code}`),
      el('span', 'df-muted', `${clockText(r.openedAt)} 만듦 · 선생님 ${r.teachers}명 · 학생 ${r.students}명 · ${r.activity}`),
    );
    const go = el('button', 'df-button df-button-small', '들어가기');
    go.type = 'button';
    go.addEventListener('click', () => enter(r.code));
    const close = el('button', 'df-button df-button-small df-button-light', '닫기');
    close.type = 'button';
    close.addEventListener('click', () => void closeOne(r));
    li.append(info, go, close);
    return li;
  };

  const load = async () => {
    if (busy) return;
    if (!password()) return showError('선생님 비밀번호를 넣어야 열린 방을 볼 수 있습니다.');
    busy = true;
    open.disabled = true;
    try {
      const reply = await listRooms(password());
      if (reply.error !== null) {
        box.hidden = true;
        return showError(reply.error);
      }
      const rooms = reply.rooms ?? [];
      list.replaceChildren(...(rooms.length ? rooms.map(row) : [el('li', 'df-muted', '열린 방이 없습니다.')]));
      box.hidden = false;
      open.textContent = '목록 새로 보기';
    } finally {
      busy = false;
      open.disabled = false;
    }
  };

  const closeOne = async (r: OpenRoomInfo) => {
    if (busy || dialog.isOpen()) return;
    const sure = await dialog.confirm(
      '방 닫기',
      `방 ${r.code}을 닫습니다. 들어와 있는 학생 ${r.students}명이 모두 나가게 됩니다. 되돌릴 수 없습니다.`,
      '닫기',
    );
    if (!sure) return;
    const reply = await closeRoom(password(), r.code);
    if (reply.error !== null) showError(reply.error);
    await load();
  };

  open.addEventListener('click', () => void load());
  /** 비밀번호를 바꾸거나 학생으로 바꾸면 목록을 감춘다. */
  const reset = () => {
    box.hidden = true;
    list.replaceChildren();
    open.textContent = '열린 방 보기';
  };
  return { open, box, reset };
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
    // 로고(public/sprites/ui/logo.png). 제목 글은 읽어 주기용으로 남긴다.
    const logo = el('header', 'df-logo');
    const title = el('h1', 'df-sr', 'Delta Field');
    // 제목 오른쪽에 접속 QR 코드(휴대폰처럼 좁으면 제목 아래로)
    logo.append(uiIcon('ui', 'logo', 'df-logo-img'), title, accessQr());
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

    // 학생 암호: 같은 닉네임으로 다시 들어와 이어 받을 때 쓴다. 숫자 자판이 뜨게 하고, 기억하기 쉽게 글자를 보인다. 저장하지 않는다.
    const pinLabel = el('label', 'df-muted', `암호(숫자 ${PIN_LENGTH}자리)`);
    const pin = el('input', 'df-input');
    pin.id = 'df-pin';
    pin.inputMode = 'numeric';
    pin.maxLength = PIN_LENGTH;
    pin.autocomplete = 'off';
    pin.placeholder = `숫자 ${PIN_LENGTH}자리`;
    pinLabel.htmlFor = pin.id;
    const pinHelp = el('span', 'df-muted', '다시 들어올 때 쓰는 숫자 4자리입니다. 잊지 않게 기억합니다.');

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
    const pinField = field(pinLabel, pin, pinHelp);
    const rooms = roomList(
      () => password.value,
      (roomCode) => {
        code.value = roomCode;
        form.requestSubmit();
      },
      (text) => showError(text, password),
    );
    const roomsRow = el('div', 'df-row');
    roomsRow.append(rooms.open);
    password.addEventListener('input', rooms.reset);
    const fields = el('div', 'df-fields');
    fields.append(field(nickLabel, nickname), field(codeLabel, code), pinField, passField);
    const classField = field(classes.label, classes.group);
    form.append(logo, intro, fields, roomsRow, rooms.box, classField, field(picker.label, picker.grid), error, row);
    wrap.append(form);
    uiRoot().append(wrap);

    const render = () => {
      intro.textContent = teacher
        ? '비밀번호를 넣고 새 방을 만듭니다. 이미 만든 방으로 돌아갈 때는 방 코드도 넣습니다.'
        : '선생님이 알려 준 방 코드와 닉네임을 넣고 들어갑니다.';
      passField.hidden = roomsRow.hidden = !teacher;
      pinField.hidden = teacher;
      if (!teacher) rooms.reset();
      classField.hidden = teacher;
      codeLabel.textContent = teacher ? '방 코드(새 방이면 비워 둡니다)' : '방 코드';
      switchRole.textContent = teacher ? '학생으로 들어가기' : '선생님으로 들어가기';
      if (teacher && !nickname.value) nickname.value = '선생님';
      error.hidden = true;
    };
    // 끊겨서 돌아왔으면 지난번 역할·닉네임·방 코드를 채워 둔다(반과 캐릭터는 따로 기억해 둔 것으로 골라져 있다).
    const last = rememberedEntry();
    if (last) {
      teacher = last.role === 'teacher';
      nickname.value = last.nickname;
      code.value = last.code;
    }
    render();
    (teacher && last ? password : nickname).focus();

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
      const pinValue = pin.value.trim();
      if (!teacher && !cleanPin(pinValue)) return showError(`암호는 숫자 ${PIN_LENGTH}자리입니다. 처음이면 정해서 넣습니다.`, pin);
      const classGroup = classes.selected();
      if (!teacher && !classGroup) return showError('반을 골라야 들어갈 수 있습니다.', classes);

      const character = picker.selected();
      const entry: Entry = teacher
        ? { role: 'teacher', nickname: nick, character, password: password.value, code: roomCode }
        : { role: 'student', nickname: nick, character, classGroup, pin: pinValue, code: roomCode };
      submit.disabled = true;
      submit.textContent = '들어가는 중';
      try {
        const result = await tryEnter(entry);
        rememberCharacter(character);
        if (!teacher) rememberClass(classGroup);
        wrap.remove();
        resolve(result);
      } catch (err) {
        const rejected = (err as { code?: unknown })?.code;
        const pinError = rejected === RejectCode.wrongPin || rejected === RejectCode.badPin;
        showError(describeError(err, entry), teacher && !roomCode ? password : pinError ? pin : nickname);
      } finally {
        submit.disabled = false;
        submit.textContent = '들어가기';
      }
    });
  });
}
