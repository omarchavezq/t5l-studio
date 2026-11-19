// Controles táctiles (13TouchFile.bin). Bloques de 16/32/48/64 bytes.
// Portados 1:1 desde BizDraw.ConfigInput.* de DGUS V7.651.

import { Buf } from '../bytes';
import type { ControlInstance, Props } from '../types';
import {
  ControlDef,
  EncodeContext,
  F,
  FieldDef,
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
  str,
  vp,
} from './schema';

const CONST = 0xfe;

// ---------------------------------------------------------------- campos comunes

const touchCommon = (): FieldDef[] => [
  {
    key: 'picNext',
    label: 'Ir a la página',
    type: 'page',
    default: -1,
    group: 'Táctil',
    help: 'Página a la que salta al tocar. -1 = no cambia de página.',
  },
  {
    key: 'picOn',
    label: 'Imagen de botón presionado',
    type: 'page',
    default: -1,
    group: 'Táctil',
    help: 'Página cuyo recorte se muestra mientras se presiona (efecto de botón). -1 = sin efecto.',
  },
  F.bool('noPressEffect', 'Código FE (sin efecto de presión)', true, 'Táctil', 'Activado = 0xFE; desactivado = 0xFD.'),
  F.bool('keying', 'Asociar a tecla física', false, 'Avanzado'),
  F.int('keyCode', 'Código de tecla física', 1, 1, 255, 'Avanzado'),
  F.int('ivrCode', 'Sonido al tocar (IVR, 0 = no)', 0, 0, 63, 'Avanzado'),
];

/** InputBase.GetByte: los primeros 16 bytes comunes a todos los controles táctiles. */
function touchBase(c: ControlInstance, ctx: EncodeContext, size: number, tpCode: number): Buf {
  const p = c.props;
  const b = new Buf(size);
  const pic = ctx.pageId;
  const ivr = num(p, 'ivrCode');
  b.u8(0, (pic >> 8) & 0xff);
  if (ivr > 0) b.u8(0, (b.b[0] & 3) + (ivr << 2));
  b.u8(1, pic);
  if (bool(p, 'keying')) {
    const key = num(p, 'keyCode', 1);
    const idx = ++ctx.keyingIndex.n;
    b.u8(2, 0xff).u8(3, key - 1).u8(4, 0).u8(5, 0).u8(6, 0xff).u8(7, key).u16(8, idx);
  } else {
    b.u16(2, c.x).u16(4, c.y).u16(6, right(c)).u16(8, bottom(c));
  }
  const next = num(p, 'picNext', -1);
  const on = num(p, 'picOn', -1);
  if (next > -1) b.u16(10, next);
  else b.u8(10, 0xff).u8(11, 0);
  if (on > -1) b.u16(12, on);
  else b.u8(12, 0xff).u8(13, 0);
  b.u16(14, tpCode);
  return b;
}

/** Área donde se escribe el texto: la del control o la indicada a mano. */
const scanArea = (c: ControlInstance) =>
  bool(c.props, 'scanAuto')
    ? { x1: c.x, y1: c.y, x2: right(c), y2: bottom(c) }
    : { x1: num(c.props, 'scanX1'), y1: num(c.props, 'scanY1'), x2: num(c.props, 'scanX2'), y2: num(c.props, 'scanY2') };

const fe = (p: Props, low: number) => ((bool(p, 'noPressEffect') ? 0xfe : 0xfd) << 8) | low;

const kbFields = (): FieldDef[] => [
  F.enumf('kbSource', 'Teclado', 0, [
    { value: 0, label: 'Teclado en la página actual' },
    { value: 1, label: 'Teclado en otra página' },
    { value: 15, label: 'Teclado del sistema (0x0F)' },
  ], 'Teclado'),
  F.int('picKb', 'Página del teclado', 0, 0, 65535, 'Teclado'),
  F.int('kbX1', 'Área del teclado X1', 0, 0, 65535, 'Teclado'),
  F.int('kbY1', 'Área del teclado Y1', 0, 0, 65535, 'Teclado'),
  F.int('kbX2', 'Área del teclado X2', 0, 0, 65535, 'Teclado'),
  F.int('kbY2', 'Área del teclado Y2', 0, 0, 65535, 'Teclado'),
  F.int('kbPosX', 'Posición del teclado X', 0, 0, 65535, 'Teclado'),
  F.int('kbPosY', 'Posición del teclado Y', 0, 0, 65535, 'Teclado'),
];

// ---------------------------------------------------------------- controles

const basicTouch: ControlDef = {
  type: 'basicTouch',
  kind: 'touch',
  label: 'Botón (cambio de página)',
  legacy: 'KeyCodeReturn (BaseTouch)',
  category: 'Botones',
  icon: 'MousePointerClick',
  description: 'Zona táctil básica: cambia de página y/o muestra efecto de botón.',
  defaultSize: { w: 120, h: 48 },
  fields: [
    ...touchCommon().filter((f) => f.key !== 'noPressEffect'),
    { key: 'keyValue', label: 'Código de tecla', type: 'vp', default: '0000', group: 'Avanzado', help: '0000 = solo cambio de página. En teclados es el código ASCII que se envía (p. ej. 0031 = "1").' },
  ],
  encode(c, ctx) {
    return touchBase(c, ctx, 16, vp(c.props, 'keyValue', 0)).b;
  },
  preview: (c) => ({ style: 'button', text: num(c.props, 'picNext', -1) >= 0 ? `→ Pág. ${c.props.picNext}` : 'Botón' }),
};

