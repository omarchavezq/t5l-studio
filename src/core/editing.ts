// Herramientas de edición y de proyecto sin interfaz: tabla de variables, arrays,
// búsqueda de VP y comprobación de zonas táctiles superpuestas.

import { getDef, hasDef, newId } from './controls';
import { parseHex, toHex } from './bytes';
import type { ControlInstance, Page, Project } from './types';

// ------------------------------------------------------------------ tabla de variables

export interface VarRow {
  pageId: number;
  pageName: string;
  control: string;
  type: string;
  field: string;
  vp: number;
  words: number;
  kind: 'táctil' | 'visualización' | 'perilla';
}

/** Todas las direcciones VP del proyecto (equivale a TouchConfig.xls y DisplayConfig.xls de V7.651). */
export function variableTable(project: Project): VarRow[] {
  const rows: VarRow[] = [];
  for (const page of project.pages)
    for (const c of page.controls) {
      if (!hasDef(c.type)) continue;
      const def = getDef(c.type);
      for (const f of def.fields) {
        if (f.type !== 'vp' || f.key === 'sp') continue;
        const v = parseHex(c.props[f.key], -1);
        if (v <= 0 || v === 0xffff) continue;
        const vf = def.vpFields?.find((x) => x.key === f.key);
        rows.push({
          pageId: page.id,
          pageName: page.name,
          control: c.name,
          type: def.label,
          field: f.label,
          vp: v,
          words: vf ? Math.max(1, vf.words(c.props)) : 1,
          kind: def.kind === 'touch' ? 'táctil' : def.kind === 'knob' ? 'perilla' : 'visualización',
        });
      }
    }
  return rows.sort((a, b) => a.vp - b.vp || a.pageId - b.pageId);
}

