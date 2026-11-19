// El proyecto de referencia del Hito 2 debe compilar siempre sin errores.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildProject } from '../build';
import { deserialize } from '../project';

describe('ejemplos/prueba-t5l.dgusx', () => {
  const p = deserialize(readFileSync('ejemplos/prueba-t5l.dgusx', 'utf8'));
  it('480×854 con tres páginas y fondos', () => {
    expect([p.settings.width, p.settings.height]).toEqual([480, 854]);
    expect(p.pages.map((x) => x.id)).toEqual([0, 1, 2]);
    expect(p.pages.every((x) => x.background?.startsWith('data:image/png'))).toBe(true);
  });
  it('compila sin errores', () => {
    const r = buildProject(p);
    expect(r.messages.filter((m) => m.level === 'error')).toEqual([]);
    expect(r.stats).toEqual({ pages: 3, touch: 21, display: 10 });
    // Valores iniciales: 23.5 (235) en 5000 y 40 en 5003
    expect((r.config[0xa000] << 8) | r.config[0xa001]).toBe(235);
    expect((r.config[0xa006] << 8) | r.config[0xa007]).toBe(40);
  });
});