const keyReturn: ControlDef = {
  type: 'keyReturn',
  kind: 'touch',
  label: 'Botón con valor de retorno',
  legacy: 'KeyCodeReturn',
  category: 'Botones',
  icon: 'SquareMousePointer',
  description: 'Al tocar, escribe un valor en una variable y lo notifica al MCU.',
  defaultSize: { w: 120, h: 48 },
  fields: [
    F.vp(),
    F.enumf('vpMode', 'Escritura en VP', 0, [
      { value: 0, label: 'Palabra completa' },
      { value: 1, label: 'Byte alto' },
      { value: 2, label: 'Byte bajo' },
    ], 'Variable'),
    F.int('keyValue', 'Valor que se escribe', 1, 0, 65535, 'Variable'),
    F.int('holdTime', 'Tiempo de pulsación (×8 ms)', 0, 0, 255, 'Táctil', '0 = al tocar. >0 = al mantener presionado ese tiempo.'),
    ...touchCommon(),
  ],
  vpFields: [{ key: 'vp', words: () => 1 }],
  encode(c, ctx) {
    const p = c.props;
    const b = touchBase(c, ctx, 32, fe(p, 0x05));
    b.u8(16, CONST).u16(17, vp(p, 'vp')).u8(19, num(p, 'vpMode')).u16(20, num(p, 'keyValue')).u8(22, num(p, 'holdTime'));
    return b.b;
  },
  preview: (c) => ({ style: 'button', text: `${c.name || 'Botón'} = ${c.props.keyValue}` }),
};

const dataInput: ControlDef = {
  type: 'dataInput',
  kind: 'touch',
  label: 'Entrada numérica',
  legacy: 'VarInput',
  category: 'Entradas',
  icon: 'TextCursor',
  description: 'Abre un teclado para introducir un número y lo guarda en la variable.',
  defaultSize: { w: 140, h: 40 },
  fields: [
    F.vp(),
    F.enumf('varType', 'Tipo de variable', 0, VAR_TYPES.slice(0, 4), 'Variable'),
    F.int('nInt', 'Dígitos enteros', 3, 0, 20, 'Formato'),
    F.int('nDot', 'Decimales', 0, 0, 20, 'Formato'),
    F.bool('showAuto', 'Eco dentro del control', true, 'Eco', 'Si está activo, el valor se escribe dentro del propio control.'),
    { ...F.int('showX', 'Eco: posición X', 0, 0, 65535, 'Eco'), showIf: (p) => !bool(p, 'showAuto') },
    { ...F.int('showY', 'Eco: posición Y', 0, 0, 65535, 'Eco'), showIf: (p) => !bool(p, 'showAuto') },
    F.color('showColor', 'Eco: color', 0xffff, 'Eco'),
    F.font('fontId', 'Eco: fuente (ID)', 0),
    F.int('fontHor', 'Eco: ancho de carácter (px)', 12, 0, 255, 'Eco'),
    F.int('cursorColor', 'Color del cursor', 0, 0, 255, 'Eco'),
    F.bool('hide', 'Ocultar entrada (contraseña)', false, 'Eco'),
    ...kbFields(),
    F.enumf('limits', 'Limitar rango', 0, [
      { value: 0, label: 'No' },
      { value: 255, label: 'Sí (0xFF)' },
    ], 'Rango'),
    F.int('vMin', 'Valor mínimo', 0, -2147483648, 4294967295, 'Rango'),
    F.int('vMax', 'Valor máximo', 9999, -2147483648, 4294967295, 'Rango'),
    F.bool('returnSet', 'Escribir dato al terminar', false, 'Al terminar'),
    { key: 'returnVp', label: 'VP de aviso', type: 'vp', default: '0000', group: 'Al terminar' },
    F.int('returnData', 'Dato de aviso', 0, 0, 65535, 'Al terminar'),
    F.percent('layerGamma', 'Brillo de la capa', 100, 'Teclado'),
    ...touchCommon(),
  ],
  vpFields: [{ key: 'vp', words: (p) => VAR_TYPE_WORDS[num(p, 'varType')] ?? 1 }],
  encode(c, ctx) {
    const p = c.props;
    const b = touchBase(c, ctx, 64, fe(p, 0x00));
    const sx = bool(p, 'showAuto') ? c.x + 4 : num(p, 'showX');
    const sy = bool(p, 'showAuto') ? c.y + 4 : num(p, 'showY');
    b.u8(16, CONST).u16(17, vp(p, 'vp')).u8(19, num(p, 'varType')).u8(20, num(p, 'nInt')).u8(21, num(p, 'nDot'));
    b.u16(22, sx).u16(24, sy).u16(26, num(p, 'showColor')).u8(28, num(p, 'fontId')).u8(29, num(p, 'fontHor'));
    b.u8(30, num(p, 'cursorColor')).u8(31, num(p, 'hide')).u8(32, CONST);
    writeKb(b, p, ctx, 33, true);
    b.u8(48, 0xfe).u8(49, num(p, 'limits')).u32(50, num(p, 'vMin')).u32(54, num(p, 'vMax'));
    b.u8(58, num(p, 'returnSet')).u16(59, vp(p, 'returnVp')).u16(61, num(p, 'returnData'));
    b.u8(63, pct255(num(p, 'layerGamma', 100)));
    return b.b;
  },
  preview: () => ({ style: 'box', text: '123▏' }),
};

