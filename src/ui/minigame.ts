// 미니게임 화면(HTML): 위쪽 가운데 진행 칸(이름·남은 시간·내 점수), 시작 전 세기 큰 숫자, 줄다리기 창.
// 동작은 RoomScene이 정하고 여기서는 글과 모양만 바꾼다. 겉모양(CSS)은 화면 담당(src/ui/ui.css의 "미니게임" 절).
import { CLASS_GROUPS } from '../../shared/protocol.ts';
import { el, uiRoot } from './dom';

/** 글이 달라졌을 때만 바꾼다. */
function setText(node: HTMLElement, text: string) {
  if (node.textContent !== text) node.textContent = text;
}

/** ui 그림 주소 */
const ui = (name: string) => `${import.meta.env.BASE_URL}sprites/ui/${name}.png`;

/** 위쪽 가운데 진행 칸과 시작 전 세기 */
export class MiniHud {
  private readonly box = el('div', 'df-mini');
  private readonly title = el('strong', 'df-mini-title');
  private readonly time = el('span', 'df-mini-time');
  private readonly score = el('span', 'df-mini-score');
  private readonly help = el('span', 'df-mini-help');
  private readonly count = el('div', 'df-mini-count');

  constructor() {
    this.box.setAttribute('role', 'status');
    this.box.append(this.title, this.time, this.score, this.help);
    this.box.hidden = true;
    this.count.hidden = true;
    this.count.setAttribute('aria-live', 'assertive');
    uiRoot().append(this.box, this.count);
  }

  /** 진행 칸. null이면 감춘다. */
  show(v: { title: string; time: string; score: string; help: string } | null) {
    this.box.hidden = v === null;
    if (!v) return;
    setText(this.title, v.title);
    setText(this.time, v.time);
    setText(this.score, v.score);
    setText(this.help, v.help);
    this.score.hidden = v.score === '';
    this.help.hidden = v.help === '';
  }

  /** 시작 전 세기(3·2·1). 0이면 감춘다. */
  showCount(n: number) {
    this.count.hidden = n <= 0;
    setText(this.count, n > 0 ? String(n) : '');
  }

  destroy() {
    this.box.remove();
    this.count.remove();
  }
}

/** 줄다리기 창에 보일 것 */
export interface TugView {
  time: string;
  /** 반 id → 학생 한 명의 평균 누른 수 */
  avg: Record<string, number>;
  /** 줄 위치: -1(AI.SW반 끝) ~ 1(수과학반 끝) */
  pos: number;
  /** 누를 수 있는지(내 반이 있는 학생, 하는 중) */
  canPull: boolean;
  /** 내 반 id(선생님은 '') */
  myClass: string;
  /** 내가 센 누른 수 */
  mine: number;
}

/**
 * 줄다리기 창(화면 전체): 가운데 줄과 양쪽 반 상징, 아주 큰 "당기기" 단추. 수과학반은 왼쪽, AI.SW반은 오른쪽.
 * 줄 가운데 리본은 --df-tug(-1~1, 왼쪽이 1)로 옮긴다.
 */
export class TugPanel {
  private readonly node = el('div', 'df-tug');
  private readonly time = el('span', 'df-tug-time');
  private readonly rope = el('div', 'df-tug-rope');
  private readonly avg = new Map<string, HTMLElement>();
  private readonly pull = el('button', 'df-tug-pull', '당기기');
  private readonly mine = el('span', 'df-tug-mine');
  private touchedAt = -Infinity;

  constructor(onPull: () => void) {
    const head = el('div', 'df-tug-head');
    head.append(el('strong', 'df-tug-title', '줄다리기'), this.time);
    const field = el('div', 'df-tug-field');
    const side = (id: string, name: string) => {
      const box = el('div', `df-tug-side is-${id}`);
      const emblem = el('img', 'df-tug-emblem');
      emblem.src = ui(`emblem-${id}`);
      emblem.alt = '';
      const avg = el('span', 'df-tug-avg');
      this.avg.set(id, avg);
      box.append(emblem, el('strong', 'df-tug-name', name), avg);
      return box;
    };
    const mark = el('img', 'df-tug-mark');
    mark.src = `${import.meta.env.BASE_URL}sprites/mini/rope-mark.png`;
    mark.alt = '';
    this.rope.append(el('i', 'df-tug-line'), mark);
    const [science, aisw] = CLASS_GROUPS;
    field.append(side(science.id, science.name), this.rope, side(aisw.id, aisw.name));
    // 손가락을 대는 순간 누른 것으로 친다(두 손가락으로 번갈아 빠르게 누를 수 있게). 마우스는 click으로.
    this.pull.type = 'button';
    this.pull.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      e.preventDefault();
      this.touchedAt = performance.now();
      onPull();
    });
    this.pull.addEventListener('click', () => {
      if (performance.now() - this.touchedAt > 600) onPull();
    });
    this.pull.addEventListener('touchend', (e) => e.preventDefault());
    this.node.append(head, field, this.pull, this.mine, el('p', 'df-tug-help', '단추를 빠르게 누릅니다. 키보드는 스페이스바도 됩니다.'));
    this.node.setAttribute('role', 'dialog');
    this.node.setAttribute('aria-label', '줄다리기');
    uiRoot().append(this.node);
  }

  show(v: TugView) {
    setText(this.time, v.time);
    for (const [id, node] of this.avg) setText(node, `평균 ${v.avg[id]?.toFixed(1) ?? '0.0'}번`);
    this.rope.style.setProperty('--df-tug', String(Math.max(-1, Math.min(1, v.pos))));
    this.pull.disabled = !v.canPull;
    this.pull.classList.toggle(`is-${v.myClass}`, v.myClass !== '');
    setText(this.mine, v.myClass ? `내가 당긴 수 ${v.mine}번` : '선생님은 지켜봅니다.');
  }

  destroy() {
    this.node.remove();
  }
}
