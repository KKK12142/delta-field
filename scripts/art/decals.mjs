// 규칙으로 짜는 그림(생성하지 않음, docs/art.md "규칙으로 짠 그림"): 벽 윗면 테·안쪽 모서리, 골든벨 구역 판, 교실 이름판.
// 글자판(art/src/...)을 만든다. PNG는 grid.mjs to-png로 따로 만든다.
// 사용: node scripts/art/decals.mjs [--out-dir art/src]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { formatTxt } from './sprite.mjs';

const { values: opt } = parseArgs({ options: { 'out-dir': { type: 'string', default: 'art/src' } } });
const out = opt['out-dir'];
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const grid = (w, h, ch = '.') => Array.from({ length: h }, () => Array(w).fill(ch));
function save(dir, name, w, h, pal, g, comment) {
  mkdirSync(join(out, dir), { recursive: true });
  const palette = new Map(Object.entries(pal).map(([k, v]) => [k, { rgb: rgb(v), alpha: v.length === 9 ? parseInt(v.slice(7), 16) : 255 }]));
  const txt = formatTxt({ comments: [`# ${comment} (scripts/art/decals.mjs가 만듦. 고치려면 스크립트를 고친다)`], fw: w, fh: h, cols: 1, palette, frames: [{ name, rows: g.map((r) => r.join('')) }] });
  writeFileSync(join(out, dir, `${name}.txt`), txt);
}

// ---------- 1. 벽 윗면 테(wallTop 위에 겹침, 바깥은 투명) ----------
// 벽 윗면 칸의 한 변이 바닥(또는 벽 앞면 칸)과 닿으면 그 변에 2도트 테: 바깥 1도트 짙은 색 o, 안 1도트 그늘 b.
// 안쪽 모서리(cNW…): 두 변은 벽이고 그 사이 대각선 칸만 바닥일 때 그 구석의 2×2.
const T = 30;
const edgePal = { o: '#4a4458', b: '#9fa1ab' };
const edges = {
  N: (x, y) => (y === 0 ? 'o' : y === 1 ? 'b' : null),
  S: (x, y) => (y === T - 1 ? 'o' : y === T - 2 ? 'b' : null),
  W: (x, y) => (x === 0 ? 'o' : x === 1 ? 'b' : null),
  E: (x, y) => (x === T - 1 ? 'o' : x === T - 2 ? 'b' : null),
};
for (const [k, f] of Object.entries(edges)) {
  const g = grid(T, T);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) g[y][x] = f(x, y) ?? '.';
  save('tiles', `wallEdge${k}`, T, T, edgePal, g, `벽 윗면 테 ${k}: 그 변이 바닥·벽 앞면과 닿을 때 wallTop 위에 겹침`);
}
for (const k of ['NW', 'NE', 'SW', 'SE']) {
  const g = grid(T, T);
  const xs = k[1] === 'W' ? [0, 1] : [T - 1, T - 2];
  const ys = k[0] === 'N' ? [0, 1] : [T - 1, T - 2];
  for (const y of ys) for (const x of xs) g[y][x] = x === xs[0] || y === ys[0] ? 'o' : 'b';
  save('tiles', `wallCorner${k}`, T, T, edgePal, g, `벽 윗면 안쪽 모서리 ${k}: ${k} 쪽 대각선 칸만 바닥일 때 겹침`);
}

