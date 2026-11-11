// 움직이는 GIF 만들기(미리보기용). 프로그램을 설치하지 않으려고 GIF89a를 직접 쓴다.
// frames: 같은 크기의 RGBA 그림 배열(createImage 형식). 투명(알파 < 128)은 투명색으로 둔다. 색은 255가지까지.
import { writeFileSync } from 'node:fs';

export function writeGif(path, frames, { delay = 12, loop = 0 } = {}) {
  const { width: W, height: H } = frames[0];
  const colors = new Map(); // rgb → 번호(0은 투명)
  const indexed = frames.map((f) => {
    const out = new Uint8Array(W * H);
    for (let p = 0; p < W * H; p++) {
      const i = p * 4;
      if (f.data[i + 3] < 128) continue;
      const k = (f.data[i] << 16) | (f.data[i + 1] << 8) | f.data[i + 2];
      if (!colors.has(k)) {
        if (colors.size >= 255) throw new Error('GIF 색이 255가지를 넘습니다.');
        colors.set(k, colors.size + 1);
      }
      out[p] = colors.get(k);
    }
    return out;
  });
  let bits = 1;
  while (1 << bits < colors.size + 1) bits++;
  const tableSize = 1 << bits;
  const bytes = [];
  const u16 = (v) => bytes.push(v & 255, (v >> 8) & 255);
  bytes.push(...Buffer.from('GIF89a'));
  u16(W), u16(H);
  bytes.push(0xf0 | (bits - 1), 0, 0); // 전체 색표 있음
  const table = new Uint8Array(tableSize * 3);
  for (const [k, n] of colors) table.set([(k >> 16) & 255, (k >> 8) & 255, k & 255], n * 3);
  bytes.push(...table);
  bytes.push(0x21, 0xff, 11, ...Buffer.from('NETSCAPE2.0'), 3, 1);
  u16(loop);
  bytes.push(0);
  for (const px of indexed) {
    bytes.push(0x21, 0xf9, 4, 0b00001001); // 이전 프레임 지우기(배경으로), 투명색 씀
    u16(delay);
    bytes.push(0, 0);
    bytes.push(0x2c);
    u16(0), u16(0), u16(W), u16(H);
    bytes.push(0);
    const min = Math.max(2, bits);
    bytes.push(min);
    const data = lzw(px, min);
    for (let i = 0; i < data.length; i += 255) {
      const chunk = data.subarray(i, i + 255);
      bytes.push(chunk.length, ...chunk);
    }
    bytes.push(0);
  }
  bytes.push(0x3b);
  writeFileSync(path, Buffer.from(bytes));
}

function lzw(px, min) {
  const clear = 1 << min;
  const end = clear + 1;
  const out = [];
  let cur = 0;
  let nbits = 0;
  let size = min + 1;
  const emit = (code) => {
    cur |= code << nbits;
    nbits += size;
    while (nbits >= 8) {
      out.push(cur & 255);
      cur >>>= 8;
      nbits -= 8;
    }
  };
  let dict = new Map();
  let next = end + 1;
  emit(clear);
  let prefix = px[0];
  for (let i = 1; i < px.length; i++) {
    const c = px[i];
    const key = prefix * 4096 + c;
    if (dict.has(key)) {
      prefix = dict.get(key);
      continue;
    }
    emit(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > 1 << size && size < 12) size++;
    } else {
      emit(clear);
      dict = new Map();
      next = end + 1;
      size = min + 1;
    }
    prefix = c;
  }
  emit(prefix);
  emit(end);
  if (nbits > 0) out.push(cur & 255);
  return Uint8Array.from(out);
}
