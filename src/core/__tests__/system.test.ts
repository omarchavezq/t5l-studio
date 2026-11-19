import { describe, expect, it } from 'vitest';
import { buildProject, encodeFreeValue } from '../build';
import { buildKnobLib, rotaryKnob } from '../controls/knob';
import { createControl } from '../controls';
import { newProject } from '../project';
import { planDownload } from '../protocol';
import { toBase64 } from '../bytes';

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0').toUpperCase()).join(' ');
const ctx = { width: 480, height: 480, pageId: 0, keyingIndex: { n: 0 } };

describe('perilla giratoria (120.lib)', () => {
  it('pulsar para cambiar de página, efecto por VP', () => {
    const k = createControl('rotaryKnob', 0, 0);
    Object.assign(k.props, { effectMode: 0, effectVp: '5000', action: 0, pressFunction: 0, pressPage: 3 });
    expect(hex(rotaryKnob.encode(k, ctx).slice(0, 16))).toBe('50 00 00 00 00 00 00 00 00 00 00 00 00 03 00 00');
  });
  it('girar para ajustar un dato, efecto por SP sobre variable numérica', () => {
    const k = createControl('rotaryKnob', 0, 0);
    Object.assign(k.props, { effectMode: 1, sp: '6000', controlType: 2, selColor: 0xf800, action: 1, turnFunction: 1, turnMode: 2, turnVp: '5002', turnDataType: 0, rightStep: 1, leftStep: 1, turnMax: 100, turnMin: 0, turnAutoUpload: true });
    const b = rotaryKnob.encode(k, ctx);
    expect(hex(b.slice(0, 5))).toBe('60 00 82 F8 00');
    // 0x80 | auto 0x40 | ambos sentidos (2<<4) | función 1
    expect(hex(b.slice(8, 28))).toBe('50 02 E1 00 00 00 00 01 00 00 00 01 00 00 00 64 00 00 00 00');
  });
  it('cabecera, índice por página y datos', () => {
    const p = newProject('t');
    p.pages.push({ id: 1, name: 'B', controls: [] });
    p.pages[0].controls.push(createControl('rotaryKnob', 0, 0), createControl('rotaryKnob', 0, 0));
    p.knob = { model: 1, rtc: 2 };
    const lib = buildKnobLib(p)!;
    expect(hex(lib.slice(0, 11))).toBe('5A A5 55 AA 01 02 30 31 32 00 02');
    // página 0: 2 perillas desde 2×8+96 = 112; página 1: ninguna desde 112+64 = 176
    expect(hex(lib.slice(96, 112))).toBe('00 00 02 00 00 00 00 70 00 01 00 00 00 00 00 B0');
    expect(lib.length).toBe(96 + 16 + 64);
    expect(buildProject(p).knobLib?.length).toBe(lib.length);
    expect(buildKnobLib(newProject('x'))).toBeNull();
  });
});

describe('valores iniciales libres y 22_Config.bin', () => {
  it('codifica cada tipo y lo escribe en el 22', () => {
    expect(hex(encodeFreeValue({ vp: '6000', type: 'int16', value: '-2' })!)).toBe('FF FE');
    expect(hex(encodeFreeValue({ vp: '6000', type: 'float', value: '1.5' })!)).toBe('3F C0 00 00');
    expect(hex(encodeFreeValue({ vp: '6000', type: 'text', value: 'AB' })!)).toBe('41 42 FF FF');
    expect(hex(encodeFreeValue({ vp: '6000', type: 'hex', value: '5A A5 01' })!)).toBe('5A A5 01');
    expect(encodeFreeValue({ vp: '6000', type: 'uint16', value: '70000' })).toBeNull();
    const p = newProject('t');
    p.initValues = [{ vp: '6000', type: 'uint32', value: '305419896' }];
    const r = buildProject(p);
    expect(hex(r.config.slice(0xc000, 0xc004))).toBe('12 34 56 78');
  });
  it('avisa de valores por debajo de 0x2000 y rechaza valores inválidos', () => {
    const p = newProject('t');
    p.initValues = [{ vp: '1000', type: 'int16', value: '1' }, { vp: '6000', type: 'int16', value: 'x' }];
    const m = buildProject(p).messages;
    expect(m.some((x) => x.level === 'warn' && x.text.includes('0x2000'))).toBe(true);
    expect(m.some((x) => x.level === 'error' && x.text.includes('no es válido'))).toBe(true);
  });
  it('conserva la cola de un 22 original más largo (configuración Modbus)', () => {
    const p = newProject('t');
    const orig = new Uint8Array(131076 + 4096).fill(0);
    orig.set([1, 2, 3, 4], 131076);
    p.extraFiles = { __22_original: toBase64(orig) };
    const r = buildProject(p);
    expect(r.config.length).toBe(orig.length);
    expect(Array.from(r.config.slice(131076, 131080))).toEqual([1, 2, 3, 4]);
  });
});

describe('descarga por serie', () => {
  it('programas, CFG, LIB y UIC solo por SD', () => {
    const { sectors, warnings } = planDownload([
      { name: 'T5L51.bin', data: new Uint8Array(10) },
      { name: 'T5LCFG.CFG', data: new Uint8Array(10) },
      { name: '120.lib', data: new Uint8Array(10) },
      { name: '5_teclado.uic', data: new Uint8Array(10) },
      { name: '13TouchFile.bin', data: new Uint8Array(10) },
    ]);
    expect(sectors.map((s) => s.sector)).toEqual([13]);
    expect(warnings.filter((w) => w.includes('tarjeta SD'))).toHaveLength(4);
  });
});
