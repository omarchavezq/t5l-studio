import { DISPLAY_CONTROLS } from './display';
import { TOUCH_CONTROLS } from './touch';
import { rawDisplay, rawTouch } from './raw';
import { rotaryKnob } from './knob';
import { defaults, type ControlDef } from './schema';
import type { ControlInstance } from '../types';

export * from './schema';

export const ALL_CONTROLS: ControlDef[] = [...TOUCH_CONTROLS, ...DISPLAY_CONTROLS, rawDisplay, rawTouch, rotaryKnob];

const byType = new Map(ALL_CONTROLS.map((d) => [d.type, d]));

export function getDef(type: string): ControlDef {
  const d = byType.get(type);
  if (!d) throw new Error(`Tipo de control desconocido: ${type}`);
  return d;
}

export function hasDef(type: string): boolean {
  return byType.has(type);
}

/** Categorías en el orden en que aparecen en la caja de herramientas. */
export const CATEGORIES = [
  'Botones',
  'Entradas',
  'Navegación',
  'Datos y texto',
  'Iconos',
  'Gráficos',
  'Multimedia',
  'Sistema',
];

export function toolbox(): { category: string; items: ControlDef[] }[] {
  return CATEGORIES.map((category) => ({
    category,
    items: ALL_CONTROLS.filter((d) => d.category === category && !d.hidden),
  })).filter((g) => g.items.length > 0);
}

let counter = 0;
export function newId(): string {
  counter++;
  return `c${Date.now().toString(36)}${counter.toString(36)}`;
}

export function createControl(type: string, x: number, y: number, name?: string): ControlInstance {
  const def = getDef(type);
  const c: ControlInstance = {
    id: newId(),
    type,
    name: name ?? def.label,
    x: Math.round(x),
    y: Math.round(y),
    w: def.defaultSize.w,
    h: def.defaultSize.h,
    props: defaults(def.fields),
  };
  // Variables con fuente 0#: el recuadro nace del tamaño del texto (celdas de ancho × 2·ancho).
  if (['dataVar', 'rtc', 'hexVar'].includes(type)) {
    const text = def.preview?.(c).text ?? '';
    const cw = Math.max(1, Number(c.props.fontSize) || 16);
    if (text) Object.assign(c, { w: [...text].length * cw, h: cw * 2 });
  }
  return c;
}
