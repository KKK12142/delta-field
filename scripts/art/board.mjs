// 여러 그림을 같은 높이로 맞춰 한 장(비교판·고르기판)으로 늘어놓는다. 글자는 넣지 못하므로 순서는 따로 적어 둔다.
// 큰 그림(받은 원본)은 평균으로 줄이고, 작은 그림(도트)은 가장 가까운 픽셀로 정수 배 키운다. 투명한 곳은 체크무늬.
// 사용: pnpm art:board --out <판.png> [--cols 4] [--height 240] <그림.png> ...
import { parseArgs } from 'node:util';
import { createImage, onChecker, readPng, scaleNearest, writePng } from './png.mjs';

process.on('uncaughtException', (err) => {
  console.error(err.message);
  process.exit(1);
});

const { values: opt, positionals: files } = parseArgs({
  allowPositionals: true,
  options: { out: { type: 'string' }, cols: { type: 'string', default: '4' }, height: { type: 'string', default: '240' }, gap: { type: 'string', default: '12' } },
});
if (!opt.out || !files.length) {
  console.error('사용: board.mjs --out <판.png> [--cols 4] [--height 240] <그림.png> ...');
  process.exit(2);
}
const H = Number(opt.height);
const gap = Number(opt.gap);
const cols = Number(opt.cols);

const tiles = files.map((f) => {
  const img = readPng(f);
  if (img.height <= H / 2) return scaleNearest(img, Math.max(1, Math.floor(H / img.height)));
  return shrink(img, Math.max(1, Math.round((img.width * H) / img.height)), H);
});
const cellW = Math.max(...tiles.map((t) => t.width));
const rows = Math.ceil(tiles.length / cols);
const board = createImage(gap + cols * (cellW + gap), gap + rows * (H + gap));
board.data.fill(255);
tiles.forEach((t, i) => {
  const shown = onChecker(t, 12);
  const x0 = gap + (i % cols) * (cellW + gap) + Math.floor((cellW - t.width) / 2);
  const y0 = gap + Math.floor(i / cols) * (H + gap) + (H - t.height);
  for (let y = 0; y < t.height; y++) board.data.set(shown.data.subarray(y * t.width * 4, (y + 1) * t.width * 4), ((y0 + y) * board.width + x0) * 4);
});
writePng(opt.out, board);
console.log(`저장: ${opt.out} (${rows}줄×${cols}칸, 왼쪽 위부터)`);
files.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));

/** 넓이 평균으로 줄인다(받은 원본을 작게 볼 때) */
function shrink(img, w, h) {
  const out = createImage(w, h);
  const fx = img.width / w;
  const fy = img.height / h;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const acc = [0, 0, 0, 0];
      let n = 0;
      for (let sy = Math.floor(y * fy); sy < Math.floor((y + 1) * fy); sy++)
        for (let sx = Math.floor(x * fx); sx < Math.floor((x + 1) * fx); sx++) {
          const i = (sy * img.width + sx) * 4;
          for (let c = 0; c < 4; c++) acc[c] += img.data[i + c];
          n++;
        }
      out.data.set(acc.map((v) => Math.round(v / Math.max(1, n))), (y * w + x) * 4);
    }
  return out;
}
