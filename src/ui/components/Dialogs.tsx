import { useMemo, useState } from 'react';
import { Circle, Cpu, Search } from 'lucide-react';
import { SYS, readVp } from '../../core/protocol';
import {
  MODEL_PROFILES,
  VERIFICATION_LABEL,
  findProfile,
  genericProfile,
  profileSettings,
  projectProfile,
  searchProfiles,
  type ScreenProfile,
} from '../../core/profiles';
import type { ProjectSettings } from '../../core/types';
import { createProject } from '../actions';
import { request, useComm } from '../comm';
import { useStore } from '../store';
import { toast } from '../toast';
import { CfgEditor } from './CfgEditor';
import { KNOB_MODELS, KNOB_RTC } from '../../core/controls/knob';
import { defaultCfg, isCfg, parseCfg, type CfgModel } from '../../core/cfg';
import { fromBase64 } from '../../core/bytes';

/** Punto de partida del editor: el CFG importado si existe; si no, los valores del CFG básico. */
function initialCfg(s: Partial<ProjectSettings>): CfgModel {
  const files = useStore.getState().project.extraFiles ?? {};
  const name = Object.keys(files).find((n) => /^T5LCFG.*\.cfg$/i.test(n));
  if (name) {
    const b = fromBase64(files[name]);
    if (isCfg(b)) return { ...parseCfg(b), bgIclId: s.bgIclId ?? 32 };
  }
  return defaultCfg(s.bgIclId ?? 32, s.rotation ?? 0);
}

// ------------------------------------------------------------------ selector de perfil

function ProfilePicker({ value, onChange }: { value: ScreenProfile; onChange: (p: ScreenProfile) => void }) {
  const [q, setQ] = useState('');
  const [customW, setCustomW] = useState(value.resolucion[0]);
  const [customH, setCustomH] = useState(value.resolucion[1]);
  const list = useMemo(() => searchProfiles(q), [q]);
  const models = list.filter((p) => !p.generico);
  const generic = list.filter((p) => p.generico);
  const row = (p: ScreenProfile) => (
    <button key={p.id} type="button" className={`profile-row ${p.id === value.id ? 'on' : ''}`} onClick={() => onChange(p)}>
      <span className="profile-name">
        {p.forma === 'circular' && <Circle size={12} />} {p.nombre}
      </span>
      <span className="profile-meta">
        {p.resolucion[0]}×{p.resolucion[1]} · {p.flashMB} MB
      </span>
      <span className={`profile-badge ${p.verificacion}`}>{VERIFICATION_LABEL[p.verificacion]}</span>
    </button>
  );
  return (
    <div className="profile-picker">
      <div className="search" style={{ margin: 0 }}>
        <Search size={14} />
        <input placeholder="Buscar modelo o resolución (p. ej. 480x854, DMG80480)…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="profile-list">
        {models.length > 0 && <div className="profile-group">Modelos</div>}
        {models.map(row)}
        {generic.length > 0 && <div className="profile-group">Genéricos por resolución (V7.651)</div>}
        {generic.map(row)}
        {!list.length && <div className="muted-txt" style={{ padding: 8 }}>Sin resultados. Use una resolución personalizada.</div>}
      </div>
      <div className="row2">
        <label>
          Ancho personalizado
          <input className="field" type="number" value={customW} onChange={(e) => setCustomW(Number(e.target.value))} />
        </label>
        <label>
          Alto
          <input className="field" type="number" value={customH} onChange={(e) => setCustomH(Number(e.target.value))} />
        </label>
        <button type="button" className="btn outline" onClick={() => customW > 0 && customH > 0 && onChange(genericProfile(customW, customH))}>
          Usar
        </button>
      </div>
      <ProfileSummary p={value} />
    </div>
  );
}

