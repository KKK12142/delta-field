// 강당 지붕 타일(docs/art.md "강당 지붕"). 생성 견본(art/raw/roofTop)의 색과 짜임(세로 금속판, 가운데 용마루, 둘레 처마·박공 테)을
// 규칙대로 30×30 칸에 다시 짠다. 견본은 판 폭·줄 위치가 30칸 박자에 맞지 않아 그대로 자르지 않는다.
//
//   roof.mjs --out <폴더> [--seed 3]
//   만드는 것(폴더 안 PNG, 칸 30×30):
//     roofN.png      용마루 위쪽(북쪽) 비탈. 변형 4칸(120×30)
//     roofS.png      용마루 아래쪽(남쪽) 비탈, 조금 어둡다. 변형 4칸
//     roofRidge.png  용마루 칸: 위는 북쪽 비탈, 가운데 용마루, 아래는 남쪽 비탈. 변형 2칸
//     roofEdgeN·S·W·E.png       둘레 테(처마·박공). 테 띠만 있고 나머지는 투명. 비탈 위에 겹쳐 그린다
//     roofEdgeNW·NE·SW·SE.png   모서리(두 테가 만나는 6×6). 두 테를 그린 뒤 겹친다
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { createImage, writePng } from './png.mjs';

const { values: opt } = parseArgs({ options: { out: { type: 'string' }, seed: { type: 'string', default: '3' } } });
if (!opt.out) {
  console.error('사용: roof.mjs --out <폴더> [--seed 3]');
  process.exit(2);
}
const T = 30;
const PANEL = 10; // 금속판 폭(30의 약수라 칸을 어떻게 이어도 이음이 맞는다. 견본의 6은 맵에서 잔 줄무늬로 보여 넓혔다)
const EDGE = 6; // 테 폭: 바깥 외곽선 1 + 밝은 2 + 중간 2 + 안쪽 선 1
// 견본에서 고른 색
const C = {
  line: '#23294a', // 외곽선·용마루 선
  slopeN: '#6582a0',
  slopeS: '#4f6c89',
  seamN: '#8fa9c3', // 판 이음 솟은 곳(밝음)
  shadeN: '#56728f', // 판 이음 그늘
  seamS: '#7590ac',
  shadeS: '#425d79',
  spotLight: '#88a6c1',
  spotDark: '#466481',
  capLight: '#d6dee8',
  capMid: '#a6b7c7',
};
let s = Number(opt.seed) || 3;
const rand = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
const put = (img, x, y, h) => img.data.set(hex(h), (y * img.width + x) * 4);

/** 비탈 한 줄(y)을 칸 v에 칠한다. side는 'N' 또는 'S' */
function slopeRow(img, v, y, side) {
  for (let x = 0; x < T; x++) {
    const k = x % PANEL;
    put(img, v * T + x, y, k === 0 ? C[`seam${side}`] : k === 1 ? C[`shade${side}`] : C[`slope${side}`]);
  }
}
/** 판 가운데(이음이 아닌 곳)에 2~3도트 얼룩. 견본처럼 계단 모양 두 줄 */
function spots(img, v, y0, y1, n) {
  for (let i = 0; i < n; i++) {
    const panel = Math.floor(rand() * (T / PANEL));
    const x = v * T + panel * PANEL + 2 + Math.floor(rand() * (PANEL - 5));
    const y = y0 + Math.floor(rand() * (y1 - y0 - 1));
    const c = rand() < 0.6 ? C.spotLight : C.spotDark;
    put(img, x + 1, y, c);
    put(img, x + 2, y, c);
    put(img, x, y + 1, c);
    put(img, x + 1, y + 1, c);
  }
}
function slope(side, n) {
  const img = createImage(T * n, T);
  for (let v = 0; v < n; v++) {
    for (let y = 0; y < T; y++) slopeRow(img, v, y, side);
    spots(img, v, 0, T, v === 0 ? 0 : 1 + (v % 2));
  }
  return img;
}
// 용마루: 12줄 북쪽 비탈, 선 1, 밝은 3, 중간 3, 선 1, 남은 10줄 남쪽 비탈
function ridge(n) {
  const img = createImage(T * n, T);
  const cap = [C.line, C.capLight, C.capLight, C.capLight, C.capMid, C.capMid, C.capMid, C.line];
  for (let v = 0; v < n; v++) {
    for (let y = 0; y < T; y++) {
      if (y < 12) slopeRow(img, v, y, 'N');
      else if (y < 12 + cap.length) for (let x = 0; x < T; x++) put(img, v * T + x, y, cap[y - 12]);
      else slopeRow(img, v, y, 'S');
    }
    // 용마루 덮개 이음(15칸마다 밝은 줄 끊김)
    if (v === 1) for (let y = 13; y < 19; y++) put(img, v * T + 14, y, C.capMid);
  }
  return img;
}
// 테 띠: 바깥에서 안쪽으로 선, 밝음 2, 중간 2, 선
const BAND = [C.line, C.capLight, C.capLight, C.capMid, C.capMid, C.line];
function edge(dir) {
  const img = createImage(T, T);
  for (let i = 0; i < EDGE; i++)
    for (let j = 0; j < T; j++) {
      if (dir === 'N') put(img, j, i, BAND[i]);
      if (dir === 'S') put(img, j, T - 1 - i, BAND[i]);
      if (dir === 'W') put(img, i, j, BAND[i]);
      if (dir === 'E') put(img, T - 1 - i, j, BAND[i]);
    }
  return img;
}
// 모서리 6×6: 바깥 두 변은 선, 안쪽 두 변도 선, 속은 밝음(위·왼쪽) 또는 중간
function corner(dir) {
  const img = createImage(T, T);
  const x0 = dir.includes('W') ? 0 : T - EDGE;
  const y0 = dir.includes('N') ? 0 : T - EDGE;
  for (let i = 0; i < EDGE; i++)
    for (let j = 0; j < EDGE; j++) {
      const border = i === 0 || j === 0 || i === EDGE - 1 || j === EDGE - 1;
      const light = (dir.includes('W') ? i : EDGE - 1 - i) < 3 && (dir.includes('N') ? j : EDGE - 1 - j) < 3;
      put(img, x0 + i, y0 + j, border ? C.line : light ? C.capLight : C.capMid);
    }
  return img;
}

mkdirSync(opt.out, { recursive: true });
const save = (name, img) => {
  writePng(join(opt.out, `${name}.png`), img);
  console.log(`저장: ${join(opt.out, name)}.png (${img.width}x${img.height})`);
};
save('roofN', slope('N', 4));
save('roofS', slope('S', 4));
save('roofRidge', ridge(2));
for (const d of ['N', 'S', 'W', 'E']) save(`roofEdge${d}`, edge(d));
for (const d of ['NW', 'NE', 'SW', 'SE']) save(`roofEdge${d}`, corner(d));
