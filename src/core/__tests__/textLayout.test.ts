import { describe, expect, it } from 'vitest';
import { createControl, getDef } from '../controls';
import { ASC_FILE_SIZE, buildBitmapLib, buildGrayUnicode, grayGlyph } from '../fonts';
import { rasterText } from '../textLayout';

const gray = buildGrayUnicode([65, 66], 8, 16, (_code, w, h) => new Uint8Array(w * h).fill(255));
const fixed = buildBitmapLib([{ code: 65, index: 65 }, { code: 66, index: 66 }], 8, 16, (_c, w, h) => new Uint8Array(w * h).fill(255));
function block(type = 'textII', props: Record<string, number> = {}, w = 100, h = 64) {
  const c = createControl(type, 0, 0);
  c.w = w; c.h = h;
  Object.assign(c.props, { fontX: 8, fontY: 16, textLength: 100, ...props });
  return getDef(type).encode(c, { width: 800, height: 480, pageId: 0, keyingIndex: { n: 0 } });
}
describe('texto dibujado desde los bytes exportados', () => {
  it('duplica dimensiones y área de tinta al aplicar 200 %', () => {
    const a = rasterText(block('textII', { fontHeight: 100 }), 'A', gray);
    const b = rasterText(block('textII', { fontHeight: 200 }), 'A', gray);
    expect(a.glyphHeight).toBe(16);
    expect(b.glyphHeight).toBe(32);
    expect(a.alpha.filter(Boolean).length).toBe(8 * 16);
    expect(b.alpha.filter(Boolean).length).toBe(16 * 32);
  });
  it('usa la escala cuantizada del binario, no el porcentaje solicitado', () => {
    expect(rasterText(block('textII', { fontHeight: 103 }), 'A', gray).glyphHeight).toBe(16);
  });
  it('recorta sin reducir una letra que no cabe', () => {
    const r = rasterText(block('textII', { fontHeight: 200 }, 10, 10), 'A', gray);
    expect(r.glyphHeight).toBe(32);
    expect(r.clipped).toBe(true);
    expect(r.alpha.filter(Boolean).length).toBe(100);
  });
  it.each([0, 1, 2])('aplica alineación horizontal %i con las métricas de la fuente', (align) => {
    const r = rasterText(block('textII', { align }, 40, 32), 'A', gray);
    const first = align === 0 ? 0 : align === 1 ? 32 : 16;
    expect([...r.alpha].findIndex(Boolean)).toBe(first);
  });
  it('aplica espaciado horizontal', () => {
    const r = rasterText(block('textII', { horDis: 3 }, 40), 'AA', gray);
    expect([...r.alpha.slice(8, 11)]).toEqual([0, 0, 0]);
    expect(r.alpha[11]).toBe(255);
  });
  it('salta de línea y respeta el espaciado vertical', () => {
    const r = rasterText(block('textII', { verDis: 3 }, 40), 'A\r\nB', gray);
    expect(r.alpha[18 * 40]).toBe(0);
    expect(r.alpha[19 * 40]).toBe(255);
  });
  it('calcula las filas por el ancho real', () => {
    const r = rasterText(block('textII', {}, 8, 32), 'AB', gray);
    expect(r.alpha.filter(Boolean).length).toBe(256);
    expect(r.clipped).toBe(false);
  });
  it('centra verticalmente texto de matriz', () => {
    const r = rasterText(block('text', { vAlign: 1 }, 40, 32), 'A', fixed);
    expect([...r.alpha].findIndex(Boolean)).toBe(8 * 40);
  });
  it('limita el texto por bytes UTF-16', () => {
    const r = rasterText(block('textII', { textLength: 2 }), 'AB', gray, 5);
    expect(r.alpha.filter(Boolean).length).toBe(128);
  });
  it('termina al encontrar FFFF', () => {
    const r = rasterText(block(), 'A\uffffB', gray, 5);
    expect(r.alpha.filter(Boolean).length).toBe(128);
  });
  it('informa de fuente ausente y glifo ausente', () => {
    expect(rasterText(block(), 'A', null).issues[0]).toContain('no incluida');
    expect(rasterText(block(), 'Z', gray).issues[0]).toContain('U+005A');
  });
  it('no presenta una codificación pendiente como si estuviese verificada', () => {
    expect(rasterText(block(), 'A', gray, 2).issues[0]).toContain('no verificada');
  });
  it('no transforma un símbolo no ASCII en otro carácter mediante una máscara', () => {
    const r = rasterText(block('text'), '°', new Uint8Array(ASC_FILE_SIZE));
    expect(r.issues[0]).toContain('U+00B0');
  });
  it('rechaza una fuente gris truncada en los datos del glifo', () => {
    expect(grayGlyph(gray.subarray(0, 327937), 65)).toBeNull();
  });
  it('no interpreta el encabezado gris como un mapa de bits fijo', () => {
    expect(rasterText(block('text'), 'A', gray).issues[0]).toContain('requiere');
  });
  it('un texto vacío no produce un aviso de recorte', () => {
    expect(rasterText(block('textII', {}, 8, 4), '', gray).clipped).toBe(false);
  });
  it('limita el consumo de memoria de una vista desmesurada', () => {
    const b = block(); b[20] = 0x7f; b[21] = 0xff;
    const r = rasterText(b, 'A', gray);
    expect(r.alpha.length).toBe(0);
    expect(r.issues[0]).toContain('demasiado grande');
  });
});