/** CSV con «;» y BOM UTF-8, para que Excel en español lo abra con acentos y columnas. */
export function variableCsv(rows: VarRow[]): string {
  const esc = (s: string | number) => {
    const t = String(s);
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const head = ['VP', 'Palabras', 'Página', 'Nombre de página', 'Control', 'Tipo', 'Campo', 'Clase'];
  const lines = rows.map((r) => [`0x${toHex(r.vp)}`, r.words, r.pageId, r.pageName, r.control, r.type, r.field, r.kind].map(esc).join(';'));
  return '﻿' + [head.join(';'), ...lines].join('\r\n') + '\r\n';
}

/** Nombre de identificador C a partir de un texto (sin tildes, mayúsculas, solo [A-Z0-9_]). */
export function cName(s: string): string {
  const base = s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return /^[0-9]/.test(base) ? `VP_${base}` : base || 'VP';
}

/** Encabezado C con un #define por variable, para el firmware del MCU. */
export function variableHeader(project: Project, rows: VarRow[]): string {
  const guard = `${cName(project.name)}_VP_H`;
  const seen = new Map<string, number>();
  const byVp = new Map<number, VarRow>();
  for (const r of rows) if (!byVp.has(r.vp)) byVp.set(r.vp, r);
  const lines: string[] = [];
  for (const r of byVp.values()) {
    let name = `VP_${cName(r.control)}`;
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    if (n > 1) name += `_${n}`;
    lines.push(`#define ${name.padEnd(36)} 0x${toHex(r.vp)}u  /* pág. ${r.pageId}, ${r.type}, ${r.words} palabra${r.words > 1 ? 's' : ''} */`);
  }
  return [
    `/* Direcciones VP de «${project.name}», generado por T5L Studio. */`,
    `#ifndef ${guard}`,
    `#define ${guard}`,
    '',
    ...lines,
    '',
    `#endif /* ${guard} */`,
    '',
  ].join('\n');
}

// ------------------------------------------------------------------ buscar VP

export interface VpHit {
  pageId: number;
  controlId: string;
  control: string;
  field: string;
  vp: number;
  words: number;
}

/** Controles cuyo intervalo de VP contiene `vp` (o cuyo VP empieza por el texto buscado). */
export function findVp(project: Project, query: string): VpHit[] {
  const q = query.trim().replace(/^0x/i, '').toUpperCase();
  if (!/^[0-9A-F]{1,4}$/.test(q)) return [];
  const exact = parseInt(q, 16);
  const hits: VpHit[] = [];
  for (const page of project.pages)
    for (const c of page.controls) {
      if (!hasDef(c.type)) continue;
      const def = getDef(c.type);
      for (const f of def.fields) {
        if (f.type !== 'vp') continue;
        const v = parseHex(c.props[f.key], -1);
        if (v < 0) continue;
        const words = def.vpFields?.find((x) => x.key === f.key)?.words(c.props) ?? 1;
        const inRange = q.length === 4 ? exact >= v && exact < v + Math.max(1, words) : toHex(v).startsWith(q);
        if (inRange) hits.push({ pageId: page.id, controlId: c.id, control: c.name, field: f.label, vp: v, words });
      }
    }
  return hits;
}

// ------------------------------------------------------------------ arrays

export interface ArrayOptions {
  rows: number;
  cols: number;
  gapX: number;
  gapY: number;
  /** Incremento de VP (en palabras) entre copias consecutivas; 0 = misma VP. */
  vpStep: number;
}

/** Copias en rejilla del control (como «Array» de V7.651); el original es la celda (0,0). */
export function arrayCopies(c: ControlInstance, o: ArrayOptions): ControlInstance[] {
  const def = getDef(c.type);
  const vpKeys = (def.vpFields ?? []).map((f) => f.key);
  const out: ControlInstance[] = [];
  let k = 0;
  for (let r = 0; r < o.rows; r++)
    for (let col = 0; col < o.cols; col++) {
      if (r === 0 && col === 0) {
        k++;
        continue;
      }
      const copy: ControlInstance = structuredClone(c);
      copy.id = newId();
      copy.name = `${c.name} [${r + 1},${col + 1}]`;
      copy.x = c.x + col * (c.w + o.gapX);
      copy.y = c.y + r * (c.h + o.gapY);
      if (o.vpStep) for (const key of vpKeys) copy.props[key] = toHex((parseHex(c.props[key], 0) + o.vpStep * k) & 0xffff);
      out.push(copy);
      k++;
    }
  return out;
}

// ------------------------------------------------------------------ zonas táctiles superpuestas

/** Pares de controles táctiles de una página cuyas zonas se tocan (V7.611 pide confirmación). */
export function touchOverlaps(page: Page): [ControlInstance, ControlInstance][] {
  const touch = page.controls.filter((c) => hasDef(c.type) && getDef(c.type).kind === 'touch' && !c.hidden && !(c.props.keying === true));
  const out: [ControlInstance, ControlInstance][] = [];
  for (let i = 0; i < touch.length; i++)
    for (let j = i + 1; j < touch.length; j++) {
      const a = touch[i];
      const b = touch[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) out.push([a, b]);
    }
  return out;
}

// ------------------------------------------------------------------ recuadro de variables con fuente 0#

/** Tipos que se dibujan con la librería ASCII 0#: celdas de «fontSize» de ancho y el doble de alto. */
export const ASCII_CELL_TYPES = ['dataVar', 'rtc', 'hexVar'];

export const asciiCellWidth = (c: ControlInstance) => Math.max(1, Number(c.props.fontSize) || 16);

/** Tamaño justo del recuadro para el texto de ejemplo del control (como el marco de V7.651). */
export function fitAsciiBox(c: ControlInstance): { w: number; h: number } | null {
  if (!ASCII_CELL_TYPES.includes(c.type) || !hasDef(c.type)) return null;
  const text = getDef(c.type).preview?.(c).text ?? '';
  if (!text) return null;
  const cw = asciiCellWidth(c);
  return { w: [...text].length * cw, h: cw * 2 };
}

/** Propiedades que cambian el texto mostrado: al editarlas, el recuadro se ajusta solo. */
const TEXT_SIZE_KEYS = ['fontSize', 'nInt', 'nDot', 'unit', 'unitLen', 'init', 'varType', 'zeroDisplay', 'format', 'byteNum', 'separators'];

/** Ajusta el recuadro al texto si `key` cambia su tamaño (tipos con fuente 0#). Devuelve true si cambió. */
export function refitAsciiBox(c: ControlInstance, key: string): boolean {
  if (!TEXT_SIZE_KEYS.includes(key)) return false;
  const fit = fitAsciiBox(c);
  if (!fit || (fit.w === c.w && fit.h === c.h)) return false;
  Object.assign(c, fit);
  return true;
}
