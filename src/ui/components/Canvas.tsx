import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  Grid2x2Plus,
  Lock,
  MoveHorizontal,
  MoveVertical,
  Unlock,
  Grid3x3,
  ImagePlus,
  Maximize,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { getDef, hasDef } from '../../core/controls';
import type { ControlInstance, Rect } from '../../core/types';
import { setPageBackground } from '../actions';
import { usePage, useStore } from '../store';
import { ControlPreview } from './ControlView';
import { ArrayDialog } from './ToolsDialogs';
import { projectProfile } from '../../core/profiles';
import { simKey, simTouch, useComm, setSimOn, useSimAsk, useSimKeyboard } from '../comm';
import { DND_TYPE } from './Toolbox';

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

type Gesture =
  | { kind: 'move'; startX: number; startY: number; dx: number; dy: number; moved: boolean }
  | { kind: 'resize'; id: string; handle: Handle; start: Rect; startX: number; startY: number; rect: Rect }
  | { kind: 'marquee'; x0: number; y0: number; x1: number; y1: number; additive: boolean };

export function Canvas() {
  const page = usePage();
  const settings = useStore((s) => s.project.settings);
  const zoom = useStore((s) => s.zoom);
  const selection = useStore((s) => s.selection);
  const showGrid = useStore((s) => s.showGrid);
  const snap = useStore((s) => s.snap);
  const simOn = useComm((s) => s.simOn);
  const simZones = useComm((s) => s.simZones);
  const profileId = useStore((s) => s.project.settings.profileId);
  const profile = useMemo(() => projectProfile(useStore.getState().project), [profileId, settings.width, settings.height]);
  const st = useStore.getState;

  const scrollRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const [gesture, setGestureState] = useState<Gesture | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const setGesture = useCallback((next: Gesture | null | ((g: Gesture | null) => Gesture | null)) => {
    const value = typeof next === 'function' ? next(gestureRef.current) : next;
    gestureRef.current = value;
    setGestureState(value);
  }, []);
  const [dropHint, setDropHint] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [arrayOpen, setArrayOpen] = useState(false);

  const W = settings.width;
  const H = settings.height;

  /** Convierte coordenadas de ratón a píxeles de pantalla DGUS. */
  const toScreen = useCallback(
    (clientX: number, clientY: number) => {
      const r = screenRef.current!.getBoundingClientRect();
      return { x: (clientX - r.left) / zoom, y: (clientY - r.top) / zoom };
    },
    [zoom],
  );

  const snapV = (v: number, alt: boolean) => (alt || snap <= 1 ? Math.round(v) : Math.round(v / snap) * snap);

  // Ajusta el zoom para que la pantalla quepa al abrir el proyecto
  const fit = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const z = Math.min((el.clientWidth - 96) / W, (el.clientHeight - 96) / H);
    st().setZoom(Math.max(0.25, Math.min(2, Math.floor(z * 20) / 20)));
  }, [W, H, st]);
  useEffect(() => {
    fit();
  }, [fit]);

  // Zoom con Ctrl + rueda
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      st().setZoom(st().zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [st]);

  // Gestos globales
  useEffect(() => {
    if (!gesture) return;
    const onMove = (e: PointerEvent) => {
      const p = toScreen(e.clientX, e.clientY);
      setGesture((g) => {
        if (!g) return g;
        if (g.kind === 'move') {
          const dx = snapV(p.x - g.startX, e.altKey);
          const dy = snapV(p.y - g.startY, e.altKey);
          return { ...g, dx, dy, moved: g.moved || Math.abs(dx) > 0 || Math.abs(dy) > 0 };
        }
        if (g.kind === 'resize') {
          const dx = p.x - g.startX;
          const dy = p.y - g.startY;
          let { x, y, w, h } = g.start;
          if (g.handle.includes('e')) w = snapV(g.start.w + dx, e.altKey);
          if (g.handle.includes('s')) h = snapV(g.start.h + dy, e.altKey);
          if (g.handle.includes('w')) {
            const nx = snapV(g.start.x + dx, e.altKey);
            w = g.start.w + (g.start.x - nx);
            x = nx;
          }
          if (g.handle.includes('n')) {
            const ny = snapV(g.start.y + dy, e.altKey);
            h = g.start.h + (g.start.y - ny);
            y = ny;
          }
          if (w < 4) w = 4;
          if (h < 4) h = 4;
          return { ...g, rect: { x: Math.max(0, x), y: Math.max(0, y), w, h } };
        }
        return { ...g, x1: p.x, y1: p.y };
      });
    };
    const onUp = () => {
      // Se lee el gesto desde la referencia: los efectos no deben ir dentro de un
      // actualizador de estado (React los ejecuta dos veces en modo estricto).
      const g = gestureRef.current;
      gestureRef.current = null;
      setGesture(null);
      if (!g) return;
      const s = st();
      if (g.kind === 'move' && g.moved) s.moveSelection(g.dx, g.dy, `drag-${Date.now()}`);
      if (g.kind === 'resize') s.setRect(g.id, g.rect, `resize-${Date.now()}`);
      if (g.kind === 'marquee') {
        const x = Math.min(g.x0, g.x1);
        const y = Math.min(g.y0, g.y1);
        const w = Math.abs(g.x1 - g.x0);
        const h = Math.abs(g.y1 - g.y0);
        if (w > 2 || h > 2) {
          const ids = (page?.controls ?? [])
            .filter((c) => !c.hidden && c.x < x + w && c.x + c.w > x && c.y < y + h && c.y + c.h > y)
            .map((c) => c.id);
          s.select(ids, g.additive);
        } else if (!g.additive) s.select([]);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gesture?.kind, toScreen, page]);

  if (!page) return <main className="center" />;

  const startMove = (e: React.PointerEvent, c: ControlInstance) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setMenu(null);
    if (simOn) {
      if (!hasDef(c.type) || getDef(c.type).kind !== 'touch') return;
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      simTouch(c, { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
      return;
    }
    const s = st();
    if (e.shiftKey || e.ctrlKey) {
      s.select([c.id], true);
      return;
    }
    if (!s.selection.includes(c.id)) s.select([c.id]);
    if (c.locked) return;
    const p = toScreen(e.clientX, e.clientY);
    setGesture({ kind: 'move', startX: p.x, startY: p.y, dx: 0, dy: 0, moved: false });
  };

  const startResize = (e: React.PointerEvent, c: ControlInstance, handle: Handle) => {
    e.stopPropagation();
    const p = toScreen(e.clientX, e.clientY);
    const start = { x: c.x, y: c.y, w: c.w, h: c.h };
    setGesture({ kind: 'resize', id: c.id, handle, start, startX: p.x, startY: p.y, rect: start });
  };

  const startMarquee = (e: React.PointerEvent) => {
    if (e.button !== 0 || simOn) return;
    setMenu(null);
    const p = toScreen(e.clientX, e.clientY);
    setGesture({ kind: 'marquee', x0: p.x, y0: p.y, x1: p.x, y1: p.y, additive: e.shiftKey || e.ctrlKey });
  };

  const rectOf = (c: ControlInstance): Rect => {
    if (gesture?.kind === 'move' && selection.includes(c.id) && !c.locked) {
      return {
        x: Math.max(0, Math.min(W - c.w, c.x + gesture.dx)),
        y: Math.max(0, Math.min(H - c.h, c.y + gesture.dy)),
        w: c.w,
        h: c.h,
      };
    }
    if (gesture?.kind === 'resize' && gesture.id === c.id) return gesture.rect;
    return c;
  };

  const handlePos = (h: Handle, r: Rect) => {
    const x = h.includes('w') ? 0 : h.includes('e') ? r.w * zoom : (r.w * zoom) / 2;
    const y = h.includes('n') ? 0 : h.includes('s') ? r.h * zoom : (r.h * zoom) / 2;
    const cursor = { n: 'ns', s: 'ns', e: 'ew', w: 'ew', ne: 'nesw', sw: 'nesw', nw: 'nwse', se: 'nwse' }[h];
    return { left: x - 5, top: y - 5, cursor: `${cursor}-resize` };
  };

  const selectedOne = selection.length === 1 ? page.controls.find((c) => c.id === selection[0]) : undefined;

  return (
    <main className="center">
      <div className="canvas-bar">
        {simOn && (
          <button className="btn sim-badge" title="Salir de la simulación" onClick={() => setSimOn(false)}>
            ● Simulación
          </button>
        )}
        {simOn && (
          <button
            className={`btn ${simZones ? 'active' : ''}`}
            title="Las zonas táctiles no se ven en la pantalla real; aquí se muestran tenues para saber dónde tocar."
            onClick={() => useComm.setState({ simZones: !simZones })}
          >
            {simZones ? 'Ocultar zonas táctiles' : 'Mostrar zonas táctiles'}
          </button>
        )}
        <span className="page-title">{page.name}</span>
        <span className="muted">
          Página {page.id} · {W}×{H} · {page.controls.length} controles
        </span>
        <div className="spacer" />
        {selection.length > 1 && (
          <>
            <button className="btn icon" title="Alinear a la izquierda" onClick={() => st().align('left')}>
              <AlignStartVertical size={16} />
            </button>
            <button className="btn icon" title="Centrar horizontalmente" onClick={() => st().align('hcenter')}>
              <AlignCenterVertical size={16} />
            </button>
            <button className="btn icon" title="Alinear a la derecha" onClick={() => st().align('right')}>
              <AlignEndVertical size={16} />
            </button>
            <button className="btn icon" title="Alinear arriba" onClick={() => st().align('top')}>
              <AlignStartHorizontal size={16} />
            </button>
            <button className="btn icon" title="Centrar verticalmente" onClick={() => st().align('vcenter')}>
              <AlignCenterHorizontal size={16} />
            </button>
            <button className="btn icon" title="Alinear abajo" onClick={() => st().align('bottom')}>
              <AlignEndHorizontal size={16} />
            </button>
            <span className="tb-sep" />
            <button className="btn icon" title="Igualar ancho al primero seleccionado" onClick={() => st().sameSize('width')}>
              <MoveHorizontal size={16} />
            </button>
            <button className="btn icon" title="Igualar alto al primero seleccionado" onClick={() => st().sameSize('height')}>
              <MoveVertical size={16} />
            </button>
            <button className="btn icon" title="Distribuir horizontalmente (3 o más)" disabled={selection.length < 3} onClick={() => st().distribute('h')}>
              <AlignHorizontalSpaceAround size={16} />
            </button>
            <button className="btn icon" title="Distribuir verticalmente (3 o más)" disabled={selection.length < 3} onClick={() => st().distribute('v')}>
              <AlignVerticalSpaceAround size={16} />
            </button>
            <button className="btn icon" title="Bloquear posición" onClick={() => st().lockSelection(true)}>
              <Lock size={16} />
            </button>
            <button className="btn icon" title="Desbloquear" onClick={() => st().lockSelection(false)}>
              <Unlock size={16} />
            </button>
            <span style={{ width: 8 }} />
          </>
        )}
        {selection.length === 1 && !simOn && (
          <button className="btn" title="Copiar el control en filas y columnas (Array de V7.651)" onClick={() => setArrayOpen(true)}>
            <Grid2x2Plus size={16} /> Array
          </button>
        )}
        <button className="btn" title="Cambiar imagen de fondo" onClick={() => setPageBackground(page.id)}>
          <ImagePlus size={16} /> Fondo
        </button>
        <button className={`btn icon ${showGrid ? 'active' : ''}`} title="Cuadrícula" onClick={() => st().toggleGrid()}>
          <Grid3x3 size={16} />
        </button>
        <button className="btn icon" title="Alejar (Ctrl + rueda)" onClick={() => st().setZoom(zoom / 1.25)}>
          <ZoomOut size={16} />
        </button>
        <button className="btn zoom-label" title="Ajustar a la ventana" onClick={fit}>
          {Math.round(zoom * 100)}%
        </button>
        <button className="btn icon" title="Acercar (Ctrl + rueda)" onClick={() => st().setZoom(zoom * 1.25)}>
          <ZoomIn size={16} />
        </button>
        <button className="btn icon" title="Tamaño real (100%)" onClick={() => st().setZoom(1)}>
          <Maximize size={16} />
        </button>
      </div>

      <div className="canvas-scroll" ref={scrollRef} onClick={() => setMenu(null)}>
        <div className="canvas-stage">
          <div
            ref={screenRef}
            className={`screen ${dropHint ? 'drop-hint' : ''}`}
            style={{ width: W * zoom, height: H * zoom }}
            onPointerDown={startMarquee}
            onContextMenu={(e) => e.preventDefault()}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes(DND_TYPE)) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                setDropHint(true);
              }
            }}
            onDragLeave={() => setDropHint(false)}
            onDrop={(e) => {
              setDropHint(false);
              const type = e.dataTransfer.getData(DND_TYPE);
              if (!type || !hasDef(type)) return;
              e.preventDefault();
              const p = toScreen(e.clientX, e.clientY);
              const d = getDef(type).defaultSize;
              st().addControl(type, snapV(p.x - d.w / 2, false), snapV(p.y - d.h / 2, false));
            }}
          >
            {page.background && <img className="screen-bg" src={page.background} alt="" draggable={false} />}
            {profile.forma === 'circular' && (
              <svg className="screen-mask" width={W * zoom} height={H * zoom}>
                <defs>
                  <mask id="round-mask">
                    <rect width="100%" height="100%" fill="white" />
                    <circle cx={(W * zoom) / 2} cy={(H * zoom) / 2} r={(Math.min(W, H) * zoom) / 2} fill="black" />
                  </mask>
                </defs>
                <rect width="100%" height="100%" fill="rgba(0,0,0,0.72)" mask="url(#round-mask)" />
                <circle cx={(W * zoom) / 2} cy={(H * zoom) / 2} r={(Math.min(W, H) * zoom) / 2} fill="none" stroke="rgba(255,255,255,0.35)" strokeDasharray="6 6" />
              </svg>
            )}
            {showGrid && !simOn && <div className="screen-grid" style={{ backgroundSize: `${20 * zoom}px ${20 * zoom}px` }} />}
            {!page.background && page.controls.length === 0 && (
              <div className="screen-empty">
                <div>
                  Arrastre controles desde la izquierda
                  <br />
                  <span style={{ fontSize: 12 }}>o use «Fondo» para cargar la imagen de esta página</span>
                </div>
              </div>
            )}

            {page.controls.map((c) => {
              if (c.hidden) return null;
              const r = rectOf(c);
              const def = hasDef(c.type) ? getDef(c.type) : null;
              const sel = selection.includes(c.id);
              return (
                <div
                  key={c.id}
                  className={`ctl ${def?.kind ?? ''} ${sel && !simOn ? 'selected' : ''} ${c.locked ? 'locked' : ''} ${simOn ? 'sim' : ''}`}
                  style={{ left: r.x * zoom, top: r.y * zoom, width: r.w * zoom, height: r.h * zoom, overflow: sel ? 'visible' : 'hidden' }}
                  onPointerDown={(e) => startMove(e, c)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (simOn) return;
                    if (!st().selection.includes(c.id)) st().select([c.id]);
                    setMenu({ x: e.clientX, y: e.clientY });
                  }}
                  title={`${c.name}${def ? ` · ${def.label}` : ''}`}
                >
                  <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
                    {def ? <ControlPreview c={{ ...c, ...r }} zoom={zoom} /> : null}
                  </div>
                  {sel && !simOn && selection.length === 1 && (
                    <>
                      <div className="ctl-tag">
                        {c.name} · {r.x},{r.y} · {r.w}×{r.h}
                      </div>
                      {!c.locked &&
                        HANDLES.map((h) => (
                          <div key={h} className="handle" style={handlePos(h, r)} onPointerDown={(e) => startResize(e, c, h)} />
                        ))}
                    </>
                  )}
                </div>
              );
            })}

            {simOn && <SimKeyboardOverlay zoom={zoom} />}
            {simOn && <SimAskDialog />}
            {gesture?.kind === 'marquee' && (
              <div
                className="marquee"
                style={{
                  left: Math.min(gesture.x0, gesture.x1) * zoom,
                  top: Math.min(gesture.y0, gesture.y1) * zoom,
                  width: Math.abs(gesture.x1 - gesture.x0) * zoom,
                  height: Math.abs(gesture.y1 - gesture.y0) * zoom,
                }}
              />
            )}
          </div>
        </div>
      </div>

      {menu && (
        <div className="menu" style={{ left: menu.x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()}>
          <button onClick={() => (st().duplicateSelection(), setMenu(null))}>
            Duplicar <span className="sc">Ctrl+D</span>
          </button>
          <button onClick={() => (st().copy(), setMenu(null))}>
            Copiar <span className="sc">Ctrl+C</span>
          </button>
          <button onClick={() => (st().paste(), setMenu(null))}>
            Pegar <span className="sc">Ctrl+V</span>
          </button>
          <hr />
          <button onClick={() => (st().bringForward(1), setMenu(null))}>
            Traer adelante <span className="sc">Ctrl+]</span>
          </button>
          <button onClick={() => (st().bringForward(-1), setMenu(null))}>
            Enviar atrás <span className="sc">Ctrl+[</span>
          </button>
          {selectedOne && (
            <button onClick={() => (st().updateControl(selectedOne.id, { locked: !selectedOne.locked }), setMenu(null))}>
              {selectedOne.locked ? 'Desbloquear' : 'Bloquear posición'}
            </button>
          )}
          <hr />
          <button style={{ color: 'var(--danger)' }} onClick={() => (st().deleteSelection(), setMenu(null))}>
            Eliminar <span className="sc">Supr</span>
          </button>
        </div>
      )}
      {arrayOpen && <ArrayDialog onClose={() => setArrayOpen(false)} />}
    </main>
  );
}

