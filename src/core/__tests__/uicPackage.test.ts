import { describe, expect, it } from 'vitest';
import { newProject } from '../project';
import { planReassignment, validatePackage } from '../package';
import { buildGrayAscii } from '../grayAscii';
import { createControl } from '../controls';

describe('direcciones de recursos del hito 6', () => {
  it('calcula módulos UIC de 32 KB sin confundirlos con sectores NOR de 256 KB', () => {
    const p = newProject('t', { flashMiB: 16 });
    const files = [{ name: '0_rodillo.uic', data: new Uint8Array(32769) }, { name: '1_otro.uic', data: new Uint8Array(20) }, { name: '0_ASC.HZK', data: new Uint8Array(20) }];
    const issues = validatePackage(files, p).filter((i) => i.code === 'overlap');
    expect(issues).toHaveLength(1); expect(issues[0].text).toContain('módulo UIC 1');
    expect(validatePackage(files, p, { allowOverlap: true }).filter((i) => i.code === 'overlap')[0].level).toBe('warn');
    expect(validatePackage([{ name: '65535.uic', data: new Uint8Array(32769) }], p).some((i) => i.text.includes('fuera'))).toBe(true);
  });
  it('mueve una fuente gris BIN reconocida y mantiene los datos binarios desconocidos fijos', () => {
    const p = newProject('t', { flashMiB: 16 }); const c = createControl('textII', 0, 0); c.props.fontId = 41; p.pages[0].controls.push(c);
    const data = buildGrayAscii(6, 8, 4, (_c, w, h) => new Uint8Array(w * h));
    const plan = planReassignment([{ name: '40.icl', data: new Uint8Array(300 * 1024) }, { name: '41_gris.bin', data }], p);
    expect(plan.moves).toHaveLength(1); expect(plan.moves[0].kind).toBe('font'); expect(plan.refs[0].prop).toBe('fontId');
    const fixed = planReassignment([{ name: '40_datos.bin', data: new Uint8Array(300 * 1024) }, { name: '41_datos.bin', data: new Uint8Array(20) }], p);
    expect(fixed.moves).toHaveLength(0); expect(fixed.unresolved).toHaveLength(1);
  });
});
