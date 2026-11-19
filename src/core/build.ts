// Generación de 13TouchFile.bin, 14ShowFile.bin y 22_Config.bin.
// Reproduce TDocumentSpace.BuildInputBinFile / BuildShowBinFile de DGUS V7.651
// y las funciones nativas Func02/Func03 de DWINDLL.dll (verificadas contra la DLL).

import { concat, fromBase64 } from './bytes';
import { checkAgainstProfile } from './profiles';
import { touchOverlaps } from './editing';
import { buildKnobLib } from './controls/knob';
import { applyPlcConfig, checkPlcConfig, PLC_MODES } from './modbus';
import { applyNetwork, checkNetwork } from './network';
import { getDef, hasDef } from './controls';
import type { EncodeContext } from './controls/schema';
import type { Project } from './types';

export interface BuildMessage {
  level: 'info' | 'warn' | 'error';
  text: string;
  pageId?: number;
  controlId?: string;
}

export interface BuildResult {
  touch: Uint8Array;
  show: Uint8Array;
  config: Uint8Array;
  /** 120.lib de las perillas físicas, si el proyecto tiene alguna. */
  knobLib?: Uint8Array;
  messages: BuildMessage[];
  stats: { pages: number; touch: number; display: number };
}

const MAX_PAGES_INDEX = 4092;
const CONFIG_SIZE = 131076; // 0x20004, igual que el original

/** Func02: cabecera de 16 bytes "\x14DGUS_2\x10" + página máxima. */
export function showHeader(maxPage: number): Uint8Array {
  const h = new Uint8Array(16);
  h.set([0x14, 0x44, 0x47, 0x55, 0x53, 0x5f, 0x32, 0x10], 0);
  h[8] = (maxPage >> 8) & 0xff;
  h[9] = maxPage & 0xff;
  return h;
}

/** Func03: entrada del índice [n, 0, offset_hi, offset_lo]; devuelve el siguiente offset. */
export function indexEntry(offset: number, count: number, out: Uint8Array, at: number): number {
  out[at] = count & 0xff;
  out[at + 1] = 0;
  out[at + 2] = (offset >> 8) & 0xff;
  out[at + 3] = offset & 0xff;
  return offset + count * 32;
}

const XOR_KEY = [
  735, 554, 824, 169, 37, 562, 369, 301, 238, 592, 611, 832, 241, 376, 762, 707, 14, 540, 537, 105, 514, 835, 76, 575,
  823, 499, 682, 439, 270, 741, 411, 210, 479, 896, 943, 656, 419, 819, 361, 36, 777, 110, 552, 647, 298, 872, 870, 404,
  85, 159, 773, 812, 92, 135, 295, 719, 767, 862, 221, 308, 906, 141, 121, 779, 50, 555, 864, 837, 991, 435, 589, 531,
  127, 646, 771, 359, 620, 148, 541, 72, 713, 277, 160, 748, 363, 21, 768, 118, 329, 58, 1, 393, 294, 250, 523, 41, 331,
  158, 606, 487, 186, 530, 367, 25, 790, 51, 670, 752, 398, 485, 166, 938, 690, 296, 892, 895, 438, 498, 71, 407, 572,
  691, 761, 249, 459, 387, 220, 348,
];

export function xorObfuscate(data: Uint8Array): Uint8Array {
  const key = new Uint8Array(256);
  XOR_KEY.forEach((v, i) => {
    key[i * 2] = v >> 8;
    key[i * 2 + 1] = v & 0xff;
  });
  const out = new Uint8Array(data);
  for (let i = 0; i < out.length; i++) {
    out[i] ^= key[i % 256];
    out[i] = (out[i] ^ ((i >> 16) + ((i >> 8) & 0xff) + (i & 0xff))) & 0xff;
  }
  return out;
}

