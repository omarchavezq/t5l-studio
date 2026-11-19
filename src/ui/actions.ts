import { buildProject } from '../core/build';
import { fromBase64, toBase64 } from '../core/bytes';
import { buildIcl, parseIcl, type IclImage } from '../core/icl';
import { importDwinSet } from '../core/importer';
import { deserialize, newProject, nextFreePageId, pageIdFromFileName, serialize } from '../core/project';
import { applyReassignment, basicDeviceConfig, planReassignment, prepareMissingFonts, preservedFiles, validatePackage, type PackageFile, type ReassignmentPlan } from '../core/package';
import { create } from 'zustand';
import type { Project, ProjectSettings } from '../core/types';
import { DEFAULT_RENDER, makeRenderer } from './fontRender';
import { exportFiles, iclJpeg, isElectron, openFolder, openImages, openProjectFile, saveProjectFile } from './platform';
import { useStore } from './store';
import { toast } from './toast';
import { useComm } from './comm';
import { buildCfg, defaultCfg } from '../core/cfg';
import { cName, variableCsv, variableHeader, variableTable } from '../core/editing';
import { keyboardArea, keyboardLayout, type KeyboardKind, type KeyboardOptions } from '../core/keyboard';
import { createControl, newId } from '../core/controls';
import { toHex } from '../core/bytes';
import { saveSingleFile } from './platform';
import { drawKeyboard } from './keyboardImage';
import { restoreProjectMetadata } from '../core/projectMetadata';

const confirmDiscard = () => !useStore.getState().dirty || window.confirm('Hay cambios sin guardar. ¿Descartarlos?');

export function createProject(name: string, settings: Partial<ProjectSettings>) {
  useStore.getState().setProject(newProject(name, settings));
}

export async function openProject() {
  if (!confirmDiscard()) return;
  const r = await openProjectFile();
  if (!r) return;
  try {
    useStore.getState().setProject(deserialize(r.text), r.path);
    toast('Proyecto abierto');
  } catch (e) {
    window.alert(`No se pudo abrir: ${(e as Error).message}`);
  }
}

let saving = false;
export async function saveProject(saveAs = false): Promise<boolean> {
  if (saving) return false;
  saving = true;
  const s = useStore.getState();
  try {
    const path = await saveProjectFile(saveAs ? null : s.filePath, s.project.name, serialize(s.project));
    if (isElectron() && path == null) return false;
    s.markSaved(path ?? s.filePath, s.project, s.documentId);
    toast(path ? `Guardado en ${path}` : 'Proyecto descargado');
    return true;
  } catch (e) {
    toast(`No se pudo guardar: ${(e as Error).message}`, 'error');
    return false;
  } finally {
    saving = false;
  }
}

export function compile(showOutput = true) {
  const s = useStore.getState();
  const r = buildProject(s.project);
  s.setMessages(r.messages);
  if (showOutput) useComm.setState({ bottomTab: 'output' });
  return r;
}

/** Importa un proyecto hecho con DGUS 7.6 desde su carpeta DWIN_SET. */
export async function importDwinSetFolder() {
  if (!confirmDiscard()) return;
  const r = await openFolder();
  if (!r) return;
  try {
    const rep = importDwinSet(r.files, r.folder || 'Proyecto importado');
    if (r.metadata?.length) {
      const restored = restoreProjectMetadata(rep.project, r.metadata);
      rep.project = restored.project; rep.notes.push(...restored.notes);
    }
    useStore.getState().setProject(rep.project);
    const { stats } = rep;
    useStore.getState().setMessages([
      {
        level: 'info',
        text: `Importado «${rep.project.name}»: ${stats.pages} páginas, ${stats.touch} táctiles, ${stats.display} de visualización, ${stats.icl} ICL, resolución ${rep.project.settings.width}×${rep.project.settings.height}.`,
      },
      ...rep.notes.map((t) => ({ level: 'warn' as const, text: t })),
    ]);
    toast('Proyecto DGUS importado');
  } catch (e) {
    window.alert(`No se pudo importar: ${(e as Error).message}`);
  }
}

