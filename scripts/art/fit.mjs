// 생성 그림(크고 가장자리가 흐린 "도트 느낌" 그림)을 진짜 도트 그림으로 다듬어 시트 한 장으로 묶는다.
// 순서: 배경 지우기 → 가짜 픽셀 크기(격자) 찾기 → 칸마다 한 점씩 색 고르기 → 그림 하나하나로 나누기 → 프레임에 맞추기 → 색 줄이기 → 시트로 묶기
// 자세한 규격과 과정은 docs/art.md.
//
// 사용: node scripts/art/fit.mjs <받은 그림.png> --out <시트.png> [옵션]
//   --grid 4x3         그림이 4줄×3칸으로 놓여 있다(기본 1x1). 이어진 덩어리를 그림 하나로 보고 줄·칸 순서로 늘어놓는다
//   --frame 30x60      프레임 크기(도트). 그림이 크면 같은 비율로 줄여 넣는다. 없으면 가장 큰 그림에 맞춘다
//   --anchor bottom    프레임 안 자리: bottom(아래 가운데, 캐릭터·사물) 또는 center
//   --full             --grid 칸 전체를 그림 하나로 본다(바닥 타일처럼 배경이 없는 그림). --frame과 함께 쓰면 칸을 프레임 크기로 나눠 가짜 픽셀 크기를 정한다
//   --px auto          가짜 픽셀 한 칸의 크기(받은 그림의 픽셀). auto면 찾는다. 숫자나 "가로x세로"로 정할 수 있다.
//                      --frame이 있으면(--full 아닐 때) 기본은 frame이다. frame이면 가장 큰 그림의 높이를 --height 도트(기본: --frame 높이)로 나눈다(도트 크기가 고르지 않은 생성 그림)
//   --bg auto          배경: auto, alpha(투명 배경), #ff00ff(이 색을 모두 지운다)
//   --tol 48           배경색으로 볼 색 차이(0~255)
//   --badge 0.08x0.06  오른쪽 아래 구석(그림 너비·높이의 비율)을 지운다. 생성 그림의 "AI" 표시 자리. 0이면 지우지 않는다(--full일 때도)
//   --merge 16         차이가 이 값(0~255) 이하인 색을 하나로 묶는다(생성 그림의 잡음 없애기)
//   --colors 0         시트 전체의 색 수를 이만큼으로 줄인다(0이면 --merge만 한다)
//   --cols 3           시트의 칸 수(기본: --grid의 칸 수)
//   --scale 1          저장할 때 키우는 배수(가장 가까운 픽셀)
//   --preview <파일>   체크무늬 바탕에 크게 키운 미리보기를 따로 저장한다(--preview-scale, 기본 8)
import { parseArgs } from 'node:util';
import { createImage, onChecker, readPng, scaleNearest, writePng } from './png.mjs';

process.on('uncaughtException', (err) => {
  console.error(err.message);
  process.exit(1);
});

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    grid: { type: 'string', default: '1x1' },
    frame: { type: 'string' },
    anchor: { type: 'string', default: 'bottom' },
    full: { type: 'boolean', default: false },
    px: { type: 'string' },
    bg: { type: 'string', default: 'auto' },
    tol: { type: 'string', default: '48' },
    badge: { type: 'string', default: '0.08x0.06' },
    height: { type: 'string' },
    merge: { type: 'string', default: '16' },
    colors: { type: 'string', default: '0' },
    cols: { type: 'string' },
    scale: { type: 'string', default: '1' },
    preview: { type: 'string' },
    'preview-scale': { type: 'string', default: '8' },
  },
});

const input = positionals[0];
if (!input || !opt.out) {
  console.error('사용: node scripts/art/fit.mjs <받은 그림.png> --out <시트.png> [--grid 4x3] [--frame 30x60] ...(파일 맨 위 설명 참고)');
  process.exit(2);
}
const pair = (s, name) => {
  const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(s ?? '');
  if (!m) throw new Error(`${name}는 "가로x세로"로 적습니다: ${s}`);
  return [Number(m[1]), Number(m[2])];
};
const [gridRows, gridCols] = pair(opt.grid, '--grid');
const frame = opt.frame ? pair(opt.frame, '--frame') : null;
// 생성 그림은 도트 크기가 고르지 않아, 프레임이 있으면(타일이 아니면) 그림 높이로 칸 크기를 정하는 쪽을 기본으로 한다
opt.px ??= frame && !opt.full ? 'frame' : 'auto';
if (!['bottom', 'center'].includes(opt.anchor)) throw new Error('--anchor는 bottom 또는 center입니다.');

