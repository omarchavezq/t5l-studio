import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { buildGrayAscii } from '../grayAscii';
import { buildGrayUnicode, grayFitsBank, grayFontInfo, grayGlyph } from '../fonts';
import { crc16Modbus } from '../icl';

describe('ASCII gris de fontbit4', () => {
  for (const [bits, sha] of [[4, '4ff4d1c6c3561250751ddf50b05223584b136889f6e8bfed43e485397d59f1ff'], [8, '00ccb81923848887c4899625559a0ad66528f41a94cc17ad8d02c3d77ccc5116']] as const) {
    it(`coincide con el empaquetador x86 original a ${bits} bits usando un raster sintético`, () => {
      const lib = buildGrayAscii(6, 4, bits, (code, w, h) => Uint8Array.from({ length: w * h }, (_, i) => ((code + i % w + Math.floor(i / w) * 3) & 15) * 17));
      expect(createHash('sha256').update(lib).digest('hex')).toBe(sha);
      expect(grayFontInfo(lib)).toEqual({ codes: 256, start: 1536, bits });
      expect((lib[7] << 8) | lib[6]).toBe(crc16Modbus(lib, 8));
      expect(grayGlyph(lib, 33)?.g.slice(0, 6)).toEqual(Uint8Array.from([17, 34, 51, 68, 85, 102]));
      expect(grayGlyph(lib, 0xf1)).toBeNull();
    });
  }
  it('mantiene separadas las filas impares y el relleno de cada glifo', () => {
    const lib = buildGrayAscii(5, 5, 4, (_c, w, h) => new Uint8Array(w * h).fill(255));
    expect([...lib.slice(1536, 1536 + 16)]).toEqual([255,255,240,255,255,240,255,255,240,255,255,240,255,255,240,0]);
    expect(grayGlyph(lib, 33)?.g.every((v) => v === 255)).toBe(true);
    expect(grayGlyph(lib.slice(0, 1540), 33)).toBeNull();
  });
  it('evita que un glifo cruce el límite físico de 16 MB', () => {
    const lib = buildGrayAscii(64, 128, 8, (_c, w, h) => new Uint8Array(w * h), false, 63);
    const view = new DataView(lib.buffer); let padded = false;
    for (let code = 33; code <= 126; code++) {
      const at = view.getUint32(257 + code * 5) & 0x0fffffff;
      const physical = 63 * 262144 + at;
      expect(Math.floor(physical / 16777216)).toBe(Math.floor((physical + 8191) / 16777216));
      if (code > 33 && at !== (view.getUint32(257 + (code - 1) * 5) & 0x0fffffff) + 8192) padded = true;
    }
    expect(padded).toBe(true);
    expect(grayFitsBank(lib, 63)).toBe(true);
    const withoutPadding = buildGrayAscii(64, 128, 8, (_c, w, h) => new Uint8Array(w * h));
    expect(grayFitsBank(withoutPadding, 63)).toBe(false);
  });
  it('conserva la lectura Unicode existente y rechaza tamaños imposibles o falsos DGUS_2', () => {
    const lib = buildGrayUnicode([65], 12, 16, (_c, w, h) => new Uint8Array(w * h).fill(255));
    expect(grayGlyph(lib, 65)?.g.every((v) => v === 255)).toBe(true);
    expect(grayFontInfo(new Uint8Array(4096))).toBeNull();
    expect(() => buildGrayAscii(0, 12, 4, () => new Uint8Array())).toThrow('celdas');
    expect(() => buildGrayAscii(12, 12, 4, () => new Uint8Array())).toThrow('rasterizador');
    const odd = buildGrayUnicode([65], 5, 4, (_c, w, h) => Uint8Array.from({ length: w * h }, (_, i) => (i % 16) * 17));
    expect(grayGlyph(odd, 65)?.g).toEqual(Uint8Array.from({ length: 20 }, (_, i) => (i % 16) * 17));
  });
});
