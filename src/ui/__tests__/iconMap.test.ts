import { describe, expect, it } from 'vitest';
import { ALL_CONTROLS } from '../../core/controls';
import { CONTROL_ICONS } from '../components/iconMap';

describe('iconos de la caja de herramientas', () => {
  it('cada control tiene su icono importado', () => {
    expect(ALL_CONTROLS.map((d) => d.icon).filter((n) => !CONTROL_ICONS[n])).toEqual([]);
  });
});