const img = readPng(input);
const { width: W, height: H, data } = img;
const report = [`받은 그림: ${input} (${W}x${H})`];

// ---------- 1. 배경 지우기: mask[i] = 1이면 그림, 0이면 배경 ----------
const dist = (i, r, g, b) => Math.max(Math.abs(data[i] - r), Math.abs(data[i + 1] - g), Math.abs(data[i + 2] - b));
const mask = new Uint8Array(W * H).fill(1);
{
  let clear = 0;
  for (let i = 0; i < W * H; i++) if (data[i * 4 + 3] < 128) clear++;
  const tol = Number(opt.tol);
  if (opt.bg === 'alpha' || (opt.bg === 'auto' && clear > W * H * 0.01)) {
    for (let i = 0; i < W * H; i++) mask[i] = data[i * 4 + 3] >= 128 ? 1 : 0;
    report.push(`배경: 투명 배경을 그대로 씁니다(투명 ${((clear / (W * H)) * 100).toFixed(1)}%).`);
  } else if (!opt.full || opt.bg !== 'auto') {
    let key;
    const everywhere = opt.bg.startsWith('#'); // 정한 색은 그림 안쪽(팔과 몸 사이 등)에 있어도 지운다
    if (everywhere) {
      const n = parseInt(opt.bg.slice(1), 16);
      key = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    } else key = borderColor();
    // 가장자리에서 이어진 배경색을 지운다. 그림 안쪽의 같은 색(흰 옷 등)은 남는다.
    const queue = [];
    const push = (x, y) => {
      const p = y * W + x;
      if (mask[p] && dist(p * 4, ...key) <= tol) {
        mask[p] = 0;
        queue.push(p);
      }
    };
    for (let x = 0; x < W; x++) push(x, 0), push(x, H - 1);
    for (let y = 0; y < H; y++) push(0, y), push(W - 1, y);
    while (queue.length) {
      const p = queue.pop();
      const x = p % W;
      const y = (p / W) | 0;
      if (x > 0) push(x - 1, y);
      if (x < W - 1) push(x + 1, y);
      if (y > 0) push(x, y - 1);
      if (y < H - 1) push(x, y + 1);
    }
    if (everywhere) for (let p = 0; p < W * H; p++) if (dist(p * 4, ...key) <= tol) mask[p] = 0;
    if (everywhere) {
      // 가장자리 번짐: 배경색에 어두운 색이 섞인 점(배경색 × t에 가까운 색)이 배경과 맞닿아 있으면 지운다. 두 번 되풀이한다.
      const bb = key[0] ** 2 + key[1] ** 2 + key[2] ** 2;
      let fringe = 0;
      for (let pass = 0; pass < 2; pass++) {
        const drop = [];
        for (let p = 0; p < W * H; p++) {
          if (!mask[p]) continue;
          const x = p % W;
          const y = (p / W) | 0;
          const touch = (x > 0 && !mask[p - 1]) || (x < W - 1 && !mask[p + 1]) || (y > 0 && !mask[p - W]) || (y < H - 1 && !mask[p + W]);
          if (!touch) continue;
          const c = [data[p * 4], data[p * 4 + 1], data[p * 4 + 2]];
          const t = (c[0] * key[0] + c[1] * key[1] + c[2] * key[2]) / bb;
          if (t < 0.3) continue;
          const r = Math.hypot(c[0] - t * key[0], c[1] - t * key[1], c[2] - t * key[2]);
          if (r <= tol) drop.push(p);
        }
        for (const p of drop) mask[p] = 0;
        fringe += drop.length;
      }
      if (fringe) report.push(`  가장자리 번짐 ${fringe}픽셀을 지웠습니다.`);
    }
    // 생성 그림 오른쪽 아래 구석의 "AI" 표시 자리를 지운다(--badge 0이면 하지 않는다)
    if (opt.badge !== '0' && !opt.full) {
      const [bw, bh] = pair(opt.badge, '--badge');
      let n = 0;
      for (let y = Math.floor(H * (1 - bh)); y < H; y++)
        for (let x = Math.floor(W * (1 - bw)); x < W; x++) if (mask[y * W + x]) (mask[y * W + x] = 0), n++;
      if (n) report.push(`  오른쪽 아래 구석(AI 표시 자리) ${n}픽셀을 지웠습니다(--badge ${opt.badge}).`);
    }
    const hex = '#' + key.map((v) => v.toString(16).padStart(2, '0')).join('');
    report.push(`배경: ${hex} 둘레 ${tol}을 지웠습니다(${everywhere ? '그림 안쪽까지' : '가장자리에서 이어진 곳만'}).`);
  }
}

