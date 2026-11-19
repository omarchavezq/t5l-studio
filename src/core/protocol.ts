// Protocolo serie DGUS II (T5L).
//
//   Trama:  H1 H2  LEN  CMD  DATOS…  [CRC_lo CRC_hi]
//   H1 H2   cabecera, por defecto 5A A5 (configurable en la pantalla)
//   LEN     bytes de CMD + DATOS (+ 2 si hay CRC)
//   CRC     CRC16 Modbus de CMD + DATOS
//
//   0x82  escribir VP:   82 VPH VPL d0 d1 …         respuesta: 82 4F 4B ("OK")
//   0x83  leer VP:       83 VPH VPL N(palabras)     respuesta: 83 VPH VPL N d0 d1 …
//         La pantalla también envía 0x83 por sí sola cuando el usuario cambia un valor.
//   0x8F  descarga:      8F 55 NN  → la pantalla responde y espera 256 KB para el sector NN
//         (tomado de frmTextA.Downfile en DGUS V7.651).

import { crc16Modbus } from './icl';

export interface LinkOptions {
  header: [number, number];
  crc: boolean;
}

export const DEFAULT_LINK: LinkOptions = { header: [0x5a, 0xa5], crc: false };

export interface Frame {
  cmd: number;
  data: Uint8Array;
  raw: Uint8Array;
  crcOk: boolean | null;
}

export function frame(cmd: number, data: ArrayLike<number>, opt: LinkOptions = DEFAULT_LINK): Uint8Array {
  const body = Uint8Array.from([cmd, ...Array.from(data)]);
  const len = body.length + (opt.crc ? 2 : 0);
  const out = new Uint8Array(3 + len);
  out[0] = opt.header[0];
  out[1] = opt.header[1];
  out[2] = len;
  out.set(body, 3);
  if (opt.crc) {
    const c = crc16Modbus(body);
    out[3 + body.length] = c & 0xff;
    out[4 + body.length] = c >> 8;
  }
  return out;
}

export const writeVp = (vp: number, bytes: ArrayLike<number>, opt?: LinkOptions) => frame(0x82, [vp >> 8, vp & 0xff, ...Array.from(bytes)], opt);

export const writeWords = (vp: number, words: number[], opt?: LinkOptions) =>
  writeVp(vp, words.flatMap((w) => [(w >> 8) & 0xff, w & 0xff]), opt);

export const readVp = (vp: number, words: number, opt?: LinkOptions) => frame(0x83, [vp >> 8, vp & 0xff, words & 0xff], opt);

/** Petición de descarga del sector NN de 256 KB (los archivos 13*.bin, 32.icl… empiezan en el sector de su número). */
export const sectorRequest = (sector: number, opt?: LinkOptions) => frame(0x8f, [0x55, sector & 0xff], opt);

/** Respuesta de la pantalla a una lectura: 83 VP N datos. */
export function readReply(vp: number, data: Uint8Array, opt?: LinkOptions): Uint8Array {
  const words = Math.ceil(data.length / 2);
  const padded = new Uint8Array(words * 2);
  padded.set(data);
  return frame(0x83, [vp >> 8, vp & 0xff, words, ...Array.from(padded)], opt);
}

export const okReply = (opt?: LinkOptions) => frame(0x82, [0x4f, 0x4b], opt);

// Direcciones del sistema (manual de DGUS II)
export const SYS = {
  reset: 0x0004, // escribir 55 AA 5A A5 reinicia
  version: 0x000f,
  rtc: 0x0010,
  pageId: 0x0014, // página actual (lectura)
  brightness: 0x0031,
  ledConfig: 0x0082, // brillo encendido / apagado / tiempo
  picSet: 0x0084, // 5A 01 PP PP cambia de página
};

export const pageSwitch = (page: number, opt?: LinkOptions) => writeVp(SYS.picSet, [0x5a, 0x01, page >> 8, page & 0xff], opt);
export const resetScreen = (opt?: LinkOptions) => writeVp(SYS.reset, [0x55, 0xaa, 0x5a, 0xa5], opt);

/** Acumula bytes del puerto y extrae tramas completas. */
export class FrameParser {
  private buf: number[] = [];
  constructor(private opt: LinkOptions = DEFAULT_LINK) {}

  setOptions(opt: LinkOptions) {
    this.opt = opt;
  }

