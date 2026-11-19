// Red WiFi-10 / DWIN Cloud: Frm_NetConfig de V7.651 y guía DGUS II, sección 5.3.
export const NETWORK_FIELDS = [
  { key: 'manufacturer', label: 'ID del fabricante', vp: 0x411, bytes: 4, hex: true },
  { key: 'deviceType', label: 'Clase de dispositivo', vp: 0x413, bytes: 2, hex: true },
  { key: 'deviceNumber', label: 'Número de dispositivo', vp: 0x414, bytes: 4, hex: true },
  { key: 'description', label: 'Descripción del dispositivo', vp: 0x416, bytes: 52, hex: false },
  { key: 'communication', label: 'Información de comunicación', vp: 0x480, bytes: 20, hex: false },
  { key: 'mac', label: 'Dirección MAC y datos asociados', vp: 0x48a, bytes: 8, hex: true },
  { key: 'communicationSettings', label: 'Configuración de comunicación', vp: 0x48e, bytes: 4, hex: true },
  { key: 'configuration', label: 'Configuración de red', vp: 0x498, bytes: 8, hex: true },
  { key: 'state', label: 'Estado de red', vp: 0x4a5, bytes: 6, hex: true },
  { key: 'ssid', label: 'SSID', vp: 0x4b0, bytes: 31, hex: false },
  { key: 'serial', label: 'SN / clave de red', vp: 0x4c0, bytes: 31, hex: false },
] as const;
export type NetworkKey = typeof NETWORK_FIELDS[number]['key'];
/** Solo campos editados: los restantes, incluidos sus terminadores, conservan sus bytes. */
export interface NetworkSettings { enabled?: boolean; fields: Partial<Record<NetworkKey, string>> }

export function readNetwork(data: Uint8Array): { enabled: boolean; fields: Record<NetworkKey, string> } {
  const fields = {} as Record<NetworkKey, string>;
  for (const f of NETWORK_FIELDS) {
    const bytes = data.slice(f.vp * 2, f.vp * 2 + f.bytes);
    fields[f.key] = f.hex ? [...bytes].map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ') : String.fromCharCode(...bytes).replace(/\0+$/, '');
  }
  return { enabled: data[0x800] === 0x5a && data[0x801] === 0xa5, fields };
}

export function checkNetwork(model: NetworkSettings): string[] {
  const errors: string[] = [];
  for (const key of Object.keys(model.fields)) if (!NETWORK_FIELDS.some((f) => f.key === key)) errors.push(`Campo de red desconocido: ${key}.`);
  for (const f of NETWORK_FIELDS) {
    const value = model.fields[f.key]; if (value == null) continue;
    if (f.hex ? !new RegExp(`^(?:[0-9a-f]{2}\\s*){${f.bytes}}$`, 'i').test(value.trim()) : value.length > f.bytes || /[^\x00-\xff]/.test(value)) {
      errors.push(`${f.label}: ${f.hex ? `introduzca exactamente ${f.bytes} bytes hexadecimales` : `admite hasta ${f.bytes} caracteres de 8 bits`}.`);
    }
  }
  return errors;
}

export function applyNetwork(base: Uint8Array, model: NetworkSettings): Uint8Array {
  const errors = checkNetwork(model); if (errors.length) throw new Error(errors.join('\n'));
  const out = new Uint8Array(Math.max(base.length, 0xa00)); out.set(base);
  if (model.enabled && !readNetwork(base).enabled) {
    // Valores escritos por btnSave_Click; no se pisan configuraciones existentes.
    out.set([0x5a, 0x4c], 0x820);
    out.set([1, 44, 16, 0, 0, 4, 32, 0, 0, 4, 0, 0], 0x860);
    out.set([90, 165, 0, 100, 90, 0, 0, 0, 0, 0, 16, 0], 0x870);
    out.set([90, 0, 8, 176], 0x894);
  }
  if (model.enabled != null) out.set(model.enabled ? [0x5a, 0xa5] : [0, 0], 0x800);
  for (const f of NETWORK_FIELDS) {
    const value = model.fields[f.key]; if (value == null) continue;
    const bytes = f.hex ? Uint8Array.from(value.replace(/\s/g, '').match(/../g)!.map((b) => parseInt(b, 16))) : Uint8Array.from(value, (c) => c.charCodeAt(0));
    out.fill(0, f.vp * 2, f.vp * 2 + f.bytes);
    out.set(bytes, f.vp * 2);
  }
  return out;
}
