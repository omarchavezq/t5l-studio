import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fs = require('node:fs/promises');
const { writeProject } = require('../../../electron/project-file.cjs');
const dirs: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  // Solo directorios creados por mkdtemp para estas pruebas.
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

describe('escritura de proyectos en disco', () => {
  it('reemplaza el proyecto y no deja temporales', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dgus-save-test-')); dirs.push(dir);
    const target = join(dir, 'proyecto.dgusx');
    await writeFile(target, 'anterior');
    await writeProject(target, 'nuevo');
    expect(await readFile(target, 'utf8')).toBe('nuevo');
    expect(await readdir(dir)).toEqual(['proyecto.dgusx']);
  });
  it('mantiene el original si falla el reemplazo', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dgus-save-test-')); dirs.push(dir);
    const target = join(dir, 'proyecto.dgusx');
    await writeFile(target, 'anterior');
    vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('Reemplazo denegado'));
    await expect(writeProject(target, 'nuevo')).rejects.toThrow('Reemplazo denegado');
    expect(await readFile(target, 'utf8')).toBe('anterior');
    expect(await readdir(dir)).toEqual(['proyecto.dgusx']);
  });
});
