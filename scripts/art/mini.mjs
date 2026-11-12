// 미니게임 그림 가운데 규칙으로 짜는 것(docs/art.md "미니게임"). 색은 생성 견본(art/raw/set-mini)의 공·줄 색.
// 글자판 art/src/mini/<이름>.txt를 만든다. PNG는 grid.mjs to-png로 따로 만든다.
//   ball(30×30 4프레임: 굴러가는 띠), ball-shadow(30×30), treasure-shine(30×30 4프레임), rope(30×12 이어 붙임), rope-mark(30×30)
// 사용: node scripts/art/mini.mjs [--out-dir art/src/mini]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { formatTxt } from './sprite.mjs';

const { values: opt } = parseArgs({ options: { 'out-dir': { type: 'string', default: 'art/src/mini' } } });
const out = opt['out-dir'];
mkdirSync(out, { recursive: true });
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const pal = (o) => new Map(Object.entries(o).map(([k, v]) => [k, { rgb: rgb(v), alpha: v.length === 9 ? parseInt(v.slice(7), 16) : 255 }]));
const grid = (w, h) => Array.from({ length: h }, () => Array(w).fill('.'));
const rows = (g) => g.map((r) => r.join(''));
function save(name, comment, w, h, colors, frames) {
  writeFileSync(join(out, `${name}.txt`), formatTxt({ comments: [`# ${comment} (scripts/art/mini.mjs가 만듦)`], fw: w, fh: h, cols: frames.length, palette: pal(colors), frames }));
}
const O = '#1d1531';

// ---------- 공: 지름 24도트, 가운데 (15, 15.5)(아래 끝 27줄). 빛·그늘은 그대로, 90도 간격 솔기 넷(보이는 것은 둘)이 프레임마다 22.5도씩 돌아(네 프레임이면 무늬가 한 바퀴) 오른쪽으로 구르는 것처럼 ----------
{
  const R = 12, cx = 14.5, cy = 15.5;
  const frames = [0, 1, 2, 3].map((f) => {
    const g = grid(30, 30);
    for (let y = 0; y < 30; y++)
      for (let x = 0; x < 30; x++) {
        const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy);
        if (r > R + 0.5) continue;
        if (r > R - 0.6) { g[y][x] = 'o'; continue; }
        const lx = dx / R, ly = dy / R;
        const light = -lx * 0.55 - ly * 0.75; // 왼쪽 위 빛
        let ch = light > 0.35 ? 'l' : light < -0.45 ? 's' : 'a';
        // 솔기: 세로 큰 원 둘(경도 phase, phase+90°)의 화면 투영 x = cx + R sin(phase) sqrt(1 - ly²)
        for (const ph of [0, 1, 2, 3].map((k) => (f * Math.PI) / 8 + (k * Math.PI) / 2)) {
          const front = Math.cos(ph) > 0.05; // 앞쪽 반구에 있을 때만 보인다
          const sx = cx + R * Math.sin(ph) * Math.sqrt(Math.max(0, 1 - ly * ly));
          if (front && Math.abs(x - sx) < 0.75) ch = 'd';
        }
        g[y][x] = ch;
      }
    // 반짝이는 점(왼쪽 위, 고정)
    for (const [x, y] of [[8, 9], [9, 9], [8, 10], [10, 8], [11, 8]]) if (g[y][x] !== 'o') g[y][x] = 'w';
    return { name: `f${f}`, rows: rows(g) };
  });
  save('ball', '피구공 굴러가는 띠 4프레임(30×30, 오른쪽으로 구를 때 0→3, 왼쪽이면 거꾸로). 아래 끝 27줄', 30, 30,
    { o: O, a: '#f42c38', l: '#f96a72', s: '#b91a24', d: '#661b1e', w: '#fdfcfb' }, frames);
  const g = grid(30, 30);
  for (let y = 0; y < 30; y++)
    for (let x = 0; x < 30; x++) if (((x - 14.5) / 10.5) ** 2 + ((y - 27) / 2.6) ** 2 <= 1) g[y][x] = 's';
  save('ball-shadow', '공 그림자(30×30, 공과 같은 자리에 두면 공 아래 끝에 맞음. 공이 뜨면 그림자만 땅에 둔다)', 30, 30, { s: '#1d153166' }, [{ name: 'shadow', rows: rows(g) }]);
}

