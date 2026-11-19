// Generación de una librería de fuentes a partir de sus parámetros. Pura: la usan el worker y la ventana.
import { buildGrayAscii } from '../core/grayAscii';
import { ASC_MAX, ASC_MIN, bitmapIndex, buildAscii0, buildBitmapLib, buildGrayUnicode, type GlyphRenderer } from '../core/fonts';

export type FontKind = 'ascii0' | 'gray' | 'grayAscii' | 'fixed';
export type FixedKind = 'byte' | 'gb2312' | 'unicode';

export interface FontJob {
  kind: FontKind;
  fixedKind: FixedKind;
  codes: number[];
  gw: number;
  gh: number;
  threshold: number;
  grayBits: 4 | 8;
  fileId: number;
}

function gb2312Indices(): { index: number; code: number }[] {
  const out: { index: number; code: number }[] = [];
  const dec = new TextDecoder('gb18030');
  for (let hi = 0xa1; hi <= 0xf7; hi++)
    for (let lo = 0xa1; lo <= 0xfe; lo++) {
      const ch = dec.decode(Uint8Array.from([hi, lo]));
      const code = ch.codePointAt(0)!;
      const index = bitmapIndex('gb2312', code, [hi, lo]);
      if (index != null && code !== 0xfffd) out.push({ index, code });
    }
  return out;
}

/** Caracteres que se dibujarán, para calcular el progreso. */
export function glyphCount(job: FontJob): number {
  if (job.kind === 'ascii0') return (ASC_MAX - ASC_MIN + 1) * 128;
  if (job.kind === 'grayAscii') return 128;
  if (job.kind === 'gray') return job.codes.length;
  return job.fixedKind === 'byte' ? 224 : job.fixedKind === 'unicode' ? job.codes.length : gb2312Indices().length;
}

export function buildFont(job: FontJob, render: GlyphRenderer): Uint8Array {
  if (job.kind === 'ascii0') return buildAscii0(render, job.threshold);
  if (job.kind === 'gray') {
    if (!job.codes.length) throw new Error('Elija al menos un juego de caracteres.');
    return buildGrayUnicode(job.codes, job.gw, job.gh, render);
  }
  if (job.kind === 'grayAscii') return buildGrayAscii(job.gw, job.gh, job.grayBits, render, false, job.fileId);
  const indices =
    job.fixedKind === 'byte'
      ? Array.from({ length: 224 }, (_, i) => ({ index: i + 32, code: i + 32 }))
      : job.fixedKind === 'unicode'
        ? job.codes.map((c) => ({ index: c, code: c }))
        : gb2312Indices();
  return buildBitmapLib(indices, job.gw, job.gh, render, job.threshold);
}
