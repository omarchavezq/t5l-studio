import { afterEach, describe, expect, it } from 'vitest';
import { ASC_FILE_SIZE } from '../../core/fonts';
import { toBase64 } from '../../core/bytes';
import { newProject } from '../../core/project';
import { projectAsciiLib, projectFontLib } from '../fontRender';
import { useStore } from '../store';
import { buildGrayAscii } from '../../core/grayAscii';

afterEach(() => useStore.getState().setProject(newProject()));
describe('identidad de las fuentes', () => {
  it('distingue contenido con igual nombre, longitud y prefijo', () => {
    const first = new Uint8Array(ASC_FILE_SIZE);
    const second = new Uint8Array(first); second[1000] = 255;
    const p = newProject(); p.extraFiles = { '0_DWIN_ASC.HZK': toBase64(first) };
    useStore.getState().setProject(p);
    const old = projectAsciiLib(0);
    useStore.getState().mutate((d) => { d.extraFiles!['0_DWIN_ASC.HZK'] = toBase64(second); });
    const next = projectAsciiLib(0);
    expect(next).not.toBe(old);
    expect(next![1000]).toBe(255);
    expect(old![1000]).toBe(0);
  });
  it('no elige arbitrariamente entre dos bibliotecas con el mismo ID', () => {
    const p = newProject(); p.extraFiles = { '40_A.DZK': 'AA==', '40_B.DZK': 'AQ==' };
    useStore.getState().setProject(p);
    expect(projectFontLib(40)).toBeNull();
  });
  it('tolera un recurso base64 inválido', () => {
    const p = newProject(); p.extraFiles = { '40_A.DZK': '!!!!' };
    useStore.getState().setProject(p);
    expect(projectFontLib(40)).toBeNull();
  });
  it('lee una fuente gris BIN y no interpreta otros BIN como fuentes', () => {
    const data = buildGrayAscii(6, 8, 8, (_c, w, h) => new Uint8Array(w * h));
    const p = newProject(); p.extraFiles = { '40_gris.bin': toBase64(data), '41_datos.bin': 'AA==', '42_mal.bin': '!!!!' };
    useStore.getState().setProject(p);
    expect(projectFontLib(40)).toEqual(data); expect(projectFontLib(41)).toBeNull(); expect(projectFontLib(42)).toBeNull();
  });
});
