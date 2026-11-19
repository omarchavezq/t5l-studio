// Simulador de la pantalla: memoria de variables (VP) y comportamiento de los controles.
// La memoria es la misma imagen que 22_Config.bin (2 bytes por dirección VP, big-endian).

import { parseHex } from './bytes';
import { SYS } from './protocol';
import type { ControlInstance } from './types';

export const VP_BYTES = 131076;

export class VpMemory {
  readonly b: Uint8Array;
  constructor(init?: Uint8Array) {
    this.b = new Uint8Array(VP_BYTES);
    if (init) this.b.set(init.subarray(0, VP_BYTES));
  }
  word(vp: number): number {
    return ((this.b[vp * 2] << 8) | this.b[vp * 2 + 1]) & 0xffff;
  }
  setWord(vp: number, v: number) {
    this.b[vp * 2] = (v >> 8) & 0xff;
    this.b[vp * 2 + 1] = v & 0xff;
  }
  bytes(vp: number, n: number): Uint8Array {
    return this.b.slice(vp * 2, vp * 2 + n);
  }
  setBytes(vp: number, data: ArrayLike<number>, byteOffset = 0) {
    const at = vp * 2 + byteOffset;
    if (at < 0 || at + data.length > this.b.length) return;
    this.b.set(Array.from(data), at);
  }
  /** Lee un número según el tipo de variable de DGUS (0 int16, 1 int32, 2 byte alto, 3 byte bajo, 4 int64, 5 uint16, 6 uint32, 7 float, 8 double). */
  number(vp: number, varType: number): number {
    const at = vp * 2;
    if (at + 8 > this.b.length) return 0;
    const dv = new DataView(this.b.buffer, at, 8);
    switch (varType) {
      case 1: return dv.getInt32(0);
      case 2: return this.b[at];
      case 3: return this.b[at + 1];
      case 4: return Number(dv.getBigInt64(0));
      case 5: return dv.getUint16(0);
      case 6: return dv.getUint32(0);
      case 7: return dv.getFloat32(0);
      case 8: return dv.getFloat64(0);
      default: return dv.getInt16(0);
    }
  }
  setNumber(vp: number, varType: number, v: number) {
    const at = vp * 2;
    if (at + 8 > this.b.length) return;
    const dv = new DataView(this.b.buffer, at, 8);
    const i = Math.round(v);
    switch (varType) {
      case 1: case 6: dv.setUint32(0, i >>> 0); break;
      case 2: this.b[at] = i & 0xff; break;
      case 3: this.b[at + 1] = i & 0xff; break;
      case 4: dv.setBigInt64(0, BigInt(i)); break;
      case 7: dv.setFloat32(0, v); break;
      case 8: dv.setFloat64(0, v); break;
      default: dv.setUint16(0, i & 0xffff);
    }
  }
  text(vp: number, maxBytes: number, encoding = 0): string {
    const raw = this.bytes(vp, Math.min(maxBytes, 512));
    let s = '';
    if (encoding === 5) {
      for (let i = 0; i + 1 < raw.length; i += 2) {
        const c = (raw[i] << 8) | raw[i + 1];
        if (!c || c === 0xffff) break;
        s += String.fromCharCode(c);
      }
      return s;
    }
    for (const x of raw) {
      if (!x || x === 0xff) break;
      s += String.fromCharCode(x);
    }
    return s;
  }
  setText(vp: number, s: string, maxBytes: number, encoding = 0) {
    const out: number[] = [];
    for (const ch of s) {
      const c = ch.charCodeAt(0);
      if (encoding === 5) out.push(c >> 8, c & 0xff);
      else out.push(c & 0xff);
    }
    // DGUS termina el texto con FF FF
    out.push(0xff, 0xff);
    this.setBytes(vp, out.slice(0, Math.max(2, maxBytes)));
  }
}

const VAR_WORDS = [1, 2, 1, 1, 4, 1, 2, 2, 4];

/** Efecto de tocar un control en el simulador. */
export interface TouchResult {
  /** Página a la que se cambia. */
  page?: number;
  /** Variables que se suben al MCU (trama 0x83 automática), en palabras. */
  upload?: { vp: number; words: number };
  /** Pide un valor al usuario antes de aplicar (entrada numérica o de texto). */
  ask?: { kind: 'number' | 'text'; title: string; current: string; apply: (value: string) => TouchResult };
  note?: string;
}

const pv = (c: ControlInstance, k: string, d = 0) => {
  const v = c.props[k];
  return typeof v === 'number' ? v : typeof v === 'boolean' ? Number(v) : Number(v ?? d) || d;
};
const vpOf = (c: ControlInstance, k = 'vp') => parseHex(c.props[k], 0);
const withPage = (c: ControlInstance, r: TouchResult): TouchResult => {
  const next = pv(c, 'picNext', -1);
  return next >= 0 ? { ...r, page: next } : r;
};

