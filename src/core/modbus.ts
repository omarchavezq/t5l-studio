// Configuración de comunicación con PLC y Modbus dentro de 22_Config.bin.
// Portado de TOOL/PLC_Config (MainWindowViewModel.SaveModbus_Executed) de DGUS V7.651.
//
// La herramienta original toma el 22, lo rellena con ceros (o lo recorta) hasta 0x30000
// y añade un bloque de 4 KB con la configuración del puerto:
//   bloque + (puerto − 2) × 32:  modo, 00, baudios (u32)  y los datos de cada modo
// En modo Modbus maestro, después del bloque van los comandos (9 bytes los de lectura y
// escritura, 16 los de «al entrar a la página») y en 0x20000 la tabla de páginas que
// dispara los comandos de entrada. Todos los números van en big-endian.

export const MODBUS_BASE = 0x30000;
const BLOCK = 4096;
const PAGE_TABLE = 0x20000;

/** Modos del selector «serialport mode» de PLC_Config, en su orden. */
export const PLC_MODES = [
  'Ninguno',
  'Modbus maestro',
  'Protocolo DWIN (82/83)',
  'Reservado',
  'PLC Mitsubishi',
  'PLC Siemens (PPI)',
  'PLC Xinje',
  'PLC Delta',
  'PLC Megmeet',
  'PLC Panasonic',
  'Modbus esclavo',
] as const;

export const PLC_PORTS = [2, 4, 5] as const;
export const PLC_BAUDS = [9600, 19200, 38400, 57600, 115200];
export const READ_CODES = [0x01, 0x02, 0x03, 0x04];
export const WRITE_CODES = [0x05, 0x06, 0x0f, 0x10];

export interface ModbusItem {
  /** Dirección del esclavo (1–255). */
  id: number;
  /** Código de función Modbus. */
  cmd: number;
  register: number;
  /** Cantidad de registros o bobinas (5 y 6 siempre 1). */
  length: number;
  vp: number;
  /** Tiempo de espera, en las unidades de PLC_Config. */
  timeout: number;
}

export interface ModbusEnterItem extends ModbusItem {
  /** Página que dispara el comando al mostrarse. */
  page: number;
  /** VP que vigila la pantalla para lanzarlo. */
  monitorVp: number;
}

export interface PlcConfig {
  /** Índice en PLC_MODES. */
  mode: number;
  port: number;
  baud: number;
  /** Separación entre comandos (ms). */
  spanTime: number;
  read: ModbusItem[];
  write: ModbusItem[];
  enter: ModbusEnterItem[];
  /** PLC de marca (modos 4–9). */
  plcMaxWords: number;
  respondTime: number;
  retryTimes: number;
  /** Cuatro áreas del PLC (X, Y, M, D en Mitsubishi): VP inicial y cantidad. */
  areas: { vp: number; count: number }[];
  /** Modbus esclavo: zonas de solo lectura y de lectura y escritura. */
  slave: { roVp: number; roCount: number; rwVp: number; rwCount: number };
}

export function defaultPlcConfig(): PlcConfig {
  return {
    mode: 1,
    port: 2,
    baud: 115200,
    spanTime: 2,
    read: [],
    write: [],
    enter: [],
    plcMaxWords: 0,
    respondTime: 0,
    retryTimes: 0,
    areas: [0, 1, 2, 3].map(() => ({ vp: 0, count: 0 })),
    slave: { roVp: 0, roCount: 0, rwVp: 0, rwCount: 0 },
  };
}

const be = (v: number, n: number) => {
  const out: number[] = [];
  let x = Math.trunc(v);
  for (let i = 0; i < n; i++) {
    out.unshift(((x % 256) + 256) % 256);
    x = Math.trunc(x / 256);
  }
  return out;
};
const rd = (d: Uint8Array, at: number, n: number) => {
  let v = 0;
  for (let i = 0; i < n; i++) v = v * 256 + (d[at + i] ?? 0);
  return v;
};

/** Byte del modo que se escribe: «Modbus esclavo» se guarda como 16. */
const modeByte = (mode: number) => (mode === 10 ? 16 : mode);

const itemBytes = (it: ModbusItem) => [it.id & 0xff, it.cmd & 0xff, ...be(it.register, 2), it.length & 0xff, ...be(it.vp, 2), it.timeout & 0xff];

