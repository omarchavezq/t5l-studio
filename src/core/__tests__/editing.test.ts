import { describe, expect, it } from 'vitest';
import { arrayCopies, cName, findVp, touchOverlaps, variableCsv, variableHeader, variableTable } from '../editing';
import { KEY, applyKey, keyboardArea, keyboardLayout } from '../keyboard';
import { createControl } from '../controls';
import { demoProject, newProject } from '../project';
import { buildProject } from '../build';

describe('tabla de variables', () => {
  const p = demoProject();
  const rows = variableTable(p);
  it('lista cada VP con su tamaño', () => {
    const t = rows.find((r) => r.control === 'Título')!;
    expect(t.vp).toBe(0x5100);
    expect(t.words).toBe(16); // 32 bytes de texto
    expect(rows.every((r, i) => i === 0 || rows[i - 1].vp <= r.vp)).toBe(true);
  });
  it('CSV para Excel en español', () => {
    const csv = variableCsv(rows);
    expect(csv.startsWith('\uFEFFVP;Palabras;Página')).toBe(true);
    expect(csv).toContain('0x5100;16;0;Inicio;Título;Texto');
  });
  it('encabezado C sin repetidos y con nombres válidos', () => {
    const h = variableHeader(p, rows);
    expect(h).toContain('#define VP_TEMPERATURA');
    expect(h).toContain('0x5000u');
    expect(cName('Presión ñ 2')).toBe('PRESION_N_2');
    expect(cName('1 bit')).toBe('VP_1_BIT');
    const names = [...h.matchAll(/#define (VP_\w+)/g)].map((m) => m[1]);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('buscar VP', () => {
  it('encuentra por dirección dentro del intervalo y por prefijo', () => {
    const p = demoProject();
    expect(findVp(p, '5105').map((h) => h.control)).toEqual(['Título']); // dentro de 5100…510F
    expect(findVp(p, '0x5002').map((h) => h.control).sort()).toEqual(['Bajar', 'Consigna', 'Consigna (valor)', 'Subir']);
    expect(findVp(p, '50').length).toBeGreaterThan(3);
    expect(findVp(p, 'zz')).toEqual([]);
  });
});

describe('arrays', () => {
  it('copias en rejilla con VP incremental', () => {
    const c = createControl('dataVar', 10, 20);
    c.w = 50;
    c.h = 30;
    c.props.vp = '5000';
    const out = arrayCopies(c, { rows: 2, cols: 3, gapX: 5, gapY: 10, vpStep: 2 });
    expect(out).toHaveLength(5);
    expect(out.map((x) => [x.x, x.y, x.props.vp])).toEqual([
      [65, 20, '5002'],
      [120, 20, '5004'],
      [10, 60, '5006'],
      [65, 60, '5008'],
      [120, 60, '500A'],
    ]);
    expect(new Set(out.map((x) => x.id)).size).toBe(5);
  });
});

describe('zonas táctiles superpuestas', () => {
  it('detecta y avisa al compilar', () => {
    const p = newProject('t');
    const a = createControl('basicTouch', 0, 0);
    const b = createControl('keyReturn', 50, 20);
    const d = createControl('dataVar', 0, 0); // visualización: no cuenta
    p.pages[0].controls.push(a, b, d);
    expect(touchOverlaps(p.pages[0])).toHaveLength(1);
    expect(buildProject(p).messages.some((m) => m.level === 'warn' && m.text.includes('se superponen'))).toBe(true);
  });
});

describe('teclados', () => {
  it('numérico con los códigos probados', () => {
    const keys = keyboardLayout('numerico', { x: 0, y: 0, w: 400, h: 300 });
    expect(keys.map((k) => k.code).sort((a, b) => a - b)).toEqual([0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, KEY.ESC, KEY.OK, KEY.BORRAR]);
    for (const k of keys) {
      expect(k.x).toBeGreaterThanOrEqual(0);
      expect(k.x + k.w).toBeLessThanOrEqual(400);
      expect(k.y + k.h).toBeLessThanOrEqual(300);
    }
    // sin solapes entre teclas
    for (const a of keys) for (const b of keys) if (a !== b) expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
  });
  it('alfanumérico: letras mayúscula/minúscula y Ñ opcional', () => {
    const keys = keyboardLayout('alfanumerico', { x: 0, y: 0, w: 800, h: 320 }, { enie: true });
    expect(keys.find((k) => k.label === 'Q')!.code).toBe(0x5171);
    expect(keys.find((k) => k.label === 'Ñ')!.code).toBe(0xd1f1);
    expect(keyboardLayout('alfanumerico', { x: 0, y: 0, w: 800, h: 320 }).some((k) => k.label === 'Ñ')).toBe(false);
  });
  it('área dentro de la pantalla y aplicación de teclas', () => {
    const a = keyboardArea('numerico', 480, 854);
    expect(a.x).toBeGreaterThanOrEqual(0);
    expect(a.y + a.h).toBeLessThanOrEqual(854);
    let s = { buffer: '', caps: false } as ReturnType<typeof applyKey>;
    for (const code of [0x31, 0x32, KEY.BORRAR, 0x5171, KEY.MAYUS, 0x5171]) s = applyKey(s.buffer, code, s.caps);
    expect(s.buffer).toBe('1qQ');
    expect(applyKey('12', KEY.OK, false).done).toBe('ok');
  });
});

describe('recuadro de variables con fuente 0#', () => {
  it('nace y se ajusta al tamaño del texto', async () => {
    const { createControl } = await import('../controls');
    const { fitAsciiBox } = await import('../editing');
    const c = createControl('dataVar', 0, 0);
    expect(fitAsciiBox(c)).toEqual({ w: c.w, h: c.h });
    expect(c.h).toBe(Number(c.props.fontSize) * 2);
    Object.assign(c.props, { fontSize: 40, nInt: 3, nDot: 1, unit: 'C' });
    const text = '23.5C';
    expect(fitAsciiBox(c)!.h).toBe(80);
    expect(fitAsciiBox(c)!.w % 40).toBe(0);
    expect(fitAsciiBox(c)!.w).toBeGreaterThanOrEqual(text.length * 40);
    expect(fitAsciiBox(createControl('text', 0, 0))).toBeNull();
  });
});

describe('el recuadro sigue al texto', () => {
  it('crece y se encoge al cambiar el ancho de carácter, no con otras propiedades', async () => {
    const { createControl } = await import('../controls');
    const { refitAsciiBox } = await import('../editing');
    const c = createControl('dataVar', 0, 0);
    Object.assign(c.props, { nInt: 3, nDot: 1, unit: '' });
    c.props.fontSize = 30;
    expect(refitAsciiBox(c, 'fontSize')).toBe(true);
    const w30 = c.w;
    expect(c.h).toBe(60);
    c.props.fontSize = 50;
    refitAsciiBox(c, 'fontSize');
    expect([c.w, c.h]).toEqual([(w30 / 30) * 50, 100]);
    c.w = 999; // tamaño manual: cambiar el color no lo toca
    c.props.color = 0xf800;
    expect(refitAsciiBox(c, 'color')).toBe(false);
    expect(c.w).toBe(999);
    c.props.unit = 'C';
    expect(refitAsciiBox(c, 'unit')).toBe(true);
    expect(c.w).toBe((w30 / 30 + 1) * 50);
  });
});
