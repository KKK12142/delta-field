// 지도 위에 겹쳐 뜬 안내(학교 맵의 왼쪽 위·오른쪽 위 안내와 미니맵, 골든벨 맵의 문제 카드·내 상태) 뒤에 내 캐릭터가 들어가면
// 그 자리만 안내를 뚫는다(교사 요청 2026-11-13). 다른 학생 자리는 뚫지 않는다(교사 결정, 같은 날). mask는 겉모양만 바꾸므로 뚫린 자리의 단추도 그대로 눌린다.
// 선생님 공지(.df-announce)와 대화상자는 뚫지 않는다(여기 넘기지 않는다).
// CSS mask에 타원 구멍(radial-gradient)을 넣는다(spot이 여럿이면 겹쳐 intersect). 겹친 자리가 없으면 mask를 지운다.
// 매 프레임 부르지만, mask 글이 달라졌을 때만 스타일을 쓴다(구멍 위치는 seeThrough.step 픽셀 단위로 맞춘다).
import { seeThrough as S } from '../theme';

/** 화면(CSS 픽셀, 창 기준)의 캐릭터 타원: 가운데와 가로·세로 반지름 */
export interface Spot {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

/** mask-composite: intersect를 모르는 브라우저(옛 Safari)는 -webkit- 이름과 source-in을 쓴다. */
const standard = typeof CSS !== 'undefined' && CSS.supports('mask-composite', 'intersect');
const IMAGE = standard ? 'mask-image' : '-webkit-mask-image';
const COMPOSITE = standard ? 'mask-composite' : '-webkit-mask-composite';
const INTERSECT = standard ? 'intersect' : 'source-in';

const snap = (v: number) => Math.round(v / S.step) * S.step;

export class SeeThrough {
  /** 안내 → 지금 넣어 둔 mask 글('' = 없음) */
  private readonly shown = new Map<HTMLElement, string>();
  private readonly nodes: () => HTMLElement[];

  /** nodes: 뚫을 안내들(감춰져 있으면 크기가 0이라 건너뛴다) */
  constructor(nodes: () => HTMLElement[]) {
    this.nodes = nodes;
  }

  /** spots: 뚫을 자리(지금은 내 캐릭터 하나, MapScene.mySpot). 빈 목록이면 구멍을 모두 지운다. */
  update(spots: Spot[]) {
    for (const node of this.nodes()) {
      const r = node.getBoundingClientRect();
      const holes: string[] = [];
      if (r.width > 0 && r.height > 0) {
        for (const s of spots) {
          if (s.x + s.rx <= r.left || s.x - s.rx >= r.right || s.y + s.ry <= r.top || s.y - s.ry >= r.bottom) continue;
          const rx = Math.max(S.step, snap(s.rx));
          const ry = Math.max(S.step, snap(s.ry));
          holes.push(
            `radial-gradient(${rx}px ${ry}px at ${snap(s.x - r.left)}px ${snap(s.y - r.top)}px, ${S.hole} ${S.clear * 100}%, ${S.keep} 100%)`,
          );
        }
      }
      this.apply(node, holes.join(', '));
    }
  }

  /** 모든 구멍을 지운다. */
  clear() {
    for (const node of this.shown.keys()) this.apply(node, '');
  }

  private apply(node: HTMLElement, mask: string) {
    if ((this.shown.get(node) ?? '') === mask) return;
    this.shown.set(node, mask);
    if (mask) {
      node.style.setProperty(IMAGE, mask);
      node.style.setProperty(COMPOSITE, INTERSECT);
    } else {
      node.style.removeProperty(IMAGE);
      node.style.removeProperty(COMPOSITE);
    }
    node.classList.toggle('df-see-through', mask !== '');
  }
}
