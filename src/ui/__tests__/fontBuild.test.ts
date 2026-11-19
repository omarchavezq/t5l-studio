import { describe, expect, it } from 'vitest';
import { buildAscii0, buildBitmapLib, buildGrayUnicode, codesFor } from '../../core/fonts';
import { buildFont, glyphCount, type FontJob } from '../fontBuild';

const fake = (code: number, w: number, h: number) => Uint8Array.from({ length: w * h }, (_, i) => ((code * 31 + i * 7) & 0xff));
const base: FontJob = { kind: 'ascii0', fixedKind: 'byte', codes: codesFor(['latin1']), gw: 16, gh: 24, threshold: 128, grayBits: 4, fileId: 1 };

describe('generación de fuentes fuera de la ventana', () => {
  it('produce los mismos bytes que las funciones de core', () => {
    expect(buildFont(base, fake)).toEqual(buildAscii0(fake, 128));
    expect(buildFont({ ...base, kind: 'gray' }, fake)).toEqual(buildGrayUnicode(base.codes, 16, 24, fake));
    const bytes = Array.from({ length: 224 }, (_, i) => ({ index: i + 32, code: i + 32 }));
    expect(buildFont({ ...base, kind: 'fixed' }, fake)).toEqual(buildBitmapLib(bytes, 16, 24, fake, 128));
  }, 30000); // genera varias fuentes completas (la 0# pesa 3 MB)

  it('el total de progreso coincide con los caracteres dibujados', () => {
    for (const job of [base, { ...base, kind: 'gray' as const }, { ...base, kind: 'fixed' as const }, { ...base, kind: 'fixed' as const, fixedKind: 'unicode' as const }]) {
      let n = 0;
      buildFont(job, (c, w, h) => (n++, fake(c, w, h)));
      expect(n, job.kind + job.fixedKind).toBeGreaterThanOrEqual(glyphCount(job) * 0.9);
      expect(n).toBeLessThanOrEqual(glyphCount(job) * 2);
    }
  }, 30000);

  it('sin juegos de caracteres avisa', () => {
    expect(() => buildFont({ ...base, kind: 'gray', codes: [] }, fake)).toThrow(/juego de caracteres/);
  });
});
