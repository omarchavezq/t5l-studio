// Perilla giratoria física (pantallas con encoder, «旋钮屏» en V7.651).
// Portado de BizDraw.ConfigShow.RotaryKnob.GetRotaryKnobData y de la generación de 120.lib
// en TDocumentSpace. No va en 13/14: se guarda en 120.lib.

import { Buf, parseHex } from '../bytes';
import type { ControlInstance, Project } from '../types';
import { ControlDef, F, FieldOption, bool, num } from './schema';

const DATA_TYPES: FieldOption[] = [
  { value: 0, label: 'Entero 16 bits' },
  { value: 1, label: 'Entero 32 bits' },
  { value: 2, label: 'Byte alto VP' },
  { value: 3, label: 'Byte bajo VP' },
  { value: 4, label: 'Sin signo 16 bits' },
  { value: 5, label: 'Sin signo 32 bits' },
  { value: 6, label: 'Flotante' },
];

const pressOnly = (p: Record<string, unknown>) => p.action === 0;
const turnOnly = (p: Record<string, unknown>) => p.action === 1;

export const rotaryKnob: ControlDef = {
  type: 'rotaryKnob',
  kind: 'knob',
  label: 'Perilla giratoria (encoder)',
  legacy: 'RotaryKnob',
  category: 'Sistema',
  icon: 'Disc3',
  description: 'Selección y acción con la perilla física de las pantallas con encoder. Se guarda en 120.lib.',
  defaultSize: { w: 120, h: 60 },
  fields: [
    // --- efecto de selección
    F.enumf('effectMode', 'Efecto de selección', 0, [
      { value: 0, label: 'Por VP' },
      { value: 1, label: 'Por SP (cambia el control)' },
    ], 'Selección'),
    { key: 'effectVp', label: 'VP del efecto', type: 'vp', default: '0000', group: 'Selección', showIf: (p) => p.effectMode === 0 },
    { key: 'sp', label: 'SP del control', type: 'vp', default: '0000', group: 'Selección', showIf: (p) => p.effectMode === 1 },
    { ...F.enumf('controlType', 'Tipo del control', 0, [
      { value: 0, label: 'Icono de variable' },
      { value: 1, label: 'Número con iconos' },
      { value: 2, label: 'Variable numérica' },
    ], 'Selección'), showIf: (p) => p.effectMode === 1 },
    { ...F.int('minIcon', 'Icono mínimo', 0, 0, 65535, 'Selección'), showIf: (p) => p.effectMode === 1 && p.controlType === 0 },
    { ...F.int('maxIcon', 'Icono máximo', 1, 0, 65535, 'Selección'), showIf: (p) => p.effectMode === 1 && p.controlType === 0 },
    { ...F.int('startId', 'Icono inicial', 0, 0, 65535, 'Selección'), showIf: (p) => p.effectMode === 1 && p.controlType === 1 },
    { ...F.color('selColor', 'Color seleccionado', 0xf800, 'Selección'), showIf: (p) => p.effectMode === 1 && p.controlType === 2 },
    // --- acción
    F.enumf('action', 'Acción', 0, [
      { value: 0, label: 'Al pulsar la perilla' },
      { value: 1, label: 'Al girar la perilla' },
    ], 'Acción'),
    { ...F.enumf('pressFunction', 'Función al pulsar', 0, [
      { value: 0, label: 'Cambiar de página' },
      { value: 1, label: 'Sumar' },
      { value: 2, label: 'Restar' },
    ], 'Acción'), showIf: pressOnly },
    { key: 'pressPage', label: 'Página', type: 'page', default: -1, group: 'Acción', showIf: (p) => pressOnly(p) && p.pressFunction === 0 },
    { key: 'pressVp', label: 'VP asociada', type: 'vp', default: '5000', group: 'Acción', showIf: (p) => pressOnly(p) && p.pressFunction !== 0 },
    { ...F.enumf('pressDataType', 'Tipo de dato', 0, DATA_TYPES, 'Acción'), showIf: (p) => pressOnly(p) && p.pressFunction !== 0 },
    { ...F.int('pressStep', 'Paso', 1, 0, 2147483647, 'Acción'), showIf: (p) => pressOnly(p) && p.pressFunction !== 0 },
    { ...F.int('pressCount', 'Pulsaciones', 0, 0, 2147483647, 'Acción'), showIf: (p) => pressOnly(p) && p.pressFunction !== 0 },
    { ...F.int('pressMax', 'Máximo', 100, -2147483648, 2147483647, 'Acción'), showIf: (p) => pressOnly(p) && p.pressFunction !== 0 },
    { ...F.int('pressMin', 'Mínimo', 0, -2147483648, 2147483647, 'Acción'), showIf: (p) => pressOnly(p) && p.pressFunction !== 0 },
    { ...F.bool('pressAutoUpload', 'Subir la VP automáticamente', false, 'Acción'), showIf: (p) => pressOnly(p) && p.pressFunction !== 0 },
    { ...F.bool('pressLong', 'Repetir al mantener pulsada', false, 'Acción'), showIf: (p) => pressOnly(p) && p.pressFunction !== 0 },
    { ...F.bool('pressWrap', 'Dar la vuelta en los límites', false, 'Acción'), showIf: (p) => pressOnly(p) && p.pressFunction !== 0 },
    { ...F.enumf('turnFunction', 'Función al girar', 0, [
      { value: 0, label: 'Cambiar de página' },
      { value: 1, label: 'Ajustar un dato' },
    ], 'Acción'), showIf: turnOnly },
    { ...F.enumf('turnMode', 'Sentido', 2, [
      { value: 0, label: 'Izquierda' },
      { value: 1, label: 'Derecha' },
      { value: 2, label: 'Ambos' },
    ], 'Acción'), showIf: turnOnly },
    { key: 'leftPage', label: 'Página al girar a la izquierda', type: 'page', default: -1, group: 'Acción', showIf: (p) => turnOnly(p) && p.turnFunction === 0 },
    { key: 'rightPage', label: 'Página al girar a la derecha', type: 'page', default: -1, group: 'Acción', showIf: (p) => turnOnly(p) && p.turnFunction === 0 },
    { key: 'turnVp', label: 'VP asociada', type: 'vp', default: '5000', group: 'Acción', showIf: (p) => turnOnly(p) && p.turnFunction === 1 },
    { ...F.enumf('turnDataType', 'Tipo de dato', 0, DATA_TYPES, 'Acción'), showIf: (p) => turnOnly(p) && p.turnFunction === 1 },
    { ...F.int('rightStep', 'Paso a la derecha', 1, -2147483648, 2147483647, 'Acción'), showIf: (p) => turnOnly(p) && p.turnFunction === 1 },
    { ...F.int('leftStep', 'Paso a la izquierda', 1, -2147483648, 2147483647, 'Acción'), showIf: (p) => turnOnly(p) && p.turnFunction === 1 },
    { ...F.int('turnMax', 'Máximo', 100, -2147483648, 2147483647, 'Acción'), showIf: (p) => turnOnly(p) && p.turnFunction === 1 },
    { ...F.int('turnMin', 'Mínimo', 0, -2147483648, 2147483647, 'Acción'), showIf: (p) => turnOnly(p) && p.turnFunction === 1 },
    { ...F.bool('turnAutoUpload', 'Subir la VP automáticamente', false, 'Acción'), showIf: (p) => turnOnly(p) && p.turnFunction === 1 },
    { ...F.bool('turnWrap', 'Dar la vuelta en los límites', false, 'Acción'), showIf: (p) => turnOnly(p) && p.turnFunction === 1 },
    F.bool('pageByValue', 'Cambiar de página según el valor de la VP', false, 'Acción'),
    { ...F.int('pageStartId', 'Página inicial', 0, 0, 65535, 'Acción'), showIf: (p) => !!p.pageByValue },
  ],
  encode(c: ControlInstance) {
    const p = c.props;
    const b = new Buf(32);
    let o = 0;
    const u8 = (v: number) => b.u8(o++, v);
    const u16 = (v: number) => (b.u16(o, v & 0xffff), (o += 2));
    const u32 = (v: number) => (b.u32(o, v >>> 0), (o += 4));
    // Efecto (8 bytes)
    if (num(p, 'effectMode') === 0) u16(parseHex(p.effectVp, 0));
    else {
      u16(parseHex(p.sp, 0));
      const t = num(p, 'controlType');
      u8(t | 0x80);
      if (t === 0) (u16(num(p, 'minIcon')), u16(num(p, 'maxIcon')));
      else if (t === 1) u16(num(p, 'startId'));
      else u16(num(p, 'selColor'));
    }
    o = 8;
    if (num(p, 'action') === 0) {
      const f = num(p, 'pressFunction');
      if (f === 0) (u32(0), u16(Math.max(0, num(p, 'pressPage', 0))));
      else {
        u16(parseHex(p.pressVp, 0));
        u8((bool(p, 'pressAutoUpload') ? 0x40 : 0) | (bool(p, 'pressLong') ? 0x20 : 0) | (bool(p, 'pressWrap') ? 0x10 : 0) | f);
        u8(num(p, 'pressDataType'));
        u32(num(p, 'pressStep'));
        u32(num(p, 'pressCount'));
        u32(num(p, 'pressMax'));
        u32(num(p, 'pressMin'));
        if (bool(p, 'pageByValue')) u8(1);
      }
    } else if (num(p, 'turnFunction') === 0) {
      const mode = num(p, 'turnMode');
      const left = Math.max(0, num(p, 'leftPage', 0));
      const right = Math.max(0, num(p, 'rightPage', 0));
      u16(0);
      u8(0x80 | (mode === 1 ? 0x10 : mode === 2 ? 0x20 : 0));
      u8(0);
      if (mode === 0) u16(right);
      else if (mode === 1) (u32(0), u16(left));
      else (u16(right), u16(0), u16(left), u16(0));
    } else {
      u16(parseHex(p.turnVp, 0));
      u8(0x80 | (bool(p, 'turnAutoUpload') ? 0x40 : 0) | (num(p, 'turnMode') << 4) | (bool(p, 'turnWrap') ? 8 : 0) | (bool(p, 'pageByValue') ? 4 : 0) | 1);
      u8(num(p, 'turnDataType'));
      u32(num(p, 'rightStep'));
      u32(num(p, 'leftStep'));
      u32(num(p, 'turnMax'));
      u32(num(p, 'turnMin'));
      if (bool(p, 'pageByValue')) u16(num(p, 'pageStartId'));
    }
    return b.b;
  },
  preview: () => ({ style: 'clock' }),
};

