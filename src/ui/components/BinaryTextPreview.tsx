import { useEffect, useMemo, useRef } from 'react';
import { getDef } from '../../core/controls';
import { rasterText } from '../../core/textLayout';
import type { ControlInstance } from '../../core/types';
import { projectFontLib } from '../fontRender';
import { useStore } from '../store';

export function BinaryTextPreview({ c, text, color, zoom }: { c: ControlInstance; text: string; color: string; zoom: number }) {
  const settings = useStore((s) => s.project.settings);
  const pageId = useStore((s) => s.pageId);
  const files = useStore((s) => s.project.extraFiles);
  const canvas = useRef<HTMLCanvasElement>(null);
  const result = useMemo(() => {
    const block = getDef(c.type).encode(c, { ...settings, pageId, keyingIndex: { n: 0 } });
    const id = c.type === 'textII' ? (block[26] << 8) | block[27] : block[25];
    const encoding = c.type === 'textII' ? Number(c.props.encoding ?? 0) : block[28] & 15;
    const lib = projectFontLib(id);
    return { ...rasterText(block, text, lib, encoding), hasLib: !!lib };
  }, [c, text, settings, pageId, files]);
  useEffect(() => {
    const el = canvas.current;
    if (!el || !result.alpha.length) return;
    el.width = result.width;
    el.height = result.height;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(result.width, result.height);
    const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
    for (let i = 0; i < result.alpha.length; i++) {
      img.data.set([rgb[0], rgb[1], rgb[2], result.alpha[i]], i * 4);
    }
    ctx.putImageData(img, 0, 0);
  }, [result, color]);
  const notes = [...result.issues, ...(result.clipped ? ['El texto se recorta: excede el área disponible.'] : [])];
  if (!result.hasLib && text) {
    // Sin la fuente en el proyecto: texto aproximado con el alto de carácter configurado.
    const fy = Math.max(4, Number(c.props.fontY) || 24) * zoom;
    const align = Number(c.props.align) === 1 ? 'flex-end' : Number(c.props.align) === 2 ? 'center' : 'flex-start';
    return <>
      <div className="ctl-cells" style={{ color, justifyContent: align, fontFamily: 'Arial, sans-serif', fontSize: fy * 0.9, lineHeight: `${fy}px` }}>{text}</div>
      <span className="text-preview-note" title={['Vista aproximada: el proyecto no incluye la fuente de este texto.', ...notes].join(' · ')}>≈</span>
    </>;
  }
  return <>
    <canvas ref={canvas} aria-label={text || 'Texto vacío'} className="binary-text" style={{ width: result.width * zoom, height: result.height * zoom }} />
    {notes.length > 0 && <span className="text-preview-note" title={notes.join('\n')} aria-label={notes.join(' ')}>
      {result.issues.length ? '≈ Revisar fuente' : 'Texto recortado'}
    </span>}
  </>;
}
