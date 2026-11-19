// Dibuja caracteres con fuentes del sistema (o TTF/OTF cargados) para generar librerías DGUS,
// y dibuja texto con las librerías 0# del proyecto para la vista previa del lienzo.

import { fromBase64 } from '../core/bytes';
import { ascGlyph, grayFontInfo, isAscii0, type GlyphRenderer } from '../core/fonts';
import { useStore } from './store';
import { makeRendererWith, type RenderOptions } from './glyphRender';
import { buildFont, glyphCount, type FontJob } from './fontBuild';
import type { FontWorkerReply, FontWorkerRequest } from './fontWorker';

export { DEFAULT_RENDER, type RenderOptions } from './glyphRender';

let canvas: HTMLCanvasElement | null = null;
function ctx(w: number, h: number) {
  canvas ??= document.createElement('canvas');
  if (canvas.width < w) canvas.width = w;
  if (canvas.height < h) canvas.height = h;
  return canvas.getContext('2d', { willReadFrequently: true })!;
}

export function makeRenderer(o: RenderOptions): GlyphRenderer {
  return makeRendererWith(ctx, o);
}

/** TTF/OTF cargados por el usuario, para pasarlos también al worker. */
const loadedFonts = new Map<string, ArrayBuffer>();

/**
 * Genera la librería en un worker (la ventana sigue respondiendo). Si el worker no está
 * disponible, la genera aquí mismo como antes.
 */
export function generateFont(job: FontJob, opt: RenderOptions, onProgress: (done: number, total: number) => void, signal?: AbortSignal): Promise<Uint8Array> {
  const total = glyphCount(job);
  let worker: Worker;
  try {
    worker = new Worker(new URL('./fontWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    return new Promise((ok) => setTimeout(ok, 30)).then(() => buildFont(job, makeRenderer(opt)));
  }
  return new Promise<Uint8Array>((resolve, reject) => {
    const stop = () => {
      worker.terminate();
      reject(new DOMException('Cancelado', 'AbortError'));
    };
    if (signal?.aborted) return stop();
    signal?.addEventListener('abort', stop, { once: true });
    worker.onmessage = (e: MessageEvent<FontWorkerReply>) => {
      const m = e.data;
      if (m.type === 'progress') return onProgress(m.done, total);
      worker.terminate();
      signal?.removeEventListener('abort', stop);
      if (m.type === 'done') resolve(m.data);
      else reject(new Error(m.message));
    };
    worker.onerror = () => {
      // Worker no cargado (p. ej. política del navegador): se genera en la ventana.
      worker.terminate();
      signal?.removeEventListener('abort', stop);
      try {
        resolve(buildFont(job, makeRenderer(opt)));
      } catch (err) {
        reject(err);
      }
    };
    const data = loadedFonts.get(opt.family);
    const req: FontWorkerRequest = { job, opt, ...(data ? { font: { family: opt.family, data: data.slice(0) } } : {}) };
    worker.postMessage(req);
  });
}

/** Carga un TTF/OTF/WOFF y lo registra con un nombre propio. */
export async function loadFontFile(file: File): Promise<string> {
  const name = 'DGUS ' + file.name.replace(/\.[^.]+$/, '');
  const data = await file.arrayBuffer();
  loadedFonts.set(name, data.slice(0));
  const face = new FontFace(name, data);
  await face.load();
  document.fonts.add(face);
  return name;
}

const COMMON_FONTS = [
  'Arial', 'Arial Black', 'Bahnschrift', 'Calibri', 'Cambria', 'Consolas', 'Courier New', 'Georgia', 'Impact',
  'Lucida Console', 'Segoe UI', 'Segoe UI Semibold', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana',
  'Microsoft YaHei', 'SimSun', 'SimHei', 'Roboto', 'DejaVu Sans', 'Liberation Sans',
];

/** Fuentes del sistema: con queryLocalFonts si el navegador lo permite; si no, una lista habitual. */
export async function systemFonts(): Promise<string[]> {
  const q = (window as unknown as { queryLocalFonts?: () => Promise<{ family: string }[]> }).queryLocalFonts;
  if (q) {
    try {
      const list = await q();
      const fams = [...new Set(list.map((f) => f.family))].sort((a, b) => a.localeCompare(b));
      if (fams.length) return fams;
    } catch {
      /* sin permiso */
    }
  }
  return COMMON_FONTS.filter((f) => document.fonts.check(`12px "${f}"`));
}

// ------------------------------------------------------------------ vista previa con librerías 0#

const libCache = new Map<string, Uint8Array>();

/** La clave es el contenido completo: mismo nombre y tamaño no implican la misma fuente. */
export function projectFontLib(id: number): Uint8Array | null {
  const files = useStore.getState().project.extraFiles ?? {};
  const isGrayBin = (n: string) => { try { return /\.bin$/i.test(n) && !!grayFontInfo(fromBase64(files[n])); } catch { return false; } };
  const names = Object.keys(files).filter((n) => new RegExp(`^${id}(_|\\.)`, 'i').test(n) && (/\.(hzk|dzk)$/i.test(n) || isGrayBin(n)));
  const name = names.length === 1 ? names[0] : undefined;
  if (!name) return null;
  const b64 = files[name];
  const key = b64;
  let lib = libCache.get(key);
  if (!lib) {
    try { lib = fromBase64(b64); } catch { return null; }
    if (libCache.size >= 16) libCache.clear();
    libCache.set(key, lib);
  }
  return lib;
}

export function projectAsciiLib(id: number): Uint8Array | null {
  const lib = projectFontLib(id);
  return lib && isAscii0(lib) ? lib : null;
}

const textCaches = new WeakMap<Uint8Array, Map<string, string>>();

/** Imagen (data URL) de un texto dibujado con una librería 0#: ancho de carácter `w`, alto 2w. */
export function asciiTextImage(lib: Uint8Array, text: string, w: number, color: string): { url: string; width: number; height: number } | null {
  let textCache = textCaches.get(lib);
  if (!textCache) { textCache = new Map(); textCaches.set(lib, textCache); }
  const key = `${text}|${w}|${color}`;
  const h = w * 2;
  const width = Math.max(1, text.length * w);
  if (!Number.isInteger(w) || w < 4 || w > 64 || width > 4096 || width * h > 4_194_304) return null;
  const cached = textCache.get(key);
  if (cached) return { url: cached, width, height: h };
  const c = document.createElement('canvas');
  c.width = width;
  c.height = h;
  const g = c.getContext('2d')!;
  const img = g.createImageData(width, h);
  const [r, gg, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  for (let k = 0; k < text.length; k++) {
    const gl = ascGlyph(lib, w, text.charCodeAt(k));
    if (!gl) return null;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (gl.g[y * w + x]) {
          const p = (y * width + k * w + x) * 4;
          img.data[p] = r;
          img.data[p + 1] = gg;
          img.data[p + 2] = b;
          img.data[p + 3] = 255;
        }
  }
  g.putImageData(img, 0, 0);
  const url = c.toDataURL();
  if (textCache.size > 500) textCache.clear();
  textCache.set(key, url);
  return { url, width, height: h };
}
