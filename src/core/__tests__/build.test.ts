import { describe, expect, it } from 'vitest';
import { buildProject, indexEntry, showHeader, xorObfuscate } from '../build';
import { ALL_CONTROLS, createControl, getDef } from '../controls';
import { demoProject, newProject } from '../project';
import type { EncodeContext } from '../controls/schema';

const ctx = (pageId = 0): EncodeContext => ({ width: 800, height: 480, pageId, keyingIndex: { n: 0 } });
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0').toUpperCase()).join(' ');

describe('funciones nativas de DWINDLL.dll', () => {
  // Valores obtenidos llamando a la DLL original desde un proceso de 32 bits.
  it('Func02 genera la cabecera', () => {
    expect(hex(showHeader(0))).toBe('14 44 47 55 53 5F 32 10 00 00 00 00 00 00 00 00');
    expect(hex(showHeader(1000))).toBe('14 44 47 55 53 5F 32 10 03 E8 00 00 00 00 00 00');
  });
  it('Func03 genera el índice', () => {
    const out = new Uint8Array(4);
    expect(indexEntry(16384, 3, out, 0)).toBe(16480);
    expect(hex(out)).toBe('03 00 40 00');
    expect(indexEntry(16416, 2, out, 0)).toBe(16480);
    expect(hex(out)).toBe('02 00 40 20');
    expect(indexEntry(16384, 255, out, 0)).toBe(24544);
  });
  it('SetData(21) de la ventana de datos', () => {
    // Entrada de la DLL: u[i] = 0x1100 + i*0x0101 →
    // salida: 00 0C 13 02 11 00 12 01 06 07 08 09 14 03 15 04 16 05 0A 14 1D 0C 0D 1A 20 0F
    const c = createControl('dataWindow', 0, 0);
    // Elegimos un rectángulo cuyo centro sea (0x1403, 0x1504)
    c.x = 0x1403 - 10;
    c.w = 20;
    c.y = 0x1504 - 10;
    c.h = 20;
    Object.assign(c.props, {
      vp: '1302', vMin: 0x1100, vMax: 0x1201, step: 0x1605, nInt: 0x1706, nDot: 0x1807, nDigit: 0x1908,
      displayMode: 0x1a09, font0X: 0x1b0a, font0Y: 0x1c0b, font0Color: 0x1d0c, font1X: 0x1e0d, font1Y: 0x1f0e, font1Color: 0x200f,
      sp: '0000',
    });
    const b = getDef('dataWindow').encode(c, ctx());
    expect(hex(b.slice(4, 30))).toBe('00 0C 13 02 11 00 12 01 06 07 08 09 14 03 15 04 16 05 0A 14 1D 0C 0D 1A 20 0F');
  });
});

describe('codificadores de controles', () => {
  it('todos los controles generan bloques de tamaño válido', () => {
    for (const def of ALL_CONTROLS.filter((d) => !d.hidden)) {
      const c = createControl(def.type, 10, 20);
      const b = def.encode(c, ctx(3));
      if (def.kind === 'display') expect(b.length, def.type).toBe(32);
      else expect([16, 32, 48, 64], def.type).toContain(b.length);
    }
  });

  it('variable numérica (0x5A10)', () => {
    const c = createControl('dataVar', 100, 50);
    Object.assign(c.props, { vp: '5000', color: 0xf800, fontId: 0, fontSize: 32, align: 1, nInt: 3, nDot: 1, varType: 0, unit: 'V' });
    const b = getDef('dataVar').encode(c, ctx());
    expect(hex(b.slice(0, 22))).toBe('5A 10 FF FF 00 0D 50 00 00 64 00 32 F8 00 00 20 01 03 01 00 01 56');
  });

  it('botón con valor de retorno (0xFE05)', () => {
    const c = createControl('keyReturn', 10, 20);
    c.w = 100;
    c.h = 40;
    Object.assign(c.props, { vp: '1000', keyValue: 0x0102, picNext: 2, picOn: -1 });
    const b = getDef('keyReturn').encode(c, ctx(7));
    expect(hex(b.slice(0, 23))).toBe('00 07 00 0A 00 14 00 6E 00 3C 00 02 FF 00 FE 05 FE 10 00 00 01 02 00');
  });

  it('código FD cuando se pide efecto de presión', () => {
    const c = createControl('keyReturn', 0, 0);
    c.props.noPressEffect = false;
    expect(getDef('keyReturn').encode(c, ctx())[14]).toBe(0xfd);
  });
});

describe('archivos completos', () => {
  it('genera los tres archivos del proyecto demo', () => {
    const r = buildProject(demoProject());
    expect(r.messages.filter((m) => m.level === 'error')).toEqual([]);
    // 13: bloques + FF FF
    expect(r.touch.slice(-2)).toEqual(new Uint8Array([0xff, 0xff]));
    // 14: cabecera + índice de 4092 páginas
    expect(hex(r.show.slice(0, 10))).toBe('14 44 47 55 53 5F 32 10 00 01');
    expect(r.show[16]).toBe(r.stats.display - 1); // página 0
    expect(r.show[20]).toBe(1); // página 1 (1 icono por bit)
    expect(r.show.length).toBe(16384 + r.stats.display * 32 + 32);
    expect(r.config.length).toBe(131076);
    // Valor inicial 235 en VP 0x5000 (int16)
    expect(r.config[0xa000]).toBe(0);
    expect(r.config[0xa001]).toBe(235);
    // Texto inicial en VP 0x5100
    expect(String.fromCharCode(...r.config.slice(0xa200, 0xa200 + 5))).toBe('Panel');
  });

  it('el cifrado XOR es reversible', () => {
    const data = new Uint8Array(70000).map((_, i) => (i * 7) & 0xff);
    const enc = xorObfuscate(data);
    expect(enc).not.toEqual(data);
    // El cifrado aplica dos XOR, por lo que es su propia inversa.
    expect(xorObfuscate(enc)).toEqual(data);
  });

  it('detecta páginas repetidas', () => {
    const p = newProject();
    p.pages.push({ id: 0, name: 'otra', controls: [] });
    expect(buildProject(p).messages.some((m) => m.level === 'error')).toBe(true);
  });
});