/** Escribe origen de teclado + página + área + posición (formato VarInput: offset 33). */
function writeKb(b: Buf, p: Props, ctx: EncodeContext, at: number, sourceClamp: boolean) {
  const src = num(p, 'kbSource');
  b.u8(at, sourceClamp && src > 1 ? 15 : src);
  b.u16(at + 1, num(p, 'picKb')).u16(at + 3, num(p, 'kbX1')).u16(at + 5, num(p, 'kbY1'));
  b.u16(at + 7, clampX(num(p, 'kbX2'), ctx)).u16(at + 9, clampY(num(p, 'kbY2'), ctx));
  b.u16(at + 11, clampX(num(p, 'kbPosX'), ctx)).u16(at + 13, clampY(num(p, 'kbPosY'), ctx));
}

const textInput: ControlDef = {
  type: 'textInput',
  kind: 'touch',
  label: 'Entrada de texto ASCII',
  legacy: 'TextInput',
  category: 'Entradas',
  icon: 'Keyboard',
  description: 'Abre un teclado para introducir texto ASCII.',
  defaultSize: { w: 220, h: 40 },
  fields: [
    F.vp(),
    F.int('maxLen', 'Longitud máxima (palabras)', 10, 1, 255, 'Variable'),
    F.int('scanMode', 'Modo de escritura', 0, 0, 255, 'Variable'),
    F.font('fontId', 'Fuente (ID)', 0),
    F.int('fontHor', 'Ancho de carácter (px)', 12, 0, 255, 'Texto'),
    F.int('fontVer', 'Alto de carácter (px)', 24, 0, 255, 'Texto'),
    F.int('cursorColor', 'Color del cursor', 0, 0, 255, 'Texto'),
    F.color('disColor', 'Color del texto', 0xffff, 'Texto'),
    F.int('scanReturn', 'Modo de retorno', 0, 0, 255, 'Variable'),
    F.bool('displayEn', 'Mostrar asteriscos', false, 'Texto'),
    F.bool('scanAuto', 'Área de texto = área del control', true, 'Área de texto'),
    { ...F.int('scanX1', 'Área de texto X1', 0, 0, 65535, 'Área de texto'), showIf: (p) => !bool(p, 'scanAuto') },
    { ...F.int('scanY1', 'Área de texto Y1', 0, 0, 65535, 'Área de texto'), showIf: (p) => !bool(p, 'scanAuto') },
    { ...F.int('scanX2', 'Área de texto X2', 0, 0, 65535, 'Área de texto'), showIf: (p) => !bool(p, 'scanAuto') },
    { ...F.int('scanY2', 'Área de texto Y2', 0, 0, 65535, 'Área de texto'), showIf: (p) => !bool(p, 'scanAuto') },
    ...kbFields(),
    F.percent('layerGamma', 'Brillo de la capa', 100, 'Teclado'),
    ...touchCommon(),
  ],
  vpFields: [{ key: 'vp', words: (p) => num(p, 'maxLen', 10) }],
  encode(c, ctx) {
    const p = c.props;
    const b = touchBase(c, ctx, 64, fe(p, 0x06));
    b.u8(16, CONST).u16(17, vp(p, 'vp')).u8(19, num(p, 'maxLen')).u8(20, num(p, 'scanMode'));
    b.u8(21, num(p, 'fontId')).u8(22, num(p, 'fontHor')).u8(23, num(p, 'fontVer')).u8(24, num(p, 'cursorColor'));
    const sa = scanArea(c);
    b.u16(25, num(p, 'disColor')).u16(27, sa.x1).u16(29, sa.y1).u8(31, num(p, 'scanReturn'));
    b.u8(32, CONST).u16(33, clampX(sa.x2, ctx)).u16(35, clampY(sa.y2, ctx));
    b.u8(37, num(p, 'kbSource')).u16(38, num(p, 'picKb')).u16(40, num(p, 'kbX1')).u16(42, num(p, 'kbY1'));
    b.u16(44, clampX(num(p, 'kbX2'), ctx)).u16(46, clampY(num(p, 'kbY2'), ctx));
    b.u8(48, CONST).u16(49, clampX(num(p, 'kbPosX'), ctx)).u16(51, clampY(num(p, 'kbPosY'), ctx));
    b.u8(53, num(p, 'displayEn')).u8(54, pct255(num(p, 'layerGamma', 100))).u8(55, 0).u8(56, 0);
    return b.b;
  },
  preview: () => ({ style: 'box', text: 'abc▏' }),
};