/** Genera el ICL de fondos: parte del original (si existe) y reemplaza las páginas con fondo. */
export async function buildBackgroundIcl(project = useStore.getState().project): Promise<{ id: number; data: Uint8Array } | null> {
  const { settings } = project;
  const id = settings.bgIclId;
  const images = new Map<number, IclImage>();
  const original = project.icl?.[id];
  if (original) for (const img of parseIcl(fromBase64(original)).images) images.set(img.id, img);
  for (const page of project.pages) {
    if (!page.background) { images.delete(page.id); continue; }
    const previous = images.get(page.id);
    // Un ICL puede contener imágenes parciales (por ejemplo, teclados). Una imagen
    // importada sin editar conserva sus dimensiones, aunque difieran de la pantalla.
    if (previous && page.background === `data:image/jpeg;base64,${toBase64(previous.jpeg)}`) continue;
    const j = await iclJpeg(page.background, settings.width, settings.height, settings.jpegQuality);
    images.set(page.id, { id: page.id, width: j.width, height: j.height, jpeg: j.jpeg });
  }
  if (!images.size) return null;
  return { id, data: buildIcl([...images.values()], id) };
}

/** Error de generación causado solo por archivos que comparten sectores; la interfaz ofrece resolverlo. */
export class PackageConflictError extends Error {
  constructor(readonly files: PackageFile[], readonly project: Project) {
    super('El paquete tiene errores: hay archivos que comparten sectores de memoria.');
  }
}

export interface CollectOptions {
  /** Generar aunque haya archivos solapados, como DGUS 7.6 (queda como aviso). */
  allowOverlap?: boolean;
}

/** Genera todos los archivos de DWIN_SET (13/14/22, ICL, archivos conservados). Lanza un error si la compilación falla. */
export async function collectDwinSetFiles(opts: CollectOptions = {}): Promise<{ name: string; data: Uint8Array }[]> {
  const snapshot = useStore.getState();
  try {
    return await prepareDwinSetFiles(opts);
  } catch (e) {
    const current = useStore.getState();
    if (current.documentId === snapshot.documentId && current.project === snapshot.project && !(e instanceof PackageConflictError)) {
      current.setMessages([...current.messages, { level: 'error', text: (e as Error).message }]);
    }
    throw e;
  }
}

