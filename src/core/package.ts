import { fromBase64, toBase64 } from './bytes';
import { ASC_FILE_SIZE, buildAscii0, buildBitmapLib, buildGrayUnicode, codesFor, grayFitsBank, grayFontInfo, isAscii0, type GlyphRenderer } from './fonts';
import { SECTOR } from './protocol';
import { getDef } from './controls';
import type { Project } from './types';
import { crc32 } from './zip';

export interface PackageFile { name: string; data: Uint8Array }
export interface PackageIssue { level: 'warn' | 'error'; text: string; code?: 'overlap' }
export interface ValidateOptions {
  /** Igual que DGUS 7.6: permite generar aunque dos archivos compartan sectores (queda como aviso). */
  allowOverlap?: boolean;
}
const numericId = (name: string) => { const m = /^(\d+)(?:\D|$)/.exec(name); return m ? Number(m[1]) : null; };
const isFlashFile = (name: string) => /\.(bin|hzk|dzk|icl|gtf|wae)$/i.test(name) && numericId(name) != null;
const isFontFile = (f: PackageFile) => /\.(hzk|dzk)$/i.test(f.name) || (/\.bin$/i.test(f.name) && !!grayFontInfo(f.data));

export function validatePackage(files: PackageFile[], project: Project, opts: ValidateOptions = {}): PackageIssue[] {
  const issues: PackageIssue[] = [];
  const names = new Set<string>();
  const owner = new Map<number, string>();
  const moduleOwner = new Map<number, string>();
  const capacity = project.settings.flashMiB;
  if (capacity != null && ![8, 16, 32, 64].includes(capacity)) issues.push({ level: 'error', text: 'Capacidad NOR no válida.' });
  if (capacity == null) issues.push({ level: 'warn', text: 'Capacidad de memoria sin declarar: no se ha comprobado el límite físico del destino.' });
  if (capacity != null && project.settings.bgIclId >= capacity * 4) issues.push({ level: 'error', text: 'El ID del ICL de fondos queda fuera de la memoria NOR declarada. Seleccione otro sector en Proyecto.' });
  for (const [name, id] of [[project.settings.touchFileName, 13], [project.settings.showFileName, 14], [project.settings.configFileName, 22]] as const) {
    if (numericId(name) !== id || !/\.bin$/i.test(name)) issues.push({ level: 'error', text: `El archivo ${name} debe ser un BIN cuyo número inicial sea ${id}.` });
  }
  for (const file of files) {
    const key = file.name.toLowerCase();
    if (!file.name || /[\\/:*?"<>|\x00-\x1f]/.test(file.name) || /[. ]$/.test(file.name) || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(file.name)) issues.push({ level: 'error', text: `Nombre de archivo no válido: ${file.name}` });
    if (names.has(key)) issues.push({ level: 'error', text: `Nombre de archivo repetido: ${file.name}` });
    names.add(key);
    if (/\.uic$/i.test(file.name)) {
      const first = numericId(file.name), count = Math.max(1, Math.ceil(file.data.length / 32768));
      if (first === null || first + count > 65536) issues.push({ level: 'error', text: `${file.name}: módulos UIC fuera de 0–65535.` });
      else for (let n = first; n < first + count; n++) {
        const previous = moduleOwner.get(n);
        if (previous) issues.push({ level: opts.allowOverlap ? 'warn' : 'error', code: 'overlap', text: `${file.name} se solapa con ${previous} en el módulo UIC ${n} de 32 KB.` });
        moduleOwner.set(n, file.name);
      }
    }
    const fontId = numericId(file.name);
    if (fontId !== null && isFontFile(file) && !grayFitsBank(file.data, fontId)) issues.push({ level: 'error', text: `${file.name}: algún glifo es inválido o cruza un banco de 16 MB. Regenere la fuente para ese ID.` });
    if (!isFlashFile(file.name)) continue;
    if (!file.data.length) issues.push({ level: 'error', text: `${file.name} está vacío.` });
    const first = numericId(file.name)!;
    const end = first + Math.max(1, Math.ceil(file.data.length / SECTOR));
    if (end > (capacity ?? 64) * 4) issues.push({ level: 'error', text: `${file.name} excede la capacidad NOR del destino.` });
    // Se limita el recorrido aun cuando se recibe un ID inválido.
    for (let n = first; n < Math.min(end, 256); n++) {
      if (owner.has(n)) {
        issues.push(
          opts.allowOverlap
            ? { level: 'warn', code: 'overlap', text: `${file.name} se solapa con ${owner.get(n)} en el sector ${n}: en la pantalla, el último archivo cargado sobrescribirá parte del otro.` }
            : { level: 'error', code: 'overlap', text: `${file.name} se solapa con ${owner.get(n)} en el sector ${n}.` },
        );
      }
      owner.set(n, file.name);
    }
  }
  const cfg = files.filter((f) => /^T5LCFG.*\.cfg$/i.test(f.name));
  if (cfg.length > 1) issues.push({ level: 'error', text: 'Hay varios archivos T5LCFG; conserve solo la configuración del destino.' });
  if (!cfg.length) issues.push({ level: 'warn', text: 'Se conserva la configuración que ya tiene la pantalla; no se incluye T5LCFG.' });
  for (const f of cfg) {
    if (f.data.length < 12 || String.fromCharCode(...f.data.slice(0, 5)) !== 'T5LC1') issues.push({ level: 'error', text: `${f.name}: cabecera de configuración no reconocida.` });
    else if (f.data[8] !== project.settings.bgIclId) issues.push({ level: 'error', text: `${f.name}: el ICL de fondos no coincide con el seleccionado en Proyecto.` });
    if (project.pages.some((page) => page.controls.some((c) => c.props.fskCamera)) && !(f.data[5] & 0x20)) issues.push({ level: 'warn', text: 'La cámara FSK usa comandos del 22: active su carga al arrancar en el CFG.' });
  }
  for (const page of project.pages) for (const c of page.controls) {
    for (const field of getDef(c.type).fields.filter((f) => f.type === 'iconLib' && (!f.showIf || f.showIf(c.props)))) {
      const id = Number(c.props[field.key]);
      if (!files.some((f) => numericId(f.name) === id && /\.icl$/i.test(f.name))) issues.push({ level: 'warn', text: `"${c.name}": biblioteca de iconos ${id} no incluida; se depende del recurso de la pantalla.` });
    }
    const key = ['dataVar', 'rtc', 'hexVar', 'textII'].includes(c.type) ? 'fontId' : c.type === 'text' ? 'font1' : null;
    if (!key) continue;
    const id = Number(c.props[key]);
    const fonts = files.filter((f) => numericId(f.name) === id && isFontFile(f));
    if (fonts.length !== 1) {
      issues.push({ level: fonts.length > 1 || project.settings.autoFonts ? 'error' : 'warn', text: `"${c.name}": ${fonts.length > 1 ? 'varias bibliotecas asignadas al mismo ID' : `fuente ${id} no incluida; se depende del recurso de la pantalla`}.` });
      continue;
    }
    const data = fonts[0].data;
    const gray = String.fromCharCode(...data.slice(0, 6)) === 'DGUS_2';
    if ((c.type === 'textII' && !gray) || (c.type !== 'textII' && gray) || (['dataVar', 'rtc', 'hexVar'].includes(c.type) && !isAscii0(data))) {
      issues.push({ level: project.settings.autoFonts ? 'error' : 'warn', text: `"${c.name}": formato de fuente no verificado para este control.` });
    }
  }
  return issues;
}

/** Configuración lógica DGUS II. Los bloques LCD y TP permanecen deshabilitados. */
export function basicDeviceConfig(project: Project): Uint8Array {
  const id = project.settings.bgIclId;
  if (!Number.isInteger(id) || id < 16 || id > 63) throw new Error('La configuración básica admite ICL de fondos entre 16 y 63.');
  const out = new Uint8Array(128);
  out.set([0x54, 0x35, 0x4c, 0x43, 0x31]);
  const rotation = [0, 90, 180, 270].indexOf(project.settings.rotation);
  if (rotation < 0) throw new Error('Orientación de pantalla no válida.');
  out[5] = 0x30 | rotation; // Cargar 22 al arrancar y subir variables táctiles.
  out[8] = id;
  out[9] = 0x28;
  out[11] = 0x1c; // 3225600 / 115200.
  out[12] = 100;
  return out;
}

export function preservedFiles(project: Project): PackageFile[] {
  return Object.entries(project.extraFiles ?? {}).filter(([n]) => !n.startsWith('__')).map(([name, b64]) => ({ name, data: fromBase64(b64) }));
}

/** Genera únicamente bibliotecas ausentes. Los recursos existentes nunca se sustituyen. */
export function prepareMissingFonts(source: Project, reserved: PackageFile[], renderer: (kind: 'ascii0' | 'gray' | 'fixed') => GlyphRenderer): { project: Project; generated: number } {
  const project = structuredClone(source);
  if (!source.settings.autoFonts) return { project, generated: 0 };
  const files = preservedFiles(project);
  const occupied = new Set<number>([12, 13, 14, 22]);
  for (const f of [...reserved, ...files]) {
    if (!isFlashFile(f.name)) continue;
    const first = numericId(f.name)!;
    for (let n = first; n < Math.min(256, first + Math.max(1, Math.ceil(f.data.length / SECTOR))); n++) occupied.add(n);
  }
  type Request = { c: typeof project.pages[number]['controls'][number]; key: string };
  const tasks = new Map<string, { kind: 'ascii0' | 'gray' | 'fixed'; width: number; height: number; encoding: number; requested: number; refs: Request[] }>();
  const existing = (id: number) => files.some((f) => numericId(f.name) === id && isFontFile(f));
  for (const page of project.pages) for (const c of page.controls) {
    let key = ''; let kind: 'ascii0' | 'gray' | 'fixed' = 'ascii0';
    let width = 0; let height = 0; let encoding = 0;
    if (['dataVar', 'rtc', 'hexVar'].includes(c.type)) key = 'fontId';
    else if (c.type === 'textII') { key = 'fontId'; kind = 'gray'; width = 24; height = 32; encoding = Number(c.props.encoding); }
    else if (c.type === 'text') {
      key = 'font1'; width = Number(c.props.fontX); height = Number(c.props.fontY); encoding = Number(c.props.encoding);
      kind = 'fixed';
    } else continue;
    const requested = Number(c.props[key]);
    if (!Number.isInteger(requested) || requested < 0 || requested > 65535) throw new Error(`"${c.name}": ID de fuente no válido.`);
    if (existing(requested)) continue;
    if (![0, 5].includes(encoding)) throw new Error(`"${c.name}": añada una biblioteca para la codificación seleccionada; su generación automática todavía no está disponible.`);
    if (kind === 'fixed' && (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 255 || height > 255)) throw new Error(`"${c.name}": dimensiones de fuente no válidas.`);
    const signature = kind === 'ascii0' ? 'ascii0' : `${kind}:${width}:${height}:${encoding}`;
    if (!tasks.has(signature)) tasks.set(signature, { kind, width, height, encoding, requested, refs: [] });
    tasks.get(signature)!.refs.push({ c, key });
  }
  let generated = 0;
  // La biblioteca 0# ocupa 12 sectores consecutivos; asignarla antes que las pequeñas.
  for (const task of [...tasks.values()].sort((a, b) => Number(b.kind === 'ascii0') - Number(a.kind === 'ascii0'))) {
    const extra = task.refs.map(({ c }) => String(c.props.init ?? '') + String(c.props.unit ?? '')).join('');
    if ([...extra].some((ch) => ch.codePointAt(0)! > 0xffff)) throw new Error('La generación de fuentes admite caracteres Unicode del plano básico (hasta U+FFFF).');
    if (task.kind === 'ascii0' && /[^\x00-\x7f]/.test(extra)) throw new Error('La fuente ASCII 0# no contiene todos los caracteres del texto. Use una fuente Unicode para esos textos.');
    const codes = codesFor(['latin1'], extra);
    if (task.encoding === 0 && [...extra].some((ch) => ch.codePointAt(0)! > 255)) throw new Error('El texto requiere codificación Unicode.');
    const bytesPerGlyph = Math.ceil(task.width / 8) * task.height;
    const estimated = task.kind === 'ascii0' ? ASC_FILE_SIZE : task.kind === 'gray' ? 327936 + codes.filter((c) => c > 32).length * Math.ceil(task.width * task.height / 4) * 2 : (Math.max(...codes) + 1) * bytesPerGlyph;
    const slots = Math.ceil(estimated / SECTOR);
    const max = (project.settings.flashMiB ?? 16) * 4;
    const fits = (id: number) => id >= 0 && id <= 47 && id + slots <= max && Array.from({ length: slots }, (_, n) => id + n).every((n) => !occupied.has(n));
    const id = fits(task.requested) ? task.requested : Array.from({ length: 48 }, (_, n) => n).find(fits);
    if (id == null) throw new Error('No hay espacio libre para las fuentes. Revise la memoria y los recursos del destino.');
    const render = renderer(task.kind);
    const data = task.kind === 'ascii0' ? buildAscii0(render) : task.kind === 'gray' ? buildGrayUnicode(codes, task.width, task.height, render) : buildBitmapLib(codes.map((code) => ({ index: code, code })), task.width, task.height, render);
    const name = `${id}_Studio_${task.kind}${task.kind === 'ascii0' ? '.HZK' : '.DZK'}`;
    project.extraFiles ??= {}; project.extraFiles[name] = toBase64(data);
    project.fonts[id] = name;
    for (const { c, key } of task.refs) c.props[key] = id;
    for (let n = id; n < id + Math.ceil(data.length / SECTOR); n++) occupied.add(n);
    generated++;
  }
  return { project, generated };
}

// ------------------------------------------------------------------ reasignación de recursos solapados

export interface ResourceMove {
  file: string;
  newName: string;
  from: number;
  to: number;
  sectors: number;
  kind: 'icl' | 'font';
}
export interface ReferenceChange {
  pageId: number;
  controlId: string;
  controlName: string;
  prop: string;
  from: number;
  to: number;
}
export interface ReassignmentPlan {
  moves: ResourceMove[];
  refs: ReferenceChange[];
  /** Controles importados sin decodificar que podrían contener IDs y deben revisarse a mano. */
  rawControls: { pageId: number; controlId: string; controlName: string }[];
  /** Solapes que no se pueden resolver (falta espacio o afectan a 13/14/22). */
  unresolved: string[];
}

const sectorsOf = (f: PackageFile) => Math.max(1, Math.ceil(f.data.length / SECTOR));
const kindOf = (file: PackageFile): 'icl' | 'font' | null => (/\.icl$/i.test(file.name) ? 'icl' : isFontFile(file) || /\.gtf$/i.test(file.name) ? 'font' : null);

/** Propiedades que guardan el número de una biblioteca de iconos o de fuentes. */
function resourceProps(type: string): { key: string; kind: 'icl' | 'font' }[] {
  const out: { key: string; kind: 'icl' | 'font' }[] = [];
  for (const f of getDef(type).fields) {
    if (f.type === 'iconLib') out.push({ key: f.key, kind: 'icl' });
    else if (f.type === 'font') out.push({ key: f.key, kind: 'font' });
  }
  const extra: Record<string, { key: string; kind: 'icl' | 'font' }[]> = {
    textII: [{ key: 'fontId', kind: 'font' }],
    gtf: [{ key: 'gtfId', kind: 'font' }],
    imageAnim: [{ key: 'iclLib', kind: 'icl' }],
    video: [{ key: 'iclId', kind: 'icl' }],
  };
  for (const e of extra[type] ?? []) if (!out.some((o) => o.key === e.key)) out.push(e);
  return out;
}

/**
 * Propone mover los recursos que se solapan a sectores libres. Se queda en su sitio el archivo
 * de número menor, salvo el ICL de fondos indicado en Proyecto, que nunca se mueve.
 */
export function planReassignment(files: PackageFile[], project: Project): ReassignmentPlan {
  const plan: ReassignmentPlan = { moves: [], refs: [], rawControls: [], unresolved: [] };
  const max = Math.min(256, (project.settings.flashMiB ?? 64) * 4);
  const flash = files.filter((f) => isFlashFile(f.name));
  const fixed = (f: PackageFile) => !kindOf(f) || (/\.icl$/i.test(f.name) && numericId(f.name) === project.settings.bgIclId);
  const ordered = [...flash].sort((a, b) => Number(fixed(b)) - Number(fixed(a)) || numericId(a.name)! - numericId(b.name)!);
  const occupied = new Set<number>();
  const range = (first: number, n: number) => Array.from({ length: n }, (_, k) => first + k);
  // El sector 12 se deja libre como hace la generación de fuentes (reservado en DGUS).
  const reservedForMoves = new Set<number>([12]);
  for (const f of ordered) {
    const id = numericId(f.name)!;
    const n = sectorsOf(f);
    const sectors = range(id, Math.min(n, 256 - id));
    const clash = sectors.some((x) => occupied.has(x));
    if (fixed(f)) {
      if (clash) plan.unresolved.push(`${f.name} no se puede mover y choca con otro archivo fijo (13/14/22, CFG o ICL de fondos).`);
      sectors.forEach((x) => occupied.add(x));
      continue;
    }
    if (!clash) {
      sectors.forEach((x) => occupied.add(x));
      continue;
    }
    // Primero después del número original (mantiene la costumbre de DGUS); si no cabe, por debajo.
    const candidates = [...range(id + 1, Math.max(0, max - id - 1)), ...range(0, id)];
    const to = candidates.find((start) => start + n <= max && range(start, n).every((x) => !occupied.has(x) && !reservedForMoves.has(x)) && grayFitsBank(f.data, start));
    if (to == null) {
      plan.unresolved.push(`No hay ${n} sectores libres seguidos para ${f.name}.`);
      continue;
    }
    range(to, n).forEach((x) => occupied.add(x));
    plan.moves.push({ file: f.name, newName: f.name.replace(/^\d+/, String(to)), from: id, to, sectors: n, kind: kindOf(f)! });
  }
  for (const page of project.pages)
    for (const c of page.controls) {
      if (c.type === 'rawDisplay' || c.type === 'rawTouch') {
        if (plan.moves.length) plan.rawControls.push({ pageId: page.id, controlId: c.id, controlName: c.name });
        continue;
      }
      for (const { key, kind } of resourceProps(c.type)) {
        const v = Number(c.props[key]);
        const m = plan.moves.find((x) => x.kind === kind && x.from === v);
        if (m) plan.refs.push({ pageId: page.id, controlId: c.id, controlName: c.name, prop: key, from: m.from, to: m.to });
      }
    }
  return plan;
}

/** Aplica el plan sobre una copia del proyecto (nunca sobre los archivos originales). */
export function applyReassignment(source: Project, plan: ReassignmentPlan): Project {
  const p = structuredClone(source);
  for (const m of plan.moves) {
    if (m.kind === 'icl') {
      if (p.icl?.[m.from] != null) {
        p.icl[m.to] = p.icl[m.from];
        delete p.icl[m.from];
      } else if (p.extraFiles?.[m.file] != null) {
        p.extraFiles[m.newName] = p.extraFiles[m.file];
        delete p.extraFiles[m.file];
      }
      if (p.iconLibs[m.from] != null) {
        p.iconLibs[m.to] = m.newName;
        delete p.iconLibs[m.from];
      }
    } else if (p.extraFiles?.[m.file] != null) {
      p.extraFiles[m.newName] = p.extraFiles[m.file];
      delete p.extraFiles[m.file];
      if (p.fonts[m.from] != null) delete p.fonts[m.from];
      p.fonts[m.to] = m.newName;
    }
  }
  for (const r of plan.refs) {
    const c = p.pages.find((pg) => pg.id === r.pageId)?.controls.find((x) => x.id === r.controlId);
    if (c) c.props[r.prop] = r.to;
  }
  if (p.multilanguage) {
    const moved = plan.moves.find((m) => m.kind === 'icl' && m.from === p.multilanguage!.iclId);
    if (moved) {
      p.multilanguage.iclId = moved.to;
      const data = fromBase64(p.icl![moved.to]);
      p.multilanguage.managed = { id: moved.to, size: data.length, crc: crc32(data) };
    }
  }
  return p;
}
