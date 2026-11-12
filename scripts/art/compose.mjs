// 그림 겹쳐 붙이기(docs/art.md "타일·사물 만들기"). 문처럼 벽 윗면 칸과 문짝을 한 장으로 만들 때 쓴다.
//   compose.mjs --out <png> --size 60x60 [--tile <타일 시트.png>:x,y,w,h ...] [--image <그림.png>:x,y ...]
//     --tile   타일 시트(30x30 변형을 가로로 이은 것)의 변형을 차례로 깔아 네모를 채운다.
//     --image  그림을 그 자리에 얹는다(투명한 곳은 아래가 보인다). 적은 순서대로 그린다(타일 먼저).
import { parseArgs } from 'node:util';
import { createImage, readPng, writePng } from './png.mjs';

process.on('uncaughtException', (err) => {
  console.error(err.message);
  process.exit(1);
});

const { values: opt } = parseArgs({
  options: {
    out: { type: 'string' },
    size: { type: 'string' },
    tile: { type: 'string', multiple: true, default: [] },
    image: { type: 'string', multiple: true, default: [] },
  },
});
const m = /^(\d+)x(\d+)$/.exec(opt.size ?? '');
if (!opt.out || !m) {
  console.error('사용: compose.mjs --out <png> --size 60x60 [--tile 시트.png:x,y,w,h] [--image 그림.png:x,y]');
  process.exit(2);
}
const out = createImage(Number(m[1]), Number(m[2]));
const put = (x, y, rgba) => {
  if (x < 0 || y < 0 || x >= out.width || y >= out.height || rgba[3] < 128) return;
  out.data.set(rgba, (y * out.width + x) * 4);
};
const split = (s) => {
  const i = s.lastIndexOf(':');
  if (i < 0) throw new Error(`파일:좌표로 적습니다: ${s}`);
  return [s.slice(0, i), s.slice(i + 1).split(',').map(Number)];
};
for (const t of opt.tile) {
  const [file, [x0, y0, w, h]] = split(t);
  const src = readPng(file);
  const T = src.height;
  const n = Math.round(src.width / T);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = Math.floor(x / T) % n;
      const i = ((y % T) * src.width + v * T + (x % T)) * 4;
      put(x0 + x, y0 + y, src.data.subarray(i, i + 4));
    }
}
for (const t of opt.image) {
  const [file, [x0, y0]] = split(t);
  const src = readPng(file);
  for (let y = 0; y < src.height; y++)
    for (let x = 0; x < src.width; x++) put(x0 + x, y0 + y, src.data.subarray((y * src.width + x) * 4, (y * src.width + x) * 4 + 4));
}
writePng(opt.out, out);
console.log(`저장: ${opt.out} (${out.width}x${out.height})`);
