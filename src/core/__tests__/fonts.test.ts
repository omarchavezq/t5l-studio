import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ASC_FILE_SIZE, ascGlyph, ascOffset, bitmapIndex, buildAscii0, buildBitmapLib, buildGrayUnicode, codesFor, grayGlyph, pack4bpp } from '../fonts';

describe('fuente ASCII 0#', () => {
  it('tamaño igual al de 0_DWIN_ASC.HZK de DGUS', () => {
    expect(ASC_FILE_SIZE).toBe(3082752);
    expect(ascOffset(4)).toBe(0);
    expect(ascOffset(5)).toBe(128 * 8 * 1);
  });
  it('generar y leer un glifo', () => {
    // Glifo de prueba: una línea vertical en la columna 1
    const lib = buildAscii0((code, w, h) => {
      const g = new Uint8Array(w * h);
      if (code === 0x41) for (let y = 0; y < h; y++) g[y * w + 1] = 255;
      return g;
    });
    const a = ascGlyph(lib, 16, 0x41)!;
    expect(a.h).toBe(32);
    expect(a.g[5 * 16 + 1]).toBe(255);
    expect(a.g[5 * 16 + 2]).toBe(0);
    expect(ascGlyph(lib, 16, 0x42)!.g.some((x) => x)).toBe(false);
  });
  const root = process.env.DGUS_SAMPLES;
  // Primera 0_DWIN_ASC.HZK completa (3 082 752 bytes) que haya entre las muestras.
  const findAsc = (dir: string, depth = 0): string => {
    if (depth > 3 || !existsSync(dir)) return '';
    for (const n of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, n.name);
      if (n.isFile() && n.name === '0_DWIN_ASC.HZK' && statSync(p).size === 3082752) return p;
      if (n.isDirectory()) {
        const r = findAsc(p, depth + 1);
        if (r) return r;
      }
    }
    return '';
  };
  const real = root ? findAsc(root) : '';
  it.skipIf(!real || !existsSync(real))('reconstruye byte a byte una 0_DWIN_ASC.HZK real', () => {
    const orig = new Uint8Array(readFileSync(real));
    const rebuilt = buildAscii0((code, w) => ascGlyph(orig, w, code)!.g);
    expect(rebuilt.length).toBe(orig.length);
    expect(rebuilt.every((x, i) => x === orig[i])).toBe(true);
  });
});

describe('fuente gris DGUS_2', () => {
  it('cabecera, índice y glifo', () => {
    const lib = buildGrayUnicode([0x41, 0xf1], 12, 16, (code, w, h) => {
      const g = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) g[y * w + 3] = g[y * w + 4] = code === 0x41 ? 255 : 128;
      return g;
    });
    expect(String.fromCharCode(...lib.slice(0, 6))).toBe('DGUS_2');
    expect((lib[13] << 8) | lib[14]).toBe(5); // 2 caracteres + 3
    expect([lib[20], lib[21]]).toEqual([12, 16]);
    expect(lib.length).toBe(327936 + 2 * (12 * 16) / 2);
    const g = grayGlyph(lib, 0x41)!;
    expect(g.valid).toBe(2); // columnas 3 y 4
    expect(g.g[0]).toBe(255); // desplazado a la izquierda
    expect(g.g[2]).toBe(0);
    expect(lib[256 + 32 * 5]).toBe(3); // ancho del espacio = maxW / 4
  });
  it('empaquetado a 4 bits', () => {
    expect(Array.from(pack4bpp(Uint8Array.from([0xff, 0x10, 0x80])))).toEqual([0xf1, 0x80]);
  });
});

describe('librerías de tamaño fijo', () => {
  it('índices', () => {
    expect(bitmapIndex('gb2312', 0, [0xb0, 0xa1])).toBe((0xb0 - 0xa1) * 94);
    expect(bitmapIndex('unicode', 0x4e2d)).toBe(0x4e2d);
    const lib = buildBitmapLib([{ index: 3, code: 0x41 }], 16, 16, (_c, w, h) => new Uint8Array(w * h).fill(255));
    expect(lib.length).toBe(4 * 32);
    expect(lib[3 * 32]).toBe(0xff);
    expect(lib[0]).toBe(0);
  });
  it('juegos de caracteres', () => {
    const c = codesFor(['ascii'], 'ñ°');
    expect(c.length).toBe(95 + 2);
  });
});
