// Controles de visualización (14ShowFile.bin). Cada bloque ocupa 32 bytes.
// Portados 1:1 desde BizDraw.ConfigShow.* de DGUS V7.651.

import type { ControlInstance, Props } from '../types';
import {
  ALIGN3,
  BACK_MODE,
  ControlDef,
  ENCODINGS,
  F,
  FieldDef,
  ICON_DISPLAY_MODE,
  InitEntry,
  VAR_TYPES,
  VAR_TYPE_WORDS,
  bool,
  bottom,
  clampX,
  clampY,
  num,
  pct255,
  right,
  showHeader,
  str,
  vp,
} from './schema';
import { encodeInitValue, encodeText } from './init';

const words1 = () => 1;

// ---------------------------------------------------------------- Iconos

const iconCommon: FieldDef[] = [
  F.iconLib(),
  F.enumf('mode', 'Modo de visualización', 0, ICON_DISPLAY_MODE, 'Iconos'),
  F.enumf('backMode', 'Fondo', 0, BACK_MODE, 'Iconos'),
  F.percent('iconLight', 'Brillo del icono'),
  F.percent('backLight', 'Brillo del fondo'),
  F.int('filter', 'Filtro de color de fondo', 0, 0, 63, 'Iconos', '0 = valor por defecto (0x10).'),
];

const backModeByte = (p: Props) => {
  const m = num(p, 'backMode');
  return m > 0 ? m + 1 : 0;
};

const iconVar: ControlDef = {
  type: 'iconVar',
  kind: 'display',
  label: 'Icono de variable',
  legacy: 'IconShow',
  category: 'Iconos',
  icon: 'Image',
  description: 'Muestra un icono de la biblioteca según el valor de la variable.',
  defaultSize: { w: 64, h: 64 },
  fields: [
    F.vp(),
    F.int('vMin', 'Valor mínimo', 0, 0, 65535, 'Rango'),
    F.int('vMax', 'Valor máximo', 1, 0, 65535, 'Rango'),
    F.int('iconMin', 'Icono para el mínimo', 0, 0, 65535, 'Rango'),
    F.int('iconMax', 'Icono para el máximo', 1, 0, 65535, 'Rango'),
    ...iconCommon,
    F.bool('groupEnable', 'Grupo de iconos', false, 'Avanzado'),
    F.int('groupId', 'ID de grupo', 0, 0, 255, 'Avanzado'),
    F.int('groupSpace', 'Espaciado de grupo', 0, 0, 65535, 'Avanzado'),
    { key: 'init', label: 'Valor inicial', type: 'text', default: '', group: 'Variable' },
    F.popMenu(),
    F.sp(),
  ],
  vpFields: [{ key: 'vp', words: words1 }],
  encode(c) {
    const p = c.props;
    const b = showHeader(bool(p, 'onPopMenu') ? 0x5f00 : 0x5a00, p, 10);
    let vMin = num(p, 'vMin');
    let vMax = num(p, 'vMax');
    if (vMax < vMin) vMax = vMin;
    b.u16(6, vp(p, 'vp')).u16(8, c.x).u16(10, c.y);
    b.u16(12, vMin).u16(14, vMax).u16(16, num(p, 'iconMin')).u16(18, num(p, 'iconMax'));
    b.u8(20, num(p, 'iconLib')).u8(21, num(p, 'mode')).u8(22, backModeByte(p));
    b.u8(23, pct255(num(p, 'iconLight'))).u8(24, pct255(num(p, 'backLight'))).u8(25, num(p, 'filter'));
    b.u8(26, bool(p, 'groupEnable') ? 0x5a : 0);
    return b.b;
  },
  init(c) {
    const p = c.props;
    const e = encodeInitValue(vp(p, 'vp'), 3, str(p, 'init'));
    if (bool(p, 'groupEnable')) {
      const g = num(p, 'groupSpace');
      const bytes = new Uint8Array(4);
      bytes.set(e?.bytes.slice(0, 1) ?? [0], 0);
      bytes[1] = num(p, 'groupId') & 0xff;
      bytes[2] = (g >> 8) & 0xff;
      bytes[3] = g & 0xff;
      return [{ vp: vp(p, 'vp'), bytes }];
    }
    return e ? [e] : [];
  },
  preview: (c) => ({ style: 'icon', text: `ICL ${c.props.iconLib} · ${c.props.iconMin}..${c.props.iconMax}` }),
};

const animIcon: ControlDef = {
  type: 'animIcon',
  kind: 'display',
  label: 'Icono animado',
  legacy: 'AnimateShow',
  category: 'Iconos',
  icon: 'Clapperboard',
  description: 'Reproduce una secuencia de iconos mientras la variable tenga el valor de arranque.',
  defaultSize: { w: 64, h: 64 },
  fields: [
    F.vp(),
    F.int('restartMode', 'Modo de reinicio', 0, 0, 65535, 'Animación'),
    F.int('vStop', 'Valor de parada', 0, 0, 65535, 'Animación'),
    F.int('vStart', 'Valor de arranque', 1, 0, 65535, 'Animación'),
    F.int('iconStop', 'Icono en parada', 0, 0, 65535, 'Animación'),
    F.int('iconStart', 'Icono inicial', 1, 0, 65535, 'Animación'),
    F.int('iconEnd', 'Icono final', 5, 0, 65535, 'Animación'),
    F.int('showTime', 'Tiempo por cuadro (×8 ms)', 10, 0, 255, 'Animación'),
    F.enumf('showMode', 'Reproducción', 0, [
      { value: 0, label: 'En bucle' },
      { value: 1, label: 'Una sola vez' },
    ], 'Animación'),
    ...iconCommon,
    F.sp(),
  ],
  vpFields: [{ key: 'vp', words: words1 }],
  encode(c, ctx) {
    const p = c.props;
    const b = showHeader(0x5a01, p, 13);
    b.u16(6, vp(p, 'vp')).u16(8, clampX(c.x, ctx)).u16(10, clampY(c.y, ctx));
    b.u16(12, num(p, 'restartMode')).u16(14, num(p, 'vStop')).u16(16, num(p, 'vStart'));
    b.u16(18, num(p, 'iconStop')).u16(20, num(p, 'iconStart')).u16(22, num(p, 'iconEnd'));
    b.u8(24, num(p, 'iconLib')).u8(25, num(p, 'mode')).u8(26, backModeByte(p));
    b.u8(27, pct255(num(p, 'iconLight'))).u8(28, pct255(num(p, 'backLight')));
    b.u8(29, num(p, 'showTime')).u8(30, num(p, 'showMode')).u8(31, num(p, 'filter'));
    return b.b;
  },
  preview: (c) => ({ style: 'icon', text: `▶ ${c.props.iconStart}..${c.props.iconEnd}` }),
};

const sliderShow: ControlDef = {
  type: 'sliderShow',
  kind: 'display',
  label: 'Indicador deslizante',
  legacy: 'SliderShow',
  category: 'Iconos',
  icon: 'SlidersHorizontal',
  description: 'Mueve un icono a lo largo de un eje según el valor.',
  defaultSize: { w: 240, h: 40 },
  fields: [
    F.vp(),
    F.int('vBegin', 'Valor inicial', 0, 0, 65535, 'Rango'),
    F.int('vEnd', 'Valor final', 100, 0, 65535, 'Rango'),
    F.enumf('dir', 'Orientación', 0, [
      { value: 0, label: 'Horizontal' },
      { value: 1, label: 'Vertical' },
    ], 'Rango'),
    F.int('iconId', 'Icono del cursor', 0, 0, 65535, 'Iconos'),
    F.int('xAdj', 'Ajuste del cursor', 0, 0, 255, 'Iconos'),
    F.iconLib(),
    F.enumf('iconMode', 'Modo de visualización', 0, ICON_DISPLAY_MODE, 'Iconos'),
    F.enumf('vpMode', 'Formato de VP', 0, [
      { value: 0, label: 'Palabra completa' },
      { value: 1, label: 'Byte alto' },
      { value: 2, label: 'Byte bajo' },
    ], 'Variable'),
    F.enumf('backMode', 'Fondo', 0, BACK_MODE, 'Iconos'),
    F.percent('iconLight', 'Brillo del icono'),
    F.percent('backLight', 'Brillo del fondo'),
    F.int('filter', 'Filtro de color de fondo', 0, 0, 63, 'Iconos'),
    F.sp(),
  ],
  vpFields: [{ key: 'vp', words: words1 }],
  encode(c) {
    const p = c.props;
    const b = showHeader(0x5a02, p, 12);
    const vertical = num(p, 'dir') !== 0;
    const xBegin = vertical ? c.y : c.x;
    const xEnd = vertical ? bottom(c) : right(c);
    const y = vertical ? c.x : c.y;
    b.u16(6, vp(p, 'vp')).u16(8, num(p, 'vBegin')).u16(10, num(p, 'vEnd'));
    b.u16(12, xBegin).u16(14, xEnd).u16(16, num(p, 'iconId')).u16(18, y);
    b.u8(20, num(p, 'xAdj')).u8(21, num(p, 'dir')).u8(22, num(p, 'iconLib')).u8(23, num(p, 'iconMode'));
    b.u8(24, num(p, 'vpMode')).u8(25, backModeByte(p));
    b.u8(26, pct255(num(p, 'iconLight'))).u8(27, pct255(num(p, 'backLight'))).u8(28, num(p, 'filter'));
    return b.b;
  },
  preview: () => ({ style: 'slider', value: 0.4 }),
};

