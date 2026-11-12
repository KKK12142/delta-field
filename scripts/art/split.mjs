// 시트를 프레임마다 한 장으로 나눈다. 위쪽 빈 줄은 잘라 낸다(아래 맞춤은 그대로, 너비는 프레임 너비).
// 작은 소품 묶음(small-set, 2×2)을 사물 그림 하나씩으로 나눌 때 쓴다(docs/art.md "장식 소품").
// 사용: node scripts/art/split.mjs <시트.png> --frame 30x40 --names a,b,c,d --out-dir <폴더> [--min-height 30]
//   이름이 '-'인 프레임은 건너뛴다.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { createImage, readPng, writePng } from './png.mjs';

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: { frame: { type: 'string' }, names: { type: 'string' }, 'out-dir': { type: 'string' }, 'min-height': { type: 'string', default: '30' } },
});
const [from] = positionals;
if (!from || !opt.frame || !opt.names || !opt['out-dir']) {
  console.error('사용: split.mjs <시트.png> --frame 30x40 --names a,b,c,d --out-dir <폴더> [--min-height 30]');
  process.exit(2);
}
const img = readPng(from);
const [fw, fh] = opt.frame.split('x').map(Number);
const cols = img.width / fw;
mkdirSync(opt['out-dir'], { recursive: true });
opt.names.split(',').forEach((name, n) => {
  if (name === '-') return;
  const x0 = (n % cols) * fw, y0 = Math.floor(n / cols) * fh;
  let top = fh;
  for (let y = 0; y < fh && top === fh; y++) for (let x = 0; x < fw; x++) if (img.data[((y0 + y) * img.width + x0 + x) * 4 + 3]) { top = y; break; }
  const h = Math.max(Number(opt['min-height']), fh - top);
  const out = createImage(fw, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < fw; x++) {
      const sy = y0 + fh - h + y;
      if (sy < y0) continue;
      const i = (sy * img.width + x0 + x) * 4;
      out.data.set(img.data.subarray(i, i + 4), (y * fw + x) * 4);
    }
  const file = join(opt['out-dir'], `${name}.png`);
  writePng(file, out);
  console.log(`${file} ${fw}x${h}`);
});
