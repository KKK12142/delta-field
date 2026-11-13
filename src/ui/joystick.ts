import { motion } from '../theme';
import { el, uiRoot } from './dom';

/**
 * 터치 기기의 가상 조이스틱. 화면 어디든(영역 너비는 theme의 joystickZone) 누르면 그 자리를 가운데로 바탕과 손잡이가 나타나고,
 * 끌면 민 방향과 세기를 (x, y), 길이 0~1로 돌려준다. 떼면 사라진다. 손대지 않을 때는 아무것도 보이지 않는다.
 * 영역은 #ui의 맨 앞에 넣어 안내 단추, 살펴보기 단추, 미니맵, 대화상자, 창보다 아래에 깔린다(그것들은 그대로 눌린다).
 * 지도(캔버스)를 누르는 동작은 선생님 CCTV 모드뿐이고, 그때는 영역을 감춘다(setHidden).
 */
export class Joystick {
  readonly vector = { x: 0, y: 0 };
  private readonly zone = el('div', 'df-joystick-zone');
  private readonly base = el('div', 'df-joystick');
  private readonly knob = el('div', 'df-joystick-knob');
  private pointerId: number | null = null;
  /** 바탕 가운데(화면 좌표)와 반지름(픽셀) */
  private center = { x: 0, y: 0 };
  private radius = 0;

  constructor() {
    this.base.append(this.knob);
    this.base.hidden = true;
    this.zone.append(this.base);
    this.zone.setAttribute('aria-label', '조이스틱 영역');
    uiRoot().prepend(this.zone);
    this.zone.addEventListener('pointerdown', (e) => {
      // 다른 손가락이 이미 조이스틱을 쓰고 있으면 두 번째 손가락은 무시한다.
      if (this.pointerId !== null) return;
      e.preventDefault();
      this.pointerId = e.pointerId;
      this.zone.setPointerCapture(e.pointerId);
      this.showAt(e.clientX, e.clientY);
      this.update(e);
    });
    this.zone.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.pointerId) this.update(e);
    });
    const release = (e: PointerEvent) => {
      if (e.pointerId === this.pointerId) this.reset();
    };
    this.zone.addEventListener('pointerup', release);
    this.zone.addEventListener('pointercancel', release);
    this.zone.addEventListener('lostpointercapture', release);
  }

  /** 감추면(CCTV 모드) 영역도 사라져 그 아래 지도를 누를 수 있다. 감출 때는 놓은 것으로 친다. */
  setHidden(hidden: boolean) {
    this.zone.hidden = hidden;
    if (hidden) this.reset();
  }

  destroy() {
    this.zone.remove();
  }

  /** 누른 자리를 가운데로 바탕을 띄운다. 바탕이 화면 밖으로 나가지 않게 가운데를 안쪽으로 당긴다. */
  private showAt(x: number, y: number) {
    this.base.hidden = false;
    this.radius = this.base.offsetWidth / 2;
    const r = this.radius;
    this.center = {
      x: Math.min(Math.max(x, r), Math.max(r, innerWidth - r)),
      y: Math.min(Math.max(y, r), Math.max(r, innerHeight - r)),
    };
    const z = this.zone.getBoundingClientRect();
    this.base.style.left = `${this.center.x - z.left - r}px`;
    this.base.style.top = `${this.center.y - z.top - r}px`;
  }

  private reset() {
    this.pointerId = null;
    this.vector.x = 0;
    this.vector.y = 0;
    this.knob.style.transform = '';
    this.base.hidden = true;
  }

  private update(e: PointerEvent) {
    const radius = this.radius || 1;
    let dx = (e.clientX - this.center.x) / radius;
    let dy = (e.clientY - this.center.y) / radius;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    this.knob.style.transform = `translate(${dx * radius}px, ${dy * radius}px)`;
    if (Math.min(len, 1) < motion.joystickDeadZone) {
      this.vector.x = 0;
      this.vector.y = 0;
    } else {
      this.vector.x = dx;
      this.vector.y = dy;
    }
  }
}
