import { House, Network, ListChecks, ChevronDown, FileSpreadsheet, FileCode2, History, Search, Wrench, Files } from 'lucide-react';
import { ALargeSmall, Cable, MonitorPlay, FileInput, FilePlus2, FolderOpen, Hammer, Images, Moon, PackageCheck, Redo2, Save, Settings, Sun, Undo2 } from 'lucide-react';
import { compile, exportDwinSet, exportVariables, importBackgrounds, importDwinSetFolder, openProject, openRecentProject, pickPagesFromProject, saveProject } from '../actions';
import { useState } from 'react';
import { openDialog } from '../uiState';
import type { RecentProject } from '../platform';
import { useStore } from '../store';
import { setSimOn, useComm } from '../comm';

export function Topbar({ onNew, onSettings, onFonts }: { onNew: () => void; onSettings: () => void; onFonts: () => void }) {
  const name = useStore((s) => s.project.name);
  const dirty = useStore((s) => s.dirty);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const theme = useStore((s) => s.theme);
  const simOn = useComm((s) => s.simOn);
  const connected = useComm((s) => s.connected);
  const st = useStore.getState;

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-logo">T5</div>
        T5L Studio
      </div>
      <div className="tb-group">
        <button className="btn icon" onClick={() => (setSimOn(false), st().showWelcome(true))} title="Inicio: proyectos recientes y nuevo proyecto">
          <House size={16} />
        </button>
      </div>
      <div className="tb-group">
        <button className="btn" onClick={onNew} title="Nuevo proyecto">
          <FilePlus2 size={16} /> <span className="lbl">Nuevo</span>
        </button>
        <button className="btn" onClick={openProject} title="Abrir proyecto (Ctrl+O)">
          <FolderOpen size={16} /> <span className="lbl">Abrir</span>
        </button>
        {window.dgus?.recentList && <RecentMenu />}
        <button className="btn" onClick={() => saveProject()} title="Guardar (Ctrl+S)">
          <Save size={16} /> <span className="lbl">Guardar</span>
        </button>
      </div>
      <div className="tb-group">
        <button className="btn icon" disabled={!canUndo} onClick={() => st().undo()} title="Deshacer (Ctrl+Z)">
          <Undo2 size={16} />
        </button>
        <button className="btn icon" disabled={!canRedo} onClick={() => st().redo()} title="Rehacer (Ctrl+Y)">
          <Redo2 size={16} />
        </button>
      </div>
      <div className="tb-group">
        <button className="btn" onClick={importDwinSetFolder} title="Abrir un proyecto hecho con DGUS 7.6: elija su carpeta o la carpeta DWIN_SET">
          <FileInput size={16} /> <span className="lbl">Importar DGUS</span>
        </button>
        <button className="btn" onClick={importBackgrounds} title="Importar varias imágenes de fondo: 0.jpg, 1.jpg… se asignan a la página con ese número">
          <Images size={16} /> <span className="lbl">Importar fondos</span>
        </button>
        <ToolsMenu />
        <button className="btn" onClick={onFonts} title="Generar librerías de fuentes (.HZK / .DZK) a partir de cualquier tipografía">
          <ALargeSmall size={16} /> <span className="lbl">Fuentes</span>
        </button>
        <button className="btn" onClick={onSettings} title="Pantalla y opciones de compilación">
          <Settings size={16} /> <span className="lbl">Proyecto</span>
        </button>
      </div>
      <span className="project-name">
        {name}
        {dirty && <span className="dirty-dot" title="Cambios sin guardar" />}
      </span>
      <div className="spacer" />
      <button
        className={`btn ${simOn ? 'active' : ''}`}
        onClick={() => setSimOn(!simOn)}
        title="Simular la pantalla: los botones responden y los valores se muestran como en el equipo real"
      >
        <MonitorPlay size={16} /> <span className="lbl">{simOn ? 'Salir de simulación' : 'Simular'}</span>
      </button>
      <button
        className={`btn ${connected ? 'active' : ''}`}
        onClick={() => {
          useComm.setState({ bottomTab: connected ? 'vars' : 'monitor' });
          st().setOutputOpen(true);
        }}
        title="Puerto serie: monitor, variables y descarga"
      >
        <Cable size={16} /> <span className="lbl">{connected ? 'Conectado' : 'Puerto serie'}</span>
      </button>
      <button className="btn icon" onClick={() => st().setTheme(theme === 'dark' ? 'light' : 'dark')} title="Cambiar tema">
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>
      <button className="btn outline" onClick={() => compile()} title="Comprobar y compilar (Ctrl+B)">
        <Hammer size={16} /> <span className="lbl">Compilar</span>
      </button>
      <button className="btn primary" onClick={() => exportDwinSet()} title="Preparar controles, fondos, fuentes y configuración para DWIN_SET (F5)">
        <PackageCheck size={16} /> Generar para pantalla
      </button>
    </header>
  );
}

