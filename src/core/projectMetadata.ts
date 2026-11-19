import { buildProject, xorObfuscate } from './build';
import { getDef } from './controls';
import { readNrbf, type NrbfObject, type NrbfValue } from './nrbf';
import type { Project } from './types';

export interface MetadataFile { name: string; data: Uint8Array }
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
const object = (v: NrbfValue | undefined): NrbfObject | null => v && typeof v === 'object' && 'type' in v ? v : null;

/** DWprj.hmi es un INI; los documentos BinaryFormatter están en DWprj.tft y TFT/*.tft. */
export function restoreProjectMetadata(source: Project, files: MetadataFile[]): { project: Project; notes: string[] } {
  const p = structuredClone(source); const notes: string[] = [];
  const manifest = files.find((f) => /(^|\/)DWprj\.hmi$/i.test(f.name.replace(/\\/g, '/')));
  const pageIds = new Map<string, number>();
  if (manifest) {
    const text = new TextDecoder().decode(manifest.data); let section = '';
    for (const line of text.split(/\r?\n/)) {
      const s = /^\s*\[([^\]]+)\]/.exec(line); if (s) { section = s[1].toUpperCase(); continue; }
      const field = /^\s*([^=]+)=(.*)$/.exec(line); if (!field) continue;
      if (section === 'IMG' && /^\d+$/.test(field[1].trim())) pageIds.set(`${field[2].trim()}.tft`.toLowerCase(), Number(field[1]));
    }
  }
  let matched = 0, sizes = 0, ignored = 0;
  for (const f of files.filter((f) => /\.tft$/i.test(f.name) && !/(^|[/\\])DWprj\.tft$/i.test(f.name))) {
    try {
      const raw = f.data[0] === 0 ? f.data : xorObfuscate(f.data);
      const graph = readNrbf(raw); const doc = object(graph.deref(graph.root));
      if (!doc || doc.type !== 'BizDraw.Core.Document') { ignored++; continue; }
      const baseName = f.name.split(/[/\\]/).pop()!.toLowerCase();
      const id = pageIds.get(baseName) ?? Number(graph.deref(doc.fields.ImageIndex));
      const page = p.pages.find((page) => page.id === id); if (!page) { ignored++; continue; }
      const pageName = graph.deref(doc.fields.Name); if (typeof pageName === 'string' && pageName.trim()) page.name = pageName;
      const used = new Set<string>();
      for (const value of graph.objects.values()) {
        const rect = object(value); if (rect?.type !== 'BizDraw.Objects.DrawRectangle') continue;
        const config = object(graph.deref(rect.fields.ConfigVar)), bounds = object(graph.deref(rect.fields.Rectangle));
        if (!config || !bounds) continue;
        const kind = config.type.includes('.ConfigInput.') ? 'touch' : config.type.includes('.ConfigShow.') ? 'display' : null;
        const x = Number(bounds.fields.x), y = Number(bounds.fields.y), w = Number(bounds.fields.width), h = Number(bounds.fields.height);
        const vp = graph.deref(config.fields.Var_Point ?? config.fields.VarPoint);
        const candidates = page.controls.filter((c) => !used.has(c.id) && getDef(c.type).kind === kind && c.x === x && c.y === y && (vp == null || !('vp' in c.props) || parseInt(String(c.props.vp), 16) === Number(vp)));
        if (candidates.length !== 1) { ignored++; continue; }
        const c = candidates[0]; used.add(c.id);
        const name = graph.deref(config.fields.Var_Name ?? config.fields.VarName);
        if (typeof name === 'string' && name.trim()) c.name = name;
        const guid = object(graph.deref(config.fields.guid));
        if (guid?.type === 'System.Guid') {
          const parts = ['_a', '_b', '_c', '_d', '_e', '_f', '_g', '_h', '_i', '_j', '_k'].map((key, i) => (Number(guid.fields[key]) >>> 0).toString(16).slice(-(i === 0 ? 8 : i < 3 ? 4 : 2)).padStart(i === 0 ? 8 : i < 3 ? 4 : 2, '0'));
          const id = `${parts[0]}-${parts[1]}-${parts[2]}-${parts[3]}${parts[4]}-${parts.slice(5).join('')}`;
          if (/^[0-9a-f-]{36}$/.test(id) && id.replace(/[-0]/g, '')) c.legacyId = id;
        }
        const locked = graph.deref(rect.fields.bLocked); if (typeof locked === 'boolean') c.locked = locked;
        if ([w, h].every((n) => Number.isInteger(n) && n > 0 && n < 65536)) {
          const ctx = { ...p.settings, pageId: page.id, keyingIndex: { n: 0 } };
          const candidate = { ...c, w, h };
          if (same(getDef(c.type).encode(c, ctx), getDef(c.type).encode(candidate, { ...ctx, keyingIndex: { n: 0 } }))) { c.w = w; c.h = h; sizes++; }
        }
        matched++;
      }
    } catch { ignored++; }
  }
  // Protección final: metadatos visuales nunca alteran los binarios compilados.
  const before = buildProject(source), after = buildProject(p);
  if (!same(before.touch, after.touch) || !same(before.show, after.show) || !same(before.config, after.config)) return { project: source, notes: ['Los metadatos de edición no se aplicaron porque cambiarían la salida binaria.'] };
  if (matched) notes.push(`Metadatos originales: ${matched} controles reconocidos y ${sizes} tamaños recuperados sin cambiar 13/14/22.`);
  if (!matched && !ignored && files.some((f) => /\.tft$/i.test(f.name))) notes.push('Los documentos TFT no contienen controles editables; se conservan los controles recuperados de 13/14.');
  if (ignored) notes.push(`${ignored} documentos o controles con metadatos no reconocidos o ambiguos se conservan según los binarios.`);
  return { project: p, notes };
}
