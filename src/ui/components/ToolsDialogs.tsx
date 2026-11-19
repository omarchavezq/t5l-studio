import { useMemo, useState } from 'react';
import { AlertTriangle, Search } from 'lucide-react';
import { findVp } from '../../core/editing';
import { encodeFreeValue, type FreeInitValue, type FreeValueType } from '../../core/build';
import { UNVERIFIED_CODES, keyboardLayout, keyboardArea, type KeyboardKind } from '../../core/keyboard';
import { toHex } from '../../core/bytes';
import type { Project } from '../../core/types';
import { addPagesFrom, createKeyboardFor } from '../actions';
import { useStore } from '../store';
import { closeDialog, useUi } from '../uiState';
import { ModbusDialog } from './ModbusDialog';
import { NetworkDialog } from './NetworkDialog';
import { LanguageDialog } from './LanguageDialog';
import { VideoDialog } from './VideoDialog';
import { AudioDialog } from './AudioDialog';
import { FskDialog } from './FskDialog';

function Dialog({ title, sub, onClose, children, foot }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode; foot: React.ReactNode }) {
  return (
    <div className="overlay" onPointerDown={onClose}>
      <div className="dialog" onPointerDown={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {sub && <div className="sub">{sub}</div>}
        <div className="body">{children}</div>
        <div className="foot">{foot}</div>
      </div>
    </div>
  );
}

const Num = ({ label, value, onChange, min = 0 }: { label: string; value: number; onChange: (v: number) => void; min?: number }) => (
  <label>
    {label}
    <input className="field" type="number" min={min} value={value} onChange={(e) => onChange(Number(e.target.value))} />
  </label>
);

// ------------------------------------------------------------------ Array

export function ArrayDialog({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState(1);
  const [cols, setCols] = useState(4);
  const [gapX, setGapX] = useState(8);
  const [gapY, setGapY] = useState(8);
  const [vpStep, setVpStep] = useState(1);
  const total = rows * cols - 1;
  const apply = () => {
    if (total < 1) return;
    useStore.getState().addArray({ rows, cols, gapX, gapY, vpStep });
    onClose();
  };
  return (
    <Dialog
      title="Array de controles"
      sub="Copia el control seleccionado en filas y columnas, como «Array» de V7.651. Cada copia puede usar la siguiente dirección VP."
      onClose={onClose}
      foot={
        <>
          <button className="btn outline" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={total < 1} onClick={apply}>
            Crear {total} copias
          </button>
        </>
      }
    >
      <div className="row2">
        <Num label="Filas" value={rows} onChange={setRows} min={1} />
        <Num label="Columnas" value={cols} onChange={setCols} min={1} />
      </div>
      <div className="row2">
        <Num label="Separación horizontal (px)" value={gapX} onChange={setGapX} />
        <Num label="Separación vertical (px)" value={gapY} onChange={setGapY} />
      </div>
      <Num label="Incremento de VP por copia (palabras, 0 = misma VP)" value={vpStep} onChange={setVpStep} />
    </Dialog>
  );
}

// ------------------------------------------------------------------ Buscar VP

export function FindVpDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project);
  const [q, setQ] = useState('');
  const hits = useMemo(() => findVp(project, q), [project, q]);
  const go = (pageId: number, id: string) => {
    const s = useStore.getState();
    s.selectPage(pageId);
    s.select([id]);
    onClose();
  };
  return (
    <Dialog
      title="Buscar VP"
      sub="Escriba una dirección (p. ej. 5003) para ver qué controles la usan, también dentro de textos y variables de varias palabras."
      onClose={onClose}
      foot={
        <button className="btn outline" onClick={onClose}>
          Cerrar
        </button>
      }
    >
      <div className="search" style={{ margin: 0 }}>
        <Search size={14} />
        <input autoFocus placeholder="Dirección en hexadecimal…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="profile-list">
        {q && !hits.length && <div className="muted-txt" style={{ padding: 8 }}>Ningún control usa esa dirección.</div>}
        {hits.map((h) => (
          <button key={h.controlId + h.field} className="profile-row" onClick={() => go(h.pageId, h.controlId)}>
            <span className="profile-name">{h.control}</span>
            <span className="profile-meta">
              {h.field} · 0x{toHex(h.vp)}
              {h.words > 1 ? `–0x${toHex(h.vp + h.words - 1)}` : ''}
            </span>
            <span className="profile-badge">Pág. {h.pageId}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ Importar páginas

export function ImportPagesDialog({ source, onClose }: { source: Project; onClose: () => void }) {
  const [sel, setSel] = useState<number[]>(source.pages.map((p) => p.id));
  const toggle = (id: number) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <Dialog
      title={`Importar páginas de «${source.name}»`}
      sub="Las páginas se añaden con su fondo y controles. Si un número ya existe, se usa uno libre y se actualizan los saltos entre ellas."
      onClose={onClose}
      foot={
        <>
          <button className="btn outline" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn primary"
            disabled={!sel.length}
            onClick={() => {
              addPagesFrom(source, sel);
              onClose();
            }}
          >
            Importar {sel.length}
          </button>
        </>
      }
    >
      <div className="profile-list">
        {source.pages.map((p) => (
          <label key={p.id} className="profile-row" style={{ cursor: 'pointer' }}>
            <span className="profile-name">
              <input type="checkbox" checked={sel.includes(p.id)} onChange={() => toggle(p.id)} /> {p.id} · {p.name}
            </span>
            <span className="profile-meta">{p.controls.length} controles</span>
            <span />
          </label>
        ))}
      </div>
      {(source.settings.width !== useStore.getState().project.settings.width || source.settings.height !== useStore.getState().project.settings.height) && (
        <div className="msg warn">
          <AlertTriangle size={14} /> El otro proyecto es de {source.settings.width}×{source.settings.height}; revise posiciones y fondos.
        </div>
      )}
    </Dialog>
  );
}

// ------------------------------------------------------------------ Teclado

export function KeyboardDialog({ controlId, onClose }: { controlId: string; onClose: () => void }) {
  const control = useStore((s) => s.project.pages.find((p) => p.id === s.pageId)?.controls.find((c) => c.id === controlId));
  const { width, height } = useStore((s) => s.project.settings);
  const [kind, setKind] = useState<KeyboardKind>(control?.type === 'dataInput' ? 'numerico' : 'alfanumerico');
  const [enie, setEnie] = useState(false);
  const [decimal, setDecimal] = useState(Number(control?.props.nDot ?? 0) > 0);
  const keys = useMemo(() => keyboardLayout(kind, keyboardArea(kind, width, height), { enie, decimal }), [kind, width, height, enie, decimal]);
  const unverified = keys.filter((k) => UNVERIFIED_CODES.has(k.code)).map((k) => k.label);
  if (!control) return null;
  return (
    <Dialog
      title="Crear teclado"
      sub={`Crea una página de teclado y la enlaza a «${control.name}». En la pantalla, al tocar la entrada aparece el teclado y OK guarda el valor.`}
      onClose={onClose}
      foot={
        <>
          <button className="btn outline" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn primary"
            onClick={() => {
              createKeyboardFor(controlId, kind, { enie, decimal });
              onClose();
            }}
          >
            Crear y enlazar
          </button>
        </>
      }
    >
      <label>
        Tipo de teclado
        <select className="field" value={kind} onChange={(e) => setKind(e.target.value as KeyboardKind)}>
          <option value="numerico">Numérico (códigos probados en su pantalla)</option>
          <option value="hex">Hexadecimal</option>
          <option value="alfanumerico">Alfanumérico (letras, números y espacio)</option>
        </select>
      </label>
      {kind === 'numerico' && (
        <label className="chk">
          <input type="checkbox" checked={decimal} onChange={(e) => setDecimal(e.target.checked)} /> Añadir punto decimal y signo menos
        </label>
      )}
      {kind === 'alfanumerico' && (
        <label className="chk">
          <input type="checkbox" checked={enie} onChange={(e) => setEnie(e.target.checked)} /> Añadir la Ñ (necesita una fuente Latín-1)
        </label>
      )}
      <div className="kb-preview" style={{ aspectRatio: `${width} / ${Math.round(height * 0.5)}` }}>
        {(() => {
          const a = keyboardArea(kind, width, height);
          return keys.map((k) => (
            <div
              key={k.label + k.x + k.y}
              className={`kb-key ${UNVERIFIED_CODES.has(k.code) ? 'unverified' : ''}`}
              style={{ left: `${((k.x - a.x) / a.w) * 100}%`, top: `${((k.y - a.y) / a.h) * 100}%`, width: `${(k.w / a.w) * 100}%`, height: `${(k.h / a.h) * 100}%` }}
            >
              {k.label}
            </div>
          ));
        })()}
      </div>
      {unverified.length > 0 && (
        <div className="msg warn">
          <AlertTriangle size={14} /> Teclas según el manual, sin probar en su pantalla: {unverified.join(', ')}. Compruébelas antes de usarlas en producción.
        </div>
      )}
    </Dialog>
  );
}

/** Muestra el diálogo de herramientas activo. */
export function ToolDialogs() {
  const d = useUi((s) => s.dialog);
  if (!d) return null;
  if (d.kind === 'findVp') return <FindVpDialog onClose={closeDialog} />;
  if (d.kind === 'importPages') return <ImportPagesDialog source={d.source} onClose={closeDialog} />;
  if (d.kind === 'initValues') return <InitValuesDialog onClose={closeDialog} />;
  if (d.kind === 'modbus') return <ModbusDialog onClose={closeDialog} />;
  if (d.kind === 'network') return <NetworkDialog onClose={closeDialog} />;
  if (d.kind === 'languages') return <LanguageDialog onClose={closeDialog} />;
  if (d.kind === 'video') return <VideoDialog onClose={closeDialog} />;
  if (d.kind === 'audio') return <AudioDialog onClose={closeDialog} />;
  if (d.kind === 'fsk') return <FskDialog onClose={closeDialog} />;
  return <KeyboardDialog controlId={d.controlId} onClose={closeDialog} />;
}

// ------------------------------------------------------------------ valores iniciales libres

const FREE_TYPES: { value: FreeValueType; label: string }[] = [
  { value: 'int16', label: 'int16' },
  { value: 'uint16', label: 'uint16' },
  { value: 'int32', label: 'int32' },
  { value: 'uint32', label: 'uint32' },
  { value: 'float', label: 'float' },
  { value: 'text', label: 'texto' },
  { value: 'hex', label: 'bytes hex' },
];

export function InitValuesDialog({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<FreeInitValue[]>(() => structuredClone(useStore.getState().project.initValues ?? []));
  const set = (i: number, patch: Partial<FreeInitValue>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const valid = (v: FreeInitValue) => /^[0-9A-Fa-f]{1,4}$/.test(v.vp) && !!encodeFreeValue(v);
  const save = () => {
    useStore.getState().mutate((d) => {
      d.initValues = rows.filter((r) => r.vp.trim() !== '');
    });
    onClose();
  };
  return (
    <div className="overlay" onPointerDown={onClose}>
      <div className="dialog wide" onPointerDown={(e) => e.stopPropagation()}>
        <h2>Valores iniciales libres</h2>
        <div className="sub">Valores que la pantalla carga al encender (archivo 22) aunque no pertenezcan a ningún control, como hacía TOOL/22.exe. Mandan sobre los valores iniciales de los controles. La pantalla carga 0x2000–0xFFFF.</div>
        <div className="body">
          <table className="watch">
            <thead>
              <tr>
                <th>VP</th>
                <th>Tipo</th>
                <th>Valor</th>
                <th>Nota</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>
                    <input className={`field mono ${valid(r) ? '' : 'invalid'}`} style={{ width: 70 }} value={r.vp} onChange={(e) => set(i, { vp: e.target.value.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 4) })} />
                  </td>
                  <td>
                    <select className="field" value={r.type} onChange={(e) => set(i, { type: e.target.value as FreeValueType })}>
                      {FREE_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input className={`field ${valid(r) ? '' : 'invalid'}`} value={r.value} onChange={(e) => set(i, { value: e.target.value })} />
                  </td>
                  <td>
                    <input className="field" value={r.note ?? ''} onChange={(e) => set(i, { note: e.target.value })} />
                  </td>
                  <td>
                    <button className="btn icon" onClick={() => setRows((x) => x.filter((_, k) => k !== i))} title="Quitar">
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn outline" onClick={() => setRows((x) => [...x, { vp: '6000', type: 'uint16', value: '0' }])}>
            Añadir valor
          </button>
          {rows.some((r) => parseInt(r.vp || '0', 16) < 0x2000) && (
            <div className="msg warn">
              <AlertTriangle size={14} /> Hay direcciones por debajo de 0x2000: según la guía DGUS II la pantalla no las carga desde el 22.
            </div>
          )}
        </div>
        <div className="foot">
          <button className="btn outline" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={!rows.every(valid)} onClick={save}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