  push(chunk: Uint8Array): { frames: Frame[]; junk: Uint8Array[] } {
    for (const x of chunk) this.buf.push(x);
    const frames: Frame[] = [];
    const junk: Uint8Array[] = [];
    const [h1, h2] = this.opt.header;
    for (;;) {
      let start = -1;
      for (let i = 0; i + 1 < this.buf.length; i++) {
        if (this.buf[i] === h1 && this.buf[i + 1] === h2) {
          start = i;
          break;
        }
      }
      if (start < 0) {
        // conserva un posible primer byte de cabecera
        const keep = this.buf.length && this.buf[this.buf.length - 1] === h1 ? 1 : 0;
        if (this.buf.length - keep > 0) junk.push(Uint8Array.from(this.buf.slice(0, this.buf.length - keep)));
        this.buf = this.buf.slice(this.buf.length - keep);
        break;
      }
      if (start > 0) {
        junk.push(Uint8Array.from(this.buf.slice(0, start)));
        this.buf = this.buf.slice(start);
      }
      if (this.buf.length < 3) break;
      const len = this.buf[2];
      if (this.buf.length < 3 + len) break;
      const raw = Uint8Array.from(this.buf.slice(0, 3 + len));
      this.buf = this.buf.slice(3 + len);
      let body = raw.slice(3);
      let crcOk: boolean | null = null;
      if (this.opt.crc && body.length >= 3) {
        const c = crc16Modbus(body.slice(0, -2));
        crcOk = body[body.length - 2] === (c & 0xff) && body[body.length - 1] === c >> 8;
        body = body.slice(0, -2);
      }
      if (!body.length) continue;
      frames.push({ cmd: body[0], data: body.slice(1), raw, crcOk });
    }
    return { frames, junk };
  }
}

/** Descripción legible de una trama, para el monitor. */
export function describe(f: Frame): string {
  const vp = f.data.length >= 2 ? ((f.data[0] << 8) | f.data[1]).toString(16).toUpperCase().padStart(4, '0') : '';
  if (f.cmd === 0x82 && f.data.length === 2 && f.data[0] === 0x4f && f.data[1] === 0x4b) return 'OK';
  if (f.cmd === 0x82) return `Escribir VP 0x${vp} · ${f.data.length - 2} bytes`;
  if (f.cmd === 0x83 && f.data.length === 3) return `Leer VP 0x${vp} · ${f.data[2]} palabras`;
  if (f.cmd === 0x83) return `Valor de VP 0x${vp} · ${f.data[2]} palabras`;
  if (f.cmd === 0x8f) return `Descarga sector ${f.data[1]}`;
  return `Comando 0x${f.cmd.toString(16).toUpperCase()}`;
}

export const SECTOR = 256 * 1024;

export interface Sector {
  sector: number;
  file: string;
  data: Uint8Array;
}

/**
 * Divide los archivos de DWIN_SET en sectores de 256 KB. El número inicial del nombre
 * es el primer sector (13TouchFile.bin → 13, 32.icl → 32, 0_DWIN_ASC.HZK → 0).
 */
export function planDownload(files: { name: string; data: Uint8Array }[]): { sectors: Sector[]; warnings: string[] } {
  const sectors: Sector[] = [];
  const warnings: string[] = [];
  const owner = new Map<number, string>();
  for (const f of files) {
    const m = /^(\d+)/.exec(f.name);
    if (!m) {
      // Según la guía DGUS II: programas y configuración solo se cargan por la tarjeta SD.
      if (/^(T5L|DWINOS)/i.test(f.name) || /\.(cfg|crc)$/i.test(f.name)) warnings.push(`${f.name}: programa o configuración de la pantalla; solo se carga por la tarjeta SD.`);
      else warnings.push(`${f.name}: sin número inicial, no se descarga.`);
      continue;
    }
    // .LIB (NOR interna, IDs 0–79) y .UIC (módulos de 32 KB) no ocupan sectores de 256 KB.
    if (/\.(lib|uic)$/i.test(f.name)) {
      warnings.push(`${f.name}: va a otra memoria de la pantalla; solo se carga por la tarjeta SD.`);
      continue;
    }
    const first = parseInt(m[1], 10);
    const n = Math.max(1, Math.ceil(f.data.length / SECTOR));
    for (let k = 0; k < n; k++) {
      const s = first + k;
      if (s > 255) {
        warnings.push(`${f.name}: excede el sector 255.`);
        break;
      }
      if (owner.has(s)) warnings.push(`${f.name} se solapa con ${owner.get(s)} en el sector ${s}.`);
      owner.set(s, f.name);
      sectors.push({ sector: s, file: f.name, data: f.data.subarray(k * SECTOR, (k + 1) * SECTOR) });
    }
  }
  sectors.sort((a, b) => a.sector - b.sector);
  return { sectors, warnings };
}

export const toHexStr = (b: ArrayLike<number>) => Array.from(b, (x) => x.toString(16).toUpperCase().padStart(2, '0')).join(' ');

export function parseHexStr(s: string): Uint8Array {
  const clean = s.replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '');
  const out = new Uint8Array(Math.floor(clean.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}
