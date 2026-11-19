// Comunicación serie con la pantalla (o con el MCU cuando se simula la pantalla) y simulador.

import { create } from 'zustand';
import {
  DEFAULT_LINK,
  FrameParser,
  SECTOR,
  describe,
  okReply,
  planDownload,
  readReply,
  readVp,
  sectorRequest,
  toHexStr,
  writeVp,
  type Frame,
  type LinkOptions,
  type Sector,
} from '../core/protocol';
import { VpMemory, applyWrite, touch, type TouchResult } from '../core/simulator';
import { buildProject } from '../core/build';
import type { ControlInstance } from '../core/types';
import { useStore } from './store';
import { applyKey } from '../core/keyboard';
import { toast } from './toast';

// ---------------------------------------------------------------- tipos Web Serial mínimos

interface WSerialPort {
  open(o: { baudRate: number; stopBits?: 1 | 2 }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  getInfo(): { usbVendorId?: number; usbProductId?: number };
}
interface WSerial {
  requestPort(): Promise<WSerialPort>;
}
const serialApi = (): WSerial | undefined => (navigator as unknown as { serial?: WSerial }).serial;
export const serialSupported = () => !!serialApi();

// ---------------------------------------------------------------- estado

export type Role = 'host' | 'screen';

export interface LogEntry {
  t: number;
  dir: 'tx' | 'rx' | 'info' | 'err';
  hex: string;
  text: string;
}

export interface Watch {
  vp: string;
  type: number; // como VarType de DGUS
  label: string;
  value: string;
}

interface CommState {
  connected: boolean;
  portLabel: string;
  baud: number;
  role: Role;
  link: LinkOptions;
  log: LogEntry[];
  watches: Watch[];
  polling: boolean;
  download: { running: boolean; done: number; total: number; current: string; bytesPerSec: number } | null;
  simOn: boolean;
  /** En simulación, dibuja las zonas táctiles semitransparentes (la pantalla real no las muestra). */
  simZones: boolean;
  simVersion: number;
  bottomTab: 'output' | 'monitor' | 'vars' | 'download';
  portPicker: { ports: { portId: string; portName: string; displayName?: string }[] } | null;
}

export const useComm = create<CommState>(() => ({
  connected: false,
  portLabel: '',
  baud: 115200,
  role: 'host',
  link: DEFAULT_LINK,
  log: [],
  watches: [{ vp: '5000', type: 0, label: '', value: '' }],
  polling: false,
  download: null,
  simOn: false,
  simZones: true,
  simVersion: 0,
  bottomTab: 'output',
  portPicker: null,
}));

export const BAUDS = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];

// ---------------------------------------------------------------- memoria del simulador

export const simMem = { mem: new VpMemory() };

export function resetSimMemory() {
  try {
    const r = buildProject(useStore.getState().project);
    simMem.mem = new VpMemory(r.config);
  } catch {
    simMem.mem = new VpMemory();
  }
  bumpSim();
}

const bumpSim = () => useComm.setState((s) => ({ simVersion: s.simVersion + 1 }));

export function setSimOn(on: boolean) {
  useSimKeyboard.setState({ kb: null });
  useSimAsk.getState().ask?.resolve(null);
  useSimAsk.setState({ ask: null });
  if (on) resetSimMemory();
  useComm.setState({ simOn: on });
  useStore.getState().select([]);
}

// ---------------------------------------------------------------- registro

function log(dir: LogEntry['dir'], bytes: Uint8Array | null, text: string) {
  const e: LogEntry = { t: Date.now(), dir, hex: bytes ? toHexStr(bytes.length > 64 ? bytes.subarray(0, 64) : bytes) + (bytes.length > 64 ? ` … (${bytes.length} bytes)` : '') : '', text };
  useComm.setState((s) => ({ log: [...s.log.slice(-399), e] }));
}

export const clearLog = () => useComm.setState({ log: [] });

// ---------------------------------------------------------------- conexión

let port: WSerialPort | null = null;
let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
const parser = new FrameParser();
let rawListeners: ((b: Uint8Array) => void)[] = [];
let frameListeners: ((f: Frame) => void)[] = [];
const win = (): Window | undefined => (typeof window === 'undefined' ? undefined : window);

// Cola: una operación a la vez (lecturas, escrituras y descarga no se mezclan en el cable).
let chain: Promise<unknown> = Promise.resolve();
let pending = 0;
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  pending++;
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run.finally(() => pending--);
}
export const queueBusy = () => pending > 0;

