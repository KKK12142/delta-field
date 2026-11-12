// 맵 모형 판(docs/art.md "타일·사물 만들기"): 맵 데이터(src/data/*.json)에 타일·사물 그림을 깔아 PNG 한 장으로 본다.
// 게임 연결(painter.ts) 전에 크기·어울림을 보려는 것이다. 그림이 없는 칸·사물은 회색 네모로 둔다.
//   mock.mjs --map src/data/school.json --out <png> [--area 0,0,48,37] [--scale 1] [--sprites public/sprites] [--chars 'char-01@6,5,down;...'] [--seed 1]
//   - 바닥: tiles/<id>.png의 변형을 무작위로. 벽(#)·울타리(%): 아래 칸이 바닥이면 앞면(<id>Face), 아니면 윗면(<id>Top).
//     울타리 윗면은 위아래가 울타리면 세로 가로대(fenceTopV). 울타리 앞면의 투명한 곳 아래에는 운동장 흙을 깐다.
//     지붕(&)은 roof()의 규칙(용마루·테).
//   - 사물: objects/<sprite 또는 kind>.png를 차지 칸 왼쪽 아래에 맞춰(그림이 좁으면 가운데) 놓고, 아래 끝이 아래인 것을 앞에 그린다.
//     열린 모양은 그리지 않는다. id에 right가 든 goalpost는 좌우로 뒤집는다.
//   --decor <배치.json>: 장식 배치 초안(docs/map.md "장식 소품 배치")을 얹어 본다. 형식:
//     { "cells": [{ "ch": "+", "col", "row", "w", "h" }]   맵 글자 바꾸기(새 칸 + 정원 잔디, $ 강당 앞면 벽)
//       "move": { "<사물 id>": { "col", "row" } }          사물 옮기기
//       "remove": ["<사물 id>"], "objects": [ 맵 사물과 같은 꼴 + "walk"(지나갈 수 있음), "flat"(그림자 없음) ]
//       "effects": { "wallEdges": true, "shadows": true, "marks": true, "pitch": { "col", "row", "w", "h" } } }
//     effects는 맵 담당이 painter.ts에 넣을 그리기 규칙의 견본이다: 벽 윗면 테(wallEdge*·wallCorner*), 사물 그림자, 경기장 선, 미션 사물 위 "!"(ui/mark.png).
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
    decor: { type: 'string' },
  },
});
if (!opt.map || !opt.out) {
  console.error('사용: mock.mjs --map <맵.json> --out <png> [--area c,r,w,h] [--scale 1] [--chars "char-01@c,r,down;..."]');
  process.exit(2);
}
const T = 30;
const room = JSON.parse(readFileSync(opt.map, 'utf8'));
const decor = opt.decor ? JSON.parse(readFileSync(opt.decor, 'utf8')) : null;
const L = room.layout.map((l) => [...l]);
for (const k of decor?.cells ?? []) for (let r = k.row; r < k.row + (k.h ?? 1); r++) for (let c = k.col; c < k.col + (k.w ?? 1); c++) if (L[r]) L[r][c] = k.ch;
if (decor) {
  room.objects = room.objects.filter((o) => !(decor.remove ?? []).includes(o.id)).map((o) => ({ ...o, ...(decor.move?.[o.id] ?? {}) }));
  room.objects.push(...(decor.objects ?? []));
}
const fx = decor?.effects ?? {};
const [ac, ar, aw, ah] = opt.area ? opt.area.split(',').map(Number) : [0, 0, L[0].length, L.length];
const TILE = { '.': 'classroomFloor', ',': 'hallFloor', ':': 'labFloor', ';': 'computerFloor', _: 'libraryFloor', '=': 'roofFloor', '^': 'stairs', '"': 'field', '+': 'gardenGrass', '#': 'wall', '%': 'fence', '&': 'roof', $: 'auditorium' };
const WALLS = ['#', '%', '&', '$'];
const isFloor = (ch) => ch !== undefined && !WALLS.includes(ch) && ch in TILE;
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
    if (id === 'roof') roof(c, r);
    else if (isFloor(ch)) tile(id, c, r);
    else if (isFloor(L[r + 1]?.[c])) {
      if (id === 'fence') tile('field', c, r);
      tile(`${id}Face`, c, r);
    } else if (id === 'fence' && L[r - 1]?.[c] === '%' && L[r + 1]?.[c] === '%') tile('fenceTopV', c, r);
    else if (id === 'fence' && (L[r - 1]?.[c] === '%' || L[r + 1]?.[c] === '%') && L[r]?.[c - 1] !== '%' && L[r]?.[c + 1] !== '%') tile('fenceTopV', c, r);
    else tile(`${id}Top`, c, r);
    if (fx.wallEdges && ch === '#' && !isFloor(L[r + 1]?.[c])) wallEdges(c, r);
  }
