import { useRef, useState } from 'react';
import { createControl } from '../../core/controls';
import { toBase64 } from '../../core/bytes';
import { videoToIcl } from '../video';
import { useStore } from '../store';

export function VideoDialog({ onClose }: { onClose: () => void }) {
  const [source] = useState(() => useStore.getState().project); const [documentId] = useState(() => useStore.getState().documentId);
  const [file, setFile] = useState<File | null>(null);
  const [id, setId] = useState(48); const [fps, setFps] = useState(15);
  const [width, setWidth] = useState(source.settings.width); const [height, setHeight] = useState(source.settings.height);
  const [addControl, setAddControl] = useState(true); const [busy, setBusy] = useState(''); const [error, setError] = useState('');
  const controller = useRef<AbortController>();
  const close = () => { controller.current?.abort(); onClose(); };
  const generate = async () => {
    if (!file) return;
    setBusy('Abriendo vídeo…'); setError(''); const abort = new AbortController(); controller.current = abort;
    try {
      if (!Number.isInteger(id) || id < 16 || id > 255 || id === source.settings.bgIclId || source.icl?.[id]) throw new Error('Elija un ID ICL libre entre 16 y 255, distinto del de fondos.');
      const data = await videoToIcl(file, { id, fps, width, height, quality: source.settings.jpegQuality }, abort.signal, (n, total) => setBusy(`Convirtiendo ${n}/${total} fotogramas…`));
      const s = useStore.getState();
      if (abort.signal.aborted) return;
      if (s.documentId !== documentId || s.project !== source) throw new Error('El proyecto cambió. Vuelva a abrir el conversor.');
      s.mutate((p) => {
        p.icl ??= {}; p.icl[id] = toBase64(data); p.iconLibs[id] = `${id}_Studio_video.icl`;
        if (addControl) {
          const c = createControl('video', 0, 0, file.name); c.w = width; c.h = height;
          Object.assign(c.props, { fps, iclId: id, type: 0 }); p.pages.find((page) => page.id === s.pageId)?.controls.push(c);
        }
      }); onClose();
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };
  return <div className="overlay" onPointerDown={close}><div className="dialog" onPointerDown={(e) => e.stopPropagation()}>
    <h2>Vídeo a ICL</h2><div className="sub">Convierte fotogramas a JPEG y genera la biblioteca del control Vídeo digital.</div>
    <div className="body">
      <label>Archivo MP4 / WebM<input className="field" type="file" accept="video/*" disabled={!!busy} onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
      <div className="row2"><label>ICL (sector inicial)<input className="field" type="number" value={id} onChange={(e) => setId(Number(e.target.value))} /></label><label>Fotogramas por segundo<input className="field" type="number" min={1} max={60} value={fps} onChange={(e) => setFps(Number(e.target.value))} /></label></div>
      <div className="row2"><label>Ancho<input className="field" type="number" value={width} onChange={(e) => setWidth(Number(e.target.value))} /></label><label>Alto<input className="field" type="number" value={height} onChange={(e) => setHeight(Number(e.target.value))} /></label></div>
      <label className="chk"><input type="checkbox" checked={addControl} onChange={(e) => setAddControl(e.target.checked)} /> Añadir el control de vídeo a la página actual</label>
      <div className="muted-txt">La conversión conserva solo la imagen. El audio WAE se asigna aparte. Requiere firmware con reproducción digital; la reproducción del panel no se emula en el lienzo. El paquete comprobará el espacio de memoria al generar.</div>
      {busy && <div>{busy}</div>}{error && <div className="msg error">{error}</div>}
    </div><div className="foot"><button className="btn outline" onClick={close}>{busy ? 'Cancelar conversión' : 'Cancelar'}</button><button className="btn primary" disabled={!!busy || !file} onClick={generate}>Convertir y guardar</button></div>
  </div></div>;
}
