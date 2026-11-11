// 아이소메트릭 좌표 바꾸기. 칸 좌표(col, row)를 화면 좌표로 옮긴다.
export const TILE_W = 64;
export const TILE_H = 32;

export interface Point {
  x: number;
  y: number;
}

export function toScreen(col: number, row: number): Point {
  return {
    x: ((col - row) * TILE_W) / 2,
    y: ((col + row) * TILE_H) / 2,
  };
}

export function tileCorners(col: number, row: number): Point[] {
  const c = toScreen(col, row);
  return [
    { x: c.x, y: c.y - TILE_H / 2 },
    { x: c.x + TILE_W / 2, y: c.y },
    { x: c.x, y: c.y + TILE_H / 2 },
    { x: c.x - TILE_W / 2, y: c.y },
  ];
}
