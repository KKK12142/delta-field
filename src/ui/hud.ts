import { el, uiRoot } from './dom';

/** 위쪽 안내(방 이름, 목표, 조작 방법 / 방 코드, 접속 상태, 가진 물건)와 오른쪽 아래 살펴보기 단추 */
export class Hud {
  private readonly top = el('div', 'df-hud');
  private readonly items = el('span', 'df-text');
  private readonly room = el('strong', 'df-room-code');
  private readonly people = el('span', 'df-muted');
  private readonly status = el('span', 'df-status');
  readonly action = el('button', 'df-button df-action', '살펴보기');

  constructor(roomName: string, goal: string, touch: boolean) {
    const left = el('div', 'df-hud-box');
    left.append(
      el('strong', '', roomName),
      el('span', 'df-text', goal),
      el(
        'span',
        'df-muted',
        touch
          ? '왼쪽 아래 조이스틱으로 움직이고, 살펴보기 단추를 누릅니다.'
          : '방향키나 WASD로 움직이고, 스페이스바로 살펴봅니다.',
      ),
    );
    const right = el('div', 'df-hud-box');
    this.people.hidden = true;
    this.status.hidden = true;
    right.append(this.room, this.people, this.status, el('span', 'df-muted', '가진 물건'), this.items);
    this.top.append(left, right);
    this.action.disabled = true;
    uiRoot().append(this.top, this.action);
    this.setItems([]);
  }

  setItems(names: string[]) {
    this.items.textContent = names.length ? names.join(', ') : '없음';
  }

  setRoomCode(code: string) {
    this.room.textContent = `방 코드 ${code}`;
  }

  /** 선생님 화면에만 쓴다. */
  setStudentCount(n: number) {
    this.people.hidden = false;
    this.people.textContent = `학생 ${n}명 접속`;
  }

  setStatus(text: string | null) {
    this.status.hidden = text === null;
    this.status.textContent = text ?? '';
  }

  /** 살펴볼 수 있는 사물이 가까이 있으면 단추를 켠다. */
  setTarget(name: string | null) {
    this.action.disabled = name === null;
    this.action.title = name ? `${name} 살펴보기` : '';
  }

  destroy() {
    this.top.remove();
    this.action.remove();
  }
}
