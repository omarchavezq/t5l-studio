// Importación de una carpeta DWIN_SET existente (proyectos hechos con DGUS 7.6).
// Lee 13*.bin, 14*.bin, 22*.bin, bibliotecas .icl e imágenes de fondo.

import { xorObfuscate } from './build';
import { toBase64 } from './bytes';
export { toBase64, fromBase64 } from './bytes';
import { getDef, newId } from './controls';
import { CHECKED_DISPLAY, decodeDisplay, decodeTouch, touchBlockSize } from './controls/decoders';
import { bytesToHex } from './controls/raw';
import { applyPlcConfig, readPlcConfig } from './modbus';
import { iclIdFromName, isIcl, parseIcl, type IclImage } from './icl';
import { newProject, pageIdFromFileName } from './project';
import type { ControlInstance, Page, Project, Props } from './types';

export interface InFile {
  name: string;
  data: Uint8Array;
}

export interface ImportReport {
  project: Project;
  notes: string[];
  stats: { pages: number; touch: number; display: number; raw: number; icl: number; images: number };
}

const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', bmp: 'image/bmp' };

const baseName = (n: string) => n.split(/[\\/]/).pop() ?? n;
const ext = (n: string) => (/\.([^.]+)$/.exec(n)?.[1] ?? '').toLowerCase();

// ------------------------------------------------------------------ 13TouchFile.bin

export function parseTouchFile(b: Uint8Array): { pageId: number; block: Uint8Array }[] {
  const out: { pageId: number; block: Uint8Array }[] = [];
  let i = 0;
  while (i + 16 <= b.length) {
    if (b[i] === 0xff && b[i + 1] === 0xff) break;
    const size = touchBlockSize(b, i);
    const block = b.slice(i, i + size);
    out.push({ pageId: ((block[0] & 3) << 8) | block[1], block });
    i += size;
  }
  return out;
}

// ------------------------------------------------------------------ 14ShowFile.bin

export type ShowMode = 'normal' | 'encrypted' | 'fixed';

const HEAD = [0x14, 0x44, 0x47, 0x55, 0x53, 0x5f, 0x32];
const hasHead = (b: Uint8Array) => HEAD.every((x, i) => b[i] === x);

export function parseShowFile(input: Uint8Array): { mode: ShowMode; maxPage: number; varsPerPage: 64 | 128 | 256; pages: Map<number, Uint8Array[]> } {
  let b = input;
  let mode: ShowMode = 'normal';
  if (!hasHead(b)) {
    const dec = xorObfuscate(b);
    if (!hasHead(dec)) throw new Error('14ShowFile.bin no tiene la cabecera de DGUS II.');
    b = dec;
    mode = 'encrypted';
  }
  const maxPage = (b[8] << 8) | b[9];
  const pages = new Map<number, Uint8Array[]>();
  if (b[7] === 0x10) {
    for (let p = 0; p <= Math.min(maxPage, 4091); p++) {
      const count = b[16 + p * 4];
      const off = (b[18 + p * 4] << 8) | b[19 + p * 4];
      if (!count) continue;
      const blocks: Uint8Array[] = [];
      for (let k = 0; k < count; k++) blocks.push(b.slice(off + k * 32, off + k * 32 + 32));
      pages.set(p, blocks);
    }
    return { mode, maxPage, varsPerPage: 64, pages };
  }
  // Bloque fijo por página: b[7] = variables por página / 64
  const vpp = (b[7] * 64) as 64 | 128 | 256;
  const size = vpp * 32;
  for (let p = 0; p <= maxPage; p++) {
    const blocks: Uint8Array[] = [];
    for (let k = p === 0 ? 1 : 0; k < vpp; k++) {
      const blk = b.slice(p * size + k * 32, p * size + k * 32 + 32);
      if (blk.length < 32 || (blk[0] !== 0x5a && blk[0] !== 0x5f)) break;
      blocks.push(blk);
    }
    if (blocks.length) pages.set(p, blocks);
  }
  return { mode: 'fixed', maxPage, varsPerPage: vpp, pages };
}

// ------------------------------------------------------------------ 22_Config.bin