/** Teclado del simulador: recorte de la página del teclado mostrado en su posición, como la pantalla. */
function SimKeyboardOverlay({ zoom }: { zoom: number }) {
  const kb = useSimKeyboard((s) => s.kb);
  const pages = useStore((s) => s.project.pages);
  const { width: W, height: H } = useStore((s) => s.project.settings);
  if (!kb) return null;
  const page = pages.find((p) => p.id === kb.kbPage);
  if (!page) return null;
  const { x1, y1, x2, y2 } = kb.area;
  const w = Math.max(1, x2 - x1);
  const h = Math.max(1, y2 - y1);
  const keys = page.controls.filter((c) => c.type === 'basicTouch' && c.x >= x1 - 1 && c.y >= y1 - 1 && c.x + c.w <= x2 + 1 && c.y + c.h <= y2 + 1);
  const echoX = Number(kb.control.props.showX) || kb.control.x + 4;
  const echoY = Number(kb.control.props.showY) || kb.control.y + 4;
  const hidden = !!kb.control.props.hide || !!kb.control.props.displayEn;
  return (
    // Tocar fuera del teclado lo cierra sin aplicar (como Esc).
    <div className="sim-kb-block" onPointerDown={(e) => (e.stopPropagation(), useSimKeyboard.setState({ kb: null }))}>
      <div className="sim-kb-echo" style={{ left: echoX * zoom, top: echoY * zoom, fontSize: Math.max(10, 16 * zoom) }}>
        {hidden ? '*'.repeat(kb.buffer.length) : kb.buffer}
        <span className="sim-kb-cursor">▏</span>
        {kb.caps && <span className="sim-kb-caps">MAYÚS</span>}
      </div>
      <div
        className="sim-kb"
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          left: kb.pos.x * zoom,
          top: kb.pos.y * zoom,
          width: w * zoom,
          height: h * zoom,
          backgroundImage: page.background ? `url(${page.background})` : undefined,
          backgroundSize: `${W * zoom}px ${H * zoom}px`,
          backgroundPosition: `${-x1 * zoom}px ${-y1 * zoom}px`,
        }}
      >
        {keys.map((k) => (
          <button
            key={k.id}
            className="sim-kb-key"
            title={`${k.name} (0x${String(k.props.keyValue)})`}
            style={{ left: (k.x - x1) * zoom, top: (k.y - y1) * zoom, width: k.w * zoom, height: k.h * zoom }}
            onPointerDown={(e) => {
              e.stopPropagation();
              simKey(parseInt(String(k.props.keyValue), 16));
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** Pide un valor en el simulador cuando la entrada no tiene un teclado de página utilizable. */
function SimAskDialog() {
  const ask = useSimAsk((s) => s.ask);
  const [value, setValue] = useState('');
  useEffect(() => setValue(ask?.current ?? ''), [ask]);
  if (!ask) return null;
  const done = (v: string | null) => {
    useSimAsk.setState({ ask: null });
    ask.resolve(v);
  };
  return (
    <div className="overlay" onPointerDown={() => done(null)}>
      <div className="dialog sim-ask" onPointerDown={(e) => e.stopPropagation()}>
        <h2>{ask.title}</h2>
        <div className="body">
          <input
            className="field"
            autoFocus
            inputMode={ask.kind === 'number' ? 'decimal' : 'text'}
            value={value}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') done(value);
              if (e.key === 'Escape') done(null);
            }}
          />
        </div>
        <div className="foot">
          <button className="btn outline" onClick={() => done(null)}>
            Cancelar
          </button>
          <button className="btn primary" onClick={() => done(value)}>
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}