async function prepareDwinSetFiles(opts: CollectOptions): Promise<PackageFile[]> {
  const s = useStore.getState();
  const source = s.project;
  const r = buildProject(source);
  s.setMessages(r.messages);
  if (r.messages.some((m) => m.level === 'error')) throw new Error('Hay errores de compilación: revise la salida.');
  const { settings } = source;
  const binaries = (p: Project) => {
    const built = buildProject(p);
    if (built.messages.some((m) => m.level === 'error')) throw new Error('Hay errores de compilación: revise la salida.');
    return [
      { name: settings.touchFileName, data: built.touch },
      { name: settings.showFileName, data: built.show },
      { name: settings.configFileName, data: built.config },
      ...(built.knobLib ? [{ name: '120.lib', data: built.knobLib }] : []),
    ];
  };
  const reserved: PackageFile[] = [
    { name: settings.touchFileName, data: r.touch },
    { name: settings.showFileName, data: r.show },
    { name: settings.configFileName, data: r.config },
  ];
  const bg = await buildBackgroundIcl(source);
  if (bg) reserved.push({ name: `${bg.id}.icl`, data: bg.data });
  for (const [id, b64] of Object.entries(source.icl ?? {})) {
    if (Number(id) === settings.bgIclId) continue;
    reserved.push({ name: `${id}.icl`, data: fromBase64(b64) });
  }
  if (settings.autoFonts && typeof document !== 'undefined') {
    await document.fonts.load(`16px "${settings.fontFamily ?? 'Arial'}"`);
    await document.fonts.ready;
  }
  const prepared = prepareMissingFonts(source, reserved, () => makeRenderer({ ...DEFAULT_RENDER, family: settings.fontFamily ?? 'Arial' }));
  const files = [...binaries(prepared.project), ...reserved.slice(3), ...preservedFiles(prepared.project)];
  if (settings.deviceConfig === 'basic' && !files.some((f) => /^T5LCFG.*\.cfg$/i.test(f.name))) files.push({ name: 'T5LCFG.CFG', data: basicDeviceConfig(prepared.project) });
  if (settings.deviceConfig === 'custom') {
    // CFG editado: se parte del importado (conserva tiempos LCD y táctil de fábrica) o del básico.
    const i = files.findIndex((f) => /^T5LCFG.*\.cfg$/i.test(f.name));
    const base = i >= 0 ? files[i].data : basicDeviceConfig(prepared.project);
    const model = { ...(settings.cfg ?? defaultCfg(settings.bgIclId, settings.rotation)), bgIclId: settings.bgIclId };
    const data = buildCfg(model, base);
    if (i >= 0) files[i] = { name: files[i].name, data };
    else files.push({ name: 'T5LCFG.CFG', data });
  }
  const issues = validatePackage(files, prepared.project, { allowOverlap: opts.allowOverlap });
  const current = useStore.getState();
  if (current.documentId !== s.documentId || current.project !== source) throw new Error('El proyecto cambió durante la generación. Vuelva a generar para incluir sus cambios.');
  s.setMessages([...r.messages, ...issues]);
  const errors = issues.filter((m) => m.level === 'error');
  if (errors.length && errors.every((m) => m.code === 'overlap')) throw new PackageConflictError(files, prepared.project);
  if (errors.length) throw new Error('El paquete tiene errores: revise la salida.');
  if (prepared.generated) s.mutate((d) => Object.assign(d, prepared.project));
  s.setMessages([...r.messages, ...issues, { level: 'info', text: `Paquete preparado: ${files.length} archivos; ${prepared.generated} bibliotecas de fuentes creadas. Guarde el proyecto para conservar los recursos generados.` }]);
  return files;
}

/** Compila y escribe DWIN_SET completo: 13/14/22, ICL de fondos, ICL de iconos y archivos conservados. */
export async function exportDwinSet(opts: CollectOptions = {}) {
  if (exporting) return;
  exporting = true;
  toast('Preparando paquete para pantalla…');
  try {
    const files = await collectDwinSetFiles(opts);
    const where = await exportFiles(files);
    if (where) toast(`Generado: ${files.length} archivos → ${where}`);
  } catch (e) {
    if (e instanceof PackageConflictError) {
      useConflict.setState({ conflict: { files: e.files, project: e.project, plan: planReassignment(e.files, e.project) } });
      return;
    }
    toast((e as Error).message, 'error');
    useComm.setState({ bottomTab: 'output' });
    useStore.getState().setOutputOpen(true);
  } finally {
    exporting = false;
  }
}
let exporting = false;

// ------------------------------------------------------------------ conflictos de sectores

export const useConflict = create<{ conflict: { files: PackageFile[]; project: Project; plan: ReassignmentPlan } | null }>(() => ({ conflict: null }));

/** Aplica la reasignación propuesta al proyecto (se puede deshacer) y vuelve a generar. */
export async function resolveConflictByReassign() {
  const c = useConflict.getState().conflict;
  if (!c) return;
  useConflict.setState({ conflict: null });
  const next = applyReassignment(useStore.getState().project, c.plan);
  useStore.getState().mutate((d) => Object.assign(d, next));
  await exportDwinSet();
}

/** Genera el paquete tal cual, como DGUS 7.6, dejando los solapes como aviso. */
export async function resolveConflictByIgnoring() {
  useConflict.setState({ conflict: null });
  await exportDwinSet({ allowOverlap: true });
}

