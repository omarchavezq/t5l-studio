import { describe, expect, it } from 'vitest';
import { crc32, dwinSetZip, storedZip } from '../zip';

describe('ZIP de DWIN_SET', () => {
  it('usa CRC-32 PKZIP, conserva binarios y codifica nombres en UTF-8', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    const input = [{ name: '13TouchFile.bin', data: new Uint8Array([0, 255, 128]) }, { name: 'ñ.DZK', data: new Uint8Array([7, 3]) }];
    const zip = dwinSetZip(input); const v = new DataView(zip.buffer);
    const end = zip.length - 22;
    expect(v.getUint32(end, true)).toBe(0x06054b50);
    expect(v.getUint16(end + 10, true)).toBe(2);
    let central = v.getUint32(end + 16, true);
    for (const f of input) {
      expect(v.getUint32(central, true)).toBe(0x02014b50);
      const local = v.getUint32(central + 42, true);
      const nameLen = v.getUint16(local + 26, true);
      expect(v.getUint32(local, true)).toBe(0x04034b50);
      expect(v.getUint16(local + 6, true)).toBe(0x800);
      expect(new TextDecoder().decode(zip.slice(local + 30, local + 30 + nameLen))).toBe(`DWIN_SET/${f.name}`);
      expect(zip.slice(local + 30 + nameLen, local + 30 + nameLen + f.data.length)).toEqual(f.data);
      central += 46 + v.getUint16(central + 28, true);
    }
    expect(central).toBe(end);
  });
  it('rechaza rutas y nombres duplicados antes de empaquetar', () => {
    expect(() => dwinSetZip([{ name: '../otro.bin', data: new Uint8Array() }])).toThrow('no válido');
    expect(() => dwinSetZip(['0.hzk', '0.HZK'].map((name) => ({ name, data: new Uint8Array() })))).toThrow('repetido');
  });
  it('agrupa idiomas con rutas relativas y rechaza salir de esas carpetas', () => {
    const data = new Uint8Array([1, 2]);
    const zip = storedZip([{ name: '01-Espanol/DWIN_SET/22_Config.bin', data }]);
    const view = new DataView(zip.buffer); const length = view.getUint16(26, true);
    expect(new TextDecoder().decode(zip.slice(30, 30 + length))).toBe('01-Espanol/DWIN_SET/22_Config.bin');
    expect(zip.slice(30 + length, 32 + length)).toEqual(data);
    for (const name of ['../a', '/a', 'a/../b', 'a//b', 'C:/a', 'a\\b']) expect(() => storedZip([{ name, data }])).toThrow('no válido');
  });
});
