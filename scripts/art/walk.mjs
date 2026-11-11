// 캐릭터 걷기 시트 만들기(docs/art.md "걷기").
//   stand <캐릭터.txt> <옆뒤.png>   옆·뒷모습(fit.mjs --grid 1x2 결과, 왼쪽 옆 + 뒤)을 캐릭터 색으로 맞춰 left, right(left를 뒤집음), up 서기 프레임으로 넣는다.
//                                   down(앞모습)은 그대로 둔다. 이미 있으면 바꾼다. right는 넣은 뒤 좌우가 다른 소품을 손으로 고친다.
//   make <캐릭터.txt> --rig <rig.json> --out <시트.txt>
//                                   서기 프레임 4개와 뼈대 값(rig.json의 캐릭터 id)으로 걷기 프레임을 만들어 12프레임 글자판을 쓴다.
//                                   만든 시트 글자판은 손으로 다듬는 원본이다. 다시 make하면 덮어쓰므로 --out을 다르게 주거나 고친 곳을 옮긴다.
//   preview <시트.txt> --out <미리보기.gif> [--scale 2] [--fps 8] [--strip <판.png>]
//                                   네 방향을 나란히 놓고 A → 서기 → B → 서기로 돌리는 GIF. --strip은 12프레임을 늘어놓은 판.
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import { writeGif } from './gif.mjs';
import { createImage, onChecker, readPng, scaleNearest, writePng } from './png.mjs';
import { CHARS, blank, formatTxt, mirror, parseTxt, toGrid, toRows } from './sprite.mjs';

process.on('uncaughtException', (err) => {
  console.error(err.message);
  process.exit(1);
});

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    rig: { type: 'string' },
    out: { type: 'string' },
    id: { type: 'string' },
    scale: { type: 'string', default: '2' },
    fps: { type: 'string', default: '8' },
    strip: { type: 'string' },
  },
});
const [command, a1, a2] = positionals;
const ORDER = ['down', 'left', 'right', 'up'];

if (command === 'stand' && a1 && a2) stand(a1, a2);
else if (command === 'make' && a1 && opt.rig && opt.out) make(a1);
else if (command === 'preview' && a1 && opt.out) preview(a1);
else {
  console.error('사용: walk.mjs stand <캐릭터.txt> <옆뒤.png> | make <캐릭터.txt> --rig <rig.json> --out <시트.txt> | preview <시트.txt> --out <gif>');
  process.exit(2);
}

// ---------- stand ----------
function stand(txtPath, pngPath) {
  const t = parseTxt(readFileSync(txtPath, 'utf8'), txtPath);
  const img = readPng(pngPath);
  if (img.width !== t.fw * 2 || img.height !== t.fh) throw new Error(`${pngPath}는 ${t.fw * 2}x${t.fh}(옆, 뒤 두 프레임)이어야 합니다.`);
  const pal = [...t.palette].map(([ch, p]) => ({ ch, rgb: p.rgb }));
  const added = [];
  const pick = (rgb) => {
    let best = null;
    for (const p of pal) {
      const d = dist(rgb, p.rgb);
      if (!best || d < best.d) best = { d, ch: p.ch };
    }
    if (best.d <= 40) return best.ch;
    // 앞모습에 없는 색(뒷머리 등): 새 글자로 더한다
    const ch = [...CHARS].find((c) => !t.palette.has(c));
    t.palette.set(ch, { rgb, layer: 'base' });
    pal.push({ ch, rgb });
    added.push(`${ch} ${rgb.join(',')}`);
    return ch;
  };
  const frameAt = (fx) =>
    Array.from({ length: t.fh }, (_, y) => {
      let s = '';
      for (let x = 0; x < t.fw; x++) {
        const i = (y * img.width + fx * t.fw + x) * 4;
        s += img.data[i + 3] >= 128 ? pick([img.data[i], img.data[i + 1], img.data[i + 2]]) : '.';
      }
      return s;
    });
  const left = frameAt(0);
  const up = frameAt(1);
  const down = t.frames.find((f) => f.name === 'down');
  if (!down) throw new Error(`${txtPath}에 down 프레임이 없습니다.`);
  t.frames = [down, { name: 'left', rows: left }, { name: 'right', rows: mirror(left) }, { name: 'up', rows: up }];
  t.cols = 4;
  // 어느 프레임에도 쓰지 않는 색은 뺀다(다시 stand할 때 남은 색)
  const used = new Set(t.frames.flatMap((f) => [...f.rows.join('')]));
  for (const ch of [...t.palette.keys()]) if (!used.has(ch)) t.palette.delete(ch);
  writeFileSync(txtPath, formatTxt(t));
  console.log(`저장: ${txtPath} (서기 down·left·right·up${added.length ? `, 새 색 ${added.length}가지: ${added.join(' / ')}` : ''})`);
}

