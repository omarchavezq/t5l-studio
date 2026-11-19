// Ida y vuelta con proyectos reales de DGUS 7.6.
// Ejecutar con:  DGUS_SAMPLES="C:/ruta/a/proyectos" npm test
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildProject } from '../build';
import { buildIcl, parseIcl } from '../icl';
import { importDwinSet } from '../importer';

const root = process.env.DGUS_SAMPLES;

function findSets(dir: string, depth = 0): string[] {
  if (depth > 3) return [];
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (!statSync(p).isDirectory()) continue;
    if (n.toUpperCase() === 'DWIN_SET' && existsSync(join(p, '13TouchFile.bin')) && existsSync(join(p, '14ShowFile.bin'))) out.push(p);
    else out.push(...findSets(p, depth + 1));
  }
  return out;
}

const firstDiff = (a: Uint8Array, b: Uint8Array) => {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
};

describe.skipIf(!root)('proyectos reales', () => {
  const sets = root ? findSets(root) : [];
  for (const set of sets) {
    it(`13/14 idénticos tras importar y exportar: ${set}`, () => {
      const files = readdirSync(set)
        .filter((n) => /\.(bin|icl)$/i.test(n))
        .map((n) => ({ name: n, data: new Uint8Array(readFileSync(join(set, n))) }));
      const { project } = importDwinSet(files);
      const r = buildProject(project);
      const t = files.find((f) => /^13/.test(f.name))!.data;
      const s = files.find((f) => /^14/.test(f.name))!.data;
      const dt = firstDiff(r.touch, t);
      const ds = firstDiff(r.show, s);
      const ctx = (b: Uint8Array, i: number) => Array.from(b.slice(Math.max(0, i - 16), i + 16), (x) => x.toString(16).padStart(2, '0')).join(' ');
      expect(dt, `13 difiere en 0x${dt.toString(16)}\n nuestro: ${ctx(r.touch, dt)}\n original: ${ctx(t, dt)}`).toBe(-1);
      expect(ds, `14 difiere en 0x${ds.toString(16)}\n nuestro: ${ctx(r.show, ds)}\n original: ${ctx(s, ds)}`).toBe(-1);
      const cfg = files.find((f) => /^22/.test(f.name));
      if (cfg) expect(firstDiff(r.config, cfg.data), '22_Config.bin difiere').toBe(-1);
      for (const f of files.filter((x) => /\.icl$/i.test(x.name))) {
        const id = parseInt(f.name, 10);
        const rebuilt = buildIcl(parseIcl(f.data).images, id);
        expect(firstDiff(rebuilt, f.data), `${f.name} reconstruido difiere`).toBe(-1);
      }
    });
  }
});
