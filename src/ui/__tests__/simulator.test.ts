// Simulador: entradas sin teclado de página usable y cambio de valores.
import { describe, expect, it } from 'vitest';
import { createControl } from '../../core/controls';
import { newProject } from '../../core/project';
import { setSimOn, simMem, simTouch, usableKeyboardPage, useSimAsk, useSimKeyboard } from '../comm';
import { useStore } from '../store';

function project(withKeys: boolean, area = { kbX1: 0, kbY1: 0, kbX2: 200, kbY2: 100 }) {
  const p = newProject('t');
  const input = createControl('dataInput', 10, 10, 'Entrada');
  Object.assign(input.props, { vp: '5000', nInt: 3, nDot: 1, kbSource: 1, picKb: 1, ...area });
  p.pages[0].controls.push(input);
  const kb = { id: 1, name: 'Teclado', controls: [] as ReturnType<typeof createControl>[] };
  if (withKeys) {
    const k = createControl('basicTouch', 10, 10, '1');
    Object.assign(k.props, { keyValue: '0031' });
    kb.controls.push(k);
  }
  p.pages.push(kb);
  useStore.getState().setProject(p);
  return input;
}

describe('simulador: entrada de datos', () => {
  it('usa el teclado de página solo si su zona es válida y tiene teclas', () => {
    expect(usableKeyboardPage(project(true))).toBe(true);
    expect(usableKeyboardPage(project(false))).toBe(false);
    expect(usableKeyboardPage(project(true, { kbX1: 0, kbY1: 0, kbX2: 0, kbY2: 0 }))).toBe(false);
  });

  it('sin teclado usable pide el valor con el diálogo propio y lo guarda', async () => {
    const input = project(false);
    setSimOn(true);
    const pending = simTouch(input, { x: 0.5, y: 0.5 });
    await Promise.resolve();
    const ask = useSimAsk.getState().ask;
    expect(ask?.kind).toBe('number');
    expect(useSimKeyboard.getState().kb).toBeNull();
    ask!.resolve('12.3');
    useSimAsk.setState({ ask: null });
    await pending;
    expect(simMem.mem.number(0x5000, 0)).toBe(123);
    setSimOn(false);
  });

  it('cancelar no cambia el valor y no bloquea los siguientes toques', async () => {
    const input = project(false);
    setSimOn(true);
    simMem.mem.setWord(0x5000, 77);
    const pending = simTouch(input, { x: 0.5, y: 0.5 });
    await Promise.resolve();
    useSimAsk.getState().ask!.resolve(null);
    useSimAsk.setState({ ask: null });
    await pending;
    expect(simMem.mem.word(0x5000)).toBe(77);
    const again = simTouch(input, { x: 0.5, y: 0.5 });
    await Promise.resolve();
    expect(useSimAsk.getState().ask).not.toBeNull();
    useSimAsk.getState().ask!.resolve(null);
    useSimAsk.setState({ ask: null });
    await again;
    setSimOn(false);
  });
});
