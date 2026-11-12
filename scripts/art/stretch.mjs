// 긴 사물 늘이기(docs/art.md "타일·사물 만들기"). 생성은 긴 사물의 도트 수를 지키지 못해 짧은 견본을 받고,
// 견본의 고른 가운데 띠(칸 또는 줄)를 되풀이해 원하는 크기로 늘인다. 양 끝(모서리·특별한 장식)은 그대로 남는다.
//
//   stretch.mjs <견본.png> --out <png> [--width 180 --cols 20-39] [--height 90 --rows 30-40] [--top 0]
//     --cols a-b   되풀이할 가로 띠(견본의 칸 a~b). --width까지 늘린다. 띠 폭으로 나누어떨어지지 않으면 마지막 띠는 앞부분만 쓴다.
//     --rows a-b   되풀이할 세로 띠(줄). --height까지 늘린다. 가로를 먼저 늘이고 세로를 늘인다.
//     --whole      띠를 온전한 번수만 되풀이하고(무늬가 끊기지 않게), 모자란 너비는 양옆에 투명으로 채운다.
//     --trim       먼저 둘레의 투명한 줄·칸을 잘라 낸다(fit.mjs 결과는 프레임 위쪽이 비어 있다). 띠 번호는 자른 뒤 기준.
//     --top n, --bottom n  다 늘인 뒤 위·아래에 투명한 줄을 더한다(벽에 거는 사물을 칸 안에 놓을 때).
import { parseArgs } from 'node:util';
import { createImage, readPng, writePng } from './png.mjs';

process.on('uncaughtException', (err) => {
  console.error(err.message);
  process.exit(1);
});

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    width: { type: 'string' },
    cols: { type: 'string' },
    height: { type: 'string' },
    rows: { type: 'string' },
    top: { type: 'string', default: '0' },
    bottom: { type: 'string', default: '0' },
    whole: { type: 'boolean', default: false },
    trim: { type: 'boolean', default: false },
  },
});
const input = positionals[0];
if (!input || !opt.out || (opt.width && !opt.cols) || (opt.height && !opt.rows)) {
  console.error('사용: stretch.mjs <견본.png> --out <png> [--width W --cols a-b] [--height H --rows a-b] [--top n]');
  process.exit(2);
}

const band = (s) => {
  const m = /^(\d+)-(\d+)$/.exec(s);
  if (!m || Number(m[2]) < Number(m[1])) throw new Error(`띠는 a-b로 적습니다: ${s}`);
  return [Number(m[1]), Number(m[2])];
};

/** 한 축의 새 좌표 → 견본 좌표 */
function mapAxis(len, target, [a, b]) {
  if (b >= len) throw new Error(`띠 ${a}-${b}가 견본 크기 ${len} 밖입니다.`);
  if (target < len) throw new Error(`늘일 크기 ${target}가 견본 크기 ${len}보다 작습니다.`);
  const tail = len - 1 - b; // 띠 뒤에 남는 길이
  const bw = b - a + 1;
  return (i) => (i < a ? i : i >= target - tail ? i - (target - len) : a + ((i - a) % bw));
}

let src = readPng(input);
if (opt.trim) src = trim(src);
const W = opt.width ? Number(opt.width) : src.width;
const H = opt.height ? Number(opt.height) : src.height;
// --whole: 띠를 온전히 되풀이한 너비(innerW)만 그리고 남는 칸은 양옆 투명
let innerW = W;
if (opt.width && opt.whole) {
  const [a, b] = band(opt.cols);
  innerW = src.width + Math.floor((W - src.width) / (b - a + 1)) * (b - a + 1);
}
const padL = Math.floor((W - innerW) / 2);
const mx = opt.width ? mapAxis(src.width, innerW, band(opt.cols)) : (i) => i;
const my = opt.height ? mapAxis(src.height, H, band(opt.rows)) : (i) => i;
const top = Number(opt.top);
const bottom = Number(opt.bottom);
const out = createImage(W, H + top + bottom);
for (let y = 0; y < H; y++)
  for (let x = 0; x < innerW; x++) {
    const i = (my(y) * src.width + mx(x)) * 4;
    out.data.set(src.data.subarray(i, i + 4), ((y + top) * W + x + padL) * 4);
  }
writePng(opt.out, out);
console.log(`저장: ${opt.out} (${src.width}x${src.height} → ${W}x${H + top + bottom}${innerW < W ? `, 그림 너비 ${innerW}` : ''})`);

function trim(img) {
  const op = (x, y) => img.data[(y * img.width + x) * 4 + 3] >= 128;
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) if (op(x, y)) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y));
  if (x1 < 0) throw new Error('빈 그림입니다.');
  const out = createImage(x1 - x0 + 1, y1 - y0 + 1);
  for (let y = y0; y <= y1; y++) out.data.set(img.data.subarray((y * img.width + x0) * 4, (y * img.width + x1 + 1) * 4), (y - y0) * out.width * 4);
  return out;
}