const gbkInput: ControlDef = {
  type: 'gbkInput',
  kind: 'touch',
  label: 'Entrada de texto GBK',
  legacy: 'GBKInput',
  category: 'Entradas',
  icon: 'Keyboard',
  description: 'Entrada de texto con método de entrada pinyin (chino GBK).',
  defaultSize: { w: 220, h: 40 },
  fields: [
    F.vp(),
    F.int('maxLen', 'Longitud máxima (palabras)', 10, 1, 255, 'Variable'),
    F.int('scanMode', 'Modo de escritura', 0, 0, 255, 'Variable'),
    F.font('lib1', 'Fuente ASCII (ID)', 0),
    F.font('lib2', 'Fuente GBK (ID)', 0),
    F.int('scale1', 'Escala ASCII', 12, 0, 255, 'Texto'),
    F.int('scale2', 'Escala GBK', 24, 0, 255, 'Texto'),
    F.int('cursorColor', 'Color del cursor', 0, 0, 255, 'Texto'),
    F.color('color0', 'Color del texto', 0xffff, 'Texto'),
    F.color('color1', 'Color del pinyin', 0xffe0, 'Texto'),
    F.int('pyMode', 'Visualización del pinyin', 0, 0, 255, 'Texto'),
    F.int('scanReturn', 'Modo de retorno', 0, 0, 255, 'Variable'),
    F.int('pyX', 'Pinyin: posición X', 0, 0, 65535, 'Texto'),
    F.int('pyY', 'Pinyin: posición Y', 0, 0, 65535, 'Texto'),
    F.int('scanDis', 'Espaciado', 0, 0, 255, 'Texto'),
    F.bool('scanAuto', 'Área de texto = área del control', true, 'Área de texto'),
    { ...F.int('scanX1', 'Área de texto X1', 0, 0, 65535, 'Área de texto'), showIf: (p) => !bool(p, 'scanAuto') },
    { ...F.int('scanY1', 'Área de texto Y1', 0, 0, 65535, 'Área de texto'), showIf: (p) => !bool(p, 'scanAuto') },
    { ...F.int('scanX2', 'Área de texto X2', 0, 0, 65535, 'Área de texto'), showIf: (p) => !bool(p, 'scanAuto') },
    { ...F.int('scanY2', 'Área de texto Y2', 0, 0, 65535, 'Área de texto'), showIf: (p) => !bool(p, 'scanAuto') },
    ...kbFields(),
    ...touchCommon(),
  ],
  vpFields: [{ key: 'vp', words: (p) => num(p, 'maxLen', 10) }],
  encode(c, ctx) {
    const p = c.props;
    const b = touchBase(c, ctx, 64, fe(p, 0x06));
    b.u8(16, CONST).u16(17, vp(p, 'vp')).u8(19, num(p, 'maxLen')).u8(20, num(p, 'scanMode'));
    b.u8(21, num(p, 'lib1')).u8(22, num(p, 'lib2')).u8(23, num(p, 'scale1')).u8(24, num(p, 'scale2'));
    b.u8(25, num(p, 'cursorColor')).u16(26, num(p, 'color0')).u16(28, num(p, 'color1'));
    b.u8(30, num(p, 'pyMode')).u8(31, num(p, 'scanReturn')).u8(32, 0xfe);
    const sa = scanArea(c);
    b.u16(33, sa.x1).u16(35, sa.y1).u16(37, sa.x2).u16(39, sa.y2);
    b.u16(41, num(p, 'pyX')).u16(43, num(p, 'pyY')).u8(45, num(p, 'scanDis')).u8(46, 0).u8(47, num(p, 'kbSource'));
    b.u8(48, 0xfe).u16(49, num(p, 'picKb')).u16(51, num(p, 'kbX1')).u16(53, num(p, 'kbY1'));
    b.u16(55, num(p, 'kbX2')).u16(57, num(p, 'kbY2')).u16(59, num(p, 'kbPosX')).u16(61, num(p, 'kbPosY'));
    b.u8(63, 2);
    return b.b;
  },
  preview: () => ({ style: 'box', text: '拼音▏' }),
};

const popMenu: ControlDef = {
  type: 'popMenu',
  kind: 'touch',
  label: 'Menú emergente',
  legacy: 'PopMenu',
  category: 'Entradas',
  icon: 'PanelTopOpen',
  description: 'Muestra un menú (recorte de otra página) y guarda la opción elegida.',
  defaultSize: { w: 160, h: 40 },
  fields: [
    F.vp(),
    F.enumf('vpMode', 'Escritura en VP', 0, [
      { value: 0, label: 'Palabra completa' },
      { value: 1, label: 'Byte alto' },
      { value: 2, label: 'Byte bajo' },
    ], 'Variable'),
    F.int('picMenu', 'Página del menú', 0, 0, 65535, 'Menú'),
    F.int('menuX1', 'Área del menú X1', 0, 0, 65535, 'Menú'),
    F.int('menuY1', 'Área del menú Y1', 0, 0, 65535, 'Menú'),
    F.int('menuX2', 'Área del menú X2', 100, 0, 65535, 'Menú'),
    F.int('menuY2', 'Área del menú Y2', 100, 0, 65535, 'Menú'),
    F.int('menuPosX', 'Posición del menú X', 0, 0, 65535, 'Menú'),
    F.int('menuPosY', 'Posición del menú Y', 0, 0, 65535, 'Menú'),
    F.percent('layerGamma', 'Brillo de la capa', 100, 'Menú'),
    ...touchCommon(),
  ],
  vpFields: [{ key: 'vp', words: () => 1 }],
  encode(c, ctx) {
    const p = c.props;
    const b = touchBase(c, ctx, 48, fe(p, 0x01));
    b.u8(16, CONST).u16(17, vp(p, 'vp')).u8(19, num(p, 'vpMode')).u16(20, num(p, 'picMenu'));
    b.u16(22, num(p, 'menuX1')).u16(24, num(p, 'menuY1'));
    b.u16(26, clampX(num(p, 'menuX2'), ctx)).u16(28, clampY(num(p, 'menuY2'), ctx));
    b.u16(30, clampX(num(p, 'menuPosX'), ctx)).u8(32, CONST).u16(33, clampY(num(p, 'menuPosY'), ctx));
    b.u8(35, pct255(num(p, 'layerGamma', 100)));
    return b.b;
  },
  preview: () => ({ style: 'box', text: 'Menú ▾' }),
};

