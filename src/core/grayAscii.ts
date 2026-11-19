import { inkColumns, type GlyphRenderer } from './fonts';
import { crc16Modbus } from './icl';

/** Variante ASCII de fontbit4.exe: índice de 256 códigos y píxeles de 4 u 8 bits. */
export function buildGrayAscii(width: number, height: number, bits: 4 | 8, render: GlyphRenderer, proportional = false, fileId = 0): Uint8Array {
  if (![width, height].every((n) => Number.isInteger(n) && n >= 4 && n <= 255) || ![4, 8].includes(bits)) throw new Error('La fuente ASCII gris admite celdas de 4–255 píxeles y 4 u 8 bits.');
  if (!Number.isInteger(fileId) || fileId < 0 || fileId > 255) throw new Error('ID de fuente fuera de 0–255.');
  const stride = bits === 4 ? Math.ceil(width / 2) : width;
  const glyphSize = Math.ceil(stride * height / 2) * 2;
  const start = 256 + 256 * 5;
  const offsets: number[] = []; let end = start;
  const base = fileId * 262144, boundary = 16777216;
  for (let i = 0; i < 94; i++) {
    if (Math.floor((base + end) / boundary) !== Math.floor((base + end + glyphSize - 1) / boundary)) end = Math.ceil((base + end) / boundary) * boundary - base;
    offsets.push(end); end += glyphSize;
  }
  const out = new Uint8Array(end); const v = new DataView(out.buffer);
  out.set(new TextEncoder().encode('DGUS_2')); v.setUint32(8, out.length - 8); out[12] = 1; v.setUint16(13, 94);
  out.set([0, 0, 128, 0, bits, width, height, 1], 15);
  for (const [code, kind, advance] of [[10, 2, width], [13, 1, width], [32, 3, Math.floor(width / 2)]]) out.set([advance, kind << 4, 0, 0, 0], 256 + code * 5);
  for (let code = 33; code <= 126; code++) {
    const at = offsets[code - 33];
    const g = render(code, width, height); if (g.length !== width * height) throw new Error('El rasterizador devolvió un glifo de tamaño incorrecto.');
    const [first, last] = proportional ? inkColumns(g, width, height) : [0, width - 1];
    out[256 + code * 5] = last - first + 1;
    v.setUint32(257 + code * 5, (0xf0000000 | at) >>> 0);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const sample = x + first < width ? g[y * width + x + first] : 0;
      const pos = at + y * stride + (bits === 4 ? x >> 1 : x);
      if (bits === 8) out[pos] = sample;
      else out[pos] |= (sample >> 4) << (x % 2 ? 0 : 4);
    }
  }
  const crc = crc16Modbus(out, 8); out[6] = crc & 255; out[7] = crc >> 8;
  return out;
}
