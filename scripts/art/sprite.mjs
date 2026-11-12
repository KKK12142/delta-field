// 글자판(.txt) 읽기·쓰기와 프레임 다루기. grid.mjs, walk.mjs가 함께 쓴다. 형식은 docs/art.md "글자판".

export const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** 글자판 글을 읽는다. 프레임의 rows는 문자열 배열이다 */
export function parseTxt(text, from = '글자판') {
  let fw = 0;
  let fh = 0;
  let cols = 1;
  const palette = new Map();
  const frames = [];
  const comments = [];
  let mode = '';
  const lines = text.split('\n');
  const fail = (n, msg) => {
    throw new Error(`${from} ${n + 1}번째 줄: ${msg}`);
  };
  lines.forEach((raw, n) => {
    const line = raw.trimEnd();
    if (!line) return;
    if (line.startsWith('#')) {
      if (!frames.length) comments.push(line);
      return;
    }
    const [head, ...rest] = line.split(/\s+/);
    if (head === 'size') [fw, fh] = rest[0].split('x').map(Number);
    else if (head === 'cols') cols = Number(rest[0]);
    else if (head === 'palette') mode = 'palette';
    else if (head === 'frame') {
      mode = 'frame';
      frames.push({ name: rest.join(' '), rows: [], line: n });
    } else if (mode === 'palette') {
      if (head.length !== 1 || head === '.' || !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(rest[0] ?? '')) fail(n, '팔레트 줄은 "글자 #rrggbb[aa] [겹]"입니다(aa는 불투명도, UI 그림용).');
      const v = parseInt(rest[0].slice(1, 7), 16);
      const alpha = rest[0].length === 9 ? parseInt(rest[0].slice(7), 16) : 255;
      palette.set(head, { rgb: [(v >> 16) & 255, (v >> 8) & 255, v & 255], alpha, layer: rest[1] ?? 'base' });
    } else if (mode === 'frame') {
      const f = frames.at(-1);
      if (line.length !== fw) fail(n, `한 줄은 ${fw}글자입니다(지금 ${line.length}글자).`);
      for (const ch of line) if (ch !== '.' && !palette.has(ch)) fail(n, `팔레트에 없는 글자입니다: ${ch}`);
      f.rows.push(line);
    } else fail(n, `알 수 없는 줄입니다: ${line}`);
  });
  if (!fw || !fh) throw new Error(`${from}: size가 없습니다.`);
  for (const f of frames) if (f.rows.length !== fh) fail(f.line, `프레임 ${f.name}은 ${fh}줄이어야 합니다(지금 ${f.rows.length}줄).`);
  return { fw, fh, cols, palette, frames, comments };
}

/** 글자판 글로 만든다 */
export function formatTxt({ comments = [], fw, fh, cols, palette, frames }) {
  const hex = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
  const lines = [...comments, `size ${fw}x${fh}`, `cols ${cols}`, 'palette'];
  for (const [ch, p] of palette) lines.push(`${ch} ${hex(p.rgb)}${(p.alpha ?? 255) < 255 ? p.alpha.toString(16).padStart(2, '0') : ''}${p.layer && p.layer !== 'base' ? ' ' + p.layer : ''}`);
  for (const f of frames) lines.push('', `frame ${f.name}`, ...f.rows);
  return lines.join('\n') + '\n';
}

/** 문자열 줄 ↔ 글자 2차원 배열 */
export const toGrid = (rows) => rows.map((r) => [...r]);
export const toRows = (grid) => grid.map((r) => r.join(''));
export const blank = (w, h) => Array.from({ length: h }, () => Array(w).fill('.'));
export const mirror = (rows) => rows.map((r) => [...r].reverse().join(''));
