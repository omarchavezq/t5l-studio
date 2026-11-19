import { describe, expect, it } from 'vitest';
import { readNrbf, type NrbfObject } from '../nrbf';

const int = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255];
const str = (s: string) => { const data = [...new TextEncoder().encode(s)]; return [data.length, ...data]; };
const header = [0, ...int(1), ...int(-1), ...int(1), ...int(0)];

describe('lectura de datos MS-NRBF sin instanciar tipos', () => {
  it('lee un esquema con miembros primitivos, strings y referencias diferidas', () => {
    const bytes = Uint8Array.from([...header, 12, ...int(2), ...str('Biblioteca'), 5, ...int(1), ...str('Ejemplo.Documento'), ...int(3), ...str('Width'), ...str('Name'), ...str('Items'), 0, 1, 2, 8, ...int(2), ...int(480), 6, ...int(3), ...str('Español'), 9, ...int(4), 16, ...int(4), ...int(2), 10, 6, ...int(5), ...str('Texto'), 11]);
    const r = readNrbf(bytes); const root = r.root as NrbfObject;
    expect(root.fields.Width).toBe(480); expect(root.fields.Name).toBe('Español'); expect(r.deref(root.fields.Items)).toEqual([null, 'Texto']);
  });
  it('lee arrays primitivos y limita las longitudes antes de asignar memoria', () => {
    expect(readNrbf(Uint8Array.from([...header, 15, ...int(1), ...int(3), 2, 0, 128, 255, 11])).root).toEqual(new Uint8Array([0, 128, 255]));
    expect(() => readNrbf(Uint8Array.from([...header, 16, ...int(1), ...int(0x7fffffff), 11]))).toThrow('límite');
    expect(() => readNrbf(Uint8Array.from([...header, 21, 11]))).toThrow('no admitido');
  });
  it('detecta truncamiento en cada punto de un documento y ciclos de referencias', () => {
    const full = Uint8Array.from([...header, 6, ...int(1), ...str('Prueba'), 11]);
    for (let n = 0; n < full.length; n++) expect(() => readNrbf(full.slice(0, n))).toThrow();
    expect(readNrbf(full).deref({ ref: 987 })).toBeUndefined();
  });
  it('no aplica nombres de miembros al prototipo de JavaScript', () => {
    const bytes = Uint8Array.from([...header, 4, ...int(1), ...str('Datos'), ...int(1), ...str('__proto__'), 1, 6, ...int(2), ...str('texto'), 11]);
    const root = readNrbf(bytes).root as NrbfObject;
    expect(Object.getPrototypeOf(root.fields)).toBeNull(); expect(root.fields.__proto__).toBe('texto');
  });
});
