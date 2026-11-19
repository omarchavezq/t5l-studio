import type { PackageFile } from './package';

/** ZIP sin compresión (PKZIP 2.0). Conserva los bytes binarios y una sola carpeta DWIN_SET. */
export function dwinSetZip(files: PackageFile[]): Uint8Array {
  if (files.some((f) => /[\\/]/.test(f.name))) throw new Error('Nombre de archivo ZIP no válido.');
  return storedZip(files.map((f) => ({ ...f, name: `DWIN_SET/${f.name}` })));
}

/** Contenedor ZIP para salidas agrupadas, con rutas relativas verificadas. */
export function storedZip(files: PackageFile[]): Uint8Array {
  if (files.length > 65535) throw new Error('Demasiados archivos para el paquete ZIP.');
  const names = new Set<string>();
  const encoder = new TextEncoder();
  const entries = files.map((f) => {
    if (!f.name || /[\\:\x00]/.test(f.name) || f.name.split('/').some((p) => !p || p === '.' || p === '..')) throw new Error('Nombre de archivo ZIP no válido.');
    if (names.has(f.name.toLowerCase())) throw new Error('Nombre de archivo ZIP repetido.');
    names.add(f.name.toLowerCase());
    const name = encoder.encode(f.name);
    if (name.length > 65535) throw new Error('Nombre de archivo demasiado largo.');
    return { ...f, name, crc: crc32(f.data), offset: 0 };
  });
  const localSize = entries.reduce((n, f) => n + 30 + f.name.length + f.data.length, 0);
  const centralSize = entries.reduce((n, f) => n + 46 + f.name.length, 0);
  if (localSize + centralSize + 22 > 0xffffffff) throw new Error('El paquete supera el límite del formato ZIP.');
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let at = 0;
  for (const f of entries) {
    f.offset = at;
    view.setUint32(at, 0x04034b50, true);
    view.setUint16(at + 4, 20, true);
    view.setUint16(at + 6, 0x0800, true); // nombres UTF-8
    view.setUint16(at + 12, 0x21, true); // 1980-01-01, fecha mínima DOS
    view.setUint32(at + 14, f.crc, true);
    view.setUint32(at + 18, f.data.length, true);
    view.setUint32(at + 22, f.data.length, true);
    view.setUint16(at + 26, f.name.length, true);
    out.set(f.name, at + 30);
    out.set(f.data, at + 30 + f.name.length);
    at += 30 + f.name.length + f.data.length;
  }
  for (const f of entries) {
    view.setUint32(at, 0x02014b50, true);
    view.setUint16(at + 4, 20, true);
    view.setUint16(at + 6, 20, true);
    view.setUint16(at + 8, 0x0800, true);
    view.setUint16(at + 14, 0x21, true);
    view.setUint32(at + 16, f.crc, true);
    view.setUint32(at + 20, f.data.length, true);
    view.setUint32(at + 24, f.data.length, true);
    view.setUint16(at + 28, f.name.length, true);
    view.setUint32(at + 42, f.offset, true);
    out.set(f.name, at + 46);
    at += 46 + f.name.length;
  }
  view.setUint32(at, 0x06054b50, true);
  view.setUint16(at + 8, entries.length, true);
  view.setUint16(at + 10, entries.length, true);
  view.setUint32(at + 12, centralSize, true);
  view.setUint32(at + 16, localSize, true);
  return out;
}

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of data) {
    crc ^= b;
    for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
