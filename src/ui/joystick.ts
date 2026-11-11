import { motion } from '../theme';
import { el, uiRoot } from './dom';

/** 화면 왼쪽 아래의 가상 조이스틱. 민 방향과 세기를 (x, y), 길이 0~1로 돌려준다. */
export class Joystick {
  readonly vector = { x: 0, y: 0 };
  private readonly base = el('div', 'df-joystick');
  private readonly knob = el('div', 'df-joystick-knob');
  private pointerId: number | null = null;

  constructor() {
    this.base.append(this.knob);
    this.base.setAttribute('aria-label', '조이스틱');
    uiRoot().append(this.base);
    this.base.addEventListener('pointerdown', (e) => {
      if (this.pointerId !== null) return;
      this.pointerId = e.pointerId;
      this.base.setPointerCapture(e.pointerId);
      this.update(e);
    });
    this.base.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.pointerId) this.update(e);
    });
    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.vector.x = 0;
      this.vector.y = 0;
      this.knob.style.transform = '';
    };
    this.base.addEventListener('pointerup', release);
    this.base.addEventListener('pointercancel', release);
  }

  /** 감추면 놓은 것으로 친다. */
  setHidden(hidden: boolean) {
    this.base.hidden = hidden;
    if (!hidden) return;
    this.pointerId = null;
    this.vector.x = 0;
    this.vector.y = 0;
    this.knob.style.transform = '';
  }

  destroy() {
    this.base.remove();
  }

  private update(e: PointerEvent) {
    const r = this.base.getBoundingClientRect();
    const radius = r.width / 2;
    let dx = (e.clientX - (r.left + radius)) / radius;
    let dy = (e.clientY - (r.top + radius)) / radius;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    this.knob.style.transform = `translate(${dx * radius}px, ${dy * radius}px)`;
    const strength = Math.min(len, 1);
    if (strength < motion.joystickDeadZone) {
      this.vector.x = 0;
      this.vector.y = 0;
    } else {
      this.vector.x = dx;
      this.vector.y = dy;
    }
  }
}
