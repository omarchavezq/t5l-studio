import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importDwinSet } from '../../core/importer';
import { PackageConflictError, collectDwinSetFiles } from '../actions';
import { applyReassignment, planReassignment } from '../../core/package';
import { useStore } from '../store';
import { ASC_FILE_SIZE } from '../../core/fonts';
import { SECTOR } from '../../core/protocol';

const root = process.env.DGUS_SAMPLES;
function findSets(dir: string, depth = 0): string[] {
  if (depth > 3) return [];
  return readdirSync(dir, { withFileTypes: true }).filter((f) => f.isDirectory()).flatMap((f) => {
    const sub = join(dir, f.name);
    return f.name.toUpperCase() === 'DWIN_SET' && existsSync(join(sub, '13TouchFile.bin')) && existsSync(join(sub, '14ShowFile.bin')) ? [sub] : findSets(sub, depth + 1);
  });
}

describe.skipIf(!root)('paquetes originales por el flujo integrado', () => {
  for (const set of root ? findSets(root) : []) it(set, async () => {
    const files = readdirSync(set, { withFileTypes: true }).filter((f) => f.isFile() && /\.(bin|icl|hzk|dzk|cfg|gtf)$/i.test(f.name)).map((f) => ({ name: f.name, data: new Uint8Array(readFileSync(join(set, f.name))) }));
    const p = importDwinSet(files).project;
    expect(p.settings.autoFonts).toBe(false);
    expect(p.settings.deviceConfig).toBe('preserve');
    useStore.getState().setProject(p);
    // Conflictos reales de estas muestras: no se aprueba ni se modifica una salida
    // que cargaría dos archivos en los mismos sectores de memoria.
    const duplicateAscii = ['0_DWIN_ASC.HZK', '1_DWIN_ASC.HZK'].every((n) => files.some((f) => f.name === n && f.data.length === ASC_FILE_SIZE));
    const overlappingIcl = files.some((f) => f.name === '23.icl' && f.data.length > SECTOR) && files.some((f) => f.name === '24.icl');
    if (duplicateAscii || overlappingIcl) {
      // 1) Sin opciones: se detiene con un conflicto resoluble, sin tocar el proyecto.
      const err = await collectDwinSetFiles().then(() => null, (e) => e);
      expect(err).toBeInstanceOf(PackageConflictError);
      const messages = useStore.getState().messages.filter((m) => m.level === 'error');
      expect(messages.length).toBeGreaterThan(0);
      expect(messages.every((m) => m.text.includes('solapa'))).toBe(true);
      expect(useStore.getState().dirty).toBe(false);
      // 2) «Generar igualmente»: igual que DGUS 7.6, los originales salen idénticos y el solape queda como aviso.
      const asIs = await collectDwinSetFiles({ allowOverlap: true });
      for (const original of files) {
        const exported = asIs.find((f) => f.name.toLowerCase() === original.name.toLowerCase());
        expect(exported, original.name).toBeDefined();
        expect(Buffer.compare(Buffer.from(exported!.data), Buffer.from(original.data)), original.name).toBe(0);
      }
      expect(useStore.getState().messages.some((m) => m.level === 'warn' && m.text.includes('sobrescribirá'))).toBe(true);
      // 3) «Reasignar»: el plan mueve los recursos, la generación pasa y el contenido de cada archivo se conserva.
      const plan = planReassignment(err.files, err.project);
      expect(plan.unresolved).toEqual([]);
      expect(plan.moves.length).toBeGreaterThan(0);
      useStore.getState().setProject(applyReassignment(useStore.getState().project, plan));
      const moved = await collectDwinSetFiles();
      for (const m of plan.moves) {
        const before = files.find((f) => f.name === m.file)!;
        const after = moved.find((f) => f.name === m.newName);
        expect(after, m.newName).toBeDefined();
        expect(Buffer.compare(Buffer.from(after!.data), Buffer.from(before.data)), m.newName).toBe(0);
      }
      return;
    }
    const result = await collectDwinSetFiles().catch((e) => { throw new Error(`${e.message}: ${useStore.getState().messages.filter((m) => m.level === 'error').map((m) => m.text).join('; ')}`); });
    for (const original of files.filter((f) => /\.(bin|icl|hzk|dzk|cfg|gtf)$/i.test(f.name))) {
      const exported = result.find((f) => f.name.toLowerCase() === original.name.toLowerCase());
      expect(exported, original.name).toBeDefined();
      expect(exported!.data.length, original.name).toBe(original.data.length);
      expect(Buffer.compare(Buffer.from(exported!.data), Buffer.from(original.data)), original.name).toBe(0);
    }
    expect(useStore.getState().dirty).toBe(false);
  });
});
