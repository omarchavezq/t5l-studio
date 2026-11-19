import { describe, expect, it } from 'vitest';
import { applyNetwork, checkNetwork, readNetwork } from '../network';
import { buildProject } from '../build';
import { importDwinSet } from '../importer';
import { newProject } from '../project';
import { toBase64 } from '../bytes';
import { createHash } from 'node:crypto';

describe('red WiFi / DWIN Cloud', () => {
  it('coincide con btnSave_Click ejecutado en el EXE original sobre una imagen de prueba', () => {
    const base = Uint8Array.from({ length: 131076 }, (_, i) => (i * 17 + 23) % 256);
    const out = applyNetwork(base, { enabled: true, fields: {} });
    expect(createHash('sha256').update(out).digest('hex')).toBe('0ad138b7975a2ab4293bb25b27239f06d5f9106d9b41d109b06505a444a9873c');
  });
  it('aplica los valores del editor original y las direcciones VP documentadas', () => {
    const out = applyNetwork(new Uint8Array(131076), { enabled: true, fields: { manufacturer: '12 34 56 78', description: 'Equipo', ssid: 'DWIN' } });
    expect([...out.slice(0x800, 0x802)]).toEqual([0x5a, 0xa5]);
    expect([...out.slice(0x820, 0x828)]).toEqual([0x5a, 0x4c, 0x12, 0x34, 0x56, 0x78, 0, 0]);
    expect([...out.slice(0x860, 0x86c)]).toEqual([1, 44, 16, 0, 0, 4, 32, 0, 0, 4, 0, 0]);
    expect(readNetwork(out).fields.ssid).toBe('DWIN');
    expect(readNetwork(out).fields.description).toBe('Equipo');
  });
  it('preserva todos los campos no editados, incluso bytes desconocidos y la cola Modbus', () => {
    const base = Uint8Array.from({ length: 0x32000 }, (_, i) => i % 256);
    base.set([0x5a, 0xa5], 0x800);
    const out = applyNetwork(base, { enabled: true, fields: { ssid: 'Nuevo' } });
    expect(out.slice(0, 0x960)).toEqual(base.slice(0, 0x960));
    expect(out.slice(0x97f)).toEqual(base.slice(0x97f));
    expect(base[0x960]).not.toBe(out[0x960]);
    expect(applyNetwork(base, { fields: {} })).toEqual(base);
  });
  it('limpia el resto de un texto acortado sin tocar el byte reservado siguiente', () => {
    const base = new Uint8Array(0xa00).fill(0xff);
    const out = applyNetwork(base, { fields: { ssid: 'A' } });
    expect(out[0x960]).toBe(65); expect(out.slice(0x961, 0x97f).every((v) => !v)).toBe(true);
    expect(out[0x97f]).toBe(255);
  });
  it('rechaza longitudes o codificaciones no representables y no entrega un 22 parcial', () => {
    expect(checkNetwork({ fields: { mac: 'AA' } })).toHaveLength(1);
    expect(checkNetwork({ fields: { ssid: 'Ω' } })).toHaveLength(1);
    const p = newProject(); p.network = { fields: { manufacturer: 'ZZ' } };
    const result = buildProject(p);
    expect(result.config.length).toBe(0); expect(result.messages.some((m) => m.level === 'error')).toBe(true);
  });
  it('se integra en el 22 sin alterar una importación que no se ha editado', () => {
    const p = newProject(); p.network = { enabled: true, fields: { serial: 'clave', deviceNumber: '01 02 03 04' } };
    const built = buildProject(p);
    const imported = importDwinSet([{ name: '13TouchFile.bin', data: built.touch }, { name: '14ShowFile.bin', data: built.show }, { name: '22_Config.bin', data: built.config }]).project;
    expect(imported.network).toBeUndefined(); expect(buildProject(imported).config).toEqual(built.config);
    imported.extraFiles!['__22_original'] = toBase64(built.config);
    imported.network = { enabled: false, fields: {} };
    expect(readNetwork(buildProject(imported).config).enabled).toBe(false);
  });
});
