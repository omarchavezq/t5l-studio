import { describe, expect, it } from 'vitest';
import { addSpanishPe, SPANISH_PE, toSpanishPe } from '../spanishPe';
import type { LanguageRow, LanguageTable } from '../multilanguage';

const row = (key: string, texts: string[]): LanguageRow => ({ key, controlId: '', texts, family: 'Arial', size: 24, color: '#ffffff', background: '#000000', align: 'left', bold: false });

describe('español (Perú) en la tabla de idiomas', () => {
  it('traduce términos de HMI del inglés y del chino', () => {
    expect(toSpanishPe('Settings')).toBe('Configuración');
    expect(toSpanishPe('  temperature: ')).toBe('Temperatura:');
    expect(toSpanishPe('STOP')).toBe('PARAR');
    expect(toSpanishPe('设定值')).toBe('Punto de ajuste');
    expect(toSpanishPe('温度：')).toBe('Temperatura:');
    expect(toSpanishPe('Add')).toBe('Agregar');
    expect(toSpanishPe('Frobnicate')).toBeNull();
  });

  it('agrega la columna y deja vacío lo desconocido', () => {
    const t: LanguageTable = { languages: ['中文', 'English'], vp: '5F00', iclId: 48, initial: 0, rows: [row('a', ['温度', 'Temperature']), row('b', ['', 'Start']), row('c', ['某物', 'Widget'])] };
    const r = addSpanishPe(t);
    expect(r.table.languages).toEqual(['中文', 'English', SPANISH_PE]);
    expect(r.table.rows.map((x) => x.texts[2])).toEqual(['Temperatura', 'Arrancar', '']);
    expect([r.filled, r.missing]).toEqual([2, 1]);
    expect(t.languages.length).toBe(2);
  });

  it('completa una columna de español existente sin pisar lo escrito', () => {
    const t: LanguageTable = { languages: ['Español', 'English'], vp: '5F00', iclId: 48, initial: 0, rows: [row('a', ['Mi inicio', 'Home']), row('b', ['', 'Save'])] };
    const r = addSpanishPe(t);
    expect(r.table.languages).toEqual(['Español', 'English']);
    expect(r.table.rows.map((x) => x.texts[0])).toEqual(['Mi inicio', 'Guardar']);
  });
});
