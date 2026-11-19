import { describe, expect, it } from 'vitest';
import { applyReassignment, planReassignment, validatePackage } from '../package';
import { createControl } from '../controls';
import { newProject } from '../project';
import { ASC_FILE_SIZE } from '../fonts';
import { toBase64 } from '../bytes';

const bytes = (n: number, v = 1) => new Uint8Array(n).fill(v);

describe('reasignación de recursos solapados', () => {
  it('mueve la segunda fuente 0# y actualiza las variables que la usan', () => {
    const p = newProject('t', { flashMiB: 16 });
    const a = createControl('dataVar', 0, 0);
    a.props.fontId = 1;
    const b = createControl('dataVar', 0, 50);
    b.props.fontId = 0;
    p.pages[0].controls.push(a, b);
    p.extraFiles = { '0_DWIN_ASC.HZK': toBase64(bytes(ASC_FILE_SIZE)), '1_DWIN_ASC.HZK': toBase64(bytes(ASC_FILE_SIZE, 2)) };
    const files = [
      { name: '13TouchFile.bin', data: bytes(10) },
      { name: '14ShowFile.bin', data: bytes(10) },
      { name: '22_Config.bin', data: bytes(10) },
      { name: '0_DWIN_ASC.HZK', data: bytes(ASC_FILE_SIZE) },
      { name: '1_DWIN_ASC.HZK', data: bytes(ASC_FILE_SIZE, 2) },
    ];
    expect(validatePackage(files, p).some((i) => i.code === 'overlap' && i.level === 'error')).toBe(true);
    expect(validatePackage(files, p, { allowOverlap: true }).some((i) => i.code === 'overlap' && i.level === 'error')).toBe(false);

    const plan = planReassignment(files, p);
    expect(plan.unresolved).toEqual([]);
    expect(plan.moves).toHaveLength(1);
    const m = plan.moves[0];
    expect(m.file).toBe('1_DWIN_ASC.HZK');
    // 12 sectores libres y seguidos, sin tocar 0–11, 12 (reservado), 13, 14 ni 22
    expect(m.to).toBe(23);
    expect(m.newName).toBe('23_DWIN_ASC.HZK');
    expect(plan.refs).toEqual([expect.objectContaining({ controlId: a.id, prop: 'fontId', from: 1, to: 23 })]);

    const q = applyReassignment(p, plan);
    expect(Object.keys(q.extraFiles!).sort()).toEqual(['0_DWIN_ASC.HZK', '23_DWIN_ASC.HZK']);
    expect(q.pages[0].controls.find((c) => c.id === a.id)!.props.fontId).toBe(23);
    expect(q.pages[0].controls.find((c) => c.id === b.id)!.props.fontId).toBe(0);
    expect(p.extraFiles['1_DWIN_ASC.HZK']).toBeDefined(); // el original no se toca
  });

  it('nunca mueve el ICL de fondos; mueve el ICL de iconos que choca', () => {
    const p = newProject('t', { flashMiB: 16, bgIclId: 23 });
    const icon = createControl('iconVar', 0, 0);
    icon.props.iconLib = 24;
    p.pages[0].controls.push(icon);
    p.icl = { 23: toBase64(bytes(300 * 1024)), 24: toBase64(bytes(1000)) };
    const files = [
      { name: '23.icl', data: bytes(300 * 1024) },
      { name: '24.icl', data: bytes(1000) },
    ];
    const plan = planReassignment(files, p);
    expect(plan.moves.map((m) => [m.file, m.to])).toEqual([['24.icl', 25]]);
    const q = applyReassignment(p, plan);
    expect(Object.keys(q.icl!).map(Number).sort((x, y) => x - y)).toEqual([23, 25]);
    expect(q.pages[0].controls[0].props.iconLib).toBe(25);
  });

  it('avisa de los bloques importados sin decodificar', () => {
    const p = newProject('t');
    const raw = createControl('rawDisplay', 0, 0);
    p.pages[0].controls.push(raw);
    const plan = planReassignment([{ name: '40.icl', data: bytes(300 * 1024) }, { name: '41.icl', data: bytes(10) }], p);
    expect(plan.moves).toHaveLength(1);
    expect(plan.rawControls).toHaveLength(1);
  });

  it('informa si no hay espacio', () => {
    const p = newProject('t', { flashMiB: 8 });
    const files = Array.from({ length: 3 }, (_, i) => ({ name: `${i}_DWIN_ASC.HZK`, data: bytes(ASC_FILE_SIZE) }));
    expect(planReassignment(files, p).unresolved.length).toBeGreaterThan(0);
  });
  it('distingue el archivo GTF de su juego interno y del módulo UIC del rodillo', () => {
    const p = newProject('t', { flashMiB: 16 });
    const gtf = createControl('gtf', 0, 0), roller = createControl('rollerChar', 0, 60);
    gtf.props.gtfId = 41; gtf.props.fontId = 41; roller.props.fontId = 41;
    p.pages[0].controls.push(gtf, roller);
    const plan = planReassignment([{ name: '40.icl', data: bytes(300 * 1024) }, { name: '41.gtf', data: bytes(10) }], p);
    expect(plan.moves).toHaveLength(1);
    expect(plan.refs.map((r) => [r.controlId, r.prop])).toEqual([[gtf.id, 'gtfId']]);
  });
});