const incAdjust: ControlDef = {
  type: 'incAdjust',
  kind: 'touch',
  label: 'Botón + / −',
  legacy: 'IncManager',
  category: 'Botones',
  icon: 'CirclePlus',
  description: 'Suma o resta un paso a la variable en cada toque (ajuste incremental).',
  defaultSize: { w: 64, h: 48 },
  fields: [
    F.vp(),
    F.enumf('vpMode', 'Formato de VP', 0, [
      { value: 0, label: 'Palabra completa' },
      { value: 1, label: 'Byte alto' },
      { value: 2, label: 'Byte bajo' },
    ], 'Variable'),
    F.enumf('adjMode', 'Operación', 1, [
      { value: 0, label: 'Restar (−)' },
      { value: 1, label: 'Sumar (+)' },
    ], 'Ajuste'),
    F.enumf('returnMode', 'Al llegar al límite', 0, [
      { value: 0, label: 'Detenerse' },
      { value: 1, label: 'Dar la vuelta' },
    ], 'Ajuste'),
    F.int('step', 'Paso', 1, 0, 65535, 'Ajuste'),
    F.int('vMin', 'Valor mínimo', 0, 0, 65535, 'Ajuste'),
    F.int('vMax', 'Valor máximo', 100, 0, 65535, 'Ajuste'),
    F.enumf('keyMode', 'Mantener presionado', 0, [
      { value: 0, label: 'Un paso por toque' },
      { value: 1, label: 'Repetir mientras se presiona' },
    ], 'Ajuste'),
    F.int('keyDelay', 'Retardo de repetición', 0, 0, 255, 'Ajuste'),
    ...touchCommon(),
  ],
  vpFields: [{ key: 'vp', words: () => 1 }],
  encode(c, ctx) {
    const p = c.props;
    const b = touchBase(c, ctx, 32, fe(p, 0x02));
    b.u8(16, CONST).u16(17, vp(p, 'vp')).u8(19, num(p, 'vpMode')).u8(20, num(p, 'adjMode')).u8(21, num(p, 'returnMode'));
    b.u16(22, num(p, 'step')).u16(24, num(p, 'vMin')).u16(26, num(p, 'vMax'));
    b.u8(28, num(p, 'keyMode')).u8(29, num(p, 'keyDelay'));
    return b.b;
  },
  preview: (c) => ({ style: 'button', text: num(c.props, 'adjMode', 1) ? '+' : '−' }),
};

const dragAdjust: ControlDef = {
  type: 'dragAdjust',
  kind: 'touch',
  label: 'Deslizador táctil',
  legacy: 'DragManager',
  category: 'Entradas',
  icon: 'SlidersHorizontal',
  description: 'Arrastrar sobre la zona para ajustar el valor (barra deslizante).',
  defaultSize: { w: 260, h: 40 },
  fields: [
    F.vp(),
    F.enumf('adjMode', 'Dirección', 0, [
      { value: 0, label: 'Horizontal' },
      { value: 1, label: 'Vertical' },
    ], 'Ajuste'),
    F.enumf('vpFormat', 'Formato de VP', 0, [
      { value: 0, label: 'Palabra completa' },
      { value: 0x10, label: 'Byte alto' },
      { value: 0x20, label: 'Byte bajo' },
    ], 'Variable'),
    F.int('vBegin', 'Valor al inicio', 0, 0, 65535, 'Ajuste'),
    F.int('vEnd', 'Valor al final', 100, 0, 65535, 'Ajuste'),
    ...touchCommon(),
  ],
  vpFields: [{ key: 'vp', words: () => 1 }],
  encode(c, ctx) {
    const p = c.props;
    const b = touchBase(c, ctx, 32, fe(p, 0x03));
    const mode = (num(p, 'adjMode') | num(p, 'vpFormat')) & 0xff;
    const x2 = clampX(right(c), ctx);
    const y2 = clampY(bottom(c), ctx);
    b.u8(16, CONST).u16(17, vp(p, 'vp')).u8(19, mode);
    b.u16(20, c.x).u16(22, c.y).u16(24, x2).u16(26, y2);
    // La zona táctil se amplía 32 px a cada lado del eje de ajuste.
    let tx1: number, ty1: number, tx2: number, ty2: number;
    if ((mode & 0xf) === 0) {
      tx1 = Math.max(0, c.x - 32);
      ty1 = c.y;
      tx2 = Math.min(ctx.width, x2 + 32);
      ty2 = y2;
    } else {
      tx1 = c.x;
      ty1 = Math.max(0, c.y - 32);
      tx2 = x2;
      ty2 = Math.min(ctx.height, y2 + 32);
    }
    b.u16(2, tx1).u16(4, ty1).u16(6, tx2).u16(8, ty2);
    b.u16(28, num(p, 'vBegin')).u16(30, num(p, 'vEnd'));
    return b.b;
  },
  preview: () => ({ style: 'slider', value: 0.5 }),
};

