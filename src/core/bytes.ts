// Utilidades de escritura big-endian, igual que el código original de DGUS.

export class Buf {
  readonly b: Uint8Array;
  constructor(size: number, fill = 0) {
    this.b = new Uint8Array(size);
    if (fill) this.b.fill(fill);
  }
  u8(i: number, v: number): this {
    this.b[i] = v & 0xff;
    return this;
  }
  u16(i: number, v: number): this {
    this.b[i] = (v >> 8) & 0xff;
    this.b[i + 1] = v & 0xff;
    return this;
  }
  u32(i: number, v: number): this {
    this.b[i] = (v >>> 24) & 0xff;
    this.b[i + 1] = (v >>> 16) & 0xff;
    this.b[i + 2] = (v >>> 8) & 0xff;
    this.b[i + 3] = v & 0xff;
    return this;
  }
  /** Escribe los códigos de carácter (byte bajo) de un texto ASCII, sin pasar de `maxIndex`. */
  ascii(i: number, s: string, maxIndex: number): this {
    for (const ch of s ?? '') {
      if (i > maxIndex) break;
      this.b[i++] = ch.charCodeAt(0) & 0xff;
    }
    return this;
  }
  /** Escribe pares hexadecimales ("5AA5...") como bytes, sin pasar de `maxIndex`. */
  hex(i: number, s: string, maxIndex: number): this {
    const clean = (s ?? '').replace(/[^0-9a-fA-F]/g, '');
    for (let k = 0; k + 1 < clean.length; k += 2) {
      if (i > maxIndex) break;
      this.b[i++] = parseInt(clean.slice(k, k + 2), 16);
    }
    return this;
  }
}

/** Convierte "0x5000", "5000" o 20480 en número. Los VP se escriben en hexadecimal. */
export function parseHex(v: unknown, fallback = 0): number {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return fallback;
  const s = v.trim().replace(/^0x/i, '');
  if (!s) return fallback;
  const n = parseInt(s, 16);
  return Number.isFinite(n) ? n : fallback;
}

export function toHex(n: number, digits = 4): string {
  return (n >>> 0).toString(16).toUpperCase().padStart(digits, '0');
}

/** Color RGB565 <-> #rrggbb */
export function rgb565ToCss(c: number): string {
  const r = ((c >> 11) & 0x1f) << 3;
  const g = ((c >> 5) & 0x3f) << 2;
  const b = (c & 0x1f) << 3;
  return '#' + [r | (r >> 5), g | (g >> 6), b | (b >> 5)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function cssToRgb565(css: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(css.trim());
  if (!m) return 0;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function hexDump(b: Uint8Array, cols = 16): string {
  const lines: string[] = [];
  for (let i = 0; i < b.length; i += cols) {
    const row = Array.from(b.slice(i, i + cols), (x) => x.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    lines.push(i.toString(16).toUpperCase().padStart(6, '0') + '  ' + row);
  }
  return lines.join('\n');
}

export function toBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