function enterBytes(it: ModbusEnterItem): number[] {
  const kind = it.cmd === 5 || it.cmd === 15 ? 1 : it.cmd === 6 || it.cmd === 16 ? 3 : 5;
  return [...itemBytes(it), it.id & 0xff, kind, ...be(it.register, 2), it.length & 0xff, ...be(it.vp, 2), it.timeout & 0xff];
}

/** Comandos de entrada agrupados por página, en el orden en que los escribe PLC_Config. */
function byPage(items: ModbusEnterItem[]): Map<number, ModbusEnterItem[]> {
  const m = new Map<number, ModbusEnterItem[]>();
  for (const it of items) m.set(it.page, [...(m.get(it.page) ?? []), it]);
  return m;
}

function pageTable(cfg: PlcConfig): number[] {
  const groups = byPage(cfg.enter);
  const maxId = Math.max(0, ...groups.keys());
  const head = be(0, 8);
  const body: number[] = [];
  let start = cfg.read.length + cfg.write.length;
  let off = (maxId + 2) * 8;
  for (let p = 0; p <= maxId; p++) {
    const list = groups.get(p);
    if (!list) {
      head.push(...be(0, 8));
      continue;
    }
    const bytes: number[] = [];
    for (const it of list) {
      for (const k of [0, 1]) bytes.push(0, 6, ...be(it.monitorVp, 2), cfg.port & 0xff, k, ...be(start + k, 2), 0, 1);
      start += 2;
    }
    body.push(...bytes);
    head.push(...be(off, 4), ...be(bytes.length / 2, 4));
    off += bytes.length;
  }
  return [...head, ...body];
}

/** Aplica la configuración al 22 generado, igual que «Guardar en 22» de PLC_Config. */
export function applyPlcConfig(config22: Uint8Array, cfg: PlcConfig): Uint8Array {
  const list = Array.from(config22.subarray(0, MODBUS_BASE));
  while (list.length < MODBUS_BASE) list.push(0);
  const header = [modeByte(cfg.mode), 0, ...be(cfg.baud, 4)];
  const lead = (cfg.port - 2) * 32;
  const block = new Array<number>(lead).fill(0);
  const pad = (n: number) => {
    while (block.length < n) block.push(0);
  };
  if (cfg.mode === 1) {
    header.push(...be(cfg.read.length, 2), ...be(cfg.write.length, 2), ...be(cfg.enter.length, 2), ...be(cfg.spanTime, 2), ...be((MODBUS_BASE + BLOCK) / 2, 4));
    block.push(...header);
    pad(BLOCK);
    list.push(...block);
    for (const it of [...cfg.read, ...cfg.write]) list.push(...itemBytes(it));
    for (const group of [...byPage(cfg.enter)].sort((a, b) => a[0] - b[0])) for (const it of group[1]) list.push(...enterBytes(it));
    pageTable(cfg).forEach((b, i) => (list[PAGE_TABLE + i] = b));
  } else if (cfg.mode >= 4 && cfg.mode <= 9) {
    header.push(...be(cfg.plcMaxWords, 2), ...be(cfg.spanTime, 2), ...be(cfg.respondTime, 2), ...be(cfg.retryTimes, 2));
    block.push(...header);
    pad(3328);
    for (let i = 0; i < 4; i++) block.push(...be(cfg.areas[i]?.vp ?? 0, 2), ...be(cfg.areas[i]?.count ?? 0, 2));
    pad(BLOCK);
    list.push(...block);
  } else if (cfg.mode === 10) {
    block.push(...header);
    pad(3376);
    const s = cfg.slave;
    block.push(...be(s.roVp, 2), ...be(s.roCount, 2), ...be(s.rwVp, 2), ...be(s.rwCount, 2));
    pad(BLOCK);
    list.push(...block);
  } else {
    // Ninguno, 82/83 y reservado: la herramienta original deja un cero más antes de la cabecera.
    list.push(...new Array<number>(lead + 1).fill(0), ...header);
  }
  return Uint8Array.from(list);
}

