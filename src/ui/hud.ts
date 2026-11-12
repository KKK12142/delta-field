import { motion } from '../theme';
import { el, uiRoot } from './dom';
import { itemIcon } from './pictures';

/** 터치로 누른 뒤 이 시간(ms) 안에 오는 click은 같은 누름으로 보고 버린다. */
const TOUCH_CLICK_GUARD = 800;

/** 위쪽 안내(지금 장소, 목표, 조작 방법 / 방 코드, 접속 상태, 가진 물건)와 오른쪽 아래 살펴보기 단추 */
export class Hud {
  private readonly top = el('div', 'df-hud');
  private readonly place = el('strong', 'df-hud-place');
  private readonly right = el('div', 'df-hud-box');
  private readonly help = el('span', 'df-muted');
  private readonly items = el('div', 'df-items');
  private readonly room = el('strong', 'df-room-code');
  private readonly people = el('span', 'df-muted');
  private readonly status = el('span', 'df-status');
  readonly action = el('button', 'df-button df-action', '살펴보기');
  /** 얻은 힌트 카드를 다시 본다(모두). 글에 얻은 수를 적는다. */
  readonly notebook = el('button', 'df-button df-button-small df-button-light', '힌트 수첩');
  /** 선생님 화면에만 보인다. 자주 누르는 단추(CCTV 파랑, 모으기 금색)와 되돌리기 어려운 단추(자료 바꾸기, 2부 열기)를 떼어 놓는다. */
  readonly escapeFile = el('button', 'df-button df-button-small df-button-light', '방탈출 자료');
  readonly cctv = el('button', 'df-button df-button-small', 'CCTV 보기');
  /** 강당으로 모으기(모으는 중에는 모으기 그만두기) */
  readonly goldenbell = el('button', 'df-button df-button-small df-button-gold', '강당으로 모으기');
  /** 2부 열기(연 뒤에는 잠긴다) */
  readonly part = el('button', 'df-button df-button-small df-button-light', '2부 열기');
  /** 강당으로 모으기 남은 시간과 안내(모두에게) */
  private readonly notice = el('div', 'df-hud-box df-hud-notice');
  private readonly left = el('div', 'df-hud-column');
  /** 화면 가운데 큰 알림 */
  private readonly bannerNode = el('div', 'df-banner');
  private bannerTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly touch: boolean;

  constructor(goal: string, touch: boolean, teacher: boolean) {
    this.touch = touch;
    const left = el('div', 'df-hud-box');
    left.append(this.place, el('span', 'df-text', goal), this.help);
    this.notice.hidden = true;
    this.notice.setAttribute('role', 'status');
    this.left.append(left, this.notice);
    this.people.hidden = true;
    this.status.hidden = true;
    this.cctv.hidden = this.goldenbell.hidden = this.part.hidden = this.escapeFile.hidden = !teacher;
    const teacherMain = el('div', 'df-hud-buttons');
    teacherMain.append(this.cctv, this.goldenbell);
    const teacherDanger = el('div', 'df-hud-buttons df-hud-danger');
    teacherDanger.append(this.escapeFile, this.part);
    teacherMain.hidden = teacherDanger.hidden = !teacher;
    this.right.append(
      this.room,
      this.people,
      this.status,
      el('span', 'df-muted', '가진 물건'),
      this.items,
      this.notebook,
      teacherMain,
      teacherDanger,
    );
    this.top.append(this.left, this.right);
    this.action.disabled = true;
    this.bannerNode.hidden = true;
    this.bannerNode.setAttribute('role', 'status');
    uiRoot().append(this.top, this.action, this.bannerNode);
    this.setItems([]);
    this.setCctv(false);
  }

  /** 힌트 수첩 단추에 얻은 수를 적는다(예: "1부 3/8 · 2부 0/8"). */
  setHints(summary: string) {
    const label = `힌트 수첩 ${summary}`;
    if (this.notebook.textContent !== label) this.notebook.textContent = label;
  }

  /** 화면 가운데 큰 알림을 잠깐(motion.bannerMs) 띄운다. 겉모양은 화면 담당(df-banner). */
  banner(title: string, text: string) {
    this.bannerNode.replaceChildren(el('strong', 'df-banner-title', title), el('span', 'df-banner-text', text));
    this.bannerNode.hidden = false;
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => {
      this.bannerNode.hidden = true;
    }, motion.bannerMs);
  }

  /** 강당으로 모으기 안내(null이면 감춘다). 글이 달라졌을 때만 바꾼다. */
  setNotice(text: string | null) {
    this.notice.hidden = text === null;
    if (text !== null && this.notice.textContent !== text) this.notice.textContent = text;
  }

  /** 선생님: 모으는 중이면 단추가 "모으기 그만두기"가 된다. */
  setGathering(on: boolean) {
    const label = on ? '모으기 그만두기' : '강당으로 모으기';
    if (this.goldenbell.textContent !== label) this.goldenbell.textContent = label;
  }

  /** 선생님: 2부를 열었으면 단추를 잠근다. */
  setPart(part: number) {
    const label = part >= 2 ? '2부 열림' : '2부 열기';
    if (this.part.textContent !== label) this.part.textContent = label;
    this.part.disabled = part >= 2;
  }

  /** 지금 서 있는 장소 이름(교실, 복도 등)과 그 장소의 미션 수(예: "과학실 · 미션 1/4") */
  setPlace(text: string) {
    if (this.place.textContent !== text) this.place.textContent = text;
  }

  /** 가진 물건: 아이콘 칸(아이콘이 없으면 이름을 적은 칸). 이름은 늘 글로도 넣어 둔다(읽어 주기·확인용). */
  setItems(names: string[]) {
    const key = names.join('\n');
    if (this.items.dataset.key === key) return;
    this.items.dataset.key = key;
    if (!names.length) {
      this.items.replaceChildren(el('span', 'df-muted', '없음'));
      return;
    }
    this.items.replaceChildren(
      ...names.map((name) => {
        const icon = itemIcon(name);
        const slot = el('span', icon ? 'df-slot' : 'df-slot df-slot-text');
        slot.title = name;
        if (icon) {
          const img = el('img', 'df-slot-icon');
          img.src = icon;
          img.alt = '';
          slot.append(img, el('span', 'df-sr', name));
        } else slot.textContent = name;
        return slot;
      }),
    );
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

  /**
   * 살펴보기 단추를 누르면 handler를 부른다. 터치는 손가락을 대는 순간 누른 것으로 친다.
   * 다른 손가락이 조이스틱을 쥐고 있으면 브라우저가 click을 만들지 않기 때문이다.
   * 손가락을 뗄 때 생기는 click은 막는다(그새 뜬 대화상자의 단추가 눌리지 않게).
   */
  onAction(handler: () => void) {
    let touchedAt = -Infinity;
    this.action.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || this.action.disabled) return;
      e.preventDefault();
      touchedAt = performance.now();
      handler();
    });
    this.action.addEventListener('touchend', (e) => e.preventDefault());
    this.action.addEventListener('click', () => {
      if (performance.now() - touchedAt > TOUCH_CLICK_GUARD) handler();
    });
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
        ? '화면 왼쪽을 누른 채 끌어 움직이고, 살펴보기 단추를 누릅니다.'
        : '방향키나 WASD로 움직이고, 스페이스바로 살펴봅니다.';
  }

  destroy() {
    clearTimeout(this.bannerTimer);
    this.top.remove();
    this.action.remove();
    this.bannerNode.remove();
  }
}
