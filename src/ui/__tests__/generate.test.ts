import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createControl } from '../../core/controls';
import { newProject } from '../../core/project';
import { collectDwinSetFiles, exportDwinSet } from '../actions';
import { exportFiles } from '../platform';
import { useStore } from '../store';
import { toBase64 } from '../../core/bytes';
import { basicDeviceConfig } from '../../core/package';

vi.mock('../platform', () => ({ exportFiles: vi.fn(), isElectron: () => true }));
vi.mock('../fontRender', () => ({ DEFAULT_RENDER: {}, makeRenderer: () => (_c: number, w: number, h: number) => new Uint8Array(w * h).fill(255) }));
beforeEach(() => {
  const p = newProject('Generación', { flashMiB: 16 });
  const c = createControl('text', 10, 10); c.props.init = 'Español'; p.pages[0].controls.push(c);
  useStore.getState().setProject(p);
  vi.stubGlobal('document', { fonts: { load: vi.fn().mockResolvedValue([]), ready: Promise.resolve() } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });

describe('generación integrada', () => {
  it('prepara controles, fuente y CFG desde una acción y permite repetir sin duplicar', async () => {
    const files = await collectDwinSetFiles();
    expect(files.map((f) => f.name)).toEqual(['13TouchFile.bin', '14ShowFile.bin', '22_Config.bin', '0_Studio_fixed.DZK', 'T5LCFG.CFG']);
    expect(useStore.getState().dirty).toBe(true);
    expect(Object.keys(useStore.getState().project.extraFiles!)).toEqual(['0_Studio_fixed.DZK']);
    expect((await collectDwinSetFiles()).map((f) => f.name)).toEqual(files.map((f) => f.name));
  });
  it('bloquea el paquete si cambia el documento durante la preparación', async () => {
    let ready!: () => void;
    const loaded = new Promise<void>((resolve) => { ready = resolve; });
    vi.stubGlobal('document', { fonts: { load: () => loaded, ready: Promise.resolve() } });
    const pending = collectDwinSetFiles();
    useStore.getState().setProject(newProject('Otro'));
    ready();
    await expect(pending).rejects.toThrow('cambió');
    expect(useStore.getState().project.name).toBe('Otro');
    expect(useStore.getState().dirty).toBe(false);
  });
  it('conserva CFG existente sin regenerarlo aunque esté elegida la opción básica', async () => {
    const p = useStore.getState().project;
    const cfg = basicDeviceConfig(p); cfg[5] = 0x38; cfg[12] = 80;
    p.extraFiles = { 'T5LCFG.CFG': toBase64(cfg) };
    expect((await collectDwinSetFiles()).find((f) => f.name === 'T5LCFG.CFG')!.data).toEqual(cfg);
  });
  it('no aplica fuentes generadas cuando el paquete contiene un solape', async () => {
    const p = useStore.getState().project;
    p.extraFiles = { '13_duplicado.bin': toBase64(new Uint8Array([1])) };
    await expect(collectDwinSetFiles()).rejects.toThrow('errores');
    expect(useStore.getState().dirty).toBe(false);
    expect(Object.keys(useStore.getState().project.extraFiles!)).toEqual(['13_duplicado.bin']);
    expect(useStore.getState().messages.some((m) => m.text.includes('solapa'))).toBe(true);
  });
  it('comunica fallo de exportación y permite reintentar', async () => {
    vi.mocked(exportFiles).mockRejectedValueOnce(new Error('Sin espacio')).mockResolvedValueOnce(null);
    await exportDwinSet();
    expect(useStore.getState().outputOpen).toBe(true);
    await exportDwinSet();
    expect(exportFiles).toHaveBeenCalledTimes(2);
  });
});
