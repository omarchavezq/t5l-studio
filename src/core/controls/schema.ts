import type { BuildContext, ControlInstance, PropValue, Props } from '../types';
import { Buf, parseHex } from '../bytes';

export type FieldType =
  | 'vp' // dirección de variable (hex, 16 bits)
  | 'int'
  | 'color' // RGB565
  | 'bool'
  | 'enum'
  | 'text'
  | 'hex' // cadena de bytes en hexadecimal
  | 'percent'
  | 'page' // número de página (-1 = ninguna)
  | 'iconLib'
  | 'font';

export interface FieldOption {
  value: number;
  label: string;
}

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  default: PropValue;
  group?: string;
  min?: number;
  max?: number;
  options?: FieldOption[];
  help?: string;
  /** Muestra el campo solo si se cumple la condición (p. ej. según el modo elegido). */
  showIf?: (p: Props) => boolean;
}

/** 'knob' = perilla física: no va en 13/14, se guarda en 120.lib. */
export type ControlKind = 'display' | 'touch' | 'knob';

/** Valor inicial que se escribe en 22_Config.bin para una dirección VP. */
export interface InitEntry {
  vp: number;
  bytes: Uint8Array;
  /** Desplazamiento en bytes desde el inicio del VP (1 = byte bajo). */
  byteOffset?: number;
}

export interface PreviewSpec {
  text?: string;
  color?: string;
  align?: 'left' | 'center' | 'right';
  fontPx?: number;
  style?: 'button' | 'box' | 'icon' | 'bar' | 'curve' | 'qr' | 'slider' | 'table' | 'clock';
  value?: number; // 0..1 para barras y deslizadores
}

export interface EncodeContext extends BuildContext {
  pageId: number;
  /** Contador de controles con teclado físico (Keying), compartido por todo el archivo 13. */
  keyingIndex: { n: number };
}

export interface ControlDef {
  type: string;
  kind: ControlKind;
  label: string;
  /** Nombre de la clase original en DGUS 7.6, útil para depurar compatibilidad. */
  legacy: string;
  category: string;
  icon: string; // nombre de icono lucide
  description: string;
  defaultSize: { w: number; h: number };
  fields: FieldDef[];
  /** Devuelve el bloque binario: 32 bytes en 14ShowFile; 16/32/48/64 bytes en 13TouchFile. */
  encode(c: ControlInstance, ctx: EncodeContext): Uint8Array;
  /** Valores iniciales para 22_Config.bin. */
  init?(c: ControlInstance): InitEntry[];
  preview?(c: ControlInstance): PreviewSpec;
  /** Primer campo VP del control, usado para autoasignar direcciones y detectar choques. */
  vpFields?: { key: string; words: (p: Props) => number }[];
  /** No aparece en la caja de herramientas (p. ej. bloques importados sin decodificar). */
  hidden?: boolean;
}

// ---------- utilidades para codificadores ----------

export const num = (p: Props, k: string, d = 0): number => {
  const v = p[k];
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  }
  return d;
};
export const vp = (p: Props, k: string, d = 0): number => parseHex(p[k], d);
export const bool = (p: Props, k: string): boolean => p[k] === true || p[k] === 1 || p[k] === 'true';
export const str = (p: Props, k: string): string => (p[k] == null ? '' : String(p[k]));
export const pct255 = (percent: number): number => Math.trunc((255 * percent) / 100) & 0xff;

/** El original sustituye coordenadas fuera de pantalla por (ancho-1, alto-1). */
export const clampX = (x: number, ctx: BuildContext) => (x < ctx.width ? x : ctx.width - 1);
export const clampY = (y: number, ctx: BuildContext) => (y < ctx.height ? y : ctx.height - 1);

export const right = (c: ControlInstance) => c.x + c.w;
export const bottom = (c: ControlInstance) => c.y + c.h;

/** Cabecera común de los controles de visualización: 0x5A tipo, puntero SP. */
export function showHeader(id: number, p: Props, lenWords: number): Buf {
  const b = new Buf(32);
  b.u16(0, id);
  b.u16(2, vp(p, 'sp', 0xffff));
  b.u8(4, 0).u8(5, lenWords);
  return b;
}

