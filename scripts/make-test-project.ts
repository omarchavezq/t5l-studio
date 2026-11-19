// Genera ejemplos/prueba-t5l.dgusx: proyecto de referencia para probar en una pantalla real (Hito 2).
// Uso: npx vite-node scripts/make-test-project.ts
//
// Los fondos se dibujan aquí mismo (fuente de píxeles 5×7 y PNG con zlib) para que el
// resultado sea reproducible y no dependa de imágenes externas ni de datos del usuario.

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createControl } from '../src/core/controls';
import { newProject, serialize } from '../src/core/project';
import type { ControlInstance, Page } from '../src/core/types';

const W = 480;
const H = 854;

// ------------------------------------------------------------------ fuente 5×7 (filas, bit 4 = izquierda)
const FONT: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  '0': [14, 17, 19, 21, 25, 17, 14], '1': [4, 12, 4, 4, 4, 4, 14], '2': [14, 17, 1, 2, 4, 8, 31], '3': [31, 2, 4, 2, 1, 17, 14],
  '4': [2, 6, 10, 18, 31, 2, 2], '5': [31, 16, 30, 1, 1, 17, 14], '6': [6, 8, 16, 30, 17, 17, 14], '7': [31, 1, 2, 4, 8, 8, 8],
  '8': [14, 17, 17, 14, 17, 17, 14], '9': [14, 17, 17, 15, 1, 2, 12],
  ' ': [0, 0, 0, 0, 0, 0, 0], '+': [0, 4, 4, 31, 4, 4, 0], '-': [0, 0, 0, 31, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12],
  ':': [0, 12, 12, 0, 12, 12, 0], '/': [1, 1, 2, 4, 8, 16, 16], '(': [2, 4, 8, 8, 8, 4, 2], ')': [8, 4, 2, 2, 2, 4, 8],
  '<': [2, 4, 8, 16, 8, 4, 2], '>': [8, 4, 2, 1, 2, 4, 8], '#': [10, 10, 31, 10, 31, 10, 10],
};