/** Importa imágenes de fondo. "3.jpg" o "3_menu.png" se asigna a la página 3 (se crea si no existe). */
export async function importBackgrounds() {
  const imgs = await openImages();
  if (!imgs.length) return;
  const s = useStore.getState();
  let assigned = 0;
  s.mutate((d) => {
    for (const img of imgs) {
      let id = pageIdFromFileName(img.name);
      if (id == null) {
        id = 0;
        while (d.pages.some((p) => p.id === id)) id++;
      }
      let page = d.pages.find((p) => p.id === id);
      if (!page) {
        page = { id, name: img.name.replace(/\.[^.]+$/, ''), controls: [] };
        d.pages.push(page);
      }
      page.background = img.dataUrl;
      assigned++;
    }
    d.pages.sort((a, b) => a.id - b.id);
  });
  toast(`${assigned} fondo(s) importados`);
}

export async function setPageBackground(pageId: number) {
  const [img] = await openImages();
  if (img) useStore.getState().setBackground(pageId, img.dataUrl);
}

/** Añade al proyecto archivos .icl existentes (bibliotecas de iconos). */
export async function addIclFiles() {
  const r = await openFolderOrFiles('.icl');
  if (!r.length) return;
  const s = useStore.getState();
  let n = 0;
  s.mutate((d) => {
    d.icl ??= {};
    for (const f of r) {
      const id = parseInt(f.name, 10);
      if (!Number.isFinite(id)) continue;
      try {
        parseIcl(f.data);
        d.icl[id] = toBase64(f.data);
        d.iconLibs[id] = f.name;
        n++;
      } catch {
        /* no es un ICL válido */
      }
    }
  });
  toast(n ? `${n} biblioteca(s) ICL añadidas` : 'Ningún archivo ICL válido', n ? 'ok' : 'error');
}

/** Crea una biblioteca ICL a partir de imágenes "0.png, 1.png…" (el número inicial es el ID del icono). */
export async function createIclFromImages(iclId: number) {
  const imgs = await openImages();
  if (!imgs.length) return;
  const s = useStore.getState();
  const quality = s.project.settings.jpegQuality;
  const list: IclImage[] = [];
  let next = 0;
  for (const img of imgs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) {
    const id = pageIdFromFileName(img.name) ?? next;
    next = id + 1;
    const j = await iclJpeg(img.dataUrl, null, null, quality);
    list.push({ id, width: j.width, height: j.height, jpeg: j.jpeg });
  }
  const data = buildIcl(list, iclId);
  s.mutate((d) => {
    d.icl ??= {};
    d.icl[iclId] = toBase64(data);
    d.iconLibs[iclId] = `${iclId}.icl`;
  });
  toast(`${iclId}.icl creado con ${list.length} imágenes (${Math.round(data.length / 1024)} KB)`);
}

export function removeIcl(iclId: number) {
  useStore.getState().mutate((d) => {
    if (d.icl) delete d.icl[iclId];
    delete d.iconLibs[iclId];
  });
}

async function openFolderOrFiles(accept: string): Promise<{ name: string; data: Uint8Array }[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = true;
    input.onchange = async () => {
      const files = Array.from(input.files ?? []);
      resolve(await Promise.all(files.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) }))));
    };
    input.click();
  });
}

// ------------------------------------------------------------------ herramientas del Hito 4

/** Exporta la tabla de variables como CSV (Excel) o encabezado C para el MCU. */
export async function exportVariables(kind: 'csv' | 'h') {
  const p = useStore.getState().project;
  const rows = variableTable(p);
  if (!rows.length) return toast('El proyecto no tiene variables', 'error');
  const base = cName(p.name).toLowerCase() || 'proyecto';
  const where = kind === 'csv' ? await saveSingleFile(`${base}_variables.csv`, variableCsv(rows)) : await saveSingleFile(`${base}_vp.h`, variableHeader(p, rows));
  if (where) toast(`${rows.length} variables exportadas → ${where}`);
}