/** 가장자리 픽셀에서 가장 많은 색(4비트로 묶어 센 뒤 평균) */
function borderColor() {
  const bins = new Map();
  const add = (x, y) => {
    const i = (y * W + x) * 4;
    const k = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const b = bins.get(k) ?? [0, 0, 0, 0];
    b[0]++, (b[1] += data[i]), (b[2] += data[i + 1]), (b[3] += data[i + 2]);
    bins.set(k, b);
  };
  for (let x = 0; x < W; x++) add(x, 0), add(x, H - 1);
  for (let y = 0; y < H; y++) add(0, y), add(W - 1, y);
  const [n, r, g, b] = [...bins.values()].sort((a, b) => b[0] - a[0])[0];
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

// ---------- 2. 가짜 픽셀 크기 찾기 ----------
// 도트 느낌 그림은 색이 바뀌는 자리가 일정한 간격(가짜 픽셀 한 칸)마다 몰려 있다.
// 가로·세로로 색이 바뀌는 횟수를 세고, 그 간격과 시작점을 빗살(comb)로 맞춰 본다.
let grid;
{
  if (opt.px === 'auto' && opt.full && frame) {
    // 칸을 꽉 채운 그림(타일)은 넓은 한 색 면이 많아 간격을 찾기 어렵다. 칸을 프레임 크기로 나눈다.
    grid = { px: W / gridCols / frame[0], ox: 0, py: H / gridRows / frame[1], oy: 0 };
    report.push(`가짜 픽셀: 칸을 프레임 크기로 나눠 ${grid.px.toFixed(2)}x${grid.py.toFixed(2)}로 정했습니다(--full).`);
  } else if (opt.px === 'auto') {
    const ex = new Float64Array(W);
    const ey = new Float64Array(H);
    const changed = (p, q) => (mask[p] || mask[q]) && (mask[p] !== mask[q] || dist(p * 4, data[q * 4], data[q * 4 + 1], data[q * 4 + 2]) > 24);
    for (let y = 0; y < H; y++) for (let x = 1; x < W; x++) if (changed(y * W + x, y * W + x - 1)) ex[x]++;
    for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) if (changed(y * W + x, (y - 1) * W + x)) ey[y]++;
    const gx = findPeriod(smooth(ex), 'x');
    const gy = findPeriod(smooth(ey), 'y');
    grid = { px: gx.p, ox: gx.phase, py: gy.p, oy: gy.phase };
    report.push(`가짜 픽셀: 가로 ${gx.p.toFixed(2)}, 세로 ${gy.p.toFixed(2)}(받은 그림의 픽셀). 뚜렷함 ${gx.score.toFixed(1)}·${gy.score.toFixed(1)}`);
    if (Math.min(gx.score, gy.score) < 1.5) report.push('  격자가 뚜렷하지 않습니다. 결과가 이상하면 --px로 크기를 직접 정하십시오.');
  } else if (opt.px === 'frame') {
    // 생성 그림의 "도트"는 크기가 고르지 않아 격자를 찾기 어려울 때가 많다. 가장 큰 그림의 높이를 --height 도트(기본: 프레임 높이)로
    // 나눠 칸 크기를 정하고, 그 격자로 바로 옮긴다(아래 3에서). 여기서는 덩어리를 찾기 위한 거친 격자만 둔다.
    if (!frame) throw new Error('--px frame은 --frame과 함께 씁니다.');
    grid = { px: 8, ox: 0, py: 8, oy: 0 };
  } else {
    const [px, py] = opt.px.includes('x') ? pair(opt.px, '--px') : [Number(opt.px), Number(opt.px)];
    grid = { px, ox: 0, py, oy: 0 };
    report.push(`가짜 픽셀: ${px}x${py}로 정했습니다.`);
  }
}

