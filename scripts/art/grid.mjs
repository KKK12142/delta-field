// 도트 그림 글자판(.txt) ↔ PNG. 도트 그림 편집 프로그램이 없어, 작은 그림은 글자판으로 고치고 git으로 바뀐 곳을 본다.
// 글자판 형식(docs/art.md "글자판"):
//   size 30x60          프레임 크기
//   cols 3              PNG로 만들 때 한 줄의 프레임 수
//   palette             아래 줄마다: 글자 색 [겹 이름]. 겹 이름이 없으면 base
//   o #2b2433 line
//   t #241b3dcc         뒤 두 자리는 불투명도(없으면 ff). UI 그림(반투명 이름표 바탕)에만 쓴다
//   frame down-stand    프레임 이름. 다음 줄부터 세로 크기만큼 그림. '.'은 투명
//
// 사용:
//   node scripts/art/grid.mjs to-txt <시트.png> <글자판.txt> --frame 30x60 [--names a,b,c]
//   node scripts/art/grid.mjs to-png <글자판.txt> <시트.png> [--layer hair,top] [--scale 3] [--fill 12]
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createImage, readPng, scaleNearest, writePng } from './png.mjs';
import { CHARS, parseTxt } from './sprite.mjs';

process.on('uncaughtException', (err) => {
  console.error(err.message);
  process.exit(1);
});

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    frame: { type: 'string' },
    names: { type: 'string' },
    layer: { type: 'string' },
    scale: { type: 'string', default: '1' },
    fill: { type: 'string' },
  },
});
const [command, from, to] = positionals;

if (command === 'to-txt' && from && to && opt.frame) toTxt();
else if (command === 'to-png' && from && to) toPng();
else {
  console.error('사용: grid.mjs to-txt <시트.png> <글자판.txt> --frame 30x60 | grid.mjs to-png <글자판.txt> <시트.png> [--layer 겹,...] [--scale N] [--fill 12]');
  process.exit(2);
}

function toTxt() {
  const img = readPng(from);
  const [fw, fh] = opt.frame.split('x').map(Number);
  if (img.width % fw || img.height % fh) throw new Error(`그림 크기 ${img.width}x${img.height}가 프레임 ${fw}x${fh}로 나누어떨어지지 않습니다.`);
  const cols = img.width / fw;
  const rows = img.height / fh;
  const hex = (i) => '#' + [0, 1, 2].map((c) => img.data[i + c].toString(16).padStart(2, '0')).join('');
  // 많이 쓴 색부터 글자를 붙인다
  const counts = new Map();
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3] >= 128) counts.set(hex(i), (counts.get(hex(i)) ?? 0) + 1);
  const colors = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  if (colors.length > CHARS.length) throw new Error(`색이 ${colors.length}가지라 글자가 모자랍니다. fit.mjs --colors로 줄여 주십시오.`);
  const charOf = new Map(colors.map((c, j) => [c, CHARS[j]]));
  const names = opt.names?.split(',') ?? [];
  const lines = [`# 도트 그림 글자판(docs/art.md). 원본: ${from}`, `size ${fw}x${fh}`, `cols ${cols}`, 'palette'];
  for (const c of colors) lines.push(`${charOf.get(c)} ${c}`);
  for (let n = 0; n < cols * rows; n++) {
    lines.push('', `frame ${names[n] ?? n}`);
    const x0 = (n % cols) * fw;
    const y0 = Math.floor(n / cols) * fh;
    for (let y = 0; y < fh; y++) {
      let s = '';
      for (let x = 0; x < fw; x++) {
        const i = ((y0 + y) * img.width + x0 + x) * 4;
        s += img.data[i + 3] >= 128 ? charOf.get(hex(i)) : '.';
      }
      lines.push(s);
    }
  }
  writeFileSync(to, lines.join('\n') + '\n');
  console.log(`저장: ${to} (프레임 ${cols * rows}개, 색 ${colors.length}가지)`);
}

function toPng() {
  const { fw, fh, cols, palette, frames: own } = parseTxt(readFileSync(from, 'utf8'), from);
  // --fill N: 프레임이 N개보다 적으면 처음부터 되풀이해 N칸을 채운다(앞모습만 있을 때의 임시 시트)
  const frames = opt.fill ? Array.from({ length: Number(opt.fill) }, (_, i) => own[i % own.length]) : own;
  const layers = opt.layer?.split(',');
  const rows = Math.ceil(frames.length / cols);
  const sheet = createImage(cols * fw, rows * fh);
  frames.forEach((f, n) => {
    const x0 = (n % cols) * fw;
    const y0 = Math.floor(n / cols) * fh;
    f.rows.forEach((line, y) => {
      [...line].forEach((ch, x) => {
        if (ch === '.') return;
        const p = palette.get(ch);
        if (layers && !layers.includes(p.layer)) return;
        sheet.data.set([...p.rgb, p.alpha ?? 255], ((y0 + y) * sheet.width + x0 + x) * 4);
      });
    });
  });
  writePng(to, scaleNearest(sheet, Number(opt.scale)));
  console.log(`저장: ${to} (프레임 ${frames.length}개${layers ? `, 겹 ${layers.join('·')}만` : ''})`);
}