export function buildProject(project: Project): BuildResult {
  const { settings } = project;
  const messages: BuildMessage[] = [];
  const pages = [...project.pages].sort((a, b) => a.id - b.id);
  const ctxBase = { width: settings.width, height: settings.height };
  const keyingIndex = { n: 0 };
  let nTouch = 0;
  let nDisplay = 0;

  // ---- validaciones
  const seen = new Set<number>();
  if (project.network) for (const text of checkNetwork(project.network)) messages.push({ level: 'error', text: `Red: ${text}` });
  if (![settings.width, settings.height].every((v) => Number.isInteger(v) && v > 0 && v <= 65535)) {
    messages.push({ level: 'error', text: 'La resolución debe contener enteros entre 1 y 65535 píxeles.' });
  }
  if (!['normal', 'encrypted', 'fixed'].includes(settings.showFileMode) || ![64, 128, 256].includes(settings.varsPerPage)) {
    messages.push({ level: 'error', text: 'Formato o capacidad de visualización no válido.' });
  }
  let nextOffset = 0x4000;
  for (const p of pages) {
    if (seen.has(p.id)) messages.push({ level: 'error', text: `La página ${p.id} está repetida.`, pageId: p.id });
    seen.add(p.id);
    if (!Number.isInteger(p.id) || p.id < 0 || p.id >= MAX_PAGES_INDEX) messages.push({ level: 'error', text: `Número de página fuera de rango: ${p.id}`, pageId: p.id });
    const displayCount = p.controls.filter((c) => hasDef(c.type) && getDef(c.type).kind === 'display').length;
    const capacity = settings.showFileMode === 'fixed' ? Math.min(255, settings.varsPerPage - (p.id === 0 ? 1 : 0)) : 255;
    if (displayCount > capacity) messages.push({ level: 'error', text: `La página ${p.id} tiene ${displayCount} controles de visualización; su capacidad es ${capacity}${settings.showFileMode === 'fixed' && p.id === 0 ? ' (una entrada está reservada para la cabecera)' : ''}.`, pageId: p.id });
    if (settings.showFileMode !== 'fixed' && displayCount && nextOffset > 0xffff) {
      messages.push({ level: 'error', text: `El inicio de la página ${p.id} excede el índice de 16 bits del formato actual.`, pageId: p.id });
    }
    nextOffset += displayCount * 32;
    for (const c of p.controls) {
      if (!hasDef(c.type)) {
        messages.push({ level: 'error', text: `Control de tipo desconocido "${c.type}"`, pageId: p.id, controlId: c.id });
        continue;
      }
      const def = getDef(c.type);
      const error = (text: string) => messages.push({ level: 'error', text: `"${c.name}": ${text}`, pageId: p.id, controlId: c.id });
      if (![c.x, c.y, c.w, c.h].every((v) => Number.isInteger(v) && v >= 0 && v <= 65535) || c.w === 0 || c.h === 0 || c.x + c.w > 65535 || c.y + c.h > 65535) error('geometría fuera del rango binario.');
      if (def.kind === 'touch' && p.id > 1023) error('el formato táctil actual admite páginas de 0 a 1023.');
      for (const f of def.fields.filter((f) => f.type === 'vp')) {
        const value = c.props[f.key] ?? f.default;
        if (typeof value === 'number' ? !Number.isInteger(value) || value < 0 || value > 0xffff : !/^(?:0x)?[0-9a-f]{1,4}$/i.test(String(value))) error(`dirección o código ${f.label} fuera de 0000–FFFF.`);
      }
      for (const f of def.vpFields ?? []) {
        const raw = c.props[f.key];
        const start = typeof raw === 'number' ? raw : parseInt(String(raw), 16);
        const words = f.words(c.props);
        if (!Number.isInteger(start) || start < 0 || !Number.isFinite(words) || start + Math.max(1, words) > 0x10000) error(`el intervalo de ${f.key} excede la memoria VP.`);
      }
      try {
        for (const e of def.init?.(c) ?? []) {
          const at = e.vp * 2 + (e.byteOffset ?? 0);
          if (!Number.isInteger(at) || at < 0 || at + e.bytes.length > 0x20000) error('valor inicial fuera de la memoria VP.');
        }
      } catch (e) {
        error((e as Error).message);
      }
      if (c.x < 0 || c.y < 0 || c.x + c.w > settings.width || c.y + c.h > settings.height) {
        messages.push({ level: 'warn', text: `"${c.name}" sale de la pantalla (${c.x},${c.y} ${c.w}×${c.h}).`, pageId: p.id, controlId: c.id });
      }
    }
  }

  // Una compilación inválida no entrega archivos parciales utilizables por otros consumidores.
  if (messages.some((m) => m.level === 'error')) return {
    touch: new Uint8Array(), show: new Uint8Array(), config: new Uint8Array(), messages,
    stats: { pages: pages.length, touch: 0, display: 0 },
  };

  // ---- 13TouchFile.bin: los controles de cada página en orden inverso, terminado en FF FF
  const touchParts: Uint8Array[] = [];
  for (const page of pages) {
    const ctx: EncodeContext = { ...ctxBase, pageId: page.id, keyingIndex };
    for (let i = page.controls.length - 1; i >= 0; i--) {
      const c = page.controls[i];
      if (!hasDef(c.type)) continue;
      const def = getDef(c.type);
      if (def.kind !== 'touch') continue;
      touchParts.push(def.encode(c, ctx));
      nTouch++;
    }
  }
  touchParts.push(new Uint8Array([0xff, 0xff]));
  const touch = concat(touchParts);

  // ---- 14ShowFile.bin
  // Si el proyecto se importó, se parte del 22_Config.bin original (conserva valores puestos a mano).
  const original = project.extraFiles?.['__22_original'];
  const config = new Uint8Array(CONFIG_SIZE);
  if (original) config.set(fromBase64(original).subarray(0, CONFIG_SIZE));
  const counts = new Uint8Array(MAX_PAGES_INDEX);
  const byId = new Map<number, typeof pages[number]>();
  let maxPage = 0;
  let maxVars = 0;
  for (const page of pages) {
    const n = page.controls.filter((c) => hasDef(c.type) && getDef(c.type).kind === 'display').length;
    if (n > 255) messages.push({ level: 'error', text: `La página ${page.id} tiene ${n} controles de visualización (máximo 255).`, pageId: page.id });
    counts[page.id] = Math.min(n, 255);
    byId.set(page.id, page);
    maxPage = Math.max(maxPage, page.id);
    maxVars = Math.max(maxVars, n);
  }

  const fixed = settings.showFileMode === 'fixed';
  if (fixed && maxVars > settings.varsPerPage) {
    messages.push({ level: 'error', text: `Hay páginas con más de ${settings.varsPerPage} variables; aumente "variables por página".` });
  }
  const showParts: Uint8Array[] = [];
  if (!fixed) {
    const head = new Uint8Array(16 + MAX_PAGES_INDEX * 4);
    head.set(showHeader(maxPage), 0);
    let offset = 0x4000;
    for (let i = 0; i < MAX_PAGES_INDEX; i++) offset = indexEntry(offset, counts[i], head, 16 + i * 4);
    showParts.push(head);
  }

  for (let pid = 0; pid <= maxPage; pid++) {
    const page = byId.get(pid);
    const blockSize = fixed ? (settings.varsPerPage / 64) * 2048 : 32 * counts[pid];
    const block = new Uint8Array(blockSize);
    let j = 0;
    if (fixed && pid === 0) {
      block.set([0x14, 0x44, 0x47, 0x55, 0x53, 0x5f, 0x32, settings.varsPerPage / 64, maxPage >> 8, maxPage & 0xff]);
      j = 1;
    }
    if (!page) {
      if (fixed) showParts.push(block);
      continue;
    }
    const ctx: EncodeContext = { ...ctxBase, pageId: page.id, keyingIndex };
    for (let i = page.controls.length - 1; i >= 0; i--) {
      const c = page.controls[i];
      if (!hasDef(c.type)) continue;
      const def = getDef(c.type);
      if (def.kind !== 'display') continue;
      if ((!fixed && j > 254) || (fixed && j >= settings.varsPerPage)) break;
      block.set(def.encode(c, ctx), j * 32);
      j++;
      nDisplay++;
      writeInit(config, def.init?.(c) ?? [], messages, page.id, c.id);
    }
    showParts.push(block);
  }

  // Valores iniciales de los controles táctiles (copia al presionar/soltar)
  for (const page of pages) {
    for (const c of page.controls) {
      if (!hasDef(c.type)) continue;
      const def = getDef(c.type);
      if (def.kind === 'touch' && def.init) writeInit(config, def.init(c), messages, page.id, c.id, true);
    }
  }

  // Valores iniciales libres (equivale a TOOL/22.exe): se escriben al final y mandan sobre los de los controles.
  for (const v of project.initValues ?? []) {
    const vpNum = parseInt(v.vp, 16);
    if (!Number.isFinite(vpNum) || vpNum < 0 || vpNum > 0xffff) {
      messages.push({ level: 'error', text: `Valor inicial libre con VP no válida: "${v.vp}".` });
      continue;
    }
    const bytes = encodeFreeValue(v);
    if (!bytes) {
      messages.push({ level: 'error', text: `Valor inicial libre en VP 0x${v.vp}: «${v.value}» no es válido para ${v.type}.` });
      continue;
    }
    const language = project.multilanguage;
    const languageAt = language ? parseInt(language.vp, 16) * 2 : -1;
    if (language && vpNum * 2 < languageAt + 2 && vpNum * 2 + bytes.length > languageAt) {
      messages.push({ level: 'error', text: `El valor inicial libre en VP 0x${v.vp} ocupa el VP de idioma ${language.vp}. Cambie una de las direcciones para conservar el idioma inicial de la tabla.` });
      continue;
    }
    writeInit(config, [{ vp: vpNum, bytes }], messages, -1, '', true);
  }

  // Según la guía DGUS II, la pantalla carga del 22 solo las direcciones 0x2000–0xFFFF.
  const low = new Set<number>();
  for (const page of pages)
    for (const c of page.controls) {
      if (!hasDef(c.type)) continue;
      for (const e of getDef(c.type).init?.(c) ?? []) if (e.vp > 0x100 && e.vp < 0x2000) low.add(e.vp);
    }
  for (const v of project.initValues ?? []) {
    const n = parseInt(v.vp, 16);
    if (n < 0x2000) low.add(n);
  }
  if (low.size) {
    messages.push({
      level: 'warn',
      text: `${low.size} valores iniciales están por debajo de 0x2000 (p. ej. 0x${[...low][0].toString(16).toUpperCase()}). Según la guía DGUS II la pantalla solo carga 0x2000–0xFFFF del archivo 22.`,
    });
  }

  const body = concat(showParts);
  let show = new Uint8Array(body.length + 32);
  show.set(body, 0);
  show.fill(0xff, body.length);
  if (settings.showFileMode === 'encrypted') show = xorObfuscate(show);

  checkVpOverlaps(project, messages);
  for (const i of checkAgainstProfile(project)) messages.push(i);
  for (const page of project.pages)
    for (const [x, y] of touchOverlaps(page))
      messages.push({ level: 'warn', text: `Página ${page.id}: las zonas táctiles de "${x.name}" y "${y.name}" se superponen; al tocar ahí solo responderá una.`, pageId: page.id, controlId: y.id });

  messages.push({
    level: 'info',
    text: `Compilado: ${pages.length} páginas, ${nTouch} controles táctiles, ${nDisplay} controles de visualización.`,
  });
  // Si el 22 original era más largo (p. ej. configuración Modbus de PLC_Config), se conserva su cola.
  // Con configuración PLC/Modbus propia, se genera como PLC_Config y sustituye a esa cola.
  const tail = original ? fromBase64(original).subarray(CONFIG_SIZE) : new Uint8Array(0);
  let config22 = tail.length ? concat([config, tail]) : config;
  if (project.modbus) {
    for (const t of checkPlcConfig(project.modbus)) messages.push({ level: 'warn', text: `Modbus: ${t}` });
    config22 = applyPlcConfig(config, project.modbus);
    messages.push({ level: 'info', text: `Comunicación: ${PLC_MODES[project.modbus.mode] ?? 'modo ' + project.modbus.mode} en COM${project.modbus.port}, guardada en 22_Config.bin.` });
  }
  const knobLib = buildKnobLib(project) ?? undefined;
  if (project.network) {
    config22 = applyNetwork(config22, project.network);
    messages.push({ level: 'info', text: 'Configuración de red guardada en la zona de sistema de 22_Config.bin.' });
  }
  if (knobLib) messages.push({ level: 'info', text: 'Perillas: se genera 120.lib.' });
  return { touch, show, config: config22, knobLib, messages, stats: { pages: pages.length, touch: nTouch, display: nDisplay } };
}

