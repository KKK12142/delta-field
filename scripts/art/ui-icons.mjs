// 규칙으로 짜는 UI 표시(생성하지 않음, docs/art.md "UI 그림"): 순서 진행 칸, 반짝임, 맞음 도장, 얻음 빛살, CCTV 상태 아이콘.
// 글자판 art/src/ui/<이름>.txt를 만든다. PNG는 grid.mjs to-png로 따로 만든다.
// 사용: node scripts/art/ui-icons.mjs [--out-dir art/src/ui]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { formatTxt } from './sprite.mjs';

const { values: opt } = parseArgs({ options: { 'out-dir': { type: 'string', default: 'art/src/ui' } } });
const out = opt['out-dir'];
mkdirSync(out, { recursive: true });
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const pal = (o) => new Map(Object.entries(o).map(([k, v]) => [k, { rgb: rgb(v), alpha: v.length === 9 ? parseInt(v.slice(7), 16) : 255 }]));
const grid = (w, h) => Array.from({ length: h }, () => Array(w).fill('.'));
function save(name, comment, w, h, colors, frames, cols = frames.length) {
  for (const f of frames) for (const r of f.rows) if (r.length !== w) throw new Error(`${name} ${f.name}: ${r}`);
  writeFileSync(join(out, `${name}.txt`), formatTxt({ comments: [`# ${comment} (scripts/art/ui-icons.mjs가 만듦)`], fw: w, fh: h, cols, palette: pal(colors), frames }));
}
const one = (name, rows) => [{ name, rows }];
const O = '#1d1531';

// 순서 진행 칸(7×7): 빈 칸, 맞힌 칸
save('step', '순서 맞추기 진행 칸(빈 것)', 7, 7, { o: O, k: '#d6c5b4', s: '#b39964' }, one('step', [
  '.ooooo.', 'okkkkko', 'okkkkko', 'okkkkko', 'okkkkko', 'osssssо'.replace('о', 'o'), '.ooooo.']));
save('step-on', '순서 맞추기 진행 칸(맞힌 것)', 7, 7, { o: O, y: '#fdd516', h: '#fff3a6', d: '#d1860c' }, one('step-on', [
  '.ooooo.', 'ohhyyyo', 'ohyyyyo', 'oyyyyyo', 'oyyyydo', 'oyyddd' + 'o', '.ooooo.']));

// 반짝임(9×9, 4프레임: 작음 → 큼 → 중간 → 사라짐)
const sp = { w: '#f8f8f6', y: '#fdd516' };
save('sparkle', '반짝임 4프레임(9×9, 초당 10프레임 한 번)', 9, 9, sp, [
  { name: 'f0', rows: ['.........', '.........', '.........', '....y....', '...ywy...', '....y....', '.........', '.........', '.........'] },
  { name: 'f1', rows: ['....y....', '....y....', '....w....', '...www...', 'yywwwwwyy', '...www...', '....w....', '....y....', '....y....'] },
  { name: 'f2', rows: ['.........', 'y...y...y', '.y..w..y.', '...www...', '.ywwwwwy.', '...www...', '.y..w..y.', 'y...y...y', '.........'] },
  { name: 'f3', rows: ['.........', '.........', '..y...y..', '.........', '....w....', '.........', '..y...y..', '.........', '.........'] },
]);

// 맞음 도장(24×24): 빨간 동그라미 테 안에 체크. 글자 없음
{
  const W = 24, g = grid(W, W), c = 11.5;
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d <= 11.6 && d > 10.2) g[y][x] = 'r';
      else if (d <= 10.2 && d > 9.2) g[y][x] = 'l';
      else if (d <= 8.2 && d > 7) g[y][x] = 'r';
    }
  // 체크(두께 2)
  const pts = [];
  for (let i = 0; i <= 4; i++) pts.push([7 + i, 11 + i]);
  for (let i = 0; i <= 7; i++) pts.push([11 + i, 15 - i]);
  for (const [x, y] of pts) for (const [dx, dy] of [[0, 0], [0, 1], [1, 0], [1, 1]]) g[y + dy][x + dx] = 'r';
  save('stamp-correct', '맞음 도장(24×24, 빨간 동그라미와 체크). 보상 카드 위에 비스듬히 찍는 느낌으로', W, W, { r: '#e12a24', l: '#f5735a' }, one('stamp-correct', g.map((r) => r.join(''))));
}

// 얻음 빛살(48×48): 가운데에서 퍼지는 빛살 8개(반투명). 얻은 물건 아이콘 뒤에 깔고 천천히 돌린다
{
  const W = 48, g = grid(W, W), c = 23.5;
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      const dx = x - c, dy = y - c, r = Math.hypot(dx, dy);
      if (r > 23.5) continue;
      const a = ((Math.atan2(dy, dx) / Math.PI) * 4 + 8) % 1; // 빛살 8개
      if (r < 9) g[y][x] = 'h';
      else if (a < 0.28 || a > 0.86) g[y][x] = r < 17 ? 'y' : 'f';
    }
  save('burst', '얻음 빛살(48×48, 반투명). 얻은 물건 아이콘(30×30) 뒤 가운데에 깖', W, W, { h: '#fff3a6aa', y: '#fdd51699', f: '#fdd51655' }, one('burst', g.map((r) => r.join(''))));
}

// CCTV 상태(11×11): 퀴즈 푸는 중(파란 ?), 막힘(빨간 !), 마침(초록 체크), 돌아다님(회색 발자국)
const disc = (fill, light, shade, glyph) => {
  const base = ['...ooooo...', '..offfffo..', '.offfffffo.', 'offfffffffo', 'offfffffffo', 'offfffffffo', 'offfffffffo', 'offfffffffo', '.offfffffo.', '..offfffo..', '...ooooo...'];
  return base.map((r, y) => [...r].map((ch, x) => (glyph[y]?.[x] === 'w' ? 'w' : ch === 'f' ? (y <= 2 && x <= 4 ? 'h' : y >= 8 || x >= 8 ? 's' : 'f') : ch)).join(''));
};
const GLYPH = {
  quiz: ['...........', '...........', '....www....', '...w...w...', '.......w...', '......w....', '.....w.....', '...........', '.....w.....', '...........', '...........'],
  stuck: ['...........', '...........', '.....w.....', '.....w.....', '.....w.....', '.....w.....', '.....w.....', '...........', '.....w.....', '...........', '...........'],
  done: ['...........', '...........', '...........', '........w..', '.......w...', '..w...w....', '...w.w.....', '....w......', '...........', '...........', '...........'],
  move: ['...........', '...........', '...ww......', '...ww......', '...........', '......ww...', '......ww...', '...ww......', '...ww......', '...........', '...........'],
};
for (const [k, c] of Object.entries({ quiz: ['#3b6ea8', '#7fa9e8', '#22437a'], stuck: ['#e12a24', '#f5735a', '#8f221e'], done: ['#5b9137', '#a6d36c', '#30612b'], move: ['#86828f', '#b8b5c0', '#545262'] })) {
  save(`status-${k}`, `CCTV 상태 아이콘 ${k}(11×11)`, 11, 11, { o: O, f: c[0], h: c[1], s: c[2], w: '#f8f8f6' }, one(`status-${k}`, disc(...c, GLYPH[k])));
}
console.log('ok');