function readInit(config: Uint8Array | undefined, c: ControlInstance) {
  if (!config) return;
  const p = c.props;
  const vpNum = parseInt(String(p.vp ?? ''), 16);
  if (!Number.isFinite(vpNum) || vpNum <= 0x100) return;
  const at = vpNum * 2;
  if (at + 8 > config.length) return;
  const dv = new DataView(config.buffer, config.byteOffset + at, 8);
  if (c.type === 'dataVar' || c.type === 'artVar') {
    const t = Number(p.varType);
    const v = [dv.getInt16(0), dv.getInt32(0), config[at], config[at + 1], dv.getBigInt64(0), dv.getUint16(0), dv.getUint32(0), dv.getFloat32(0), dv.getFloat64(0)][t];
    if (v) p.init = String(v);
  } else if (c.type === 'iconVar' && !p.groupEnable) {
    const v = dv.getInt16(0);
    if (v) p.init = String(v);
  } else if (c.type === 'text' || c.type === 'textII') {
    const len = Math.min(Number(p.textLength) || 0, 256);
    const bytes = config.slice(at, at + len);
    let s = '';
    if (Number(p.encoding) === 5) {
      for (let i = 0; i + 1 < bytes.length; i += 2) {
        const ch = (bytes[i] << 8) | bytes[i + 1];
        if (!ch) break;
        s += String.fromCharCode(ch);
      }
    } else {
      for (const x of bytes) {
        if (!x || x === 0xff) break;
        s += String.fromCharCode(x);
      }
    }
    if (s) p.init = s;
  }
}

// ------------------------------------------------------------------ importación completa

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

function makeControl(type: string, rect: { x: number; y: number; w: number; h: number }, props: Props, index: number): ControlInstance {
  const def = getDef(type);
  const base: Props = {};
  for (const f of def.fields) base[f.key] = f.default;
  return { id: newId(), type, name: `${def.label} ${index}`, ...rect, props: { ...base, ...props } };
}