class Img {
  px = new Uint8Array(W * H * 3);
  constructor(bg: [number, number, number]) {
    for (let i = 0; i < W * H; i++) this.px.set(bg, i * 3);
  }
  rect(x: number, y: number, w: number, h: number, c: [number, number, number]) {
    for (let j = Math.max(0, y); j < Math.min(H, y + h); j++)
      for (let i = Math.max(0, x); i < Math.min(W, x + w); i++) this.px.set(c, (j * W + i) * 3);
  }
  frame(x: number, y: number, w: number, h: number, c: [number, number, number], t = 2) {
    this.rect(x, y, w, t, c);
    this.rect(x, y + h - t, w, t, c);
    this.rect(x, y, t, h, c);
    this.rect(x + w - t, y, t, h, c);
  }
  text(s: string, x: number, y: number, scale: number, c: [number, number, number]) {
    let cx = x;
    for (const ch of s.toUpperCase()) {
      const g = FONT[ch] ?? FONT[' '];
      g.forEach((row, r) => {
        for (let b = 0; b < 5; b++) if (row & (16 >> b)) this.rect(cx + b * scale, y + r * scale, scale, scale, c);
      });
      cx += 6 * scale;
    }
  }
  /** Texto centrado en un rectángulo. */
  label(s: string, x: number, y: number, w: number, h: number, scale: number, c: [number, number, number]) {
    const tw = s.length * 6 * scale - scale;
    this.text(s, x + Math.round((w - tw) / 2), y + Math.round((h - 7 * scale) / 2), scale, c);
  }
  button(x: number, y: number, w: number, h: number, s: string) {
    this.rect(x, y, w, h, [37, 99, 235]);
    this.frame(x, y, w, h, [147, 197, 253]);
    const scale = Math.max(1, Math.min(3, Math.floor((w - 10) / (s.length * 6))));
    this.label(s, x, y, w, h, scale, [255, 255, 255]);
  }
  field(x: number, y: number, w: number, h: number) {
    this.rect(x, y, w, h, [24, 32, 44]);
    this.frame(x, y, w, h, [71, 85, 105], 1);
  }
  png(): string {
    const raw = Buffer.alloc((W * 3 + 1) * H);
    for (let y = 0; y < H; y++) Buffer.from(this.px.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1);
    const chunk = (type: string, data: Buffer) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(crc32(td));
      return Buffer.concat([len, td, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(W, 0);
    ihdr.writeUInt32BE(H, 4);
    ihdr.set([8, 2, 0, 0, 0], 8);
    const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
    return 'data:image/png;base64,' + png.toString('base64');
  }
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(b: Buffer) {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ------------------------------------------------------------------ proyecto

const BG: [number, number, number] = [15, 21, 30];
const CAPTION: [number, number, number] = [148, 163, 184];
const TITLE: [number, number, number] = [255, 255, 255];

const project = newProject('Prueba T5L 480x854', {
  width: W,
  height: H,
  autoFonts: true,
  fontFamily: 'Arial',
  deviceConfig: 'preserve', // la pantalla conserva su propio T5LCFG.CFG
  bgIclId: 32,
});

function ctl(page: Page, type: string, name: string, x: number, y: number, w: number, h: number, props: Record<string, string | number | boolean>): ControlInstance {
  const c = createControl(type, x, y, name);
  c.w = w;
  c.h = h;
  Object.assign(c.props, props);
  page.controls.push(c);
  return c;
}

// --- Página 0: pruebas
const p0: Page = { id: 0, name: 'Pruebas', controls: [] };
const i0 = new Img(BG);
i0.label('PRUEBA T5L STUDIO', 0, 14, W, 30, 3, TITLE);

const sec = (n: number, s: string, y: number) => i0.text(`${n} ${s}`, 20, y, 2, CAPTION);

sec(1, 'NUMERO 23.5 (VP 5000)', 62);
i0.field(20, 84, 220, 52);
ctl(p0, 'dataVar', 'Numero 5000', 24, 86, 200, 48, { vp: '5000', nInt: 3, nDot: 1, unit: ' C', init: '235', fontId: 0, fontSize: 24, color: 0xffe0 });

sec(2, 'TEXTO ASCII (VP 5100)', 150);
i0.field(20, 172, 440, 36);
ctl(p0, 'text', 'Texto ASCII', 24, 174, 432, 32, { vp: '5100', textLength: 32, init: 'Hola T5L Studio 123', encoding: 0, font1: 1, fontX: 12, fontY: 24, color: 0xffff });

sec(3, 'TEXTO DGUS II UNICODE (VP 5120)', 222);
i0.field(20, 244, 440, 44);
ctl(p0, 'textII', 'Texto DGUS II', 24, 246, 432, 40, { vp: '5120', textLength: 32, init: 'Presión 25°C ñ á', encoding: 5, fontId: 2, fontHeight: 100, color: 0x07ff });

sec(4, 'RELOJ', 302);
i0.field(20, 324, 280, 30);
ctl(p0, 'rtc', 'Reloj', 26, 327, 264, 24, { format: 'Y-M-D H:Q:S', fontId: 0, fontSize: 12, color: 0xffff });

sec(5, 'BARRA Y +/- (VP 5003)', 368);
ctl(p0, 'progressBar', 'Barra', 20, 398, 290, 30, { vp: '5003', vMin: 0, vMax: 100, foreColor: 0x07e0, backColor: 0x2104, borderColor: 0xffff });
i0.button(326, 390, 64, 48, '-');
ctl(p0, 'incAdjust', 'Restar', 326, 390, 64, 48, { vp: '5003', adjMode: 0, step: 10, vMin: 0, vMax: 100 });
i0.button(398, 390, 64, 48, '+');
ctl(p0, 'incAdjust', 'Sumar', 398, 390, 64, 48, { vp: '5003', adjMode: 1, step: 10, vMin: 0, vMax: 100 });
i0.field(20, 440, 120, 34);
ctl(p0, 'dataVar', 'Valor 5003', 26, 443, 100, 32, { vp: '5003', nInt: 3, nDot: 0, init: '40', fontId: 0, fontSize: 16, color: 0xffff });

sec(6, 'VALOR DE RETORNO (VP 5004)', 488);
i0.button(20, 510, 100, 48, 'VALOR 1');
ctl(p0, 'keyReturn', 'Retorno 1', 20, 510, 100, 48, { vp: '5004', keyValue: 1 });
i0.button(130, 510, 100, 48, 'VALOR 2');
ctl(p0, 'keyReturn', 'Retorno 2', 130, 510, 100, 48, { vp: '5004', keyValue: 2 });
i0.field(250, 512, 90, 44);
ctl(p0, 'dataVar', 'Valor 5004', 258, 518, 60, 32, { vp: '5004', nInt: 1, nDot: 0, fontId: 0, fontSize: 16, color: 0xffff });

sec(7, 'BIT 0 (VP 5005)', 572);
i0.button(20, 594, 140, 48, 'BIT 0');
ctl(p0, 'bitButton', 'Bit 0', 20, 594, 140, 48, { vp: '5005', bitPos: 0, adjMode: 2 });
i0.field(180, 596, 90, 44);
ctl(p0, 'dataVar', 'Valor 5005', 188, 602, 60, 32, { vp: '5005', nInt: 1, nDot: 0, fontId: 0, fontSize: 16, color: 0xffff });

sec(8, 'ENTRADA NUMERICA (VP 5006)', 656);
i0.field(20, 678, 220, 48);
i0.text('TOQUE AQUI', 260, 694, 2, CAPTION);
// Mismo diseño que el teclado de Muestra E: teclado en otra página, recorte mostrado abajo.
ctl(p0, 'dataVar', 'Valor 5006', 28, 686, 180, 32, { vp: '5006', nInt: 4, nDot: 0, fontId: 0, fontSize: 16, color: 0xffff });
ctl(p0, 'dataInput', 'Entrada 5006', 20, 678, 220, 48, {
  vp: '5006', varType: 0, nInt: 4, nDot: 0, showAuto: false, showX: 28, showY: 686, showColor: 0xffe0, fontId: 0, fontHor: 16,
  kbSource: 1, picKb: 1, kbX1: 5, kbY1: 243, kbX2: 475, kbY2: 606, kbPosX: 5, kbPosY: 480,
});

i0.button(20, 760, 440, 64, 'IR A PAGINA 2');
ctl(p0, 'basicTouch', 'Ir a página 2', 20, 760, 440, 64, { picNext: 2 });
p0.background = i0.png();

// --- Página 1: teclado numérico (mismas posiciones y códigos que Muestra E)
const p1: Page = { id: 1, name: 'Teclado', controls: [] };
const i1 = new Img([30, 41, 59]);
i1.label('TECLADO NUMERICO', 0, 200, W, 30, 3, TITLE);
i1.rect(5, 243, 470, 363, [30, 41, 59]);
i1.frame(5, 243, 470, 363, [148, 163, 184]);
const keys: [string, string, number, number][] = [
  ['BORRAR', '00F2', 317, 262],
  ['7', '0037', 46, 330], ['8', '0038', 180, 330], ['9', '0039', 317, 330],
  ['4', '0034', 46, 399], ['5', '0035', 180, 399], ['6', '0036', 317, 399],
  ['1', '0031', 46, 470], ['2', '0032', 180, 470], ['3', '0033', 317, 470],
  ['ESC', '00F0', 46, 538], ['0', '0030', 180, 538], ['OK', '00F1', 317, 538],
];
for (const [label, code, x, y] of keys) {
  i1.button(x, y, 117, 55, label);
  ctl(p1, 'basicTouch', `Tecla ${label}`, x, y, 117, 55, { keyValue: code });
}
p1.background = i1.png();

// --- Página 2: cambio de página y variable compartida
const p2: Page = { id: 2, name: 'Página 2', controls: [] };
const i2 = new Img([20, 40, 30]);
i2.label('PAGINA 2', 0, 30, W, 40, 4, TITLE);
i2.text('MISMO VP 5000 QUE LA PAGINA 0', 20, 120, 2, CAPTION);
i2.field(20, 144, 300, 76);
ctl(p2, 'dataVar', 'Numero 5000 grande', 28, 150, 280, 64, { vp: '5000', nInt: 3, nDot: 1, unit: ' C', fontId: 0, fontSize: 32, color: 0xffe0 });
i2.button(20, 760, 440, 64, 'VOLVER');
ctl(p2, 'basicTouch', 'Volver', 20, 760, 440, 64, { picNext: 0 });
p2.background = i2.png();

project.pages = [p0, p1, p2];
mkdirSync('ejemplos', { recursive: true });
writeFileSync('ejemplos/prueba-t5l.dgusx', serialize(project));
console.log('OK ejemplos/prueba-t5l.dgusx', project.pages.map((p) => `${p.id}:${p.controls.length}`).join(' '));