/** Muestra el selector propio de puertos en Electron. */
function hookElectronPicker(): () => void {
  const api = win()?.dgus;
  if (!api?.onSerialPorts) return () => {};
  return api.onSerialPorts((ports) => useComm.setState({ portPicker: { ports } }));
}

export function choosePort(portId: string | null) {
  useComm.setState({ portPicker: null });
  win()?.dgus?.chooseSerialPort(portId ?? '');
}

export async function connect() {
  const api = serialApi();
  if (!api) {
    toast('Este navegador no tiene acceso al puerto serie. Use la app de escritorio o Chrome/Edge.', 'error');
    return;
  }
  const unhook = hookElectronPicker();
  try {
    const p = await api.requestPort();
    const { baud, link } = useComm.getState();
    await p.open({ baudRate: baud });
    port = p;
    writer = p.writable!.getWriter();
    parser.setOptions(link);
    const info = p.getInfo();
    const label = info.usbVendorId ? `USB ${info.usbVendorId.toString(16)}:${(info.usbProductId ?? 0).toString(16)}` : 'Puerto serie';
    useComm.setState({ connected: true, portLabel: label });
    log('info', null, `Conectado a ${label} a ${baud} baudios`);
    readLoop(p);
  } catch (e) {
    const msg = (e as Error).message || String(e);
    if (!/No port selected|cancel/i.test(msg)) toast(`No se pudo abrir el puerto: ${msg}`, 'error');
  } finally {
    unhook();
  }
}

export async function disconnect() {
  useComm.setState({ polling: false });
  try {
    await reader?.cancel();
  } catch {
    /* ya cerrado */
  }
  try {
    writer?.releaseLock();
    await port?.close();
  } catch {
    /* ya cerrado */
  }
  port = null;
  writer = null;
  reader = null;
  useComm.setState({ connected: false, portLabel: '' });
  log('info', null, 'Desconectado');
}

async function readLoop(p: WSerialPort) {
  while (p.readable && port === p) {
    const r = p.readable.getReader();
    reader = r;
    try {
      for (;;) {
        const { value, done } = await r.read();
        if (done) break;
        if (value?.length) onBytes(value);
      }
    } catch (e) {
      // Al desconectar, cancel() termina la lectura: no es un error.
      if (port === p) log('err', null, `Error de lectura: ${(e as Error).message}`);
    } finally {
      try {
        r.releaseLock();
      } catch {
        /* ya liberado */
      }
      if (reader === r) reader = null;
    }
    if (port !== p) break;
  }
}

function onBytes(b: Uint8Array) {
  rawListeners.forEach((l) => l(b));
  if (useComm.getState().download?.running) return; // durante la descarga las respuestas no son tramas
  const { frames, junk } = parser.push(b);
  for (const j of junk) log('rx', j, 'Bytes sueltos (cabecera no reconocida)');
  for (const f of frames) {
    if (f.crcOk === false) {
      // Una trama dañada no debe cambiar valores ni confirmar operaciones.
      log('err', f.raw, `Trama descartada: CRC incorrecto (${describe(f)})`);
      continue;
    }
    log('rx', f.raw, describe(f));
    frameListeners.forEach((l) => l(f));
    handleFrame(f);
  }
}

export async function send(bytes: Uint8Array, text?: string) {
  if (!writer) {
    toast('No hay conexión serie', 'error');
    return false;
  }
  if (useComm.getState().download?.running) {
    toast('Espere a que termine la descarga', 'error');
    return false;
  }
  await writer.write(bytes);
  log('tx', bytes, text ?? describe(new FrameParser(useComm.getState().link).push(bytes).frames[0] ?? { cmd: 0, data: new Uint8Array(), raw: bytes, crcOk: null }));
  return true;
}

export function setLink(link: LinkOptions) {
  parser.setOptions(link);
  useComm.setState({ link });
}

// ---------------------------------------------------------------- tramas recibidas

function handleFrame(f: Frame) {
  const { role, link, watches } = useComm.getState();
  const vp = f.data.length >= 2 ? (f.data[0] << 8) | f.data[1] : -1;
  if (role === 'screen') {
    // El PC hace de pantalla para el MCU
    if (f.cmd === 0x82 && vp >= 0 && !(f.data.length === 2 && f.data[0] === 0x4f)) {
      const r = applyWrite(simMem.mem, vp, f.data.slice(2));
      if (r.page != null) showSimPage(r.page);
      bumpSim();
      send(okReply(link), 'OK');
    } else if (f.cmd === 0x83 && f.data.length === 3) {
      const words = f.data[2];
      send(readReply(vp, simMem.mem.bytes(vp, words * 2), link));
    }
    return;
  }
  // El PC habla con una pantalla real
  if (f.cmd === 0x83 && f.data.length >= 3) {
    const words = f.data[2];
    const data = f.data.slice(3, 3 + words * 2);
    simMem.mem.setBytes(vp, data);
    bumpSim();
    useComm.setState({
      watches: watches.map((w) => (parseInt(w.vp, 16) === vp ? { ...w, value: formatWatch(w.type, data) } : w)),
    });
  }
}

