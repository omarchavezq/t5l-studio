import { useEffect, useState } from 'react';
import { CircleCheck, CircleX } from 'lucide-react';
import { Canvas } from './components/Canvas';
import { NewProjectDialog, SettingsDialog } from './components/Dialogs';
import { FontDialog } from './components/FontDialog';
import { ConflictDialog } from './components/ConflictDialog';
import { ToolDialogs } from './components/ToolsDialogs';
import { openDialog } from './uiState';
import { Output } from './components/Output';
import { Pages } from './components/Pages';
import { Properties } from './components/Properties';
import { Toolbox } from './components/Toolbox';
import { Topbar } from './components/Topbar';
import { compile, exportDwinSet, openProject, saveProject } from './actions';
import { useStore } from './store';
import { useToast } from './toast';
import { isElectron } from './platform';
import { choosePort, setLink, simKey, useComm, useSimKeyboard } from './comm';
import { projectProfile } from '../core/profiles';
import { deserialize } from '../core/project';
import { Welcome } from './components/Welcome';
import { watchRecent } from './recent';

export function App() {
  const theme = useStore((s) => s.theme);
  const welcome = useStore((s) => s.welcome);
  const [dialog, setDialog] = useState<'new' | 'settings' | 'fonts' | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => watchRecent(), []);

  // Proyecto abierto con doble clic desde el Explorador
  useEffect(() => {
    window.dgus?.onOpenFile?.((f) => {
      try {
        useStore.getState().setProject(deserialize(f.text), f.path);
      } catch (e) {
        window.alert(`No se pudo abrir: ${(e as Error).message}`);
      }
    });
  }, []);

  // El CRC del puerto serie sigue al perfil de la pantalla
  const profileId = useStore((s) => s.project.settings.profileId);
  const cfgCrc = useStore((s) => (s.project.settings.deviceConfig === 'custom' ? s.project.settings.cfg?.crc : undefined));
  useEffect(() => {
    const crc = cfgCrc ?? projectProfile(useStore.getState().project).firmware.crcPorDefecto;
    const link = useComm.getState().link;
    if (link.crc !== crc) setLink({ ...link, crc });
  }, [profileId, cfgCrc]);

  // Atajos de teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
      const s = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 's') {
        e.preventDefault();
        saveProject(e.shiftKey);
        return;
      }
      if (mod && k === 'o') {
        e.preventDefault();
        openProject();
        return;
      }
      if (mod && k === 'f') {
        e.preventDefault();
        openDialog({ kind: 'findVp' });
        return;
      }
      if (mod && k === 'b') {
        e.preventDefault();
        compile();
        return;
      }
      if (e.key === 'F5') {
        e.preventDefault();
        exportDwinSet();
        return;
      }
      if (typing) return;
      // Teclado del simulador abierto: el teclado del PC también escribe (Esc cancela, Enter acepta).
      if (useSimKeyboard.getState().kb) {
        e.preventDefault();
        if (e.key === 'Escape') return useSimKeyboard.setState({ kb: null });
        if (e.key === 'Enter') return void simKey(0xf1);
        if (e.key === 'Backspace') return void simKey(0xf2);
        if (e.key.length === 1 && !mod) return void simKey(e.key.charCodeAt(0));
        return;
      }
      if (useComm.getState().simOn) return; // en simulación no se edita el proyecto con el teclado
      if (mod && k === 'z' && !e.shiftKey) return e.preventDefault(), s.undo();
      if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) return e.preventDefault(), s.redo();
      if (mod && k === 'd') return e.preventDefault(), s.duplicateSelection();
      if (mod && k === 'c') return s.copy();
      if (mod && k === 'v') return s.paste();
      if (mod && k === 'a') {
        e.preventDefault();
        return s.select(s.project.pages.find((p) => p.id === s.pageId)?.controls.map((c) => c.id) ?? []);
      }
      if (mod && e.key === ']') return s.bringForward(1);
      if (mod && e.key === '[') return s.bringForward(-1);
      if (e.key === 'Delete' || e.key === 'Backspace') return s.deleteSelection();
      if (e.key === 'Escape') return s.select([]);
      const step = e.shiftKey ? 10 : 1;
      const arrows: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      if (arrows[e.key] && s.selection.length) {
        e.preventDefault();
        s.moveSelection(...arrows[e.key]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Aviso al cerrar con cambios sin guardar
  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => {
      if (useStore.getState().dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBefore);
    return () => window.removeEventListener('beforeunload', onBefore);
  }, []);

  if (welcome)
    return (
      <>
        <Welcome onNew={() => setDialog('new')} />
        {dialog === 'new' && <NewProjectDialog onClose={() => setDialog(null)} />}
        <ConflictDialog />
        <Toast />
      </>
    );

  return (
    <div className="app">
      <Topbar onNew={() => setDialog('new')} onSettings={() => setDialog('settings')} onFonts={() => setDialog('fonts')} />
      <Toolbox />
      <Canvas />
      <aside className="panel right">
        <Pages />
        <Properties />
      </aside>
      <Output />
      <StatusBar />
      {dialog === 'new' && <NewProjectDialog onClose={() => setDialog(null)} />}
      {dialog === 'settings' && <SettingsDialog onClose={() => setDialog(null)} />}
      {dialog === 'fonts' && <FontDialog onClose={() => setDialog(null)} />}
      <ConflictDialog />
      <ToolDialogs />
      <PortPicker />
      <Toast />
    </div>
  );
}

