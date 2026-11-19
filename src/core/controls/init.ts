// Valores iniciales de variables (22_Config.bin).
// Códigos tomados de TDocumentSpace.BuildShowBinFile en DGUS V7.651.

import type { InitEntry } from './schema';

/**
 * code: 3 int16 · 4 int32 · 2 byte bajo · 1 byte alto · 41 int64 · 30 uint16
 *       42 uint32 · 43 float32 · 44 float64 · 5 texto
 */
export function encodeInitValue(vp: number, code: number, raw: string): InitEntry | null {
  const text = raw.trim() === '' ? '0' : raw.trim();
  const dv = new DataView(new ArrayBuffer(8));
  let size = 2;
  switch (code) {
    case 3:
      dv.setInt16(0, Math.trunc(Number(text)) || 0);
      size = 2;
      break;
    case 30:
      dv.setUint16(0, Math.trunc(Number(text)) & 0xffff);
      size = 2;
      break;
    case 4:
      dv.setInt32(0, Math.trunc(Number(text)) | 0);
      size = 4;
      break;
    case 42:
      dv.setUint32(0, Math.trunc(Number(text)) >>> 0);
      size = 4;
      break;
    case 41:
      dv.setBigInt64(0, safeBigInt(text));
      size = 8;
      break;
    case 43:
      dv.setFloat32(0, Number(text) || 0);
      size = 4;
      break;
    case 44:
      dv.setFloat64(0, Number(text) || 0);
      size = 8;
      break;
    case 1: {
      // byte alto: se escribe en la primera posición del VP
      const out = new Uint8Array(1);
      out[0] = Math.trunc(Number(text)) & 0xff;
      return { vp, bytes: out };
    }
    case 2: {
      // byte bajo: segunda posición del VP
      const out = new Uint8Array(1);
      out[0] = Math.trunc(Number(text)) & 0xff;
      return { vp, bytes: out, byteOffset: 1 };
    }
    default:
      return null;
  }
  return { vp, bytes: new Uint8Array(dv.buffer.slice(0, size)) };
}

function safeBigInt(s: string): bigint {
  try {
    return BigInt(s.split('.')[0]);
  } catch {
    return 0n;
  }
}

/**
 * Codifica un texto inicial.
 * 0 ASCII/ANSI · 5 UNICODE (UTF-16 big-endian). GB2312/GBK/BIG5/Shift-JIS caen a ANSI (latin1) en esta versión.
 */
export function encodeText(s: string, encoding: number, _unicodeBE = false): Uint8Array {
  if (encoding === 5) {
    const out = new Uint8Array(s.length * 2);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      out[i * 2] = c >> 8;
      out[i * 2 + 1] = c & 0xff;
    }
    return out;
  }
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}