function smooth(a) {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = (a[i - 1] ?? 0) + 2 * a[i] + (a[i + 1] ?? 0);
  return out;
}

/** 1) 빗살 간격 p와 시작점 phase를 바꿔 가며, 빗살이 닿은 자리의 평균이 전체 평균의 몇 배인지(score) 본다.
 *  2) 점수가 높은 간격과 그 1/2~1/8을 후보로, 그 간격으로 나눈 칸 안쪽이 한 색인지(어긋난 픽셀 비율) 본다.
 *     칸이 진짜 픽셀보다 크면 안쪽에 두 색이 섞이고, 작으면 한 색이다. 한 색인 후보 가운데 가장 큰 간격을 고른다.
 *     (빗살 점수만으로는 진짜 간격과 그 2배를 가리기 어렵다) */
function findPeriod(profile, axis) {
  const n = profile.length;
  const mean = profile.reduce((s, v) => s + v, 0) / n || 1;
  const comb = (p) => {
    let best = { p, phase: 0, score: 0 };
    for (let phase = 0; phase < p; phase += 0.25) {
      let sum = 0;
      let count = 0;
      for (let t = phase; t < n; t += p) {
        sum += profile[Math.round(t)] ?? 0;
        count++;
      }
      const score = sum / count / mean;
      if (score > best.score) best = { p, phase, score };
    }
    return best;
  };
  const scan = [];
  for (let p = 2; p <= n / 8; p += 0.05) scan.push(comb(p)); // 빗살이 8개는 되어야 믿을 만하다
  // 큰 간격은 빗살이 적어 우연히 점수가 높게 나오기도 한다. 높은 봉우리(서로 1% 넘게 다른 것) 12개와
  // 그 1/2~1/8을 모두 후보로 두고, 칸 안쪽이 한 색인지로 가린다.
  const near = (a, b) => Math.abs(a - b) <= Math.max(a, b) * 0.01;
  const peaks = [];
  for (const r of scan.filter((r, i) => r.score > (scan[i - 1]?.score ?? 0) && r.score >= (scan[i + 1]?.score ?? 0)).sort((a, b) => b.score - a.score)) {
    if (peaks.length >= 12) break;
    if (!peaks.some((q) => near(q.p, r.p))) peaks.push(r);
  }
  const candidates = [];
  for (const r of peaks)
    for (let d = 1; d <= 8 && r.p / d >= 2; d++)
      if (!candidates.some((c) => near(c.p, r.p / d))) candidates.push(d === 1 ? r : comb(r.p / d));
  for (const c of candidates) c.error = blockError(c, axis);
  const minError = Math.min(...candidates.map((c) => c.error));
  return candidates.filter((c) => c.error <= minError + 0.02).sort((a, b) => b.p - a.p)[0];
}

/** axis 방향으로 간격 p로 나눈 칸의 안쪽(가장자리 1/4씩 뺀 곳)에서, 칸의 가장 많은 색과 다른 픽셀의 비율 */
function blockError({ p, phase }, axis) {
  const along = axis === 'x' ? W : H;
  const across = axis === 'x' ? H : W;
  const at = (a, b) => (axis === 'x' ? b * W + a : a * W + b);
  let bad = 0;
  let total = 0;
  for (let b = 0; b < across; b += 2) {
    for (let k = Math.floor(-phase / p); phase + k * p < along; k++) {
      const a0 = Math.max(0, Math.ceil(phase + (k + 0.25) * p));
      const a1 = Math.min(along - 1, Math.floor(phase + (k + 0.75) * p));
      if (a1 < a0) continue;
      const bins = new Map();
      let solid = 0;
      for (let a = a0; a <= a1; a++) {
        const q = at(a, b);
        if (!mask[q]) continue;
        solid++;
        const i = q * 4;
        const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
        bins.set(key, (bins.get(key) ?? 0) + 1);
      }
      if (!solid) continue;
      const len = a1 - a0 + 1;
      total += len;
      bad += len - solid; // 그림과 배경이 섞인 칸
      if (solid) {
        let top = 0;
        let topKey = 0;
        for (const [key, c] of bins) if (c > top) (top = c), (topKey = key);
        const r = ((topKey >> 8) << 4) + 8, g = (((topKey >> 4) & 15) << 4) + 8, bl = ((topKey & 15) << 4) + 8;
        for (let a = a0; a <= a1; a++) {
          const q = at(a, b);
          if (mask[q] && dist(q * 4, r, g, bl) > 40) bad++;
        }
      }
    }
  }
  return total ? bad / total : 1;
}