function formatWatch(type: number, d: Uint8Array): string {
  const dv = new DataView(d.buffer, d.byteOffset, d.length);
  try {
    switch (type) {
      case 1: return String(dv.getInt32(0));
      case 5: return String(dv.getUint16(0));
      case 6: return String(dv.getUint32(0));
      case 7: return String(dv.getFloat32(0));
      case 9: return Array.from(d, (x) => (x >= 32 && x < 127 ? String.fromCharCode(x) : '')).join('');
      default: return String(dv.getInt16(0));
    }
  } catch {
    return toHexStr(d);
  }
}

// ---------------------------------------------------------------- variables vigiladas

export const WATCH_TYPES = [
  { value: 0, label: 'int16', words: 1 },
  { value: 5, label: 'uint16', words: 1 },
  { value: 1, label: 'int32', words: 2 },
  { value: 6, label: 'uint32', words: 2 },
  { value: 7, label: 'float', words: 2 },
  { value: 9, label: 'texto (16)', words: 8 },
];

export interface RequestOptions {
  timeoutMs?: number;
  retries?: number;
  text?: string;
}

/**
 * Envía una trama y espera la respuesta que cumpla `match`. La escucha se registra antes de
 * escribir, para no perder respuestas inmediatas. Devuelve null si no llega tras los reintentos.
 */
export function request(bytes: Uint8Array, match: (f: Frame) => boolean, opts: RequestOptions = {}): Promise<Frame | null> {
  const { timeoutMs = 600, retries = 2, text } = opts;
  return enqueue(async () => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (!writer) return null;
      let resolveFn: (f: Frame | null) => void = () => {};
      const got = new Promise<Frame | null>((r) => (resolveFn = r));
      const l = (f: Frame) => {
        if (match(f)) resolveFn(f);
      };
      frameListeners.push(l);
      const timer = setTimeout(() => resolveFn(null), timeoutMs);
      try {
        if (!(await send(bytes, attempt ? `${text ?? 'Reintento'} (reintento ${attempt})` : text))) return null;
        const f = await got;
        if (f) return f;
      } finally {
        clearTimeout(timer);
        frameListeners = frameListeners.filter((x) => x !== l);
      }
    }
    log('err', null, `Sin respuesta de la pantalla${text ? `: ${text}` : ''}`);
    return null;
  });
}

const vpOfFrame = (f: Frame) => (f.data.length >= 2 ? (f.data[0] << 8) | f.data[1] : -1);
const isOk = (f: Frame) => f.cmd === 0x82 && f.data.length === 2 && f.data[0] === 0x4f && f.data[1] === 0x4b;

export async function readWatch(w: Watch): Promise<boolean> {
  const words = WATCH_TYPES.find((t) => t.value === w.type)?.words ?? 1;
  const vp = parseInt(w.vp, 16);
  const f = await request(readVp(vp, words, useComm.getState().link), (x) => x.cmd === 0x83 && x.data.length > 3 && vpOfFrame(x) === vp);
  if (!f) useComm.setState((s) => ({ watches: s.watches.map((x) => (x === w || x.vp === w.vp ? { ...x, value: 'sin respuesta' } : x)) }));
  return !!f;
}

let writeAckWarned = false;

export async function writeWatch(w: Watch, value: string) {
  const vp = parseInt(w.vp, 16);
  let bytes: number[];
  const n = Number(value);
  const dv = new DataView(new ArrayBuffer(4));
  switch (w.type) {
    case 1: case 6: dv.setUint32(0, Math.trunc(n) >>> 0); bytes = [...new Uint8Array(dv.buffer)]; break;
    case 7: dv.setFloat32(0, n); bytes = [...new Uint8Array(dv.buffer)]; break;
    case 9: bytes = [...value].map((c) => c.charCodeAt(0) & 0xff).concat([0xff, 0xff]); if (bytes.length % 2) bytes.push(0); break;
    default: bytes = [(Math.trunc(n) >> 8) & 0xff, Math.trunc(n) & 0xff];
  }
  // Algunos firmwares no confirman las escrituras con 4F 4B: no se reintenta para no escribir dos veces.
  const ok = await request(writeVp(vp, bytes, useComm.getState().link), isOk, { retries: 0, timeoutMs: 400 });
  if (!ok && !writeAckWarned) {
    writeAckWarned = true;
    log('info', null, 'La pantalla no confirmó la escritura (algunos firmwares no responden OK). Lea la variable para comprobarla.');
  }
  return !!ok;
}

