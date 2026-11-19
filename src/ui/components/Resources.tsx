import { useState } from 'react';
import { FilePlus, ImagePlus, Trash2 } from 'lucide-react';
import { addIclFiles, createIclFromImages, removeIcl } from '../actions';
import { ICON_PREVIEW, iclList } from '../iconCache';
import { usePage, useStore } from '../store';
import { openBinaryFiles } from '../platform';
import { toBase64 } from '../../core/bytes';
import { toast } from '../toast';

const EMPTY: Record<number, string> = {};
const EMPTY_FILES: Record<string, string> = {};

/** Bibliotecas ICL del proyecto (fondos e iconos). */
export function Resources() {
  const icl = useStore((s) => s.project.icl) ?? EMPTY;
  const bgId = useStore((s) => s.project.settings.bgIclId);
  const extra = useStore((s) => s.project.extraFiles) ?? EMPTY_FILES;
  const fontFiles = Object.keys(extra).filter((n) => /\.(hzk|dzk)$/i.test(n)).sort((a, b) => parseInt(a) - parseInt(b));
  const otherFiles = Object.keys(extra).filter((n) => /\.(uic|gtf|wae|lib|bin)$/i.test(n) && !n.startsWith('__')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const selection = useStore((s) => s.selection);
  const page = usePage();
  const [open, setOpen] = useState<number | null>(null);
  const ids = Object.keys(icl)
    .map(Number)
    .sort((a, b) => a - b);
  const selected = selection.length === 1 ? page?.controls.find((c) => c.id === selection[0]) : undefined;
  const iconKeys = selected ? ICON_PREVIEW[selected.type] : undefined;
  const addResources = async () => {
    const before = useStore.getState(); const { project, documentId } = before;
    try {
      const files = await openBinaryFiles('.uic,.gtf,.wae,.hzk,.dzk,.bin,.lib', true); if (!files.length) return;
      const used = new Set(Object.keys(project.extraFiles ?? {}).map((n) => n.toLowerCase()));
      for (const f of files) {
        if (!/^\d+[^/\\]*\.(uic|gtf|wae|hzk|dzk|bin|lib)$/i.test(f.name) || f.data.length > 64 * 1024 * 1024) throw new Error('Use recursos numerados de hasta 64 MB.');
        if (used.has(f.name.toLowerCase())) throw new Error(`Ya existe ${f.name}; conserve el recurso o cambie el nombre del nuevo archivo.`);
        used.add(f.name.toLowerCase());
        if (!/\.(uic|lib)$/i.test(f.name) && (project.icl?.[parseInt(f.name)] || [13,14,22].includes(parseInt(f.name)) && /\.bin$/i.test(f.name))) throw new Error(`${f.name}: ese ID ya tiene una biblioteca o un archivo de controles.`);
      }
      const now = useStore.getState(); if (now.documentId !== documentId || now.project !== project) throw new Error('El proyecto cambió durante la selección. Vuelva a añadir los recursos.');
      now.mutate((p) => { p.extraFiles ??= {}; for (const f of files) p.extraFiles[f.name] = toBase64(f.data); });
      toast(`${files.length} recurso(s) incluidos. Generar para pantalla comprobará los solapes y la memoria.`);
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  const createNew = () => {
    const used = new Set(ids);
    let suggestion = 48;
    while (used.has(suggestion)) suggestion++;
    const v = window.prompt('Número del nuevo ICL (p. ej. 48 → 48.icl). Elija las imágenes a continuación; el número inicial de cada archivo será el ID del icono.', String(suggestion));
    const n = v == null ? NaN : parseInt(v, 10);
    if (Number.isFinite(n) && n >= 0 && n < 256) createIclFromImages(n);
  };

  return (
    <div className="panel-body">
      <div style={{ display: 'flex', gap: 6, padding: '10px 10px 4px' }}>
        <button className="btn outline" style={{ flex: 1 }} onClick={addIclFiles} title="Añadir archivos .icl existentes">
          <FilePlus size={15} /> Añadir .icl
        </button>
        <button className="btn outline" style={{ flex: 1 }} onClick={createNew} title="Crear un ICL a partir de imágenes PNG/JPG/BMP">
          <ImagePlus size={15} /> Crear ICL
        </button>
      </div>
      <button className="btn outline" title="Añadir fuentes, UIC, GTF o audio" style={{ margin: '4px 10px', width: 'calc(100% - 20px)' }} onClick={addResources}>Importar recursos…</button>
      {iconKeys && (
        <div className="res-hint">
          Haga clic en un icono para asignarlo a «{selected!.name}».
        </div>
      )}
      {!ids.length && (
        <div className="empty-state">
          No hay bibliotecas de iconos.
          <br />
          Los fondos de página se empaquetan solos en {bgId}.icl al exportar.
        </div>
      )}
      {fontFiles.length > 0 && (
        <div className="res-lib">
          <div className="res-head" style={{ cursor: 'default' }}>
            <span className="res-meta">Fuentes del proyecto</span>
          </div>
          {fontFiles.map((n) => (
            <div key={n} className="res-head" style={{ cursor: 'default' }}>
              <span className="page-num">{n}</span>
              <span className="res-meta">{Math.round((extra[n].length * 3) / 4 / 1024)} KB</span>
              <div className="spacer" />
              <button
                className="btn icon"
                title="Quitar del proyecto"
                onClick={() => {
                  if (!window.confirm(`¿Quitar ${n} del proyecto?`)) return;
                  useStore.getState().mutate((d) => {
                    if (d.extraFiles) delete d.extraFiles[n];
                  });
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      {otherFiles.length > 0 && <div className="res-lib"><div className="res-head"><span className="res-meta">Otros recursos incluidos</span></div>{otherFiles.map((name) => <div className="res-head" key={name} style={{ cursor: 'default' }}><span className="page-num" title={name}>{name}</span><span className="res-meta">{Math.ceil(extra[name].length * 3 / 4 / 1024)} KB</span></div>)}<div className="res-hint">UIC y LIB se cargan por SD. Importar un archivo conserva sus bytes; no convierte su formato.</div></div>}
      {ids.map((id) => {
        const list = open === id || ids.length <= 2 ? iclList(id) : null;
        return (
          <div key={id} className="res-lib">
            <div className="res-head" onClick={() => setOpen(open === id ? null : id)}>
              <span className="page-num">{id}.icl</span>
              <span className="res-meta">{id === bgId ? 'fondos de página' : 'iconos'}</span>
              <div className="spacer" />
              <button
                className="btn icon"
                title="Quitar del proyecto"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`¿Quitar ${id}.icl del proyecto?`)) removeIcl(id);
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
            {list && (
              <div className="res-grid">
                {list.map((img) => (
                  <button
                    key={img.id}
                    className="res-icon"
                    title={`Icono ${img.id} · ${img.width}×${img.height}`}
                    onClick={() => {
                      if (!selected || !iconKeys) return;
                      const s = useStore.getState();
                      s.setProp(selected.id, iconKeys[0], id);
                      s.setProp(selected.id, iconKeys[1], img.id);
                    }}
                  >
                    <img src={img.url} alt="" />
                    <span>{img.id}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