function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

// ---------- make ----------
// 뼈대 값(rig.json의 "char-01": { down, left, up }; right는 left를 뒤집어 쓴다)
//   down/up: { legTop, split, arms: [[x0,y0,x1,y1](화면 왼쪽 팔), [..](화면 오른쪽 팔)] }
//     legTop: 다리가 보이기 시작하는 줄(옷자락 아래). split: 이 칸부터 오른쪽 다리.
//     arms: 흔들 팔 아랫부분(소매 끝·손) 상자. 앞으로 가는 팔은 1도트 올리고(짧아 보임), 뒤로 가는 팔은 1도트 내린다.
//   left: { legTop, arm: [x0,y0,x1,y1], stride: 4, swing: 3 }
//     arm: 보이는 쪽 팔 전체(어깨~손) 상자. 어깨(y0)를 축으로 손이 swing 칸만큼 앞뒤로 간다.
//     stride: 발이 서 있을 때보다 앞뒤로 나가는 칸 수.
// 걸음 프레임 공통: 몸(다리 위)이 1도트 내려간다(두 발이 벌어진 순간이 가장 낮다). 뒤쪽 발은 뒤꿈치가 들려 1~2도트 올라간다.
// A = 캐릭터의 왼발이 앞, B = 오른발이 앞. 팔은 반대쪽이 앞으로 간다.
function make(txtPath) {
  const t = parseTxt(readFileSync(txtPath, 'utf8'), txtPath);
  const id = opt.id ?? basename(txtPath, '.txt');
  const rigAll = JSON.parse(readFileSync(opt.rig, 'utf8'));
  const W = t.fw;
  const H = t.fh;
  const get = (name) => {
    const f = t.frames.find((fr) => fr.name === name);
    if (!f) throw new Error(`${txtPath}에 ${name} 프레임이 없습니다. walk.mjs stand를 먼저 하십시오.`);
    return toGrid(f.rows);
  };
  // rig.json에 없는 값은 서기 프레임에서 찾는다(찾은 값을 화면에 보이니, 틀리면 rig.json에 적어 고친다)
  const given = rigAll[id] ?? {};
  const skin = skinChar(get('down'), outlineChar(get('down')));
  const rig = {
    down: { ...autoFront(get('down'), skin), ...given.down },
    up: { ...autoFront(get('up'), skin), ...given.up },
    left: { ...autoSide(get('left'), skin), ...given.left },
  };
  console.log(`${id} 뼈대(피부 ${skin}): ${JSON.stringify(rig)}`);
  const shade = makeShade(t.palette, outlineChar(get('down')));
  const out = [];
  for (const dir of ORDER) {
    const base = get(dir);
    let A;
    let B;
    if (dir === 'down' || dir === 'up') {
      const r = rig[dir];
      // 앞모습에서 캐릭터의 왼발은 화면 오른쪽 다리, 뒷모습에서는 화면 왼쪽 다리
      const leftLegIsScreenRight = dir === 'down';
      A = frontStep(base, r, leftLegIsScreenRight ? 'R' : 'L');
      B = frontStep(base, r, leftLegIsScreenRight ? 'L' : 'R');
    } else {
      const r = dir === 'left' ? rig.left : mirrorRig(rig.left, W);
      const facing = dir === 'left' ? -1 : 1;
      // 왼쪽을 보면 보이는 쪽(가까운) 다리가 캐릭터의 왼다리, 오른쪽을 보면 오른다리
      A = sideStep(base, r, facing, dir === 'left' ? 'near' : 'far');
      B = sideStep(base, r, facing, dir === 'left' ? 'far' : 'near');
    }
    out.push({ name: `${dir}-a`, rows: toRows(A) }, { name: dir, rows: toRows(base) }, { name: `${dir}-b`, rows: toRows(B) });
  }

  function frontStep(base, r, forward) {
    const g = blank(W, H);
    const legs = (side) => (x) => (side === 'L' ? x < r.split : x >= r.split);
    const back = forward === 'L' ? 'R' : 'L';
    const lift = r.lift ?? 2;
    // 뒤쪽 다리(뒤꿈치 들림): lift만큼 올림. 앞쪽 다리: 그대로
    stamp(g, base, (x, y) => y >= r.legTop && legs(back)(x), 0, -lift);
    stamp(g, base, (x, y) => y >= r.legTop && legs(forward)(x), 0, 0);
    // 몸: 1도트 내림. 팔 상자는 따로
    const inArm = (x, y) => r.arms.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
    stamp(g, base, (x, y) => y < r.legTop && !inArm(x, y), 0, 1);
    // 팔: 앞다리 반대쪽 팔이 앞으로(1도트 올림), 다른 팔은 뒤로(1도트 내림). 몸이 내려간 1도트를 더한다.
    r.arms.forEach(([x0, y0, x1, y1], k) => {
      const side = k === 0 ? 'L' : 'R';
      const dy = side === forward ? 2 : 0; // 앞다리 쪽 팔은 뒤로(몸보다 1 더 내림), 반대쪽 팔은 앞으로(제자리 = 몸보다 1 위)
      stretchBox(g, base, [x0, y0, x1, y1], dy);
    });
    return g;
  }

  function sideStep(base, r, facing, nearForward) {
    // nearForward: 'near'면 가까운 다리가 앞, 'far'면 먼 다리가 앞
    const g = blank(W, H);
    const stride = r.stride ?? 4;
    const swing = r.swing ?? 3;
    const span = H - 1 - r.legTop;
    const legOff = (dirSign) => (x, y) => [x + Math.round((dirSign * stride * (y - r.legTop)) / span), y];
    const nearSign = nearForward === 'near' ? facing : -facing;
    const farSign = -nearSign;
    const isLeg = (x, y) => y >= r.legTop;
    // 먼 쪽 팔은 몸에 가려 그리지 않는다
    const [ax0, ay0, ax1, ay1] = r.arm;
    const inArm = (x, y) => x >= ax0 && x <= ax1 && y >= ay0 && y <= ay1;
    const armOff = (dirSign) => (x, y) => [x + Math.round((dirSign * swing * (y - ay0)) / Math.max(1, ay1 - ay0)), y + 1];
    // 먼 다리(어둡게, 뒤꿈치 들림은 뒤로 갈 때만)
    warpLeg(g, base, isLeg, legOff(farSign), farSign === -facing, shade);
    // 가까운 다리
    warpLeg(g, base, isLeg, legOff(nearSign), nearSign === -facing, null);
    // 몸(팔 자리는 몸통 색으로 메움), 1도트 내림
    const body = fillArmHole(base, r.arm, r.legTop);
    stamp(g, body, (x, y) => y < r.legTop, 0, 1);
    // 가까운 팔: 가까운 다리와 반대로
    warp(g, base, inArm, armOff(-nearSign), null);
    return g;
  }

  function warpLeg(g, base, test, off, lifted, map) {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const ch = base[y][x];
        if (ch === '.' || !test(x, y)) continue;
        const [nx, ny] = off(x, y);
        put(g, nx, ny - (lifted ? 1 : 0), map ? map(ch) : ch); // 뒤로 간 발은 뒤꿈치가 들린다
      }
  }

  const sheet = { comments: [`# ${id} 걷기 시트(walk.mjs make로 만든 뒤 손으로 다듬음). 줄: down, left, right, up / 칸: 걸음 A, 서기, 걸음 B`], fw: W, fh: H, cols: 3, palette: t.palette, frames: out };
  writeFileSync(opt.out, formatTxt(sheet));
  console.log(`저장: ${opt.out} (12프레임)`);

  function stamp(g, src, test, dx, dy) {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const ch = src[y][x];
        if (ch !== '.' && test(x, y)) put(g, x + dx, y + dy, ch);
      }
  }
  function warp(g, src, test, off, map) {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const ch = src[y][x];
        if (ch === '.' || !test(x, y)) continue;
        const [nx, ny] = off(x, y);
        put(g, nx, ny, map ? map(ch) : ch);
      }
  }
  /** 상자 안 그림을 dy만큼 옮긴다. 내리면 상자 맨 윗줄을 되풀이해 이어 붙인다(팔이 길어짐) */
  function stretchBox(g, src, [x0, y0, x1, y1], dy) {
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const ch = src[y][x];
        if (ch !== '.') put(g, x, y + dy, ch);
      }
      for (let k = 0; k < dy; k++) if (src[y0][x] !== '.') put(g, x, y0 + k, src[y0][x]);
    }
  }
  function put(g, x, y, ch) {
    if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = ch;
  }
}

