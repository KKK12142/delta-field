// 바닥·벽 타일 다듬기(docs/art.md "타일·사물 만들기"). 입력은 fit.mjs --full로 만든 변형 시트(정사각 칸을 가로로 이은 PNG, 예 120×30).
// 생성 그림은 이음선을 도트보다 가늘게 그리거나 30칸 박자를 지키지 않으므로, 색과 무늬는 받은 그림에서 쓰고 이음 구조는 규칙대로 다시 긋는다.
//
//   clean <시트.png> --out <png> [--remove '#hex,#hex'] [--erase 'x,y,w,h' ...] [--map '#hex=#hex,...']
//       --remove 색과 --erase 네모(시트 좌표, 생성 그림의 "AI" 표시 자리 등)를 지우고 둘레에서 가장 많은 색으로 메운다. --map은 색을 바꾼다.
//   planks <시트.png> --out <png> --plank 6 --line '#hex' [--light '#hex'] [--joint 0.5] [--seed 1]
//       판자 바닥: plank줄마다 마지막 줄을 이음선(line)으로 긋고, 판자 줄마다 joint 확률로 판자 끝 이음(세로 한 칸)을 넣는다.
//       칸 가장자리에 걸친 이음은 넣지 않아 어떤 순서로 깔아도 이어진다.
//   grid <시트.png> --out <png> --step 15 --line '#hex' [--light '#hex']
//       네모 타일 바닥: 칸 안 step칸마다(마지막 줄·칸) 이음선을 긋는다. light는 이음 바로 오른쪽 아래 줄의 밝은 선.
//   roll <시트.png> --out <png> --grid 2x2 [--dx 0] [--dy 15]
//       칸들을 받은 그림의 배치(줄×칸, 시트에는 줄 순서로 이어져 있음)로 다시 붙여 dx·dy만큼 돌려 민 뒤 다시 자른다.
//       받은 그림의 가운데에 있던 것(울타리 가로대 등)을 칸 가운데로 옮길 때 쓴다.
//   pick <시트.png> --out <png> --keep 2,3
//       변형 가운데 쓸 칸만 남긴다(0부터).
//   turn <시트.png> --out <png>
//       칸마다 대각선으로 뒤집는다(가로로 난 울타리 가로대를 세로로).
//   mix <시트.png> --out <png> [--cols 6] [--rows 4] [--scale 4] [--seed 7]
//       변형을 무작위로 깔아 이음새를 보는 미리보기.
import { parseArgs } from 'node:util';
import { createImage, readPng, scaleNearest, writePng } from './png.mjs';

process.on('uncaughtException', (err) => {
  console.error(err.message);
  process.exit(1);
});

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    remove: { type: 'string' },
    erase: { type: 'string', multiple: true, default: [] },
    map: { type: 'string' },
    plank: { type: 'string', default: '6' },
    step: { type: 'string', default: '15' },
    line: { type: 'string' },
    light: { type: 'string' },
    joint: { type: 'string', default: '0.5' },
    seed: { type: 'string', default: '1' },
    grid: { type: 'string', default: '2x2' },
    dx: { type: 'string', default: '0' },
    dy: { type: 'string', default: '0' },
    cols: { type: 'string', default: '6' },
    rows: { type: 'string', default: '4' },
    scale: { type: 'string', default: '4' },
    keep: { type: 'string' },
  },
});
const [command, input] = positionals;
if (!input || !opt.out || !['clean', 'planks', 'grid', 'roll', 'pick', 'turn', 'mix'].includes(command)) {
  console.error('사용: tile.mjs clean|planks|grid|roll|pick|turn|mix <시트.png> --out <png> [옵션](파일 맨 위 설명)');
  process.exit(2);
}

const img = readPng(input);
const T = img.height;
const N = Math.round(img.width / T);
if (N * T !== img.width) throw new Error(`${input}는 정사각 칸을 가로로 이은 시트여야 합니다(${img.width}x${img.height}).`);

const hex = (s) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(s.trim());
  if (!m) throw new Error(`색은 #rrggbb로 적습니다: ${s}`);
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
};
const idx = (x, y) => (y * img.width + x) * 4;
const get = (x, y) => [...img.data.subarray(idx(x, y), idx(x, y) + 4)];
const set = (x, y, rgb) => img.data.set([...rgb.slice(0, 3), 255], idx(x, y));
const same = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) <= 12;
const rand = (() => {
  let s = Number(opt.seed) || 1;
  return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
})();

if (command === 'clean') clean();
else if (command === 'planks') planks();
else if (command === 'grid') grid();
else if (command === 'roll') roll();
else if (command === 'pick') pick();
else if (command === 'turn') turn();
else mix();

function save(what) {
  writePng(opt.out, img);
  console.log(`저장: ${opt.out} (${N}칸 ${T}x${T}${what ? `, ${what}` : ''})`);
}

/** 표시한 칸을 둘레(같은 칸 안 8방향)에서 가장 많은 색으로 메운다. 안쪽까지 한 겹씩 채운다. */
function fillMarked(marked) {
  let left = marked.size;
  while (left) {
    const done = [];
    for (const k of marked) {
      const x = k % img.width;
      const y = Math.floor(k / img.width);
      const tile = Math.floor(x / T);
      const n = new Map();
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if ((!dx && !dy) || ny < 0 || ny >= T || Math.floor(nx / T) !== tile || nx < 0) continue;
          const nk = ny * img.width + nx;
          if (marked.has(nk)) continue;
          const c = get(nx, ny).slice(0, 3).join(',');
          n.set(c, (n.get(c) ?? 0) + 1);
        }
      if (n.size) done.push([k, [...n].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number)]);
    }
    if (!done.length) throw new Error('메울 색을 찾지 못했습니다(칸 전체를 지우려 했습니다).');
    for (const [k, rgb] of done) set(k % img.width, Math.floor(k / img.width), rgb), marked.delete(k);
    left = marked.size;
  }
}