// ---------- 3. 그림 하나하나를 도트로 옮기기 ----------
// 받은 그림 전체를 가짜 픽셀 격자에 맞춰 한 칸에 한 점씩 옮긴 뒤(작은 그림 한 장) 그림 하나하나로 나눈다.
// --full이면 --grid 칸대로 자른다. 아니면 이어진 덩어리(한 점 틈은 이어진 것으로 본다)를 그림 하나로 보고 --grid의 줄·칸 순서로 늘어놓는다.
// 생성 그림은 칸에 맞춰 놓이지 않는 일이 많아 덩어리로 찾는 쪽을 기본으로 한다.
if (opt.px === 'frame') {
  const before = report.length;
  const coarse = splitBlobs(toDots());
  report.length = before;
  if (!coarse.length) throw new Error('그림을 찾지 못했습니다. --bg, --tol을 확인해 주십시오.');
  const tall = coarse.reduce((a, b) => (b.height > a.height ? b : a));
  // 거친 격자의 덩어리 둘레(한 칸 여유)에서 실제 픽셀 경계를 찾는다
  const b = tall.box;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = Math.max(0, (b.y0 - 1) * 8); y < Math.min(H, (b.y1 + 2) * 8); y++)
    for (let x = Math.max(0, (b.x0 - 1) * 8); x < Math.min(W, (b.x1 + 2) * 8); x++)
      if (mask[y * W + x]) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y));
  const rows = Number(opt.height ?? frame[1]);
  const p = (y1 - y0 + 1) / rows;
  grid = { px: p, ox: x0, py: p, oy: y0 };
  report.push(`가짜 픽셀: 가장 큰 그림의 높이 ${y1 - y0 + 1}픽셀을 ${rows}도트로 나눠 ${p.toFixed(2)}로 정했습니다(--px frame).`);
}
const dots = toDots();
const sprites = opt.full ? splitCells(dots) : splitBlobs(dots);

/** 받은 그림 전체를 한 칸에 한 점씩 옮긴다. 칸 가운데 부분(가장자리 1/4은 흐린 경계라 뺀다)에서 가장 많은 색을 고른다. */
function toDots() {
  const { px, ox, py, oy } = grid;
  const kx0 = Math.floor(-ox / px), kx1 = Math.floor((W - 1 - ox) / px);
  const ky0 = Math.floor(-oy / py), ky1 = Math.floor((H - 1 - oy) / py);
  const out = createImage(kx1 - kx0 + 1, ky1 - ky0 + 1);
  for (let ky = ky0; ky <= ky1; ky++) {
    for (let kx = kx0; kx <= kx1; kx++) {
      const sx0 = Math.max(0, Math.ceil(ox + (kx + 0.25) * px)), sx1 = Math.min(W - 1, Math.floor(ox + (kx + 0.75) * px));
      const sy0 = Math.max(0, Math.ceil(oy + (ky + 0.25) * py)), sy1 = Math.min(H - 1, Math.floor(oy + (ky + 0.75) * py));
      const color = modeColor(sx0, sy0, sx1, sy1);
      if (color) out.data.set(color, ((ky - ky0) * out.width + (kx - kx0)) * 4);
    }
  }
  return out;
}

function splitCells(d) {
  const out = [];
  const cw = d.width / gridCols;
  const ch = d.height / gridRows;
  for (let r = 0; r < gridRows; r++)
    for (let c = 0; c < gridCols; c++) {
      const x = Math.round(c * cw), y = Math.round(r * ch);
      out.push(crop(d, x, y, Math.round((c + 1) * cw) - x, Math.round((r + 1) * ch) - y));
    }
  return out;
}

