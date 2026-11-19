// T5LCFG.CFG: configuración del hardware (guía DGUS II V2.9, sección 3.3 «CFG file»).
//
//  0x00  "T5LC1"
//  0x05  bit 7 CRC · bit 6 música (1) / zumbador (0) · bit 5 cargar 22 al arrancar · bit 4 subida
//        automática de datos táctiles · bit 3 sonido táctil · bit 2 reposo de retroiluminación ·
//        bits 1–0 orientación (00=0°, 01=90°, 10=180°, 11=270°)
//  0x07  ID del archivo WAE de música
//  0x08  ICL de fondos
//  0x0A  baudios = 3225600 / baudios (u16, máx. 0x03FF)
//  0x0C  brillo (0–0x64) · 0x0D brillo en reposo · 0x0E–0x0F tiempo hasta reposo (×10 ms)
//  0x10  5A A5 → aplica los tiempos LCD de 0x12–0x1F (de fábrica: no se tocan aquí)
//  0x20  5A → aplica 0x21 (tipo/calibración del táctil) y 0x22 (sensibilidad)
//  0x2B  volumen del zumbador · 0x2D duración del pitido táctil (×10 ms)
//  0x2E  5A → 0x2F es el ID del archivo de valores iniciales (en lugar de 22)
//  0x40  5A A5 → carpeta de la SD renombrada: 0x42 longitud (1–8), 0x43… nombre
//
// Los bytes que no se editan se conservan tal cual desde el CFG de base.

export interface CfgModel {
  crc: boolean;
  music: boolean;
  loadInit: boolean;
  autoUpload: boolean;
  touchSound: boolean;
  backlightStandby: boolean;
  rotation: 0 | 90 | 180 | 270;
  waeId: number;
  bgIclId: number;
  baud: number;
  brightness: number;
  standbyBrightness: number;
  standbyDelayMs: number;
  /** null = no se cambia la sensibilidad (queda la de fábrica). */
  touchSensitivity: number | null;
  /** null = sin tocar. */
  buzzerVolume: number | null;
  buzzerTimeMs: number | null;
  /** ID del archivo de valores iniciales si no es 22; null = 22. */
  initFileId: number | null;
  /** Nombre de la carpeta de la SD si no es DWIN_SET; null = DWIN_SET. */
  sdFolder: string | null;
}

export const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];

export function isCfg(b: Uint8Array): boolean {
  return b.length >= 12 && String.fromCharCode(...b.slice(0, 5)) === 'T5LC1';
}

export function parseCfg(b: Uint8Array): CfgModel {
  if (!isCfg(b)) throw new Error('No es un archivo T5LCFG.CFG (cabecera T5LC1).');
  const at = (i: number) => (i < b.length ? b[i] : 0);
  const c = at(5);
  const div = (at(0x0a) << 8) | at(0x0b);
  const folderOn = at(0x40) === 0x5a && at(0x41) === 0xa5;
  const len = Math.min(8, at(0x42));
  return {
    crc: !!(c & 0x80),
    music: !!(c & 0x40),
    loadInit: !!(c & 0x20),
    autoUpload: !!(c & 0x10),
    touchSound: !!(c & 0x08),
    backlightStandby: !!(c & 0x04),
    rotation: ([0, 90, 180, 270] as const)[c & 3],
    waeId: at(7),
    bgIclId: at(8),
    baud: div ? Math.round(3225600 / div) : 115200,
    brightness: at(0x0c),
    standbyBrightness: at(0x0d),
    standbyDelayMs: ((at(0x0e) << 8) | at(0x0f)) * 10,
    touchSensitivity: at(0x20) === 0x5a ? at(0x22) : null,
    buzzerVolume: b.length > 0x2b && at(0x2b) ? at(0x2b) : null,
    buzzerTimeMs: b.length > 0x2d && at(0x2d) ? at(0x2d) * 10 : null,
    initFileId: at(0x2e) === 0x5a ? at(0x2f) : null,
    sdFolder: folderOn && len ? String.fromCharCode(...b.slice(0x43, 0x43 + len)) : null,
  };
}