const artVar: ControlDef = {
  type: 'artVar',
  kind: 'display',
  label: 'Número con iconos',
  legacy: 'ArtTextShow',
  category: 'Iconos',
  icon: 'Binary',
  description: 'Muestra un número usando iconos como dígitos (variable artística).',
  defaultSize: { w: 160, h: 48 },
  fields: [
    F.vp(),
    F.enumf('varType', 'Tipo de variable', 0, VAR_TYPES.slice(0, 4), 'Variable'),
    F.int('nInt', 'Dígitos enteros', 4, 0, 20, 'Formato'),
    F.int('nDot', 'Decimales', 0, 0, 20, 'Formato'),
    F.enumf('align', 'Alineación', 0, ALIGN3, 'Formato'),
    F.bool('show0', 'Mostrar ceros a la izquierda', false, 'Formato'),
    F.int('icon0', 'Icono del dígito 0', 0, 0, 65535, 'Iconos'),
    F.iconLib(),
    F.enumf('iconMode', 'Modo de visualización', 0, ICON_DISPLAY_MODE, 'Iconos'),
    F.enumf('backMode', 'Fondo', 0, BACK_MODE, 'Iconos'),
    F.percent('iconLight', 'Brillo del icono'),
    F.percent('backLight', 'Brillo del fondo'),
    F.int('filter', 'Filtro de color de fondo', 0, 0, 63, 'Iconos'),
    { key: 'init', label: 'Valor inicial', type: 'text', default: '', group: 'Variable' },
    F.sp(),
  ],
  vpFields: [{ key: 'vp', words: (p) => VAR_TYPE_WORDS[num(p, 'varType')] ?? 1 }],
  encode(c) {
    const p = c.props;
    const b = showHeader(0x5a03, p, 9);
    const align = num(p, 'align');
    const x = align === 1 ? right(c) : align === 2 ? c.x + Math.trunc(c.w / 2) : c.x;
    b.u16(6, vp(p, 'vp')).u16(8, x).u16(10, c.y).u16(12, num(p, 'icon0'));
    b.u8(14, num(p, 'iconLib')).u8(15, num(p, 'iconMode')).u8(16, num(p, 'nInt')).u8(17, num(p, 'nDot'));
    b.u8(18, num(p, 'varType')).u8(19, align | (bool(p, 'show0') ? 0x80 : 0)).u8(20, backModeByte(p));
    b.u8(21, pct255(num(p, 'iconLight'))).u8(22, pct255(num(p, 'backLight'))).u8(23, num(p, 'filter'));
    return b.b;
  },
  init: (c) => initNumeric(c),
  preview: (c) => ({ style: 'icon', text: sampleNumber(c.props) }),
};

const imageAnim: ControlDef = {
  type: 'imageAnim',
  kind: 'display',
  label: 'Animación de imágenes',
  legacy: 'ImageAnimateShow',
  category: 'Iconos',
  icon: 'Film',
  description: 'Recorre automáticamente una secuencia de imágenes completas (páginas o ICL).',
  defaultSize: { w: 200, h: 120 },
  fields: [
    F.int('picBegin', 'Imagen inicial', 0, 0, 65535, 'Animación'),
    F.int('picEnd', 'Imagen final', 5, 0, 65535, 'Animación'),
    F.int('frameTime', 'Tiempo por cuadro (×8 ms)', 10, 0, 255, 'Animación'),
    F.int('iclLib', 'Biblioteca ICL (0 = páginas)', 0, 0, 255, 'Animación'),
    F.int('picEndExp', 'Imagen final extendida', 0, 0, 65535, 'Avanzado'),
    F.sp(),
  ],
  encode(c) {
    const p = c.props;
    const b = showHeader(0x5a04, p, 5);
    b.u16(6, 0).u16(8, num(p, 'picBegin')).u16(10, num(p, 'picEnd'));
    b.u8(12, num(p, 'frameTime')).u8(13, num(p, 'iclLib')).u16(14, num(p, 'picEndExp'));
    return b.b;
  },
  preview: (c) => ({ style: 'box', text: `Imágenes ${c.props.picBegin}→${c.props.picEnd}` }),
};

const iconRotate: ControlDef = {
  type: 'iconRotate',
  kind: 'display',
  label: 'Icono giratorio (aguja)',
  legacy: 'ICONRotate',
  category: 'Iconos',
  icon: 'Gauge',
  description: 'Gira un icono alrededor de un centro según el valor (aguja de reloj o manómetro).',
  defaultSize: { w: 160, h: 160 },
  fields: [
    F.vp(),
    F.enumf('vpMode', 'Formato de VP', 0, [
      { value: 0, label: 'Entero 16 bits' },
      { value: 1, label: 'Byte alto' },
      { value: 2, label: 'Byte bajo' },
    ], 'Variable'),
    F.int('iconId', 'Icono de la aguja', 0, 0, 65535, 'Iconos'),
    F.int('iconXc', 'Centro del icono X', 0, 0, 65535, 'Iconos', 'Punto de giro dentro del icono.'),
    F.int('iconYc', 'Centro del icono Y', 0, 0, 65535, 'Iconos'),
    F.int('vBegin', 'Valor inicial', 0, 0, 65535, 'Rango'),
    F.int('vEnd', 'Valor final', 100, 0, 65535, 'Rango'),
    F.int('alBegin', 'Ángulo inicial (×0.5°)', 0, 0, 720, 'Rango'),
    F.int('alEnd', 'Ángulo final (×0.5°)', 540, 0, 720, 'Rango'),
    F.iconLib(),
    F.enumf('mode', 'Modo de visualización', 0, ICON_DISPLAY_MODE, 'Iconos'),
    F.int('filter', 'Filtro de color de fondo', 0, 0, 63, 'Iconos'),
    { key: 'init', label: 'Valor inicial', type: 'text', default: '', group: 'Variable' },
    F.sp(),
  ],
  vpFields: [{ key: 'vp', words: words1 }],
  encode(c) {
    const p = c.props;
    const b = showHeader(0x5a05, p, 12);
    b.u16(6, vp(p, 'vp')).u16(8, num(p, 'iconId')).u16(10, num(p, 'iconXc')).u16(12, num(p, 'iconYc'));
    b.u16(14, c.x).u16(16, c.y).u16(18, num(p, 'vBegin')).u16(20, num(p, 'vEnd'));
    b.u16(22, num(p, 'alBegin')).u16(24, num(p, 'alEnd'));
    b.u8(26, num(p, 'vpMode')).u8(27, num(p, 'iconLib')).u8(28, num(p, 'mode')).u8(29, num(p, 'filter'));
    return b.b;
  },
  init: (c) => {
    const m = num(c.props, 'vpMode');
    const code = m === 1 ? 1 : m === 2 ? 2 : 3;
    const e = encodeInitValue(vp(c.props, 'vp'), code, str(c.props, 'init'));
    return e ? [e] : [];
  },
  preview: () => ({ style: 'clock' }),
};

const bitIcon: ControlDef = {
  type: 'bitIcon',
  kind: 'display',
  label: 'Icono por bit',
  legacy: 'bitIcon',
  category: 'Iconos',
  icon: 'ToggleRight',
  description: 'Muestra iconos distintos según el estado de cada bit de la variable.',
  defaultSize: { w: 64, h: 64 },
  fields: [
    F.vp(),
    { key: 'vpAux', label: 'VP auxiliar', type: 'vp', default: '0000', group: 'Variable', help: 'Usa 2 palabras para la animación.' },
    F.int('bitMask', 'Bits activos (máscara)', 1, 0, 65535, 'Bits'),
    F.enumf('displayMode', 'Modo', 0, [
      { value: 0, label: '0: icono 0 / 1: icono 1' },
      { value: 1, label: '0: icono 0 / 1: animación' },
      { value: 2, label: '0: animación / 1: icono 1' },
      { value: 3, label: 'Ambos animados' },
    ], 'Bits'),
    F.enumf('moveMode', 'Disposición de los bits', 0, [
      { value: 0, label: 'Horizontal' },
      { value: 1, label: 'Vertical' },
      { value: 2, label: 'Superpuestos' },
    ], 'Bits'),
    F.int('disMov', 'Separación entre iconos (px)', 0, 0, 65535, 'Bits'),
    F.enumf('iconMode', 'Modo de visualización', 0, ICON_DISPLAY_MODE, 'Iconos'),
    F.iconLib(),
    F.int('icon0s', 'Bit en 0: icono inicial', 0, 0, 65535, 'Iconos'),
    F.int('icon0e', 'Bit en 0: icono final', 0, 0, 65535, 'Iconos'),
    F.int('icon1s', 'Bit en 1: icono inicial', 1, 0, 65535, 'Iconos'),
    F.int('icon1e', 'Bit en 1: icono final', 1, 0, 65535, 'Iconos'),
    F.int('filter', 'Filtro de color de fondo', 0, 0, 63, 'Iconos'),
    F.sp(),
  ],
  vpFields: [{ key: 'vp', words: words1 }],
  encode(c, ctx) {
    const p = c.props;
    const b = showHeader(0x5a06, p, 13);
    b.u16(6, vp(p, 'vp')).u16(8, vp(p, 'vpAux')).u16(10, num(p, 'bitMask'));
    b.u8(12, num(p, 'displayMode')).u8(13, num(p, 'moveMode')).u8(14, num(p, 'iconMode')).u8(15, num(p, 'iconLib'));
    b.u16(16, num(p, 'icon0s')).u16(18, num(p, 'icon0e')).u16(20, num(p, 'icon1s')).u16(22, num(p, 'icon1e'));
    b.u16(24, clampX(c.x, ctx)).u16(26, clampY(c.y, ctx)).u16(28, num(p, 'disMov')).u8(30, num(p, 'filter'));
    return b.b;
  },
  preview: () => ({ style: 'icon', text: 'bits' }),
};

