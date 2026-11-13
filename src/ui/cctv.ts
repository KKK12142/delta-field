import type { StudentView } from '../game/cctv';
import { el, uiRoot } from './dom';
import type { StudentState } from '../game/cctv';
import { emblem, face, setFace, uiIcon } from './pictures';

/** 하는 일 표시 그림(public/sprites/ui/status-*.png). 살펴보는 중·연결 끊김은 그림 없이 띠 색만 */
const STATUS_ICON: Partial<Record<StudentState, string>> = { quiz: 'status-quiz', stuck: 'status-stuck', escaped: 'status-done', walk: 'status-move' };

interface Row {
  node: HTMLButtonElement;
  face: HTMLElement;
  character: string;
  state: string;
  icon: string | undefined;
  classGroup: string;
  emblem: HTMLElement;
  status: HTMLElement;
  name: HTMLElement;
  className: HTMLElement;
  progress: HTMLElement;
  doing: HTMLElement;
}

export interface CctvHandlers {
  /** 학생 목록에서 한 명을 눌렀을 때 */
  pick: (id: string) => void;
  /** 따라가기에서 전체 보기로 돌아갈 때 */
  back: () => void;
  /** CCTV 모드를 끌 때 */
  close: () => void;
  /** 구역 보기 단추를 눌렀을 때(null은 전체) */
  view: (id: string | null) => void;
  /** 목록 정렬(반 순서 ↔ 진행 낮은 순)을 바꿀 때 */
  sort: () => void;
  /** 학생 암호 지우기(암호를 잊은 학생, 나간 학생도 고를 수 있다) */
  pins: () => void;
}

/** 목록 정렬: 반 순서(반, 닉네임) 또는 진행 낮은 순 */
export type CctvSort = 'class' | 'progress';

/** CCTV 구역 보기 단추 하나(맵의 views) */
export interface CctvView {
  id: string;
  name: string;
}

/** 선생님의 CCTV 모드 오른쪽 창. 전체 보기에서는 학생 목록을, 따라가기에서는 그 학생의 정보를 보인다. */
export class CctvPanel {
  private readonly node = el('aside', 'df-cctv');
  private readonly info = el('span', 'df-muted');
  private readonly empty = el('p', 'df-muted df-cctv-empty', '아직 들어온 학생이 없습니다.');
  private readonly list = el('div', 'df-cctv-list');
  private readonly detail = el('div', 'df-cctv-detail');
  private readonly detailName = el('strong', 'df-cctv-name');
  private readonly detailFace = face('');
  private readonly detailClass = el('span', 'df-text');
  private readonly detailDoing = el('span', 'df-text');
  private readonly detailProgress = el('span', 'df-text');
  private readonly detailItems = el('span', 'df-text');
  private readonly rows = new Map<string, Row>();
  private order = '';
  /** 구역 보기 단추들(전체 + 맵의 구역). 학생 수를 함께 적는다. */
  private readonly views = el('div', 'df-cctv-views');
  private readonly viewButtons = new Map<string | null, { node: HTMLButtonElement; name: string }>();
  /** 진행 요약(1부 완료·보너스·막힌 학생 수), 막힌 학생 목록, 정렬 단추. 겉모양은 화면 담당 */
  private readonly summary = el('div', 'df-cctv-summary');
  private readonly summaryLine = el('span', 'df-text df-cctv-summary-line');
  private readonly stuck = el('ul', 'df-cctv-stuck');
  private readonly sortButton = el('button', 'df-button df-button-small df-cctv-sort');
  /** 학생 암호 지우기(전체 보기 맨 아래, 되돌릴 수 없어 크림색) */
  private readonly pinsButton = el('button', 'df-button df-button-small df-button-light df-cctv-pins', '학생 암호 지우기');

