// Comunicación con PLC y Modbus (equivale a TOOL/modbus/PLC_Config de V7.651).
import { useState } from 'react';
import { AlertTriangle, Plus } from 'lucide-react';
import { checkPlcConfig, defaultPlcConfig, PLC_BAUDS, PLC_MODES, PLC_PORTS, READ_CODES, WRITE_CODES, type ModbusEnterItem, type ModbusItem, type PlcConfig } from '../../core/modbus';
import { useStore } from '../store';

const h4 = (n: number) => n.toString(16).toUpperCase().padStart(4, '0');
const h2 = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');

const FUNC_LABEL: Record<number, string> = {
  0x01: '01 bobinas',
  0x02: '02 entradas',
  0x03: '03 registros',
  0x04: '04 reg. entrada',
  0x05: '05 una bobina',
  0x06: '06 un registro',
  0x0f: '0F bobinas',
  0x10: '10 registros',
};

/** Campo hexadecimal que deja escribir libremente y guarda el número al ser válido. */
function Hex({ value, onChange, width = 64 }: { value: number; onChange: (v: number) => void; width?: number }) {
  const [text, setText] = useState(h4(value));
  return (
    <input
      className={`field mono ${/^[0-9A-F]{1,4}$/.test(text) ? '' : 'invalid'}`}
      style={{ width }}
      value={text}
      onChange={(e) => {
        const t = e.target.value.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 4);
        setText(t);
        if (t) onChange(parseInt(t, 16));
      }}
    />
  );
}

const Int = ({ value, onChange, max = 255, width = 64, disabled }: { value: number; onChange: (v: number) => void; max?: number; width?: number; disabled?: boolean }) => (
  <input className="field" type="number" min={0} max={max} style={{ width }} value={value} disabled={disabled} onChange={(e) => onChange(Math.max(0, Math.min(max, Number(e.target.value) || 0)))} />
);

