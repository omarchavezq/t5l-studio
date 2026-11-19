import { useState } from 'react';
import { addFskCamera, checkFskSetup, DEFAULT_FSK, fskWords, type FskSetup } from '../../core/fsk';
import { projectProfile } from '../../core/profiles';
import { useStore } from '../store';

export function FskDialog({ onClose }: { onClose: () => void }) {
  const [source] = useState(() => useStore.getState().project), [documentId] = useState(() => useStore.getState().documentId);
  const [setup, set] = useState<FskSetup>({ ...DEFAULT_FSK }); const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const patch = (p: Partial<FskSetup>) => set((s) => ({ ...s, ...p })); const errors = checkFskSetup(source, setup);
  const profile = projectProfile(source);
  const save = async () => {
    setBusy(true);
    try {
      const s = useStore.getState(); if (s.documentId !== documentId || s.project !== source) throw new Error('El proyecto cambió. Vuelva a abrir el asistente.');
      if (source.settings.width < 160 || source.settings.height < 160) throw new Error('Esta página de cámara requiere un lienzo de al menos 160×160.');
      const empty = source.pages.find((page) => page.id === s.pageId && !page.background && !page.controls.length && !source.icl?.[source.settings.bgIclId]);
      const pageId = empty?.id ?? Array.from({ length: 1024 }, (_, i) => i).find((id) => !source.pages.some((page) => page.id === id));
      if (pageId === undefined) throw new Error('No quedan páginas táctiles libres.');
      const base = structuredClone(source); if (!empty) base.pages.push({ id: pageId, name: `Cámara FSK ${setup.camera}`, controls: [] });
      const next = addFskCamera(base, pageId, setup), page = next.pages.find((p) => p.id === pageId)!;
      if (empty) page.name = `Cámara FSK ${setup.camera}`;
      const [image, button] = page.controls; image.x = 16; image.y = 16; image.w = Math.min(setup.width, source.settings.width - 32); image.h = Math.min(setup.height, source.settings.height - 90);
      Object.assign(button, { x: 16, y: source.settings.height - 54, w: Math.min(240, source.settings.width - 32), h: 40 });
      button.props.fskButton = true;
      const canvas = document.createElement('canvas'); canvas.width = source.settings.width; canvas.height = source.settings.height;
      const g = canvas.getContext('2d')!; g.fillStyle = '#10151e'; g.fillRect(0, 0, canvas.width, canvas.height); g.fillStyle = '#000'; g.fillRect(image.x, image.y, image.w, image.h);
      g.fillStyle = '#2864cc'; g.beginPath(); g.roundRect(button.x, button.y, button.w, button.h, 8); g.fill();
      await document.fonts.load('bold 16px Arial'); g.font = 'bold 16px Arial'; g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Activar cámara', button.x + button.w / 2, button.y + button.h / 2);
      page.background = canvas.toDataURL('image/jpeg', source.settings.jpegQuality);
      if (useStore.getState().documentId !== documentId || useStore.getState().project !== source) throw new Error('El proyecto cambió durante la preparación. Vuelva a abrir el asistente.');
      s.mutate((p) => Object.assign(p, next)); useStore.getState().selectPage(pageId); onClose();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <div className="overlay" onPointerDown={() => !busy && onClose()}><div className="dialog wide" onPointerDown={(e) => e.stopPropagation()}>
    <h2>Cámara FSK por JPEG</h2><div className="sub">Prepara una página con ventana y botón visible para activar el bus al presionar y configurar la cámara al soltar. Usa la página actual si está vacía; en otro caso crea una nueva para enlazar desde su navegación.</div>
    <div className="body">
      <div className="msg warn">{profile.firmware.camaraFSK === true ? 'Este perfil tiene soporte FSK documentado.' : 'El soporte FSK no está confirmado en este perfil.'} Requiere interfaz FSK, GUI V49 o superior y cámara compatible. El lienzo no reproduce la cámara.</div>
      <div className="row2"><label>Ancho de la cámara<input className="field" type="number" step={4} value={setup.width} onChange={(e) => patch({ width: Number(e.target.value) })} /></label><label>Alto de la cámara<input className="field" type="number" step={4} value={setup.height} onChange={(e) => patch({ height: Number(e.target.value) })} /></label></div>
      <div className="row2"><label>VP de imagen (hex)<input className="field" value={setup.dataVp} onChange={(e) => patch({ dataVp: e.target.value.toUpperCase() })} /></label><label>VP de comandos (hex)<input className="field" value={setup.sourceVp} onChange={(e) => patch({ sourceVp: e.target.value.toUpperCase() })} /></label></div>
      <div className="muted-txt">Se reservan {Number.isFinite(fskWords(setup)) ? fskWords(setup) * 2 / 1024 : '—'} KB para imagen y dos bloques de comandos. El asistente comprueba que no ocupen otras variables.</div>
      <div className="row2"><label>ID de cámara (0–30)<input className="field" type="number" min={0} max={30} value={setup.camera} onChange={(e) => patch({ camera: Number(e.target.value) })} /></label><label>Interfaz del dispositivo (1–31)<input className="field" type="number" min={1} max={31} value={setup.device} onChange={(e) => patch({ device: Number(e.target.value) })} /></label></div>
      <div className="row2"><label>Velocidad del bus<select className="field" value={setup.speed} onChange={(e) => patch({ speed: Number(e.target.value) })}>{[100,200,400,600,1000].map((n, i) => <option key={i} value={i}>{n} KB/s</option>)}</select></label><label>Espera (×0,125 ms)<input className="field" type="number" min={1} max={255} value={setup.wait} onChange={(e) => patch({ wait: Number(e.target.value) })} /></label></div>
      <label className="chk"><input type="checkbox" checked={setup.mirror} onChange={(e) => patch({ mirror: e.target.checked })} /> Espejo horizontal</label><label className="chk"><input type="checkbox" checked={setup.infrared} onChange={(e) => patch({ infrared: e.target.checked })} /> Iluminación infrarroja</label>
      <div className="muted-txt">Los comandos quedan en el 22 y se activan desde el botón de la pantalla. La configuración usa la orden temporal 51; no cambia de forma persistente el ID de la cámara ni actualiza el firmware. Un programa OS de fábrica que controle la cámara debe revisarse antes de cargar este proyecto.</div>
      {[...errors, ...(error ? [error] : [])].slice(0, 8).map((s, i) => <div className="msg error" key={i}>{s}</div>)}
    </div><div className="foot"><button className="btn outline" disabled={busy} onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy || !!errors.length} onClick={save}>{busy ? 'Preparando…' : 'Crear página de cámara'}</button></div>
  </div></div>;
}
