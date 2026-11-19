import { bindLanguageTable, checkLanguageTable, type LanguageTable } from '../core/multilanguage';
import type { Project } from '../core/types';
import { iclJpeg } from './platform';

/** Se rasteriza una sola vez; el lienzo y DWIN_SET leen después el mismo JPEG del ICL. */
export async function generateLanguages(p: Project, t: LanguageTable, progress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<Project> {
  const active = () => { if (signal?.aborted) throw new Error('Generación cancelada.'); }; active();
  const errors = checkLanguageTable(p, t); if (errors.length) throw new Error(errors.join('\n'));
  const controls = p.pages.flatMap((page) => page.controls);
  const images = []; const total = t.rows.length * t.languages.length; let bytes = 0;
  for (const row of t.rows) {
    const c = controls.find((c) => c.id === row.controlId)!;
    await document.fonts.load(`${row.size}px "${row.family}"`);
    const canvas = document.createElement('canvas'); canvas.width = c.w; canvas.height = c.h;
    const ctx = canvas.getContext('2d')!;
    for (const text of row.texts) {
      active();
      ctx.fillStyle = row.background; ctx.fillRect(0, 0, c.w, c.h);
      ctx.fillStyle = row.color; ctx.font = `${row.bold ? 'bold ' : ''}${row.size}px "${row.family}"`;
      ctx.textBaseline = 'top'; ctx.textAlign = row.align;
      const x = row.align === 'center' ? c.w / 2 : row.align === 'right' ? c.w : 0;
      text.split(/\r?\n/).forEach((line, i) => ctx.fillText(line, x, i * row.size * 1.2));
      const j = await iclJpeg(canvas.toDataURL('image/jpeg', p.settings.jpegQuality), null, null, p.settings.jpegQuality);
      active();
      bytes += j.jpeg.length;
      if (bytes > 64 * 1024 * 1024) throw new Error('Las traducciones superan 64 MB. Reduzca su cantidad o tamaño.');
      images.push({ id: images.length, width: c.w, height: c.h, jpeg: j.jpeg });
      progress?.(images.length, total);
      if (images.length % 10 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  active(); return bindLanguageTable(p, t, images);
}