function writeInit(
  config: Uint8Array,
  entries: { vp: number; bytes: Uint8Array; byteOffset?: number }[],
  messages: BuildMessage[],
  pageId: number,
  controlId: string,
  always = false,
) {
  for (const e of entries) {
    const at = e.vp * 2 + (e.byteOffset ?? 0);
    // El original solo escribe valores iniciales para VP > 0x100 (las direcciones bajas son del sistema).
    if (!always && e.vp * 2 <= 512) {
      messages.push({ level: 'warn', text: `Valor inicial ignorado en VP 0x${e.vp.toString(16)}: las direcciones ≤ 0x100 están reservadas.`, pageId, controlId });
      continue;
    }
    if (at + e.bytes.length > config.length) {
      messages.push({ level: 'error', text: `Valor inicial fuera de la memoria en VP 0x${e.vp.toString(16)}.`, pageId, controlId });
      continue;
    }
    config.set(e.bytes, at);
  }
}

/** Avisa si dos controles de la misma página usan direcciones VP solapadas. */
export function checkVpOverlaps(project: Project, messages: BuildMessage[]) {
  for (const page of project.pages) {
    const ranges: { start: number; end: number; name: string; id: string }[] = [];
    for (const c of page.controls) {
      if (!hasDef(c.type)) continue;
      for (const f of getDef(c.type).vpFields ?? []) {
        const raw = c.props[f.key];
        const start = typeof raw === 'string' ? parseInt(raw, 16) : Number(raw);
        if (!Number.isFinite(start)) continue;
        ranges.push({ start, end: start + Math.max(1, f.words(c.props)) - 1, name: c.name, id: c.id });
      }
    }
    ranges.sort((a, b) => a.start - b.start);
    for (let i = 1; i < ranges.length; i++) {
      const a = ranges[i - 1];
      const b = ranges[i];
      if (b.start <= a.end && a.start !== b.start) {
        messages.push({
          level: 'warn',
          text: `Página ${page.id}: "${a.name}" (0x${a.start.toString(16).toUpperCase()}…0x${a.end.toString(16).toUpperCase()}) se solapa con "${b.name}" (0x${b.start.toString(16).toUpperCase()}).`,
          pageId: page.id,
          controlId: b.id,
        });
      }
    }
  }
}

