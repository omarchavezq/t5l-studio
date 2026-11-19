import { getDef } from '../../core/controls';
import { rgb565ToCss } from '../../core/bytes';
import type { ControlInstance } from '../../core/types';
import { Icon } from './Icon';
import { ICON_PREVIEW, iclImage } from '../iconCache';
import { useStore } from '../store';
import { simMem, useComm } from '../comm';
import { asciiTextImage, projectAsciiLib } from '../fontRender';
import { asciiCellWidth } from '../../core/editing';
import { formatFixed } from '../../core/simulator';
import { parseHex } from '../../core/bytes';
import type { PreviewSpec } from '../../core/controls';
import { BinaryTextPreview } from './BinaryTextPreview';

const num = (c: ControlInstance, k: string, d = 0) => (typeof c.props[k] === 'number' ? (c.props[k] as number) : Number(c.props[k] ?? d) || d);

/** Con el simulador activo: texto, valor o icono según la memoria de variables. */
function simSpec(c: ControlInstance, base: PreviewSpec): { spec: PreviewSpec; icon?: number; hide?: boolean } {
  const m = simMem.mem;
  const vp = parseHex(c.props.vp, 0);
  switch (c.type) {
    case 'dataVar':
    case 'artVar': {
      const v = m.number(vp, num(c, 'varType'));
      return { spec: { ...base, text: formatFixed(v, num(c, 'nInt'), num(c, 'nDot'), !!c.props.zeroDisplay) + String(c.props.unit ?? '') } };
    }
    case 'text':
    case 'textII':
      return { spec: { ...base, text: m.text(vp, num(c, 'textLength', 20), num(c, 'encoding')) } };
    case 'rollText':
      return { spec: { ...base, text: m.text(vp + 3, num(c, 'textLength', 40), num(c, 'encoding')) } };
    case 'hexVar': {
      const bytes = Array.from(m.bytes(vp, num(c, 'byteNum', 2)), (x) => x.toString(16).toUpperCase().padStart(2, '0'));
      return { spec: { ...base, text: bytes.join(':') } };
    }
    case 'progressBar': {
      const v = m.number(vp, num(c, 'varType'));
      const a = num(c, 'vMin');
      const b = num(c, 'vMax', 100);
      return { spec: { ...base, value: Math.max(0, Math.min(1, (v - a) / (b - a || 1))) } };
    }
    case 'sliderShow': {
      const v = m.word(vp);
      const a = num(c, 'vBegin');
      const b = num(c, 'vEnd', 100);
      return { spec: { ...base, value: Math.max(0, Math.min(1, (v - a) / (b - a || 1))) } };
    }
    case 'iconVar':
    case 'multiLanguage': {
      const v = m.number(vp, 0);
      if (v < num(c, 'vMin') || v > num(c, 'vMax')) return { spec: base, hide: true };
      return { spec: base, icon: num(c, 'iconMin') + (v - num(c, 'vMin')) };
    }
    case 'bitIcon': {
      const on = (m.word(vp) & num(c, 'bitMask', 1)) !== 0;
      return { spec: base, icon: on ? num(c, 'icon1s') : num(c, 'icon0s') };
    }
    case 'animIcon':
      return { spec: base, icon: m.word(vp) === num(c, 'vStart') ? num(c, 'iconStart') : num(c, 'iconStop') };
    default:
      return { spec: base };
  }
}

