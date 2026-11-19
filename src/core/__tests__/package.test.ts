import { describe, expect, it } from 'vitest';
import { fromBase64, toBase64 } from '../bytes';
import { createControl } from '../controls';
import { ASC_FILE_SIZE, grayGlyph } from '../fonts';
import { basicDeviceConfig, prepareMissingFonts, preservedFiles, validatePackage } from '../package';
import { deserialize, newProject, RESOLUTIONS, serialize } from '../project';
import { SECTOR } from '../protocol';
import { buildProject } from '../build';
import { importDwinSet } from '../importer';

const render = () => (_code: number, w: number, h: number) => new Uint8Array(w * h).fill(255);
const file = (name: string, size = 1) => ({ name, data: new Uint8Array(size) });
const errors = (files: ReturnType<typeof file>[], p = newProject()) => validatePackage(files, p).filter((i) => i.level === 'error');

describe('paquete para pantalla', () => {
  it('detecta solapes que empiezan en el segundo sector de una biblioteca', () => {
    expect(errors([file('32.icl', SECTOR + 1), file('33.DZK')]).some((i) => i.text.includes('sector 33'))).toBe(true);
    expect(errors([file('32.icl', SECTOR), file('33.DZK')])).toEqual([]);
  });
  it('comprueba el límite físico declarado y avisa si se desconoce', () => {
    const p = newProject('', { flashMiB: 8, bgIclId: 16 });
    expect(errors([file('31.HZK', SECTOR + 1)], p)).toHaveLength(1);
    expect(errors([file('31.HZK', SECTOR)], p)).toHaveLength(0);
    expect(validatePackage([], newProject()).some((i) => i.text.includes('sin declarar'))).toBe(true);
  });
  it('rechaza nombres inseguros, repetidos y números de salida incorrectos', () => {
    expect(errors([file('../13.bin'), file('CON.bin'), file('A.'), file('22.bin'), file('22.BIN')]).length).toBeGreaterThanOrEqual(4);
    expect(errors([], newProject('', { showFileName: '15.bin' }))[0].text).toContain('14');
  });
  it('crea solo la configuración lógica, sin habilitar LCD ni TP', () => {
    const p = newProject('', { rotation: 90, bgIclId: 40 });
    const data = basicDeviceConfig(p);
    expect(Array.from(data.slice(0, 13))).toEqual([84, 53, 76, 67, 49, 49, 0, 0, 40, 40, 0, 28, 100]);
    expect(data.slice(16).every((v) => v === 0)).toBe(true);
    expect(errors([{ name: 'T5LCFG.CFG', data }], p)).toEqual([]);
    expect(() => basicDeviceConfig(newProject('', { bgIclId: 100 }))).toThrow('16 y 63');
  });
  it('impide CFG ambiguo, desconocido o con otro ICL de fondos', () => {
    const data = basicDeviceConfig(newProject()); data[8] = 40;
    expect(errors([{ name: 'T5LCFG.CFG', data }])[0].text).toContain('ICL');
    expect(errors([file('T5LCFG.CFG')])[0].text).toContain('cabecera');
    expect(errors([file('T5LCFG.CFG'), file('T5LCFG_otro.CFG')]).some((i) => i.text.includes('varios'))).toBe(true);
  });
  it('mantiene las opciones antiguas sin activar generación ni CFG al deserializar', () => {
    const p = newProject(); delete p.settings.autoFonts; delete p.settings.deviceConfig;
    const restored = deserialize(serialize(p));
    expect(restored.settings.autoFonts).toBeUndefined();
    expect(restored.settings.deviceConfig).toBeUndefined();
    expect(RESOLUTIONS.some((r) => r.w === 480 && r.h === 854)).toBe(true);
    expect(new Set(RESOLUTIONS.map((r) => `${r.w}x${r.h}`)).size).toBe(RESOLUTIONS.length);
  });
  it('recupera el ICL de fondos y la orientación desde el CFG importado', () => {
    const p = newProject('', { bgIclId: 23, rotation: 270 }); const r = buildProject(p);
    const imported = importDwinSet([
      { name: '13TouchFile.bin', data: r.touch }, { name: '14ShowFile.bin', data: r.show },
      { name: 'T5LCFG.CFG', data: basicDeviceConfig(p) },
    ]).project;
    expect(imported.settings.bgIclId).toBe(23);
    expect(imported.settings.rotation).toBe(270);
    expect(imported.settings.autoFonts).toBe(false);
  });
});

