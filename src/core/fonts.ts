// Librerías de fuentes de DGUS II (T5L).
//
// 1) Fuente ASCII 0# ("N_DWIN_ASC.HZK"), tomada de DW_0Font.exe y verificada con archivos reales:
//    para cada ancho i de 4 a 64 px, 128 caracteres (0x00-0x7F) de i × 2i píxeles,
//    1 bit por píxel, MSB a la izquierda, filas de ⌈i/8⌉ bytes. Sin cabecera, tamaños seguidos.
//    La usan las variables numéricas, RTC y HEX (biblioteca 0, «tamaño» = ancho).
//
// 2) Fuente Unicode en escala de grises "DGUS_2" (UnicodeGrayFont.exe), para «Texto DGUS II»:
//    cabecera de 256 bytes, índice de 65 536 × 5 bytes y glifos de maxW × maxH a 4 bits por píxel.
//
// 3) Librerías de mapa de bits de tamaño fijo (8 bits, GB2312, Unicode) según el manual de DGUS II:
//    el desplazamiento de cada carácter es índice × bytes por carácter.

/** Un glifo en escala de grises (0 = fondo, 255 = tinta), fila a fila. */
export type Gray = Uint8Array;
export type GlyphRenderer = (code: number, w: number, h: number) => Gray;

// ------------------------------------------------------------------ 1 bit por píxel

export function pack1bpp(g: Gray, w: number, h: number, threshold = 128): Uint8Array {
  const rb = Math.ceil(w / 8);
  const out = new Uint8Array(rb * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (g[y * w + x] >= threshold) out[y * rb + (x >> 3)] |= 0x80 >> (x & 7);
  return out;
}

export function unpack1bpp(b: Uint8Array, at: number, w: number, h: number): Gray {
  const rb = Math.ceil(w / 8);
  const g = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (b[at + y * rb + (x >> 3)] & (0x80 >> (x & 7))) g[y * w + x] = 255;
  return g;
}

// ------------------------------------------------------------------ 0# ASCII

export const ASC_MIN = 4;
export const ASC_MAX = 64;
export const ASC_FILE_SIZE = ascOffset(ASC_MAX + 1);

/** Desplazamiento del primer carácter del ancho `w` dentro de N_DWIN_ASC.HZK. */
export function ascOffset(w: number): number {
  let o = 0;
  for (let i = ASC_MIN; i < w; i++) o += 128 * 2 * i * Math.ceil(i / 8);
  return o;
}

export function buildAscii0(render: GlyphRenderer, threshold = 128, onProgress?: (w: number) => void): Uint8Array {
  const out = new Uint8Array(ASC_FILE_SIZE);
  for (let w = ASC_MIN; w <= ASC_MAX; w++) {
    const h = w * 2;
    const bpc = Math.ceil(w / 8) * h;
    let at = ascOffset(w);
    for (let code = 0; code < 128; code++) {
      out.set(pack1bpp(render(code, w, h), w, h, threshold), at);
      at += bpc;
    }
    onProgress?.(w);
  }
  return out;
}

/** Glifo de una fuente 0# ya generada o importada (null si el ancho o el código no existen). */
export function ascGlyph(lib: Uint8Array, w: number, code: number): { g: Gray; w: number; h: number } | null {
  if (!Number.isInteger(w) || !Number.isInteger(code) || w < ASC_MIN || w > ASC_MAX || code < 0 || code > 127) return null;
  const h = w * 2;
  const bpc = Math.ceil(w / 8) * h;
  const at = ascOffset(w) + code * bpc;
  if (at + bpc > lib.length) return null;
  return { g: unpack1bpp(lib, at, w, h), w, h };
}

export const isAscii0 = (b: Uint8Array) => b.length === ASC_FILE_SIZE;

// ------------------------------------------------------------------ librerías fijas

export type BitmapLibKind = 'byte' | 'gb2312' | 'unicode';

/** Índice de un carácter en la librería según su tipo (null si no pertenece). */
export function bitmapIndex(kind: BitmapLibKind, code: number, gbBytes?: [number, number]): number | null {
  if (kind === 'byte') return code <= 0xff ? code : null;
  if (kind === 'unicode') return code <= 0xffff ? code : null;
  if (!gbBytes) return null;
  const [hi, lo] = gbBytes;
  if (hi < 0xa1 || lo < 0xa1 || hi > 0xf7 || lo > 0xfe) return null;
  return (hi - 0xa1) * 94 + (lo - 0xa1);
}

/**
 * Librería de tamaño fijo w × h a 1 bit. `codes` son los caracteres a incluir
 * (para GB2312 se pasa el índice ya calculado). El archivo llega hasta el mayor índice.
 */
export function buildBitmapLib(indices: { index: number; code: number }[], w: number, h: number, render: GlyphRenderer, threshold = 128): Uint8Array {
  const bpc = Math.ceil(w / 8) * h;
  const max = indices.reduce((m, x) => Math.max(m, x.index), 0);
  const out = new Uint8Array((max + 1) * bpc);
  for (const { index, code } of indices) out.set(pack1bpp(render(code, w, h), w, h, threshold), index * bpc);
  return out;
}

// ------------------------------------------------------------------ DGUS_2 Unicode gris

const GRAY_DATA_START = 327936; // 256 de cabecera + 65536 × 5 de índice

/** Primera y última columna con tinta (CalcStartLine de UnicodeGrayFont). */
export function inkColumns(g: Gray, w: number, h: number, black = 16): [number, number] {
  let first = -1;
  let last = 0;
  for (let x = 0; x < w; x++) {
    let ink = false;
    for (let y = 0; y < h && !ink; y++) if (g[y * w + x] >= black) ink = true;
    if (ink) {
      if (first < 0) first = x;
      last = x;
    }
  }
  return first < 0 ? [0, 0] : [first, last];
}

/** Desplaza el glifo a la izquierda `dx` columnas (DrawImages con -startX). */
function shiftLeft(g: Gray, w: number, h: number, dx: number): Gray {
  if (!dx) return g;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x + dx < w; x++) out[y * w + x] = g[y * w + x + dx];
  return out;
}

