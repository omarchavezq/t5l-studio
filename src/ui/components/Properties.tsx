import { useEffect, useMemo, useState } from 'react';
import { Binary, ChevronDown, ChevronRight, CircleHelp, Lock, MousePointer2 } from 'lucide-react';
import { getDef, hasDef, type FieldDef } from '../../core/controls';
import { cssToRgb565, hexDump, rgb565ToCss, toHex } from '../../core/bytes';
import type { ControlInstance, PropValue } from '../../core/types';
import { usePage, useStore } from '../store';
import { openDialog } from '../uiState';
import { Keyboard, Maximize2 } from 'lucide-react';
import { fitAsciiBox } from '../../core/editing';
import { projectProfile } from '../../core/profiles';
import { Icon } from './Icon';

export function Properties() {
  const page = usePage();
  const selection = useStore((s) => s.selection);
  const selected = page?.controls.filter((c) => selection.includes(c.id)) ?? [];

  return (
    <section className="props">
      <div className="panel-head">Propiedades</div>
      <div className="panel-body">
        {selected.length === 0 && <NothingSelected />}
        {selected.length > 1 && <MultiProps selected={selected} />}
        {selected.length === 1 && <ControlProps c={selected[0]} />}
      </div>
    </section>
  );
}

function NothingSelected() {
  return (
    <div className="empty-state">
      <MousePointer2 size={22} />
      <div className="big">Nada seleccionado</div>
      Haga clic en un control del lienzo para editarlo.
      <div className="shortcuts">
        <span>
          <span className="kbd">Ctrl</span>+<span className="kbd">Z</span>
        </span>
        <span>Deshacer</span>
        <span>
          <span className="kbd">Ctrl</span>+<span className="kbd">D</span>
        </span>
        <span>Duplicar</span>
        <span>
          <span className="kbd">←↑→↓</span>
        </span>
        <span>Mover 1 px (Mayús: 10 px)</span>
        <span>
          <span className="kbd">Alt</span>
        </span>
        <span>Arrastrar sin ajustar a la rejilla</span>
        <span>
          <span className="kbd">Ctrl</span>+<span className="kbd">B</span>
        </span>
        <span>Compilar</span>
        <span>
          <span className="kbd">F5</span>
        </span>
        <span>Generar para pantalla</span>
      </div>
    </div>
  );
}