export function defaults(fields: FieldDef[]): Props {
  const out: Props = {};
  for (const f of fields) out[f.key] = f.default;
  return out;
}

// ---------- campos comunes ----------

export const F = {
  vp: (def = '5000', label = 'Dirección VP'): FieldDef => ({
    key: 'vp',
    label,
    type: 'vp',
    default: def,
    group: 'Variable',
    help: 'Dirección de la variable en la memoria de la pantalla (hexadecimal).',
  }),
  sp: (): FieldDef => ({
    key: 'sp',
    label: 'Puntero de descripción (SP)',
    type: 'vp',
    default: 'FFFF',
    group: 'Avanzado',
    help: 'FFFF = sin puntero. Si se define, el MCU puede cambiar la configuración del control en tiempo de ejecución.',
  }),
  popMenu: (): FieldDef => ({
    key: 'onPopMenu',
    label: 'Mostrar sobre menú emergente',
    type: 'bool',
    default: false,
    group: 'Avanzado',
  }),
  color: (key = 'color', label = 'Color', def = 0xffff, group = 'Apariencia'): FieldDef => ({
    key,
    label,
    type: 'color',
    default: def,
    group,
  }),
  font: (key = 'fontId', label = 'Fuente (ID)', def = 0): FieldDef => ({
    key,
    label,
    type: 'font',
    default: def,
    min: 0,
    max: 255,
    group: 'Texto',
  }),
  iconLib: (def = 48): FieldDef => ({
    key: 'iconLib',
    label: 'Biblioteca de iconos (ICL)',
    type: 'iconLib',
    default: def,
    min: 0,
    max: 255,
    group: 'Iconos',
  }),
  int: (key: string, label: string, def: number, min: number, max: number, group?: string, help?: string): FieldDef => ({
    key,
    label,
    type: 'int',
    default: def,
    min,
    max,
    group,
    help,
  }),
  enumf: (key: string, label: string, def: number, options: FieldOption[], group?: string, help?: string): FieldDef => ({
    key,
    label,
    type: 'enum',
    default: def,
    options,
    group,
    help,
  }),
  bool: (key: string, label: string, def = false, group?: string, help?: string): FieldDef => ({
    key,
    label,
    type: 'bool',
    default: def,
    group,
    help,
  }),
  percent: (key: string, label: string, def = 100, group = 'Iconos'): FieldDef => ({
    key,
    label,
    type: 'percent',
    default: def,
    min: 0,
    max: 100,
    group,
  }),
};

export const ICON_DISPLAY_MODE: FieldOption[] = [
  { value: 0, label: 'Transparente (filtrar fondo)' },
  { value: 1, label: 'Mostrar fondo del icono' },
];

export const BACK_MODE: FieldOption[] = [
  { value: 0, label: 'Sin fondo' },
  { value: 1, label: 'Fondo de la página' },
  { value: 2, label: 'Fondo de imagen' },
];

export const VAR_TYPES: FieldOption[] = [
  { value: 0, label: 'Entero 16 bits (int)' },
  { value: 1, label: 'Entero 32 bits (long)' },
  { value: 2, label: 'Byte alto VP (uchar)' },
  { value: 3, label: 'Byte bajo VP (uchar)' },
  { value: 4, label: 'Entero 64 bits' },
  { value: 5, label: 'Sin signo 16 bits' },
  { value: 6, label: 'Sin signo 32 bits' },
  { value: 7, label: 'Flotante 32 bits' },
  { value: 8, label: 'Doble 64 bits' },
];

/** Palabras que ocupa cada tipo de variable numérica. */
export const VAR_TYPE_WORDS = [1, 2, 1, 1, 4, 1, 2, 2, 4];

export const ENCODINGS: FieldOption[] = [
  { value: 0, label: 'ASCII (8 bits)' },
  { value: 1, label: 'GB2312' },
  { value: 2, label: 'GBK' },
  { value: 3, label: 'BIG5' },
  { value: 4, label: 'Shift-JIS' },
  { value: 5, label: 'UNICODE (UTF-16)' },
];

export const ALIGN3: FieldOption[] = [
  { value: 0, label: 'Izquierda' },
  { value: 1, label: 'Derecha' },
  { value: 2, label: 'Centro' },
];