export type FreeValueType = 'int16' | 'uint16' | 'int32' | 'uint32' | 'float' | 'text' | 'hex';

export interface FreeInitValue {
  vp: string;
  type: FreeValueType;
  value: string;
  note?: string;
}

/** Bytes (big-endian) de un valor inicial libre; null si el valor no es válido. */
export function encodeFreeValue(v: FreeInitValue): Uint8Array | null {
  const t = v.value.trim();
  const dv = new DataView(new ArrayBuffer(4));
  const n = Number(t);
  switch (v.type) {
    case 'int16':
      if (!Number.isInteger(n) || n < -32768 || n > 32767) return null;
      dv.setInt16(0, n);
      return new Uint8Array(dv.buffer.slice(0, 2));
    case 'uint16':
      if (!Number.isInteger(n) || n < 0 || n > 0xffff) return null;
      dv.setUint16(0, n);
      return new Uint8Array(dv.buffer.slice(0, 2));
    case 'int32':
      if (!Number.isInteger(n) || n < -2147483648 || n > 2147483647) return null;
      dv.setInt32(0, n);
      return new Uint8Array(dv.buffer);
    case 'uint32':
      if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) return null;
      dv.setUint32(0, n);
      return new Uint8Array(dv.buffer);
    case 'float':
      if (!Number.isFinite(n) || t === '') return null;
      dv.setFloat32(0, n);
      return new Uint8Array(dv.buffer);
    case 'text': {
      const out: number[] = [];
      for (const ch of v.value) {
        const c = ch.charCodeAt(0);
        if (c > 0xff) return null;
        out.push(c);
      }
      out.push(0xff, 0xff);
      if (out.length % 2) out.push(0);
      return Uint8Array.from(out);
    }
    case 'hex': {
      const clean = t.replace(/0x/gi, '').replace(/[\s,]/g, '');
      if (!/^([0-9a-fA-F]{2})+$/.test(clean)) return null;
      return Uint8Array.from(clean.match(/../g)!.map((h) => parseInt(h, 16)));
    }
  }
}