// ---------- 뼈대 자동 찾기 ----------
// 다리 시작 줄: 바지 색(신발 바로 위 줄들에서 가장 많은 색)이 그 줄의 절반 넘게 나오기 시작하는 줄. 다리 길이는 6~16줄로 묶는다.
// 팔: 피부색(앞모습 얼굴 가운데에서 가장 많은 색) 손 덩어리를 찾아, 손 아래 끝에서 7줄을 흔든다.
function opaque(g, x, y) {
  return (g[y]?.[x] ?? '.') !== '.';
}
function rowSpan(g, y) {
  let a = -1;
  let b = -1;
  for (let x = 0; x < g[0].length; x++) if (opaque(g, x, y)) (a < 0 && (a = x)), (b = x);
  return [a, b];
}

function legTopOf(g) {
  const H = g.length;
  const line = outlineChar(g);
  const n = new Map();
  for (let y = H - 9; y <= H - 6; y++) for (const ch of g[y]) if (ch !== '.' && ch !== line) n.set(ch, (n.get(ch) ?? 0) + 1);
  const pants = [...n].sort((a, b) => b[1] - a[1])[0]?.[0];
  let top = H - 8;
  for (let y = H - 16; y <= H - 6; y++) {
    const cells = g[y].filter((ch) => ch !== '.' && ch !== line);
    if (cells.length && cells.filter((ch) => ch === pants).length >= cells.length / 2) {
      top = y;
      break;
    }
  }
  return top;
}

