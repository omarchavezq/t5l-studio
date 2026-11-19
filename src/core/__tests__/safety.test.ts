import { describe, expect, it } from 'vitest';
import { buildProject } from '../build';
import { createControl } from '../controls';
import { importDwinSet, parseShowFile } from '../importer';
import { newProject } from '../project';

describe('generación sin pérdida silenciosa de datos', () => {
  it.each([2, 3])('inicializa el byte seleccionado (tipo %i) sin tocar el vecino', (varType) => {
    const p = newProject();
    const c = createControl('dataVar', 0, 0);
    Object.assign(c.props, { varType, init: '18' });
    p.pages[0].controls.push(c);
    const r = buildProject(p);
    expect(r.config.slice(0xa000, 0xa002)).toEqual(Uint8Array.from(varType === 2 ? [18, 0] : [0, 18]));
  });

  it.each([0, 1])('crea una cabecera fija con página inicial vacía o ausente (%i)', (id) => {
    const p = newProject('Fijo', { showFileMode: 'fixed' });
    p.pages[0].id = id;
    expect(parseShowFile(buildProject(p).show).mode).toBe('fixed');
  });

  it.each([64, 128, 256] as const)('reserva la cabecera de la página 0 en capacidad %i', (varsPerPage) => {
    const p = newProject('Fijo', { showFileMode: 'fixed', varsPerPage });
    p.pages[0].controls = Array.from({ length: varsPerPage - 1 }, () => createControl('dataVar', 0, 0));
    const good = buildProject(p);
    expect(good.stats.display).toBe(varsPerPage - 1);
    expect(parseShowFile(good.show).pages.get(0)?.length).toBe(varsPerPage - 1);
    p.pages[0].controls.push(createControl('dataVar', 0, 0));
    const bad = buildProject(p);
    expect(bad.messages.some((m) => m.level === 'error')).toBe(true);
    expect(bad.show.length).toBe(0);
  });

  it('rechaza texto inicial que invadiría la variable siguiente', () => {
    const p = newProject();
    const c = createControl('text', 0, 0);
    Object.assign(c.props, { textLength: 2, init: 'ABCDEFGHIJ' });
    p.pages[0].controls.push(c);
    const r = buildProject(p);
    expect(r.messages.some((m) => m.level === 'error' && m.controlId === c.id && m.text.includes('10 bytes'))).toBe(true);
    expect([r.touch.length, r.show.length, r.config.length]).toEqual([0, 0, 0]);
  });

  it('mide el texto Unicode en bytes', () => {
    const p = newProject();
    const c = createControl('text', 0, 0);
    Object.assign(c.props, { encoding: 5, textLength: 2, init: 'AB' });
    p.pages[0].controls.push(c);
    expect(buildProject(p).messages.some((m) => m.level === 'error')).toBe(true);
  });

  it.each(['10000', '-1', 'XYZ', 'FFFF'])('impide truncar o desbordar un VP de 32 bits en %s', (vp) => {
    const p = newProject();
    const c = createControl('dataVar', 0, 0);
    Object.assign(c.props, { vp, varType: 1 });
    p.pages[0].controls.push(c);
    expect(buildProject(p).show.length).toBe(0);
  });

  it('rechaza offsets de página que el índice actual no puede representar', () => {
    const p = newProject();
    p.pages = Array.from({ length: 8 }, (_, id) => ({ id, name: String(id), controls: Array.from({ length: 255 }, () => createControl('dataVar', 0, 0)) }));
    const r = buildProject(p);
    expect(r.messages.some((m) => m.level === 'error' && m.text.includes('índice de 16 bits'))).toBe(true);
    expect(r.show.length).toBe(0);
  });

  it.each([NaN, 0.5, -1, 4092])('rechaza un ID de página inválido: %s', (id) => {
    const p = newProject();
    p.pages[0].id = id;
    expect(buildProject(p).show.length).toBe(0);
  });

  it('conserva int64 por encima de la precisión de Number al importar', () => {
    const p = newProject();
    const c = createControl('dataVar', 0, 0);
    Object.assign(c.props, { varType: 4, init: '9007199254740993' });
    p.pages[0].controls.push(c);
    const r = buildProject(p);
    const imported = importDwinSet([
      { name: '13TouchFile.bin', data: r.touch }, { name: '14ShowFile.bin', data: r.show }, { name: '22_Config.bin', data: r.config },
    ]).project;
    expect(imported.pages[0].controls[0].props.init).toBe('9007199254740993');
    expect(buildProject(imported).config).toEqual(r.config);
  });
});
