import { el, uiRoot } from './dom';

/** 위쪽 안내(방 이름, 목표, 조작 방법 / 방 코드, 접속 상태, 가진 물건)와 오른쪽 아래 살펴보기 단추 */
export class Hud {
  private readonly top = el('div', 'df-hud');
  private readonly right = el('div', 'df-hud-box');
  private readonly help = el('span', 'df-muted');
  private readonly items = el('span', 'df-text');
  private readonly room = el('strong', 'df-room-code');
  private readonly people = el('span', 'df-muted');
  private readonly status = el('span', 'df-status');
  readonly action = el('button', 'df-button df-action', '살펴보기');
  /** 선생님 화면에만 보인다. */
  readonly cctv = el('button', 'df-button df-button-small', 'CCTV 보기');
  readonly goldenbell = el('button', 'df-button df-button-small', '골든벨 시작');
  private readonly touch: boolean;

  constructor(roomName: string, goal: string, touch: boolean, teacher: boolean) {
    this.touch = touch;
    const left = el('div', 'df-hud-box');
    left.append(el('strong', '', roomName), el('span', 'df-text', goal), this.help);
    this.people.hidden = true;
    this.status.hidden = true;
    this.cctv.hidden = this.goldenbell.hidden = !teacher;
    this.right.append(
      this.room,
      this.people,
      this.status,
      el('span', 'df-muted', '가진 물건'),
      this.items,
      this.cctv,
      this.goldenbell,
    );
    this.top.append(left, this.right);
    this.action.disabled = true;
    uiRoot().append(this.top, this.action);
    this.setItems([]);
    this.setCctv(false);
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

  /** CCTV 모드에서는 오른쪽 안내와 살펴보기 단추를 감추고(오른쪽은 CCTV 창이 쓴다) 조작 안내를 바꾼다. */
  setCctv(on: boolean) {
    this.top.classList.toggle('has-panel', on);
    this.right.hidden = on;
    this.action.hidden = on;
    this.help.textContent = on
      ? '목록이나 지도에서 학생을 누르면 그 학생을 따라갑니다.'
      : this.touch
        ? '왼쪽 아래 조이스틱으로 움직이고, 살펴보기 단추를 누릅니다.'
        : '방향키나 WASD로 움직이고, 스페이스바로 살펴봅니다.';
  }

  destroy() {
    this.top.remove();
    this.action.remove();
  }
}
