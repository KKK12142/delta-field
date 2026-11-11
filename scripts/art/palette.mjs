// 여러 도트 그림의 색을 줄이고 서로 비슷한 색을 하나로 맞춰 공용 색표를 만든다.
// 1) 그림마다 색이 --colors 개 이하가 될 때까지 가장 가까운 두 색을 묶는다(Ward: 차이² × 두 색 넓이의 조화). 작은 눈 반짝임처럼
//    넓이는 작아도 색이 뚜렷이 다른 점은 남는다. 묶을 때는 평균을 내지 않고 더 넓은 색을 그대로 쓴다(그림이 흐려지지 않는다).
// 2) 그림들 사이에서 차이가 --shared 이하인 색을 하나로 맞춘다(외곽선, 흰색, 신발 등).
// 3) 그림을 같은 이름으로 --out-dir에 저장하고, 공용 색표를 --palette 파일에 적는다(색, 쓰인 넓이, 쓰는 그림).
// 사용: pnpm art:palette --out-dir art/work/pal [--colors 16] [--shared 24] [--palette art/src/palette.txt] <그림.png> ...
import { basename, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { readPng, writePng } from './png.mjs';

process.on('uncaughtException', (err) => {
  console.error(err.message);
  process.exit(1);
});

const { values: opt, positionals: files } = parseArgs({
  allowPositionals: true,
  options: {
    'out-dir': { type: 'string' },
    colors: { type: 'string', default: '16' },
    shared: { type: 'string', default: '24' },
    palette: { type: 'string' },
  },
});
if (!opt['out-dir'] || !files.length) {
  console.error('사용: palette.mjs --out-dir <폴더> [--colors 16] [--shared 24] [--palette 색표.txt] <그림.png> ...');
  process.exit(2);
}
const K = Number(opt.colors);
const SHARED = Number(opt.shared);

/** 사람 눈에 가까운 색 차이(redmean, 0~255 남짓) */
function dist(a, b) {
  const rm = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt((((512 + rm) * dr * dr) >> 8) + 4 * dg * dg + (((767 - rm) * db * db) >> 8)) / 3;
}
const key = (c) => (c[0] << 16) | (c[1] << 8) | c[2];
const hex = (c) => '#' + c.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('');

/** 색 목록 [{c:[r,g,b], n}]에서 cost가 null이 아니고 keepGoing인 동안 가장 싼 두 색을 묶는다.
 *  묶인 색은 parent로 이긴 색을 가리킨다. 남은 색 목록을 돌려준다 */
function reduce(list, cost, keepGoing) {
  const alive = [...list];
  while (alive.length > 1) {
    let best = null;
    for (let i = 0; i < alive.length; i++)
      for (let j = i + 1; j < alive.length; j++) {
        const v = cost(alive[i], alive[j]);
        if (v !== null && (!best || v < best.v)) best = { v, i, j };
      }
    if (!best || !keepGoing(alive.length)) break;
    const [a, b] = [alive[best.i], alive[best.j]];
    const [win, lose] = a.n >= b.n ? [a, b] : [b, a];
    win.n += lose.n;
    if (win.from) win.from = [...new Set([...win.from, ...lose.from])];
    lose.parent = win;
    alive.splice(alive.indexOf(lose), 1);
  }
  return alive;
}
const root = (e) => (e.parent ? root(e.parent) : e);

const images = files.map((f) => {
  const img = readPng(f);
  const count = new Map();
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] < 128) continue;
    const k = key(img.data.subarray(i, i + 3));
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  const list = [...count].map(([k, n]) => ({ c: [(k >> 16) & 255, (k >> 8) & 255, k & 255], n }));
  const before = list.length;
  reduce(list, (a, b) => dist(a.c, b.c) ** 2 * ((a.n * b.n) / (a.n + b.n)), (n) => n > K);
  const byKey = new Map(list.map((e) => [key(e.c), e]));
  return { f, img, before, byKey, kept: list.filter((e) => !e.parent) };
});

// 그림들 사이 맞추기: 그림마다 남은 색을 모아, 다른 그림의 색끼리만 차이가 SHARED 이하이면 묶는다
const pool = [];
for (const [idx, im] of images.entries()) for (const e of im.kept) e.shared = pool[pool.push({ c: e.c, n: e.n, from: [idx] }) - 1];
reduce(
  pool,
  (a, b) => {
    if (a.from.some((x) => b.from.includes(x))) return null; // 같은 그림 안의 색은 1)에서 이미 정했다
    const d = dist(a.c, b.c);
    return d <= SHARED ? d : null;
  },
  () => true,
);

mkdirSync(opt['out-dir'], { recursive: true });
const usage = new Map(); // 공용 색 → {n, who:Set}
for (const [idx, im] of images.entries()) {
  const used = new Set();
  const d = im.img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) {
      d.set([0, 0, 0, 0], i);
      continue;
    }
    const s = root(root(im.byKey.get(key(d.subarray(i, i + 3)))).shared);
    d.set([...s.c, 255], i);
    used.add(s);
    const u = usage.get(s) ?? { n: 0, who: new Set() };
    u.n++;
    u.who.add(idx + 1);
    usage.set(s, u);
  }
  const out = join(opt['out-dir'], basename(im.f));
  writePng(out, im.img);
  console.log(`${basename(im.f)}: ${im.before}색 → ${used.size}색`);
}
const rows = [...usage].sort((a, b) => b[1].n - a[1].n);
console.log(`공용 색표: ${rows.length}색(그림 사이 차이 ${SHARED} 이하를 하나로)`);
if (opt.palette) {
  const text = [
    '# 공용 색표(scripts/art/palette.mjs가 만듦). 색  넓이(도트)  쓰는 그림(번호는 넣은 순서)',
    ...files.map((f, i) => `# ${i + 1} ${basename(f)}`),
    ...rows.map(([s, u]) => `${hex(s.c)}  ${String(u.n).padStart(5)}  ${[...u.who].join(',')}`),
  ].join('\n');
  writeFileSync(opt.palette, text + '\n');
  console.log(`저장: ${opt.palette}`);
}