function ItemTable<T extends ModbusItem>({ title, items, codes, enter, onChange, add }: { title: string; items: T[]; codes: number[]; enter?: boolean; onChange: (items: T[]) => void; add: () => T }) {
  const set = (i: number, patch: Partial<ModbusItem & ModbusEnterItem>) =>
    onChange(
      items.map((x, k) => {
        if (k !== i) return x;
        const next = { ...x, ...patch };
        if (next.cmd === 5 || next.cmd === 6) next.length = 1;
        return next;
      }),
    );
  return (
    <div className="modbus-block">
      <div className="modbus-head">
        <b>{title}</b>
        <button className="btn outline small" onClick={() => onChange([...items, add()])}>
          <Plus size={13} /> Añadir
        </button>
      </div>
      {items.length > 0 && (
        <div className="modbus-scroll">
        <table className="watch">
          <thead>
            <tr>
              {enter && <th>Página</th>}
              {enter && <th>VP vigilado</th>}
              <th>Esclavo</th>
              <th>Función</th>
              <th>Registro</th>
              <th>Longitud</th>
              <th>VP</th>
              <th>Espera</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                {enter && (
                  <td>
                    <Int value={(it as unknown as ModbusEnterItem).page} max={4091} onChange={(v) => set(i, { page: v })} />
                  </td>
                )}
                {enter && (
                  <td>
                    <Hex value={(it as unknown as ModbusEnterItem).monitorVp} onChange={(v) => set(i, { monitorVp: v })} />
                  </td>
                )}
                <td>
                  <Int value={it.id} onChange={(v) => set(i, { id: v })} width={56} />
                </td>
                <td>
                  <select className="field" value={it.cmd} onChange={(e) => set(i, { cmd: Number(e.target.value) })}>
                    {codes.map((c) => (
                      <option key={c} value={c}>
                        {FUNC_LABEL[c] ?? h2(c)}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <Hex value={it.register} onChange={(v) => set(i, { register: v })} />
                </td>
                <td>
                  <Int value={it.length} onChange={(v) => set(i, { length: v })} width={56} disabled={it.cmd === 5 || it.cmd === 6} />
                </td>
                <td>
                  <Hex value={it.vp} onChange={(v) => set(i, { vp: v })} />
                </td>
                <td>
                  <Int value={it.timeout} onChange={(v) => set(i, { timeout: v })} width={56} />
                </td>
                <td>
                  <button className="btn icon" title="Quitar" onClick={() => onChange(items.filter((_, k) => k !== i))}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}

export function ModbusDialog({ onClose }: { onClose: () => void }) {
  const saved = useStore.getState().project.modbus;
  const [on, setOn] = useState(!!saved);
  const [cfg, setCfg] = useState<PlcConfig>(() => structuredClone(saved ?? defaultPlcConfig()));
  const set = (patch: Partial<PlcConfig>) => setCfg((c) => ({ ...c, ...patch }));
  const problems = on ? checkPlcConfig(cfg) : [];
  const newItem = (cmd: number): ModbusItem => ({ id: 1, cmd, register: 0, length: 1, vp: 0x5000, timeout: 50 });
  const save = () => {
    useStore.getState().mutate((d) => {
      d.modbus = on ? cfg : undefined;
    });
    onClose();
  };
  const plc = cfg.mode >= 4 && cfg.mode <= 9;
  return (
    <div className="overlay" onPointerDown={onClose}>
      <div className="dialog wide modbus-dialog" onPointerDown={(e) => e.stopPropagation()}>
        <h2>Comunicación PLC / Modbus</h2>
        <div className="sub">
          La pantalla habla directamente con un PLC o con equipos Modbus RTU por otro puerto serie, sin MCU. Se guarda dentro de 22_Config.bin, igual que TOOL/modbus/PLC_Config.
        </div>
        <div className="body">
          <label className="chk">
            <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} /> Usar comunicación PLC / Modbus en este proyecto
          </label>
          {on && (
            <>
              <div className="modbus-grid">
                <label>
                  Modo
                  <select className="field" value={cfg.mode} onChange={(e) => set({ mode: Number(e.target.value) })}>
                    {PLC_MODES.map((m, i) => (
                      <option key={i} value={i}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Puerto de la pantalla
                  <select className="field" value={cfg.port} onChange={(e) => set({ port: Number(e.target.value) })}>
                    {PLC_PORTS.map((p) => (
                      <option key={p} value={p}>
                        COM{p}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Baudios
                  <select className="field" value={cfg.baud} onChange={(e) => set({ baud: Number(e.target.value) })}>
                    {[...new Set([...PLC_BAUDS, cfg.baud])].map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </label>
                {(cfg.mode === 1 || plc) && (
                  <label>
                    Separación entre comandos (ms)
                    <Int value={cfg.spanTime} max={65535} onChange={(v) => set({ spanTime: v })} width={90} />
                  </label>
                )}
              </div>

              {cfg.mode === 1 && (
                <>
                  <ItemTable title="Lectura cíclica (PLC → VP)" items={cfg.read} codes={READ_CODES} onChange={(read) => set({ read })} add={() => newItem(3)} />
                  <ItemTable title="Escritura (VP → equipo, al cambiar el valor)" items={cfg.write} codes={WRITE_CODES} onChange={(write) => set({ write })} add={() => newItem(6)} />
                  <ItemTable
                    title="Al entrar a una página"
                    items={cfg.enter}
                    codes={WRITE_CODES}
                    enter
                    onChange={(enter) => set({ enter })}
                    add={() => ({ ...newItem(6), page: 0, monitorVp: 0x5000 })}
                  />
                </>
              )}

              {plc && (
                <div className="modbus-block">
                  <div className="modbus-grid">
                    <label>
                      Máximo de palabras por comando
                      <Int value={cfg.plcMaxWords} max={65535} onChange={(v) => set({ plcMaxWords: v })} width={90} />
                    </label>
                    <label>
                      Tiempo de respuesta (ms)
                      <Int value={cfg.respondTime} max={65535} onChange={(v) => set({ respondTime: v })} width={90} />
                    </label>
                    <label>
                      Reintentos
                      <Int value={cfg.retryTimes} max={65535} onChange={(v) => set({ retryTimes: v })} width={90} />
                    </label>
                  </div>
                  <table className="watch">
                    <thead>
                      <tr>
                        <th>Área del PLC</th>
                        <th>VP inicial</th>
                        <th>Cantidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cfg.areas.map((a, i) => (
                        <tr key={i}>
                          <td>{cfg.mode === 4 ? ['X', 'Y', 'M', 'D'][i] : `Área ${i + 1}`}</td>
                          <td>
                            <Hex value={a.vp} onChange={(v) => set({ areas: cfg.areas.map((x, k) => (k === i ? { ...x, vp: v } : x)) })} />
                          </td>
                          <td>
                            <Int value={a.count} max={65535} onChange={(v) => set({ areas: cfg.areas.map((x, k) => (k === i ? { ...x, count: v } : x)) })} width={90} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {cfg.mode === 10 && (
                <div className="modbus-grid">
                  <label>
                    VP de solo lectura
                    <Hex value={cfg.slave.roVp} onChange={(v) => set({ slave: { ...cfg.slave, roVp: v } })} />
                  </label>
                  <label>
                    Cantidad
                    <Int value={cfg.slave.roCount} max={65535} onChange={(v) => set({ slave: { ...cfg.slave, roCount: v } })} width={90} />
                  </label>
                  <label>
                    VP de lectura y escritura
                    <Hex value={cfg.slave.rwVp} onChange={(v) => set({ slave: { ...cfg.slave, rwVp: v } })} />
                  </label>
                  <label>
                    Cantidad
                    <Int value={cfg.slave.rwCount} max={65535} onChange={(v) => set({ slave: { ...cfg.slave, rwCount: v } })} width={90} />
                  </label>
                </div>
              )}

              {problems.map((p, i) => (
                <div key={i} className="msg warn">
                  <AlertTriangle size={14} /> {p}
                </div>
              ))}
              <div className="muted-txt">Sin probar en hardware: compruebe la comunicación con su PLC antes de usarla en producción.</div>
            </>
          )}
        </div>
        <div className="foot">
          <button className="btn outline" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={save}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