function StatusBar() {
  const s = useStore((x) => x.project.settings);
  const pages = useStore((x) => x.project.pages);
  const total = pages.reduce((n, p) => n + p.controls.length, 0);
  const messages = useStore((x) => x.messages);
  const setOpen = useStore((x) => x.setOutputOpen);
  const errors = messages.filter((m) => m.level === 'error').length;
  const warns = messages.filter((m) => m.level === 'warn').length;
  return (
    <footer className="status">
      <span>
        Pantalla <b>{projectProfile(useStore.getState().project).nombre}</b>{!projectProfile(useStore.getState().project).generico && <> · {s.width}×{s.height}</>}
      </span>
      <span>
        <b>{pages.length}</b> páginas · <b>{total}</b> controles
      </span>
      <span>
        Salida: <b>{s.touchFileName}</b>, <b>{s.showFileName}</b>, <b>{s.configFileName}</b>
      </span>
      <div className="spacer" />
      {messages.length > 0 && (
        <button className="btn" style={{ height: 20, fontSize: 11.5 }} onClick={() => setOpen(true)}>
          {errors} errores · {warns} avisos
        </button>
      )}
      <span>{isElectron() ? 'Escritorio' : 'Navegador'}</span>
    </footer>
  );
}

function PortPicker() {
  const picker = useComm((s) => s.portPicker);
  if (!picker) return null;
  return (
    <div className="overlay" onPointerDown={() => choosePort(null)}>
      <div className="dialog" onPointerDown={(e) => e.stopPropagation()}>
        <h2>Elegir puerto serie</h2>
        <div className="sub">Conecte la pantalla (o el MCU) con un adaptador USB-serie.</div>
        <div className="body">
          {!picker.ports.length && <div className="msg warn">No se encontraron puertos serie.</div>}
          {picker.ports.map((p) => (
            <button key={p.portId} className="btn outline" style={{ justifyContent: 'flex-start', height: 38 }} onClick={() => choosePort(p.portId)}>
              {p.portName} {p.displayName ? `· ${p.displayName}` : ''}
            </button>
          ))}
        </div>
        <div className="foot">
          <button className="btn outline" onClick={() => choosePort(null)}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function Toast() {
  const { text, kind } = useToast();
  if (!text) return null;
  return (
    <div className="toast">
      {kind === 'error' ? <CircleX size={16} color="var(--danger)" /> : <CircleCheck size={16} color="var(--ok)" />}
      {text}
    </div>
  );
}