/** 손 덩어리: 피부색 점을 x 범위 [lo, hi], y 범위 [ylo, yhi]에서 모은 상자 */
function handBox(g, skin, lo, hi, ylo, yhi) {
  let x0 = Infinity;
  let x1 = -1;
  let y0 = Infinity;
  let y1 = -1;
  for (let y = ylo; y <= yhi; y++)
    for (let x = lo; x <= hi; x++)
      if (g[y]?.[x] === skin) (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (y0 = Math.min(y0, y)), (y1 = Math.max(y1, y));
  return y1 < 0 ? null : { x0, x1, y0, y1 };
}

/** 앞·뒷모습 */
function autoFront(g, skin) {
  const H = g.length;
  const W = g[0].length;
  const legTop = legTopOf(g);
  // 두 다리 사이: 다리 줄에서 가운데 가까이 가장 자주 비는 칸
  const [bx0, bx1] = rowSpan(g, H - 1);
  const cx = Math.round((bx0 + bx1) / 2);
  const count = new Map();
  for (let y = legTop; y < H; y++)
    for (let x = cx - 3; x <= cx + 3; x++) if (!opaque(g, x, y) && opaque(g, x - 3, y) && opaque(g, x + 3, y)) count.set(x, (count.get(x) ?? 0) + 1);
  const split = [...count].sort((a, b) => b[1] - a[1] || Math.abs(a[0] - cx) - Math.abs(b[0] - cx))[0]?.[0] ?? cx;
  const arm = (side) => {
    const h = side < 0 ? handBox(g, skin, 0, cx - 5, 32, Math.min(H - 1, legTop + 4)) : handBox(g, skin, cx + 5, W - 1, 32, Math.min(H - 1, legTop + 4));
    if (h) return [h.x0 - 1, h.y1 + 1 - 7, h.x1 + 1, h.y1 + 1];
    // 손이 안 보이면 몸 바깥 5칸
    let edge = side < 0 ? W : -1;
    for (let y = legTop - 12; y < legTop; y++) {
      const [a, b] = rowSpan(g, y);
      if (a >= 0) edge = side < 0 ? Math.min(edge, a) : Math.max(edge, b);
    }
    return side < 0 ? [edge, legTop - 7, edge + 4, legTop - 1] : [edge - 4, legTop - 7, edge, legTop - 1];
  };
  return { legTop, split, arms: [arm(-1), arm(1)] };
}

/** 옆모습 */
function autoSide(g, skin) {
  const H = g.length;
  const legTop = legTopOf(g);
  const h = handBox(g, skin, 0, g[0].length - 1, 32, Math.min(H - 1, legTop + 4));
  if (!h) return { legTop, arm: [0, 0, -1, -1] };
  return { legTop, arm: [h.x0 - 2, Math.max(26, h.y1 - 15), h.x1 + 1, h.y1 + 1] };
}

/** 피부 글자: 앞모습 얼굴 가운데(18~24줄, 가운데 ±5칸)에서 가장 많은 외곽선 아닌 글자 */
function skinChar(g, line) {
  const [bx0, bx1] = rowSpan(g, g.length - 1);
  const cx = Math.round((bx0 + bx1) / 2);
  const n = new Map();
  for (let y = 18; y <= 24; y++)
    for (let x = cx - 5; x <= cx + 5; x++) {
      const ch = g[y][x];
      if (ch !== '.' && ch !== line) n.set(ch, (n.get(ch) ?? 0) + 1);
    }
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

/** 옆모습 뼈대를 좌우로 뒤집는다 */
function mirrorRig(r, W) {
  const [x0, y0, x1, y1] = r.arm;
  return { ...r, arm: [W - 1 - x1, y0, W - 1 - x0, y1] };
}

/** 팔 상자 자리를 몸통 색으로 메운 서기 프레임.
 *  같은 줄에서 상자 양쪽이 모두 몸이면 가까운 쪽 색으로 메운다. 한쪽만 몸이면(팔이 몸의 가장자리) 그쪽 안쪽 색으로 메우고,
 *  원래 그림이 있던 바깥 끝 칸에는 외곽선 색을 둔다(팔이 빠져도 몸통 윤곽이 그대로 남게). */
function fillArmHole(base, [x0, y0, x1, y1], legTop) {
  const W = base[0].length;
  const line = outlineChar(base);
  const g = base.map((row) => [...row]);
  for (let y = y0; y <= Math.min(y1, legTop - 1); y++) {
    const L = x0 > 0 ? base[y][x0 - 1] : '.';
    const R = x1 < W - 1 ? base[y][x1 + 1] : '.';
    const cells = [];
    for (let x = x0; x <= x1; x++) if (base[y][x] !== '.') cells.push(x);
    if (!cells.length) continue;
    if (L !== '.' && R !== '.') {
      for (let x = x0; x <= x1; x++) g[y][x] = x - x0 <= x1 - x ? L : R;
    } else if (L !== '.' || R !== '.') {
      const inner = L !== '.' ? innerColor(base[y], x0 - 1, -1, line) : innerColor(base[y], x1 + 1, 1, line);
      for (let x = x0; x <= x1; x++) g[y][x] = '.';
      const edge = L !== '.' ? Math.max(...cells) : Math.min(...cells);
      const from = L !== '.' ? x0 : edge;
      const to = L !== '.' ? edge : x1;
      for (let x = from; x <= to; x++) g[y][x] = inner;
      g[y][edge] = line;
    } else for (let x = x0; x <= x1; x++) g[y][x] = '.';
  }
  return g;
}

/** 외곽선 글자: 투명과 맞닿은 점에서 가장 많은 글자 */
function outlineChar(g) {
  const n = new Map();
  for (let y = 0; y < g.length; y++)
    for (let x = 0; x < g[0].length; x++) {
      const ch = g[y][x];
      if (ch === '.') continue;
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (g[y + dy]?.[x + dx] ?? '.') === '.');
      if (edge) n.set(ch, (n.get(ch) ?? 0) + 1);
    }
  return [...n].sort((a, b) => b[1] - a[1])[0][0];
}

/** x에서 step 방향으로 가며 외곽선이 아닌 첫 색. 없으면 외곽선 */
function innerColor(row, x, step, line) {
  for (let i = x; i >= 0 && i < row.length; i += step) if (row[i] !== '.' && row[i] !== line) return row[i];
  return line;
}

/** 색마다 조금 어두운 색(같은 팔레트에서 0.7배에 가까우면서 색조가 비슷한 색). 몸 뒤쪽 다리에 쓴다.
 *  어두운 색(밝기 80 아래)은 외곽선 색으로 어둡게 할 수 있다. 알맞은 색이 없으면 그대로 둔다. */
function makeShade(palette, line) {
  const all = [...palette].map(([ch, p]) => ({ ch, rgb: p.rgb }));
  const lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  const hue = (c) => {
    const [r, g, b] = c;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    if (mx - mn < 25) return null; // 회색 계열
    let h = mx === r ? (g - b) / (mx - mn) : mx === g ? 2 + (b - r) / (mx - mn) : 4 + (r - g) / (mx - mn);
    return ((h * 60) % 360 + 360) % 360;
  };
  const sameHue = (a, b) => {
    const ha = hue(a);
    const hb = hue(b);
    if (ha === null || hb === null) return ha === hb || lum(b) < 60;
    const d = Math.abs(ha - hb);
    return Math.min(d, 360 - d) <= 30;
  };
  const map = new Map();
  for (const p of all) {
    if (p.ch === line) continue;
    const target = p.rgb.map((v) => v * 0.7);
    let best = null;
    let bd = Infinity;
    for (const q of all) {
      if (q === p || lum(q.rgb) >= lum(p.rgb)) continue;
      if (q.ch === line && lum(p.rgb) >= 80) continue;
      if (q.ch !== line && !sameHue(p.rgb, q.rgb)) continue;
      const d = dist(q.rgb, target);
      if (d < bd) (bd = d), (best = q);
    }
    map.set(p.ch, best && bd < 60 ? best.ch : p.ch);
  }
  return (ch) => map.get(ch) ?? ch;
}

// ---------- preview ----------
function preview(txtPath) {
  const t = parseTxt(readFileSync(txtPath, 'utf8'), txtPath);
  const scale = Number(opt.scale);
  const fps = Number(opt.fps);
  const frame = (name) => {
    const f = t.frames.find((fr) => fr.name === name);
    if (!f) throw new Error(`${txtPath}에 ${name} 프레임이 없습니다.`);
    return f;
  };
  const gap = 4;
  const W = ORDER.length * (t.fw + gap) + gap;
  const H = t.fh + gap * 2;
  const cycle = ['a', '', 'b', ''];
  const imgs = cycle.map((step) => {
    const img = createImage(W, H);
    ORDER.forEach((dir, k) => {
      const f = frame(step ? `${dir}-${step}` : dir);
      draw(img, f, gap + k * (t.fw + gap), gap);
    });
    return scaleNearest(img, scale);
  });
  writeGif(opt.out, imgs, { delay: Math.round(100 / fps) });
  console.log(`저장: ${opt.out} (${ORDER.join('·')}, A→서기→B→서기, ${fps}fps, ${scale}배)`);
  if (opt.strip) {
    const img = createImage(3 * (t.fw + gap) + gap, 4 * (t.fh + gap) + gap);
    ORDER.forEach((dir, r) =>
      ['a', '', 'b'].forEach((step, c) => draw(img, frame(step ? `${dir}-${step}` : dir), gap + c * (t.fw + gap), gap + r * (t.fh + gap))),
    );
    writePng(opt.strip, onChecker(scaleNearest(img, 4), 8));
    console.log(`저장: ${opt.strip} (12프레임, 4배)`);
  }
  function draw(img, f, x0, y0) {
    f.rows.forEach((line, y) =>
      [...line].forEach((ch, x) => {
        if (ch !== '.') img.data.set([...t.palette.get(ch).rgb, 255], ((y0 + y) * img.width + x0 + x) * 4);
      }),
    );
  }
}
