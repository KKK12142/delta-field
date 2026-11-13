// 학생 화면의 미니맵(교사 결정 2026-11-12): 장소 모양·이름과 내 위치만 보인다. 다른 학생과 미션 사물은 보이지 않는다.
// 오른쪽 아래(살펴보기 단추 위)에 늘 작게 보이고, 누르면 큰 지도가 열린다. 아직 열리지 않은 2부 장소는 흐리게, 강당(landmarks)도 그린다.
import { partOf, tileOf, type Rect, type Room } from '../data/room';
import { color, fontFamily, minimap as M } from '../theme';
import { el, uiRoot } from './dom';

/** 장소·건물 id → 장소 아이콘(public/sprites/map/<이름>.png, 24×24). 2부 복도는 복도 아이콘을 같이 쓴다. */
const ICON_OF: Record<string, string> = {
  classroom: 'classroom', hallway: 'hallway', hallway2: 'hallway', lab: 'lab', computer: 'computer', math: 'math', library: 'library',
  stairs: 'stairs', rooftop: 'rooftop', field: 'field', garden: 'garden', auditorium: 'auditorium', gate: 'gate',
};

/** 아이콘 그림(처음 불러올 때 한 번 읽어 둔다. 다 읽기 전에는 그리지 않는다) */
const icons = new Map<string, HTMLImageElement>();
function icon(id: string): HTMLImageElement | null {
  const name = ICON_OF[id];
  if (!name) return null;
  let img = icons.get(name);
  if (!img) {
    img = new Image();
    img.src = `${import.meta.env.BASE_URL}sprites/map/${name}.png`;
    icons.set(name, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}
// 미니맵을 처음 그리기 전에 읽기 시작한다.
for (const id of Object.keys(ICON_OF)) icon(id);

/** 0xRRGGBB → CSS 색 */
const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** 장소의 바닥 색(장소 가운데 칸의 바닥 타일 색) */
function floorColor(room: Room, a: Rect) {
  const tile = tileOf(room.layout[Math.floor(a.row + a.h / 2)]?.[Math.floor(a.col + a.w / 2)]);
  return tile?.floor ? css(color.tile[tile.id].fill) : M.landmark;
}

/** 지도 한 장을 그린다. scale은 칸 하나의 CSS 픽셀, labels면 장소 이름을 적는다. */
export function drawMinimap(
  canvas: HTMLCanvasElement,
  room: Room,
  scale: number,
  part: number,
  me: { col: number; row: number } | null,
  labels: boolean,
  mark: Rect | null = null,
) {
  const cols = room.layout[0].length;
  const rows = room.layout.length;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(cols * scale);
  const h = Math.round(rows * scale);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = M.background;
  ctx.fillRect(0, 0, w, h);
  const rect = (r: Rect) => [r.col * scale, r.row * scale, r.w * scale, r.h * scale] as const;
  for (const l of room.landmarks ?? []) {
    ctx.fillStyle = M.landmark;
    ctx.fillRect(...rect(l));
  }
  const locked = (a: Rect & { part?: number }) => (a.part ?? 1) > part;
  for (const a of room.areas ?? []) {
    ctx.globalAlpha = locked(a) ? M.lockedAlpha : 1;
    ctx.fillStyle = floorColor(room, a);
    ctx.fillRect(...rect(a));
  }
  ctx.globalAlpha = 1;
  // 장소 사이 문(열린 부의 문)은 지나갈 수 있는 곳이라 바닥처럼 이어 그린다.
  for (const o of room.objects) {
    if (!['door', 'entrance', 'partDoor'].includes(o.kind) || partOf(room, o) > part) continue;
    ctx.fillStyle = M.door;
    ctx.fillRect(...rect(o));
  }
  if (labels) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${M.labelFont} ${fontFamily}`; // 도트 글꼴은 굵은 꼴이 없어 굵게 하지 않는다
    const label = (text: string, r: Rect, faded: boolean, fill: string = faded ? M.lockedLabel : M.label) => {
      const [x, y, rw, rh] = rect(r);
      ctx.fillStyle = fill;
      ctx.fillText(text, x + rw / 2, y + rh / 2, rw - 4);
    };
    for (const l of room.landmarks ?? []) label(l.name, l, false, M.landmarkLabel);
    for (const a of room.areas ?? []) {
      // 잠긴 장소는 "· 2부에 열림"을 붙이되, 좁아서 들어가지 않으면 이름만 적는다(계단 등).
      const long = `${a.name} · 2부에 열림`;
      const text = locked(a) && ctx.measureText(long).width <= a.w * scale - 4 ? long : a.name;
      label(text, a, locked(a));
    }
  }
  // 장소 아이콘: 큰 지도는 이름 위에, 작은 지도는 장소 가운데에(잠긴 2부는 흐리게). 교문 아이콘은 교문 자리에.
  ctx.imageSmoothingEnabled = false;
  const iconSize = labels ? M.iconBig : M.icon;
  const places: { id: string; r: Rect; faded: boolean }[] = [
    ...(room.landmarks ?? []).map((l) => ({ id: l.id, r: l as Rect, faded: false })),
    ...(room.areas ?? []).map((a) => ({ id: a.id, r: a as Rect, faded: locked(a) })),
    ...room.objects.filter((o) => o.kind === 'gate').map((o) => ({ id: 'gate', r: o as Rect, faded: false })),
  ];
  for (const p of places) {
    const img = icon(p.id);
    const [x, y, rw, rh] = rect(p.r);
    if (!img || (p.id !== 'gate' && (rw < iconSize || (!labels && rh < iconSize)))) continue;
    ctx.globalAlpha = p.faded ? M.lockedAlpha : 1;
    const top = labels && p.id !== 'gate' ? y + rh / 2 - iconSize - M.iconGap : y + rh / 2 - iconSize / 2;
    ctx.drawImage(img, Math.round(x + rw / 2 - iconSize / 2), Math.round(top), iconSize, iconSize);
  }
  ctx.globalAlpha = 1;
  if (mark) {
    // 알림 표시: 2부가 열린 문이나 모이는 강당에 테를 두른다.
    const [x, y, rw, rh] = rect(mark);
    ctx.lineWidth = M.markLine;
    ctx.strokeStyle = M.mark;
    ctx.strokeRect(x - M.markPad, y - M.markPad, rw + 2 * M.markPad, rh + 2 * M.markPad);
  }
  if (me) {
    const r = labels ? M.dotBig : M.dot;
    ctx.beginPath();
    ctx.arc(me.col * scale, me.row * scale, r, 0, Math.PI * 2);
    ctx.fillStyle = M.me;
    ctx.fill();
    ctx.lineWidth = M.dotLine;
    ctx.strokeStyle = M.meLine;
    ctx.stroke();
  }
}

/** 오른쪽 아래의 작은 지도. 누르면 onOpen(큰 지도)을 부른다. */
export class Minimap {
  private readonly node = el('button', 'df-minimap');
  private readonly canvas = el('canvas');
  private shown = '';
  private readonly room: Room;

  constructor(room: Room, onOpen: () => void) {
    this.room = room;
    this.node.type = 'button';
    this.node.title = '지도 크게 보기';
    this.node.setAttribute('aria-label', '지도 크게 보기');
    this.node.append(this.canvas);
    this.node.addEventListener('click', () => {
      this.node.blur();
      onOpen();
    });
    uiRoot().append(this.node);
  }

  /** 내 위치와 열린 부가 바뀌었으면 다시 그린다. */
  update(me: { col: number; row: number }, part: number, mark: Rect | null = null) {
    const key = `${me.col.toFixed(1)},${me.row.toFixed(1)},${part},${mark ? `${mark.col},${mark.row}` : ''}`;
    if (key === this.shown) return;
    this.shown = key;
    drawMinimap(this.canvas, this.room, M.smallWidth / this.room.layout[0].length, part, me, false, mark);
  }

  /** 작은 지도 단추(캐릭터가 뒤에 들어가면 그 자리를 뚫는다) */
  get element(): HTMLElement {
    return this.node;
  }

  setHidden(hidden: boolean) {
    this.node.hidden = hidden;
  }

  destroy() {
    this.node.remove();
  }
}