/** Valor numérico mostrado con decimales fijos, como en DGUS (el entero 1234 con 2 decimales es 12.34). */
export function formatFixed(raw: number, nInt: number, nDot: number, zeroPad = false): string {
  const scaled = nDot > 0 ? raw / Math.pow(10, nDot) : raw;
  let s = Math.abs(scaled).toFixed(nDot);
  if (zeroPad && nInt > 0) {
    const [i, d] = s.split('.');
    s = i.padStart(nInt, '0') + (d != null ? '.' + d : '');
  }
  return (scaled < 0 ? '-' : '') + s;
}

/**
 * Aplica el toque sobre un control táctil. `fraction` es la posición relativa del toque
 * dentro del control (0..1), usada por los deslizadores.
 */
export function touch(c: ControlInstance, mem: VpMemory, fraction = { x: 0.5, y: 0.5 }): TouchResult {
  switch (c.type) {
    case 'basicTouch':
      return withPage(c, {});
    case 'keyReturn': {
      const vp = vpOf(c);
      const v = pv(c, 'keyValue');
      const mode = pv(c, 'vpMode');
      if (mode === 1) mem.setBytes(vp, [v & 0xff], 0);
      else if (mode === 2) mem.setBytes(vp, [v & 0xff], 1);
      else mem.setWord(vp, v);
      return withPage(c, { upload: { vp, words: 1 } });
    }
    case 'incAdjust': {
      const vp = vpOf(c);
      const mode = pv(c, 'vpMode');
      const cur = mode === 1 ? mem.b[vp * 2] : mode === 2 ? mem.b[vp * 2 + 1] : mem.word(vp);
      const step = pv(c, 'step', 1);
      const min = pv(c, 'vMin');
      const max = pv(c, 'vMax');
      let next = pv(c, 'adjMode', 1) ? cur + step : cur - step;
      const wrap = pv(c, 'returnMode') === 1;
      if (next > max) next = wrap ? min : max;
      if (next < min) next = wrap ? max : min;
      if (mode === 1) mem.setBytes(vp, [next], 0);
      else if (mode === 2) mem.setBytes(vp, [next], 1);
      else mem.setWord(vp, next);
      return withPage(c, { upload: { vp, words: 1 } });
    }
    case 'bitButton': {
      const vp = vpOf(c);
      const bit = 1 << pv(c, 'bitPos');
      const cur = mem.word(vp);
      const a = pv(c, 'adjMode', 2);
      mem.setWord(vp, a === 0 ? cur & ~bit : a === 1 ? cur | bit : cur ^ bit);
      return withPage(c, { upload: { vp, words: 1 } });
    }
    case 'dataInput': {
      const vp = vpOf(c);
      const t = pv(c, 'varType');
      const nDot = pv(c, 'nDot');
      const current = formatFixed(mem.number(vp, t), pv(c, 'nInt'), nDot);
      return {
        ask: {
          kind: 'number',
          title: `${c.name}: introduzca un valor${nDot ? ` (${nDot} decimal${nDot > 1 ? 'es' : ''})` : ''}`,
          current,
          apply: (value) => {
            const n = Number(value.replace(',', '.'));
            if (!Number.isFinite(n)) return { note: 'Valor no válido' };
            let raw = Math.round(n * Math.pow(10, nDot));
            if (pv(c, 'limits')) raw = Math.max(pv(c, 'vMin'), Math.min(pv(c, 'vMax'), raw));
            mem.setNumber(vp, t, raw);
            return withPage(c, { upload: { vp, words: VAR_WORDS[t] ?? 1 } });
          },
        },
      };
    }
    case 'textInput':
    case 'gbkInput': {
      const vp = vpOf(c);
      const words = pv(c, 'maxLen', 10);
      return {
        ask: {
          kind: 'text',
          title: `${c.name}: introduzca el texto`,
          current: mem.text(vp, words * 2),
          apply: (value) => {
            mem.setText(vp, value, words * 2);
            return withPage(c, { upload: { vp, words } });
          },
        },
      };
    }
    case 'dragAdjust':
    case 'slideAdjust': {
      const vp = vpOf(c);
      const vertical = (pv(c, 'adjMode') & 0x0f) === 1;
      const f = vertical ? 1 - fraction.y : fraction.x;
      const a = pv(c, 'vBegin');
      const b = pv(c, 'vEnd', 100);
      mem.setWord(vp, Math.round(a + (b - a) * Math.max(0, Math.min(1, f))));
      return { upload: { vp, words: 1 } };
    }
    case 'popMenu':
      return withPage(c, { note: 'Menú emergente: muestre la página del menú y use sus botones.', page: pv(c, 'picMenu') });
    case 'pageSlide':
      return { page: fraction.x < 0.5 ? pv(c, 'picPre') : pv(c, 'picNextOne') };
    default:
      return withPage(c, {});
  }
}

/** Aplica una escritura recibida (trama 0x82) e informa si cambió la página. */
export function applyWrite(mem: VpMemory, vp: number, data: Uint8Array): { page?: number } {
  mem.setBytes(vp, data);
  if (vp === SYS.picSet && data[0] === 0x5a && data[1] === 0x01) return { page: (data[2] << 8) | data[3] };
  return {};
}