const iconPageTrans: ControlDef = {
  type: 'iconPan',
  kind: 'display',
  label: 'Desplazamiento de imagen',
  legacy: 'IconPageTrans',
  category: 'Iconos',
  icon: 'Move',
  description: 'Muestra una ventana de un icono grande que se desplaza según la variable.',
  defaultSize: { w: 200, h: 120 },
  fields: [
    F.vp(),
    F.iconLib(),
    F.enumf('mode', 'Modo de visualización', 0, ICON_DISPLAY_MODE, 'Iconos'),
    F.int('filter', 'Filtro de color de fondo', 0, 0, 63, 'Iconos'),
    F.int('moveMode', 'Modo de movimiento', 0, 0, 255, 'Iconos'),
    F.int('iconId', 'Icono', 0, 0, 65535, 'Iconos'),
    F.sp(),
  ],
  vpFields: [{ key: 'vp', words: () => 4 }],
  encode(c) {
    const p = c.props;
    const b = showHeader(0x5a07, p, 9);
    b.u16(6, vp(p, 'vp')).u8(8, num(p, 'iconLib')).u8(9, num(p, 'mode')).u8(10, num(p, 'filter')).u8(11, num(p, 'moveMode'));
    b.u16(12, num(p, 'iconId')).u16(14, c.x).u16(16, c.y).u16(18, right(c)).u16(20, bottom(c));
    return b.b;
  },
  preview: () => ({ style: 'box', text: '⇔ icono' }),
};

const iconOverlay: ControlDef = {
  type: 'iconOverlay',
  kind: 'display',
  label: 'Imagen variable (JPEG)',
  legacy: 'VariableJpeg',
  category: 'Iconos',
  icon: 'Layers',
  description: 'Superpone una imagen JPEG/ICL cargada en la memoria de variables.',
  defaultSize: { w: 160, h: 120 },
  fields: [
    F.vp(),
    F.int('iconLight', 'Brillo (0-255)', 255, 0, 255, 'Imagen'),
    F.enumf('mode', 'Modo de visualización', 0, ICON_DISPLAY_MODE, 'Imagen'),
    F.int('filter', 'Filtro de color de fondo', 0, 0, 63, 'Imagen'),
    F.enumf('jpgFormat', 'Orden de los datos JPEG', 0, [
      { value: 0, label: 'Secuencial' },
      { value: 1, label: 'Inverso (cámara FSK)' },
    ], 'Imagen'),
    F.int('vpAddr', 'Página alta de VP (0–15)', 0, 0, 15, 'Avanzado'),
    F.sp(),
  ],
  vpFields: [{ key: 'vp', words: (p) => Math.max(1, Number(p.fskWords) || 1) }],
  encode(c) {
    const p = c.props;
    const b = showHeader(0x5a08, p, 7);
    b.u16(6, vp(p, 'vp')).u16(8, c.x).u16(10, c.y).u16(12, c.w).u16(14, c.h);
    b.u8(16, num(p, 'iconLight')).u8(17, num(p, 'mode')).u8(18, num(p, 'filter'));
    b.u8(19, (num(p, 'jpgFormat') << 7) | num(p, 'vpAddr'));
    return b.b;
  },
  preview: () => ({ style: 'box', text: 'JPEG' }),
};

const batchIcon: ControlDef = {
  type: 'batchIcon',
  kind: 'display',
  label: 'Iconos en lote',
  legacy: 'BatchIconShow',
  category: 'Iconos',
  icon: 'LayoutGrid',
  description: 'Dibuja muchos iconos cuyas posiciones y números están en memoria.',
  defaultSize: { w: 200, h: 120 },
  fields: [
    F.vp('5000', 'VP de control'),
    { key: 'vp1', label: 'VP de posiciones', type: 'vp', default: '5100', group: 'Variable' },
    { key: 'vp2', label: 'VP de iconos', type: 'vp', default: '5200', group: 'Variable' },
    F.int('dataNum', 'Cantidad de iconos', 1, 0, 65535, 'Iconos'),
    F.int('iconSource', 'Origen del icono', 0, 0, 255, 'Iconos'),
    F.iconLib(),
    F.int('iconId', 'Icono base', 0, 0, 65535, 'Iconos'),
    F.sp(),
  ],
  vpFields: [{ key: 'vp', words: () => 1 }],
  encode(c) {
    const p = c.props;
    const b = showHeader(0x5a09, p, 6);
    b.u16(6, vp(p, 'vp')).u16(8, vp(p, 'vp1')).u16(10, vp(p, 'vp2')).u16(12, num(p, 'dataNum'));
    b.u8(14, num(p, 'iconSource')).u8(15, num(p, 'iconLib')).u16(16, num(p, 'iconId'));
    b.u16(24, c.x).u16(26, c.y).u16(28, right(c)).u16(30, bottom(c));
    return b.b;
  },
  preview: () => ({ style: 'box', text: 'Iconos en lote' }),
};

// ---------------------------------------------------------------- Datos y texto

const dataVar: ControlDef = {
  type: 'dataVar',
  kind: 'display',
  label: 'Variable numérica',
  legacy: 'DataTextShow',
  category: 'Datos y texto',
  icon: 'Hash',
  description: 'Muestra el valor numérico de una variable con formato y unidades.',
  defaultSize: { w: 120, h: 32 },
  fields: [
    F.vp(),
    F.enumf('varType', 'Tipo de variable', 0, VAR_TYPES, 'Variable'),
    { key: 'init', label: 'Valor inicial', type: 'text', default: '', group: 'Variable' },
    F.int('nInt', 'Dígitos enteros', 3, 0, 20, 'Formato'),
    F.int('nDot', 'Decimales', 0, 0, 20, 'Formato'),
    F.enumf('align', 'Alineación', 0, ALIGN3, 'Formato'),
    F.bool('zeroDisplay', 'Rellenar con ceros', false, 'Formato'),
    F.bool('modify', 'Signo / modo alterno', false, 'Formato'),
    { key: 'unit', label: 'Unidad (texto ASCII)', type: 'text', default: '', group: 'Formato', help: 'Hasta 11 caracteres.' },
    F.int('unitLen', 'Longitud de unidad (-1 = automática)', -1, -1, 11, 'Avanzado', 'DGUS 7.6 puede guardar la unidad con longitud 0 (no se muestra).'),
    F.color('color', 'Color del texto', 0xffff),
    F.font('fontId', 'Fuente (ID)', 0),
    F.int('fontSize', 'Ancho de carácter (px, alto = 2×)', 16, 1, 255, 'Texto', 'Con la librería 0# (0_DWIN_ASC.HZK) es el ancho de cada carácter; el alto es el doble.'),
    F.popMenu(),
    F.sp(),
  ],
  vpFields: [{ key: 'vp', words: (p) => VAR_TYPE_WORDS[num(p, 'varType')] ?? 1 }],
  encode(c, ctx) {
    const p = c.props;
    const b = showHeader(bool(p, 'onPopMenu') ? 0x5f10 : 0x5a10, p, 13);
    const unit = str(p, 'unit');
    b.u16(6, vp(p, 'vp')).u16(8, clampX(c.x, ctx)).u16(10, clampY(c.y, ctx));
    b.u16(12, num(p, 'color')).u8(14, num(p, 'fontId')).u8(15, num(p, 'fontSize'));
    b.u8(16, (((num(p, 'modify') << 7) & 0x80) + ((num(p, 'zeroDisplay') << 6) & 0x40) + num(p, 'align')) & 0xff);
    b.u8(17, num(p, 'nInt')).u8(18, num(p, 'nDot')).u8(19, num(p, 'varType')).u8(20, num(p, 'unitLen', -1) >= 0 ? num(p, 'unitLen') : unit.length);
    b.ascii(21, unit, 31);
    return b.b;
  },
  init: (c) => initNumeric(c),
  preview: (c) => ({
    text: sampleNumber(c.props) + str(c.props, 'unit'),
    color: undefined,
    align: (['left', 'right', 'center'] as const)[num(c.props, 'align')] ?? 'left',
    fontPx: num(c.props, 'fontSize', 16) * 2,
  }),
};