// ---------- 2. 골든벨 구역 판(60×60, 2×2칸). 바닥에 까는 판이라 지나갈 수 있다 ----------
// 색은 src/theme.ts color.zone과 같은 색상. 글자는 7×9 도트 글꼴을 3배(21×27)로.
const FONT = {
  O: ['.11111.', '11...11', '11...11', '11...11', '11...11', '11...11', '11...11', '11...11', '.11111.'],
  X: ['11...11', '11...11', '.11.11.', '..111..', '..111..', '..111..', '.11.11.', '11...11', '11...11'],
  1: ['...11..', '..111..', '.1111..', '...11..', '...11..', '...11..', '...11..', '...11..', '.111111'],
  2: ['.11111.', '11...11', '.....11', '....11.', '...11..', '..11...', '.11....', '11.....', '1111111'],
  3: ['.11111.', '11...11', '.....11', '...111.', '.....11', '.....11', '.....11', '11...11', '.11111.'],
  4: ['....11.', '...111.', '..1111.', '.11.11.', '11..11.', '1111111', '....11.', '....11.', '....11.'],
};
const ZONE = { O: '#3b6ea8', X: '#c0603a', 1: '#4f8a5b', 2: '#8a6bb0', 3: '#c79a3d', 4: '#3d8f99' };
const shade = (h, k) => '#' + rgb(h).map((v) => Math.max(0, Math.min(255, Math.round(k > 1 ? v + (255 - v) * (k - 1) : v * k))).toString(16).padStart(2, '0')).join('');
for (const [label, base] of Object.entries(ZONE)) {
  const W = 60;
  const g = grid(W, W);
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      const corner = (x < 2 || x > W - 3) && (y < 2 || y > W - 3) && !((x === 1 || x === W - 2) && (y === 1 || y === W - 2));
      if (corner) continue;
      const edge = x === 0 || y === 0 || x === W - 1 || y === W - 1 || ((x === 1 || x === W - 2) && (y === 1 || y === W - 2));
      g[y][x] = edge ? 'o' : x === 1 || y === 1 ? 'h' : x === W - 2 || y === W - 2 ? 's' : 'f';
    }
  // 안쪽 테(3도트 안): 밝은 선
  for (let i = 5; i < W - 5; i++) for (const [x, y] of [[i, 5], [i, W - 6], [5, i], [W - 6, i]]) g[y][x] = 'l';
  // 글자(3배) + 1도트 외곽선, 오른쪽 아래 그림자 1도트
  const S = 3, gw = 7 * S, gh = 9 * S, x0 = Math.floor((W - gw) / 2), y0 = Math.floor((W - gh) / 2);
  const on = (x, y) => { const gx = Math.floor((x - x0) / S), gy = Math.floor((y - y0) / S); return x >= x0 && y >= y0 && gx < 7 && gy < 9 && FONT[label][gy][gx] === '1'; };
  for (let y = 1; y < W - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      if (on(x, y)) g[y][x] = 'w';
      else if ([[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]].some(([dx, dy]) => on(x + dx, y + dy))) g[y][x] = 'o';
      else if (on(x - 2, y - 2)) g[y][x] = 's';
    }
  save('objects', `zone-${label}`, W, W, { o: '#1d1531', h: shade(base, 1.35), f: base, s: shade(base, 0.72), l: shade(base, 1.2), w: '#f8f8f6' }, g,
    `골든벨 구역 판 ${label}(2×2칸, 바닥에 깖)`);
}

