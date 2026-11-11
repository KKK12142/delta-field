// 여러 그림을 같은 높이로 맞춰 한 장(비교판·고르기판)으로 늘어놓는다.
// 큰 그림(받은 원본)은 평균으로 줄이고, 작은 그림(도트)은 가장 가까운 픽셀로 정수 배 키운다. 투명한 곳은 체크무늬.
// --label을 그림 순서대로 여러 번 주면 칸 위에 글자를 적는다(3×5 도트 글꼴: 영문 대문자·숫자·. - : / ( ) # ×, '|'는 줄바꿈).
// 사용: pnpm art:board --out <판.png> [--cols 4] [--height 240] [--label "1 LAB|44.96" ...] [--label-scale 3] <그림.png> ...
import { parseArgs } from 'node:util';
import { createImage, onChecker, readPng, scaleNearest, writePng } from './png.mjs';

// 3×5 글꼴. 줄마다 3칸을 0·1로 적는다.
const FONT = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
  5: '111100111001111', 6: '111100111101111', 7: '111001001010010', 8: '111101111101111', 9: '111101111001111',
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', '.': '000000000000010', '-': '000000111000000', ':': '000010000010000', '/': '001001010100100',
  '(': '010100100100010', ')': '010001001001010', '#': '101111101111101', '×': '000101010101000', ' ': '000000000000000',
};

process.on('uncaughtException', (err) => {
  console.error(err.message);
  process.exit(1);
});

const { values: opt, positionals: files } = parseArgs({
  allowPositionals: true,
  options: { out: { type: 'string' }, cols: { type: 'string', default: '4' }, height: { type: 'string', default: '240' }, gap: { type: 'string', default: '12' },
    label: { type: 'string', multiple: true, default: [] },
    'label-scale': { type: 'string', default: '3' },
  },
});
if (!opt.out || !files.length) {
  console.error('사용: board.mjs --out <판.png> [--cols 4] [--height 240] <그림.png> ...');
  process.exit(2);
}
const H = Number(opt.height);
const gap = Number(opt.gap);
const cols = Number(opt.cols);
const ls = Number(opt['label-scale']);
const labels = opt.label.map((t) => t.split('|'));
const lines = Math.max(0, ...labels.map((l) => l.length));
const labelH = lines ? lines * 6 * ls + ls : 0;
const rowH = labelH + H;

const tiles = files.map((f) => {
  const img = readPng(f);
  if (img.height <= H / 2) return scaleNearest(img, Math.max(1, Math.floor(H / img.height)));
  return shrink(img, Math.max(1, Math.round((img.width * H) / img.height)), H);
});
const cellW = Math.max(...tiles.map((t) => t.width));
const rows = Math.ceil(tiles.length / cols);
const board = createImage(gap + cols * (cellW + gap), gap + rows * (rowH + gap));
board.data.fill(255);
tiles.forEach((t, i) => {
  const shown = onChecker(t, 12);
  const x0 = gap + (i % cols) * (cellW + gap) + Math.floor((cellW - t.width) / 2);
  const top = gap + Math.floor(i / cols) * (rowH + gap);
  const y0 = top + labelH + (H - t.height);
  (labels[i] ?? []).forEach((line, k) => drawText(board, line, gap + (i % cols) * (cellW + gap), top + k * 6 * ls, ls, gap + (i % cols) * (cellW + gap) + cellW));
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


/** 글자를 검은색으로 적는다. 오른쪽 끝(maxX)을 넘는 글자는 적지 않는다. 없는 글자는 빈칸. */
function drawText(img, text, x0, y0, s, maxX) {
  [...text.toUpperCase()].forEach((ch, n) => {
    const g = FONT[ch] ?? FONT[' '];
    const gx = x0 + n * 4 * s;
    if (gx + 3 * s > maxX) return;
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 3; c++)
        if (g[r * 3 + c] === '1')
          for (let dy = 0; dy < s; dy++)
            for (let dx = 0; dx < s; dx++) img.data.set([0, 0, 0, 255], ((y0 + r * s + dy) * img.width + gx + c * s + dx) * 4);
  });
}
