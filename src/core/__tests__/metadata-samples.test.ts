import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildProject } from '../build';
import { importDwinSet } from '../importer';
import { restoreProjectMetadata } from '../projectMetadata';

const root = process.env.DGUS_SAMPLES;
function find(dir: string, depth = 0): string[] {
  if (depth > 3) return [];
  return readdirSync(dir, { withFileTypes: true }).filter((f) => f.isDirectory()).flatMap((f) => {
    const p = join(dir, f.name); return f.name.toUpperCase() === 'DWIN_SET' && existsSync(join(p, '14ShowFile.bin')) && existsSync(join(p, '..', 'TFT')) ? [join(p, '..')] : find(p, depth + 1);
  });
}
describe.skipIf(!root)('metadatos originales sin alterar los binarios', () => {
  for (const dir of root ? find(root) : []) it(dir, () => {
    const files = readdirSync(join(dir, 'DWIN_SET')).filter((n) => /\.(bin|icl|cfg)$/i.test(n)).map((name) => ({ name, data: new Uint8Array(readFileSync(join(dir, 'DWIN_SET', name))) }));
    const p = importDwinSet(files).project;
    const metadata = readdirSync(join(dir, 'TFT')).filter((n) => /\.tft$/i.test(n)).map((name) => ({ name: `TFT/${name}`, data: new Uint8Array(readFileSync(join(dir, 'TFT', name))) }));
    if (existsSync(join(dir, 'DWprj.hmi'))) metadata.push({ name: 'DWprj.hmi', data: new Uint8Array(readFileSync(join(dir, 'DWprj.hmi'))) });
    const out = restoreProjectMetadata(p, metadata); const before = buildProject(p), after = buildProject(out.project);
    for (const k of ['touch', 'show', 'config'] as const) expect(Buffer.compare(Buffer.from(before[k]), Buffer.from(after[k])), k).toBe(0);
    // Las muestras antiguas cuyos TFT no traen rectángulos editables solo deben avisarlo.
    if (!out.notes.some((n) => n.includes('no contienen controles'))) {
      expect(out.notes.some((n) => n.startsWith('Metadatos originales:')), out.notes.join('; ')).toBe(true);
      expect(out.project.pages.some((page) => page.controls.some((c, i) => c.w !== p.pages.find((pg) => pg.id === page.id)?.controls[i]?.w || c.name !== p.pages.find((pg) => pg.id === page.id)?.controls[i]?.name))).toBe(true);
    }
  });
});