describe('fuentes integradas', () => {
  it('asigna primero ASCII 0# y genera una matriz de texto con acentos sin solapes', () => {
    const p = newProject('', { flashMiB: 16 });
    const text = createControl('text', 0, 0); text.props.init = 'Español';
    const number = createControl('dataVar', 0, 40);
    p.pages[0].controls.push(text, number);
    const result = prepareMissingFonts(p, [file('32.icl', SECTOR * 8)], render);
    expect(result.generated).toBe(2);
    const controls = result.project.pages[0].controls;
    expect(controls[1].props.fontId).toBe(0);
    expect(controls[0].props.font1).not.toBe(0);
    const files = preservedFiles(result.project);
    expect(files.find((f) => f.name.startsWith('0_'))!.data.length).toBe(ASC_FILE_SIZE);
    expect(errors([...files, file('32.icl', SECTOR * 8)], result.project)).toEqual([]);
    expect(p.extraFiles).toBeUndefined(); // El original no se modifica durante la preparación.
    expect(prepareMissingFonts(result.project, [], render).generated).toBe(0);
  });
  it('incluye símbolos Unicode y conserva la biblioteca como recurso del proyecto', () => {
    const p = newProject(); const c = createControl('textII', 0, 0);
    Object.assign(c.props, { encoding: 5, init: 'Ω ° ñ' }); p.pages[0].controls.push(c);
    const result = prepareMissingFonts(p, [], render);
    const data = preservedFiles(result.project)[0].data;
    expect(grayGlyph(data, 0x3a9)).not.toBeNull();
    expect(grayGlyph(data, 0xf1)).not.toBeNull();
    expect(errors(preservedFiles(result.project), result.project)).toEqual([]);
  });
  it('conserva los bytes de fuentes y archivos importados', () => {
    const p = newProject(); p.pages[0].controls.push(createControl('text', 0, 0));
    const data = new Uint8Array([1, 2, 3]);
    p.extraFiles = { '0_Original.HZK': toBase64(data), '__init22': 'metadatos' };
    const result = prepareMissingFonts(p, [], () => { throw new Error('No debe renderizar'); });
    expect(result.generated).toBe(0);
    expect(preservedFiles(result.project)).toEqual([{ name: '0_Original.HZK', data }]);
    expect(fromBase64(result.project.extraFiles!['0_Original.HZK'])).toEqual(data);
  });
  it('no genera una fuente parcial si la memoria está ocupada', () => {
    const p = newProject('', { flashMiB: 8 }); p.pages[0].controls.push(createControl('dataVar', 0, 0));
    expect(() => prepareMissingFonts(p, [file('0.icl', 8 * 1024 * 1024)], render)).toThrow('No hay espacio');
    expect(p.extraFiles).toBeUndefined();
  });
  it('rechaza codificaciones pendientes, caracteres fuera del BMP y unidades fuera de ASCII 0#', () => {
    const p = newProject(); const c = createControl('textII', 0, 0); p.pages[0].controls.push(c);
    c.props.encoding = 2;
    expect(() => prepareMissingFonts(p, [], render)).toThrow('codificación');
    Object.assign(c.props, { encoding: 5, init: '😀' });
    expect(() => prepareMissingFonts(p, [], render)).toThrow('U+FFFF');
    p.pages[0].controls = [createControl('dataVar', 0, 0)]; p.pages[0].controls[0].props.unit = '°C';
    expect(() => prepareMissingFonts(p, [], render)).toThrow('ASCII');
  });
  it('detecta cuando Texto DGUS II apunta a una biblioteca ASCII existente', () => {
    const p = newProject(); p.pages[0].controls.push(createControl('textII', 0, 0));
    expect(errors([file('0.HZK', ASC_FILE_SIZE)], p).some((i) => i.text.includes('formato de fuente'))).toBe(true);
  });
});
