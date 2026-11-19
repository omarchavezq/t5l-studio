// Convierte las imágenes de las bibliotecas ICL del proyecto en URLs para mostrarlas.

import { fromBase64 } from '../core/bytes';
import { parseIcl, type IclImage } from '../core/icl';
import { useStore } from './store';

interface LibEntry {
  source: string;
  images: Map<number, IclImage & { url?: string }>;
}

const libs = new Map<number, LibEntry>();

function lib(id: number, b64: string | undefined): LibEntry | null {
  if (!b64) return null;
  const cached = libs.get(id);
  if (cached && cached.source === b64) return cached;
  if (cached) for (const img of cached.images.values()) if (img.url) URL.revokeObjectURL(img.url);
  try {
    const { images } = parseIcl(fromBase64(b64));
    const entry = { source: b64, images: new Map(images.map((i) => [i.id, { ...i }])) };
    libs.set(id, entry);
    return entry;
  } catch {
    return null;
  }
}

export function iclImage(libId: number, iconId: number): { url: string; width: number; height: number } | null {
  const b64 = useStore.getState().project.icl?.[libId];
  const entry = lib(libId, b64);
  const img = entry?.images.get(iconId);
  if (!img) return null;
  img.url ??= URL.createObjectURL(new Blob([img.jpeg], { type: 'image/jpeg' }));
  return { url: img.url, width: img.width, height: img.height };
}

export function iclList(libId: number): { id: number; url: string; width: number; height: number }[] {
  const entry = lib(libId, useStore.getState().project.icl?.[libId]);
  if (!entry) return [];
  return [...entry.images.keys()].map((id) => ({ id, ...iclImage(libId, id)! }));
}

/** Qué icono representa a cada control en el lienzo: [propiedad de biblioteca, propiedad de icono]. */
export const ICON_PREVIEW: Record<string, [string, string]> = {
  iconVar: ['iconLib', 'iconMin'],
  multiLanguage: ['iconLib', 'iconMin'],
  bitIcon: ['iconLib', 'icon0s'],
  animIcon: ['iconLib', 'iconStart'],
  artVar: ['iconLib', 'icon0'],
  iconRotate: ['iconLib', 'iconId'],
  sliderShow: ['iconLib', 'iconId'],
  iconPan: ['iconLib', 'iconId'],
};