const rtcInput: ControlDef = {
  type: 'rtcInput',
  kind: 'touch',
  label: 'Ajuste de fecha y hora',
  legacy: 'RtcInput',
  category: 'Entradas',
  icon: 'CalendarCog',
  description: 'Abre un teclado para poner en hora el reloj interno.',
  defaultSize: { w: 220, h: 40 },
  fields: [
    F.bool('showAuto', 'Eco dentro del control', true, 'Eco'),
    { ...F.int('showX', 'Eco: posición X', 0, 0, 65535, 'Eco'), showIf: (p) => !bool(p, 'showAuto') },
    { ...F.int('showY', 'Eco: posición Y', 0, 0, 65535, 'Eco'), showIf: (p) => !bool(p, 'showAuto') },
    F.color('showColor', 'Eco: color', 0xffff, 'Eco'),
    F.font('fontId', 'Eco: fuente (ID)', 0),
    F.int('fontHor', 'Eco: ancho de carácter (px)', 12, 0, 255, 'Eco'),
    F.int('cursorColor', 'Color del cursor', 0, 0, 255, 'Eco'),
    ...kbFields(),
    ...touchCommon(),
  ],
  encode(c, ctx) {
    const p = c.props;
    const b = touchBase(c, ctx, 48, fe(p, 0x04));
    b.u8(16, CONST).u16(20, bool(p, 'showAuto') ? c.x + 4 : num(p, 'showX')).u16(22, bool(p, 'showAuto') ? c.y + 4 : num(p, 'showY'));
    b.u16(24, num(p, 'showColor')).u8(26, num(p, 'fontId')).u8(27, num(p, 'fontHor')).u8(28, num(p, 'cursorColor'));
    b.u8(29, num(p, 'kbSource')).u16(30, num(p, 'picKb')).u8(32, 0xfe);
    b.u16(33, num(p, 'kbX1')).u16(35, num(p, 'kbY1'));
    b.u16(37, clampX(num(p, 'kbX2'), ctx)).u16(39, clampY(num(p, 'kbY2'), ctx));
    b.u16(41, clampX(num(p, 'kbPosX'), ctx)).u16(43, clampY(num(p, 'kbPosY'), ctx));
    return b.b;
  },
  preview: () => ({ style: 'box', text: '⏱ poner en hora' }),
};

const paramConfig: ControlDef = {
  type: 'paramConfig',
  kind: 'touch',
  label: 'Escritura de parámetros',
  legacy: 'ParamCofig',
  category: 'Botones',
  icon: 'Settings2',
  description: 'Al tocar, escribe una secuencia de datos fija (configuración del sistema).',
  defaultSize: { w: 120, h: 48 },
  fields: [
    F.int('vpMode', 'Modo', 0, 0, 255, 'Datos'),
    { key: 'dataPack', label: 'Datos (hex)', type: 'hex', default: '', group: 'Datos', help: 'Hasta 14 bytes.' },
    ...touchCommon(),
  ],
  encode(c, ctx) {
    const p = c.props;
    const b = touchBase(c, ctx, 32, fe(p, 0x07));
    b.u8(16, CONST).u8(17, num(p, 'vpMode'));
    let hex = str(p, 'dataPack').replace(/[^0-9a-fA-F]/g, '');
    if (hex.length % 2) hex = '0' + hex;
    b.hex(18, hex, 31);
    return b.b;
  },
  preview: () => ({ style: 'button', text: '⚙ parámetros' }),
};