/** 벽 윗면 테: 윗면 칸의 변이 바닥이나 벽 앞면 칸과 닿으면 wallEdge<변>, 두 변이 벽 윗면이고 그 사이 대각선만 트이면 wallCorner<구석> */
function wallEdges(c, r) {
  const open = (cc, rr) => { const k = L[rr]?.[cc]; return isFloor(k) || (k === '#' && isFloor(L[rr + 1]?.[cc])); };
  const n = open(c, r - 1), s = open(c, r + 1), w = open(c - 1, r), e = open(c + 1, r);
  for (const [on, d] of [[n, 'N'], [s, 'S'], [w, 'W'], [e, 'E']]) if (on) tile(`wallEdge${d}`, c, r);
  for (const [on, d] of [[!n && !w && open(c - 1, r - 1), 'NW'], [!n && !e && open(c + 1, r - 1), 'NE'], [!s && !w && open(c - 1, r + 1), 'SW'], [!s && !e && open(c + 1, r + 1), 'SE']]) if (on) tile(`wallCorner${d}`, c, r);
}
/** 반투명 칠(그림자·선) */
const shade = (x0, y0, w, h, rgbv, a, ellipse = false) => {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (ellipse && ((x + 0.5 - w / 2) / (w / 2)) ** 2 + ((y + 0.5 - h / 2) / (h / 2)) ** 2 > 1) continue;
      const X = x0 + x - ac * T, Y = y0 + y - ar * T;
      if (X < 0 || Y < 0 || X >= img.width || Y >= img.height) continue;
      const i = (Y * img.width + X) * 4;
      for (let k = 0; k < 3; k++) img.data[i + k] = Math.round(img.data[i + k] * (1 - a) + rgbv[k] * a);
    }
};
if (fx.pitch) {
  // 경기장 선: 2도트 흰 선(바깥 네모, 가운데 줄과 원, 양쪽 골 앞 네모). 선 칸은 지나갈 수 있다
  const W = [244, 236, 220], A = 0.85, p = fx.pitch;
  const x0 = p.col * T, y0 = p.row * T + 15, x1 = (p.col + p.w) * T, y1 = (p.row + p.h) * T + 15, mx = ((x0 + x1) / 2) | 0, my = ((y0 + y1) / 2) | 0;
  for (const [x, y, w, h] of [[x0, y0, x1 - x0, 2], [x0, y1, x1 - x0 + 2, 2], [x0, y0, 2, y1 - y0], [x1, y0, 2, y1 - y0], [mx, y0, 2, y1 - y0],
    [x0, my - 75, 90, 2], [x0, my + 75, 90, 2], [x0 + 90, my - 75, 2, 152], [x1 - 90, my - 75, 90, 2], [x1 - 90, my + 75, 90, 2], [x1 - 90, my - 75, 2, 152]]) shade(x, y, w, h, W, A);
  for (let a = 0; a < 720; a++) { const t = (a / 720) * Math.PI * 2; shade(Math.round(mx + Math.cos(t) * 60), Math.round(my + Math.sin(t) * 60), 2, 2, W, A); }
}
/** 지붕 한 칸(docs/art.md "강당 지붕"): 이 칸의 세로 지붕 줄 가운데가 용마루, 위는 roofN, 아래는 roofS.
 *  지붕이 아닌 쪽 변에 테(roofEdgeN·S·W·E)를, 두 변이 만나면 모서리(roofEdgeNW …)를 겹친다. */