const text: ControlDef = {
  type: 'text',
  kind: 'display',
  label: 'Texto',
  legacy: 'TextShow',
  category: 'Datos y texto',
  icon: 'Type',
  description: 'Muestra una cadena de texto guardada en variables (ASCII, GBK, Unicode…).',
  defaultSize: { w: 200, h: 32 },
  fields: [
    F.vp(),
    F.int('textLength', 'Longitud máxima (bytes)', 20, 1, 65535, 'Variable'),
    { key: 'init', label: 'Texto inicial', type: 'text', default: '', group: 'Variable' },
    F.enumf('encoding', 'Codificación', 0, ENCODINGS, 'Texto'),
    F.color('color', 'Color del texto', 0xffff),
    F.font('font0', 'Fuente ASCII (ID)', 0),
    F.font('font1', 'Fuente ancha (ID)', 0),
    F.int('fontX', 'Ancho de carácter (px)', 12, 1, 255, 'Texto'),
    F.int('fontY', 'Alto de carácter (px)', 24, 1, 255, 'Texto'),
    F.enumf('align', 'Alineación horizontal', 0, ALIGN3, 'Texto'),
    F.enumf('vAlign', 'Alineación vertical', 0, [
      { value: 0, label: 'Arriba' },
      { value: 1, label: 'Centro' },
    ], 'Texto'),
    F.bool('adjust', 'Espaciado automático', false, 'Texto'),
    F.int('horDis', 'Espacio entre caracteres', 0, 0, 255, 'Texto'),
    F.int('verDis', 'Espacio entre líneas', 0, 0, 255, 'Texto'),
    F.popMenu(),
    F.sp(),
  ],
  vpFields: [{ key: 'vp', words: (p) => Math.ceil(num(p, 'textLength', 20) / 2) }],
  encode(c, ctx) {
    const p = c.props;
    const b = showHeader(bool(p, 'onPopMenu') ? 0x5f11 : 0x5a11, p, 13);
    b.u16(6, vp(p, 'vp')).u16(8, c.x).u16(10, c.y).u16(12, num(p, 'color'));
    b.u16(14, clampX(c.x, ctx)).u16(16, clampY(c.y, ctx)).u16(18, clampX(right(c), ctx)).u16(20, clampY(bottom(c), ctx));
    b.u16(22, num(p, 'textLength')).u8(24, num(p, 'font0')).u8(25, num(p, 'font1'));
    b.u8(26, num(p, 'fontX')).u8(27, num(p, 'fontY'));
    let m = (num(p, 'encoding') + (num(p, 'align') << 5) + (num(p, 'vAlign') << 4)) & 0xff;
    if (bool(p, 'adjust')) m |= 0x80;
    b.u8(28, m).u8(29, num(p, 'horDis')).u8(30, num(p, 'verDis'));
    return b.b;
  },
  init: (c) => initText(c, num(c.props, 'encoding')),
  preview: (c) => ({
    text: str(c.props, 'init') || 'Texto',
    fontPx: num(c.props, 'fontY', 24),
    align: (['left', 'right', 'center'] as const)[num(c.props, 'align')] ?? 'left',
  }),
};

const textII: ControlDef = {
  type: 'textII',
  kind: 'display',
  label: 'Texto DGUS II (fuente en grises)',
  legacy: 'TextShowII',
  category: 'Datos y texto',
  icon: 'Baseline',
  description: 'Texto con fuentes escalables (alto en porcentaje).',
  defaultSize: { w: 200, h: 32 },
  fields: [
    F.vp(),
    F.int('textLength', 'Longitud máxima (bytes)', 20, 1, 65535, 'Variable'),
    { key: 'init', label: 'Texto inicial', type: 'text', default: '', group: 'Variable' },
    F.enumf('encoding', 'Codificación', 0, ENCODINGS, 'Texto'),
    F.color('color', 'Color del texto', 0xffff),
    F.int('fontId', 'Fuente (ID, 16 bits)', 0, 0, 65535, 'Texto'),
    F.int('fontHeight', 'Alto de fuente (%)', 100, 0, 793, 'Texto'),
    F.bool('disAdjust', 'Ajuste automático', false, 'Texto'),
    F.int('horDis', 'Espacio entre caracteres', 0, 0, 255, 'Texto'),
    F.int('verDis', 'Espacio entre líneas', 0, 0, 255, 'Texto'),
    F.enumf('align', 'Alineación', 0, ALIGN3, 'Texto'),
    F.sp(),
  ],
  vpFields: [{ key: 'vp', words: (p) => Math.ceil(num(p, 'textLength', 20) / 2) }],
  encode(c, ctx) {
    const p = c.props;
    const b = showHeader(0x5a16, p, 13);
    b.u16(6, vp(p, 'vp')).u16(8, c.x).u16(10, c.y).u16(12, num(p, 'color'));
    b.u16(16, clampX(c.x, ctx)).u16(18, clampY(c.y, ctx)).u16(20, clampX(right(c), ctx)).u16(22, clampY(bottom(c), ctx));
    b.u16(24, num(p, 'textLength')).u16(26, num(p, 'fontId'));
    let h = Math.trunc((num(p, 'fontHeight') * 16) / 100) & 0xff;
    if (h > 127) h = 127;
    b.u8(28, (((num(p, 'disAdjust') << 7) & 0x80) + h) & 0xff);
    b.u8(29, num(p, 'horDis')).u8(30, num(p, 'verDis')).u8(31, num(p, 'align'));
    return b.b;
  },
  init: (c) => initText(c, num(c.props, 'encoding'), true),
  // La altura se obtiene de la biblioteca y del byte de escala en el renderizador binario.
  preview: (c) => ({ text: str(c.props, 'init') || 'Texto' }),
};

const rtc: ControlDef = {
  type: 'rtc',
  kind: 'display',
  label: 'Fecha y hora (texto)',
  legacy: 'RtcTextShow',
  category: 'Datos y texto',
  icon: 'CalendarClock',
  description: 'Muestra la fecha y hora del reloj interno con un formato configurable.',
  defaultSize: { w: 220, h: 32 },
  fields: [
    { key: 'format', label: 'Formato', type: 'text', default: 'Y-M-D H:Q:S', group: 'Formato', help: 'Y año, M mes, D día, W día de la semana, H hora, Q minuto, S segundo. Hasta 16 caracteres.' },
    F.color('color', 'Color del texto', 0xffff),
    F.font('fontId', 'Fuente (ID)', 0),
    F.int('fontSize', 'Ancho de carácter (px, alto = 2×)', 12, 1, 255, 'Texto'),
    F.bool('modify', 'Modo alterno', false, 'Texto'),
    F.sp(),
  ],
  encode(c) {
    const p = c.props;
    const b = showHeader(0x5a12, p, 13);
    b.u16(6, 0).u16(8, c.x).u16(10, c.y).u16(12, num(p, 'color'));
    b.u8(14, ((num(p, 'modify') & 1) << 7) | (num(p, 'fontId') & 0xff)).u8(15, num(p, 'fontSize'));
    b.ascii(16, str(p, 'format'), 31);
    return b.b;
  },
  preview: (c) => ({ text: rtcSample(str(c.props, 'format')), fontPx: num(c.props, 'fontSize', 12) * 2 }),
};

const clock: ControlDef = {
  type: 'clock',
  kind: 'display',
  label: 'Reloj analógico',
  legacy: 'Clock_Dis',
  category: 'Datos y texto',
  icon: 'Clock',
  description: 'Reloj de agujas dibujado con iconos de hora, minuto y segundo.',
  defaultSize: { w: 200, h: 200 },
  fields: [
    F.iconLib(),
    F.int('iconHour', 'Icono de la hora', 0, 0, 65535, 'Hora'),
    F.int('iconHourXc', 'Centro hora X', 0, 0, 65535, 'Hora'),
    F.int('iconHourYc', 'Centro hora Y', 0, 0, 65535, 'Hora'),
    F.int('iconMinute', 'Icono del minuto', 1, 0, 65535, 'Minuto'),
    F.int('iconMinuteXc', 'Centro minuto X', 0, 0, 65535, 'Minuto'),
    F.int('iconMinuteYc', 'Centro minuto Y', 0, 0, 65535, 'Minuto'),
    F.int('iconSecond', 'Icono del segundo', 2, 0, 65535, 'Segundo'),
    F.int('iconSecondXc', 'Centro segundo X', 0, 0, 65535, 'Segundo'),
    F.int('iconSecondYc', 'Centro segundo Y', 0, 0, 65535, 'Segundo'),
    F.sp(),
  ],
  encode(c) {
    const p = c.props;
    const b = showHeader(0x5a12, p, 13);
    b.u16(6, 1).u16(8, c.x).u16(10, c.y);
    b.u16(12, num(p, 'iconHour')).u16(14, num(p, 'iconHourXc')).u16(16, num(p, 'iconHourYc'));
    b.u16(18, num(p, 'iconMinute')).u16(20, num(p, 'iconMinuteXc')).u16(22, num(p, 'iconMinuteYc'));
    b.u16(24, num(p, 'iconSecond')).u16(26, num(p, 'iconSecondXc')).u16(28, num(p, 'iconSecondYc'));
    b.u8(30, num(p, 'iconLib')).u8(31, 0);
    return b.b;
  },
  preview: () => ({ style: 'clock' }),
};

