import { BAUD_RATES, checkCfg, type CfgModel } from '../../core/cfg';

const Toggle = ({ label, value, onChange, help }: { label: string; value: boolean; onChange: (v: boolean) => void; help?: string }) => (
  <label className="chk" title={help}>
    <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} /> {label}
  </label>
);

/** Campo opcional: desmarcado = se conserva lo que traiga la pantalla o el CFG importado. */
function Optional({ label, value, onChange, min, max, unit, def }: { label: string; value: number | null; onChange: (v: number | null) => void; min: number; max: number; unit?: string; def: number }) {
  return (
    <label>
      <span className="chk">
        <input type="checkbox" checked={value != null} onChange={(e) => onChange(e.target.checked ? def : null)} /> {label}
      </span>
      {value != null ? (
        <span className="field-wrap">
          <input className="field" type="number" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
          {unit && <span className="field-prefix">{unit}</span>}
        </span>
      ) : (
        <span className="muted-txt">Sin cambiar (valor de fábrica)</span>
      )}
    </label>
  );
}

/** Editor de T5LCFG.CFG con los campos documentados en la guía DGUS II. */
export function CfgEditor({ value, onChange }: { value: CfgModel; onChange: (m: CfgModel) => void }) {
  const set = <K extends keyof CfgModel>(k: K, v: CfgModel[K]) => onChange({ ...value, [k]: v });
  const errors = checkCfg(value);
  return (
    <div className="cfg-editor">
      <div className="cfg-group">
        <b>General</b>
        <label>
          Orientación
          <select className="field" value={value.rotation} onChange={(e) => set('rotation', Number(e.target.value) as CfgModel['rotation'])}>
            {[0, 90, 180, 270].map((n) => (
              <option key={n} value={n}>
                {n}°
              </option>
            ))}
          </select>
        </label>
        <Toggle label="Cargar valores iniciales (22) al encender" value={value.loadInit} onChange={(v) => set('loadInit', v)} />
        <Toggle label="Subir datos táctiles automáticamente al MCU" value={value.autoUpload} onChange={(v) => set('autoUpload', v)} />
        <Toggle label="Sonido al tocar" value={value.touchSound} onChange={(v) => set('touchSound', v)} />
        <Toggle label="Música (WAE) en lugar del zumbador" value={value.music} onChange={(v) => set('music', v)} />
        {value.music && (
          <label>
            Archivo WAE de música (número)
            <input className="field" type="number" min={0} max={255} value={value.waeId} onChange={(e) => set('waeId', Number(e.target.value))} />
          </label>
        )}
      </div>
      <div className="cfg-group">
        <b>Comunicación</b>
        <label>
          Baudios
          <select className="field" value={value.baud} onChange={(e) => set('baud', Number(e.target.value))}>
            {[...new Set([...BAUD_RATES, value.baud])].sort((a, b) => a - b).map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <Toggle label="CRC en las tramas" value={value.crc} onChange={(v) => set('crc', v)} help="El MCU y el puerto serie de T5L Studio deben usar el mismo ajuste." />
      </div>
      <div className="cfg-group">
        <b>Retroiluminación</b>
        <label>
          Brillo: {value.brightness} %
          <input type="range" min={0} max={100} value={value.brightness} onChange={(e) => set('brightness', Number(e.target.value))} />
        </label>
        <Toggle label="Atenuar en reposo" value={value.backlightStandby} onChange={(v) => set('backlightStandby', v)} help="El primer toque despierta la pantalla; el segundo ya actúa." />
        {value.backlightStandby && (
          <>
            <label>
              Brillo en reposo: {value.standbyBrightness} %
              <input type="range" min={0} max={100} value={value.standbyBrightness} onChange={(e) => set('standbyBrightness', Number(e.target.value))} />
            </label>
            <label>
              Tiempo hasta el reposo (segundos)
              <input className="field" type="number" min={1} max={655} value={Math.round(value.standbyDelayMs / 1000)} onChange={(e) => set('standbyDelayMs', Number(e.target.value) * 1000)} />
            </label>
          </>
        )}
      </div>
      <div className="cfg-group">
        <b>Zumbador y táctil</b>
        <Optional label="Volumen del zumbador" value={value.buzzerVolume} onChange={(v) => set('buzzerVolume', v)} min={0} max={255} def={0x30} />
        <Optional label="Duración del pitido" value={value.buzzerTimeMs} onChange={(v) => set('buzzerTimeMs', v)} min={0} max={2550} unit="ms" def={100} />
        <Optional label="Sensibilidad táctil (capacitiva: 0–31)" value={value.touchSensitivity} onChange={(v) => set('touchSensitivity', v)} min={0} max={255} def={0x14} />
      </div>
      <div className="cfg-group">
        <b>Avanzado</b>
        <Optional label="Archivo de valores iniciales distinto de 22" value={value.initFileId} onChange={(v) => set('initFileId', v)} min={0} max={255} def={15} />
        <label>
          <span className="chk">
            <input type="checkbox" checked={value.sdFolder != null} onChange={(e) => set('sdFolder', e.target.checked ? 'DWIN_SET' : null)} /> Carpeta de la SD distinta de DWIN_SET
          </span>
          {value.sdFolder != null && <input className="field mono" maxLength={8} value={value.sdFolder} onChange={(e) => set('sdFolder', e.target.value.toUpperCase())} />}
        </label>
      </div>
      <div className="muted-txt">
        Los tiempos del panel LCD (0x10–0x1F) y la calibración del táctil se conservan del CFG importado o de fábrica: no se modifican aquí. Fuente: guía DGUS II de DWIN, sección «CFG file».
      </div>
      {errors.map((e) => (
        <div key={e} className="msg error">
          {e}
        </div>
      ))}
    </div>
  );
}
