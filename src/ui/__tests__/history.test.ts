// Historial de deshacer: no debe duplicar los recursos binarios en cada paso.
import { describe, expect, it } from 'vitest';
import { shareClone } from '../../core/shareClone';
import { newProject } from '../../core/project';
import { useStore } from '../store';

const MB = 1024 * 1024;
const heap = () => process.memoryUsage().heapUsed;
const big = () => 'A'.repeat(8 * MB) + Math.random();

describe('historial sin copias de recursos', () => {
  it('la copia es independiente y conserva los datos', () => {
    const p = newProject('t');
    p.extraFiles = { 'x.bin': 'QUJD' };
    p.pages[0].controls.push({ id: 'a', type: 'text', name: 'T', x: 1, y: 2, w: 3, h: 4, props: { vp: '5000', init: 'hola' } });
    const c = shareClone(p);
    expect(c).toEqual(p);
    c.pages[0].controls[0].x = 99;
    c.extraFiles!['y.bin'] = 'Zg==';
    expect(p.pages[0].controls[0].x).toBe(1);
    expect(p.extraFiles['y.bin']).toBeUndefined();
    const bytes = { data: new Uint8Array([1, 2, 3]) };
    const cb = shareClone(bytes);
    cb.data[0] = 9;
    expect(bytes.data[0]).toBe(1);
  });

  it('structuredClone duplicaba el recurso; shareClone no', () => {
    const src = { file: big() };
    const keep: unknown[] = [];
    let h0 = heap();
    for (let i = 0; i < 6; i++) keep.push(structuredClone(src));
    const copied = heap() - h0;
    keep.length = 0;
    h0 = heap();
    for (let i = 0; i < 6; i++) keep.push(shareClone(src));
    const shared = heap() - h0;
    expect(copied).toBeGreaterThan(30 * MB);
    expect(shared).toBeLessThan(4 * MB);
  });

  it('50 cambios con un recurso de 8 MB no hacen crecer la memoria', () => {
    const p = newProject('t');
    p.extraFiles = { '0_DWIN_ASC.HZK': big() };
    useStore.getState().setProject(p);
    const h0 = heap();
    for (let i = 0; i < 50; i++) useStore.getState().mutate((d) => void (d.name = `t${i}`));
    expect(useStore.getState().past.length).toBe(50);
    expect(heap() - h0).toBeLessThan(40 * MB);
    // deshacer y rehacer siguen funcionando
    useStore.getState().undo();
    expect(useStore.getState().project.name).toBe('t48');
    useStore.getState().redo();
    expect(useStore.getState().project.name).toBe('t49');
    expect(useStore.getState().project.extraFiles!['0_DWIN_ASC.HZK'].length).toBe(p.extraFiles['0_DWIN_ASC.HZK'].length);
  });
});
