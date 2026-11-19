// Proyectos recientes para la pantalla de bienvenida.
// En la app instalada se usan los archivos (lista del proceso principal). En el navegador no se
// puede reabrir un archivo del disco, así que se guarda una copia del proyecto en IndexedDB.

import { deserialize, serialize } from '../core/project';
import type { Project } from '../core/types';
import { useStore } from './store';

export interface RecentEntry {
  /** Ruta del archivo (app instalada) o clave interna (navegador). */
  key: string;
  name: string;
  time: number;
  /** Texto descriptivo: carpeta, o «Guardado en este navegador». */
  where: string;
  pages?: number;
  size?: string;
  browser: boolean;
}

const DB = 'dgus-studio';
const STORE = 'recientes';
const MAX = 12;

interface Stored {
  key: string;
  name: string;
  time: number;
  pages: number;
  text: string;
}

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('Sin IndexedDB'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise<T>((resolve, reject) => {
    const r = fn(d.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

const sizeOf = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export async function listRecent(): Promise<RecentEntry[]> {
  if (window.dgus?.recentList) {
    const list = await window.dgus.recentList().catch(() => []);
    return list.map((r) => ({ key: r.path, name: r.name, time: r.time, where: r.path.replace(/[\\/][^\\/]*$/, ''), browser: false }));
  }
  try {
    const all = (await tx<Stored[]>('readonly', (s) => s.getAll())) ?? [];
    return all
      .sort((a, b) => b.time - a.time)
      .map((r) => ({ key: r.key, name: r.name, time: r.time, where: 'Guardado en este navegador', pages: r.pages, size: sizeOf(r.text.length), browser: true }));
  } catch {
    return [];
  }
}

/** Copia del proyecto en el navegador (la clave es el nombre: abrir o guardar de nuevo lo actualiza). */
export async function rememberProject(p: Project): Promise<void> {
  if (window.dgus) return;
  try {
    const entry: Stored = { key: p.name.trim().toLowerCase() || 'sin título', name: p.name, time: Date.now(), pages: p.pages.length, text: serialize(p) };
    await tx('readwrite', (s) => s.put(entry));
    const all = (await tx<Stored[]>('readonly', (s) => s.getAll())) ?? [];
    for (const old of all.sort((a, b) => b.time - a.time).slice(MAX)) await tx('readwrite', (s) => s.delete(old.key));
  } catch {
    /* sin almacenamiento (modo privado, cuota llena): la lista no es crítica */
  }
}

export async function loadBrowserRecent(key: string): Promise<Project | null> {
  try {
    const r = await tx<Stored | undefined>('readonly', (s) => s.get(key));
    return r ? deserialize(r.text) : null;
  } catch {
    return null;
  }
}

export async function forgetBrowserRecent(key: string): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(key));
  } catch {
    /* nada que borrar */
  }
}

/** En el navegador, recuerda cada proyecto al abrirlo, crearlo o guardarlo. */
export function watchRecent() {
  if (window.dgus) return () => {};
  return useStore.subscribe((s, prev) => {
    const loaded = s.documentId !== prev.documentId && !s.welcome;
    const saved = prev.dirty && !s.dirty && s.documentId === prev.documentId;
    if (loaded || saved) void rememberProject(s.project);
  });
}