function splitBlobs(d) {
  const w = d.width;
  const h = d.height;
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d.data[(y * w + x) * 4 + 3] > 0;
  const label = new Int32Array(w * h).fill(-1);
  let blobs = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!solid(x, y) || label[y * w + x] >= 0) continue;
      const id = blobs.length;
      const pts = [];
      const stack = [[x, y]];
      label[y * w + x] = id;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        pts.push([cx, cy]);
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (solid(nx, ny) && label[ny * w + nx] < 0) (label[ny * w + nx] = id), stack.push([nx, ny]);
          }
      }
      blobs.push(pts);
    }
  if (!blobs.length) return [];
  const center = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  const want = gridRows * gridCols;
  // 떨어진 작은 조각(가장 큰 덩어리의 1/10 미만)과 넘치는 덩어리는 가장 가까운 큰 덩어리에 붙인다
  blobs.sort((a, b) => b.length - a.length);
  const big = want === 1 ? 1 : Math.min(want, blobs.filter((b) => b.length >= blobs[0].length / 10).length);
  const keep = blobs.slice(0, big);
  const boxOf = (pts) => {
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  };
  const gap = (a, b) => Math.max(a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1);
  let dropped = 0;
  for (const extra of blobs.slice(big)) {
    // 그림에서 멀리(3점 넘게) 떨어진 작은 조각은 붙이지 않고 지운다(생성 그림 구석의 표시 등)
    const eb = boxOf(extra);
    if (extra.length < blobs[0].length / 10 && keep.every((k) => gap(eb, boxOf(k)) > 3)) {
      dropped++;
      continue;
    }
    const [ex, ey] = center(extra);
    let best = keep[0];
    let bestD = Infinity;
    for (const k of keep) {
      const [kx, ky] = center(k);
      const dd = (kx - ex) ** 2 + (ky - ey) ** 2;
      if (dd < bestD) (bestD = dd), (best = k);
    }
    best.push(...extra);
  }
  if (keep.length !== want) report.push(`  덩어리가 ${keep.length}개입니다(--grid ${gridRows}x${gridCols}이면 ${want}개). 줄·칸 순서를 확인해 주십시오.`);
  if (blobs.length - keep.length - dropped > 0) report.push(`  작은 조각 ${blobs.length - keep.length - dropped}개를 가까운 그림에 붙였습니다.`);
  if (dropped) report.push(`  멀리 떨어진 작은 조각 ${dropped}개를 지웠습니다.`);
  // 줄 나누기: 가운데 y로 늘어놓고 가장 큰 틈 (줄 수 - 1)곳에서 자른다. 줄 안에서는 x 순서
  const items = keep.map((pts) => ({ pts, c: center(pts) })).sort((a, b) => a.c[1] - b.c[1]);
  const cuts = items
    .slice(1)
    .map((it, i) => ({ i: i + 1, gap: it.c[1] - items[i].c[1] }))
    .sort((a, b) => b.gap - a.gap)
    .slice(0, Math.min(gridRows, items.length) - 1)
    .map((g) => g.i)
    .sort((a, b) => a - b);
  const rowsOf = [];
  let from = 0;
  for (const cut of [...cuts, items.length]) (rowsOf.push(items.slice(from, cut)), (from = cut));
  return rowsOf.flatMap((row) =>
    row
      .sort((a, b) => a.c[0] - b.c[0])
      .map(({ pts }) => {
        const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
        const x0 = Math.min(...xs), y0 = Math.min(...ys);
        const out = createImage(Math.max(...xs) - x0 + 1, Math.max(...ys) - y0 + 1);
        out.box = { x0: x0 + 0, y0, x1: Math.max(...xs), y1: Math.max(...ys) }; // 받은 그림 전체를 옮긴 도트 그림 안의 자리
        for (const [x, y] of pts) out.data.set(d.data.subarray((y * w + x) * 4, (y * w + x) * 4 + 4), ((y - y0) * out.width + (x - x0)) * 4);
        return out;
      }),
  );
}