/** Menú desplegable sencillo anclado a su botón. */
function DropMenu({ icon, label, title, children, onOpen }: { icon: React.ReactNode; label?: string; title: string; children: (close: () => void) => React.ReactNode; onOpen?: () => void }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const close = () => setAt(null);
  return (
    <>
      <button
        className={`btn ${label ? '' : 'icon'}`}
        title={title}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onOpen?.();
          setAt(at ? null : { x: r.left, y: r.bottom + 4 });
        }}
      >
        {icon}
        {label && <span className="lbl">{label}</span>}
        {label && <ChevronDown size={13} />}
      </button>
      {at && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onPointerDown={close} />
          <div className="menu" style={{ left: at.x, top: at.y }}>
            {children(close)}
          </div>
        </>
      )}
    </>
  );
}

function RecentMenu() {
  const [list, setList] = useState<RecentProject[]>([]);
  return (
    <DropMenu icon={<History size={16} />} title="Proyectos recientes" onOpen={() => window.dgus?.recentList().then(setList)}>
      {(close) => (
        <>
          {!list.length && <button disabled>Sin proyectos recientes</button>}
          {list.map((r) => (
            <button
              key={r.path}
              title={r.path}
              onClick={() => {
                close();
                openRecentProject(r.path);
              }}
            >
              {r.name}
              <span className="sc">{new Date(r.time).toLocaleDateString()}</span>
            </button>
          ))}
        </>
      )}
    </DropMenu>
  );
}

function ToolsMenu() {
  return (
    <DropMenu icon={<Wrench size={16} />} label="Herramientas" title="Buscar VP, importar páginas y exportar la tabla de variables">
      {(close) => (
        <>
          <button onClick={() => (close(), openDialog({ kind: 'findVp' }))}>
            <Search size={14} /> Buscar VP… <span className="sc">Ctrl+F</span>
          </button>
          <button
            onClick={async () => {
              close();
              const source = await pickPagesFromProject();
              if (source) openDialog({ kind: 'importPages', source });
            }}
          >
            <Files size={14} /> Importar páginas de otro proyecto…
          </button>
          <button onClick={() => (close(), openDialog({ kind: 'initValues' }))}>
            <ListChecks size={14} /> Valores iniciales libres…
          </button>
          <button onClick={() => (close(), openDialog({ kind: 'modbus' }))}>
            <Network size={14} /> Comunicación PLC / Modbus…
          </button>
          <button onClick={() => (close(), openDialog({ kind: 'network' }))}>
            <Network size={14} /> Red WiFi / DWIN Cloud…
          </button>
          <button onClick={() => (close(), openDialog({ kind: 'languages' }))}>Textos e idiomas…</button>
          <button onClick={() => (close(), openDialog({ kind: 'video' }))}>Convertir vídeo a ICL…</button>
          <button onClick={() => (close(), openDialog({ kind: 'audio' }))}>Audio WAV a WAE…</button>
          <button onClick={() => (close(), openDialog({ kind: 'fsk' }))}>Preparar cámara FSK…</button>
          <hr />
          <button onClick={() => (close(), exportVariables('csv'))}>
            <FileSpreadsheet size={14} /> Exportar tabla de variables (Excel/CSV)
          </button>
          <button onClick={() => (close(), exportVariables('h'))}>
            <FileCode2 size={14} /> Exportar direcciones VP para el MCU (.h)
          </button>
        </>
      )}
    </DropMenu>
  );
}
