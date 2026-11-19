import { describe, expect, it } from 'vitest';
import { addFskCamera, checkFskSetup, DEFAULT_FSK, fskWords } from '../fsk';
import { newProject } from '../project';
import { buildProject } from '../build';
import { createControl, getDef } from '../controls';

describe('asistente FSK V49', () => {
  it('reproduce la orden temporal 51 y la dirección doble palabra del ejemplo oficial', () => {
    const p = newProject(); const o = { ...DEFAULT_FSK, mirror: true };
    const out = addFskCamera(p, 0, o); const built = buildProject(out);
    expect(built.messages.filter((m) => m.level === 'error')).toEqual([]);
    expect([...built.config.slice(0x4000, 0x4004)]).toEqual([0x5a, 4, 16, 0]);
    expect([...built.config.slice(0x4020, 0x402c)]).toEqual([0x80,0x20,0,2,0x51,0x80,2,0x80,1,0xe0,0,0]);
    const [image, button] = out.pages[0].controls;
    const block = getDef(image.type).encode(image, { ...out.settings, pageId: 0, keyingIndex: { n: 0 } });
    expect([...block.slice(16,20)]).toEqual([255,1,0,128]);
    expect(button.props).toMatchObject({ vp1t: '0100', len1: 2, vp3t: '0120', len3: 6, tpOff: 1 });
    expect(fskWords(o)).toBe(0x5000); expect(p.pages[0].controls).toEqual([]);
  });
  it('rechaza solapes con variables, datos libres y comandos de copia existentes', () => {
    const p = newProject(); const control = createControl('dataVar', 0, 0); control.props.vp = '5000'; p.pages[0].controls.push(control);
    expect(checkFskSetup(p, DEFAULT_FSK).some((s) => s.includes(control.name))).toBe(true);
    p.pages[0].controls = []; p.initValues = [{ vp: '2001', type: 'uint16', value: '1' }];
    expect(checkFskSetup(p, DEFAULT_FSK).some((s) => s.includes('valor libre'))).toBe(true);
    p.initValues = []; const copy = createControl('keyDoRet', 0, 0); copy.props.vp1s = '2010'; copy.props.ini1 = '0102'; p.pages[0].controls.push(copy);
    expect(checkFskSetup(p, DEFAULT_FSK).some((s) => s.includes(copy.name))).toBe(true);
  });
  it('comprueba todo el búfer y los límites de los parámetros', () => {
    const p = newProject();
    for (const patch of [{ dataVp: 'F000' }, { dataVp: '4001' }, { sourceVp: '4000' }, { width: 1024, height: 768 }, { camera: 31 }, { width: 639 }]) expect(() => addFskCamera(p, 0, { ...DEFAULT_FSK, ...patch })).toThrow();
    const out = addFskCamera(p, 0, DEFAULT_FSK); out.pages[0].controls[0].props.vp = 'F000';
    expect(buildProject(out).messages.some((m) => m.level === 'error' && m.text.includes('intervalo'))).toBe(true);
  });
});
