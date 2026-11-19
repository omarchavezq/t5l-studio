import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fs = require('node:fs/promises');
const { writePackage } = require('../../../electron/package-files.cjs');
const dirs: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});
async function temp() { const dir = await mkdtemp(join(tmpdir(), 'dgus-package-test-')); dirs.push(dir); return dir; }
const files = [{ name: '13TouchFile.bin', data: new Uint8Array([0, 128, 255]) }];

describe('salida DWIN_SET en disco', () => {
  it('crea una carpeta con los bytes completos', async () => {
    const dir = await temp(); const out = await writePackage(dir, files);
    expect(out).toBe(join(dir, 'DWIN_SET'));
    expect(new Uint8Array(await readFile(join(out, files[0].name)))).toEqual(files[0].data);
  });
  it('conserva la salida anterior y no mezcla archivos obsoletos', async () => {
    const dir = await temp(); await mkdir(join(dir, 'DWIN_SET'));
    await writeFile(join(dir, 'DWIN_SET', 'obsoleto.bin'), 'anterior');
    const out = await writePackage(dir, files);
    expect(out).not.toBe(join(dir, 'DWIN_SET'));
    expect(await readdir(out)).toEqual([files[0].name]);
    expect(await readFile(join(dir, 'DWIN_SET', 'obsoleto.bin'), 'utf8')).toBe('anterior');
  });
  it('identifica la carpeta incompleta si falla una escritura', async () => {
    const dir = await temp();
    vi.spyOn(fs, 'writeFile').mockRejectedValueOnce(new Error('Sin espacio'));
    await expect(writePackage(dir, files)).rejects.toThrow('Sin espacio');
    const names = await readdir(dir);
    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(/^DWIN_SET\.incompleto-/);
  });
  it('rechaza rutas externas antes de crear archivos', async () => {
    const dir = await temp();
    await expect(writePackage(dir, [{ name: '../fuera.bin', data: [] }])).rejects.toThrow('no válido');
    expect(await readdir(dir)).toEqual([]);
  });
});
