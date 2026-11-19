import { createControl } from './controls';
import { crc32 } from './zip';
import { fromBase64, toBase64 } from './bytes';
import { buildIcl, type IclImage } from './icl';
import type { ControlInstance, Project } from './types';

export interface LanguageRow {
  key: string;
  controlId: string;
  texts: string[];
  family: string;
  size: number;
  color: string;
  background: string;
  align: 'left' | 'center' | 'right';
  bold: boolean;
  original?: ControlInstance;
}
export interface LanguageTable {
  languages: string[];
  vp: string;
  iclId: number;
  initial: number;
  rows: LanguageRow[];
  managed?: { id: number; crc: number; size: number };
}

export function checkLanguageTable(p: Project, t: LanguageTable): string[] {
  const errors: string[] = [];
  if (t.languages.length < 1 || t.languages.length > 32 || t.languages.some((s) => !s.trim()) || new Set(t.languages.map((s) => s.trim().toLowerCase())).size !== t.languages.length) errors.push('Introduzca de 1 a 32 idiomas con nombres distintos.');
  if (!/^[0-9a-f]{4}$/i.test(t.vp) || parseInt(t.vp, 16) < 0x2000) errors.push('El VP de idioma debe estar entre 2000 y FFFF.');
  if (!Number.isInteger(t.iclId) || t.iclId < 16 || t.iclId > 255 || t.iclId === p.settings.bgIclId) errors.push('El ICL de idiomas debe estar entre 16 y 255 y ser distinto del de fondos.');
  if (!Number.isInteger(t.initial) || t.initial < 0 || t.initial >= t.languages.length) errors.push('Idioma inicial fuera de la tabla.');
  if ((!t.rows.length && !p.multilanguage) || t.rows.length * t.languages.length > 65536) errors.push('La tabla debe tener textos y no superar 65536 imágenes.');
  const controls = p.pages.flatMap((page) => page.controls);
  const seen = new Set<string>(); const keys = new Set<string>();
  for (const r of t.rows) {
    const c = controls.find((c) => c.id === r.controlId);
    if (!c || !['text', 'textII', 'iconVar', 'multiLanguage'].includes(c.type)) errors.push(`«${r.key}»: enlace a un control de texto o icono no válido.`);
    if (seen.has(r.controlId) || !r.controlId) errors.push(`«${r.key}»: control repetido o sin enlazar.`); seen.add(r.controlId);
    if (!r.key || keys.has(r.key)) errors.push('Las claves de texto deben ser distintas y no estar vacías.'); keys.add(r.key);
    if (r.texts.length !== t.languages.length) errors.push(`«${r.key}»: falta una columna de idioma.`);
    if (!Number.isInteger(r.size) || r.size < 1 || r.size > 512 || !r.family.trim() || /["\\\r\n]/.test(r.family)) errors.push(`«${r.key}»: tipografía o tamaño no válido.`);
    if (![r.color, r.background].every((s) => /^#[0-9a-f]{6}$/i.test(s))) errors.push(`«${r.key}»: color no válido.`);
    if (c && (![c.w, c.h].every((n) => Number.isInteger(n) && n > 0 && n <= 4096) || c.w * c.h > 4194304)) errors.push(`«${r.key}»: área no válida o demasiado grande para generar.`);
  }
  const existing = p.icl?.[t.iclId];
  if (existing) {
    const data = fromBase64(existing);
    if (t.managed?.id !== t.iclId || t.managed.size !== data.length || t.managed.crc !== crc32(data)) errors.push('El ID elegido contiene otro ICL. Elija un número libre para conservar el recurso existente.');
  }
  return errors;
}

/** Un icono por idioma, consecutivos por fila. Usa 0x00 estándar y un VP común. */
export function bindLanguageTable(source: Project, table: LanguageTable, images: IclImage[]): Project {
  const errors = checkLanguageTable(source, table); if (errors.length) throw new Error(errors.join('\n'));
  const count = table.rows.length * table.languages.length;
  if (images.length !== count || images.some((img, i) => img.id !== i)) throw new Error('La biblioteca no contiene todas las imágenes de la tabla.');
  const p = structuredClone(source); const t = structuredClone(table);
  for (const previous of source.multilanguage?.rows ?? []) {
    if (t.rows.some((r) => r.controlId === previous.controlId)) continue;
    const page = p.pages.find((page) => page.controls.some((c) => c.id === previous.controlId));
    const current = page?.controls.find((c) => c.id === previous.controlId);
    if (page && current && previous.original) {
      if (current.type !== 'iconVar' || Number(current.props.iconLib) !== source.multilanguage!.iclId) throw new Error(`«${previous.key}» cambió fuera de la tabla; revise su enlace antes de quitarlo.`);
      page.controls[page.controls.indexOf(current)] = { ...structuredClone(previous.original), id: current.id, name: current.name, x: current.x, y: current.y, w: current.w, h: current.h, locked: current.locked, hidden: current.hidden };
    }
  }
  for (const [index, row] of t.rows.entries()) {
    const page = p.pages.find((page) => page.controls.some((c) => c.id === row.controlId))!;
    const c = page.controls.find((c) => c.id === row.controlId)!;
    row.original = structuredClone(source.multilanguage?.rows.find((r) => r.controlId === c.id)?.original ?? row.original ?? c);
    const first = index * t.languages.length;
    const next = createControl('iconVar', c.x, c.y, c.name);
    Object.assign(next, { id: c.id, w: c.w, h: c.h, locked: c.locked, hidden: c.hidden, legacyId: c.legacyId });
    Object.assign(next.props, { vp: t.vp, vMin: 0, vMax: t.languages.length - 1, iconMin: first, iconMax: first + t.languages.length - 1, iconLib: t.iclId, init: String(t.initial), sp: c.props.sp ?? 'FFFF', onPopMenu: c.props.onPopMenu ?? false });
    page.controls[page.controls.indexOf(c)] = next;
  }
  if (!t.rows.length) { delete p.multilanguage; return p; }
  const data = buildIcl(images, t.iclId);
  p.icl ??= {}; p.iconLibs[t.iclId] = `${t.iclId}_Studio_idiomas.icl`;
  p.icl[t.iclId] = toBase64(data);
  t.managed = { id: t.iclId, crc: crc32(data), size: data.length };
  p.multilanguage = t;
  return p;
}

/** Tabla del 2.xls de V7.651: GUID en A y textos en B, C…; no se evalúan fórmulas. */
export function tableFromCells(cells: unknown[][]): { keys: string[]; languages: string[]; texts: string[][] } {
  const rows = cells.filter((r) => r.length && String(r[0] ?? '').trim());
  const hasHeader = rows.length > 0 && /^(clave|id|guid|key)$/i.test(String(rows[0][0]).trim());
  const width = Math.max(0, ...rows.map((r) => r.length - 1));
  if (!width || width > 32 || rows.length > 4097) throw new Error('La tabla debe tener hasta 4096 textos y entre 1 y 32 idiomas.');
  const body = hasHeader ? rows.slice(1) : rows;
  if (!body.length || body.length > 4096) throw new Error('La tabla debe tener entre 1 y 4096 textos.');
  const keys = body.map((r) => String(r[0]).trim());
  if (new Set(keys).size !== keys.length) throw new Error('La tabla contiene claves repetidas.');
  return { keys, languages: Array.from({ length: width }, (_, i) => hasHeader ? String(rows[0][i + 1] ?? `Idioma ${i + 1}`) : `Idioma ${i + 1}`), texts: body.map((r) => Array.from({ length: width }, (_, i) => String(r[i + 1] ?? ''))) };
}
