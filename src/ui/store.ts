import { create } from 'zustand';
import type { BuildMessage } from '../core/build';
import { createControl, getDef, newId } from '../core/controls';
import { newProject, nextFreePageId } from '../core/project';
import type { ControlInstance, Page, Project, PropValue, Rect } from '../core/types';
import { toHex } from '../core/bytes';
import { arrayCopies, refitAsciiBox, type ArrayOptions } from '../core/editing';
import { shareClone } from '../core/shareClone';

type Theme = 'dark' | 'light';

interface State {
  project: Project;
  filePath: string | null;
  dirty: boolean;
  documentId: number;
  pageId: number;
  selection: string[];
  zoom: number;
  showGrid: boolean;
  snap: number;
  theme: Theme;
  messages: BuildMessage[];
  outputOpen: boolean;
  past: Project[];
  future: Project[];
  clipboard: ControlInstance[];

  // acciones
  /** Pantalla de bienvenida visible (al arrancar y con el botón Inicio). */
  welcome: boolean;
  showWelcome(on: boolean): void;
  setProject(p: Project, filePath?: string | null): void;
  markSaved(filePath: string | null, snapshot?: Project, documentId?: number): void;
  mutate(fn: (draft: Project) => void, opts?: { coalesce?: string }): void;
  undo(): void;
  redo(): void;
  selectPage(id: number): void;
  addPage(): void;
  duplicatePage(id: number): void;
  deletePage(id: number): void;
  renamePage(id: number, name: string): void;
  setPageNumber(oldId: number, newId: number): boolean;
  setBackground(id: number, dataUrl: string | undefined): void;
  addControl(type: string, x: number, y: number): void;
  updateControl(id: string, patch: Partial<ControlInstance>, coalesceKey?: string): void;
  setProp(id: string, key: string, value: PropValue): void;
  moveSelection(dx: number, dy: number, coalesceKey?: string): void;
  setRect(id: string, r: Rect, coalesceKey?: string): void;
  deleteSelection(): void;
  duplicateSelection(): void;
  copy(): void;
  paste(): void;
  select(ids: string[], additive?: boolean): void;
  bringForward(dir: 1 | -1): void;
  align(mode: 'left' | 'right' | 'top' | 'bottom' | 'hcenter' | 'vcenter'): void;
  /** Igualar al primer control seleccionado. */
  sameSize(mode: 'width' | 'height' | 'both'): void;
  /** Repartir el espacio entre los seleccionados por igual. */
  distribute(axis: 'h' | 'v'): void;
  lockSelection(locked: boolean): void;
  /** Cambia una propiedad en todos los controles seleccionados que la tengan. */
  setPropMany(key: string, value: PropValue): void;
  addArray(o: ArrayOptions): void;
  setZoom(z: number): void;
  toggleGrid(): void;
  setTheme(t: Theme): void;
  setMessages(m: BuildMessage[]): void;
  setOutputOpen(v: boolean): void;
}

const clone = shareClone;
let lastCoalesce: { key: string; at: number } | null = null;

const currentPage = (s: { project: Project; pageId: number }): Page | undefined =>
  s.project.pages.find((p) => p.id === s.pageId);

function loadTheme(): Theme {
  try {
    const t = localStorage.getItem('dgus-theme');
    if (t === 'light' || t === 'dark') return t;
  } catch {
    /* sin almacenamiento */
  }
  return 'dark';
}

/** Siguiente VP libre en el proyecto (a partir de 0x5000), respetando el tamaño de cada variable. */
export function nextFreeVp(project: Project, words = 1): string {
  let max = 0x5000 - 1;
  let any = false;
  for (const page of project.pages)
    for (const c of page.controls) {
      const def = getDef(c.type);
      for (const f of def.vpFields ?? []) {
        const v = parseInt(String(c.props[f.key]), 16);
        if (!Number.isFinite(v) || v < 0x1000) continue;
        any = true;
        max = Math.max(max, v + Math.max(1, f.words(c.props)) - 1);
      }
    }
  void words;
  return toHex(any ? max + 1 : 0x5000);
}