function clean() {
  const marked = new Set();
  const removes = (opt.remove ?? '').split(',').filter(Boolean).map(hex);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < img.width; x++) {
      const c = get(x, y);
      if (c[3] >= 128 && removes.some((r) => same(r, c))) marked.add(y * img.width + x);
    }
  for (const e of opt.erase) {
    const [ex, ey, ew, eh] = e.split(',').map(Number);
    for (let y = ey; y < Math.min(T, ey + eh); y++) for (let x = ex; x < Math.min(img.width, ex + ew); x++) marked.add(y * img.width + x);
  }
  const n = marked.size;
  if (n) fillMarked(marked);
  let mapped = 0;
  for (const pairText of (opt.map ?? '').split(',').filter(Boolean)) {
    const [from, to] = pairText.split('=').map(hex);
    for (let y = 0; y < T; y++)
      for (let x = 0; x < img.width; x++)
        if (same(get(x, y), from)) set(x, y, to), mapped++;
  }
  save(`지운 칸 ${n}개, 바꾼 칸 ${mapped}개`);
}

function planks() {
  if (!opt.line) throw new Error('planks는 --line 색이 필요합니다.');
  const line = hex(opt.line);
  const light = opt.light ? hex(opt.light) : null;
  const P = Number(opt.plank);
  if (T % P) throw new Error(`칸 크기 ${T}가 판자 폭 ${P}로 나누어떨어지지 않습니다.`);
  let joints = 0;
  for (let t = 0; t < N; t++) {
    for (let y = 0; y < T; y++) if (y % P === P - 1) for (let x = 0; x < T; x++) set(t * T + x, y, line);
    for (let p = 0; p < T / P; p++) {
      if (rand() >= Number(opt.joint)) continue;
      const jx = 3 + Math.floor(rand() * (T - 7));
      for (let y = p * P; y < p * P + P - 1; y++) set(t * T + jx, y, line);
      if (light) set(t * T + jx + 1, p * P, light);
      joints++;
    }
  }
  save(`판자 폭 ${P}, 끝 이음 ${joints}개`);
}

function grid() {
  if (!opt.line) throw new Error('grid는 --line 색이 필요합니다.');
  const line = hex(opt.line);
  const light = opt.light ? hex(opt.light) : null;
  const S = Number(opt.step);
  if (T % S) throw new Error(`칸 크기 ${T}가 ${S}로 나누어떨어지지 않습니다.`);
  for (let t = 0; t < N; t++)
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        if (x % S === S - 1 || y % S === S - 1) set(t * T + x, y, line);
        else if (light && (x % S === 0 || y % S === 0)) set(t * T + x, y, light);
      }
  save(`${S}칸마다 이음선`);
}

function roll() {
  const [gr, gc] = opt.grid.split('x').map(Number);
  if (gr * gc !== N) throw new Error(`--grid ${opt.grid}는 칸 ${N}개와 맞지 않습니다.`);
  const W = gc * T;
  const H = gr * T;
  const big = createImage(W, H);
  for (let k = 0; k < N; k++)
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) big.data.set(get(k * T + x, y), (((Math.floor(k / gc) * T + y) * W) + (k % gc) * T + x) * 4);
  const dx = Number(opt.dx);
  const dy = Number(opt.dy);
  for (let k = 0; k < N; k++)
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const sx = ((((k % gc) * T + x - dx) % W) + W) % W;
        const sy = (((Math.floor(k / gc) * T + y - dy) % H) + H) % H;
        img.data.set(big.data.subarray((sy * W + sx) * 4, (sy * W + sx) * 4 + 4), idx(k * T + x, y));
      }
  save(`${opt.grid}로 붙여 ${dx},${dy} 밀기`);
}

function pick() {
  const keep = (opt.keep ?? '').split(',').filter(Boolean).map(Number);
  if (!keep.length || keep.some((k) => !(k >= 0 && k < N))) throw new Error(`--keep은 0~${N - 1} 칸 번호를 쉼표로 적습니다.`);
  const out = createImage(keep.length * T, T);
  keep.forEach((k, i) => {
    for (let y = 0; y < T; y++) out.data.set(img.data.subarray(idx(k * T, y), idx(k * T + T, y)), (y * out.width + i * T) * 4);
  });
  writePng(opt.out, out);
  console.log(`저장: ${opt.out} (${keep.length}칸: ${keep.join(',')})`);
}

function turn() {
  const src = new Uint8Array(img.data);
  for (let t = 0; t < N; t++)
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const i = (x * img.width + t * T + y) * 4;
        img.data.set(src.subarray(i, i + 4), idx(t * T + x, y));
      }
  save('대각선으로 뒤집음');
}

function mix() {
  const cols = Number(opt.cols);
  const rows = Number(opt.rows);
  const out = createImage(cols * T, rows * T);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const v = Math.floor(rand() * N);
      for (let y = 0; y < T; y++) out.data.set(img.data.subarray(idx(v * T, y), idx(v * T + T, y)), ((r * T + y) * out.width + c * T) * 4);
    }
  writePng(opt.out, scaleNearest(out, Number(opt.scale)));
  console.log(`저장: ${opt.out} (${cols}x${rows}칸 무작위, ${opt.scale}배)`);
}
