// PNG 읽기·쓰기. 이 컴퓨터에 PIL·ImageMagick이 없어 Node에 들어 있는 zlib만으로 만든다.
// 읽기: 비트 깊이 1·2·4·8·16, 색 형식 0(회색)·2(RGB)·3(팔레트)·4(회색+투명)·6(RGBA). 인터레이스 PNG는 읽지 않는다.
// 쓰기: 8비트 RGBA 하나만 쓴다.
import { readFileSync, writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** @typedef {{ width: number, height: number, data: Uint8Array }} Image  data는 RGBA 8비트, 한 줄씩 */

/** @returns {Image} */
export function createImage(width, height) {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

/** @returns {Image} */
export function readPng(path) {
  return decodePng(readFileSync(path));
}

export function writePng(path, image) {
  writeFileSync(path, encodePng(image));
}

/** @returns {Image} */
export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('PNG 파일이 아닙니다.');
  let pos = 8;
  let ihdr = null;
  let palette = null;
  let trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (type === 'IHDR') {
      ihdr = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        colorType: body[9],
        interlace: body[12],
      };
    } else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') trns = body;
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
  }
  if (!ihdr) throw new Error('PNG에 IHDR이 없습니다.');
  const { width, height, depth, colorType, interlace } = ihdr;
  if (interlace) throw new Error('인터레이스 PNG는 읽지 않습니다. 다른 프로그램으로 풀어서 다시 저장해 주십시오.');
  const channels = CHANNELS[colorType];
  if (!channels) throw new Error(`모르는 PNG 색 형식입니다: ${colorType}`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bitsPerPixel = channels * depth;
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const bpp = Math.max(1, bitsPerPixel >> 3); // 필터가 보는 왼쪽 픽셀 거리(바이트)
  const rows = unfilter(raw, height, stride, bpp);

  const img = createImage(width, height);
  const out = img.data;
  const max = (1 << depth) - 1;
  // 한 픽셀의 c번째 값을 0~255로 읽는다
  const sample = (row, x, c) => {
    if (depth === 8) return row[x * channels + c];
    if (depth === 16) return row[(x * channels + c) * 2];
    const bit = (x * channels + c) * depth;
    const v = (row[bit >> 3] >> (8 - depth - (bit & 7))) & max;
    return colorType === 3 ? v : Math.round((v * 255) / max);
  };
  // tRNS의 투명색(회색·RGB 형식)은 원래 비트 깊이의 값으로 적혀 있다
  const rawSample = (row, x, c) => {
    if (depth === 16) return row.readUInt16BE((x * channels + c) * 2);
    if (depth === 8) return row[x * channels + c];
    const bit = (x * channels + c) * depth;
    return (row[bit >> 3] >> (8 - depth - (bit & 7))) & max;
  };
  for (let y = 0; y < height; y++) {
    const row = rows[y];
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (colorType === 3) {
        const i = sample(row, x, 0);
        out[o] = palette[i * 3];
        out[o + 1] = palette[i * 3 + 1];
        out[o + 2] = palette[i * 3 + 2];
        out[o + 3] = trns && i < trns.length ? trns[i] : 255;
      } else if (colorType === 0 || colorType === 4) {
        const g = sample(row, x, 0);
        out[o] = out[o + 1] = out[o + 2] = g;
        out[o + 3] = colorType === 4 ? sample(row, x, 1) : 255;
        if (colorType === 0 && trns && rawSample(row, x, 0) === trns.readUInt16BE(0)) out[o + 3] = 0;
      } else {
        out[o] = sample(row, x, 0);
        out[o + 1] = sample(row, x, 1);
        out[o + 2] = sample(row, x, 2);
        out[o + 3] = colorType === 6 ? sample(row, x, 3) : 255;
        if (
          colorType === 2 &&
          trns &&
          rawSample(row, x, 0) === trns.readUInt16BE(0) &&
          rawSample(row, x, 1) === trns.readUInt16BE(2) &&
          rawSample(row, x, 2) === trns.readUInt16BE(4)
        )
          out[o + 3] = 0;
      }
    }
  }
  return img;
}

function unfilter(raw, height, stride, bpp) {
  const rows = [];
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1);
    const filter = raw[start];
    const row = Buffer.from(raw.subarray(start + 1, start + 1 + stride));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`모르는 PNG 필터입니다: ${filter}`);
      row[i] = (row[i] + add) & 255;
    }
    rows.push(row);
    prev = row;
  }
  return rows;
}

export function encodePng({ width, height, data }) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // 필터 없음. 작은 그림이라 이것으로 충분하다.
    Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 비트 깊이
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), body])) >>> 0, 0);
  return Buffer.concat([head, body, crc]);
}

/** 정수 배로 키운다(가장 가까운 픽셀). 도트가 흐려지지 않는다. */
export function scaleNearest(img, k) {
  if (k === 1) return img;
  const out = createImage(img.width * k, img.height * k);
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const s = (((y / k) | 0) * img.width + ((x / k) | 0)) * 4;
      out.data.set(img.data.subarray(s, s + 4), (y * out.width + x) * 4);
    }
  }
  return out;
}

/** 투명한 곳에 체크무늬를 깔아 눈으로 보기 쉽게 한다(미리보기용) */
export function onChecker(img, cell = 8) {
  const out = createImage(img.width, img.height);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const o = (y * img.width + x) * 4;
      const bg = ((x / cell) ^ (y / cell)) & 1 ? 200 : 235;
      const a = img.data[o + 3] / 255;
      for (let c = 0; c < 3; c++) out.data[o + c] = Math.round(img.data[o + c] * a + bg * (1 - a));
      out.data[o + 3] = 255;
    }
  }
  return out;
}
