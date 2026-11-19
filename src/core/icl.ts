// Bibliotecas de imágenes .ICL de DGUS II (T5L), formato "DGUS_3".
// Reproduce BizDraw.Utils.ICL de DGUS V7.651 y se verificó con archivos .icl reales.
//
//  0x00  "DGUS_3"
//  0x06  CRC16 Modbus (byte bajo, byte alto) de todo lo que sigue a partir del byte 8
//  0x08  Tamaño del archivo - 8 (u32)
//  0x0C  04
//  0x0D  Último ID (u16)
//  0x0F  00
//  0x10  Índice: (último ID + 1) × u32 = desplazamiento de cada imagen (0 = no existe)
//  ...   Registros de imagen, alineados a 4 bytes:
//        ancho u16 · alto u16 · largo de cabecera JPEG u16 · largo de datos u32 · JPEG
//        La cabecera JPEG termina justo antes de los datos del escaneo y se rellena con 00
//        (ampliando el segmento SOS) para que los datos empiecen alineados a 4 bytes.
//        Tras el JPEG van 8 bytes 00 y relleno hasta múltiplo de 4.

export interface IclImage {
  id: number;
  width: number;
  height: number;
  /** JPEG estándar (sin el relleno de DGUS), listo para mostrarse. */
  jpeg: Uint8Array;
}

export function crc16Modbus(data: Uint8Array, start = 0): number {
  let crc = 0xffff;
  for (let i = start; i < data.length; i++) {
    crc ^= data[i];
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
  }
  return crc;
}

const u16 = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32 = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];

export function isIcl(b: Uint8Array): boolean {
  return b.length >= 16 && String.fromCharCode(...b.slice(0, 6)) === 'DGUS_3' && b[12] === 4;
}

export function parseIcl(b: Uint8Array): { images: IclImage[]; crcOk: boolean } {
  if (!isIcl(b)) throw new Error('No es un archivo ICL de DGUS II (cabecera DGUS_3).');
  const crc = crc16Modbus(b, 8);
  const crcOk = b[6] === (crc & 0xff) && b[7] === crc >> 8;
  const maxId = u16(b, 13);
  const images: IclImage[] = [];
  for (let id = 0; id <= maxId; id++) {
    const off = u32(b, 16 + id * 4);
    if (!off || off + 10 > b.length) continue;
    const width = u16(b, off);
    const height = u16(b, off + 2);
    const hl = u16(b, off + 4);
    const dl = u32(b, off + 6);
    let raw = b.slice(off + 10, off + 10 + hl + dl);
    // Quita los 8 ceros y el relleno que DGUS añade tras el fin de imagen (FF D9)
    let end = raw.length;
    while (end > hl + 2 && !(raw[end - 2] === 0xff && raw[end - 1] === 0xd9)) end--;
    if (end > hl + 2) raw = raw.slice(0, end);
    images.push({ id, width, height, jpeg: unpadJpeg(raw, hl) });
  }
  return { images, crcOk };
}

/** Quita el relleno FF del segmento SOS que DGUS añade para alinear (igual que frm_ICON_Sel). */
function unpadJpeg(raw: Uint8Array, headerLen: number): Uint8Array {
  let sos = -1;
  for (let i = headerLen - 1; i > 0; i--) {
    if (raw[i] === 0xda && raw[i - 1] === 0xff) {
      sos = i - 1;
      break;
    }
  }
  if (sos < 0) return raw;
  const segLen = u16(raw, sos + 2);
  const ns = raw[sos + 4];
  const proper = 6 + 2 * ns;
  const extra = segLen - proper;
  if (extra <= 0) return raw;
  const out = new Uint8Array(raw.length - extra);
  out.set(raw.subarray(0, sos + 2 + proper), 0);
  out[sos + 2] = proper >> 8;
  out[sos + 3] = proper & 0xff;
  out.set(raw.subarray(sos + 2 + segLen), sos + 2 + proper);
  return out;
}

/** Datos del marcador SOF de un JPEG: tamaño, tipo y submuestreo. */
export function jpegInfo(j: Uint8Array): { width: number; height: number; progressive: boolean; sampling: string } | null {
  if (j[0] !== 0xff || j[1] !== 0xd8) return null;
  let i = 2;
  while (i + 4 < j.length) {
    if (j[i] !== 0xff) {
      i++;
      continue;
    }
    const m = j[i + 1];
    if (m === 0xc0 || m === 0xc1 || m === 0xc2) {
      const n = j[i + 9];
      const s: string[] = [];
      for (let k = 0; k < n; k++) {
        const v = j[i + 11 + k * 3];
        s.push(`${v >> 4}x${v & 15}`);
      }
      return { height: u16(j, i + 5), width: u16(j, i + 7), progressive: m === 0xc2, sampling: s.join(',') };
    }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) {
      i += m === 0xff ? 1 : 2;
      continue;
    }
    i += 2 + u16(j, i + 2);
  }
  return null;
}

