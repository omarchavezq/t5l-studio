import { useState } from 'react';
import { Copy, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { getDef, hasDef } from '../../core/controls';
import { setPageBackground } from '../actions';
import { useStore } from '../store';

export function Pages() {
  const pages = useStore((s) => s.project.pages);
  const pageId = useStore((s) => s.pageId);
  const { width, height } = useStore((s) => s.project.settings);
  const st = useStore.getState;
  const [menu, setMenu] = useState<{ x: number; y: number; id: number } | null>(null);

  return (
    <section className="pages" onClick={() => setMenu(null)}>
      <div className="panel-head">
        Páginas <span style={{ fontWeight: 500 }}>({pages.length})</span>
        <div className="spacer" />
        <button className="btn" title="Nueva página" onClick={() => st().addPage()}>
          <Plus size={14} /> Nueva
        </button>
      </div>
      <div className="page-list">
        {pages.map((p) => (
          <div
            key={p.id}
            className={`page-card ${p.id === pageId ? 'active' : ''}`}
            onClick={() => st().selectPage(p.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ x: e.clientX, y: e.clientY, id: p.id });
            }}
            title="Clic derecho para más opciones"
          >
            <div className="page-thumb" style={{ aspectRatio: `${width} / ${height}` }}>
              {p.background && <img src={p.background} alt="" />}
              {p.controls.map((c) => {
                const kind = hasDef(c.type) ? getDef(c.type).kind : 'display';
                return (
                  <div
                    key={c.id}
                    className="mini"
                    style={{
                      left: `${(c.x / width) * 100}%`,
                      top: `${(c.y / height) * 100}%`,
                      width: `${(c.w / width) * 100}%`,
                      height: `${(c.h / height) * 100}%`,
                      background: kind === 'touch' ? 'var(--touch)' : 'var(--display)',
                      opacity: 0.55,
                    }}
                  />
                );
              })}
            </div>
            <div className="page-meta">
              <span className="page-num">{p.id}</span>
              <span className="page-name">{p.name}</span>
            </div>
          </div>
        ))}
      </div>
      {menu && (
        <PageMenu
          x={menu.x}
          y={menu.y}
          id={menu.id}
          canDelete={pages.length > 1}
          onClose={() => setMenu(null)}
        />
      )}
    </section>
  );
}

function PageMenu({ x, y, id, canDelete, onClose }: { x: number; y: number; id: number; canDelete: boolean; onClose: () => void }) {
  const st = useStore.getState;
  const page = st().project.pages.find((p) => p.id === id);
  if (!page) return null;
  return (
    <div className="menu" style={{ left: x, top: y }} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => {
          const name = window.prompt('Nombre de la página', page.name);
          if (name) st().renamePage(id, name);
          onClose();
        }}
      >
        Renombrar…
      </button>
      <button
        onClick={() => {
          const v = window.prompt('Número de página DGUS (0-4091). Debe coincidir con el número de la imagen de fondo.', String(id));
          if (v != null && !st().setPageNumber(id, parseInt(v, 10))) window.alert('Número no válido o ya usado.');
          onClose();
        }}
      >
        Cambiar número…
      </button>
      <button onClick={() => (setPageBackground(id), onClose())}>
        <ImagePlus size={14} /> Cambiar fondo…
      </button>
      {page.background && <button onClick={() => (st().setBackground(id, undefined), onClose())}>Quitar fondo</button>}
      <button onClick={() => (st().duplicatePage(id), onClose())}>
        <Copy size={14} /> Duplicar
      </button>
      <hr />
      <button
        disabled={!canDelete}
        style={{ color: 'var(--danger)', opacity: canDelete ? 1 : 0.4 }}
        onClick={() => {
          if (window.confirm(`¿Eliminar la página ${id} "${page.name}" y sus ${page.controls.length} controles?`)) st().deletePage(id);
          onClose();
        }}
      >
        <Trash2 size={14} /> Eliminar
      </button>
    </div>
  );
}