const hexVar: ControlDef = {
  type: 'hexVar',
  kind: 'display',
  label: 'Variable HEX / BCD',
  legacy: 'TimeDisplay',
  category: 'Datos y texto',
  icon: 'Braces',
  description: 'Muestra bytes en hexadecimal intercalando separadores (útil para horas y fechas BCD).',
  defaultSize: { w: 160, h: 32 },
  fields: [
    F.vp(),
    F.int('byteNum', 'Cantidad de bytes', 2, 1, 15, 'Formato'),
    F.bool('bcd', 'Modo BCD', false, 'Formato'),
    { key: 'separators', label: 'Separadores (hex)', type: 'hex', default: '3A3A', group: 'Formato', help: 'Un byte ASCII por separador, p. ej. 3A = ":".' },
    F.color('color', 'Color del texto', 0xffff),
    F.font('fontId', 'Fuente (ID)', 0),
    F.int('fontSize', 'Tamaño de la fuente (px)', 24, 1, 255, 'Texto'),
    F.sp(),
  ],
  vpFields: [{ key: 'vp', words: (p) => Math.ceil(num(p, 'byteNum', 2) / 2) }],
  encode(c) {
    const p = c.props;
    const b = showHeader(0x5a13, p, 13);
    b.u16(6, vp(p, 'vp')).u16(8, c.x).u16(10, c.y).u16(12, num(p, 'color'));
    b.u8(14, (num(p, 'byteNum') & 0xf) + (num(p, 'bcd') << 7)).u8(15, num(p, 'fontId')).u8(16, num(p, 'fontSize'));
    const sep = str(p, 'separators');
    if (sep.replace(/\s/g, '').length > 1) b.hex(17, sep, 31);
    return b.b;
  },
  preview: () => ({ text: '12:34' }),
};

const rollText: ControlDef = {
  type: 'rollText',
  kind: 'display',
  label: 'Texto en movimiento',
  legacy: 'ScrTextShow',
  category: 'Datos y texto',
  icon: 'TextCursorInput',
  description: 'Texto que se desplaza dentro de su área (marquesina).',
  defaultSize: { w: 300, h: 32 },
  fields: [
    F.vp(),
    F.int('textLength', 'Longitud (bytes)', 40, 1, 65535, 'Variable'),
    { key: 'init', label: 'Texto inicial', type: 'text', default: '', group: 'Variable' },
    F.enumf('rollingMode', 'Dirección', 0, [
      { value: 0, label: 'Derecha → izquierda' },
      { value: 1, label: 'Izquierda → derecha' },
    ], 'Movimiento'),
    F.int('rollingDis', 'Paso por cuadro (px)', 1, 0, 255, 'Movimiento'),
    F.int('adjustMode', 'Modo de ajuste', 0, 0, 255, 'Movimiento'),
    F.int('runControl', 'Control de marcha', 0, 0, 255, 'Movimiento'),
    F.int('speed', 'Velocidad', 0, 0, 255, 'Movimiento'),
    F.enumf('encoding', 'Codificación', 0, ENCODINGS, 'Texto'),
    F.color('color', 'Color del texto', 0xffff),
    F.font('font0', 'Fuente ASCII (ID)', 0),
    F.font('font1', 'Fuente ancha (ID)', 0),
    F.int('fontX', 'Ancho de carácter (px)', 12, 1, 255, 'Texto'),
    F.int('fontY', 'Alto de carácter (px)', 24, 1, 255, 'Texto'),
    F.int('horDis', 'Espacio entre caracteres', 0, 0, 255, 'Texto'),
    F.sp(),
  ],
  vpFields: [{ key: 'vp', words: (p) => 3 + Math.ceil(num(p, 'textLength', 40) / 2) }],
  encode(c, ctx) {
    const p = c.props;
    const b = showHeader(0x5a14, p, 12);
    b.u16(6, vp(p, 'vp')).u8(8, num(p, 'rollingMode')).u8(9, num(p, 'rollingDis'));
    b.u8(10, num(p, 'adjustMode')).u8(11, num(p, 'runControl')).u16(12, num(p, 'color'));
    b.u16(14, clampX(c.x, ctx)).u16(16, clampY(c.y, ctx)).u16(18, clampX(right(c), ctx)).u16(20, clampY(bottom(c), ctx));
    b.u8(22, num(p, 'font0')).u8(23, num(p, 'font1')).u8(24, num(p, 'fontX')).u8(25, num(p, 'fontY'));
    b.u8(26, num(p, 'encoding')).u8(27, num(p, 'horDis')).u8(28, num(p, 'speed'));
    return b.b;
  },
  // El texto del texto en movimiento empieza 3 palabras después del VP.
  init: (c) => initText(c, num(c.props, 'encoding'), false, 3),
  preview: (c) => ({ text: '« ' + (str(c.props, 'init') || 'Texto en movimiento'), fontPx: num(c.props, 'fontY', 24) }),
};

const dataWindow: ControlDef = {
  type: 'dataWindow',
  kind: 'display',
  label: 'Ventana de datos (rodillo)',
  legacy: 'Data_Window',
  category: 'Datos y texto',
  icon: 'ListOrdered',
  description: 'Muestra el valor y sus vecinos como un selector de rodillo.',
  defaultSize: { w: 160, h: 120 },
  fields: [
    F.vp(),
    F.int('vMin', 'Valor mínimo', 0, -32768, 65535, 'Rango'),
    F.int('vMax', 'Valor máximo', 100, -32768, 65535, 'Rango'),
    F.int('step', 'Paso', 1, 0, 65535, 'Rango'),
    F.int('nInt', 'Dígitos enteros', 3, 0, 20, 'Formato'),
    F.int('nDot', 'Decimales', 0, 0, 20, 'Formato'),
    F.int('nDigit', 'Cantidad de valores visibles', 3, 0, 255, 'Formato'),
    F.int('displayMode', 'Modo de visualización', 0, 0, 255, 'Formato'),
    F.font('fontId', 'Fuente (ID)', 0),
    F.int('font0X', 'Valor seleccionado: ancho', 12, 0, 255, 'Seleccionado'),
    F.int('font0Y', 'Valor seleccionado: alto', 24, 0, 255, 'Seleccionado'),
    F.color('font0Color', 'Valor seleccionado: color', 0xffff, 'Seleccionado'),
    F.int('font1X', 'Otros valores: ancho', 8, 0, 255, 'Otros'),
    F.int('font1Y', 'Otros valores: alto', 16, 0, 255, 'Otros'),
    F.color('font1Color', 'Otros valores: color', 0x8410, 'Otros'),
    F.sp(),
  ],
  vpFields: [{ key: 'vp', words: words1 }],
  encode(c) {
    const p = c.props;
    // Equivalente a DWINDLL.dll SetData(21, …), verificado con la DLL original.
    const b = showHeader(0x5a15, p, 12);
    const xc = Math.trunc((c.x + right(c)) / 2);
    const yc = Math.trunc((c.y + bottom(c)) / 2);
    const lo = (k: string) => num(p, k) & 0xff;
    b.u16(6, vp(p, 'vp')).u16(8, num(p, 'vMin') & 0xffff).u16(10, num(p, 'vMax') & 0xffff);
    b.u8(12, lo('nInt')).u8(13, lo('nDot')).u8(14, lo('nDigit')).u8(15, lo('displayMode'));
    b.u16(16, xc).u16(18, yc).u16(20, num(p, 'step'));
    b.u8(22, lo('font0X')).u8(23, Math.max(lo('font0Y'), (2 * lo('font0X')) & 0xff)).u16(24, num(p, 'font0Color'));
    b.u8(26, lo('font1X')).u8(27, Math.max(lo('font1Y'), (2 * lo('font1X')) & 0xff)).u16(28, num(p, 'font1Color'));
    b.u8(30, num(p, 'fontId'));
    return b.b;
  },
  preview: () => ({ style: 'table', text: '9\n10\n11' }),
};

