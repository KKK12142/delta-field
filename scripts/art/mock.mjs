// 맵 모형 판(docs/art.md "타일·사물 만들기"): 맵 데이터(src/data/*.json)에 타일·사물 그림을 깔아 PNG 한 장으로 본다.
// 게임 연결(painter.ts) 전에 크기·어울림을 보려는 것이다. 그림이 없는 칸·사물은 회색 네모로 둔다.
//   mock.mjs --map src/data/school.json --out <png> [--area 0,0,48,37] [--scale 1] [--sprites public/sprites] [--chars 'char-01@6,5,down;...'] [--seed 1]
//   - 바닥: tiles/<id>.png의 변형을 무작위로. 벽(#)·울타리(%): 아래 칸이 바닥이면 앞면(<id>Face), 아니면 윗면(<id>Top).
//     울타리 윗면은 위아래가 울타리면 세로 가로대(fenceTopV). 울타리 앞면의 투명한 곳 아래에는 운동장 흙을 깐다.
//   - 사물: objects/<sprite 또는 kind>.png를 차지 칸 왼쪽 아래에 맞춰(그림이 좁으면 가운데) 놓고, 아래 끝이 아래인 것을 앞에 그린다.
//     열린 모양은 그리지 않는다. id에 right가 든 goalpost는 좌우로 뒤집는다.
import { existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createImage, readPng, scaleNearest, writePng } from './png.mjs';

process.on('uncaughtException', (err) => {
  console.error(err.message);
  process.exit(1);
});
const { values: opt } = parseArgs({
  options: {
    map: { type: 'string' },
    out: { type: 'string' },
    area: { type: 'string' },
    scale: { type: 'string', default: '1' },
    sprites: { type: 'string', default: 'public/sprites' },
    chars: { type: 'string', default: '' },
    seed: { type: 'string', default: '1' },
  },
});
if (!opt.map || !opt.out) {
  console.error('사용: mock.mjs --map <맵.json> --out <png> [--area c,r,w,h] [--scale 1] [--chars "char-01@c,r,down;..."]');
  process.exit(2);
}
const T = 30;
const room = JSON.parse(readFileSync(opt.map, 'utf8'));
const L = room.layout;
const [ac, ar, aw, ah] = opt.area ? opt.area.split(',').map(Number) : [0, 0, L[0].length, L.length];
const TILE = { '.': 'classroomFloor', ',': 'hallFloor', ':': 'labFloor', ';': 'computerFloor', _: 'libraryFloor', '=': 'roofFloor', '^': 'stairs', '"': 'field', '#': 'wall', '%': 'fence' };
const isFloor = (ch) => ch !== undefined && ch !== '#' && ch !== '%' && ch in TILE;
const img = createImage(aw * T, ah * T);
let s = Number(opt.seed) || 1;
const rand = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
const cache = new Map();
const load = (rel) => {
  if (!cache.has(rel)) cache.set(rel, existsSync(`${opt.sprites}/${rel}`) ? readPng(`${opt.sprites}/${rel}`) : null);
  return cache.get(rel);
};
const blit = (src, sx, sy, w, h, dx, dy, flip = false) => {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = ((sy + y) * src.width + sx + (flip ? w - 1 - x : x)) * 4;
      if (src.data[i + 3] < 128) continue;
      const X = dx + x - ac * T;
      const Y = dy + y - ar * T;
      if (X >= 0 && Y >= 0 && X < img.width && Y < img.height) img.data.set(src.data.subarray(i, i + 4), (Y * img.width + X) * 4);
    }
};
const box = (dx, dy, w, h) => {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const X = dx + x - ac * T;
      const Y = dy + y - ar * T;
      if (X >= 0 && Y >= 0 && X < img.width && Y < img.height) img.data.set([128, 128, 136, 255], (Y * img.width + X) * 4);
    }
};
const tile = (name, c, r) => {
  const src = load(`tiles/${name}.png`);
  if (!src) return box(c * T, r * T, T, T), false;
  blit(src, Math.floor(rand() * Math.round(src.width / T)) * T, 0, T, T, c * T, r * T);
  return true;
};
for (let r = ar; r < ar + ah; r++)
  for (let c = ac; c < ac + aw; c++) {
    const ch = L[r][c];
    const id = TILE[ch];
    if (!id) continue;
    if (isFloor(ch)) tile(id, c, r);
    else if (isFloor(L[r + 1]?.[c])) {
      if (id === 'fence') tile('field', c, r);
      tile(`${id}Face`, c, r);
    } else if (id === 'fence' && L[r - 1]?.[c] === '%' && L[r + 1]?.[c] === '%') tile('fenceTopV', c, r);
    else if (id === 'fence' && (L[r - 1]?.[c] === '%' || L[r + 1]?.[c] === '%') && L[r]?.[c - 1] !== '%' && L[r]?.[c + 1] !== '%') tile('fenceTopV', c, r);
    else tile(`${id}Top`, c, r);
  }
const things = room.objects.map((o) => ({ ...o, bottom: (o.row + o.h) * T }));
for (const ch of opt.chars.split(';').filter(Boolean)) {
  const [id, at] = ch.split('@');
  const [c, r, dir = 'down'] = at.split(',');
  things.push({ char: id, col: Number(c), row: Number(r), dir, bottom: (Number(r) + 1) * T });
}
things.sort((a, b) => a.bottom - b.bottom);
for (const o of things) {
  if (o.char) {
    const src = load(`characters/${o.char}.png`);
    const row = { down: 0, left: 1, right: 2, up: 3 }[o.dir] ?? 0;
    if (src) blit(src, T, row * 60, T, 60, o.col * T, o.bottom - 60);
    continue;
  }
  const src = load(`objects/${o.sprite ?? o.kind}.png`);
  if (!src) {
    box(o.col * T + 2, o.row * T + 2, o.w * T - 4, o.h * T - 4);
    continue;
  }
  const dx = o.col * T + Math.floor((o.w * T - src.width) / 2);
  const flip = o.kind === 'goalpost' && /right/.test(o.id);
  blit(src, 0, 0, src.width, src.height, dx, o.bottom - src.height, flip);
}
writePng(opt.out, scaleNearest(img, Number(opt.scale)));
console.log(`저장: ${opt.out} (${aw}x${ah}칸, ${opt.scale}배)`);