const keyDoRet: ControlDef = {
  type: 'keyDoRet',
  kind: 'touch',
  label: 'Copia de datos al presionar/soltar',
  legacy: 'Key_DO_Ret',
  category: 'Botones',
  icon: 'Copy',
  description: 'Copia bloques de variables al presionar, mantener y soltar el botón.',
  defaultSize: { w: 120, h: 48 },
  fields: [
    F.int('tpOn', 'Al presionar: activado', 1, 0, 255, 'Al presionar'),
    { key: 'vp1s', label: 'Al presionar: VP origen', type: 'vp', default: '0000', group: 'Al presionar' },
    { key: 'vp1t', label: 'Al presionar: VP destino', type: 'vp', default: '0000', group: 'Al presionar' },
    F.int('len1', 'Al presionar: palabras', 0, 0, 255, 'Al presionar'),
    { key: 'ini1', label: 'Al presionar: datos origen (hex)', type: 'hex', default: '', group: 'Al presionar' },
    F.int('tpOnC', 'Mantener: activado', 0, 0, 255, 'Mantener'),
    { key: 'vp2s', label: 'Mantener: VP origen', type: 'vp', default: '0000', group: 'Mantener' },
    { key: 'vp2t', label: 'Mantener: VP destino', type: 'vp', default: '0000', group: 'Mantener' },
    F.int('len2', 'Mantener: palabras', 0, 0, 255, 'Mantener'),
    { key: 'ini2', label: 'Mantener: datos origen (hex)', type: 'hex', default: '', group: 'Mantener' },
    F.int('tpOff', 'Al soltar: activado', 0, 0, 255, 'Al soltar'),
    { key: 'vp3s', label: 'Al soltar: VP origen', type: 'vp', default: '0000', group: 'Al soltar' },
    { key: 'vp3t', label: 'Al soltar: VP destino', type: 'vp', default: '0000', group: 'Al soltar' },
    F.int('len3', 'Al soltar: palabras', 0, 0, 255, 'Al soltar'),
    { key: 'ini3', label: 'Al soltar: datos origen (hex)', type: 'hex', default: '', group: 'Al soltar' },
    ...touchCommon().filter((f) => f.key !== 'noPressEffect'),
  ],
  encode(c, ctx) {
    const p = c.props;
    const b = touchBase(c, ctx, 48, 0xfe08);
    b.u8(14, 0xfe).u8(15, 0x08);
    b.u8(16, 0xfe).u8(17, num(p, 'tpOn')).u16(18, vp(p, 'vp1s')).u16(20, vp(p, 'vp1t')).u8(22, 0).u8(23, num(p, 'len1'));
    b.u8(24, 0xfe).u8(25, num(p, 'tpOnC')).u16(26, vp(p, 'vp2s')).u16(28, vp(p, 'vp2t')).u8(30, 0).u8(31, num(p, 'len2'));
    b.u8(32, 0xfe).u8(33, num(p, 'tpOff')).u16(34, vp(p, 'vp3s')).u16(36, vp(p, 'vp3t')).u8(38, 0).u8(39, num(p, 'len3'));
    b.u8(40, 0);
    return b.b;
  },
  init(c) {
    const p = c.props;
    const out: InitEntry[] = [];
    for (const [k, v] of [['ini1', 'vp1s'], ['ini2', 'vp2s'], ['ini3', 'vp3s']] as const) {
      const hex = str(p, k).replace(/[^0-9a-fA-F]/g, '');
      if (!hex) continue;
      const bytes = new Uint8Array(Math.floor(hex.length / 2));
      for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      out.push({ vp: vp(p, v), bytes });
    }
    return out;
  },
  preview: () => ({ style: 'button', text: '⇅ copiar' }),
};

const rotateAdjust: ControlDef = {
  type: 'rotateAdjust',
  kind: 'touch',
  label: 'Perilla giratoria táctil',
  legacy: 'Rotateadjust',
  category: 'Entradas',
  icon: 'RotateCw',
  description: 'Gira el dedo sobre un anillo para ajustar el valor.',
  defaultSize: { w: 200, h: 200 },
  fields: [
    F.vp(),
    F.int('dataFormat', 'Formato de datos', 0, 0, 255, 'Variable'),
    F.int('r0', 'Radio interior (px)', 40, 0, 65535, 'Anillo'),
    F.int('r1', 'Radio exterior (px)', 100, 0, 65535, 'Anillo'),
    F.int('a0', 'Ángulo inicial (×0.5°)', 0, 0, 720, 'Anillo'),
    F.int('a1', 'Ángulo final (×0.5°)', 540, 0, 720, 'Anillo'),
    F.int('vBegin', 'Valor inicial', 0, 0, 65535, 'Anillo'),
    F.int('vEnd', 'Valor final', 100, 0, 65535, 'Anillo'),
    ...touchCommon(),
  ],
  vpFields: [{ key: 'vp', words: () => 1 }],
  encode(c, ctx) {
    const p = c.props;
    const b = touchBase(c, ctx, 48, fe(p, 0x09));
    const cx = c.x + Math.trunc(c.w / 2);
    const cy = c.y + Math.trunc(c.h / 2);
    b.u8(16, CONST).u16(17, vp(p, 'vp')).u8(19, num(p, 'dataFormat')).u16(20, cx).u16(22, cy);
    b.u16(24, num(p, 'r0')).u16(26, num(p, 'r1')).u16(28, num(p, 'a0')).u16(30, num(p, 'vBegin'));
    b.u8(32, CONST).u16(33, num(p, 'a1')).u16(35, num(p, 'vEnd'));
    return b.b;
  },
  preview: () => ({ style: 'clock' }),
};

const slideAdjust: ControlDef = {
  type: 'slideAdjust',
  kind: 'touch',
  label: 'Ajuste por deslizamiento',
  legacy: 'SwipeAdjust',
  category: 'Entradas',
  icon: 'Hand',
  description: 'Deslizar el dedo suma o resta según la distancia recorrida.',
  defaultSize: { w: 240, h: 120 },
  fields: [
    F.vp(),
    F.int('adjMode', 'Modo', 0, 0, 255, 'Ajuste'),
    F.int('stepDis', 'Distancia por paso (px)', 10, 0, 255, 'Ajuste'),
    ...touchCommon(),
  ],
  vpFields: [{ key: 'vp', words: () => 1 }],
  encode(c, ctx) {
    const p = c.props;
    const b = touchBase(c, ctx, 32, fe(p, 0x0a));
    b.u8(16, CONST).u16(17, vp(p, 'vp')).u8(19, num(p, 'adjMode')).u8(20, num(p, 'stepDis'));
    return b.b;
  },
  preview: () => ({ style: 'box', text: '⇆ deslizar' }),
};

