// Lectura de bloques de 13TouchFile.bin y 14ShowFile.bin (inversa de display.ts y touch.ts).
// Cada decodificador devuelve la geometría y las propiedades; al volver a codificar
// el control se obtienen los mismos bytes.

import { toHex } from '../bytes';
import type { Props, Rect } from '../types';

export interface Decoded {
  type: string;
  rect: Rect;
  props: Props;
}

type R = ReturnType<typeof reader>;

export function reader(b: Uint8Array) {
  return {
    b,
    u8: (i: number) => b[i],
    u16: (i: number) => (b[i] << 8) | b[i + 1],
    s16: (i: number) => (((b[i] << 8) | b[i + 1]) << 16) >> 16,
    u32: (i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3],
    s32: (i: number) => (b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3],
    vp: (i: number) => toHex((b[i] << 8) | b[i + 1]),
    ascii: (i: number, n: number) => String.fromCharCode(...b.slice(i, i + n)),
    hex: (i: number, j: number) => {
      let end = j;
      while (end > i && b[end - 1] === 0) end--;
      return Array.from(b.slice(i, end), (x) => x.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    },
  };
}

const pct = (v: number) => Math.round((v * 100) / 255);
const backMode = (v: number) => (v > 0 ? v - 1 : 0);
const box = (x1: number, y1: number, x2: number, y2: number): Rect => ({ x: x1, y: y1, w: Math.max(4, x2 - x1), h: Math.max(4, y2 - y1) });
const at = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

// ------------------------------------------------------------------ visualización

const sp = (r: R) => ({ sp: r.vp(2) });

function iconCommon(r: R, base: number) {
  // base = posición del byte iconLib
  return {
    iconLib: r.u8(base),
    mode: r.u8(base + 1),
    backMode: backMode(r.u8(base + 2)),
    iconLight: pct(r.u8(base + 3)),
    backLight: pct(r.u8(base + 4)),
    filter: r.u8(base + 5),
  };
}

const displayDecoders: Record<number, (r: R) => Decoded | null> = {
  0x00: (r) => {
    const multi = r.u8(26) === 0x5a && r.u8(31) === 1;
    return {
      type: multi ? 'multiLanguage' : 'iconVar',
      rect: at(r.u16(8), r.u16(10), 64, 64),
      props: {
        ...sp(r),
        vp: r.vp(6),
        vMin: r.u16(12),
        vMax: r.u16(14),
        iconMin: r.u16(16),
        iconMax: r.u16(18),
        ...iconCommon(r, 20),
        ...(multi ? {} : { groupEnable: r.u8(26) === 0x5a }),
        onPopMenu: r.u8(0) === 0x5f,
      },
    };
  },
  0x01: (r) => ({
    type: 'animIcon',
    rect: at(r.u16(8), r.u16(10), 64, 64),
    props: {
      ...sp(r),
      vp: r.vp(6),
      restartMode: r.u16(12),
      vStop: r.u16(14),
      vStart: r.u16(16),
      iconStop: r.u16(18),
      iconStart: r.u16(20),
      iconEnd: r.u16(22),
      iconLib: r.u8(24),
      mode: r.u8(25),
      backMode: backMode(r.u8(26)),
      iconLight: pct(r.u8(27)),
      backLight: pct(r.u8(28)),
      showTime: r.u8(29),
      showMode: r.u8(30),
      filter: r.u8(31),
    },
  }),
  0x02: (r) => {
    const vertical = r.u8(21) !== 0;
    const a = r.u16(12);
    const bEnd = r.u16(14);
    const y = r.u16(18);
    return {
      type: 'sliderShow',
      rect: vertical ? box(y, a, y + 40, bEnd) : box(a, y, bEnd, y + 40),
      props: {
        ...sp(r),
        vp: r.vp(6),
        vBegin: r.u16(8),
        vEnd: r.u16(10),
        iconId: r.u16(16),
        xAdj: r.u8(20),
        dir: r.u8(21),
        iconLib: r.u8(22),
        iconMode: r.u8(23),
        vpMode: r.u8(24),
        backMode: backMode(r.u8(25)),
        iconLight: pct(r.u8(26)),
        backLight: pct(r.u8(27)),
        filter: r.u8(28),
      },
    };
  },
  0x03: (r) => {
    const align = r.u8(19) & 0x7f;
    const x = r.u16(8);
    const w = 160;
    return {
      type: 'artVar',
      rect: at(align === 1 ? x - w : align === 2 ? x - w / 2 : x, r.u16(10), w, 48),
      props: {
        ...sp(r),
        vp: r.vp(6),
        icon0: r.u16(12),
        iconLib: r.u8(14),
        iconMode: r.u8(15),
        nInt: r.u8(16),
        nDot: r.u8(17),
        varType: r.u8(18),
        align,
        show0: (r.u8(19) & 0x80) !== 0,
        backMode: backMode(r.u8(20)),
        iconLight: pct(r.u8(21)),
        backLight: pct(r.u8(22)),
        filter: r.u8(23),
      },
    };
  },
  0x04: (r) => ({
    type: 'imageAnim',
    rect: at(0, 0, 200, 120),
    props: { ...sp(r), picBegin: r.u16(8), picEnd: r.u16(10), frameTime: r.u8(12), iclLib: r.u8(13), picEndExp: r.u16(14) },
  }),
  0x05: (r) => ({
    type: 'iconRotate',
    rect: at(r.u16(14), r.u16(16), 160, 160),
    props: {
      ...sp(r),
      vp: r.vp(6),
      iconId: r.u16(8),
      iconXc: r.u16(10),
      iconYc: r.u16(12),
      vBegin: r.u16(18),
      vEnd: r.u16(20),
      alBegin: r.u16(22),
      alEnd: r.u16(24),
      vpMode: r.u8(26),
      iconLib: r.u8(27),
      mode: r.u8(28),
      filter: r.u8(29),
    },
  }),
  0x06: (r) => ({
    type: 'bitIcon',
    rect: at(r.u16(24), r.u16(26), 64, 64),
    props: {
      ...sp(r),
      vp: r.vp(6),
      vpAux: r.vp(8),
      bitMask: r.u16(10),
      displayMode: r.u8(12),
      moveMode: r.u8(13),
      iconMode: r.u8(14),
      iconLib: r.u8(15),
      icon0s: r.u16(16),
      icon0e: r.u16(18),
      icon1s: r.u16(20),
      icon1e: r.u16(22),
      disMov: r.u16(28),
      filter: r.u8(30),
    },
  }),
  0x07: (r) => ({
    type: 'iconPan',
    rect: box(r.u16(14), r.u16(16), r.u16(18), r.u16(20)),
    props: { ...sp(r), vp: r.vp(6), iconLib: r.u8(8), mode: r.u8(9), filter: r.u8(10), moveMode: r.u8(11), iconId: r.u16(12) },
  }),
  0x08: (r) => ({
    type: 'iconOverlay',
    rect: at(r.u16(8), r.u16(10), r.u16(12), r.u16(14)),
    props: { ...sp(r), vp: r.vp(6), iconLight: r.u8(16), mode: r.u8(17), filter: r.u8(18), jpgFormat: r.u8(19) >> 7, vpAddr: r.u8(19) & 0x7f },
  }),
  0x09: (r) => ({
    type: 'batchIcon',
    rect: box(r.u16(24), r.u16(26), r.u16(28), r.u16(30)),
    props: { ...sp(r), vp: r.vp(6), vp1: r.vp(8), vp2: r.vp(10), dataNum: r.u16(12), iconSource: r.u8(14), iconLib: r.u8(15), iconId: r.u16(16) },
  }),
  0x10: (r) => {
    let len = 0;
    while (len < 11 && r.u8(21 + len)) len++;
    const vLen = r.u8(20);
    const fontSize = r.u8(15) || 16;
    const nInt = r.u8(17);
    const nDot = r.u8(18);
    const chars = nInt + nDot + (nDot ? 1 : 0) + len;
    return {
      type: 'dataVar',
      rect: at(r.u16(8), r.u16(10), Math.max(16, chars * fontSize), fontSize * 2),
      props: {
        ...sp(r),
        vp: r.vp(6),
        color: r.u16(12),
        fontId: r.u8(14),
        fontSize,
        modify: (r.u8(16) & 0x80) !== 0,
        zeroDisplay: (r.u8(16) & 0x40) !== 0,
        align: r.u8(16) & 0x3f,
        nInt,
        nDot,
        varType: r.u8(19),
        unit: r.ascii(21, len),
        unitLen: vLen === len ? -1 : vLen,
        onPopMenu: r.u8(0) === 0x5f,
      },
    };
  },
  0x11: (r) => ({
    type: 'text',
    rect: box(r.u16(14), r.u16(16), r.u16(18), r.u16(20)),
    props: {
      ...sp(r),
      vp: r.vp(6),
      color: r.u16(12),
      textLength: r.u16(22),
      font0: r.u8(24),
      font1: r.u8(25),
      fontX: r.u8(26),
      fontY: r.u8(27),
      encoding: r.u8(28) & 0x0f,
      vAlign: (r.u8(28) >> 4) & 1,
      align: (r.u8(28) >> 5) & 3,
      adjust: (r.u8(28) & 0x80) !== 0,
      horDis: r.u8(29),
      verDis: r.u8(30),
      onPopMenu: r.u8(0) === 0x5f,
    },
  }),
  0x12: (r) => {
    if (r.u16(6) === 1) {
      return {
        type: 'clock',
        rect: at(r.u16(8), r.u16(10), 200, 200),
        props: {
          ...sp(r),
          iconHour: r.u16(12),
          iconHourXc: r.u16(14),
          iconHourYc: r.u16(16),
          iconMinute: r.u16(18),
          iconMinuteXc: r.u16(20),
          iconMinuteYc: r.u16(22),
          iconSecond: r.u16(24),
          iconSecondXc: r.u16(26),
          iconSecondYc: r.u16(28),
          iconLib: r.u8(30),
        },
      };
    }
    let end = 16;
    while (end < 32 && r.u8(end)) end++;
    const fontSize = r.u8(15) || 12;
    const format = r.ascii(16, end - 16);
    return {
      type: 'rtc',
      rect: at(r.u16(8), r.u16(10), Math.max(40, format.length * fontSize), fontSize * 2),
      props: { ...sp(r), color: r.u16(12), modify: (r.u8(14) & 0x80) !== 0, fontId: r.u8(14) & 0x7f, fontSize, format },
    };
  },
  0x13: (r) => {
    const fontSize = r.u8(16) || 24;
    return {
      type: 'hexVar',
      rect: at(r.u16(8), r.u16(10), 160, fontSize),
      props: {
        ...sp(r),
        vp: r.vp(6),
        color: r.u16(12),
        byteNum: r.u8(14) & 0x0f,
        bcd: (r.u8(14) & 0x80) !== 0,
        fontId: r.u8(15),
        fontSize,
        separators: r.hex(17, 32).replace(/ /g, ''),
      },
    };
  },
  0x14: (r) => ({
    type: 'rollText',
    rect: box(r.u16(14), r.u16(16), r.u16(18), r.u16(20)),
    props: {
      ...sp(r),
      vp: r.vp(6),
      rollingMode: r.u8(8),
      rollingDis: r.u8(9),
      adjustMode: r.u8(10),
      runControl: r.u8(11),
      color: r.u16(12),
      font0: r.u8(22),
      font1: r.u8(23),
      fontX: r.u8(24),
      fontY: r.u8(25),
      encoding: r.u8(26),
      horDis: r.u8(27),
      speed: r.u8(28),
    },
  }),
  0x16: (r) => ({
    type: 'textII',
    rect: box(r.u16(16), r.u16(18), r.u16(20), r.u16(22)),
    props: {
      ...sp(r),
      vp: r.vp(6),
      color: r.u16(12),
      textLength: r.u16(24),
      fontId: r.u16(26),
      disAdjust: (r.u8(28) & 0x80) !== 0,
      fontHeight: Math.round(((r.u8(28) & 0x7f) * 100) / 16),
      horDis: r.u8(29),
      verDis: r.u8(30),
      align: r.u8(31),
    },
  }),
  0x20: (r) => ({
    type: 'curve',
    rect: box(r.u16(8), r.u16(10), r.u16(12), r.u16(14)),
    props: {
      ...sp(r),
      moveDir: r.u8(6),
      displayMode: (r.u8(7) & 0x80) !== 0,
      colorMode: (r.u8(7) & 0x40) !== 0 ? 1 : 0,
      yCentral: r.u16(16),
      vdCentral: r.u16(18),
      ...((r.u8(7) & 0x40) !== 0 ? { colorVp: r.vp(20) } : { color: r.u16(20) }),
      mulY: r.u16(22),
      channel: r.u8(24),
      disHor: r.u8(25),
      pixelScale: r.u8(26),
    },
  }),
  0x21: (r) => ({
    type: 'basicGraphics',
    rect: box(r.u16(8), r.u16(10), r.u16(12), r.u16(14)),
    props: { ...sp(r), vp: r.vp(6), dashed: r.u8(16), format1: r.u8(17), format2: r.u8(18), format3: r.u8(19), format4: r.u8(20) },
  }),
  0x22: (r) => {
    const e = r.u8(13);
    return {
      type: 'table',
      rect: box(r.u16(14), r.u16(16), r.u16(18), r.u16(20)),
      props: {
        ...sp(r),
        vp: r.vp(6),
        cols: r.u8(8),
        rows: r.u8(9),
        colStart: r.u8(10),
        rowStart: r.u8(11),
        unitBytes: r.u8(12),
        encoding: e & 0x1f,
        noBorder: (e & 0x20) !== 0,
        autoFormat: (e & 0x40) === 0,
        charSpacing: (e & 0x80) === 0,
        lineColor: r.u16(22),
        textColor: r.u16(24),
        font0: r.u8(26),
        font1: r.u8(27),
        fontX: r.u8(28),
        fontY: r.u8(29),
        colAdjust: r.u8(30),
      },
    };
  },
  0x23: (r) => {
    if (r.u8(5) === 1) return { type: 'industry', rect: at(0, 0, 160, 80), props: { ...sp(r), vp: r.vp(6) } };
    const f = r.u8(26);
    return {
      type: 'progressBar',
      rect: box(r.u16(8), r.u16(10), r.u16(12), r.u16(14)),
      props: {
        ...sp(r),
        vp: r.vp(6),
        borderColor: r.u16(16),
        foreColor: r.u16(18),
        backColor: r.u16(20),
        vMax: r.u16(22),
        vMin: r.u16(24),
        showRate: (f & 0x80) !== 0,
        fillBack: (f & 2) === 0,
        showBorder: (f & 1) === 0,
        orientation: r.u8(27),
        varType: r.u8(28),
        vpRt: r.vp(30),
      },
    };
  },
  0x25: (r) => ({
    type: 'qrCode',
    rect: at(r.u16(8), r.u16(10), 120, 120),
    props: {
      ...sp(r),
      vp: r.vp(6),
      byteNum: r.u8(13),
      fixMode: r.u8(14),
      displayMode: (r.u8(15) & 0x80) !== 0,
      bgColor: r.u16(16),
      codeColor: r.u16(18),
    },
  }),
  0x30: (r) => ({
    type: 'dataTransmit',
    rect: box(r.u16(10), r.u16(12), r.u16(14), r.u16(16)),
    props: { ...sp(r), vp: r.vp(6), autoCom: r.u8(8) === 0xff, code: r.hex(18, 32) },
  }),
};

// Controles que el codificador guarda por su centro o por un borde: se elige un tamaño
// que reproduce exactamente ese punto al volver a codificar.
function around(c: number, size: number): [number, number] {
  return c >= size / 2 ? [c - size / 2, size] : [0, 2 * c + 1];
}

Object.assign(displayDecoders, {
  // Ventana de datos (rodillo): el bloque guarda el centro.
  0x15: (r: R): Decoded => {
    const [x, w] = around(r.u16(16), 160);
    const [y, h] = around(r.u16(18), 120);
    return {
      type: 'dataWindow',
      rect: at(x, y, w, h),
      props: {
        ...sp(r),
        vp: r.vp(6),
        vMin: r.s16(8),
        vMax: r.s16(10),
        nInt: r.u8(12),
        nDot: r.u8(13),
        nDigit: r.u8(14),
        displayMode: r.u8(15),
        step: r.u16(20),
        font0X: r.u8(22),
        font0Y: r.u8(23),
        font0Color: r.u16(24),
        font1X: r.u8(26),
        font1Y: r.u8(27),
        font1Color: r.u16(28),
        fontId: r.u8(30),
      },
    };
  },
  // Selector de rodillo: x según la alineación, y en el centro.
  0x17: (r: R): Decoded => {
    const dataType = r.u8(8) >> 4;
    const f16 = r.u8(16);
    const align = f16 & 3;
    const px = r.u16(20);
    const [y, h] = around(r.u16(22), 160);
    let x = px;
    let w = 160;
    if (align === 0) [x, w] = around(px, 160);
    else if (align === 2) [x, w] = [px - Math.min(160, px), Math.min(160, px)];
    const text = dataType === 15;
    return {
      type: 'rollerChar',
      rect: at(x, y, w, h),
      props: {
        ...sp(r),
        vp: r.vp(6),
        dataType,
        dataLine: (r.u8(8) & 0x0f) * 2 + 1,
        ...(text ? { charLen: r.u8(9), vpString: r.vp(10) } : { nInt: r.u8(9) >> 4, nDot: r.u8(9) & 0x0f, dataGap: r.u16(10) }),
        vMin: r.u16(12),
        vMax: r.u16(14),
        align,
        displayBk: (f16 & 0x04) !== 0,
        displayAddMode: (f16 & 0x08) !== 0,
        fontSet0: (f16 >> 4) & 7,
        display0: (f16 & 0x80) !== 0,
        speed: r.u8(17) & 0x3f,
        changeSpeed: r.u8(17) >> 6,
        fontId: r.u16(18),
        lineGap0: r.u8(24),
        lineGap1: r.u8(25),
        lineGap2: r.u8(26),
        lineGap3: r.u8(27),
        dim1: r.u8(28),
        lineHeight0: r.u8(29),
        font1: r.u8(30) >> 4,
        font2: r.u8(30) & 0x0f,
        font3: r.u8(31) >> 4,
        font4: r.u8(31) & 0x0f,
      },
    };
  },
  0x18: (r: R): Decoded => ({
    type: 'gtf',
    rect: box(r.u16(16), r.u16(18), r.u16(20), r.u16(22)),
    props: {
      ...sp(r),
      vp: r.vp(6),
      gtfId: r.u16(8),
      fontId: r.u16(10),
      horDis: r.u8(24),
      verDis: r.u8(25),
      align: r.u8(26) & 0x1f,
      backSet: (r.u8(26) & 0x80) !== 0,
      reload: (r.u8(26) & 0x40) !== 0,
      icoRecover: (r.u8(26) & 0x20) !== 0,
    },
  }),
  0x24: (r: R): Decoded => ({
    type: 'zoneScroll',
    rect: box(r.u16(8), r.u16(10), r.u16(12), r.u16(14)),
    props: { ...sp(r), vp: r.vp(6), disMove: r.u16(16), modeMove: r.u8(18) },
  }),
  0x26: (r: R): Decoded => ({
    type: 'zoneBrightness',
    rect: box(r.u16(8), r.u16(10), r.u16(12), r.u16(14)),
    props: { ...sp(r), vp: r.vp(6) },
  }),
  // 0x31 lo comparten la cámara (FF FF FF FF 5A en 16–20) y el video.
  0x31: (r: R): Decoded => {
    const rect = at(r.u16(8), r.u16(10), r.u16(12), r.u16(14));
    const cam = r.u8(16) === 0xff && r.u8(17) === 0xff && r.u8(18) === 0xff && r.u8(19) === 0xff && r.u8(20) === 0x5a;
    if (cam)
      return {
        type: 'camera',
        rect,
        props: {
          ...sp(r),
          vpImage: r.vp(6),
          cameraId: r.u8(21),
          light: (r.u8(22) & 0x80) !== 0,
          mirror: (r.u8(22) & 0x40) !== 0,
          adjustMode: r.u8(23) ? 1 : 0,
          lightSet: r.u8(23),
          resolution: r.u8(24),
          displayScale: r.u8(25),
        },
      };
    return {
      type: 'video',
      rect,
      props: { ...sp(r), vp: r.vp(6), fps: r.u8(16), type: r.u8(17), iclId: r.u16(18), waeId: r.u16(20) },
    };
  },
});

/** Tipos cuyo decodificador se comprueba volviendo a codificar; si no coincide, se importa el bloque original. */
export const CHECKED_DISPLAY = new Set(['dataWindow', 'rollerChar', 'gtf', 'zoneScroll', 'zoneBrightness', 'camera', 'video']);

export function decodeDisplay(block: Uint8Array): Decoded | null {
  if (block[0] !== 0x5a && block[0] !== 0x5f) return null;
  const fn = displayDecoders[block[1]];
  return fn ? fn(reader(block)) : null;
}

// ------------------------------------------------------------------ táctiles

/** Tamaño del bloque táctil según su código. */
export function touchBlockSize(b: Uint8Array, at: number): number {
  const hi = b[at + 14];
  const lo = b[at + 15];
  if (hi !== 0xfe && hi !== 0xfd) return 16;
  return ({ 0: 64, 1: 48, 4: 48, 6: 64, 8: 48, 9: 48 } as Record<number, number>)[lo] ?? 32;
}

function touchCommon(r: R): { rect: Rect; props: Props; pageId: number } {
  const keying = r.u8(2) === 0xff && r.u8(6) === 0xff;
  const props: Props = {
    picNext: r.u8(10) === 0xff ? -1 : r.u16(10),
    picOn: r.u8(12) === 0xff ? -1 : r.u16(12),
    noPressEffect: r.u8(14) !== 0xfd,
    ivrCode: r.u8(0) >> 2,
    keying,
  };
  if (keying) props.keyCode = r.u8(7);
  const rect = keying ? at(0, 0, 60, 40) : box(r.u16(2), r.u16(4), r.u16(6), r.u16(8));
  return { rect, props, pageId: ((r.u8(0) & 3) << 8) | r.u8(1) };
}

const kb = (r: R, a: number) => ({
  kbSource: r.u8(a),
  picKb: r.u16(a + 1),
  kbX1: r.u16(a + 3),
  kbY1: r.u16(a + 5),
  kbX2: r.u16(a + 7),
  kbY2: r.u16(a + 9),
  kbPosX: r.u16(a + 11),
  kbPosY: r.u16(a + 13),
});

type TD = { type: string; props: Props; rect?: Rect };
const touchDecoders: Record<number, (r: R, rect: Rect) => TD> = {
  0x00: (r) => ({
    type: 'dataInput',
    props: {
      vp: r.vp(17),
      varType: r.u8(19),
      nInt: r.u8(20),
      nDot: r.u8(21),
      showAuto: false,
      showX: r.u16(22),
      showY: r.u16(24),
      showColor: r.u16(26),
      fontId: r.u8(28),
      fontHor: r.u8(29),
      cursorColor: r.u8(30),
      hide: r.u8(31) !== 0,
      ...kb(r, 33),
      limits: r.u8(49),
      vMin: r.s32(50),
      vMax: r.s32(54),
      returnSet: r.u8(58) !== 0,
      returnVp: r.vp(59),
      returnData: r.u16(61),
      layerGamma: pct(r.u8(63)),
    },
  }),
  0x01: (r) => ({
    type: 'popMenu',
    props: {
      vp: r.vp(17),
      vpMode: r.u8(19),
      picMenu: r.u16(20),
      menuX1: r.u16(22),
      menuY1: r.u16(24),
      menuX2: r.u16(26),
      menuY2: r.u16(28),
      menuPosX: r.u16(30),
      menuPosY: r.u16(33),
      layerGamma: pct(r.u8(35)),
    },
  }),
  0x02: (r) => ({
    type: 'incAdjust',
    props: {
      vp: r.vp(17),
      vpMode: r.u8(19),
      adjMode: r.u8(20),
      returnMode: r.u8(21),
      step: r.u16(22),
      vMin: r.u16(24),
      vMax: r.u16(26),
      keyMode: r.u8(28),
      keyDelay: r.u8(29),
    },
  }),
  0x03: (r) => ({
    type: 'dragAdjust',
    rect: box(r.u16(20), r.u16(22), r.u16(24), r.u16(26)),
    props: { vp: r.vp(17), adjMode: r.u8(19) & 0x0f, vpFormat: r.u8(19) & 0xf0, vBegin: r.u16(28), vEnd: r.u16(30) },
  }),
  0x04: (r) => ({
    type: 'rtcInput',
    props: {
      showAuto: false,
      showX: r.u16(20),
      showY: r.u16(22),
      showColor: r.u16(24),
      fontId: r.u8(26),
      fontHor: r.u8(27),
      cursorColor: r.u8(28),
      kbSource: r.u8(29),
      picKb: r.u16(30),
      kbX1: r.u16(33),
      kbY1: r.u16(35),
      kbX2: r.u16(37),
      kbY2: r.u16(39),
      kbPosX: r.u16(41),
      kbPosY: r.u16(43),
    },
  }),
  0x05: (r) => ({
    type: 'keyReturn',
    props: { vp: r.vp(17), vpMode: r.u8(19), keyValue: r.u16(20), holdTime: r.u8(22) },
  }),
  0x06: (r): TD =>
    r.u8(63) === 2
      ? ({
          type: 'gbkInput',
          props: {
            vp: r.vp(17),
            maxLen: r.u8(19),
            scanMode: r.u8(20),
            lib1: r.u8(21),
            lib2: r.u8(22),
            scale1: r.u8(23),
            scale2: r.u8(24),
            cursorColor: r.u8(25),
            color0: r.u16(26),
            color1: r.u16(28),
            pyMode: r.u8(30),
            scanReturn: r.u8(31),
            pyX: r.u16(41),
            pyY: r.u16(43),
            scanDis: r.u8(45),
            kbSource: r.u8(47),
            picKb: r.u16(49),
            kbX1: r.u16(51),
            kbY1: r.u16(53),
            kbX2: r.u16(55),
            kbY2: r.u16(57),
            kbPosX: r.u16(59),
            kbPosY: r.u16(61),
            scanAuto: false,
            scanX1: r.u16(33),
            scanY1: r.u16(35),
            scanX2: r.u16(37),
            scanY2: r.u16(39),
          },
        } as TD)
      : ({
          type: 'textInput',
          props: {
            vp: r.vp(17),
            maxLen: r.u8(19),
            scanMode: r.u8(20),
            fontId: r.u8(21),
            fontHor: r.u8(22),
            fontVer: r.u8(23),
            cursorColor: r.u8(24),
            disColor: r.u16(25),
            scanReturn: r.u8(31),
            kbSource: r.u8(37),
            picKb: r.u16(38),
            kbX1: r.u16(40),
            kbY1: r.u16(42),
            kbX2: r.u16(44),
            kbY2: r.u16(46),
            kbPosX: r.u16(49),
            kbPosY: r.u16(51),
            displayEn: r.u8(53) !== 0,
            layerGamma: pct(r.u8(54)),
            scanAuto: false,
            scanX1: r.u16(27),
            scanY1: r.u16(29),
            scanX2: r.u16(33),
            scanY2: r.u16(35),
          },
        } as TD),
  0x07: (r) => {
    let end = 32;
    while (end > 18 && r.u8(end - 1) === 0) end--;
    return { type: 'paramConfig', props: { vpMode: r.u8(17), dataPack: r.hex(18, end) } };
  },
  0x08: (r) => ({
    type: 'keyDoRet',
    props: {
      tpOn: r.u8(17),
      vp1s: r.vp(18),
      vp1t: r.vp(20),
      len1: r.u8(23),
      tpOnC: r.u8(25),
      vp2s: r.vp(26),
      vp2t: r.vp(28),
      len2: r.u8(31),
      tpOff: r.u8(33),
      vp3s: r.vp(34),
      vp3t: r.vp(36),
      len3: r.u8(39),
    },
  }),
  0x09: (r) => {
    const cx = r.u16(20);
    const cy = r.u16(22);
    const r1 = r.u16(26) || 100;
    return {
      type: 'rotateAdjust',
      rect: at(cx - r1, cy - r1, r1 * 2, r1 * 2),
      props: {
        vp: r.vp(17),
        dataFormat: r.u8(19),
        r0: r.u16(24),
        r1: r.u16(26),
        a0: r.u16(28),
        vBegin: r.u16(30),
        a1: r.u16(33),
        vEnd: r.u16(35),
      },
    };
  },
  0x0a: (r) => ({ type: 'slideAdjust', props: { vp: r.vp(17), adjMode: r.u8(19), stepDis: r.u8(20) } }),
  0x0b: (r) => ({
    type: 'pageSlide',
    props: {
      picPre: r.u16(17),
      picNextOne: r.u16(19),
      adjMode: r.u8(28) >> 7,
      pushSpeed: r.u8(25),
      pushDis: r.u16(26),
      dateReturn: r.u8(28) & 0x7f,
      endAnimation: r.u8(29),
    },
  }),
  0x0c: (r) => ({ type: 'iconDrag', props: { vp: r.vp(17), adjMode: r.u8(19), tpPageIcon: r.u16(20), speed: r.u8(22) } }),
  0x0d: (r) => ({ type: 'bitButton', props: { vp: r.vp(17), bitPos: r.u8(19), adjMode: r.u8(20) } }),
};

export function decodeTouch(block: Uint8Array): (Decoded & { pageId: number }) | null {
  const r = reader(block);
  const common = touchCommon(r);
  if (block.length === 16) {
    return { type: 'basicTouch', rect: common.rect, pageId: common.pageId, props: { ...common.props, keyValue: r.vp(14) } };
  }
  const fn = touchDecoders[block[15]];
  if (!fn) return null;
  const d = fn(r, common.rect);
  return { type: d.type, rect: d.rect ?? common.rect, pageId: common.pageId, props: { ...common.props, ...d.props } };
}