const rollerChar: ControlDef = {
  type: 'rollerChar',
  kind: 'display',
  label: 'Selector de rodillo',
  legacy: 'Roller_character',
  category: 'Datos y texto',
  icon: 'ListCollapse',
  description: 'Rodillo de valores o textos con varias líneas visibles y tamaños graduados.',
  defaultSize: { w: 160, h: 160 },
  fields: [
    F.vp(),
    F.enumf('dataType', 'Tipo de dato', 0, [
      { value: 0, label: 'Entero' },
      { value: 15, label: 'Cadena de texto' },
    ], 'Datos'),
    F.int('dataLine', 'Líneas visibles (impar)', 5, 1, 15, 'Datos'),
    F.int('nInt', 'Dígitos enteros', 2, 0, 15, 'Datos'),
    F.int('nDot', 'Decimales', 0, 0, 15, 'Datos'),
    F.int('dataGap', 'Paso entre valores', 1, 0, 65535, 'Datos'),
    F.int('charLen', 'Longitud de texto', 8, 0, 255, 'Datos'),
    { key: 'vpString', label: 'VP de textos', type: 'vp', default: '0000', group: 'Datos' },
    F.int('vMin', 'Valor mínimo', 0, 0, 65535, 'Datos'),
    F.int('vMax', 'Valor máximo', 59, 0, 65535, 'Datos'),
    F.enumf('align', 'Alineación', 0, [
      { value: 0, label: 'Centro' },
      { value: 1, label: 'Izquierda' },
      { value: 2, label: 'Derecha' },
    ], 'Formato'),
    F.int('fontSet0', 'Fuente seleccionada (0-7)', 0, 0, 7, 'Formato'),
    F.bool('displayBk', 'Mostrar fondo', false, 'Formato'),
    F.bool('displayAddMode', 'Modo suma', false, 'Formato'),
    F.bool('display0', 'Rellenar con ceros', false, 'Formato'),
    F.int('speed', 'Velocidad (0-63)', 10, 0, 63, 'Movimiento'),
    F.int('changeSpeed', 'Velocidad de cambio (0-3)', 0, 0, 3, 'Movimiento'),
    F.int('fontId', 'Fuente (ID, 16 bits)', 0, 0, 65535, 'Formato'),
    F.int('lineGap0', 'Separación línea 0', 0, 0, 255, 'Líneas'),
    F.int('lineGap1', 'Separación línea 1', 0, 0, 255, 'Líneas'),
    F.int('lineGap2', 'Separación línea 2', 0, 0, 255, 'Líneas'),
    F.int('lineGap3', 'Separación línea 3', 0, 0, 255, 'Líneas'),
    F.int('dim1', 'Atenuación', 0, 0, 255, 'Líneas'),
    F.int('lineHeight0', 'Alto de la línea central', 32, 0, 255, 'Líneas'),
    F.int('font1', 'Escala línea 1 (0-15)', 0, 0, 15, 'Líneas'),
    F.int('font2', 'Escala línea 2 (0-15)', 0, 0, 15, 'Líneas'),
    F.int('font3', 'Escala línea 3 (0-15)', 0, 0, 15, 'Líneas'),
    F.int('font4', 'Escala línea 4 (0-15)', 0, 0, 15, 'Líneas'),
    F.sp(),
  ],
  vpFields: [{ key: 'vp', words: words1 }],
  encode(c) {
    const p = c.props;
    const b = showHeader(0x5a17, p, 13);
    const dataType = num(p, 'dataType');
    b.u16(6, vp(p, 'vp')).u8(8, (dataType << 4) + Math.trunc((num(p, 'dataLine') - 1) / 2));
    if (dataType === 15) b.u8(9, num(p, 'charLen')).u16(10, vp(p, 'vpString'));
    else b.u8(9, (num(p, 'nInt') << 4) + num(p, 'nDot')).u16(10, num(p, 'dataGap'));
    b.u16(12, num(p, 'vMin')).u16(14, num(p, 'vMax'));
    const align = num(p, 'align');
    b.u8(16, align + ((num(p, 'fontSet0') & 7) << 4) + (num(p, 'displayBk') << 2) + (num(p, 'displayAddMode') << 3) + (num(p, 'display0') << 7));
    b.u8(17, (num(p, 'speed') & 0x3f) + (num(p, 'changeSpeed') << 6)).u16(18, num(p, 'fontId'));
    const w = (right(c) - c.x) & 0xffff;
    const h = (bottom(c) - c.y) & 0xffff;
    let x = c.x;
    const y = (c.y + Math.trunc(h / 2)) & 0xffff;
    if (align === 0) x = (x + Math.trunc(w / 2)) & 0xffff;
    else if (align === 2) x = (x + w) & 0xffff;
    b.u16(20, x).u16(22, y);
    b.u8(24, num(p, 'lineGap0')).u8(25, num(p, 'lineGap1')).u8(26, num(p, 'lineGap2')).u8(27, num(p, 'lineGap3'));
    b.u8(28, num(p, 'dim1')).u8(29, num(p, 'lineHeight0'));
    b.u8(30, (num(p, 'font1') << 4) + num(p, 'font2')).u8(31, (num(p, 'font3') << 4) + num(p, 'font4'));
    return b.b;
  },
  preview: () => ({ style: 'table', text: '08\n09\n10\n11\n12' }),
};

const gtf: ControlDef = {
  type: 'gtf',
  kind: 'display',
  label: 'Texto GTF',
  legacy: 'GTFShow',
  category: 'Datos y texto',
  icon: 'Languages',
  description: 'Dibuja caracteres e iconos de una biblioteca GTF; el texto se lee desde el VP.',
  defaultSize: { w: 240, h: 40 },
  fields: [
    F.vp(),
    F.int('gtfId', 'Archivo GTF (ID)', 0, 0, 65535, 'Texto'),
    F.int('fontId', 'Juego dentro del GTF', 0, 0, 65535, 'Texto'),
    F.int('horDis', 'Espacio horizontal', 0, 0, 255, 'Texto'),
    F.int('verDis', 'Espacio vertical', 0, 0, 255, 'Texto'),
    F.enumf('align', 'Alineación', 0, [
      { value: 0, label: 'Izquierda' },
      { value: 1, label: 'Derecha' },
    ], 'Texto'),
    F.bool('backSet', 'Restaurar fondo', false, 'Avanzado'),
    F.bool('reload', 'Recargar GTF', false, 'Avanzado'),
    F.bool('icoRecover', 'Recuperar icono', false, 'Avanzado'),
    F.sp(),
  ],
  vpFields: [{ key: 'vp', words: words1 }],
  encode(c) {
    const p = c.props;
    const b = showHeader(0x5a18, p, 11);
    const align = num(p, 'align');
    b.u16(6, vp(p, 'vp')).u16(8, num(p, 'gtfId')).u16(10, num(p, 'fontId'));
    b.u16(12, align === 0 ? c.x : right(c)).u16(14, c.y);
    b.u16(16, c.x).u16(18, c.y).u16(20, right(c)).u16(22, bottom(c));
    b.u8(24, num(p, 'horDis')).u8(25, num(p, 'verDis'));
    b.u8(26, (num(p, 'backSet') << 7) + (num(p, 'reload') << 6) + (num(p, 'icoRecover') << 5) + align);
    return b.b;
  },
  preview: () => ({ text: 'GTF' }),
};

const multiLanguage: ControlDef = {
  type: 'multiLanguage',
  kind: 'display',
  label: 'Multilenguaje (icono)',
  legacy: 'MultiLanguage',
  category: 'Datos y texto',
  icon: 'Globe',
  description: 'Icono de variable con grupo de idioma para cambiar textos dibujados como imagen.',
  defaultSize: { w: 160, h: 40 },
  fields: [...iconVar.fields.filter((f) => !['groupEnable', 'groupId', 'groupSpace', 'init'].includes(f.key))],
  vpFields: [{ key: 'vp', words: words1 }],
  encode(c, ctx) {
    const b = iconVar.encode({ ...c, props: { ...c.props, groupEnable: false } }, ctx);
    b[26] = 0x5a;
    b[31] = 1;
    return b;
  },
  preview: () => ({ style: 'icon', text: 'ES / EN' }),
};

// ---------------------------------------------------------------- Gráficos

const curve: ControlDef = {
  type: 'curve',
  kind: 'display',
  label: 'Curva de tendencia',
  legacy: 'ChartShow',
  category: 'Gráficos',
  icon: 'ChartLine',
  description: 'Dibuja una curva desde uno de los 8 canales del buffer de curvas.',
  defaultSize: { w: 300, h: 160 },
  fields: [
    F.int('channel', 'Canal (0-7)', 0, 0, 7, 'Datos'),
    F.int('yCentral', 'Y central (px)', 0, 0, 65535, 'Escala', 'Coordenada Y de la línea central. 0 = centro del área.'),
    F.int('vdCentral', 'Valor central', 0, 0, 65535, 'Escala'),
    F.int('mulY', 'Multiplicador Y (×1/256)', 256, 0, 65535, 'Escala'),
    F.int('disHor', 'Separación horizontal (px)', 1, 0, 255, 'Escala'),
    F.int('pixelScale', 'Escala de píxel', 0, 0, 255, 'Escala'),
    F.enumf('moveDir', 'Dirección', 0, [
      { value: 0, label: 'Derecha → izquierda' },
      { value: 1, label: 'Izquierda → derecha' },
    ], 'Datos'),
    F.bool('displayMode', 'Conectar puntos con líneas', false, 'Datos'),
    F.enumf('colorMode', 'Color', 0, [
      { value: 0, label: 'Fijo' },
      { value: 1, label: 'Desde VP' },
    ], 'Apariencia'),
    F.color('color', 'Color de la curva', 0x07e0),
    { key: 'colorVp', label: 'VP del color', type: 'vp', default: '0000', group: 'Apariencia', showIf: (p) => num(p, 'colorMode') === 1 },
    F.sp(),
  ],
  encode(c, ctx) {
    const p = c.props;
    const b = showHeader(0x5a20, p, 11);
    let flags = num(p, 'displayMode') ? 0x80 : 0;
    if (num(p, 'colorMode') === 1) flags |= 0x40;
    const yc = num(p, 'yCentral') || Math.trunc((c.y + bottom(c)) / 2);
    b.u8(6, num(p, 'moveDir')).u8(7, flags);
    b.u16(8, c.x).u16(10, c.y).u16(12, clampX(right(c), ctx)).u16(14, clampY(bottom(c), ctx));
    b.u16(16, yc).u16(18, num(p, 'vdCentral'));
    b.u16(20, num(p, 'colorMode') === 0 ? num(p, 'color') : vp(p, 'colorVp'));
    b.u16(22, num(p, 'mulY')).u8(24, num(p, 'channel')).u8(25, num(p, 'disHor')).u8(26, num(p, 'pixelScale'));
    return b.b;
  },
  preview: () => ({ style: 'curve' }),
};

