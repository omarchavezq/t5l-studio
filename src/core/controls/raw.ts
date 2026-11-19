// Bloques importados que T5L Studio no sabe editar todavía. Se conservan byte a byte.

import type { ControlDef } from './schema';
import { str } from './schema';

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  const out = new Uint8Array(Math.floor(clean.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

const rawField = { key: 'raw', label: 'Bytes originales', type: 'hex' as const, default: '', group: 'Bloque original', help: 'Se exportan tal cual. Edite solo si conoce el formato.' };

export const rawDisplay: ControlDef = {
  type: 'rawDisplay',
  kind: 'display',
  label: 'Visualización importada',
  legacy: 'Bloque de 14ShowFile.bin',
  category: 'Sistema',
  icon: 'FileCode',
  description: 'Control de visualización importado que se conserva tal cual.',
  defaultSize: { w: 80, h: 40 },
  hidden: true,
  fields: [rawField],
  encode(c) {
    const b = new Uint8Array(32);
    b.set(hexToBytes(str(c.props, 'raw')).slice(0, 32));
    return b;
  },
  preview: (c) => ({ style: 'box', text: `0x${str(c.props, 'raw').slice(0, 5).replace(' ', '')}` }),
};

export const rawTouch: ControlDef = {
  type: 'rawTouch',
  kind: 'touch',
  label: 'Táctil importado',
  legacy: 'Bloque de 13TouchFile.bin',
  category: 'Sistema',
  icon: 'FileCode',
  description: 'Control táctil importado que se conserva tal cual (se actualizan la página y el área).',
  defaultSize: { w: 80, h: 40 },
  hidden: true,
  fields: [rawField],
  encode(c, ctx) {
    const b = hexToBytes(str(c.props, 'raw'));
    b[0] = (b[0] & 0xfc) | ((ctx.pageId >> 8) & 3);
    b[1] = ctx.pageId & 0xff;
    if (!(b[2] === 0xff && b[6] === 0xff)) {
      const put = (i: number, v: number) => ((b[i] = (v >> 8) & 0xff), (b[i + 1] = v & 0xff));
      put(2, c.x);
      put(4, c.y);
      put(6, c.x + c.w);
      put(8, c.y + c.h);
    }
    return b;
  },
  preview: (c) => ({ style: 'button', text: `táctil ${str(c.props, 'raw').slice(42, 47)}` }),
};
