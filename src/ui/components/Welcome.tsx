// Pantalla de bienvenida: proyectos recientes y acciones para empezar, como en otros IDE.
import { useEffect, useState } from 'react';
import { ArrowRight, FileInput, FilePlus2, FolderOpen, LayoutTemplate, Moon, Sun, Trash2 } from 'lucide-react';
import { demoProject } from '../../core/project';
import { importDwinSetFolder, openProject, openRecentProject } from '../actions';
import { forgetBrowserRecent, listRecent, loadBrowserRecent, type RecentEntry } from '../recent';
import { useStore } from '../store';
import { toast } from '../toast';

const discardOk = () => !useStore.getState().dirty || window.confirm('Hay cambios sin guardar. ¿Descartarlos?');

function when(t: number): string {
  const d = Date.now() - t;
  const min = Math.round(d / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.round(h / 24);
  if (days < 7) return `hace ${days} día${days > 1 ? 's' : ''}`;
  return new Date(t).toLocaleDateString();
}

export function Welcome({ onNew }: { onNew: () => void }) {
  const [recent, setRecent] = useState<RecentEntry[] | null>(null);
  const current = useStore((s) => s.project);
  const documentId = useStore((s) => s.documentId);
  const theme = useStore((s) => s.theme);
  const hasOpen = documentId > 0;

  const refresh = () => listRecent().then(setRecent);
  useEffect(() => {
    void refresh();
  }, []);

  const open = async (r: RecentEntry) => {
    if (!r.browser) return openRecentProject(r.key);
    if (!discardOk()) return;
    const p = await loadBrowserRecent(r.key);
    if (p) useStore.getState().setProject(p);
    else toast('No se pudo abrir la copia guardada en el navegador.', 'error');
  };

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <header className="welcome-head">
          <div className="brand-logo big">T5</div>
          <div>
            <h1>T5L Studio</h1>
            <p>Editor de interfaces para pantallas DWIN T5L (DGUS II)</p>
          </div>
          <div className="spacer" />
          <button className="btn icon" title={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'} onClick={() => useStore.getState().setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </header>

        <div className="welcome-grid">
          <section className="welcome-actions">
            <h2>Empezar</h2>
            <button className="welcome-action" onClick={onNew}>
              <FilePlus2 size={22} />
              <span>
                <b>Nuevo proyecto</b>
                <small>Elegir pantalla y resolución</small>
              </span>
            </button>
            <button className="welcome-action" onClick={openProject}>
              <FolderOpen size={22} />
              <span>
                <b>Abrir proyecto</b>
                <small>Archivo .dgusx de T5L Studio</small>
              </span>
            </button>
            <button className="welcome-action" onClick={importDwinSetFolder}>
              <FileInput size={22} />
              <span>
                <b>Importar de DGUS 7.6</b>
                <small>Carpeta del proyecto o su DWIN_SET</small>
              </span>
            </button>
            <button className="welcome-action" onClick={() => discardOk() && useStore.getState().setProject(demoProject())}>
              <LayoutTemplate size={22} />
              <span>
                <b>Abrir ejemplo</b>
                <small>Proyecto de demostración con dos páginas</small>
              </span>
            </button>
            {hasOpen && (
              <button className="btn outline welcome-back" onClick={() => useStore.getState().showWelcome(false)}>
                Volver a «{current.name}» <ArrowRight size={14} />
              </button>
            )}
          </section>

          <section className="welcome-recent">
            <h2>Recientes</h2>
            {recent === null && <div className="muted-txt">Cargando…</div>}
            {recent?.length === 0 && (
              <div className="welcome-empty">
                Aún no hay proyectos recientes.
                <br />
                {window.dgus ? 'Los proyectos que abra o guarde aparecerán aquí.' : 'Los proyectos que abra o guarde en el navegador aparecerán aquí.'}
              </div>
            )}
            <ul>
              {recent?.map((r) => (
                <li key={r.key}>
                  <button className="welcome-item" onClick={() => open(r)} title={r.browser ? r.where : r.key}>
                    <span className="welcome-name">{r.name}</span>
                    <span className="welcome-meta">
                      {when(r.time)}
                      {r.pages != null && ` · ${r.pages} página${r.pages === 1 ? '' : 's'}`}
                      {r.size && ` · ${r.size}`}
                    </span>
                    <span className="welcome-where">{r.where}</span>
                  </button>
                  {r.browser && (
                    <button
                      className="btn icon"
                      title="Quitar de la lista (borra la copia del navegador)"
                      onClick={async () => {
                        await forgetBrowserRecent(r.key);
                        void refresh();
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {!window.dgus && (
              <div className="muted-txt welcome-note">
                En el navegador, la lista guarda una copia de cada proyecto al abrirlo o guardarlo. Use «Guardar» para tener el archivo .dgusx.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
