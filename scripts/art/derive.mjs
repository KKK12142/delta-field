// 있는 그림에서 만드는 그림(생성 없음).
//   derive.mjs on <사물.png> --out <png>   켜진 모양(-on): 그림 둘레 1도트 노란 빛 테 + 오른쪽 위 초록 체크 표시(7×7). 그림은 사방 1도트 커진다
//   derive.mjs face <캐릭터 시트.png> --out <png> [--rows 26]   얼굴: 앞모습 서기 프레임(칸 1, 줄 0)의 머리 꼭대기부터 rows줄(30×rows)
import { parseArgs } from 'node:util';
import { createImage, readPng, writePng } from './png.mjs';

const { values: opt, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: 'string' }, rows: { type: 'string', default: '26' } } });
const [cmd, from] = positionals;
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(255);
if (cmd === 'on' && from && opt.out) {
  const src = readPng(from);
  const W = src.width + 2, H = src.height + 2, img = createImage(W, H);
  const A = (x, y) => x >= 0 && y >= 0 && x < src.width && y < src.height && src.data[(y * src.width + x) * 4 + 3] >= 128;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (A(x - 1, y - 1)) img.data.set(src.data.subarray(((y - 1) * src.width + x - 1) * 4, ((y - 1) * src.width + x) * 4), (y * W + x) * 4);
      else if ([[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => A(x - 1 + dx, y - 1 + dy))) img.data.set(hex('#fdd516'), (y * W + x) * 4);
    }
  const badge = ['.ooooo.', 'oggggwo', 'ogggwgo', 'owgwggo', 'oggwggo', 'odddddo', '.ooooo.'];
  const C = { o: hex('#1d1531'), g: hex('#5b9137'), d: hex('#30612b'), w: hex('#f8f8f6') };
  badge.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') img.data.set(C[ch], (y * W + W - 7 + x) * 4); }));
  writePng(opt.out, img);
  console.log(`저장: ${opt.out} (${W}x${H})`);
} else if (cmd === 'face' && from && opt.out) {
  const src = readPng(from), R = Number(opt.rows), img = createImage(30, R);
  // 머리 꼭대기(그림이 있는 첫 줄)부터 R줄. 키가 작은 캐릭터(4번 55줄)도 얼굴이 같은 자리에 오게
  let top = 0;
  while (top < 60 && ![...Array(30).keys()].some((x) => src.data[(top * src.width + 30 + x) * 4 + 3] >= 128)) top++;
  for (let y = 0; y < R; y++) img.data.set(src.data.subarray(((top + y) * src.width + 30) * 4, ((top + y) * src.width + 60) * 4), y * 30 * 4);
  writePng(opt.out, img);
  console.log(`저장: ${opt.out} (30x${R})`);
} else {
  console.error('사용: derive.mjs on <사물.png> --out <png> | derive.mjs face <시트.png> --out <png> [--rows 26]');
  process.exit(2);
}