export async function openRecentProject(path: string) {
  if (!confirmDiscard()) return;
  const r = await window.dgus?.openRecent(path);
  if (!r) return toast('Ese proyecto ya no está en la lista de recientes', 'error');
  if (r.text == null) return toast(`No se pudo leer ${path}`, 'error');
  try {
    useStore.getState().setProject(deserialize(r.text), r.path);
    toast('Proyecto abierto');
  } catch (e) {
    window.alert(`No se pudo abrir: ${(e as Error).message}`);
  }
}

/** Lee otro proyecto .dgusx para elegir qué páginas traer. */
export async function pickPagesFromProject(): Promise<Project | null> {
  const r = await openProjectFile();
  if (!r) return null;
  try {
    return deserialize(r.text);
  } catch (e) {
    window.alert(`No se pudo abrir: ${(e as Error).message}`);
    return null;
  }
}

/** Añade páginas de otro proyecto con números libres. Las referencias entre ellas se renumeran. */
export function addPagesFrom(source: Project, ids: number[]) {
  const s = useStore.getState();
  const used = new Set(s.project.pages.map((p) => p.id));
  const map = new Map<number, number>();
  let next = 0;
  for (const id of ids) {
    let target = id;
    if (used.has(target)) {
      while (used.has(next)) next++;
      target = next;
    }
    used.add(target);
    map.set(id, target);
  }
  const pageKeys = ['picNext', 'picOn', 'picKb', 'picMenu', 'picPre', 'picNextOne'];
  s.mutate((d) => {
    for (const id of ids) {
      const src = source.pages.find((p) => p.id === id);
      if (!src) continue;
      const copy = structuredClone(src);
      copy.id = map.get(id)!;
      for (const c of copy.controls) {
        c.id = newId();
        for (const k of pageKeys) {
          const v = Number(c.props[k]);
          if (k in c.props && map.has(v)) c.props[k] = map.get(v)!;
        }
      }
      d.pages.push(copy);
    }
    d.pages.sort((a, b) => a.id - b.id);
  });
  const moved = [...map].filter(([a, b]) => a !== b);
  toast(`${ids.length} página(s) añadidas${moved.length ? `; renumeradas: ${moved.map(([a, b]) => `${a}→${b}`).join(', ')}` : ''}. Las fuentes e ICL del otro proyecto no se copian.`);
}

/** Crea una página de teclado y enlaza a ella el control de entrada seleccionado. */
export function createKeyboardFor(controlId: string, kind: KeyboardKind, opts: KeyboardOptions) {
  const s = useStore.getState();
  const { width, height } = s.project.settings;
  const page = s.project.pages.find((p) => p.id === s.pageId);
  const input = page?.controls.find((c) => c.id === controlId);
  if (!input) return;
  const area = keyboardArea(kind, width, height);
  const keys = keyboardLayout(kind, area, opts);
  const id = nextFreePageId(s.project);
  const label = kind === 'numerico' ? 'numérico' : kind === 'hex' ? 'hexadecimal' : 'alfanumérico';
  const background = drawKeyboard(width, height, area, keys, `Teclado ${label}`);
  const controls = keys.map((k) => {
    const c = createControl('basicTouch', k.x, k.y, `Tecla ${k.label}`);
    c.w = k.w;
    c.h = k.h;
    c.props.keyValue = toHex(k.code);
    return c;
  });
  s.mutate((d) => {
    d.pages.push({ id, name: `Teclado ${label}`, background, controls });
    d.pages.sort((a, b) => a.id - b.id);
    const target = d.pages.find((p) => p.id === s.pageId)?.controls.find((c) => c.id === controlId);
    if (!target) return;
    Object.assign(target.props, {
      kbSource: 1,
      picKb: id,
      kbX1: area.x,
      kbY1: area.y,
      kbX2: area.x + area.w,
      kbY2: area.y + area.h,
      kbPosX: area.x,
      kbPosY: area.y,
    });
  });
  toast(`Teclado ${label} creado en la página ${id} y enlazado a «${input.name}»`);
}