function roof(c, r) {
  const isRoof = (cc, rr) => L[rr]?.[cc] === '&';
  let r0 = r, r1 = r;
  while (isRoof(c, r0 - 1)) r0--;
  while (isRoof(c, r1 + 1)) r1++;
  const mid = r0 + Math.floor((r1 - r0 + 1) / 2);
  tile(r < mid ? 'roofN' : r === mid ? 'roofRidge' : 'roofS', c, r);
  const n = !isRoof(c, r - 1), s = !isRoof(c, r + 1), w = !isRoof(c - 1, r), e = !isRoof(c + 1, r);
  for (const [on, d] of [[n, 'N'], [s, 'S'], [w, 'W'], [e, 'E'], [n && w, 'NW'], [n && e, 'NE'], [s && w, 'SW'], [s && e, 'SE']]) if (on) tile(`roofEdge${d}`, c, r);
}
const things = room.objects.map((o) => ({ ...o, bottom: (o.row + o.h) * T }));
for (const ch of opt.chars.split(';').filter(Boolean)) {
  const [id, at] = ch.split('@');
  const [c, r, dir = 'down'] = at.split(',');
  things.push({ char: id, col: Number(c), row: Number(r), dir, bottom: (Number(r) + 1) * T });
}
things.sort((a, b) => a.bottom - b.bottom);
// 벽에 걸리거나 바닥에 깔리는 것은 그림자가 없다
const NO_SHADOW = ['blackboard', 'bulletinBoard', 'timetable', 'calendar', 'lightBulb', 'bookshelf', 'door', 'entrance', 'partDoor', 'gate', 'auditoriumDoor', 'item'];
for (const o of things) {
  if (o.char) {
    const src = load(`characters/${o.char}.png`);
    const row = { down: 0, left: 1, right: 2, up: 3 }[o.dir] ?? 0;
    if (src) blit(src, T, row * 60, T, 60, o.col * T, o.bottom - 60);
    continue;
  }
  const src = load(`objects/${o.sprite ?? o.kind}.png`);
  if (fx.shadows && src && !o.flat && !NO_SHADOW.includes(o.kind)) shade(o.col * T + 3, o.bottom - 5, o.w * T - 6, 8, [29, 21, 49], 0.28, true);
  if (!src) {
    box(o.col * T + 2, o.row * T + 2, o.w * T - 4, o.h * T - 4);
    continue;
  }
  const dx = o.col * T + Math.floor((o.w * T - src.width) / 2);
  const flip = o.kind === 'goalpost' && /right/.test(o.id);
  blit(src, 0, 0, src.width, src.height, dx, o.bottom - src.height, flip);
}
if (fx.marks) {
  // 미션 사물 위 "!"(M8: 평소에는 이 표시만, 가까이 가면 이름표). 그림 위 끝에서 2도트 위, 가로 가운데
  const mark = load('ui/mark.png');
  for (const o of things.filter((t) => t.mission && !['door', 'entrance', 'partDoor', 'gate'].includes(t.kind))) {
    const src = load(`objects/${o.sprite ?? o.kind}.png`);
    const top = o.bottom - (src?.height ?? o.h * T);
    if (mark) blit(mark, 0, 0, mark.width, mark.height, o.col * T + Math.floor((o.w * T - mark.width) / 2), top - mark.height - 2);
  }
}
writePng(opt.out, scaleNearest(img, Number(opt.scale)));
console.log(`저장: ${opt.out} (${aw}x${ah}칸, ${opt.scale}배)`);