/** Comprueba los valores antes de generar. */
export function checkCfg(m: CfgModel): string[] {
  const e: string[] = [];
  const div = Math.round(3225600 / m.baud);
  if (!Number.isFinite(div) || div < 1 || div > 0x3ff) e.push('Baudios fuera de rango (el divisor 3225600/baudios debe estar entre 1 y 1023).');
  for (const [k, v] of [['brillo', m.brightness], ['brillo en reposo', m.standbyBrightness]] as const) if (v < 0 || v > 100) e.push(`El ${k} debe estar entre 0 y 100.`);
  if (m.standbyDelayMs < 0 || m.standbyDelayMs > 655350) e.push('Tiempo de reposo fuera de rango (máx. 655 s).');
  if (m.touchSensitivity != null && (m.touchSensitivity < 0 || m.touchSensitivity > 255)) e.push('Sensibilidad táctil entre 0 y 255.');
  if (m.buzzerTimeMs != null && (m.buzzerTimeMs < 0 || m.buzzerTimeMs > 2550)) e.push('Duración del pitido entre 0 y 2550 ms.');
  if (m.sdFolder != null && !/^[A-Za-z0-9_]{1,8}$/.test(m.sdFolder)) e.push('La carpeta de la SD debe tener de 1 a 8 letras, números o «_».');
  if (m.initFileId != null && (m.initFileId < 0 || m.initFileId > 255)) e.push('ID del archivo de valores iniciales entre 0 y 255.');
  return e;
}

/** Escribe el modelo sobre una copia del CFG de base (conserva todo lo demás). */
export function buildCfg(m: CfgModel, base: Uint8Array): Uint8Array {
  const errs = checkCfg(m);
  if (errs.length) throw new Error(errs.join(' '));
  // El tamaño solo crece si se usa un campo que lo necesita: un CFG sin cambios sale idéntico.
  let size = Math.max(base.length, 0x10);
  if (m.touchSensitivity != null) size = Math.max(size, 0x23);
  if (m.buzzerVolume != null || m.buzzerTimeMs != null) size = Math.max(size, 0x2e);
  if (m.initFileId != null) size = Math.max(size, 0x30);
  if (m.sdFolder != null) size = Math.max(size, 0x43 + 8);
  const b = new Uint8Array(size);
  b.set(base.subarray(0, size));
  b.set([0x54, 0x35, 0x4c, 0x43, 0x31], 0);
  b[5] =
    (m.crc ? 0x80 : 0) |
    (m.music ? 0x40 : 0) |
    (m.loadInit ? 0x20 : 0) |
    (m.autoUpload ? 0x10 : 0) |
    (m.touchSound ? 0x08 : 0) |
    (m.backlightStandby ? 0x04 : 0) |
    [0, 90, 180, 270].indexOf(m.rotation);
  b[7] = m.waeId & 0xff;
  b[8] = m.bgIclId & 0xff;
  const div = Math.round(3225600 / m.baud);
  b[0x0a] = div >> 8;
  b[0x0b] = div & 0xff;
  b[0x0c] = m.brightness;
  b[0x0d] = m.standbyBrightness;
  const t = Math.round(m.standbyDelayMs / 10);
  b[0x0e] = t >> 8;
  b[0x0f] = t & 0xff;
  if (m.touchSensitivity != null) {
    b[0x20] = 0x5a;
    b[0x22] = m.touchSensitivity;
  }
  if (m.buzzerVolume != null) b[0x2b] = m.buzzerVolume;
  if (m.buzzerTimeMs != null) b[0x2d] = Math.round(m.buzzerTimeMs / 10);
  if (m.initFileId != null) {
    b[0x2e] = 0x5a;
    b[0x2f] = m.initFileId;
  } else if (size > 0x2e && b[0x2e] === 0x5a) b[0x2e] = 0;
  if (m.sdFolder != null) {
    b[0x40] = 0x5a;
    b[0x41] = 0xa5;
    b[0x42] = m.sdFolder.length;
    b.fill(0, 0x43, 0x43 + 8);
    for (let i = 0; i < m.sdFolder.length; i++) b[0x43 + i] = m.sdFolder.charCodeAt(i);
  } else if (size > 0x41 && b[0x40] === 0x5a && b[0x41] === 0xa5) {
    b[0x40] = 0;
    b[0x41] = 0;
  }
  return b;
}

/** Valores de partida para un proyecto nuevo (los mismos que el CFG básico). */
export function defaultCfg(bgIclId = 32, rotation: CfgModel['rotation'] = 0): CfgModel {
  return {
    crc: false,
    music: false,
    loadInit: true,
    autoUpload: true,
    touchSound: true,
    backlightStandby: false,
    rotation,
    waeId: 0,
    bgIclId,
    baud: 115200,
    brightness: 100,
    standbyBrightness: 10,
    standbyDelayMs: 60000,
    touchSensitivity: null,
    buzzerVolume: null,
    buzzerTimeMs: null,
    initFileId: null,
    sdFolder: null,
  };
}