  constructor(handlers: CctvHandlers, touch: boolean, views: CctvView[] = []) {
    const head = el('div', 'df-cctv-head');
    const title = el('div', 'df-cctv-title');
    title.append(el('strong', '', 'CCTV'), this.info);
    const close = el('button', 'df-button df-button-small df-button-light', 'CCTV 끄기');
    close.addEventListener('click', handlers.close);
    head.append(title, close);

    const back = el('button', 'df-button df-button-small df-button-light df-cctv-back', '전체 보기');
    back.addEventListener('click', handlers.back);
    const detailHead = el('div', 'df-cctv-detail-head');
    detailHead.append(this.detailFace, this.detailName);
    this.detail.append(
      detailHead,
      el(
        'span',
        'df-muted df-cctv-hint',
        touch ? '따라가는 중입니다. 전체 보기를 누르면 돌아갑니다.' : '따라가는 중입니다. Esc나 전체 보기를 누르면 돌아갑니다.',
      ),
      el('span', 'df-muted', '반'),
      this.detailClass,
      el('span', 'df-muted', '지금 하는 일'),
      this.detailDoing,
      el('span', 'df-muted', '진행'),
      this.detailProgress,
      el('span', 'df-muted', '가진 물건'),
      this.detailItems,
      back,
    );

    this.list.addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).closest<HTMLElement>('[data-id]')?.dataset.id;
      if (id) handlers.pick(id);
    });
    for (const v of [{ id: null, name: '전체' }, ...views]) {
      const node = el('button', 'df-button df-button-small df-cctv-view', v.name);
      node.type = 'button';
      node.addEventListener('click', () => {
        node.blur();
        handlers.view(v.id);
      });
      this.views.append(node);
      this.viewButtons.set(v.id, { node, name: v.name });
    }
    this.views.setAttribute('aria-label', '구역 보기');
    this.views.hidden = views.length === 0;
    this.sortButton.type = 'button';
    this.sortButton.addEventListener('click', () => {
      this.sortButton.blur();
      handlers.sort();
    });
    // 막힌 학생 이름을 누르면 그 학생을 따라간다.
    this.stuck.addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).closest<HTMLElement>('[data-id]')?.dataset.id;
      if (id) handlers.pick(id);
    });
    const summaryHead = el('div', 'df-row df-row-split');
    summaryHead.append(this.summaryLine, this.sortButton);
    this.summary.append(summaryHead, this.stuck);
    this.summary.setAttribute('aria-label', '진행 요약');
    this.node.setAttribute('aria-label', 'CCTV');
    this.pinsButton.type = 'button';
    this.pinsButton.addEventListener('click', () => {
      this.pinsButton.blur();
      handlers.pins();
    });
    this.node.append(head, this.views, this.summary, this.empty, this.list, this.pinsButton, this.detail);
    uiRoot().append(this.node);
  }

  /** 창 왼쪽 끝의 화면 x 좌표(픽셀). 지도를 이 창에 가리지 않게 놓을 때 쓴다. */
  get left() {
    return this.node.getBoundingClientRect().left;
  }

  /** 머리글: 방 코드, 학생 수, 반마다 학생 수 */
  setInfo(code: string, studentCount: number, perClass: string) {
    setText(this.info, `방 코드 ${code} · 학생 ${studentCount}명\n${perClass}`);
  }

  /** 구역 보기 단추: 지금 고른 구역(null은 전체)과 구역마다 학생 수 */
  setViews(active: string | null, counts: Map<string | null, number>) {
    for (const [id, b] of this.viewButtons) {
      setText(b.node, `${b.name} ${counts.get(id) ?? 0}`);
      const pressed = String(id === active);
      if (b.node.getAttribute('aria-pressed') !== pressed) b.node.setAttribute('aria-pressed', pressed);
    }
  }

  /**
   * 진행 요약: 한 줄 요약, 막힌 학생 목록(이름 · 까닭, 누르면 따라가기), 정렬 단추 글(지금 정렬의 반대로 바꾸는 단추)
   */
  setSummary(line: string, stuck: StudentView[], sort: CctvSort) {
    setText(this.summaryLine, line);
    setText(this.sortButton, sort === 'class' ? '진행 낮은 순으로' : '반 순서로');
    const key = stuck.map((s) => `${s.id}:${s.stuck}`).join('|');
    if (this.stuck.dataset.key === key) return;
    this.stuck.dataset.key = key;
    this.stuck.replaceChildren(
      ...stuck.map((s) => {
        const li = el('li', 'df-cctv-stuck-row');
        const b = el('button', 'df-cctv-stuck-name', s.nickname);
        b.type = 'button';
        b.dataset.id = s.id;
        li.append(b, el('span', 'df-muted', s.stuck ?? ''));
        return li;
      }),
    );
    this.stuck.hidden = stuck.length === 0;
  }

  /** 전체 보기: 학생 목록(이미 정렬한 순서대로) */
  showList(students: StudentView[]) {
    this.detail.hidden = true;
    this.summary.hidden = false;
    this.list.hidden = false;
    this.pinsButton.hidden = false;
    this.views.hidden = this.viewButtons.size <= 1;
    this.empty.hidden = students.length > 0;
    const seen = new Set<string>();
    for (const s of students) {
      seen.add(s.id);
      const row = this.rows.get(s.id) ?? this.addRow(s.id);
      if (row.character !== s.character) {
        row.character = s.character;
        setFace(row.face, s.character);
      }
      if (row.state !== s.state) {
        row.state = s.state;
        row.node.className = `df-cctv-row is-${s.state}`;
      }
      if (row.classGroup !== s.classGroup) {
        row.classGroup = s.classGroup;
        row.emblem.replaceChildren(...(s.classGroup ? [emblem(s.classGroup)] : []));
      }
      setText(row.name, s.nickname);
      setText(row.className, s.className);
      setText(row.progress, s.progress);
      setText(row.doing, s.stuck ? `${s.doing} · 막힘: ${s.stuck}` : s.doing);
      row.node.classList.toggle('is-stuck', s.stuck !== null);
      // 막힌 학생은 푸는 중이어도 막힘 그림을 보인다.
      const icon = s.stuck !== null ? 'status-stuck' : STATUS_ICON[s.state];
      if (row.icon !== icon) {
        row.icon = icon;
        row.status.replaceChildren(...(icon ? [uiIcon('ui', icon, 'df-status-icon')] : []));
      }
      row.node.classList.toggle('is-finished', s.finished);
    }
    for (const [id, row] of this.rows) {
      if (seen.has(id)) continue;
      row.node.remove();
      this.rows.delete(id);
    }
    const order = students.map((s) => s.id).join(',');
    if (order !== this.order) {
      this.list.append(...students.map((s) => this.rows.get(s.id)!.node));
      this.order = order;
    }
  }

  /** 따라가기: 한 학생의 정보 */
  showDetail(s: StudentView) {
    this.views.hidden = true;
    this.summary.hidden = true;
    this.list.hidden = true;
    this.empty.hidden = true;
    this.pinsButton.hidden = true;
    this.detail.hidden = false;
    setText(this.detailName, s.nickname);
    setFace(this.detailFace, s.character);
    setText(this.detailClass, s.className || '없음');
    setText(this.detailDoing, s.doing);
    setText(this.detailProgress, s.progress);
    setText(this.detailItems, s.items.length ? s.items.join(', ') : '없음');
  }

  destroy() {
    this.node.remove();
  }

  private addRow(id: string): Row {
    const node = el('button', 'df-cctv-row');
    node.type = 'button';
    node.dataset.id = id;
    const row: Row = {
      node,
      face: face('', 'df-cctv-face'),
      character: '',
      state: '',
      icon: undefined,
      classGroup: '',
      emblem: el('span', 'df-cctv-emblem'),
      status: el('span', 'df-cctv-status'),
      name: el('strong', 'df-cctv-row-name'),
      className: el('span', 'df-muted df-cctv-row-class'),
      progress: el('span', 'df-muted'),
      doing: el('span', ''),
    };
    const head = el('span', 'df-cctv-row-head');
    head.append(row.name, row.emblem, row.className);
    row.progress.classList.add('df-cctv-progress');
    const doing = el('span', 'df-cctv-row-doing');
    doing.append(row.status, row.doing);
    node.append(row.face, head, row.progress, doing);
    this.rows.set(id, row);
    return row;
  }
}

/** 글이 달라졌을 때만 바꾼다(목록을 자주 고쳐도 눌림·스크롤이 흔들리지 않게). */
function setText(node: HTMLElement, text: string) {
  if (node.textContent !== text) node.textContent = text;
}
