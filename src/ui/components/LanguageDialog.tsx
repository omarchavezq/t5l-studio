import { useRef, useState } from 'react';
import { createControl } from '../../core/controls';
import { rgb565ToCss } from '../../core/bytes';
import { checkLanguageTable, type LanguageRow, type LanguageTable } from '../../core/multilanguage';
import { readLanguageWorkbook } from '../../core/languageWorkbook';
import { openBinaryFiles, saveSingleFile } from '../platform';
import { generateLanguages } from '../multilanguage';
import { useStore } from '../store';
import { collectDwinSetFiles } from '../actions';
import { storedZip } from '../../core/zip';
import { addSpanishPe, SPANISH_PE } from '../../core/spanishPe';

export function LanguageDialog({ onClose }: { onClose: () => void }) {
  const [source] = useState(() => useStore.getState().project);
  const [documentId] = useState(() => useStore.getState().documentId);
  const controls = source.pages.flatMap((p) => p.controls.filter((c) => ['text', 'textII', 'iconVar', 'multiLanguage'].includes(c.type)).map((c) => ({ ...c, pageName: p.name })));
  const [table, setTable] = useState<LanguageTable>(() => structuredClone(source.multilanguage ?? { languages: [SPANISH_PE, 'English'], vp: '5F00', iclId: 48, initial: 0, rows: [] }));
  const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [info, setInfo] = useState('');
  const spanish = () => { const r = addSpanishPe(table); setTable(r.table); setInfo(`Español (Perú). Traducidos: ${r.filled}. Por completar: ${r.missing}.`); };
  const controller = useRef<AbortController>();
  const close = () => { if (busy && !controller.current) return; controller.current?.abort(); onClose(); };
  const [addButtons, setAddButtons] = useState(false);
  const row = (controlId = '', key = `texto-${table.rows.length + 1}`): LanguageRow => {
    const c = controls.find((c) => c.id === controlId);
    return { key, controlId, texts: table.languages.map((_, i) => i === 0 ? String(c?.props.init ?? '') : ''), family: 'Arial', size: Number(c?.props.fontY ?? 24), color: rgb565ToCss(Number(c?.props.color ?? 0xffff)), background: '#000000', align: 'left', bold: false };
  };
  const patch = (index: number, p: Partial<LanguageRow>) => setTable((t) => ({ ...t, rows: t.rows.map((r, i) => i === index ? { ...r, ...(p.controlId !== undefined && p.controlId !== r.controlId ? { original: undefined } : {}), ...p } : r) }));
  const importTable = async () => {
    try {
      const [file] = await openBinaryFiles('.xls,.xlsx,.csv'); if (!file) return;
      const input = await readLanguageWorkbook(file.data);
      setTable((t) => ({ ...t, languages: input.languages, initial: 0, rows: input.keys.map((key, i) => {
        const old = t.rows.find((r) => r.key === key);
        const targets = controls.filter((c) => c.id.toLowerCase() === key.toLowerCase() || c.legacyId?.toLowerCase() === key.toLowerCase() || c.name === key);
        const target = targets.length === 1 ? targets[0] : undefined;
        return { ...row(target?.id, key), ...old, key, texts: input.texts[i] };
      }) }));
      setError('');
    } catch (e) { setError((e as Error).message); }
  };
  const exportTable = async () => {
    try {
      const XLSX = await import('xlsx'); const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Clave', ...table.languages], ...table.rows.map((r) => [r.key, ...r.texts])]), 'Textos');
      await saveSingleFile('textos_idiomas.xlsx', XLSX.write(book, { type: 'array', bookType: 'xlsx' }));
    } catch (e) { setError((e as Error).message); }
  };
  const exportLanguages = async () => {
    setBusy('Preparando paquetes de idiomas…'); setError('');
    try {
      const files = await collectDwinSetFiles();
      const p = useStore.getState().project; const t = p.multilanguage;
      if (!t) throw new Error('Genere y guarde primero la tabla de idiomas.');
      const grouped = t.languages.flatMap((language, i) => {
        const folder = `${String(i + 1).padStart(2, '0')}-${language.normalize('NFKD').replace(/[^a-z0-9-]/gi, '').slice(0, 40) || 'idioma'}`;
        return files.map((f) => {
          const data = f.data.slice();
          if (f.name === p.settings.configFileName) { const at = parseInt(t.vp, 16) * 2; data[at] = i >> 8; data[at + 1] = i & 255; }
          return { name: `${folder}/DWIN_SET/${f.name}`, data };
        });
      });
      await saveSingleFile('Paquetes_idiomas.zip', storedZip(grouped));
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };
  const save = async () => {
    setBusy('Preparando imágenes…'); setError('');
    const abort = new AbortController(); controller.current = abort;
    try {
      const p = await generateLanguages(source, table, (n, total) => setBusy(`Generando ${n}/${total} imágenes…`), abort.signal);
      if (abort.signal.aborted) return;
      const s = useStore.getState();
      if (s.documentId !== documentId || s.project !== source) throw new Error('El proyecto cambió durante la generación. Vuelva a abrir la tabla.');
      if (addButtons && table.rows.length) for (let i = 0; i < table.languages.length; i++) {
        const c = createControl('keyReturn', 10 + (i % 4) * 100, 10 + Math.floor(i / 4) * 50, `Idioma: ${table.languages[i]}`);
        Object.assign(c.props, { vp: table.vp, keyValue: i.toString(16).padStart(4, '0') });
        p.pages.find((page) => page.id === s.pageId)?.controls.push(c);
      }
      s.mutate((d) => { Object.assign(d, p); if (!p.multilanguage) delete d.multilanguage; }); onClose();
    } catch (e) { if (!abort.signal.aborted) setError((e as Error).message); } finally { controller.current = undefined; setBusy(''); }
  };
  const errors = checkLanguageTable(source, table);
  return <div className="overlay" onPointerDown={close}><div className="dialog" style={{ width: 1150 }} onPointerDown={(e) => e.stopPropagation()}>
    <h2>Textos e idiomas</h2><div className="sub">Cada texto se convierte en imágenes ICL. Todos los controles enlazados cambian de idioma al escribir su índice (0, 1…) en el VP común.</div>
    <div className="body">
      <div className="row2"><label>VP de idioma<input className="field" value={table.vp} onChange={(e) => setTable({ ...table, vp: e.target.value.toUpperCase() })} /></label><label>ICL de textos<input className="field" type="number" value={table.iclId} onChange={(e) => setTable({ ...table, iclId: Number(e.target.value) })} /></label></div>
      <div className="field-wrap"><button className="btn outline" disabled={!!busy} onClick={importTable}>Importar 2.xls / XLSX / CSV</button><button className="btn outline" onClick={exportTable}>Exportar tabla XLSX</button><button className="btn outline" disabled={!!busy || !source.multilanguage} onClick={exportLanguages}>Paquetes por idioma (tabla guardada)</button><button className="btn outline" onClick={() => setTable({ ...table, rows: [...table.rows, row()] })}>Añadir texto</button><button className="btn outline" onClick={spanish}>Agregar español (Perú)</button><button className="btn outline" onClick={() => setTable({ ...table, languages: [...table.languages, `Idioma ${table.languages.length + 1}`], rows: table.rows.map((r) => ({ ...r, texts: [...r.texts, ''] })) })}>Añadir idioma</button></div>
      <div style={{ overflowX: 'auto' }}><table className="watch"><thead><tr><th>Clave y control</th>{table.languages.map((language, i) => <th key={i}><input className="field" value={language} onChange={(e) => setTable({ ...table, languages: table.languages.map((s, j) => i === j ? e.target.value : s) })} /><button className="btn" disabled={table.languages.length <= 1} onClick={() => setTable({ ...table, initial: 0, languages: table.languages.filter((_, j) => i !== j), rows: table.rows.map((r) => ({ ...r, texts: r.texts.filter((_, j) => i !== j) })) })}>Quitar idioma</button></th>)}<th>Estilo</th><th /></tr></thead>
        <tbody>{table.rows.map((r, index) => <tr key={index}><td><input className="field" value={r.key} onChange={(e) => patch(index, { key: e.target.value })} /><select className="field" value={r.controlId} onChange={(e) => patch(index, { controlId: e.target.value })}><option value="">Enlazar control…</option>{controls.map((c) => <option key={c.id} value={c.id}>{c.pageName}: {c.name}</option>)}</select></td>
          {r.texts.map((text, i) => <td key={i}><textarea className="field" style={{ minWidth: 160, height: 70 }} value={text} onChange={(e) => patch(index, { texts: r.texts.map((s, j) => i === j ? e.target.value : s) })} /></td>)}
          <td><input className="field" aria-label="Tipografía" value={r.family} onChange={(e) => patch(index, { family: e.target.value })} /><input className="field" aria-label="Tamaño en píxeles" type="number" value={r.size} onChange={(e) => patch(index, { size: Number(e.target.value) })} /><div className="field-wrap"><input aria-label="Color de texto" type="color" value={r.color} onChange={(e) => patch(index, { color: e.target.value })} /><input aria-label="Color de fondo" type="color" value={r.background} onChange={(e) => patch(index, { background: e.target.value })} /><select className="field" aria-label="Alineación" value={r.align} onChange={(e) => patch(index, { align: e.target.value as LanguageRow['align'] })}><option value="left">Izquierda</option><option value="center">Centro</option><option value="right">Derecha</option></select><label><input type="checkbox" checked={r.bold} onChange={(e) => patch(index, { bold: e.target.checked })} />Negrita</label></div></td>
          <td><button className="btn" onClick={() => setTable({ ...table, rows: table.rows.filter((_, i) => i !== index) })}>Quitar</button></td></tr>)}</tbody></table></div>
      <label>Idioma inicial<select className="field" value={table.initial} onChange={(e) => setTable({ ...table, initial: Number(e.target.value) })}>{table.languages.map((s, i) => <option key={i} value={i}>{i}: {s}</option>)}</select></label>
      <label className="chk"><input type="checkbox" checked={addButtons} onChange={(e) => setAddButtons(e.target.checked)} /> Añadir botones de idioma a la página actual</label>
      <div className="muted-txt">Se conserva una copia del control original para restaurarlo al quitar la fila. Las traducciones se dibujan dentro del tamaño del control; revise los textos largos. La importación toma valores de las celdas; el estilo de Excel se configura aquí.</div>
      {info && <div className="msg">{info}</div>}
      {[...errors.slice(0, 6), ...(error ? [error] : [])].map((s, i) => <div key={i} className="msg error">{s}</div>)}
    </div><div className="foot"><span className="muted-txt">{busy}</span><button className="btn outline" disabled={!!busy && !controller.current} onClick={close}>Cancelar</button><button className="btn primary" disabled={!!busy || !!errors.length} onClick={save}>{source.multilanguage && !table.rows.length ? 'Restaurar controles y quitar tabla' : 'Generar ICL y guardar'}</button></div>
  </div></div>;
}
