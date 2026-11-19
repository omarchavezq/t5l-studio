import { useState } from 'react';
import { buildWae, pcm32k, readWav } from '../../core/audio';
import { toBase64 } from '../../core/bytes';
import { useStore } from '../store';

export function AudioDialog({ onClose }: { onClose: () => void }) {
  const [source] = useState(() => useStore.getState().project); const [documentId] = useState(() => useStore.getState().documentId);
  const [files, setFiles] = useState<File[]>([]); const [id, setId] = useState(16); const [fade, setFade] = useState(true);
  const [busy, setBusy] = useState(''); const [error, setError] = useState('');
  const generate = async () => {
    setBusy('Preparando audio…'); setError('');
    try {
      if (!Number.isInteger(id) || id < 0 || id > 255) throw new Error('ID de archivo WAE no válido.');
      if (Object.keys(source.extraFiles ?? {}).some((n) => new RegExp(`^${id}(?:\\D|$)`).test(n))) throw new Error('Ese ID ya tiene un recurso. Elija un número libre.');
      const clips = []; let bytes = 4096;
      for (const [i, f] of files.entries()) {
        if (f.size > 64 * 1024 * 1024) throw new Error(`${f.name}: supera el límite de 64 MB.`);
        const samples = pcm32k(readWav(new Uint8Array(await f.arrayBuffer())));
        bytes += Math.ceil((samples.length * 2 + 2) / 4096) * 4096;
        if (bytes > 64 * 1024 * 1024) throw new Error('La biblioteca WAE supera 64 MB. Reduzca la cantidad o duración de los audios.');
        clips.push({ id: i, samples }); setBusy(`Audio ${i + 1}/${files.length}`);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      const data = buildWae(clips, fade); const s = useStore.getState();
      if (s.documentId !== documentId || s.project !== source) throw new Error('El proyecto cambió. Vuelva a abrir el generador.');
      s.mutate((p) => { p.extraFiles ??= {}; p.extraFiles[`${id}_Studio.WAE`] = toBase64(data); }); onClose();
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };
  return <div className="overlay" onPointerDown={() => !busy && onClose()}><div className="dialog" style={{ width: 620 }} onPointerDown={(e) => e.stopPropagation()}>
    <h2>Audio WAV a WAE</h2><div className="sub">PCM de 32 kHz y 16 bits. Los segmentos se numeran desde 0 según el orden de la lista.</div>
    <div className="body"><label>Archivos WAV<input className="field" type="file" accept=".wav" multiple disabled={!!busy} onChange={(e) => setFiles(Array.from(e.target.files ?? []))} /></label>
      <label>Archivo WAE (sector inicial)<input className="field" type="number" value={id} onChange={(e) => setId(Number(e.target.value))} /></label>
      <label className="chk"><input type="checkbox" checked={fade} onChange={(e) => setFade(e.target.checked)} /> Rampa de entrada de 5 ms, como AllTool</label>
      {files.map((file, i) => <div className="field-wrap" key={i}><span>{i}: {file.name}</span><div className="spacer" /><button className="btn" disabled={!i || !!busy} onClick={() => setFiles((a) => { const b = [...a]; [b[i - 1], b[i]] = [b[i], b[i - 1]]; return b; })}>Subir</button><button className="btn" disabled={!!busy} onClick={() => setFiles(files.filter((_, j) => i !== j))}>Quitar</button></div>)}
      <div className="muted-txt">Se mezclan los canales a mono y se convierten a 32 kHz. Puede asignar el archivo a música táctil desde Proyecto → CFG, o al control de vídeo. El paquete comprobará sus sectores al generar. No se modifica ningún WAV original.</div>
      {busy && <div>{busy}</div>}{error && <div className="msg error">{error}</div>}
    </div><div className="foot"><button className="btn outline" disabled={!!busy} onClick={onClose}>Cancelar</button><button className="btn primary" disabled={!!busy || !files.length || files.length > 256} onClick={generate}>Generar y guardar WAE</button></div>
  </div></div>;
}