/** Modelos de pantalla con perilla de V7.651 (FrmRotaryKnobSetting) y sus puertos [reloj, dato, pulsador]. */
export const KNOB_MODELS: { label: string; ports: [number, number][] }[] = [
  { label: 'DMG24240C013_13WN', ports: [[1, 0], [1, 1], [1, 2]] },
  { label: 'DMG48480C021_12WTC', ports: [[3, 0], [3, 1], [3, 2]] },
  { label: 'DMG48480C021_13WTC', ports: [[3, 0], [3, 1], [3, 2]] },
  { label: 'DMG24240C015_13WN', ports: [[1, 0], [1, 1], [1, 2]] },
  { label: 'DMG40400C016_13WNZ154', ports: [[3, 0], [3, 1], [2, 0]] },
];
export const KNOB_RTC = ['Ninguno', '8130', '2058'];

/** Genera 120.lib si el proyecto tiene perillas; null si no hay ninguna. */
export function buildKnobLib(project: Project): Uint8Array | null {
  const pages = [...project.pages].sort((a, b) => a.id - b.id);
  if (!pages.some((p) => p.controls.some((c) => c.type === 'rotaryKnob'))) return null;
  const k = project.knob ?? { model: 0, rtc: 0 };
  const model = KNOB_MODELS[k.model] ?? KNOB_MODELS[0];
  const head = new Uint8Array(96);
  head.set([0x5a, 0xa5, 0x55, 0xaa, k.model === 0 ? 2 : 1, k.rtc]);
  model.ports.forEach(([port, pin], i) => (head[6 + i] = (port << 4) + pin));
  head[9] = (pages.length >> 8) & 0xff;
  head[10] = pages.length & 0xff;
  const paras: number[] = [];
  const data: Uint8Array[] = [];
  let start = pages.length * 8 + 96;
  for (const page of pages) {
    const knobs = page.controls.filter((c) => c.type === 'rotaryKnob').reverse();
    paras.push(page.id >> 8, page.id & 0xff, knobs.length, 0, (start >>> 24) & 0xff, (start >>> 16) & 0xff, (start >>> 8) & 0xff, start & 0xff);
    for (const c of knobs) data.push(rotaryKnob.encode(c, { width: 0, height: 0, pageId: page.id, keyingIndex: { n: 0 } }));
    start += knobs.length * 32;
  }
  const out = new Uint8Array(96 + paras.length + data.length * 32);
  out.set(head, 0);
  out.set(paras, 96);
  data.forEach((d, i) => out.set(d, 96 + paras.length + i * 32));
  return out;
}