function ControlProps({ c }: { c: ControlInstance }) {
  const st = useStore.getState;
  const settings = useStore((s) => s.project.settings);
  const pageId = useStore((s) => s.pageId);
  const [closed, setClosed] = useState<Record<string, boolean>>({ Avanzado: true });
  const [showBytes, setShowBytes] = useState(false);

  const def = hasDef(c.type) ? getDef(c.type) : null;
  const profileId = useStore((x) => x.project.settings.profileId);
  const textIIScale = useMemo(() => projectProfile(useStore.getState().project).firmware.escalaTextoII, [profileId]);

  const groups = useMemo(() => {
    const m = new Map<string, FieldDef[]>();
    for (const f of def?.fields ?? []) {
      if (f.showIf && !f.showIf(c.props)) continue;
      const g = f.group ?? 'General';
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(f);
    }
    return [...m.entries()];
  }, [def, c.props]);

  const bytes = useMemo(() => {
    if (!showBytes || !def) return '';
    try {
      return hexDump(def.encode(c, { width: settings.width, height: settings.height, pageId, keyingIndex: { n: 0 } }));
    } catch (e) {
      return String(e);
    }
  }, [showBytes, c, def, settings, pageId]);

  if (!def) return <div className="empty-state">Tipo desconocido: {c.type}</div>;

  const geom = (k: 'x' | 'y' | 'w' | 'h', v: number) => st().updateControl(c.id, { [k]: Math.max(k === 'w' || k === 'h' ? 4 : 0, v) }, `geom-${c.id}-${k}`);

  return (
    <>
      <div className="props-header">
        <span className={`tb-icon ${def.kind}`}>
          <Icon name={def.icon} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <input className="name" value={c.name} onChange={(e) => st().updateControl(c.id, { name: e.target.value }, `name-${c.id}`)} />
          <div className="desc">
            {def.label} · {def.kind === 'touch' ? 'táctil (13)' : def.kind === 'knob' ? 'perilla (120.lib)' : 'visualización (14)'}
            {c.locked && (
              <>
                {' '}
                · <Lock size={10} /> bloqueado
              </>
            )}
          </div>
        </div>
      </div>
      {(c.type === 'rawDisplay' || c.type === 'rawTouch') && (
        <div className="muted-txt" style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
          {c.type === 'rawDisplay'
            ? 'Bloque original de un tipo que T5L Studio aún no sabe editar. Se exporta tal cual: moverlo o redimensionarlo aquí no cambia lo que muestra la pantalla.'
            : 'Bloque táctil original de un tipo que T5L Studio aún no sabe editar. Solo se actualizan su página y su zona; el resto se exporta tal cual.'}
        </div>
      )}
      {['dataInput', 'textInput', 'gbkInput'].includes(c.type) && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
          <button className="btn outline" style={{ width: '100%' }} onClick={() => openDialog({ kind: 'keyboard', controlId: c.id })}>
            <Keyboard size={15} /> {c.props.kbSource === 1 ? `Teclado en la página ${c.props.picKb} · crear otro…` : 'Crear teclado y enlazar…'}
          </button>
        </div>
      )}
      {fitAsciiBox(c) && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
          <button className="btn outline" style={{ width: '100%' }} onClick={() => st().updateControl(c.id, fitAsciiBox(c)!)}>
            <Maximize2 size={15} /> Ajustar recuadro al texto ({fitAsciiBox(c)!.w}×{fitAsciiBox(c)!.h})
          </button>
        </div>
      )}
      <div className="geom">
        {(['x', 'y', 'w', 'h'] as const).map((k) => (
          <label key={k}>
            {k === 'w' ? 'Ancho' : k === 'h' ? 'Alto' : k.toUpperCase()}
            <NumberInput value={c[k]} min={0} max={k === 'x' || k === 'w' ? settings.width : settings.height} onChange={(v) => geom(k, v)} />
          </label>
        ))}
      </div>
      {groups.map(([g, fields]) => (
        <div className="prop-group" key={g}>
          <button className="prop-group-title" onClick={() => setClosed((s) => ({ ...s, [g]: !s[g] }))}>
            {closed[g] ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
            {g}
          </button>
          {!closed[g] &&
            fields.map((f) => (
              <div className="prop-row" key={f.key}>
                <label title={f.help}>
                  {f.label}
                  {f.help && <CircleHelp size={12} className="help" />}
                </label>
                {c.type === 'textII' && f.key === 'fontHeight' && !textIIScale ? (
                  <span className="muted-txt" title="El perfil de pantalla indica que el firmware no escala el Texto DGUS II">100 % (sin escala en este perfil)</span>
                ) : (
                  <FieldEditor f={f} value={c.props[f.key] ?? f.default} onChange={(v) => st().setProp(c.id, f.key, v)} />
                )}
              </div>
            ))}
        </div>
      ))}
      <div className="prop-group">
        <button className="prop-group-title" onClick={() => setShowBytes((v) => !v)}>
          {showBytes ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <Binary size={13} /> Bytes generados
        </button>
        {showBytes && (
          <pre style={{ margin: 0, padding: '4px 12px 12px', fontSize: 11, color: 'var(--text-2)', overflowX: 'auto' }}>
            {bytes}
            {'\n\n'}Clase original: {def.legacy}
          </pre>
        )}
      </div>
    </>
  );
}