/** Empaqueta a 4 bits por píxel (GetHigh4Bit), con relleno a número par de bytes. */
export function pack4bpp(g: Gray): Uint8Array {
  const src = g.length % 2 ? Uint8Array.from([...g, 0]) : g;
  let n = src.length / 2;
  const out = new Uint8Array(n % 2 ? n + 1 : n);
  for (let i = 0; i < n; i++) out[i] = ((src[i * 2] >> 4) << 4) | (src[i * 2 + 1] >> 4);
  return out;
}

export function buildGrayUnicode(codes: number[], maxW: number, maxH: number, render: GlyphRenderer): Uint8Array {
  const set = new Set(codes.filter((c) => c > 32 && c <= 0xffff));
  const index = new Uint8Array(65536 * 5);
  const chunks: Uint8Array[] = [];
  let dataLen = 0;
  for (let i = 0; i <= 0xffff; i++) {
    const at = i * 5;
    if (i <= 32) {
      // Saltos de línea y espacio con ancho fijo, como el original
      let kind = 0;
      let width = 0;
      if (i === 10) [kind, width] = [2, 10];
      else if (i === 13) [kind, width] = [1, 10];
      else if (i === 32) [kind, width] = [3, Math.floor(maxW / 4)];
      index[at] = width;
      index[at + 1] = kind << 4;
      continue;
    }
    if (!set.has(i)) continue;
    const g0 = render(i, maxW, maxH);
    const [a, b] = inkColumns(g0, maxW, maxH);
    const g = shiftLeft(g0, maxW, maxH, a);
    const addr = GRAY_DATA_START + dataLen;
    index[at] = Math.min(255, b - a + 1);
    index[at + 1] = ((addr >>> 24) & 0xff) | 0xf0;
    index[at + 2] = (addr >>> 16) & 0xff;
    index[at + 3] = (addr >>> 8) & 0xff;
    index[at + 4] = addr & 0xff;
    const data = pack4bpp(g);
    chunks.push(data);
    dataLen += data.length;
  }
  const out = new Uint8Array(GRAY_DATA_START + dataLen);
  out.set([0x44, 0x47, 0x55, 0x53, 0x5f, 0x32, 0, 0], 0);
  const size = dataLen + GRAY_DATA_START;
  out.set([(size >>> 24) & 0xff, (size >>> 16) & 0xff, (size >>> 8) & 0xff, size & 0xff], 8);
  out[12] = 1;
  const count = set.size + 3;
  out[13] = (count >> 8) & 0xff;
  out[14] = count & 0xff;
  out.set([1, 4, 128, 0, 4, maxW & 0xff, maxH & 0xff, 1], 15);
  out.set(index, 256);
  let o = GRAY_DATA_START;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** Lee un glifo de una fuente gris DGUS_2. */
export function grayGlyph(lib: Uint8Array, code: number): { g: Gray; w: number; h: number; valid: number } | null {
  const info = grayFontInfo(lib);
  if (!info || !Number.isInteger(code) || code < 0 || code >= info.codes) return null;
  const maxW = lib[20];
  const maxH = lib[21];
  const at = 256 + code * 5;
  const valid = lib[at];
  const addr = (((lib[at + 1] & 0x0f) << 24) | (lib[at + 2] << 16) | (lib[at + 3] << 8) | lib[at + 4]) >>> 0;
  const stride = info.bits === 4 ? Math.ceil(maxW / 2) : maxW;
  const rowAligned = info.codes === 256 || new DataView(lib.buffer, lib.byteOffset, lib.byteLength).getUint32(8) === lib.length - 8;
  const bytes = rowAligned ? stride * maxH : Math.ceil(maxW * maxH * info.bits / 8);
  if ((lib[at + 1] & 0xf0) !== 0xf0 || !maxW || !maxH || addr < info.start || addr + bytes > lib.length) return null;
  const g = new Uint8Array(maxW * maxH);
  for (let i = 0; i < g.length; i++) {
    const x = i % maxW, y = Math.floor(i / maxW);
    const byte = lib[addr + (rowAligned ? y * stride + (info.bits === 4 ? x >> 1 : x) : info.bits === 4 ? i >> 1 : i)];
    g[i] = info.bits === 8 ? byte : ((rowAligned ? x : i) & 1 ? byte & 0x0f : byte >> 4) * 17;
  }
  return { g, w: maxW, h: maxH, valid };
}

/** Solo identifica cabecera e índice: no confunde WAE DGUS_2 con una fuente. */
export function grayFontInfo(lib: Uint8Array): { codes: number; start: number; bits: 4 | 8 } | null {
  if (lib.length < 256 || String.fromCharCode(...lib.slice(0, 6)) !== 'DGUS_2' || lib[12] !== 1 || ![4, 8].includes(lib[19]) || !lib[20] || !lib[21]) return null;
  const codes = lib[15] === 0 && lib[16] === 0 ? 256 : lib[15] === 1 && lib[16] === 4 ? 65536 : 0;
  const start = 256 + codes * 5;
  return codes && lib.length >= start ? { codes, start, bits: lib[19] as 4 | 8 } : null;
}

/** Las rutinas de DWIN no dividen un glifo entre bancos físicos de 16 MB. */
export function grayFitsBank(lib: Uint8Array, fileId: number): boolean {
  const info = grayFontInfo(lib); if (!info) return true;
  const view = new DataView(lib.buffer, lib.byteOffset, lib.byteLength);
  const rowAligned = info.codes === 256 || view.getUint32(8) === lib.length - 8;
  const bytes = rowAligned ? (info.bits === 4 ? Math.ceil(lib[20] / 2) : lib[20]) * lib[21] : Math.ceil(lib[20] * lib[21] * info.bits / 8);
  for (let code = 0; code < info.codes; code++) {
    const at = 256 + code * 5;
    if ((lib[at + 1] & 240) !== 240) continue;
    const offset = view.getUint32(at + 1) & 0x0fffffff;
    const address = fileId * 262144 + offset;
    if (offset < info.start || offset + bytes > lib.length || Math.floor(address / 16777216) !== Math.floor((address + bytes - 1) / 16777216)) return false;
  }
  return true;
}

// ------------------------------------------------------------------ juegos de caracteres

export const CHARSETS: { id: string; label: string; ranges: [number, number][] }[] = [
  { id: 'ascii', label: 'ASCII básico (20–7E)', ranges: [[0x20, 0x7e]] },
  { id: 'latin1', label: 'Latín-1: español, portugués, francés… (20–FF)', ranges: [[0x20, 0x7e], [0xa0, 0xff]] },
  { id: 'latinExt', label: 'Latín extendido A (100–17F)', ranges: [[0x100, 0x17f]] },
  { id: 'greek', label: 'Griego (370–3FF)', ranges: [[0x370, 0x3ff]] },
  { id: 'cyrillic', label: 'Cirílico (400–4FF)', ranges: [[0x400, 0x4ff]] },
  { id: 'symbols', label: 'Símbolos: °, ±, µ, Ω, flechas, ✓ (2000–21FF, 2190–21FF, 2713)', ranges: [[0x2010, 0x2044], [0x20ac, 0x20ac], [0x2122, 0x2126], [0x2190, 0x21ff], [0x2713, 0x2717]] },
  { id: 'cjk', label: 'CJK unificado (4E00–9FA5, ~21 000 caracteres)', ranges: [[0x4e00, 0x9fa5]] },
];

export function codesFor(ids: string[], extra = ''): number[] {
  const set = new Set<number>();
  for (const cs of CHARSETS) if (ids.includes(cs.id)) for (const [a, b] of cs.ranges) for (let c = a; c <= b; c++) set.add(c);
  for (const ch of extra) set.add(ch.codePointAt(0)!);
  return [...set].filter((c) => c <= 0xffff).sort((a, b) => a - b);
}
