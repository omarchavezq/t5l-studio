// Lector de registros MS-NRBF. No carga assemblies, instancia tipos ni ejecuta código .NET.
export type NrbfValue = null | string | number | boolean | NrbfRef | NrbfObject | NrbfValue[] | Uint8Array;
export interface NrbfRef { ref: number }
export interface NrbfObject { type: string; fields: Record<string, NrbfValue> }
interface Nulls { nulls: number }
interface Schema { name: string; members: string[]; types: number[]; info: (number | string | null)[] }

export function readNrbf(data: Uint8Array): { root: NrbfValue; objects: Map<number, NrbfValue>; deref: (v: NrbfValue | undefined) => NrbfValue | undefined } {
  if (data.length > 32 * 1024 * 1024) throw new Error('El archivo TFT supera 32 MB.');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let at = 0, records = 0, elements = 0;
  const need = (n: number) => { if (!Number.isSafeInteger(n) || n < 0 || at + n > data.length) throw new Error('Registro NRBF truncado.'); };
  const u8 = () => { need(1); return data[at++]; };
  const i32 = () => { need(4); const n = view.getInt32(at, true); at += 4; return n; };
  const count = (n: number, max = 1000000) => { if (!Number.isInteger(n) || n < 0 || n > max || (elements += n) > 2000000) throw new Error('Tamaño NRBF fuera del límite.'); return n; };
  const str = () => {
    let n = 0, shift = 0, b = 0;
    do { if (shift >= 35) throw new Error('Longitud NRBF no válida.'); b = u8(); n += (b & 127) * 2 ** shift; shift += 7; } while (b & 128);
    if (n > 4 * 1024 * 1024) throw new Error('Cadena NRBF demasiado grande.'); need(n);
    const result = new TextDecoder('utf-8', { fatal: true }).decode(data.subarray(at, at + n)); at += n; return result;
  };
  const primitive = (kind: number): NrbfValue => {
    if (kind === 17) return null;
    if (kind === 5 || kind === 18) return str();
    if (kind === 1) return !!u8();
    if (kind === 2) return u8();
    if (kind === 10) { const n = u8(); return n > 127 ? n - 256 : n; }
    if (kind === 3) {
      need(1); const n = data[at] < 128 ? 1 : data[at] < 224 ? 2 : 3; need(n);
      const s = new TextDecoder('utf-8', { fatal: true }).decode(data.subarray(at, at + n)); at += n; return s;
    }
    const sizes: Record<number, number> = { 6: 8, 7: 2, 8: 4, 9: 8, 11: 4, 12: 8, 13: 8, 14: 2, 15: 4, 16: 8 };
    const size = sizes[kind]; if (!size) throw new Error(`Primitivo NRBF ${kind} no admitido.`); need(size);
    const n = kind === 6 ? view.getFloat64(at, true) : kind === 7 ? view.getInt16(at, true) : kind === 8 ? view.getInt32(at, true) : kind === 11 ? view.getFloat32(at, true) : kind === 14 ? view.getUint16(at, true) : kind === 15 ? view.getUint32(at, true) : kind === 16 ? view.getBigUint64(at, true).toString() : view.getBigInt64(at, true).toString();
    at += size; return n;
  };
  if (u8() !== 0) throw new Error('No es una cabecera NRBF.');
  const rootId = i32(); i32(); if (i32() !== 1 || i32() !== 0) throw new Error('Versión NRBF no admitida.');
  const objects = new Map<number, NrbfValue>(); const schemas = new Map<number, Schema>();
  const put = (id: number, value: NrbfValue) => { if (objects.has(id)) throw new Error('ID NRBF repetido.'); objects.set(id, value); return value; };
  const extraInfo = (type: number): number | string | null => {
    if (type === 0 || type === 7) return u8();
    if (type === 3) return str();
    if (type === 4) { const name = str(); i32(); return name; }
    if ([1, 2, 5, 6].includes(type)) return null;
    throw new Error('Tipo de miembro NRBF no admitido.');
  };
  const array = (id: number, n: number, type: number, info: number | string | null, depth: number): NrbfValue => {
    count(n);
    if (type === 0 && info === 2) { need(n); const bytes = data.slice(at, at + n); at += n; return put(id, bytes); }
    const values: NrbfValue[] = []; put(id, values);
    while (values.length < n) {
      const v = type === 0 ? primitive(Number(info)) : record(depth + 1);
      if (v && typeof v === 'object' && 'nulls' in v) {
        if (!v.nulls || values.length + v.nulls > n) throw new Error('Repetición nula NRBF fuera del array.');
        for (let i = 0; i < v.nulls; i++) values.push(null);
      } else values.push(v as NrbfValue);
    }
    return values;
  };
  const classValues = (id: number, schema: Schema, depth: number): NrbfObject => {
    const out: NrbfObject = { type: schema.name, fields: Object.create(null) }; put(id, out);
    for (let i = 0; i < schema.members.length; i++) {
      const v = schema.types[i] === 0 ? primitive(Number(schema.info[i])) : record(depth + 1);
      if (v && typeof v === 'object' && 'nulls' in v) throw new Error('Nulos múltiples fuera de un array.');
      out.fields[schema.members[i]] = v as NrbfValue;
    }
    return out;
  };
  const record = (depth: number): NrbfValue | Nulls => {
    if (++records > 200000 || depth > 128) throw new Error('Demasiados registros o niveles NRBF.');
    const kind = u8();
    if (kind === 12) { i32(); str(); return record(depth); }
    if (kind === 6) { const id = i32(); return put(id, str()); }
    if (kind === 9) return { ref: i32() };
    if (kind === 10) return null;
    if (kind === 13) return { nulls: u8() };
    if (kind === 14) return { nulls: count(i32()) };
    if (kind === 8) return primitive(u8());
    if (kind === 1) { const id = i32(), schema = schemas.get(i32()); if (!schema) throw new Error('Esquema NRBF ausente.'); return classValues(id, schema, depth); }
    if (kind === 4 || kind === 5) {
      const id = i32(), name = str(), n = count(i32(), 4096);
      const members = Array.from({ length: n }, str), types = Array.from({ length: n }, u8), info = types.map(extraInfo);
      if (new Set(members).size !== n) throw new Error('Miembro NRBF repetido.');
      if (kind === 5) i32();
      const schema = { name, members, types, info }; schemas.set(id, schema); return classValues(id, schema, depth);
    }
    if (kind === 15) { const id = i32(), n = i32(), primitiveType = u8(); return array(id, n, 0, primitiveType, depth); }
    if (kind === 16 || kind === 17) { const id = i32(), n = i32(); return array(id, n, kind === 17 ? 1 : 2, null, depth); }
    if (kind === 7) {
      const id = i32(), shape = u8(), rank = count(i32(), 8);
      if (!rank || shape > 5) throw new Error('Forma NRBF no admitida.');
      const lengths = Array.from({ length: rank }, i32); let n = 1;
      for (const len of lengths) { if (len < 0 || (n *= len) > 1000000) throw new Error('Array NRBF demasiado grande.'); }
      if (shape >= 3) for (let i = 0; i < rank; i++) i32();
      const type = u8(); return array(id, n, type, extraInfo(type), depth);
    }
    throw new Error(`Registro NRBF ${kind} no admitido.`);
  };
  while (at < data.length && data[at] !== 11) record(0);
  if (u8() !== 11 || !objects.has(rootId)) throw new Error('Fin o raíz NRBF ausente.');
  const deref = (value: NrbfValue | undefined): NrbfValue | undefined => {
    const seen = new Set<number>();
    while (value && typeof value === 'object' && 'ref' in value) { if (seen.has(value.ref)) return undefined; seen.add(value.ref); value = objects.get(value.ref); }
    return value;
  };
  return { root: objects.get(rootId)!, objects, deref };
}