function FieldEditor({ f, value, onChange }: { f: FieldDef; value: PropValue; onChange: (v: PropValue) => void }) {
  const pages = useStore((s) => s.project.pages);
  switch (f.type) {
    case 'bool':
      return <button className={`switch ${value ? 'on' : ''}`} onClick={() => onChange(!value)} aria-pressed={!!value} />;
    case 'enum':
      return (
        <select className="field" value={Number(value)} onChange={(e) => onChange(Number(e.target.value))}>
          {f.options!.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case 'page':
      return (
        <select className="field" value={Number(value)} onChange={(e) => onChange(Number(e.target.value))}>
          <option value={-1}>— Ninguna —</option>
          {pages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id} · {p.name}
            </option>
          ))}
          {Number(value) >= 0 && !pages.some((p) => p.id === Number(value)) && <option value={Number(value)}>{Number(value)} (no existe)</option>}
        </select>
      );
    case 'color': {
      const n = Number(value) || 0;
      return (
        <div className="field-wrap">
          <label className="color-swatch" style={{ background: rgb565ToCss(n) }}>
            <input type="color" value={rgb565ToCss(n)} onChange={(e) => onChange(cssToRgb565(e.target.value))} />
          </label>
          <HexInput value={toHex(n)} onChange={(h) => onChange(parseInt(h || '0', 16) & 0xffff)} title="Color RGB565" />
        </div>
      );
    }
    case 'vp':
      return <HexInput value={String(value)} onChange={onChange} prefix="0x" />;
    case 'hex':
      return <input className="field mono" value={String(value)} placeholder="5A A5 …" onChange={(e) => onChange(e.target.value.toUpperCase())} />;
    case 'text':
      return <input className="field" value={String(value)} onChange={(e) => onChange(e.target.value)} />;
    default:
      return <NumberInput value={Number(value)} min={f.min} max={f.max} onChange={onChange} suffix={f.type === 'percent' ? '%' : undefined} />;
  }
}

function HexInput({ value, onChange, prefix, title }: { value: string; onChange: (v: string) => void; prefix?: string; title?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const valid = /^[0-9a-fA-F]{1,4}$/.test(text);
  return (
    <div className="field-wrap" title={title}>
      {prefix && <span className="field-prefix">{prefix}</span>}
      <input
        className={`field mono ${valid ? '' : 'invalid'}`}
        value={text}
        maxLength={4}
        onChange={(e) => {
          const t = e.target.value.replace(/^0x/i, '').toUpperCase();
          setText(t);
          if (/^[0-9A-F]{1,4}$/.test(t)) onChange(t.padStart(4, '0'));
        }}
        onBlur={() => setText(value)}
      />
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = (t: string) => {
    const n = Number(t);
    if (t.trim() === '' || !Number.isFinite(n)) return false;
    let v = Math.trunc(n);
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    onChange(v);
    return true;
  };
  return (
    <div className="field-wrap">
      <input
        className="field"
        inputMode="numeric"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          commit(e.target.value);
        }}
        onBlur={() => setText(String(value))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            e.stopPropagation();
            const step = e.shiftKey ? 10 : 1;
            commit(String(value + (e.key === 'ArrowUp' ? step : -step)));
          }
        }}
      />
      {suffix && <span className="field-prefix">{suffix}</span>}
    </div>
  );
}

/** Varios controles: si son del mismo tipo, sus propiedades comunes se editan a la vez. */
function MultiProps({ selected }: { selected: ControlInstance[] }) {
  const st = useStore.getState;
  const types = new Set(selected.map((c) => c.type));
  const same = types.size === 1 && hasDef(selected[0].type) ? getDef(selected[0].type) : null;
  const allLocked = selected.every((c) => c.locked);
  return (
    <>
      <div className="props-header">
        <MousePointer2 size={18} />
        <div>
          <div className="title">{selected.length} controles seleccionados</div>
          <div className="desc">{same ? `Todos son «${same.label}»: los cambios se aplican a todos.` : 'Tipos distintos: use alinear, igualar o distribuir en la barra del lienzo.'}</div>
        </div>
      </div>
      <div style={{ padding: '8px 12px', display: 'flex', gap: 6, borderBottom: '1px solid var(--border)' }}>
        <button className="btn outline" style={{ flex: 1 }} onClick={() => st().lockSelection(!allLocked)}>
          {allLocked ? 'Desbloquear todos' : 'Bloquear todos'}
        </button>
      </div>
      {same &&
        same.fields
          .filter((f) => f.type !== 'vp' && f.key !== 'init')
          .map((f) => {
            const values = new Set(selected.map((c) => JSON.stringify(c.props[f.key] ?? f.default)));
            return (
              <div className="prop-row" key={f.key}>
                <label title={values.size > 1 ? 'Valores distintos' : f.help}>
                  {f.label}
                  {values.size > 1 && <span className="muted-txt"> (varios)</span>}
                </label>
                <FieldEditor f={f} value={selected[0].props[f.key] ?? f.default} onChange={(v) => st().setPropMany(f.key, v)} />
              </div>
            );
          })}
    </>
  );
}