export function importDwinSet(files: InFile[], folderName = 'Proyecto importado'): ImportReport {
  const notes: string[] = [];
  const find = (re: RegExp) => files.find((f) => re.test(baseName(f.name)));
  const touchF = find(/^13.*\.bin$/i);
  const showF = find(/^14.*\.bin$/i);
  const cfgF = find(/^22.*\.bin$/i);
  if (!touchF && !showF) throw new Error('No se encontraron 13*.bin ni 14*.bin en la carpeta.');

  const project = newProject(folderName);
  project.settings.flashMiB = undefined;
  project.settings.autoFonts = false;
  project.settings.deviceConfig = 'preserve';
  const deviceConfigs = files.filter((f) => /^T5LCFG.*\.cfg$/i.test(baseName(f.name)));
  if (deviceConfigs.length === 1 && deviceConfigs[0].data.length >= 13 && String.fromCharCode(...deviceConfigs[0].data.slice(0, 5)) === 'T5LC1') {
    project.settings.bgIclId = deviceConfigs[0].data[8];
    project.settings.rotation = ([0, 90, 180, 270] as const)[deviceConfigs[0].data[5] & 3];
  }
  project.pages = [];
  project.icl = {};
  project.extraFiles = {};
  const pages = new Map<number, Page>();
  const page = (id: number) => {
    if (!pages.has(id)) pages.set(id, { id, name: `Página ${id}`, controls: [] });
    return pages.get(id)!;
  };
  const counters: Record<string, number> = {};
  const stats = { pages: 0, touch: 0, display: 0, raw: 0, icl: 0, images: 0 };
  let maxX = 0;
  let maxY = 0;

  // Visualización (debajo) — en el archivo están del último al primero
  if (showF) {
    const show = parseShowFile(showF.data);
    project.settings.showFileMode = show.mode;
    project.settings.varsPerPage = show.varsPerPage;
    for (let p = 0; p <= show.maxPage; p++) page(p);
    for (const [pid, blocks] of show.pages) {
      const list: ControlInstance[] = [];
      for (const blk of blocks) {
        let d = decodeDisplay(blk);
        if (d && CHECKED_DISPLAY.has(d.type) && !sameBytes(blk, getDef(d.type).encode(makeControl(d.type, d.rect, d.props, 0), { width: 4096, height: 4096, pageId: pid, keyingIndex: { n: 0 } }))) d = null;
        let c: ControlInstance;
        if (d) {
          counters[d.type] = (counters[d.type] ?? 0) + 1;
          c = makeControl(d.type, d.rect, d.props, counters[d.type]);
          stats.display++;
        } else {
          stats.raw++;
          const x = (blk[8] << 8) | blk[9];
          const y = (blk[10] << 8) | blk[11];
          c = makeControl('rawDisplay', { x: x < 4096 ? x : 0, y: y < 4096 ? y : 0, w: 80, h: 40 }, { raw: bytesToHex(blk) }, stats.raw);
          c.name = `Visualización 0x${blk[0].toString(16).toUpperCase()}${blk[1].toString(16).toUpperCase().padStart(2, '0')}`;
        }
        readInit(cfgF?.data, c);
        maxX = Math.max(maxX, c.x + c.w);
        maxY = Math.max(maxY, c.y + c.h);
        list.push(c);
      }
      page(pid).controls.push(...list.reverse());
    }
    notes.push(`14ShowFile: formato ${show.mode === 'normal' ? 'normal' : show.mode === 'encrypted' ? 'cifrado' : 'de bloque fijo'}, página máxima ${show.maxPage}.`);
  }

  // Táctiles (encima)
  if (touchF) {
    const byPage = new Map<number, ControlInstance[]>();
    for (const { pageId, block } of parseTouchFile(touchF.data)) {
      const d = decodeTouch(block);
      let c: ControlInstance;
      if (d) {
        counters[d.type] = (counters[d.type] ?? 0) + 1;
        c = makeControl(d.type, d.rect, d.props, counters[d.type]);
        if (d.type === 'basicTouch' && d.props.keyValue !== '0000') {
          const code = parseInt(String(d.props.keyValue), 16);
          const ch = code >= 0x20 && code < 0x7f ? ` "${String.fromCharCode(code)}"` : '';
          c.name = `Tecla 0x${d.props.keyValue}${ch}`;
        } else if (d.type === 'basicTouch' && Number(d.props.picNext) >= 0) {
          c.name = `Ir a página ${d.props.picNext}`;
        }
        stats.touch++;
      } else {
        stats.raw++;
        const x1 = (block[2] << 8) | block[3];
        const y1 = (block[4] << 8) | block[5];
        const x2 = (block[6] << 8) | block[7];
        const y2 = (block[8] << 8) | block[9];
        c = makeControl('rawTouch', { x: x1, y: y1, w: Math.max(4, x2 - x1), h: Math.max(4, y2 - y1) }, { raw: bytesToHex(block) }, stats.raw);
        c.name = `Táctil 0x${block[14].toString(16).toUpperCase()}${block[15].toString(16).toUpperCase().padStart(2, '0')}`;
      }
      maxX = Math.max(maxX, c.x + c.w);
      maxY = Math.max(maxY, c.y + c.h);
      if (!byPage.has(pageId)) byPage.set(pageId, []);
      byPage.get(pageId)!.push(c);
    }
    for (const [pid, list] of byPage) page(pid).controls.push(...list.reverse());
  }

  // Bibliotecas ICL
  const iclImages = new Map<number, IclImage[]>();
  for (const f of files.filter((x) => ext(x.name) === 'icl')) {
    const id = iclIdFromName(f.name);
    if (id == null || !isIcl(f.data)) {
      notes.push(`${baseName(f.name)}: no es un ICL de DGUS II, se omitió.`);
      continue;
    }
    try {
      const { images, crcOk } = parseIcl(f.data);
      iclImages.set(id, images);
      project.icl![id] = toBase64(f.data);
      project.iconLibs[id] = baseName(f.name);
      stats.icl++;
      if (!crcOk) notes.push(`${baseName(f.name)}: el CRC no coincide (archivo dañado o modificado).`);
    } catch (e) {
      notes.push(`${baseName(f.name)}: ${(e as Error).message}`);
    }
  }

  // Los controles de icono toman el tamaño real del icono
  const ICON_OF: Record<string, [string, string]> = {
    iconVar: ['iconLib', 'iconMin'],
    multiLanguage: ['iconLib', 'iconMin'],
    bitIcon: ['iconLib', 'icon0s'],
    animIcon: ['iconLib', 'iconStart'],
    artVar: ['iconLib', 'icon0'],
    iconRotate: ['iconLib', 'iconId'],
  };
  for (const pg of pages.values())
    for (const c of pg.controls) {
      const k = ICON_OF[c.type];
      const img = k && iclImages.get(Number(c.props[k[0]]))?.find((i) => i.id === Number(c.props[k[1]]));
      if (img) {
        c.w = img.width;
        c.h = img.height;
      }
    }

  const sizes = new Map<string, number>();
  const bgLib = iclImages.get(project.settings.bgIclId);
  if (bgLib) {
    for (const img of bgLib) {
      // Con 14ShowFile la lista de páginas ya es conocida (0…página máxima). Las imágenes extra
      // del ICL (teclados, menús…) se conservan dentro del ICL pero no crean páginas: añadirlas
      // cambiaría la página máxima de 14ShowFile.bin.
      const pg = pages.get(img.id) ?? (!showF && img.id <= 300 ? page(img.id) : undefined);
      if (!pg || pg.background) continue;
      pg.background = `data:image/jpeg;base64,${toBase64(img.jpeg)}`;
      sizes.set(`${img.width}x${img.height}`, (sizes.get(`${img.width}x${img.height}`) ?? 0) + 1);
    }
  }

  // Fondos: primero la imagen N del ICL de fondos (lo que muestra la pantalla); si no hay, imágenes sueltas "N*.jpg/png/bmp".
  for (const f of files) {
    // Si hay biblioteca compilada, las imágenes sueltas pueden ser copias antiguas o recursos
    // aún no compilados. Importarlas añadiría páginas y alteraría el paquete sin una edición.
    if (bgLib) continue;
    const e = ext(f.name);
    if (!MIME[e]) continue;
    const id = pageIdFromFileName(f.name);
    if (id == null) continue;
    const pg = page(id);
    if (pg.background) continue;
    pg.background = `data:${MIME[e]};base64,${toBase64(f.data)}`;
    stats.images++;
    const dims = imageSize(f.data, e);
    if (dims) sizes.set(`${dims.w}x${dims.h}`, (sizes.get(`${dims.w}x${dims.h}`) ?? 0) + 1);
  }
  // Otros archivos que se copian tal cual al exportar (fuentes, configuración…)
  for (const f of files) {
    const n = baseName(f.name);
    if (/\.(hzk|dzk|bin|cfg|wae|lib|gtf|uic|crc)$/i.test(n) && f !== touchF && f !== showF && f !== cfgF) {
      project.extraFiles![n] = toBase64(f.data);
    }
  }

  // Resolución: la del tamaño de fondo más frecuente; si no, la que abarca todos los controles.
  // Las áreas de teclado y menús también cuentan: DGUS las recorta al tamaño de pantalla.
  for (const pg of pages.values())
    for (const c of pg.controls)
      for (const [k, v] of Object.entries(c.props)) {
        if (typeof v !== 'number' || v >= 4096) continue;
        if (/^(kb|menu|show|py)\w*X\d?$/.test(k)) maxX = Math.max(maxX, v + 1);
        if (/^(kb|menu|show|py)\w*Y\d?$/.test(k)) maxY = Math.max(maxY, v + 1);
      }
  const covers = (w: number, h: number) => w >= maxX && h >= maxY;
  const best = [...sizes.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k.split('x').map(Number));
  const fromImages = best.find(([w, h]) => covers(w, h));
  const COMMON = [
    [480, 272], [272, 480], [320, 240], [240, 320], [480, 480], [800, 480], [480, 800],
    [854, 480], [480, 854], [1024, 600], [600, 1024], [1280, 800], [800, 1280], [1024, 768], [1280, 480],
  ];
  const fromList = [...COMMON].sort((a, b) => a[0] * a[1] - b[0] * b[1]).find(([w, h]) => covers(w, h));
  const pick = fromImages ?? (best[0] && !maxX ? best[0] : undefined) ?? fromList ?? [Math.max(maxX, 1), Math.max(maxY, 1)];
  project.settings.width = pick[0];
  project.settings.height = pick[1];
  if (maxX > project.settings.width || maxY > project.settings.height) {
    notes.push(`Hay controles hasta ${maxX}×${maxY}, fuera de la resolución deducida ${project.settings.width}×${project.settings.height}. Revise «Proyecto».`);
  }

  if (cfgF) {
    project.extraFiles!['__22_original'] = toBase64(cfgF.data);
    // Configuración de PLC_Config: se vuelve editable solo si al regenerarla sale idéntica.
    const plc = readPlcConfig(cfgF.data);
    if (plc && sameBytes(applyPlcConfig(cfgF.data.subarray(0, 131076), plc), cfgF.data)) {
      project.modbus = plc;
      notes.push('22_Config.bin: configuración de comunicación PLC/Modbus importada y editable.');
    } else if (cfgF.data.length > 131076) notes.push('22_Config.bin: tiene datos extra (Modbus o red) que se conservan sin cambios.');
  }
  project.pages = [...pages.values()].sort((a, b) => a.id - b.id);
  if (!project.pages.length) project.pages.push({ id: 0, name: 'Inicio', controls: [] });
  stats.pages = project.pages.length;
  if (stats.raw) notes.push(`${stats.raw} controles de tipos poco comunes se conservan como bloques originales (se exportan sin cambios).`);
  return { project, notes, stats };
}

/** Lee ancho y alto de un JPEG, PNG o BMP sin decodificar la imagen. */
export function imageSize(b: Uint8Array, e: string): { w: number; h: number } | null {
  if (e === 'png' && b.length > 24) return { w: (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19], h: (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23] };
  if (e === 'bmp' && b.length > 26) {
    const dv = new DataView(b.buffer, b.byteOffset);
    return { w: dv.getInt32(18, true), h: Math.abs(dv.getInt32(22, true)) };
  }
  if (e === 'jpg' || e === 'jpeg') {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xc3) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
      if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) {
        i += 2;
        continue;
      }
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
  }
  return null;
}
