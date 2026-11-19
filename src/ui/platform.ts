// Acceso a archivos: usa Electron si está disponible y, si no, el navegador.
import { dwinSetZip } from '../core/zip';

export interface OutFile {
  name: string;
  data: Uint8Array | string;
}

interface ElectronApi {
  openProject(): Promise<{ path: string; text: string } | null>;
  saveProject(path: string | null, text: string): Promise<string | null>;
  exportFiles(files: { name: string; data: Uint8Array }[]): Promise<string | null>;
  openImages(): Promise<{ name: string; dataUrl: string }[]>;
  openFolder(): Promise<FolderInput | null>;
  onSerialPorts(cb: (list: SerialPortChoice[]) => void): () => void;
  chooseSerialPort(portId: string): void;
  onOpenFile(cb: (f: { path: string; text: string }) => void): void;
  recentList(): Promise<RecentProject[]>;
  openRecent(path: string): Promise<{ path: string; text: string | null } | null>;
  saveFile(name: string, data: Uint8Array | string): Promise<string | null>;
}

interface FolderInput { folder: string; files: { name: string; data: Uint8Array }[]; metadata?: { name: string; data: Uint8Array }[] }

export interface RecentProject {
  path: string;
  name: string;
  time: number;
}

export interface SerialPortChoice {
  portId: string;
  portName: string;
  displayName?: string;
  vendorId?: string;
  productId?: string;
}

declare global {
  interface Window {
    dgus?: ElectronApi;
  }
}

export const isElectron = () => typeof window !== 'undefined' && !!window.dgus;

function pick(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.oncancel = () => resolve([]);
    input.click();
  });
}

export async function openBinaryFiles(accept: string, multiple = false): Promise<{ name: string; data: Uint8Array }[]> {
  const files = await pick(accept, multiple);
  if (files.some((f) => f.size > 64 * 1024 * 1024) || files.reduce((n, f) => n + f.size, 0) > 128 * 1024 * 1024) throw new Error('La selección supera 64 MB por archivo o 128 MB en conjunto.');
  return Promise.all(files.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) })));
}

function download(name: string, data: Uint8Array | string) {
  const blob = new Blob([data], { type: typeof data === 'string' ? 'application/json' : 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const readAsDataUrl = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });

export async function openProjectFile(): Promise<{ path: string | null; text: string } | null> {
  if (window.dgus) return window.dgus.openProject();
  const [f] = await pick('.dgusx,.json', false);
  if (!f) return null;
  return { path: null, text: await f.text() };
}

export async function saveProjectFile(path: string | null, name: string, text: string): Promise<string | null> {
  if (window.dgus) return window.dgus.saveProject(path, text);
  download(`${name || 'proyecto'}.dgusx`, text);
  return null;
}

export async function exportFiles(files: { name: string; data: Uint8Array }[]): Promise<string | null> {
  if (window.dgus) return window.dgus.exportFiles(files);
  download('DWIN_SET.zip', dwinSetZip(files));
  return 'DWIN_SET.zip (extraiga la carpeta DWIN_SET para cargarla por SD)';
}

export async function openImages(): Promise<{ name: string; dataUrl: string }[]> {
  if (window.dgus) return window.dgus.openImages();
  const files = await pick('image/*', true);
  return Promise.all(files.map(async (f) => ({ name: f.name, dataUrl: await readAsDataUrl(f) })));
}

/** Convierte un dataURL a JPEG del tamaño de la pantalla (para DWIN_SET). */
export async function toJpeg(dataUrl: string, w: number, h: number, quality = 0.92): Promise<Uint8Array> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  g.drawImage(img, 0, 0, w, h);
  const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', quality));
  return new Uint8Array(await blob.arrayBuffer());
}

/** Elige una carpeta DWIN_SET (o la del proyecto que la contiene) y devuelve sus archivos. */
export async function openFolder(): Promise<FolderInput | null> {
  if (window.dgus) return window.dgus.openFolder();
  const files = await new Promise<File[]>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    (input as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.oncancel = () => resolve([]);
    input.click();
  });
  if (!files.length) return null;
  const rel = (f: File) => (f as File & { webkitRelativePath: string }).webkitRelativePath || f.name;
  const inSet = files.filter((f) => /(^|\/)DWIN_SET\/[^/]+$/i.test(rel(f)));
  const top = rel(files[0]).split('/')[0];
  const chosen = inSet.length ? inSet : files.filter((f) => rel(f).split('/').length === 2);
  const metadata = []; let metadataBytes = 0;
  for (const f of files) {
    if (!/(^|\/)(DWprj\.hmi|DWprj\.tft|TFT\/[^/]+\.tft)$/i.test(rel(f)) || f.size > 32 * 1024 * 1024 || metadataBytes + f.size > 64 * 1024 * 1024 || metadata.length >= 4094) continue;
    metadataBytes += f.size;
    metadata.push({ name: rel(f), data: new Uint8Array(await f.arrayBuffer()) });
  }
  return {
    folder: top,
    files: await Promise.all(chosen.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) }))),
    metadata,
  };
}

/** Prepara un JPEG apto para ICL: reutiliza el JPEG si ya es baseline a color del tamaño pedido; si no, lo recodifica. */
export async function iclJpeg(dataUrl: string, w: number | null, h: number | null, quality: number): Promise<{ jpeg: Uint8Array; width: number; height: number }> {
  const { jpegInfo } = await import('../core/icl');
  const { fromBase64 } = await import('../core/bytes');
  const m = /^data:image\/jpeg;base64,(.*)$/.exec(dataUrl);
  if (m) {
    const bytes = fromBase64(m[1]);
    const info = jpegInfo(bytes);
    if (info && !info.progressive && info.sampling.split(',').length === 3 && (w == null || h == null || (Math.abs(info.width - w) <= 4 && Math.abs(info.height - h) <= 4))) {
      return { jpeg: bytes, width: info.width, height: info.height };
    }
  }
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const W = w ?? img.naturalWidth;
  const H = h ?? img.naturalHeight;
  return { jpeg: await toJpeg(dataUrl, W, H, quality), width: W, height: H };
}

/** Guarda un archivo suelto (CSV, .h…): diálogo en Electron, descarga en el navegador. */
export async function saveSingleFile(name: string, data: Uint8Array | string): Promise<string | null> {
  if (window.dgus?.saveFile) return window.dgus.saveFile(name, data);
  download(name, data);
  return 'Descargas del navegador';
}