/** 네모 안에서 그림인 픽셀이 반을 넘으면 가장 많은 색(5비트로 묶어 센 뒤 평균)을, 아니면 null */
function modeColor(x0, y0, x1, y1) {
  const bins = new Map();
  let total = 0;
  let solid = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      total++;
      const p = y * W + x;
      if (!mask[p]) continue;
      solid++;
      const i = p * 4;
      const k = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
      const b = bins.get(k) ?? [0, 0, 0, 0];
      b[0]++, (b[1] += data[i]), (b[2] += data[i + 1]), (b[3] += data[i + 2]);
      bins.set(k, b);
    }
  }
  if (!total || solid * 2 <= total) return null;
  let best = null;
  for (const b of bins.values()) if (!best || b[0] > best[0]) best = b;
  return [Math.round(best[1] / best[0]), Math.round(best[2] / best[0]), Math.round(best[3] / best[0]), 255];
}

function crop(s, x, y, w, h) {
  const out = createImage(w, h);
  for (let j = 0; j < h; j++) out.data.set(s.data.subarray(((y + j) * s.width + x) * 4, ((y + j) * s.width + x + w) * 4), j * w * 4);
  return out;
}

// ---------- 4. 프레임 크기에 맞추기 ----------
// 걷기 프레임끼리 크기가 같아야 하므로, 모든 그림을 같은 비율로 줄인다.
if (!sprites.some(Boolean)) throw new Error('그림을 찾지 못했습니다. --bg, --tol, --grid를 확인해 주십시오.');
const frameW = frame ? frame[0] : Math.max(...sprites.filter(Boolean).map((s) => s.width));
const frameH = frame ? frame[1] : Math.max(...sprites.filter(Boolean).map((s) => s.height));
{
  const sizes = sprites.filter(Boolean).map((s) => `${s.width}x${s.height}`);
  report.push(`도트로 옮긴 크기: ${sizes.join(', ')}`);
  const f = Math.max(1, ...sprites.filter(Boolean).map((s) => Math.max(s.width / frameW, s.height / frameH)));
  if (f > 1) {
    for (let i = 0; i < sprites.length; i++) {
      const s = sprites[i];
      if (s) sprites[i] = resample(s, Math.min(frameW, Math.max(1, Math.round(s.width / f))), Math.min(frameH, Math.max(1, Math.round(s.height / f))));
    }
    report.push(`  프레임 ${frameW}x${frameH}보다 커서 1/${f.toFixed(2)}로 줄였습니다. 생성 그림의 도트 수가 규격과 다르니 손으로 다듬을 곳이 늘어납니다.`);
  }
}

/** 칸마다 가장 많은 색으로 줄인다(평균을 내면 도트가 흐려지므로 섞지 않는다) */
function resample(s, w, h) {
  const out = createImage(w, h);
  const fx = s.width / w;
  const fy = s.height / h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const counts = new Map();
      let solid = 0;
      let total = 0;
      for (let sy = Math.floor(y * fy); sy < Math.max(Math.floor(y * fy) + 1, Math.floor((y + 1) * fy)); sy++) {
        for (let sx = Math.floor(x * fx); sx < Math.max(Math.floor(x * fx) + 1, Math.floor((x + 1) * fx)); sx++) {
          total++;
          const i = (sy * s.width + sx) * 4;
          if (!s.data[i + 3]) continue;
          solid++;
          const k = (s.data[i] << 16) | (s.data[i + 1] << 8) | s.data[i + 2];
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
      }
      if (solid * 2 < total || !solid) continue;
      const k = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      out.data.set([(k >> 16) & 255, (k >> 8) & 255, k & 255, 255], (y * w + x) * 4);
    }
  }
  return out;
}

// ---------- 5. 색 줄이기(시트 전체가 같은 색 묶음을 쓰게) ----------
{
  const used = new Map();
  for (const s of sprites.filter(Boolean))
    for (let i = 0; i < s.data.length; i += 4)
      if (s.data[i + 3]) {
        const k = (s.data[i] << 16) | (s.data[i + 1] << 8) | s.data[i + 2];
        used.set(k, (used.get(k) ?? 0) + 1);
      }
  const colors = [...used.entries()].map(([c, n]) => [(c >> 16) & 255, (c >> 8) & 255, c & 255, n]).sort((a, b) => b[3] - a[3]);
  // 생성 그림은 같은 색도 조금씩 달라(잡음) 먼저 비슷한 색을 하나로 묶는다
  let palette = mergeNear(colors, Number(opt.merge));
  const k = Number(opt.colors);
  if (k > 0 && palette.length > k) palette = kmeans(colors, k);
  for (const s of sprites.filter(Boolean))
    for (let i = 0; i < s.data.length; i += 4)
      if (s.data[i + 3]) s.data.set(nearest(palette, s.data[i], s.data[i + 1], s.data[i + 2]), i);
  report.push(`색: ${used.size}가지를 ${palette.length}가지로 묶었습니다(--merge ${opt.merge}${k ? `, --colors ${k}` : ''}).`);
}