// ---------- 3. 교실 이름판(판 30×12를 벽 앞면 칸 30×30의 3~14줄에. 문 옆 벽 앞면에 걸림. 이름은 화면이 Galmuri9로 위에 적음) ----------
{
  const W = 30, H = 12, Y = 3, g = grid(W, T);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if ((x === 0 || x === W - 1) && (y === 0 || y === H - 1)) continue;
      g[Y + y][x] = x === 0 || y === 0 || x === W - 1 || y === H - 1 ? 'o' : y === 1 ? 'h' : y === H - 2 ? 's' : 'f';
    }
  for (const x of [2, W - 3]) g[Y + 2][x] = 'n';
  save('objects', 'roomSign', W, T, { o: '#1d1531', h: '#7fa9e8', f: '#3b6ea8', s: '#22437a', n: '#d6c5b4' }, g, '교실 이름판(문 옆 벽 앞면 칸, 판은 30×12로 3~14줄). 이름 글자는 화면이 적는다');
}
// ---------- 4. 강당 앞면 벽(30×30 변형 2개). 색은 생성 견본(art/raw/auditoriumFace)에서, 벽돌 박자는 10도트로 다시 짬 ----------
// 0줄 처마 테, 1~2줄 처마 그늘, 3줄 짙은 선, 4~27줄 벽돌 6단(줄눈 1 + 벽돌 2 + 그늘 1, 단마다 5도트 어긋남), 28~29줄 돌 굽.
{
  const pal = { a: '#506e9f', b: '#354770', c: '#1c1f41', d: '#ddd7cc', e: '#c3bdb2', f: '#9a948b', g: '#808fa7', h: '#606a7e', k: '#d0c9bc' };
  const frames = [0, 1].map((v) => {
    const g = grid(T, T);
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        if (y === 0) g[y][x] = 'a';
        else if (y <= 2) g[y][x] = 'b';
        else if (y === 3) g[y][x] = 'c';
        else if (y <= 27) {
          const k = Math.floor((y - 4) / 4), r = (y - 4) % 4;
          const brick = Math.floor((x + (k % 2) * 5) / 10);
          if (r === 0 || (x + (k % 2) * 5) % 10 === 0) g[y][x] = 'f';
          else if (r === 3) g[y][x] = 'e';
          else g[y][x] = v === 1 && (brick + k) % 4 === 1 ? 'k' : 'd'; // 변형 1: 몇 장은 조금 어두운 벽돌
        } else g[y][x] = y === 28 ? 'g' : 'h';
      }
    return { name: `v${v}`, rows: g.map((r) => r.join('')) };
  });
  const palette = new Map(Object.entries(pal).map(([k, v]) => [k, { rgb: rgb(v), alpha: 255 }]));
  writeFileSync(join(out, 'tiles', 'auditoriumFace.txt'),
    formatTxt({ comments: ['# 강당 앞면 벽(운동장 쪽, 지붕 아래 줄). 변형 2 (scripts/art/decals.mjs가 만듦)'], fw: T, fh: T, cols: 2, palette, frames }));
}
// ---------- 5. 강당 안쪽 벽 앞면(골든벨 맵, 30×30). 색은 생성 견본(art/raw/hallWall)에서 ----------
// 0~12줄 크림 벽과 가운데 창(10×12), 13줄 그늘, 14줄 짙은 선(난간), 15~28줄 나무 판벽(6도트마다 이음), 29줄 짙은 선.
{
  const pal = { a: '#fdf3cb', h: '#fefae6', b: '#bc7034', c: '#fab066', d: '#242245', e: '#7a3d1b', f: '#9dd8fb', w: '#d7f0fd', g: '#974d20', s: '#e9dcb0' };
  const g = grid(T, T);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      if (y <= 12) {
        const wx = x - 10, wy = y - 1;
        if (wx >= 0 && wx < 10 && wy >= 0 && wy < 12) {
          const edge = wx === 0 || wx === 9 || wy === 0 || wy === 11, inner = wx === 1 || wx === 8 || wy === 1 || wy === 10;
          g[y][x] = edge ? 'd' : inner ? 'c' : wx === 4 || wx === 5 || wy === 5 ? 'e' : wx + wy < 7 && wx < 4 ? 'w' : 'f';
        } else g[y][x] = y === 0 ? 'h' : 'a';
      } else if (y === 13) g[y][x] = 's';
      else if (y === 14 || y === 29) g[y][x] = 'd';
      else g[y][x] = x % 6 === 5 ? 'e' : x % 6 === 0 ? 'c' : y === 28 ? 'g' : 'b';
    }
  const palette = new Map(Object.entries(pal).map(([k, v]) => [k, { rgb: rgb(v), alpha: 255 }]));
  writeFileSync(join(out, 'tiles', 'gbWallFace.txt'),
    formatTxt({ comments: ['# 강당 안쪽 벽 앞면(골든벨 맵의 벽 앞면 대신). 창 하나·판벽 (scripts/art/decals.mjs가 만듦)'], fw: T, fh: T, cols: 1, palette, frames: [{ name: 'v0', rows: g.map((r) => r.join('')) }] }));
}
// ---------- 6. 2부 문(partDoor, 복도를 세로로 가로막는 2×4칸 + 위 벽 앞면 1칸 = 60×150) ----------
// 위에서 본 문틀: 가운데 24도트 폭 기둥이 위 벽(벽 윗면 색)에서 내려와 복도 바닥을 가로지르고 아래 벽(17행 벽 윗면)에 닿는다.
//   0~29줄: 위 벽 앞면 칸(12행)을 덮는 기둥 윗면, 30~41줄: 기둥 앞면(크림 벽과 파란 "2" 판), 42~139줄: 문지방(금속 띠)과 문짝, 140~149줄: 아래 기둥 윗면.
// 닫힘: 위에서 본 나무 미닫이 문짝 두 장(폭 12도트)이 가운데(90줄)에서 만남, 손잡이, 오른쪽 아래로 그림자.
// 열림: 문짝이 위·아래 기둥 속으로 들어가 끝만 6줄 보이고, 문지방 가운데에 문 홈이 보인다.
{
  const W = 60, H = 150, X0 = 18, X1 = 41;
  const pal = {
    a: '#c3c5cc', b: '#9fa1ab', o: '#4a4458', c: '#100e34', // 벽 윗면·테(wallTop·wallEdge 색), 외곽선
    f: '#fef5d2', k: '#1d2c4a', w: '#cd833c', // 기둥 앞면(wallFace 색)
    p: '#3b6ea8', q: '#7fa9e8', n: '#f8f8f6', // "2" 판
    t: '#b4b3b4', u: '#e5e6ea', v: '#7c7b7a', // 문지방
    h: '#fbd79d', m: '#edb46d', e: '#ce914e', // 문짝(교실 문 색)
    s: '#1d153166', // 문짝 그림자
  };
  const TWO = ['.nnn.', 'n...n', '....n', '...n.', '..n..', '.n...', 'nnnnn'];
  const draw = (open) => {
    const g = grid(W, H);
    const post = (y0, y1, edgeTop, edgeBottom) => {
      for (let y = y0; y <= y1; y++)
        for (let x = X0; x <= X1; x++)
          g[y][x] = x === X0 || x === X1 ? 'o' : x === X0 + 1 || x === X1 - 1 ? 'b' : (edgeTop && y === y0) || (edgeBottom && y === y1) ? 'o' : (edgeTop && y === y0 + 1) || (edgeBottom && y === y1 - 1) ? 'b' : 'a';
    };
    post(0, 29, false, false);
    // 기둥 앞면(12줄): 위·아래 짙은 선, 크림 벽, 아래 3줄은 판벽 색
    for (let y = 30; y <= 41; y++)
      for (let x = X0; x <= X1; x++) g[y][x] = x === X0 || x === X1 || y === 30 || y === 41 ? 'k' : y >= 38 ? 'w' : 'f';
    // "2" 판(12×10, 31~40줄) — 앞면 가운데
    for (let y = 31; y <= 40; y++)
      for (let x = 24; x <= 35; x++) {
        const edge = x === 24 || x === 35 || y === 31 || y === 40;
        const gy = y - 33, gx = x - 28;
        g[y][x] = edge ? 'c' : TWO[gy]?.[gx] === 'n' ? 'n' : y === 32 ? 'q' : 'p';
      }
    // 문지방(24도트 폭, 42~139줄)
    for (let y = 42; y <= 139; y++)
      for (let x = 15; x <= 44; x++) g[y][x] = x === 15 || x === 44 ? 'v' : x === 16 ? 'u' : open && (x === 29 || x === 30) ? 'v' : 't';
    post(140, 149, true, false);
    const leaf = (y0, y1) => {
      for (let y = y0; y <= y1; y++)
        for (let x = 24; x <= 35; x++) g[y][x] = x === 24 || x === 35 || y === y0 || y === y1 ? 'c' : x <= 26 ? 'h' : x >= 33 ? 'e' : 'm';
      for (let y = y0 + 1; y <= y1 + 1 && y < 140; y++) for (const x of [36, 37, 38]) if (g[y][x] === 't' || g[y][x] === 'v') g[y][x] = 's';
    };
    if (open) {
      leaf(42, 47);
      leaf(134, 139);
    } else {
      leaf(42, 90);
      leaf(91, 139);
      // 손잡이(문짝 양옆으로 튀어나온 은색 손잡이, 만나는 곳 가까이)
      for (const [x0, y0] of [[22, 82], [36, 82], [22, 94], [36, 94]])
        for (let y = y0; y < y0 + 6; y++) for (let x = x0; x < x0 + 2; x++) g[y][x] = y === y0 || y === y0 + 5 ? 'c' : x === x0 ? 'u' : 'v';
    }
    return g.map((r) => r.join(''));
  };
  const palette = new Map(Object.entries(pal).map(([k, v]) => [k, { rgb: rgb(v), alpha: v.length === 9 ? parseInt(v.slice(7), 16) : 255 }]));
  for (const [name, open] of [['partDoor', false], ['partDoor-open', true]])
    writeFileSync(join(out, 'objects', `${name}.txt`),
      formatTxt({ comments: [`# 2부 문 ${open ? '열림' : '닫힘'}(60×150, 위에서 본 문틀·문짝. 위 30줄은 12행 벽 앞면 칸을 덮음) (scripts/art/decals.mjs가 만듦)`], fw: W, fh: H, cols: 1, palette, frames: [{ name, rows: draw(open) }] }));
}
console.log('ok');
