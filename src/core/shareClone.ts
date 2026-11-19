// Copia profunda para el historial de deshacer. Copia objetos y listas pero comparte los textos:
// en JavaScript son inmutables, así que los recursos en base64 (imágenes, fuentes, ICL) no se
// duplican en cada paso. structuredClone sí los copiaba.

export function shareClone<T>(v: T): T {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(shareClone) as T;
  if (Object.getPrototypeOf(v) !== Object.prototype) return structuredClone(v); // Uint8Array, Map…: copia normal
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v)) out[k] = shareClone((v as Record<string, unknown>)[k]);
  return out as T;
}
