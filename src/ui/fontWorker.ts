// Worker que genera librerías de fuentes sin bloquear la ventana.
import { buildFont, type FontJob } from './fontBuild';
import { makeRendererWith, type RenderOptions } from './glyphRender';

export interface FontWorkerRequest {
  job: FontJob;
  opt: RenderOptions;
  /** TTF/OTF cargado por el usuario, si la familia no es del sistema. */
  font?: { family: string; data: ArrayBuffer };
}
export type FontWorkerReply = { type: 'progress'; done: number } | { type: 'done'; data: Uint8Array } | { type: 'error'; message: string };

const scope = self as unknown as { onmessage: ((e: MessageEvent<FontWorkerRequest>) => void) | null; postMessage(m: FontWorkerReply, transfer?: Transferable[]): void; fonts: FontFaceSet };
let canvas: OffscreenCanvas | null = null;

scope.onmessage = async (e: MessageEvent<FontWorkerRequest>) => {
  const { job, opt, font } = e.data;
  try {
    if (font) {
      const face = new FontFace(font.family, font.data);
      await face.load();
      scope.fonts.add(face);
    }
    await scope.fonts.load(`16px "${opt.family}"`).catch(() => []);
    const base = makeRendererWith((w, h) => {
      if (!canvas || canvas.width < w || canvas.height < h) canvas = new OffscreenCanvas(Math.max(w, canvas?.width ?? 0), Math.max(h, canvas?.height ?? 0));
      return canvas.getContext('2d', { willReadFrequently: true })!;
    }, opt);
    let done = 0;
    const data = buildFont(job, (code, w, h) => {
      if (++done % 256 === 0) scope.postMessage({ type: 'progress', done } satisfies FontWorkerReply);
      return base(code, w, h);
    });
    scope.postMessage({ type: 'done', data } satisfies FontWorkerReply, [data.buffer]);
  } catch (err) {
    scope.postMessage({ type: 'error', message: (err as Error).message } satisfies FontWorkerReply);
  }
};
