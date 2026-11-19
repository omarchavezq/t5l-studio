// Dibujo de caracteres sobre un lienzo 2D. Sin dependencias del DOM: sirve en la ventana y en un worker.
import type { Gray, GlyphRenderer } from '../core/fonts';

export interface RenderOptions {
  family: string;
  bold: boolean;
  italic: boolean;
  /** Tamaño de letra como fracción del alto de la celda. */
  scale: number;
  /** Desplazamientos en fracción de la celda (-0.5…0.5). */
  offsetX: number;
  offsetY: number;
  /** Posición de la línea base como fracción del alto. */
  baseline: number;
  align: 'center' | 'left';
}

export const DEFAULT_RENDER: RenderOptions = {
  family: 'Arial',
  bold: false,
  italic: false,
  scale: 0.72,
  offsetX: 0,
  offsetY: 0,
  baseline: 0.78,
  align: 'center',
};

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function makeRendererWith(ctx: (w: number, h: number) => Ctx2D, o: RenderOptions): GlyphRenderer {
  return (code, w, h) => {
    const g = ctx(w, h);
    g.save();
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    const out: Gray = new Uint8Array(w * h);
    if (code < 0x20 || code === 0x7f) {
      g.restore();
      return out;
    }
    const ch = String.fromCodePoint(code);
    g.font = `${o.italic ? 'italic ' : ''}${o.bold ? 'bold ' : ''}${Math.max(1, h * o.scale)}px "${o.family}"`;
    g.fillStyle = '#fff';
    g.textBaseline = 'alphabetic';
    const m = g.measureText(ch);
    const x = o.align === 'center' ? (w - m.width) / 2 : 0;
    g.fillText(ch, x + o.offsetX * w, h * o.baseline + o.offsetY * h);
    const px = g.getImageData(0, 0, w, h).data;
    for (let i = 0; i < out.length; i++) out[i] = px[i * 4];
    g.restore();
    return out;
  };
}