const basicGraphics: ControlDef = {
  type: 'basicGraphics',
  kind: 'display',
  label: 'Gráficos básicos',
  legacy: 'BaseGraphs',
  category: 'Gráficos',
  icon: 'Shapes',
  description: 'Área donde el MCU dibuja puntos, líneas, rectángulos y círculos por comandos.',
  defaultSize: { w: 240, h: 160 },
  fields: [
    F.vp(),
    F.int('dashed', 'Línea punteada', 0, 0, 255, 'Formato'),
    F.int('format1', 'Formato 1', 0, 0, 255, 'Formato'),
    F.int('format2', 'Formato 2', 0, 0, 255, 'Formato'),
    F.int('format3', 'Formato 3', 0, 0, 255, 'Formato'),
    F.int('format4', 'Formato 4', 0, 0, 255, 'Formato'),
    F.sp(),
  ],
  vpFields: [{ key: 'vp', words: () => 8 }],
  encode(c, ctx) {
    const p = c.props;
    const b = showHeader(0x5a21, p, 8);
    const ex = right(c) < ctx.width ? right(c) : ctx.width;
    const ey = bottom(c) < ctx.height ? bottom(c) : ctx.height;
    b.u16(6, vp(p, 'vp')).u16(8, c.x).u16(10, c.y).u16(12, ex).u16(14, ey);
    b.u8(16, num(p, 'dashed')).u8(17, num(p, 'format1')).u8(18, num(p, 'format2')).u8(19, num(p, 'format3')).u8(20, num(p, 'format4'));
    return b.b;
  },
  preview: () => ({ style: 'box', text: '◯ ▭ ╱' }),
};

const table: ControlDef = {
  type: 'table',
  kind: 'display',
  label: 'Tabla',
  legacy: 'ListingShow',
  category: 'Gráficos',
  icon: 'Table',
  description: 'Tabla con filas y columnas de texto leídas de la memoria.',
  defaultSize: { w: 320, h: 160 },
  fields: [
    F.vp(),
    F.int('cols', 'Columnas', 3, 1, 255, 'Tabla'),
    F.int('rows', 'Filas', 4, 1, 255, 'Tabla'),
    F.int('colStart', 'Columna inicial', 0, 0, 255, 'Tabla'),
    F.int('rowStart', 'Fila inicial', 0, 0, 255, 'Tabla'),
    F.int('unitBytes', 'Bytes por celda', 8, 0, 255, 'Tabla'),
    F.enumf('encoding', 'Codificación', 0, ENCODINGS, 'Texto'),
    F.bool('noBorder', 'Sin bordes', false, 'Tabla'),
    F.bool('autoFormat', 'Formato automático', true, 'Tabla'),
    F.bool('charSpacing', 'Espaciado de caracteres', true, 'Tabla'),
    F.color('lineColor', 'Color de líneas', 0xffff),
    F.color('textColor', 'Color del texto', 0xffff),
    F.font('font0', 'Fuente ASCII (ID)', 0),
    F.font('font1', 'Fuente ancha (ID)', 0),
    F.int('fontX', 'Ancho de carácter (px)', 8, 1, 255, 'Texto'),
    F.int('fontY', 'Alto de carácter (px)', 16, 1, 255, 'Texto'),
    F.int('colAdjust', 'Ajuste de columnas', 0, 0, 255, 'Tabla'),
    F.sp(),
  ],
  vpFields: [{ key: 'vp', words: (p) => Math.ceil((num(p, 'cols') * num(p, 'rows') * num(p, 'unitBytes')) / 2) || 1 }],
  encode(c, ctx) {
    const p = c.props;
    const b = showHeader(0x5a22, p, 12);
    let e = num(p, 'encoding') & 0xff;
    // Igual que el original: el bit 5 se activa cuando los bordes están DESACTIVADOS.
    e = bool(p, 'noBorder') ? e | 0x20 : e & 0x1f;
    e = bool(p, 'autoFormat') ? e & 0x3f : e | 0x40;
    e = bool(p, 'charSpacing') ? e & 0x7f : e | 0x80;
    b.u16(6, vp(p, 'vp')).u8(8, num(p, 'cols')).u8(9, num(p, 'rows')).u8(10, num(p, 'colStart')).u8(11, num(p, 'rowStart'));
    b.u8(12, num(p, 'unitBytes')).u8(13, e);
    b.u16(14, c.x).u16(16, c.y).u16(18, clampX(right(c), ctx)).u16(20, clampY(bottom(c), ctx));
    b.u16(22, num(p, 'lineColor')).u16(24, num(p, 'textColor'));
    b.u8(26, num(p, 'font0')).u8(27, num(p, 'font1')).u8(28, num(p, 'fontX')).u8(29, num(p, 'fontY'));
    b.u8(30, num(p, 'colAdjust')).u8(31, num(p, 'colAdjust'));
    return b.b;
  },
  preview: () => ({ style: 'table' }),
};

const progressBar: ControlDef = {
  type: 'progressBar',
  kind: 'display',
  label: 'Barra de progreso',
  legacy: 'DW_ProcessBar',
  category: 'Gráficos',
  icon: 'CircleGauge',
  description: 'Barra rellena proporcional al valor, con borde y porcentaje opcional.',
  defaultSize: { w: 240, h: 28 },
  fields: [
    F.vp(),
    F.enumf('varType', 'Tipo de variable', 0, VAR_TYPES.slice(0, 2), 'Variable'),
    F.int('vMin', 'Valor mínimo', 0, 0, 65535, 'Rango'),
    F.int('vMax', 'Valor máximo', 100, 0, 65535, 'Rango'),
    F.enumf('orientation', 'Orientación', 0, [
      { value: 0, label: 'Horizontal' },
      { value: 1, label: 'Vertical' },
    ], 'Rango'),
    F.color('borderColor', 'Color del borde', 0xffff),
    F.color('foreColor', 'Color de relleno', 0x07e0),
    F.color('backColor', 'Color de fondo', 0x2104),
    F.bool('showRate', 'Mostrar porcentaje', false, 'Apariencia'),
    F.bool('fillBack', 'Rellenar fondo', true, 'Apariencia'),
    F.bool('showBorder', 'Mostrar borde', true, 'Apariencia'),
    { key: 'vpRt', label: 'VP de tiempo real', type: 'vp', default: '0000', group: 'Avanzado' },
    F.sp(),
  ],
  vpFields: [{ key: 'vp', words: words1 }],
  encode(c) {
    const p = c.props;
    const b = showHeader(0x5a23, p, 13);
    b.u16(6, vp(p, 'vp')).u16(8, c.x).u16(10, c.y).u16(12, right(c)).u16(14, bottom(c));
    b.u16(16, num(p, 'borderColor')).u16(18, num(p, 'foreColor')).u16(20, num(p, 'backColor'));
    b.u16(22, num(p, 'vMax')).u16(24, num(p, 'vMin'));
    b.u8(26, (bool(p, 'showRate') ? 0x80 : 0) + (!bool(p, 'fillBack') ? 2 : 0) + (!bool(p, 'showBorder') ? 1 : 0));
    b.u8(27, num(p, 'orientation')).u8(28, num(p, 'varType')).u8(29, 0).u16(30, vp(p, 'vpRt'));
    return b.b;
  },
  preview: () => ({ style: 'bar', value: 0.6 }),
};

const industry: ControlDef = {
  type: 'industry',
  kind: 'display',
  label: 'Aplicación industrial',
  legacy: 'BaseApply',
  category: 'Gráficos',
  icon: 'Factory',
  description: 'Control de aplicación especial configurado por el MCU.',
  defaultSize: { w: 160, h: 80 },
  fields: [F.vp(), F.sp()],
  vpFields: [{ key: 'vp', words: words1 }],
  encode(c) {
    const b = showHeader(0x5a23, c.props, 1);
    b.u16(6, vp(c.props, 'vp')).u8(8, 0);
    return b.b;
  },
  preview: () => ({ style: 'box', text: 'Industrial' }),
};

const qrCode: ControlDef = {
  type: 'qrCode',
  kind: 'display',
  label: 'Código QR',
  legacy: 'Two_Dimension',
  category: 'Gráficos',
  icon: 'QrCode',
  description: 'Genera un código QR a partir del texto almacenado en la variable.',
  defaultSize: { w: 120, h: 120 },
  fields: [
    F.vp(),
    F.int('byteNum', 'Tamaño de punto (px)', 4, 1, 255, 'QR'),
    F.int('fixMode', 'Modo de corrección', 0, 0, 255, 'QR'),
    F.bool('displayMode', 'Invertir colores', false, 'QR'),
    F.color('bgColor', 'Color de fondo', 0xffff),
    F.color('codeColor', 'Color del código', 0x0000),
    F.sp(),
  ],
  vpFields: [{ key: 'vp', words: () => 64 }],
  encode(c) {
    const p = c.props;
    const b = showHeader(0x5a25, p, 8);
    b.u16(6, vp(p, 'vp')).u16(8, c.x).u16(10, c.y).u8(12, 0).u8(13, num(p, 'byteNum')).u8(14, num(p, 'fixMode'));
    b.u8(15, bool(p, 'displayMode') ? 0x80 : 0).u16(16, num(p, 'bgColor')).u16(18, num(p, 'codeColor'));
    return b.b;
  },
  preview: () => ({ style: 'qr' }),
};

