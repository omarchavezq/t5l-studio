import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newProject } from '../../core/project';
import { saveProjectFile } from '../platform';
import { saveProject } from '../actions';
import { useStore } from '../store';

vi.mock('../platform', () => ({ saveProjectFile: vi.fn(), isElectron: () => true }));

beforeEach(() => {
  vi.useFakeTimers();
  useStore.getState().setProject(newProject());
  useStore.getState().mutate((p) => { p.name = 'Modificado'; });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.resetAllMocks(); });

describe('guardado de revisiones', () => {
  it('conserva los cambios pendientes al cancelar', async () => {
    vi.mocked(saveProjectFile).mockResolvedValue(null);
    expect(await saveProject(true)).toBe(false);
    expect(useStore.getState().dirty).toBe(true);
    expect(useStore.getState().filePath).toBeNull();
  });
  it('marca como guardado el proyecto escrito', async () => {
    vi.mocked(saveProjectFile).mockResolvedValue('proyecto.dgusx');
    expect(await saveProject()).toBe(true);
    expect(useStore.getState().dirty).toBe(false);
    expect(useStore.getState().filePath).toBe('proyecto.dgusx');
  });
  it('mantiene pendientes las ediciones realizadas durante la escritura', async () => {
    let finish!: (path: string) => void;
    vi.mocked(saveProjectFile).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const pending = saveProject();
    useStore.getState().mutate((p) => { p.name = 'Edición posterior'; });
    expect(await saveProject()).toBe(false); // No abre otra escritura simultánea.
    finish('proyecto.dgusx');
    await pending;
    expect(useStore.getState().dirty).toBe(true);
    expect(useStore.getState().filePath).toBe('proyecto.dgusx');
  });
  it('no cambia la ruta de otro documento abierto durante la escritura', async () => {
    let finish!: (path: string) => void;
    vi.mocked(saveProjectFile).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const pending = saveProject();
    useStore.getState().setProject(newProject('Otro'));
    finish('anterior.dgusx');
    await pending;
    expect(useStore.getState().filePath).toBeNull();
    expect(useStore.getState().project.name).toBe('Otro');
  });
  it('conserva cambios pendientes si falla el disco', async () => {
    vi.mocked(saveProjectFile).mockRejectedValue(new Error('Disco lleno'));
    expect(await saveProject()).toBe(false);
    expect(useStore.getState().dirty).toBe(true);
  });
});