const pageSlide: ControlDef = {
  type: 'pageSlide',
  kind: 'touch',
  label: 'Deslizar entre páginas',
  legacy: 'SwipePage',
  category: 'Navegación',
  icon: 'GalleryHorizontal',
  description: 'Cambia a la página anterior/siguiente deslizando el dedo.',
  defaultSize: { w: 400, h: 240 },
  fields: [
    F.int('picPre', 'Página anterior', 0, 0, 65535, 'Páginas'),
    F.int('picNextOne', 'Página siguiente', 1, 0, 65535, 'Páginas'),
    F.enumf('adjMode', 'Dirección', 0, [
      { value: 0, label: 'Horizontal' },
      { value: 1, label: 'Vertical' },
    ], 'Páginas'),
    F.int('pushSpeed', 'Velocidad', 10, 0, 255, 'Animación'),
    F.int('pushDis', 'Distancia mínima (px)', 50, 0, 65535, 'Animación'),
    F.int('dateReturn', 'Retorno de datos', 0, 0, 127, 'Animación'),
    F.int('endAnimation', 'Animación final', 0, 0, 255, 'Animación'),
    ...touchCommon(),
  ],
  encode(c, ctx) {
    const p = c.props;
    const b = touchBase(c, ctx, 32, fe(p, 0x0b));
    const mode = num(p, 'adjMode');
    b.u8(16, CONST).u16(17, num(p, 'picPre')).u16(19, num(p, 'picNextOne'));
    if (mode === 0) {
      b.u8(21, b.b[4]).u8(22, b.b[5]).u16(23, clampY(bottom(c), ctx));
    } else {
      b.u16(21, c.x).u16(23, clampX(right(c), ctx));
    }
    b.u8(25, num(p, 'pushSpeed')).u16(26, num(p, 'pushDis'));
    b.u8(28, (mode << 7) + num(p, 'dateReturn')).u8(29, num(p, 'endAnimation'));
    return b.b;
  },
  preview: () => ({ style: 'box', text: '⟵ deslizar página ⟶' }),
};

const iconDrag: ControlDef = {
  type: 'iconDrag',
  kind: 'touch',
  label: 'Arrastrar icono',
  legacy: 'ICONDragManager',
  category: 'Entradas',
  icon: 'Grab',
  description: 'Permite arrastrar un icono/página con el dedo (desplazamiento de imagen).',
  defaultSize: { w: 240, h: 160 },
  fields: [
    F.vp(),
    F.int('adjMode', 'Modo', 0, 0, 255, 'Arrastre'),
    F.int('tpPageIcon', 'Página/icono', 0, 0, 65535, 'Arrastre'),
    F.int('speed', 'Velocidad de deslizamiento', 10, 0, 255, 'Arrastre'),
    ...touchCommon().filter((f) => !['picNext', 'picOn'].includes(f.key)),
  ],
  vpFields: [{ key: 'vp', words: () => 4 }],
  encode(c, ctx) {
    const p = c.props;
    const b = touchBase(c, ctx, 32, fe(p, 0x0c));
    b.u8(10, 0xff).u8(11, 0xff).u8(12, 0xff).u8(13, 0xff);
    b.u8(16, CONST).u16(17, vp(p, 'vp')).u8(19, num(p, 'adjMode')).u16(20, num(p, 'tpPageIcon')).u8(22, num(p, 'speed'));
    return b.b;
  },
  preview: () => ({ style: 'box', text: '✋ arrastrar' }),
};

const bitButton: ControlDef = {
  type: 'bitButton',
  kind: 'touch',
  label: 'Botón de bit',
  legacy: 'BitButton',
  category: 'Botones',
  icon: 'ToggleLeft',
  description: 'Activa, desactiva o invierte un bit de la variable (interruptor).',
  defaultSize: { w: 100, h: 48 },
  fields: [
    F.vp(),
    F.int('bitPos', 'Bit (0-15)', 0, 0, 15, 'Bit'),
    F.enumf('adjMode', 'Acción', 2, [
      { value: 0, label: 'Poner a 0' },
      { value: 1, label: 'Poner a 1' },
      { value: 2, label: 'Invertir' },
      { value: 3, label: 'Pulsador (1 al presionar, 0 al soltar)' },
    ], 'Bit'),
    ...touchCommon(),
  ],
  vpFields: [{ key: 'vp', words: () => 1 }],
  encode(c, ctx) {
    const p = c.props;
    const b = touchBase(c, ctx, 32, fe(p, 0x0d));
    b.u8(16, 0xfe).u16(17, vp(p, 'vp')).u8(19, num(p, 'bitPos')).u8(20, num(p, 'adjMode'));
    return b.b;
  },
  preview: (c) => ({ style: 'button', text: `bit ${c.props.bitPos}` }),
};

export const TOUCH_CONTROLS: ControlDef[] = [
  basicTouch,
  keyReturn,
  incAdjust,
  bitButton,
  paramConfig,
  keyDoRet,
  dataInput,
  textInput,
  gbkInput,
  popMenu,
  rtcInput,
  dragAdjust,
  rotateAdjust,
  slideAdjust,
  iconDrag,
  pageSlide,
];