// ---------- 보물 반짝임: 30×30 4프레임. 상자 위쪽(0~16줄)에서 별 셋이 번갈아 켜진다 ----------
{
  const STAR = {
    big: ['...y...', '...y...', '..ywy..', 'yywwwyy', '..ywy..', '...y...', '...y...'],
    mid: ['..y..', '.ywy.', 'ywwwy', '.ywy.', '..y..'],
    dot: ['.y.', 'ywy', '.y.'],
  };
  const put = (g, s, x0, y0) => STAR[s].forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') g[y0 + y][x0 + x] = ch; }));
  const plan = [
    [['big', 4, 2], ['dot', 22, 9]],
    [['mid', 5, 3], ['big', 19, 0], ['dot', 13, 11]],
    [['dot', 6, 4], ['mid', 20, 1], ['big', 11, 6]],
    [['dot', 21, 3], ['mid', 12, 7]],
  ];
  const frames = plan.map((list, f) => { const g = grid(30, 30); for (const [s, x, y] of list) put(g, s, x, y); return { name: `f${f}`, rows: rows(g) }; });
  save('treasure-shine', '보물 위 반짝임 4프레임(30×30, 보물 그림과 같은 자리에 겹침, 초당 6프레임 되풀이)', 30, 30, { y: '#fdd516', w: '#fdfcfb' }, frames);
}

// ---------- 줄다리기 줄: 30×12, 가로로 이어 붙여도 끊기지 않게 꼬임 박자 6도트(30의 약수) ----------
{
  const pr = { o: O, a: '#fcd88d', c: '#cb8447', d: '#b9612a', f: '#8a4610' };
  const g = grid(30, 12);
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 30; x++) {
      if (y === 0 || y === 11) { g[y][x] = 'o'; continue; }
      const k = (((x + y) % 6) + 6) % 6; // 왼쪽 아래 → 오른쪽 위로 기운 꼬임
      g[y][x] = k === 0 ? 'f' : k === 1 ? 'd' : y <= 3 && k <= 4 ? 'a' : y >= 9 ? 'd' : k === 5 ? 'c' : k <= 3 ? 'a' : 'c';
    }
  save('rope', '줄다리기 줄 조각(30×12, 가로로 이어 붙임. 세로 가운데를 줄 가운데에 맞춤)', 30, 12, pr, [{ name: 'rope', rows: rows(g) }]);
}

// ---------- 줄 가운데 리본: 30×30. 세로 가운데(15줄)가 줄 가운데. 줄을 감는 띠(9~20줄) + 위 나비 매듭 + 아래 꼬리 ----------
{
  const g = grid(30, 30);
  const band = [11, 18]; // 띠 x 범위
  for (let y = 8; y <= 21; y++) for (let x = band[0]; x <= band[1]; x++) g[y][x] = x === band[0] || x === band[1] || y === 8 || y === 21 ? 'o' : x === band[0] + 1 ? 'l' : x === band[1] - 1 ? 's' : 'r';
  // 나비 매듭(위)
  const bow = ['.oooo....oooo.', 'orrrro..orrrro', 'orlrrroorrrrso', 'orlrrrrrrrrrso', 'orrrrroorrrrso', '.orrso..osrro.', '..oo......oo..'];
  bow.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') g[1 + y][8 + x] = ch; }));
  // 꼬리(아래, 두 갈래)
  const tail = ['..orro.orro..', '.orrso.orrso.', '.orso...orso.', 'orso.....orso', 'oso.......oso', 'oo.........oo'];
  tail.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') g[22 + y][8 + x] = ch; }));
  save('rope-mark', '줄 가운데 리본(30×30, 세로 가운데 15줄을 줄 가운데에 맞춤)', 30, 30, { o: O, r: '#f42c38', l: '#f96a72', s: '#b91a24' }, [{ name: 'mark', rows: rows(g) }]);
}
console.log('ok');
