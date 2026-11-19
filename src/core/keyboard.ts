// Teclados DGUS: una página con su imagen y una zona táctil básica por tecla.
//
// Códigos verificados con los proyectos del usuario (muestras E, F y C):
//   dígitos 0x0030–0x0039 · 0x00F0 ESC (cancelar) · 0x00F1 OK (confirmar) · 0x00F2 borrar
//   letras: byte alto = mayúscula, byte bajo = minúscula (0x5171 = Q/q)
// Según el manual de DGUS II, sin verificar en pantalla: 0x00F4 mayúsculas, Ñ = 0xD1F1.

export type KeyboardKind = 'numerico' | 'hex' | 'alfanumerico';

export interface KeyDef {
  label: string;
  code: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface KeyboardOptions {
  /** Añade la Ñ (código 0xD1F1, sin verificar). Necesita una fuente Latín-1 para mostrarse. */
  enie?: boolean;
  /** Añade punto decimal y signo menos al teclado numérico. */
  decimal?: boolean;
}

export const KEY = { ESC: 0x00f0, OK: 0x00f1, BORRAR: 0x00f2, MAYUS: 0x00f4, ESPACIO: 0x0020 };

/** Códigos que dependen del manual y aún no se han probado en una pantalla. */
export const UNVERIFIED_CODES = new Set([KEY.MAYUS, 0xd1f1]);

type Cell = [label: string, code: number, span?: number];

const ch = (c: string): Cell => [c, c.charCodeAt(0)];
const letter = (c: string): Cell => [c, (c.charCodeAt(0) << 8) | c.toLowerCase().charCodeAt(0)];

function rows(kind: KeyboardKind, o: KeyboardOptions): Cell[][] {
  if (kind === 'numerico') {
    return [
      [ch('7'), ch('8'), ch('9'), ['BORRAR', KEY.BORRAR]],
      [ch('4'), ch('5'), ch('6'), o.decimal ? ch('-') : ['', -1]],
      [ch('1'), ch('2'), ch('3'), o.decimal ? ch('.') : ['', -1]],
      [['ESC', KEY.ESC], ch('0'), ['OK', KEY.OK, 2]],
    ];
  }
  if (kind === 'hex') {
    return [
      [ch('7'), ch('8'), ch('9'), ch('F')],
      [ch('4'), ch('5'), ch('6'), ch('E')],
      [ch('1'), ch('2'), ch('3'), ch('D')],
      [ch('0'), ch('A'), ch('B'), ch('C')],
      [['ESC', KEY.ESC], ['BORRAR', KEY.BORRAR], ['OK', KEY.OK, 2]],
    ];
  }
  const third = 'ASDFGHJKL'.split('').map(letter);
  if (o.enie) third.push(['Ñ', 0xd1f1]);
  return [
    '1234567890'.split('').map(ch),
    'QWERTYUIOP'.split('').map(letter),
    third,
    [...'ZXCVBNM'.split('').map(letter), ch('.'), ch('-'), ['BORRAR', KEY.BORRAR]],
    [['MAYÚS', KEY.MAYUS, 2], ['ESPACIO', KEY.ESPACIO, 4], ['ESC', KEY.ESC, 2], ['OK', KEY.OK, 2]],
  ];
}

/** Coloca las teclas dentro de `area`, en una rejilla con separación `gap`. */
export function keyboardLayout(kind: KeyboardKind, area: { x: number; y: number; w: number; h: number }, o: KeyboardOptions = {}, gap = 6): KeyDef[] {
  const grid = rows(kind, o);
  const cols = Math.max(...grid.map((r) => r.reduce((n, c) => n + (c[2] ?? 1), 0)));
  const kw = (area.w - gap * (cols + 1)) / cols;
  const kh = (area.h - gap * (grid.length + 1)) / grid.length;
  const out: KeyDef[] = [];
  grid.forEach((row, r) => {
    let col = 0;
    for (const [label, code, span = 1] of row) {
      const x = area.x + gap + col * (kw + gap);
      const y = area.y + gap + r * (kh + gap);
      if (code >= 0) out.push({ label, code, x: Math.round(x), y: Math.round(y), w: Math.round(span * kw + (span - 1) * gap), h: Math.round(kh) });
      col += span;
    }
  });
  return out;
}

/** Tamaño recomendado del área del teclado para una pantalla. */
export function keyboardArea(kind: KeyboardKind, width: number, height: number): { x: number; y: number; w: number; h: number } {
  const w = Math.min(width - 10, kind === 'alfanumerico' ? 800 : 480);
  const rowsN = kind === 'numerico' ? 4 : 5;
  const h = Math.min(Math.round(height * 0.5), rowsN * (kind === 'alfanumerico' ? 64 : 72));
  return { x: Math.round((width - w) / 2), y: height - h - 5, w, h };
}

/** Lo que haría la pantalla al recibir una tecla mientras se escribe (para el simulador). */
export function applyKey(buffer: string, code: number, caps: boolean): { buffer: string; caps: boolean; done?: 'ok' | 'cancel' } {
  if (code === KEY.OK) return { buffer, caps, done: 'ok' };
  if (code === KEY.ESC) return { buffer, caps, done: 'cancel' };
  if (code === KEY.BORRAR) return { buffer: buffer.slice(0, -1), caps };
  if (code === KEY.MAYUS) return { buffer, caps: !caps };
  const hi = code >> 8;
  const lo = code & 0xff;
  const c = hi && caps ? hi : lo;
  return { buffer: buffer + String.fromCharCode(c), caps };
}
