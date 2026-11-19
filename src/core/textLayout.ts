// Representación de referencia: tamaños leídos del bloque exportado, sin DOM ni fuentes del PC.
import { ascGlyph, grayGlyph, isAscii0, unpack1bpp } from './fonts';

export interface TextRaster {
  width: number;
  height: number;
  alpha: Uint8Array;
  issues: string[];
  clipped: boolean;
  glyphHeight: number;
}
const u16 = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];

/** Modos 8 bits/Unicode; los demás requieren sus tablas de codificación. */
export function rasterText(block: Uint8Array, text: string, lib: Uint8Array | null, encoding = 0): TextRaster {
  const gray = block[1] === 0x16;
  const area = gray ? 16 : 14;
  const width = Math.max(1, u16(block, area + 4) - u16(block, area));
  const height = Math.max(1, u16(block, area + 6) - u16(block, area + 2));
  const result: TextRaster = { width, height, alpha: new Uint8Array(), issues: [], clipped: false, glyphHeight: 0 };
  const issue = (message: string) => { if (!result.issues.includes(message)) result.issues.push(message); };
  if (block.length !== 32 || ![0x11, 0x16].includes(block[1])) { issue('Control de texto no admitido.'); return result; }
  if (width > 4096 || height > 4096 || width * height > 4_194_304) { issue('Área demasiado grande para la vista previa.'); return result; }
  result.alpha = new Uint8Array(width * height);
  if (!lib) { issue('Fuente no incluida en el proyecto.'); return result; }
  if (encoding !== 0 && encoding !== 5) { issue('Vista de esta codificación todavía no verificada.'); return result; }
  if (!gray && String.fromCharCode(...lib.subarray(0, 6)) === 'DGUS_2') {
    issue('Esta biblioteca en grises requiere el control Texto DGUS II.'); return result;
  }
  const scale = gray ? (block[28] & 0x7f) / 16 : 1;
  const fw = gray ? lib[20] : block[26];
  const fh = gray ? lib[21] : block[27];
  if (!fw || !fh || !scale || (gray && String.fromCharCode(...lib.subarray(0, 6)) !== 'DGUS_2')) {
    issue('Formato de fuente o escala no compatible con este control.'); return result;
  }
  const gh = Math.max(1, Math.floor(fh * scale));
  result.glyphHeight = gh;
  const maxBytes = u16(block, gray ? 24 : 22);
  const chars = text.slice(0, Math.floor(maxBytes / (encoding === 5 ? 2 : 1)));
  if (!chars.length) return result;
  const fixed = !!(block[28] & 0x80);
  const align = gray ? block[31] : (block[28] >> 5) & 3;
  const gapX = block[29];
  const gapY = block[30];
  type Placed = { x: number; y: number; w: number; h: number; src: Uint8Array; sw: number; sh: number };
  const lines: { items: Placed[]; width: number }[] = [{ items: [], width: 0 }];
  let x = 0;
  for (let i = 0; i < chars.length; i++) {
    const code = chars.charCodeAt(i);
    if (code === 0 || code === 0xffff || (encoding === 0 && code === 0xff)) break;
    if (code === 13 || code === 10) {
      if (code === 13 && chars.charCodeAt(i + 1) === 10) i++;
      lines.push({ items: [], width: 0 }); x = 0; continue;
    }
    if (encoding === 0 && code > 255) { issue('El texto contiene caracteres fuera de la codificación de 8 bits.'); continue; }
    let src: Uint8Array | null = null;
    let useful = fw;
    if (gray) {
      if (code === 32) { src = new Uint8Array(fw * fh); useful = lib[256 + 32 * 5]; }
      else {
        const g = grayGlyph(lib, code);
        if (g) { src = g.g; useful = g.valid; }
      }
    } else if (isAscii0(lib)) {
      const g = fh === fw * 2 ? ascGlyph(lib, fw, code) : null;
      if (g) src = g.g;
    } else {
      const bytes = Math.ceil(fw / 8) * fh;
      if ((code + 1) * bytes <= lib.length) src = unpack1bpp(lib, code * bytes, fw, fh);
    }
    if (!src) { issue(`No se pudo leer el glifo U+${code.toString(16).toUpperCase().padStart(4, '0')}.`); src = new Uint8Array(fw * fh); }
    const advance = Math.max(1, Math.floor((fixed ? fw : useful) * scale));
    const gw = Math.max(1, Math.floor(fw * scale));
    if (x && x + advance > width) { lines.push({ items: [], width: 0 }); x = 0; }
    const line = lines[lines.length - 1];
    line.items.push({ x, y: 0, w: gw, h: gh, src, sw: fw, sh: fh });
    line.width = x + advance;
    x += advance + gapX;
  }
  const totalHeight = lines.length * gh + (lines.length - 1) * gapY;
  const top = !gray && (block[28] & 0x10) ? Math.floor((height - totalHeight) / 2) : 0;
  result.clipped = totalHeight > height || lines.some((l) => l.width > width);
  lines.forEach((line, index) => {
    // La alineación horizontal DGUS solo se aplica a una línea.
    const left = lines.length === 1 ? (align === 1 ? width - line.width : align === 2 ? Math.floor((width - line.width) / 2) : 0) : 0;
    for (const g of line.items) {
      for (let y = 0; y < g.h; y++) for (let gx = 0; gx < g.w; gx++) {
        const dx = left + g.x + gx;
        const dy = top + index * (gh + gapY) + y;
        if (dx < 0 || dx >= width || dy < 0 || dy >= height) continue;
        const a = g.src[Math.floor(y * g.sh / g.h) * g.sw + Math.floor(gx * g.sw / g.w)];
        result.alpha[dy * width + dx] = Math.max(result.alpha[dy * width + dx], a);
      }
    }
  });
  return result;
}
