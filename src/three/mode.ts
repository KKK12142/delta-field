// 3D 화면의 맵별 부분(안내·선생님 단추·맵에만 있는 그림). view3d.ts가 맵을 옮길 때마다 새로 만들고 지운다.
// 학교 맵은 school3d.ts, 골든벨 경기장은 goldenbell3d.ts(design/gdd/goldenbell-3d.md).
import type { Scene } from 'three';
import type { Player } from '../../shared/schema.ts';
import type { Room } from '../data/room';
import type { Net } from '../net/connection';
import type { Dialog } from '../ui/dialog';
import type { Character } from './characters';

/** 맵 부분을 만들 때 넘기는 것 */
export interface ModeContext {
  net: Net;
  dialog: Dialog;
  touch: boolean;
  room: Room;
  scene: Scene;
  /** 내 캐릭터: 발 위치(칸)를 읽고, 옮겨 서버에 알린다(미니게임이 시작 전 자리로 되돌릴 때) */
  me: { pos(): { col: number; row: number }; teleport(col: number, row: number): void };
}

/** 바닥 네모(칸) */
export interface TileRect {
  col: number;
  row: number;
  w: number;
  h: number;
}

export interface MapMode {
  /** 지도 위에 겹친 안내(내 캐릭터가 뒤에 들어가면 뚫는다, src/ui/seeThrough.ts). 뚫지 않으면 빈 목록 */
  readonly overMap: HTMLElement[];
  /** 매 프레임: 서버 상태로 안내와 맵 그림을 고친다. place는 내가 선 장소 이름 */
  update(time: number, place: string): void;
  /** 매 프레임: 한 사람(나 포함)의 보이는 모습(투명도·머리 위 목숨·동작)을 정한다 */
  decorate(ch: Character, p: Player, id: string, me: boolean, time: number): void;
  /** 지도로 쓰지 않는 화면 가장자리(CSS 픽셀): 위(안내 카드), 오른쪽(선생님 창) */
  reserved(): { top: number; right: number };
  /** 선생님 전체 보기면 한 화면에 맞출 바닥 네모, 아니면 null(나를 따라간다) */
  overview(): TileRect | null;
  /** 학생 화면에서 보이는 칸 수(화면 짧은 쪽). null이면 theme.three의 viewTiles */
  viewTiles(): number | null;
  /** 연결 상태 글(끊겨 다시 연결하는 중) */
  setStatus(text: string | null): void;
  /** 내 발이 (col, row)에 설 수 있는지(벽·사물 말고 맵 부분이 더 막는 것, 예: 공 피하기 운동장 밖). 없으면 막지 않는다 */
  allows?(col: number, row: number): boolean;
  /** 지금 걷지 못하게 막는지(예: 줄다리기 중). 없으면 막지 않는다 */
  frozen?(): boolean;
  /** 개발 확인용으로 window.__df에 더할 함수 */
  devHooks(): Record<string, unknown>;
  dispose(): void;
}
