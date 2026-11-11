// 도트 그림 글자판(.txt) ↔ PNG. 도트 그림 편집 프로그램이 없어, 작은 그림은 글자판으로 고치고 git으로 바뀐 곳을 본다.
// 글자판 형식(docs/art.md "글자판"):
//   size 16x24          프레임 크기
//   cols 3              PNG로 만들 때 한 줄의 프레임 수
//   palette             아래 줄마다: 글자 색 [겹 이름]. 겹 이름이 없으면 base
//   o #2b2433 line
//   frame down-stand    프레임 이름. 다음 줄부터 세로 크기만큼 그림. '.'은 투명
//
// 사용:
//   node scripts/art/grid.mjs to-txt <시트.png> <글자판.txt> --frame 16x24 [--names a,b,c]
//   node scripts/art/grid.mjs to-png <글자판.txt> <시트.png> [--layer hair,top] [--scale 3]
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createImage, readPng, scaleNearest, writePng } from './png.mjs';

process.on('uncaughtException', (err) => {
  console.error(err.message);
  process.exit(1);
});

const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    frame: { type: 'string' },
    names: { type: 'string' },
    layer: { type: 'string' },
    scale: { type: 'string', default: '1' },
  },
});
const [command, from, to] = positionals;

if (command === 'to-txt' && from && to && opt.frame) toTxt();
else if (command === 'to-png' && from && to) toPng();
else {
  console.error('사용: grid.mjs to-txt <시트.png> <글자판.txt> --frame 16x24 | grid.mjs to-png <글자판.txt> <시트.png> [--layer 겹,...] [--scale N]');
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
  const { fw, fh, cols, palette, frames } = parseTxt(readFileSync(from, 'utf8'));
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
        sheet.data.set([...p.rgb, 255], ((y0 + y) * sheet.width + x0 + x) * 4);
      });
    });
  });
  writePng(to, scaleNearest(sheet, Number(opt.scale)));
  console.log(`저장: ${to} (프레임 ${frames.length}개${layers ? `, 겹 ${layers.join('·')}만` : ''})`);
}

function parseTxt(text) {
  let fw = 0;
  let fh = 0;
  let cols = 1;
  const palette = new Map();
  const frames = [];
  let mode = '';
  const lines = text.split('\n');
  const fail = (n, msg) => {
    throw new Error(`${from} ${n + 1}번째 줄: ${msg}`);
  };
  lines.forEach((raw, n) => {
    const line = raw.trimEnd();
    if (!line || line.startsWith('#')) return;
    const [head, ...rest] = line.split(/\s+/);
    if (head === 'size') [fw, fh] = rest[0].split('x').map(Number);
    else if (head === 'cols') cols = Number(rest[0]);
    else if (head === 'palette') mode = 'palette';
    else if (head === 'frame') {
      mode = 'frame';
      frames.push({ name: rest.join(' '), rows: [], line: n });
    } else if (mode === 'palette') {
      if (head.length !== 1 || head === '.' || !/^#[0-9a-f]{6}$/i.test(rest[0] ?? '')) fail(n, '팔레트 줄은 "글자 #rrggbb [겹]"입니다.');
      const v = parseInt(rest[0].slice(1), 16);
      palette.set(head, { rgb: [(v >> 16) & 255, (v >> 8) & 255, v & 255], layer: rest[1] ?? 'base' });
    } else if (mode === 'frame') {
      const f = frames.at(-1);
      if (line.length !== fw) fail(n, `한 줄은 ${fw}글자입니다(지금 ${line.length}글자).`);
      for (const ch of line) if (ch !== '.' && !palette.has(ch)) fail(n, `팔레트에 없는 글자입니다: ${ch}`);
      f.rows.push(line);
    } else fail(n, `알 수 없는 줄입니다: ${line}`);
  });
  if (!fw || !fh) throw new Error(`${from}: size가 없습니다.`);
  for (const f of frames) if (f.rows.length !== fh) fail(f.line, `프레임 ${f.name}은 ${fh}줄이어야 합니다(지금 ${f.rows.length}줄).`);
  return { fw, fh, cols, palette, frames };
}