let pollTimer: ReturnType<typeof setInterval> | undefined;
export function setPolling(on: boolean) {
  clearInterval(pollTimer);
  useComm.setState({ polling: on });
  if (on) {
    pollTimer = setInterval(async () => {
      const s = useComm.getState();
      if (!s.connected || !s.polling || s.download?.running || queueBusy()) return;
      for (const w of s.watches) await readWatch(w);
    }, 500);
  }
}

// ---------------------------------------------------------------- descarga

let cancelDownload = false;
export const stopDownload = () => (cancelDownload = true);

function waitForReply(ms: number): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const got: number[] = [];
    let settle: ReturnType<typeof setTimeout> | undefined;
    const l = (b: Uint8Array) => {
      got.push(...b);
      clearTimeout(settle);
      settle = setTimeout(done, 60); // esperar a que llegue la respuesta completa
    };
    const timeout = setTimeout(done, ms);
    function done() {
      clearTimeout(timeout);
      clearTimeout(settle);
      rawListeners = rawListeners.filter((x) => x !== l);
      resolve(got.length ? Uint8Array.from(got) : null);
    }
    rawListeners.push(l);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Descarga por el puerto serie, sector por sector, como DGUS 7.6 (frmTextA.Downfile). */
export function downloadFiles(files: { name: string; data: Uint8Array }[]) {
  return enqueue(() => runDownload(files));
}

async function runDownload(files: { name: string; data: Uint8Array }[]) {
  const { sectors, warnings } = planDownload(files);
  warnings.forEach((w) => log('err', null, w));
  if (!sectors.length) return;
  if (!writer) {
    toast('Conéctese primero a la pantalla', 'error');
    return;
  }
  const link = useComm.getState().link;
  cancelDownload = false;
  setPolling(false);
  const start = Date.now();
  let sent = 0;
  const set = (i: number, s?: Sector) =>
    useComm.setState({
      download: {
        running: true,
        done: i,
        total: sectors.length,
        current: s ? `${s.file} · sector ${s.sector}` : '',
        bytesPerSec: sent / Math.max(0.001, (Date.now() - start) / 1000),
      },
    });
  log('info', null, `Descarga: ${sectors.length} sectores (${Math.round(sectors.reduce((n, s) => n + s.data.length, 0) / 1024)} KB)`);
  try {
    for (let i = 0; i < sectors.length; i++) {
      if (cancelDownload) throw new Error('Cancelado por el usuario');
      const s = sectors[i];
      set(i, s);
      const req = sectorRequest(s.sector, link);
      const replyP = waitForReply(8000); // escuchar antes de escribir: la respuesta puede llegar enseguida
      if (!writer) throw new Error('Se perdió la conexión');
      await writer.write(req);
      log('tx', req, `Petición de sector ${s.sector} (${s.file})`);
      const reply = await replyP;
      if (!reply) throw new Error(`La pantalla no respondió a la petición del sector ${s.sector}`);
      log('rx', reply, 'Respuesta de la pantalla');
      // Se envía en trozos para poder mostrar el avance y cancelar
      const CH = 4096;
      for (let o = 0; o < s.data.length; o += CH) {
        if (cancelDownload) throw new Error('Cancelado por el usuario');
        if (!writer) throw new Error('Se perdió la conexión');
        await writer.write(s.data.subarray(o, o + CH));
        sent += Math.min(CH, s.data.length - o);
        if ((o / CH) % 8 === 0) set(i + o / s.data.length, s);
      }
      log('info', null, `Sector ${s.sector} enviado (${s.data.length} bytes)`);
      await sleep(500);
    }
    set(sectors.length);
    log('info', null, `Descarga completa en ${Math.round((Date.now() - start) / 1000)} s`);
    toast('Descarga completa. Reinicie la pantalla si no se actualiza sola.');
  } catch (e) {
    log('err', null, (e as Error).message);
    toast((e as Error).message, 'error');
  } finally {
    cancelDownload = false;
    useComm.setState((st) => ({ download: st.download ? { ...st.download, running: false } : null }));
  }
}