function far(a, b) {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

/** 많이 쓴 색부터, 이미 고른 색과 차이가 limit 이하이면 그 색에 묶는다. 묶은 색들의 평균을 돌려준다. */
function mergeNear(colors, limit) {
  const groups = [];
  for (const c of colors) {
    const g = groups.find((g) => far(g.seed, c) <= limit);
    if (g) (g.sum[0] += c[0] * c[3]), (g.sum[1] += c[1] * c[3]), (g.sum[2] += c[2] * c[3]), (g.n += c[3]);
    else groups.push({ seed: c, sum: [c[0] * c[3], c[1] * c[3], c[2] * c[3]], n: c[3] });
  }
  return groups.map((g) => g.sum.map((v) => Math.round(v / g.n)));
}

/** k-평균. 시작점은 많이 쓴 색에서, 그다음부터는 (쓴 횟수 × 이미 고른 색과의 거리²)가 가장 큰 색을 고른다. */
function kmeans(colors, k) {
  let centers = [colors[0].slice(0, 3)];
  while (centers.length < Math.min(k, colors.length)) {
    let best = null;
    let bestScore = -1;
    for (const c of colors) {
      const d = Math.min(...centers.map((m) => (m[0] - c[0]) ** 2 + (m[1] - c[1]) ** 2 + (m[2] - c[2]) ** 2));
      if (c[3] * d > bestScore) (bestScore = c[3] * d), (best = c);
    }
    centers.push(best.slice(0, 3));
  }
  for (let iter = 0; iter < 20; iter++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const c of colors) {
      const j = nearestIndex(centers, c[0], c[1], c[2]);
      sums[j][0] += c[0] * c[3], (sums[j][1] += c[1] * c[3]), (sums[j][2] += c[2] * c[3]), (sums[j][3] += c[3]);
    }
    centers = sums.filter((s) => s[3]).map((s) => [Math.round(s[0] / s[3]), Math.round(s[1] / s[3]), Math.round(s[2] / s[3])]);
  }
  return centers;
}

function nearestIndex(palette, r, g, b) {
  let best = 0;
  let bestD = Infinity;
  palette.forEach((p, j) => {
    const d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2;
    if (d < bestD) (bestD = d), (best = j);
  });
  return best;
}

function nearest(palette, r, g, b) {
  return palette[nearestIndex(palette, r, g, b)];
}

// ---------- 6. 시트로 묶기 ----------
const cols = Number(opt.cols ?? gridCols);
const rows = Math.ceil(sprites.length / cols);
const sheet = createImage(cols * frameW, rows * frameH);
sprites.forEach((s, n) => {
  if (!s) return;
  const fx = (n % cols) * frameW + Math.floor((frameW - s.width) / 2);
  const fy = Math.floor(n / cols) * frameH + (opt.anchor === 'bottom' ? frameH - s.height : Math.floor((frameH - s.height) / 2));
  for (let y = 0; y < s.height; y++) sheet.data.set(s.data.subarray(y * s.width * 4, (y + 1) * s.width * 4), ((fy + y) * sheet.width + fx) * 4);
});
writePng(opt.out, scaleNearest(sheet, Number(opt.scale)));
report.push(`저장: ${opt.out} (프레임 ${frameW}x${frameH}, ${rows}줄×${cols}칸, ${sheet.width * Number(opt.scale)}x${sheet.height * Number(opt.scale)}픽셀)`);
if (opt.preview) {
  const k = Number(opt['preview-scale']);
  writePng(opt.preview, onChecker(scaleNearest(sheet, k), k * 4));
  report.push(`미리보기: ${opt.preview}`);
}
console.log(report.join('\n'));
