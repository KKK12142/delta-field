// 판 위에 깔기 무늬 긋기(docs/art.md "타일·사물 만들기"). 수학실 타일 판(tileBoard)처럼 같은 판에 무늬만 다른 그림을 만든다.
//   patterns.mjs <판.png> --out <png> --kind square|triangle|hexagon --fill '#hex' --line '#hex' [--size 8]
//   판에서 --fill 색인 칸에만 무늬 선을 긋는다(테두리·그늘은 그대로).
import { parseArgs } from 'node:util';
import { readPng, writePng } from './png.mjs';

process.on('uncaughtException', (err) => {
  console.error(err.message);
  process.exit(1);
});
const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: { out: { type: 'string' }, kind: { type: 'string' }, fill: { type: 'string' }, line: { type: 'string' }, size: { type: 'string', default: '8' } },
});
const input = positionals[0];
if (!input || !opt.out || !['square', 'triangle', 'hexagon'].includes(opt.kind ?? '') || !opt.fill || !opt.line) {
  console.error("사용: patterns.mjs <판.png> --out <png> --kind square|triangle|hexagon --fill '#hex' --line '#hex' [--size 8]");
  process.exit(2);
}
const hex = (s) => [0, 2, 4].map((i) => parseInt(s.replace('#', '').slice(i, i + 2), 16));
const fill = hex(opt.fill);
const line = hex(opt.line);
const S = Number(opt.size);
const img = readPng(input);
// 무늬 원점: 채울 칸의 왼쪽 위
let x0 = Infinity;
let y0 = Infinity;
const isFill = (x, y) => {
  const i = (y * img.width + x) * 4;
  return img.data[i + 3] >= 128 && Math.abs(img.data[i] - fill[0]) + Math.abs(img.data[i + 1] - fill[1]) + Math.abs(img.data[i + 2] - fill[2]) <= 12;
};
for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) if (isFill(x, y)) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y));
const mod = (a, n) => ((a % n) + n) % n;
// 정육각형(꼭짓점이 위): 가운데 점들의 격자. 가장 가까운 두 가운데까지 거리 차가 작으면 경계
const r = S * 0.62;
const hx = Math.sqrt(3) * r;
const hy = 1.5 * r;
function hexEdge(px, py) {
  const j0 = Math.round(py / hy);
  const d = [];
  for (let j = j0 - 2; j <= j0 + 2; j++) {
    const off = mod(j, 2) ? hx / 2 : 0;
    const i0 = Math.round((px - off) / hx);
    for (let i = i0 - 2; i <= i0 + 2; i++) d.push(Math.hypot(px - (i * hx + off), py - j * hy));
  }
  d.sort((a, b) => a - b);
  return d[1] - d[0] < 0.9;
}
let n = 0;
for (let y = 0; y < img.height; y++)
  for (let x = 0; x < img.width; x++) {
    if (!isFill(x, y)) continue;
    const u = x - x0;
    const v = y - y0;
    let on = false;
    if (opt.kind === 'square') on = mod(u, S) === S - 1 || mod(v, S) === S - 1;
    else if (opt.kind === 'triangle') {
      const h = S - 1; // 높이(줄)
      const k = Math.round(((S / 2) * mod(v, h)) / h);
      const w = u + (Math.floor(v / h) % 2) * (S / 2); // 줄마다 반 칸 어긋나게(꼭짓점이 이어지게)
      on = mod(v, h) === h - 1 || mod(w - k, S) === 0 || mod(w + k, S) === 0;
    } else on = hexEdge(u + 0.5, v + 0.5);
    if (on) img.data.set([...line, 255], (y * img.width + x) * 4), n++;
  }
writePng(opt.out, img);
console.log(`저장: ${opt.out} (${opt.kind}, 선 ${n}칸)`);