/** Vista previa aproximada de un control dentro del lienzo. */
export function ControlPreview({ c, zoom }: { c: ControlInstance; zoom: number }) {
  const def = getDef(c.type);
  useStore((s) => s.project.icl); // vuelve a dibujar si cambian las bibliotecas
  useStore((s) => s.project.extraFiles); // y si cambian las fuentes
  const simOn = useComm((s) => s.simOn);
  const simZones = useComm((s) => s.simZones);
  useComm((s) => s.simVersion); // vuelve a dibujar cuando cambia la memoria simulada
  const sim = simOn ? simSpec(c, def.preview?.(c) ?? {}) : null;
  if (sim?.hide) return null;
  const iconKeys = ICON_PREVIEW[c.type];
  const initial = ['iconVar', 'multiLanguage'].includes(c.type) ? Math.max(0, Number(c.props.init ?? c.props.vMin ?? 0) - Number(c.props.vMin ?? 0)) : 0;
  const realIcon = iconKeys ? iclImage(Number(c.props[iconKeys[0]]), sim?.icon ?? Number(c.props[iconKeys[1]]) + initial) : null;
  if (realIcon) {
    return (
      <img
        src={realIcon.url}
        alt=""
        draggable={false}
        style={{ position: 'absolute', left: 0, top: 0, width: realIcon.width * zoom, height: realIcon.height * zoom, pointerEvents: 'none' }}
      />
    );
  }
  const spec = sim?.spec ?? def.preview?.(c) ?? {};
  // En la pantalla real las zonas táctiles no se ven: en simulación se muestran tenues (o nada, si se ocultan).
  if (simOn && def.kind === 'touch' && !simZones) return null;
  if (c.props.fskButton && def.kind === 'touch') return null; // el asistente ya dibujó su etiqueta en el fondo exportado
  const colorProp = c.props.color ?? c.props.textColor ?? c.props.showColor;
  const color = spec.color ?? (typeof colorProp === 'number' ? rgb565ToCss(colorProp) : '#ffffff');
  const w = c.w * zoom;
  const h = c.h * zoom;

  if (c.type === 'text' || c.type === 'textII') {
    const text = sim?.spec.text ?? String(c.props.init ?? '');
    return <BinaryTextPreview c={c} text={text} color={color} zoom={zoom} />;
  }

  switch (spec.style) {
    case 'button':
      return <div className="ctl-btn" style={{ fontSize: Math.max(9, Math.min(14 * zoom, h * 0.45)) }}>{spec.text}</div>;
    case 'bar': {
      const fg = typeof c.props.foreColor === 'number' ? rgb565ToCss(c.props.foreColor) : '#3dd6a5';
      const bg = typeof c.props.backColor === 'number' ? rgb565ToCss(c.props.backColor) : '#222';
      const vertical = c.props.orientation === 1;
      const v = spec.value ?? 0.5;
      return (
        <div style={{ position: 'absolute', inset: 0, background: bg, border: c.props.showBorder ? '1px solid #fff8' : 'none' }}>
          <div
            style={{
              position: 'absolute',
              left: 0,
              bottom: 0,
              width: vertical ? '100%' : `${v * 100}%`,
              height: vertical ? `${v * 100}%` : '100%',
              background: fg,
            }}
          />
        </div>
      );
    }
    case 'slider': {
      const v = spec.value ?? 0.5;
      return (
        <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', left: 6, right: 6, top: '50%', height: 4, marginTop: -2, borderRadius: 2, background: '#ffffff40' }} />
          <div style={{ position: 'absolute', left: 6, width: `calc(${v * 100}% - 12px)`, top: '50%', height: 4, marginTop: -2, borderRadius: 2, background: '#4f8cff' }} />
          <div
            style={{
              position: 'absolute',
              left: `calc(${v * 100}% - 8px)`,
              top: '50%',
              width: 16,
              height: 16,
              marginTop: -8,
              borderRadius: 8,
              background: '#fff',
              boxShadow: '0 1px 4px #0008',
            }}
          />
        </div>
      );
    }
    case 'curve': {
      const pts = Array.from({ length: 40 }, (_, i) => {
        const x = (i / 39) * w;
        const y = h / 2 - Math.sin(i / 4) * h * 0.3 - Math.sin(i / 1.7) * h * 0.06;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');
      return (
        <svg width={w} height={h} style={{ position: 'absolute', inset: 0 }}>
          <line x1={0} x2={w} y1={h / 2} y2={h / 2} stroke="#ffffff30" strokeDasharray="4 4" />
          <polyline points={pts} fill="none" stroke={color} strokeWidth={2} />
        </svg>
      );
    }
    case 'qr': {
      const n = 11;
      const cells = [];
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          const finder = (x < 3 && y < 3) || (x > n - 4 && y < 3) || (x < 3 && y > n - 4);
          if (finder || (x * 7 + y * 13 + x * y) % 3 === 0) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />);
        }
      return (
        <svg viewBox={`-1 -1 ${n + 2} ${n + 2}`} width={w} height={h} style={{ position: 'absolute', inset: 0, background: '#fff' }}>
          <g fill="#000">{cells}</g>
        </svg>
      );
    }
    case 'table': {
      const rows = Number(c.props.rows) || (spec.text ? spec.text.split('\n').length : 4);
      const cols = Number(c.props.cols) || 1;
      const lines = spec.text?.split('\n');
      return (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            gridTemplateRows: `repeat(${rows}, 1fr)`,
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
          }}
        >
          {Array.from({ length: rows * cols }, (_, i) => (
            <div
              key={i}
              style={{
                border: lines ? 'none' : '1px solid #ffffff40',
                display: 'grid',
                placeItems: 'center',
                color: '#fff',
                fontSize: Math.max(8, Math.min(14 * zoom, h / rows / 1.6)),
                opacity: lines ? (Math.abs(i - Math.floor(rows / 2)) === 0 ? 1 : 0.45) : 1,
                fontFamily: 'Consolas, monospace',
              }}
            >
              {lines?.[i] ?? ''}
            </div>
          ))}
        </div>
      );
    }
    case 'clock': {
      const r = Math.min(w, h) / 2 - 3;
      return (
        <svg width={w} height={h} style={{ position: 'absolute', inset: 0 }}>
          <circle cx={w / 2} cy={h / 2} r={r} fill="none" stroke="#ffffff50" strokeWidth={2} />
          <circle cx={w / 2} cy={h / 2} r={r * 0.6} fill="none" stroke="#ffffff20" strokeWidth={r * 0.5} strokeDasharray="2 6" />
          <line x1={w / 2} y1={h / 2} x2={w / 2 + r * 0.6} y2={h / 2 - r * 0.45} stroke="#ff8a3d" strokeWidth={3} strokeLinecap="round" />
          <circle cx={w / 2} cy={h / 2} r={4} fill="#fff" />
        </svg>
      );
    }
    case 'icon':
      return (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#ffffffb0' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <Icon name={def.icon} size={Math.max(12, Math.min(28, h * 0.45))} />
            {h > 40 && <span style={{ fontSize: 10, fontFamily: 'Segoe UI, sans-serif', whiteSpace: 'nowrap' }}>{spec.text}</span>}
          </div>
        </div>
      );
    case 'box':
      return (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            color: '#ffffffc0',
            fontSize: Math.max(9, Math.min(13 * zoom, h * 0.4)),
            fontFamily: 'Segoe UI, sans-serif',
            whiteSpace: 'nowrap',
          }}
        >
          {spec.text}
        </div>
      );
    default: {
      // Variables numéricas, RTC y HEX con la librería 0# real del proyecto
      if ((c.type === 'dataVar' || c.type === 'rtc' || c.type === 'hexVar') && spec.text) {
        const lib = projectAsciiLib(Number(c.props.fontId ?? 0));
        const img = lib && asciiTextImage(lib, spec.text, Number(c.props.fontSize) || 16, color);
        if (img) {
          const align = spec.align === 'right' ? 'right' : spec.align === 'center' ? 'center' : 'left';
          return (
            <img
              src={img.url}
              alt=""
              draggable={false}
              style={{
                position: 'absolute',
                top: 0,
                [align === 'right' ? 'right' : 'left']: align === 'center' ? (w - img.width * zoom) / 2 : 0,
                width: img.width * zoom,
                height: img.height * zoom,
                imageRendering: 'pixelated',
                pointerEvents: 'none',
              }}
            />
          );
        }
      }
      if ((c.type === 'dataVar' || c.type === 'rtc' || c.type === 'hexVar') && spec.text) {
        // Sin la librería 0#: celdas de ancho × 2·ancho alineadas arriba, como las dibuja la pantalla.
        // Los dígitos llenan la altura de la celda (≈ 90 %), sin franja vacía arriba, y se
        // estrechan en horizontal como los glifos 0#, que miden el doble de alto que de ancho.
        const cw = asciiCellWidth(c) * zoom;
        const ch2 = cw * 2;
        const font = ch2 * 1.257; // altura de mayúsculas de Arial ≈ 0,716 em → 90 % de la celda
        const squeeze = Math.min(1, (0.9 * cw) / (0.556 * font)); // ancho de dígito de Arial ≈ 0,556 em
        const justify = spec.align === 'right' ? 'flex-end' : spec.align === 'center' ? 'center' : 'flex-start';
        return (
          <>
            <div className="ctl-cells" style={{ color, justifyContent: justify }}>
              {[...spec.text].map((ch, i) => (
                <span key={i} style={{ width: cw, height: ch2, lineHeight: `${ch2}px`, fontSize: font, transform: `scaleX(${squeeze})` }}>
                  {ch}
                </span>
              ))}
            </div>
            <span className="text-preview-note" title="Vista aproximada: el proyecto no incluye la fuente 0#; se usa una fuente del sistema con el tamaño de celda real.">≈</span>
          </>
        );
      }
      const fontPx = (spec.fontPx ?? 24) * zoom;
      return (
        <>
        <div
          className="ctl-content"
          style={{
            color,
            fontSize: fontPx,
            alignItems: 'flex-start',
            padding: 0,
            justifyContent: spec.align === 'right' ? 'flex-end' : spec.align === 'center' ? 'center' : 'flex-start',
          }}
        >
          {spec.text ?? def.label}
        </div>
        {['dataVar', 'rtc', 'hexVar', 'rollText'].includes(c.type) && <span className="text-preview-note" title="Vista aproximada: falta una fuente compatible o este formato todavía no tiene representación con sus glifos reales.">≈ Vista aproximada</span>}
        </>
      );
    }
  }
}