function ProfileSummary({ p }: { p: ScreenProfile }) {
  return (
    <div className="profile-summary">
      <b>{p.nombre}</b> — {p.resolucion[0]}×{p.resolucion[1]}, {p.forma === 'circular' ? 'circular' : 'rectangular'}, {p.flashMB} MB de memoria,
      Texto DGUS II {p.firmware.escalaTextoII ? 'con' : 'sin'} escala, {p.firmware.crcPorDefecto ? 'con' : 'sin'} CRC.{' '}
      <span className={`profile-badge ${p.verificacion}`}>{VERIFICATION_LABEL[p.verificacion]}</span>
      {p.notas && <div className="muted-txt">{p.notas}</div>}
      {p.fuentes?.map((u) => (
        <div key={u} className="muted-txt" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Fuente: {u}
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ proyecto nuevo

export function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('Mi pantalla');
  const [profile, setProfile] = useState<ScreenProfile>(MODEL_PROFILES.find((p) => p.id === 'dmg80480c070-04w') ?? genericProfile(800, 480));
  const [generation, setGeneration] = useState<Partial<ProjectSettings>>({ autoFonts: true, fontFamily: 'Arial', deviceConfig: 'basic' });
  const dirty = useStore((s) => s.dirty);

  const create = () => {
    if (dirty && !window.confirm('Hay cambios sin guardar. ¿Descartarlos?')) return;
    createProject(name.trim() || 'Proyecto', { ...generation, ...profileSettings(profile) });
    onClose();
  };

  return (
    <div className="overlay" onPointerDown={onClose}>
      <div className="dialog wide" onPointerDown={(e) => e.stopPropagation()}>
        <h2>Proyecto nuevo</h2>
        <div className="sub">Elija su pantalla. Si no está en la lista, use el genérico de su resolución: funciona con cualquier pantalla DGUS II.</div>
        <div className="body">
          <label>
            Nombre
            <input className="field" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
          </label>
          <ProfilePicker value={profile} onChange={setProfile} />
          <GenerationSettings settings={generation} onChange={(patch) => setGeneration((s) => ({ ...s, ...patch }))} />
        </div>
        <div className="foot">
          <button className="btn outline" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={create}>
            Crear proyecto
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ configuración del proyecto

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project);
  const connected = useComm((s) => s.connected);
  const [name, setName] = useState(project.name);
  const [s, setS] = useState<ProjectSettings>(project.settings);
  const [knob, setKnob] = useState(project.knob ?? { model: 0, rtc: 0 });
  const hasKnobs = project.pages.some((p) => p.controls.some((c) => c.type === 'rotaryKnob'));
  const set = <K extends keyof ProjectSettings>(k: K, v: ProjectSettings[K]) => setS((x) => ({ ...x, [k]: v }));
  const profile = findProfile(s.profileId) ?? projectProfile({ ...project, settings: s });

  const changeProfile = (p: ScreenProfile) => {
    const [w, h] = p.resolucion;
    const outside = project.pages.reduce((n, pg) => n + pg.controls.filter((c) => c.x + c.w > w || c.y + c.h > h).length, 0);
    if (outside && !window.confirm(`${outside} controles quedan fuera de ${w}×${h}. Se conservan y el compilador avisará. ¿Cambiar de perfil?`)) return;
    setS((x) => ({ ...x, ...profileSettings(p) }));
  };

  const readVersion = async () => {
    const f = await request(readVp(SYS.version, 1, useComm.getState().link), (x) => x.cmd === 0x83 && x.data.length >= 5 && ((x.data[0] << 8) | x.data[1]) === SYS.version);
    if (!f) return toast('La pantalla no respondió a la lectura de versión', 'error');
    const [d1, d0] = [f.data[3], f.data[4]].map((b) => '0x' + b.toString(16).toUpperCase().padStart(2, '0'));
    set('firmwareVersion', `D1 ${d1} · D0 ${d0}`);
  };

  const save = () => {
    useStore.getState().mutate((d) => {
      d.name = name;
      d.settings = s;
      if (hasKnobs) d.knob = knob;
    });
    onClose();
  };

  return (
    <div className="overlay" onPointerDown={onClose}>
      <div className="dialog wide" onPointerDown={(e) => e.stopPropagation()}>
        <h2>Configuración del proyecto</h2>
        <div className="sub">Pantalla de destino y formato de los archivos generados.</div>
        <div className="body">
          <label>
            Nombre
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <ProfilePicker value={profile} onChange={changeProfile} />
          <div className="profile-summary">
            <Cpu size={14} style={{ verticalAlign: -2 }} /> Firmware de la pantalla: <b>{s.firmwareVersion ?? 'sin leer'}</b>{' '}
            <button className="btn outline" style={{ height: 26 }} disabled={!connected} onClick={readVersion} title={connected ? 'Lee VP 0x000F' : 'Conéctese por «Puerto serie» primero'}>
              Leer de la pantalla
            </button>
            <div className="muted-txt">La versión ayuda a registrar la prueba, pero no identifica el modelo: elija el perfil según la etiqueta de la pantalla.</div>
          </div>
          {hasKnobs && (
            <div className="cfg-group">
              <b>Perilla giratoria (120.lib)</b>
              <label>
                Modelo de pantalla con perilla
                <select className="field" value={knob.model} onChange={(e) => setKnob({ ...knob, model: Number(e.target.value) })}>
                  {KNOB_MODELS.map((m, i) => (
                    <option key={m.label} value={i}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Reloj (RTC)
                <select className="field" value={knob.rtc} onChange={(e) => setKnob({ ...knob, rtc: Number(e.target.value) })}>
                  {KNOB_RTC.map((r, i) => (
                    <option key={r} value={i}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <label>
            Formato de 14ShowFile.bin
            <select className="field" value={s.showFileMode} onChange={(e) => set('showFileMode', e.target.value as ProjectSettings['showFileMode'])}>
              <option value="normal">Normal con índice (DGUS 7.6 por defecto)</option>
              <option value="encrypted">Normal cifrado (XOR)</option>
              <option value="fixed">Bloque fijo por página (antiguo)</option>
            </select>
          </label>
          {s.showFileMode === 'fixed' && (
            <label>
              Variables por página
              <select className="field" value={s.varsPerPage} onChange={(e) => set('varsPerPage', Number(e.target.value) as 64)}>
                <option value={64}>64</option>
                <option value={128}>128</option>
                <option value={256}>256</option>
              </select>
            </label>
          )}
          <label>
            Calidad JPEG ({Math.round(s.jpegQuality * 100)}%)
            <input type="range" min={50} max={100} value={Math.round(s.jpegQuality * 100)} onChange={(e) => set('jpegQuality', Number(e.target.value) / 100)} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <label>
              Archivo táctil
              <input className="field" value={s.touchFileName} onChange={(e) => set('touchFileName', e.target.value)} />
            </label>
            <label>
              Archivo de variables
              <input className="field" value={s.showFileName} onChange={(e) => set('showFileName', e.target.value)} />
            </label>
            <label>
              Valores iniciales
              <input className="field" value={s.configFileName} onChange={(e) => set('configFileName', e.target.value)} />
            </label>
          </div>
          <GenerationSettings settings={s} onChange={(patch) => setS((previous) => ({ ...previous, ...patch }))} />
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

function GenerationSettings({ settings: s, onChange }: { settings: Partial<ProjectSettings>; onChange: (patch: Partial<ProjectSettings>) => void }) {
  return (
    <>
      <label>
        ICL de fondos (sector inicial)
        <input className="field" type="number" min={16} max={255} value={s.bgIclId ?? 32} onChange={(e) => onChange({ bgIclId: Number(e.target.value) })} />
      </label>
      <label>
        Configuración de pantalla
        <select className="field" value={s.deviceConfig ?? 'preserve'} onChange={(e) => onChange({ deviceConfig: e.target.value as ProjectSettings['deviceConfig'] })}>
          <option value="preserve">Conservar CFG importado o configuración de la pantalla</option>
          <option value="basic">Crear CFG básico si falta (115200, sin CRC)</option>
          <option value="custom">Editar la configuración (T5LCFG.CFG)</option>
        </select>
      </label>
      {s.deviceConfig === 'custom' && (
        <CfgEditor value={s.cfg ?? initialCfg(s)} onChange={(cfg) => onChange({ cfg, rotation: cfg.rotation })} />
      )}
      {s.deviceConfig === 'basic' && (
        <label>
          Orientación del CFG nuevo
          <select className="field" value={s.rotation ?? 0} onChange={(e) => onChange({ rotation: Number(e.target.value) as ProjectSettings['rotation'] })}>
            {[0, 90, 180, 270].map((n) => (
              <option key={n} value={n}>
                {n}°
              </option>
            ))}
          </select>
        </label>
      )}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={!!s.autoFonts} onChange={(e) => onChange({ autoFonts: e.target.checked })} />
        Generar y asignar las fuentes que falten
      </label>
      {s.autoFonts && (
        <label>
          Tipografía de las bibliotecas nuevas
          <select className="field" value={s.fontFamily ?? 'Arial'} onChange={(e) => onChange({ fontFamily: e.target.value })}>
            {['Arial', 'Consolas', 'Segoe UI', 'Tahoma', 'Verdana'].map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
      )}
      <div className="muted-txt">
        La generación automática cubre números, RTC, HEX, Texto y Texto DGUS II. Los recursos importados se conservan. El CFG básico mantiene los parámetros LCD y táctiles de fábrica.
      </div>
    </>
  );
}
