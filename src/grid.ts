// 탑다운 좌표 바꾸기. 칸 좌표(col, row)를 화면 좌표로 옮긴다.
// 맵 데이터는 칸 좌표로 적고, 화면에 그릴 때만 픽셀로 바꾼다.
import { size } from './theme';

export interface Point {
  x: number;
  y: number;
}

/** 칸의 가운데 점 */
export function toScreen(col: number, row: number): Point {
  return { x: (col + 0.5) * size.tile, y: (row + 0.5) * size.tile };
}