export const useStore = create<State>((set, get) => ({
  project: newProject('Sin título'),
  welcome: true,
  filePath: null,
  dirty: false,
  documentId: 0,
  pageId: 0,
  selection: [],
  zoom: 1,
  showGrid: true,
  snap: 4,
  theme: loadTheme(),
  messages: [],
  outputOpen: false,
  past: [],
  future: [],
  clipboard: [],

  showWelcome(on) {
    set({ welcome: on });
  },
  setProject(p, filePath = null) {
    lastCoalesce = null;
    set({ welcome: false, project: p, filePath, documentId: get().documentId + 1, dirty: false, pageId: p.pages[0]?.id ?? 0, selection: [], past: [], future: [], messages: [] });
  },
  markSaved(filePath, snapshot = get().project, documentId = get().documentId) {
    if (documentId !== get().documentId) return;
    set({ filePath, dirty: get().project !== snapshot });
  },

  mutate(fn, opts) {
    const s = get();
    const now = Date.now();
    const coalesce = opts?.coalesce && lastCoalesce?.key === opts.coalesce && now - lastCoalesce.at < 800;
    const draft = clone(s.project);
    fn(draft);
    set({
      project: draft,
      dirty: true,
      past: coalesce ? s.past : [...s.past.slice(-99), s.project],
      future: [],
    });
    lastCoalesce = opts?.coalesce ? { key: opts.coalesce, at: now } : null;
  },
  undo() {
    const s = get();
    const prev = s.past[s.past.length - 1];
    if (!prev) return;
    set({ project: prev, past: s.past.slice(0, -1), future: [s.project, ...s.future], dirty: true });
    if (!prev.pages.some((p) => p.id === s.pageId)) set({ pageId: prev.pages[0]?.id ?? 0 });
  },
  redo() {
    const s = get();
    const next = s.future[0];
    if (!next) return;
    set({ project: next, future: s.future.slice(1), past: [...s.past, s.project], dirty: true });
  },

  selectPage(id) {
    set({ pageId: id, selection: [] });
  },
  addPage() {
    const id = nextFreePageId(get().project);
    get().mutate((d) => {
      d.pages.push({ id, name: `Página ${id}`, controls: [] });
      d.pages.sort((a, b) => a.id - b.id);
    });
    set({ pageId: id, selection: [] });
  },
  duplicatePage(id) {
    const src = get().project.pages.find((p) => p.id === id);
    if (!src) return;
    const nid = nextFreePageId(get().project);
    get().mutate((d) => {
      const copy = clone(src);
      copy.id = nid;
      copy.name = `${src.name} (copia)`;
      copy.controls.forEach((c) => (c.id = newId()));
      d.pages.push(copy);
      d.pages.sort((a, b) => a.id - b.id);
    });
    set({ pageId: nid, selection: [] });
  },
  deletePage(id) {
    const s = get();
    if (s.project.pages.length <= 1) return;
    s.mutate((d) => {
      d.pages = d.pages.filter((p) => p.id !== id);
    });
    if (s.pageId === id) set({ pageId: get().project.pages[0].id, selection: [] });
  },
  renamePage(id, name) {
    get().mutate((d) => {
      const p = d.pages.find((x) => x.id === id);
      if (p) p.name = name;
    }, { coalesce: `rename-${id}` });
  },
  setPageNumber(oldId, newIdNum) {
    const s = get();
    if (oldId === newIdNum) return true;
    if (!Number.isInteger(newIdNum) || s.project.pages.some((p) => p.id === newIdNum) || newIdNum < 0 || newIdNum > 4091) return false;
    s.mutate((d) => {
      const p = d.pages.find((x) => x.id === oldId);
      if (p) p.id = newIdNum;
      d.pages.sort((a, b) => a.id - b.id);
    });
    if (s.pageId === oldId) set({ pageId: newIdNum });
    return true;
  },
  setBackground(id, dataUrl) {
    get().mutate((d) => {
      const p = d.pages.find((x) => x.id === id);
      if (p) p.background = dataUrl;
    });
  },

  addControl(type, x, y) {
    const s = get();
    const def = getDef(type);
    const c = createControl(type, x, y);
    const { width, height } = s.project.settings;
    c.x = Math.max(0, Math.min(width - c.w, c.x));
    c.y = Math.max(0, Math.min(height - c.h, c.y));
    if (def.vpFields?.some((f) => f.key === 'vp')) c.props.vp = nextFreeVp(s.project);
    const page = currentPage(s);
    const sameType = page?.controls.filter((k) => k.type === type).length ?? 0;
    c.name = `${def.label} ${sameType + 1}`;
    s.mutate((d) => {
      d.pages.find((p) => p.id === s.pageId)?.controls.push(c);
    });
    set({ selection: [c.id] });
  },
  updateControl(id, patch, coalesceKey) {
    const s = get();
    s.mutate((d) => {
      const c = d.pages.find((p) => p.id === s.pageId)?.controls.find((k) => k.id === id);
      if (c) Object.assign(c, patch);
    }, { coalesce: coalesceKey });
  },
  setProp(id, key, value) {
    const s = get();
    s.mutate((d) => {
      const c = d.pages.find((p) => p.id === s.pageId)?.controls.find((k) => k.id === id);
      if (c) {
        c.props[key] = value;
        refitAsciiBox(c, key);
      }
    }, { coalesce: `prop-${id}-${key}` });
  },
  moveSelection(dx, dy, coalesceKey) {
    const s = get();
    const { width, height } = s.project.settings;
    s.mutate((d) => {
      const page = d.pages.find((p) => p.id === s.pageId);
      page?.controls.forEach((c) => {
        if (!s.selection.includes(c.id) || c.locked) return;
        c.x = Math.max(0, Math.min(width - c.w, c.x + dx));
        c.y = Math.max(0, Math.min(height - c.h, c.y + dy));
      });
    }, { coalesce: coalesceKey ?? 'nudge' });
  },
  setRect(id, r, coalesceKey) {
    get().updateControl(id, { x: r.x, y: r.y, w: Math.max(4, r.w), h: Math.max(4, r.h) }, coalesceKey);
  },
  deleteSelection() {
    const s = get();
    if (!s.selection.length) return;
    s.mutate((d) => {
      const page = d.pages.find((p) => p.id === s.pageId);
      if (page) page.controls = page.controls.filter((c) => !s.selection.includes(c.id));
    });
    set({ selection: [] });
  },
  duplicateSelection() {
    get().copy();
    get().paste();
  },
  copy() {
    const s = get();
    const page = currentPage(s);
    set({ clipboard: clone(page?.controls.filter((c) => s.selection.includes(c.id)) ?? []) });
  },
  paste() {
    const s = get();
    if (!s.clipboard.length) return;
    const copies = s.clipboard.map((c) => ({ ...clone(c), id: newId(), x: c.x + 16, y: c.y + 16 }));
    s.mutate((d) => {
      d.pages.find((p) => p.id === s.pageId)?.controls.push(...copies);
    });
    set({ selection: copies.map((c) => c.id), clipboard: copies });
  },
  select(ids, additive) {
    const s = get();
    if (!additive) return set({ selection: ids });
    const sel = new Set(s.selection);
    ids.forEach((id) => (sel.has(id) ? sel.delete(id) : sel.add(id)));
    set({ selection: [...sel] });
  },
  bringForward(dir) {
    const s = get();
    s.mutate((d) => {
      const page = d.pages.find((p) => p.id === s.pageId);
      if (!page) return;
      const list = page.controls;
      const idxs = list.map((c, i) => (s.selection.includes(c.id) ? i : -1)).filter((i) => i >= 0);
      const order = dir === 1 ? idxs.reverse() : idxs;
      for (const i of order) {
        const j = i + dir;
        if (j < 0 || j >= list.length || s.selection.includes(list[j].id)) continue;
        [list[i], list[j]] = [list[j], list[i]];
      }
    });
  },
  sameSize(mode) {
    const s = get();
    const page = currentPage(s);
    const ref = page?.controls.find((c) => c.id === s.selection[0]);
    if (!ref || s.selection.length < 2) return;
    s.mutate((d) => {
      d.pages.find((p) => p.id === s.pageId)?.controls.forEach((c) => {
        if (!s.selection.includes(c.id) || c.locked) return;
        if (mode !== 'height') c.w = ref.w;
        if (mode !== 'width') c.h = ref.h;
      });
    });
  },
  distribute(axis) {
    const s = get();
    const page = currentPage(s);
    const sel = (page?.controls.filter((c) => s.selection.includes(c.id)) ?? []).slice();
    if (sel.length < 3) return;
    const pos = (c: Rect) => (axis === 'h' ? c.x : c.y);
    const size = (c: Rect) => (axis === 'h' ? c.w : c.h);
    sel.sort((a, b) => pos(a) - pos(b));
    const first = pos(sel[0]);
    const last = pos(sel[sel.length - 1]) + size(sel[sel.length - 1]);
    const gap = (last - first - sel.reduce((n, c) => n + size(c), 0)) / (sel.length - 1);
    const target = new Map<string, number>();
    let at = first;
    for (const c of sel) {
      target.set(c.id, Math.round(at));
      at += size(c) + gap;
    }
    s.mutate((d) => {
      d.pages.find((p) => p.id === s.pageId)?.controls.forEach((c) => {
        const v = target.get(c.id);
        if (v == null || c.locked) return;
        if (axis === 'h') c.x = v;
        else c.y = v;
      });
    });
  },
  lockSelection(locked) {
    const s = get();
    s.mutate((d) => {
      d.pages.find((p) => p.id === s.pageId)?.controls.forEach((c) => {
        if (s.selection.includes(c.id)) c.locked = locked;
      });
    });
  },
  setPropMany(key, value) {
    const s = get();
    s.mutate((d) => {
      d.pages.find((p) => p.id === s.pageId)?.controls.forEach((c) => {
        if (s.selection.includes(c.id) && key in c.props) {
          c.props[key] = value;
          refitAsciiBox(c, key);
        }
      });
    }, { coalesce: `many-${key}` });
  },
  addArray(o) {
    const s = get();
    const page = currentPage(s);
    const base = page?.controls.find((c) => c.id === s.selection[0]);
    if (!base) return;
    const copies = arrayCopies(base, o);
    s.mutate((d) => {
      d.pages.find((p) => p.id === s.pageId)?.controls.push(...copies);
    });
    set({ selection: [base.id, ...copies.map((c) => c.id)] });
  },
  align(mode) {
    const s = get();
    const page = currentPage(s);
    const sel = page?.controls.filter((c) => s.selection.includes(c.id)) ?? [];
    if (sel.length < 2) return;
    const minX = Math.min(...sel.map((c) => c.x));
    const maxR = Math.max(...sel.map((c) => c.x + c.w));
    const minY = Math.min(...sel.map((c) => c.y));
    const maxB = Math.max(...sel.map((c) => c.y + c.h));
    s.mutate((d) => {
      d.pages.find((p) => p.id === s.pageId)?.controls.forEach((c) => {
        if (!s.selection.includes(c.id)) return;
        if (mode === 'left') c.x = minX;
        if (mode === 'right') c.x = maxR - c.w;
        if (mode === 'top') c.y = minY;
        if (mode === 'bottom') c.y = maxB - c.h;
        if (mode === 'hcenter') c.x = Math.round((minX + maxR) / 2 - c.w / 2);
        if (mode === 'vcenter') c.y = Math.round((minY + maxB) / 2 - c.h / 2);
      });
    });
  },
  setZoom(z) {
    set({ zoom: Math.min(4, Math.max(0.25, Math.round(z * 100) / 100)) });
  },
  toggleGrid() {
    set({ showGrid: !get().showGrid });
  },
  setTheme(t) {
    try {
      localStorage.setItem('dgus-theme', t);
    } catch {
      /* sin almacenamiento */
    }
    set({ theme: t });
  },
  setMessages(m) {
    set({ messages: m, outputOpen: true });
  },
  setOutputOpen(v) {
    set({ outputOpen: v });
  },
}));

export const usePage = () => useStore((s) => s.project.pages.find((p) => p.id === s.pageId));
