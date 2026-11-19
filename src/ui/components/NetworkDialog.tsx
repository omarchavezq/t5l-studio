import { useState } from 'react';
import { buildProject } from '../../core/build';
import { NETWORK_FIELDS, applyNetwork, checkNetwork, readNetwork, type NetworkSettings } from '../../core/network';
import { createControl } from '../../core/controls';
import { useStore } from '../store';

export function NetworkDialog({ onClose }: { onClose: () => void }) {
  const [source] = useState(() => useStore.getState().project);
  const [documentId] = useState(() => useStore.getState().documentId);
  const [base] = useState(() => buildProject(source).config);
  const [model, setModel] = useState<NetworkSettings>(() => structuredClone(source.network ?? { fields: {} }));
  const [error, setError] = useState('');
  const current = readNetwork(applyNetwork(base, { ...model, fields: {} }));
  const [addButton, setAddButton] = useState(false);
  const errors = checkNetwork(model);
  const save = () => {
    const s = useStore.getState();
    if (s.documentId !== documentId || s.project !== source) return setError('El proyecto cambió. Cierre y vuelva a abrir este editor.');
    if (errors.length) return;
    s.mutate((d) => {
      d.network = model;
      if (addButton) {
        const c = createControl('keyReturn', 20, 20, 'Configurar WiFi');
        Object.assign(c.props, { vp: '0498', keyValue: '5A00' });
        d.pages.find((p) => p.id === s.pageId)?.controls.push(c);
      }
    });
    onClose();
  };
  return <div className="overlay" onPointerDown={onClose}><div className="dialog" style={{ width: 640 }} onPointerDown={(e) => e.stopPropagation()}>
    <h2>Red WiFi / DWIN Cloud</h2><div className="sub">Equivalente al editor de red de V7.651. Solo se guardan los campos editados; los datos restantes se conservan.</div>
    <div className="body">
      <label className="chk"><input type="checkbox" checked={model.enabled ?? current.enabled} onChange={(e) => setModel({ ...model, enabled: e.target.checked })} /> Habilitar la interfaz de red</label>
      {NETWORK_FIELDS.map((f) => <label key={f.key}>{f.label} <small>VP {f.vp.toString(16).toUpperCase()}</small>
        <input className="field" type={f.key === 'serial' ? 'password' : 'text'} autoComplete="off" value={model.fields[f.key] ?? current.fields[f.key]} onChange={(e) => setModel({ ...model, fields: { ...model.fields, [f.key]: e.target.value } })} />
      </label>)}
      <label className="chk"><input type="checkbox" checked={addButton} onChange={(e) => setAddButton(e.target.checked)} /> Añadir un botón de configuración WiFi a la página actual</label>
      <div className="muted-txt">Requiere un módulo y firmware de red compatibles. El botón escribe 5A00 en VP 0498; no comprueba la conexión desde el PC. Los textos usan caracteres de 8 bits, como el editor original.</div>
      {[...errors, ...(error ? [error] : [])].map((e) => <div className="msg error" key={e}>{e}</div>)}
    </div><div className="foot"><button className="btn outline" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={!!errors.length} onClick={save}>Guardar en el proyecto</button></div>
  </div></div>;
}
