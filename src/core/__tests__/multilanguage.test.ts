import { describe, expect, it } from 'vitest';
import { createControl, getDef } from '../controls';
import { newProject } from '../project';
import { bindLanguageTable, checkLanguageTable, tableFromCells, type LanguageTable } from '../multilanguage';
import { parseIcl } from '../icl';
import { fromBase64 } from '../bytes';
import { buildProject } from '../build';
import { readLanguageWorkbook } from '../languageWorkbook';
import * as XLSX from 'xlsx';

function fixture() {
  const p = newProject(); const c = createControl('text', 10, 20, 'Título'); c.w = 160; c.h = 40; c.props.init = 'Antes'; p.pages[0].controls.push(c);
  const t: LanguageTable = { languages: ['Español', 'English'], vp: '5F00', iclId: 48, initial: 1, rows: [{ key: 'titulo', controlId: c.id, texts: ['Horno', 'Oven'], family: 'Arial', size: 24, color: '#ffffff', background: '#000000', align: 'left', bold: false }] };
  const jpeg = Uint8Array.from([255, 216, 255, 218, 0, 12, 3, 1, 0, 2, 17, 3, 17, 0, 63, 0, 127, 255, 217]);
  const images = [0, 1].map((id) => ({ id, width: c.w, height: c.h, jpeg }));
  return { p, c, t, images };
}

describe('multilenguaje con ICL y VP común', () => {
  it('genera el icono estándar, todas las traducciones y el idioma inicial en el 22', () => {
    const { p, t, images } = fixture(); const out = bindLanguageTable(p, t, images);
    const c = out.pages[0].controls[0];
    expect(c.type).toBe('iconVar'); expect(c.props).toMatchObject({ vp: '5F00', iconLib: 48, vMax: 1, iconMin: 0, iconMax: 1 });
    const b = getDef(c.type).encode(c, { width: 800, height: 480, pageId: 0, keyingIndex: { n: 0 } });
    expect([...b.slice(6, 8)]).toEqual([0x5f, 0]); expect(b[26]).toBe(0);
    const icl = parseIcl(fromBase64(out.icl![48])); expect(icl.images.map((x) => x.id)).toEqual([0, 1]); expect(icl.crcOk).toBe(true);
    expect([...buildProject(out).config.slice(0xbe00, 0xbe02)]).toEqual([0, 1]);
    expect(p.pages[0].controls[0].type).toBe('text'); expect(p.icl).toBeUndefined();
  });
  it('regenera solo su biblioteca y restaura el control original al quitar una fila', () => {
    const { p, t, images } = fixture(); const second = createControl('textII', 20, 90, 'Segundo'); p.pages[0].controls.push(second);
    t.rows.push({ ...structuredClone(t.rows[0]), key: 'segundo', controlId: second.id });
    const out = bindLanguageTable(p, t, [...images, ...images.map((img) => ({ ...img, id: img.id + 2 }))]);
    const next = structuredClone(out.multilanguage!); next.rows.splice(0, 1);
    const edited = bindLanguageTable(out, next, images);
    expect(edited.pages[0].controls[0].type).toBe('text'); expect(edited.pages[0].controls[0].props.init).toBe('Antes');
    expect(edited.pages[0].controls[1].props.iconMin).toBe(0);
  });
  it('no sustituye otra biblioteca ni acepta enlaces ambiguos o traducciones incompletas', () => {
    const { p, t, images } = fixture(); p.icl = { 48: 'AA==' };
    expect(() => bindLanguageTable(p, t, images)).toThrow('otro ICL'); delete p.icl;
    t.rows.push(structuredClone(t.rows[0]));
    expect(checkLanguageTable(p, t).some((s) => s.includes('repetido'))).toBe(true);
    t.rows.pop(); t.rows[0].texts.pop(); expect(checkLanguageTable(p, t).some((s) => s.includes('columna'))).toBe(true);
  });
  it('permite quitar la última traducción y conserva el recurso para otras referencias', () => {
    const { p, c, t, images } = fixture(); c.legacyId = '01234567-1234-1234-1234-012345678901';
    const out = bindLanguageTable(p, t, images);
    expect(out.pages[0].controls[0].legacyId).toBe(c.legacyId);
    const next = structuredClone(out.multilanguage!); next.rows = [];
    const restored = bindLanguageTable(out, next, []);
    expect(restored.multilanguage).toBeUndefined(); expect(restored.pages[0].controls[0]).toEqual(c);
    expect(restored.icl![48]).toBe(out.icl![48]);
  });
  it('no permite que un valor libre sobrescriba el idioma inicial, incluso desde la palabra anterior', () => {
    const { p, t, images } = fixture(); const out = bindLanguageTable(p, t, images);
    out.initValues = [{ vp: '5EFF', type: 'uint32', value: '0' }];
    expect(buildProject(out).messages.some((m) => m.level === 'error' && m.text.includes('VP de idioma'))).toBe(true);
    out.initValues = [{ vp: '5EFE', type: 'uint32', value: '0' }];
    expect(buildProject(out).messages.some((m) => m.level === 'error')).toBe(false);
    expect([...buildProject(out).config.slice(0xbe00, 0xbe02)]).toEqual([0, 1]);
  });
  it('no confunde la columna de texto original de 2.xls con una cabecera de idiomas', async () => {
    const cells = [['01234567-1234-1234-1234-012345678901', 'Horno', 'Oven'], ['abcdefab-1234-1234-1234-012345678901', 'Presión', 'Pressure']];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cells));
    const data = new Uint8Array(XLSX.write(wb, { bookType: 'biff8', type: 'array' }));
    const result = await readLanguageWorkbook(data);
    expect(result.languages).toEqual(['Idioma 1', 'Idioma 2']); expect(result.texts).toEqual([['Horno', 'Oven'], ['Presión', 'Pressure']]);
    expect(tableFromCells([['Clave', 'Español', 'English'], ['titulo', 'Horno', 'Oven']]).languages).toEqual(['Español', 'English']);
  });
  it('rechaza áreas de hoja enormes antes de convertirlas en una tabla', async () => {
    const wb = XLSX.utils.book_new(); const sheet = XLSX.utils.aoa_to_sheet([['Clave', 'Español'], ['titulo', 'Horno']]);
    sheet['!ref'] = 'A1:XFD2'; XLSX.utils.book_append_sheet(wb, sheet);
    const data = new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));
    await expect(readLanguageWorkbook(data)).rejects.toThrow('área de datos');
    expect(() => tableFromCells([['Clave', 'Español']])).toThrow('entre 1');
  });
});