/** Lee la configuración de un 22 escrito por PLC_Config; null si no la tiene. */
export function readPlcConfig(d: Uint8Array): PlcConfig | null {
  if (d.length <= MODBUS_BASE) return null;
  for (const port of PLC_PORTS) {
    const lead = (port - 2) * 32;
    // Modos sin bloque: cabecera de 6 bytes al final, tras un cero.
    if (d.length === MODBUS_BASE + lead + 7) {
      const m = d[MODBUS_BASE + lead + 1];
      if (m > 3 || d[MODBUS_BASE + lead + 2] !== 0) continue;
      return { ...defaultPlcConfig(), mode: m, port, baud: rd(d, MODBUS_BASE + lead + 3, 4) };
    }
    const at = MODBUS_BASE + lead;
    const mb = d[at];
    const mode = mb === 16 ? 10 : mb;
    if (!(mode === 1 || (mode >= 4 && mode <= 10)) || d[at + 1] !== 0) continue;
    const cfg: PlcConfig = { ...defaultPlcConfig(), mode, port, baud: rd(d, at + 2, 4) };
    if (mode === 1) {
      if (rd(d, at + 14, 4) !== (MODBUS_BASE + BLOCK) / 2) continue;
      const nr = rd(d, at + 6, 2);
      const nw = rd(d, at + 8, 2);
      const ne = rd(d, at + 10, 2);
      cfg.spanTime = rd(d, at + 12, 2);
      let p = MODBUS_BASE + BLOCK;
      const item = (): ModbusItem => {
        const it = { id: d[p], cmd: d[p + 1], register: rd(d, p + 2, 2), length: d[p + 4], vp: rd(d, p + 5, 2), timeout: d[p + 7] };
        p += 8;
        return it;
      };
      for (let i = 0; i < nr; i++) cfg.read.push(item());
      for (let i = 0; i < nw; i++) cfg.write.push(item());
      // Páginas y VP vigilado salen de la tabla de 0x20000 (10 palabras por comando).
      const pages: { page: number; monitorVp: number }[] = [];
      const first = rd(d, PAGE_TABLE + 8, 4) || Infinity;
      let minOff = first;
      for (let i = 0; PAGE_TABLE + 8 + i * 8 < PAGE_TABLE + Math.min(minOff, 0x10000); i++) {
        const off = rd(d, PAGE_TABLE + 8 + i * 8, 4);
        const words = rd(d, PAGE_TABLE + 12 + i * 8, 4);
        if (!off) continue;
        minOff = Math.min(minOff, off);
        for (let k = 0; k < words / 10; k++) pages.push({ page: i, monitorVp: rd(d, PAGE_TABLE + off + k * 20 + 2, 2) });
      }
      if (pages.length !== ne) continue;
      for (let i = 0; i < ne; i++) {
        const base = item();
        p += 8;
        cfg.enter.push({ ...base, ...pages[i] });
      }
    } else if (mode === 10) {
      const s = MODBUS_BASE + 3376;
      cfg.slave = { roVp: rd(d, s, 2), roCount: rd(d, s + 2, 2), rwVp: rd(d, s + 4, 2), rwCount: rd(d, s + 6, 2) };
    } else {
      cfg.plcMaxWords = rd(d, at + 6, 2);
      cfg.spanTime = rd(d, at + 8, 2);
      cfg.respondTime = rd(d, at + 10, 2);
      cfg.retryTimes = rd(d, at + 12, 2);
      cfg.areas = [0, 1, 2, 3].map((i) => ({ vp: rd(d, MODBUS_BASE + 3328 + i * 4, 2), count: rd(d, MODBUS_BASE + 3330 + i * 4, 2) }));
    }
    return cfg;
  }
  return null;
}

/** Problemas de una configuración antes de generarla. */
export function checkPlcConfig(cfg: PlcConfig): string[] {
  const out: string[] = [];
  const all: [string, ModbusItem][] = [
    ...cfg.read.map((x, i) => [`Lectura ${i + 1}`, x] as [string, ModbusItem]),
    ...cfg.write.map((x, i) => [`Escritura ${i + 1}`, x] as [string, ModbusItem]),
    ...cfg.enter.map((x, i) => [`Al entrar ${i + 1}`, x] as [string, ModbusItem]),
  ];
  for (const [n, it] of all) {
    if (it.id < 1 || it.id > 255) out.push(`${n}: la dirección del esclavo debe estar entre 1 y 255.`);
    if (it.length < 1 || it.length > 255) out.push(`${n}: la longitud debe estar entre 1 y 255.`);
    if (it.timeout < 0 || it.timeout > 255) out.push(`${n}: el tiempo de espera debe estar entre 0 y 255.`);
    if (it.vp < 0x1000 || it.vp > 0xffff) out.push(`${n}: el VP 0x${it.vp.toString(16).toUpperCase()} está en la zona del sistema.`);
  }
  if (cfg.baud <= 0) out.push('Los baudios deben ser mayores que cero.');
  return out;
}