/** Tiempo estimado de la descarga: 10 bits por byte más 0.5 s por sector. */
export function estimateSeconds(totalBytes: number, sectors: number, baud: number) {
  return (totalBytes * 10) / baud + sectors * 0.5;
}
export { SECTOR };

// ---------------------------------------------------------------- simulador: toques

export function showSimPage(page: number) {
  const s = useStore.getState();
  if (s.project.pages.some((p) => p.id === page)) s.selectPage(page);
}

/** Toque de un control en modo simulación. */
/** Teclado en pantalla del simulador (recorte de la página del teclado, como en el equipo). */
export interface SimKeyboard {
  control: ControlInstance;
  kbPage: number;
  area: { x1: number; y1: number; x2: number; y2: number };
  pos: { x: number; y: number };
  buffer: string;
  caps: boolean;
  apply: (value: string) => TouchResult;
}
export const useSimKeyboard = create<{ kb: SimKeyboard | null }>(() => ({ kb: null }));

/** Valor pedido al usuario en el simulador (window.prompt no existe en Electron). */
export interface SimAsk {
  title: string;
  current: string;
  kind: 'number' | 'text';
  resolve: (value: string | null) => void;
}
export const useSimAsk = create<{ ask: SimAsk | null }>(() => ({ ask: null }));
const askValue = (title: string, current: string, kind: 'number' | 'text') =>
  new Promise<string | null>((resolve) => useSimAsk.setState({ ask: { title, current, kind, resolve } }));

/** El teclado de página solo se usa si su zona es válida y tiene teclas; si no, se pide el valor con un diálogo. */
export function usableKeyboardPage(c: ControlInstance): boolean {
  if (Number(c.props.kbSource) !== 1) return false;
  const page = useStore.getState().project.pages.find((p) => p.id === Number(c.props.picKb));
  if (!page) return false;
  const n = (k: string) => Number(c.props[k]) || 0;
  const [x1, y1, x2, y2] = [n('kbX1'), n('kbY1'), n('kbX2'), n('kbY2')];
  if (x2 <= x1 || y2 <= y1) return false;
  return page.controls.some((k) => k.type === 'basicTouch' && k.x >= x1 - 1 && k.y >= y1 - 1 && k.x + k.w <= x2 + 1 && k.y + k.h <= y2 + 1);
}

export async function simTouch(c: ControlInstance, fraction: { x: number; y: number }) {
  if (useSimKeyboard.getState().kb || useSimAsk.getState().ask) return;
  let r: TouchResult = touch(c, simMem.mem, fraction);
  if (r.ask) {
    const kbPage = Number(c.props.picKb);
    if (usableKeyboardPage(c)) {
      const n = (k: string) => Number(c.props[k]) || 0;
      useSimKeyboard.setState({
        kb: {
          control: c,
          kbPage,
          area: { x1: n('kbX1'), y1: n('kbY1'), x2: n('kbX2'), y2: n('kbY2') },
          pos: { x: n('kbPosX'), y: n('kbPosY') },
          buffer: '',
          caps: false,
          apply: r.ask.apply,
        },
      });
      return;
    }
    const v = await askValue(r.ask.title, r.ask.current, r.ask.kind);
    if (v == null) return;
    r = r.ask.apply(v);
  }
  await finishTouch(c, r);
}

/** Tecla pulsada en el teclado del simulador. */
export async function simKey(code: number) {
  const kb = useSimKeyboard.getState().kb;
  if (!kb) return;
  const next = applyKey(kb.buffer, code, kb.caps);
  if (next.done === 'cancel') return useSimKeyboard.setState({ kb: null });
  if (next.done === 'ok') {
    useSimKeyboard.setState({ kb: null });
    return finishTouch(kb.control, kb.apply(next.buffer));
  }
  useSimKeyboard.setState({ kb: { ...kb, buffer: next.buffer, caps: next.caps } });
}

async function finishTouch(c: ControlInstance, r: TouchResult) {
  if (r.note) toast(r.note);
  bumpSim();
  const { connected, role, link } = useComm.getState();
  if (r.upload && connected) {
    if (role === 'screen') {
      // Como la pantalla real: sube el valor al MCU con una trama 0x83
      await send(readReply(r.upload.vp, simMem.mem.bytes(r.upload.vp, r.upload.words * 2), link), `Toque «${c.name}»: subir VP 0x${r.upload.vp.toString(16).toUpperCase()}`);
    } else {
      // Contra una pantalla real: escribe el nuevo valor
      await send(writeVp(r.upload.vp, simMem.mem.bytes(r.upload.vp, r.upload.words * 2), link));
    }
  }
  if (r.page != null) showSimPage(r.page);
}