const zoneScroll: ControlDef = {
  type: 'zoneScroll',
  kind: 'display',
  label: 'Desplazamiento de zona',
  legacy: 'ZoneScrolling',
  category: 'Gráficos',
  icon: 'MoveHorizontal',
  description: 'Desplaza continuamente el contenido de una zona de la pantalla.',
  defaultSize: { w: 300, h: 60 },
  fields: [
    F.vp(),
    F.int('modeMove', 'Modo de movimiento', 0, 0, 255, 'Movimiento'),
    F.int('disMove', 'Distancia por paso', 1, 0, 65535, 'Movimiento'),
    F.sp(),
  ],
  vpFields: [{ key: 'vp', words: words1 }],
  encode(c, ctx) {
    const p = c.props;
    // Equivalente a DWINDLL.dll SetData(36, …)
    const b = showHeader(0x5a24, p, 7);
    const x2 = right(c) >= ctx.width ? ctx.width - 1 : right(c);
    const y2 = bottom(c) >= ctx.height ? ctx.height - 1 : bottom(c);
    b.u16(6, vp(p, 'vp')).u16(8, c.x).u16(10, c.y).u16(12, x2).u16(14, y2);
    b.u16(16, num(p, 'disMove')).u8(18, num(p, 'modeMove'));
    return b.b;
  },
  preview: () => ({ style: 'box', text: '⇠ zona ⇠' }),
};

const zoneBrightness: ControlDef = {
  type: 'zoneBrightness',
  kind: 'display',
  label: 'Brillo de zona',
  legacy: 'ZoneLightSetting',
  category: 'Gráficos',
  icon: 'SunDim',
  description: 'Ajusta el brillo de una zona rectangular según la variable.',
  defaultSize: { w: 200, h: 100 },
  fields: [F.vp(), F.sp()],
  vpFields: [{ key: 'vp', words: words1 }],
  encode(c) {
    // Equivalente a DWINDLL.dll SetData(38, …). El brillo inicial no se escribe en el bloque.
    const b = showHeader(0x5a26, c.props, 5);
    b.u16(6, vp(c.props, 'vp')).u16(8, c.x).u16(10, c.y).u16(12, right(c)).u16(14, bottom(c));
    return b.b;
  },
  preview: () => ({ style: 'box', text: '☀ brillo' }),
};

const dataTransmit: ControlDef = {
  type: 'dataTransmit',
  kind: 'display',
  label: 'Envío automático de datos',
  legacy: 'AuxiliaryDisplay',
  category: 'Sistema',
  icon: 'Send',
  description: 'Envía por el puerto serie una trama definida cuando se muestra la página.',
  defaultSize: { w: 120, h: 40 },
  fields: [
    F.vp(),
    F.bool('autoCom', 'Envío automático', true, 'Comunicación'),
    { key: 'code', label: 'Trama (hex)', type: 'hex', default: '', group: 'Comunicación', help: 'Hasta 14 bytes.' },
    F.sp(),
  ],
  vpFields: [{ key: 'vp', words: words1 }],
  encode(c) {
    const p = c.props;
    const b = showHeader(0x5a30, p, 13);
    b.u16(6, vp(p, 'vp')).u8(8, bool(p, 'autoCom') ? 0xff : 0).u8(9, 0);
    b.u16(10, c.x).u16(12, c.y).u16(14, right(c)).u16(16, bottom(c));
    b.hex(18, str(p, 'code'), 31);
    return b.b;
  },
  preview: () => ({ style: 'box', text: 'TX ⇢' }),
};

const camera: ControlDef = {
  type: 'camera',
  kind: 'display',
  label: 'Cámara',
  legacy: 'CameraShow',
  category: 'Multimedia',
  icon: 'Camera',
  description: 'Control de cámara FSK 0x31 de V7.651. Requiere hardware y firmware compatibles; el bus V49 usa Imagen variable JPEG.',
  defaultSize: { w: 320, h: 240 },
  fields: [
    { key: 'vpImage', label: 'VP de imagen', type: 'vp', default: '2000', group: 'Variable', help: 'Entre 0x2000 y 0xC000.' },
    F.int('cameraId', 'Cámara', 0, 0, 255, 'Cámara'),
    F.bool('light', 'Ajustar brillo', false, 'Cámara'),
    F.bool('mirror', 'Espejo', false, 'Cámara'),
    F.enumf('adjustMode', 'Ajuste', 0, [
      { value: 0, label: 'Automático' },
      { value: 1, label: 'Manual' },
    ], 'Cámara'),
    F.int('lightSet', 'Brillo manual', 0, 0, 255, 'Cámara'),
    F.int('resolution', 'Resolución', 0, 0, 255, 'Cámara'),
    F.int('displayScale', 'Escala', 0, 0, 255, 'Cámara'),
    F.sp(),
  ],
  encode(c) {
    const p = c.props;
    const b = showHeader(0x5a31, p, 10);
    let v = vp(p, 'vpImage', 0x2000);
    if (v < 0x2000 || v > 0xc000) v = 0x2000;
    b.u16(6, v).u16(8, c.x).u16(10, c.y).u16(12, c.w).u16(14, c.h);
    b.u8(16, 0xff).u8(17, 0xff).u8(18, 0xff).u8(19, 0xff).u8(20, 0x5a).u8(21, num(p, 'cameraId'));
    b.u8(22, ((num(p, 'light') << 7) + (num(p, 'mirror') << 6)) & 0xff);
    b.u8(23, num(p, 'adjustMode') === 0 ? 0 : num(p, 'lightSet')).u8(24, num(p, 'resolution')).u8(25, num(p, 'displayScale'));
    return b.b;
  },
  preview: () => ({ style: 'box', text: '📷 cámara' }),
};

const video: ControlDef = {
  type: 'video',
  kind: 'display',
  label: 'Video',
  legacy: 'VideoShow',
  category: 'Multimedia',
  icon: 'Clapperboard',
  description: 'Reproduce un video convertido a ICL con audio WAE opcional.',
  defaultSize: { w: 320, h: 240 },
  fields: [
    F.vp(),
    F.int('fps', 'Cuadros por segundo', 25, 0, 255, 'Video'),
    F.int('type', 'Tipo', 0, 0, 255, 'Video'),
    F.int('iclId', 'Archivo ICL del video', 0, 0, 65535, 'Video'),
    F.int('waeId', 'Archivo de audio WAE', 0, 0, 65535, 'Video'),
    F.sp(),
  ],
  vpFields: [{ key: 'vp', words: words1 }],
  encode(c) {
    const p = c.props;
    const b = showHeader(0x5a31, p, 8);
    b.u16(6, vp(p, 'vp')).u16(8, c.x).u16(10, c.y).u16(12, c.w).u16(14, c.h);
    b.u8(16, num(p, 'fps')).u8(17, num(p, 'type')).u16(18, num(p, 'iclId')).u16(20, num(p, 'waeId'));
    b.u16(28, c.x + c.w).u16(30, c.y + c.h);
    return b.b;
  },
  preview: () => ({ style: 'box', text: '▶ video' }),
};

export const DISPLAY_CONTROLS: ControlDef[] = [
  dataVar,
  text,
  textII,
  rtc,
  hexVar,
  rollText,
  dataWindow,
  rollerChar,
  gtf,
  iconVar,
  animIcon,
  sliderShow,
  artVar,
  iconRotate,
  bitIcon,
  imageAnim,
  iconPageTrans,
  iconOverlay,
  batchIcon,
  multiLanguage,
  progressBar,
  curve,
  basicGraphics,
  table,
  qrCode,
  zoneScroll,
  zoneBrightness,
  clock,
  industry,
  dataTransmit,
  camera,
  video,
];

// ---------------------------------------------------------------- utilidades

const INIT_CODE_BY_VARTYPE = [3, 4, 1, 2, 41, 30, 42, 43, 44];

function initNumeric(c: ControlInstance): InitEntry[] {
  const raw = str(c.props, 'init');
  if (raw === '') return [];
  const code = INIT_CODE_BY_VARTYPE[num(c.props, 'varType')] ?? 44;
  const e = encodeInitValue(vp(c.props, 'vp'), code, raw);
  return e ? [e] : [];
}

function initText(c: ControlInstance, encoding: number, unicodeBE = false, offsetWords = 0): InitEntry[] {
  const raw = str(c.props, 'init');
  if (raw === '') return [];
  const bytes = encodeText(raw, encoding, unicodeBE);
  if (bytes.length > num(c.props, 'textLength')) {
    throw new Error(`El texto inicial ocupa ${bytes.length} bytes y supera la longitud máxima de ${num(c.props, 'textLength')} bytes.`);
  }
  return [{ vp: vp(c.props, 'vp') + offsetWords, bytes }];
}

function sampleNumber(p: Props): string {
  const nInt = Math.max(1, num(p, 'nInt', 3));
  const nDot = num(p, 'nDot', 0);
  const init = str(p, 'init');
  if (init !== '' && Number.isFinite(Number(init))) {
    const v = Number(init) / Math.pow(10, nDot);
    return v.toFixed(nDot);
  }
  const ints = '1234567890123456789'.slice(0, nInt);
  return nDot > 0 ? `${ints}.${'5'.repeat(nDot)}` : ints;
}

function rtcSample(fmt: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const days = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
  return fmt
    .replace(/Y/g, String(d.getFullYear() % 100).padStart(2, '0'))
    .replace(/M/g, pad(d.getMonth() + 1))
    .replace(/D/g, pad(d.getDate()))
    .replace(/W/g, days[d.getDay()])
    .replace(/H/g, pad(d.getHours()))
    .replace(/Q/g, pad(d.getMinutes()))
    .replace(/S/g, pad(d.getSeconds()));
}