/** Empaqueta un JPEG en un registro ICL (ICL.pack1Img). */
export function packImage(jpeg: Uint8Array, width: number, height: number): Uint8Array {
  const rec: number[] = [width >> 8, width & 0xff, height >> 8, height & 0xff, 0, 0, 0, 0, 0, 0];
  for (const x of jpeg) rec.push(x);
  let sos = -1;
  for (let i = 10; i + 1 < rec.length; i++) {
    if (rec[i] === 0xff && rec[i + 1] === 0xda) {
      sos = i;
      break;
    }
  }
  if (sos < 0) throw new Error('El JPEG no tiene segmento SOS.');
  if (rec[sos + 4] !== 3) throw new Error('El JPEG debe ser a color (3 componentes).');
  let dataStart = sos + 2 + 12;
  const mis = dataStart % 4;
  if (mis > 0) {
    const pad = 4 - mis;
    rec.splice(dataStart, 0, ...new Array(pad).fill(0)); // los .icl reales usan 00
    dataStart += pad;
    rec[sos + 3] = (rec[sos + 3] + pad) & 0xff;
  }
  rec.push(0, 0, 0, 0, 0, 0, 0, 0);
  let dataLen = rec.length - dataStart;
  while (dataLen % 4) {
    rec.push(0);
    dataLen++;
  }
  const hl = dataStart - 10;
  rec[4] = hl >> 8;
  rec[5] = hl & 0xff;
  rec[6] = (dataLen >>> 24) & 0xff;
  rec[7] = (dataLen >>> 16) & 0xff;
  rec[8] = (dataLen >>> 8) & 0xff;
  rec[9] = dataLen & 0xff;
  return Uint8Array.from(rec);
}

/**
 * Construye un .ICL. `iclId` es el número del archivo (32 para 32.icl): sirve para evitar
 * que una imagen cruce un límite de 16 MB de la memoria flash, como hace DGUS.
 */
export function buildIcl(images: { id: number; width: number; height: number; jpeg: Uint8Array }[], iclId: number): Uint8Array {
  if (!images.length) throw new Error('El ICL no tiene imágenes.');
  const byId = new Map(images.map((x) => [x.id, x]));
  const maxId = Math.max(...images.map((x) => x.id));
  const indexStart = 16;
  const dataStart = indexStart + (maxId + 1) * 4;
  const index = new Uint8Array((maxId + 1) * 4);
  const chunks: Uint8Array[] = [];
  let dataLen = 0;
  const base = iclId * 262144;
  for (let id = 0; id <= maxId; id++) {
    const img = byId.get(id);
    if (!img) continue;
    const rec = packImage(img.jpeg, img.width, img.height);
    let off = dataStart + dataLen;
    const first = base + off;
    const last = first + rec.length - 1;
    if (Math.floor(first / 0x1000000) !== Math.floor(last / 0x1000000)) {
      const target = Math.floor(last / 0x1000000) * 0x1000000 - base;
      const pad = target - off;
      if (pad > 0) {
        chunks.push(new Uint8Array(pad));
        dataLen += pad;
        off += pad;
      }
    }
    index[id * 4] = (off >>> 24) & 0xff;
    index[id * 4 + 1] = (off >>> 16) & 0xff;
    index[id * 4 + 2] = (off >>> 8) & 0xff;
    index[id * 4 + 3] = off & 0xff;
    chunks.push(rec);
    dataLen += rec.length;
  }
  const out = new Uint8Array(dataStart + dataLen);
  out.set([0x44, 0x47, 0x55, 0x53, 0x5f, 0x33], 0);
  const size = out.length - 8;
  out[8] = (size >>> 24) & 0xff;
  out[9] = (size >>> 16) & 0xff;
  out[10] = (size >>> 8) & 0xff;
  out[11] = size & 0xff;
  out[12] = 4;
  out[13] = maxId >> 8;
  out[14] = maxId & 0xff;
  out[15] = 0;
  out.set(index, indexStart);
  let o = dataStart;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  const crc = crc16Modbus(out, 8);
  out[6] = crc & 0xff;
  out[7] = crc >> 8;
  return out;
}

/** "32.icl" -> 32 */
export function iclIdFromName(name: string): number | null {
  const m = /^(\d+)/.exec(name.split(/[\\/]/).pop() ?? '');
  return m ? parseInt(m[1], 10) : null;
}
