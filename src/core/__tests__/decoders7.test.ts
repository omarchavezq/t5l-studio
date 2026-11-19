// Decodificadores de los 7 controles que antes se importaban como bloque original.
import { describe, expect, it } from 'vitest';
import { buildProject } from '../build';
import { createControl, getDef } from '../controls';
import { decodeDisplay } from '../controls/decoders';
import { importDwinSet } from '../importer';
import { newProject } from '../project';
import type { ControlInstance, Props } from '../types';

const ctx = { width: 800, height: 480, pageId: 0, keyingIndex: { n: 0 } };

function control(type: string, x: number, y: number, w: number, h: number, props: Props = {}): ControlInstance {
  const c = createControl(type, x, y);
  Object.assign(c, { w, h });
  Object.assign(c.props, props);
  return c;
}

const cases: [string, ControlInstance][] = [
  ['ventana de datos', control('dataWindow', 100, 50, 161, 121, { vp: '5010', vMin: -20, vMax: 300, step: 5, nInt: 3, nDot: 1, font0X: 16, font0Y: 32, font1X: 8, font1Y: 20, font1Color: 0x1234, fontId: 2 })],
  ['ventana de datos en la esquina', control('dataWindow', 0, 0, 30, 20)],
  ['rodillo de números, centrado', control('rollerChar', 200, 100, 120, 200, { vp: '5020', dataLine: 7, nInt: 2, nDot: 1, dataGap: 2, vMax: 99, displayBk: true, fontSet0: 5, display0: true, speed: 33, changeSpeed: 2, lineGap2: 4, font3: 9 })],
  ['rodillo de textos, a la derecha', control('rollerChar', 10, 10, 90, 60, { dataType: 15, charLen: 12, vpString: '6000', align: 2, displayAddMode: true })],
  ['rodillo a la izquierda', control('rollerChar', 300, 5, 50, 50, { align: 1 })],
  ['GTF', control('gtf', 40, 60, 300, 40, { vp: '5030', gtfId: 70, fontId: 3, horDis: 2, verDis: 1, align: 1, backSet: true, icoRecover: true })],
  ['desplazamiento de zona', control('zoneScroll', 0, 400, 800, 80, { vp: '5040', disMove: 3, modeMove: 2 })],
  ['brillo de zona', control('zoneBrightness', 100, 100, 200, 150, { vp: '5050', sp: '7000' })],
  ['cámara', control('camera', 0, 0, 320, 240, { vpImage: '3000', cameraId: 1, light: true, mirror: true, adjustMode: 1, lightSet: 80, resolution: 2, displayScale: 1 })],
  ['video', control('video', 160, 120, 480, 272, { vp: '5060', fps: 30, type: 1, iclId: 40, waeId: 120 })],
];

describe('decodificadores de ventana de datos, rodillo, GTF, zona, brillo, cámara y video', () => {
  for (const [name, c] of cases)
    it(`${name}: codificar → decodificar → mismos bytes`, () => {
      const bytes = getDef(c.type).encode(c, ctx);
      const d = decodeDisplay(bytes);
      expect(d?.type).toBe(c.type);
      const again = createControl(d!.type, d!.rect.x, d!.rect.y);
      Object.assign(again, d!.rect);
      Object.assign(again.props, d!.props);
      expect(Array.from(getDef(c.type).encode(again, ctx))).toEqual(Array.from(bytes));
    });

  it('la importación los vuelve editables y el 14 sale idéntico', () => {
    const p = newProject('t');
    p.pages[0].controls.push(...cases.map(([, c]) => c));
    const built = buildProject(p);
    const { project, stats } = importDwinSet([
      { name: '13TouchFile.bin', data: built.touch },
      { name: '14ShowFile.bin', data: built.show },
    ]);
    expect(stats.raw).toBe(0);
    expect(project.pages[0].controls.map((c) => c.type).sort()).toEqual(cases.map(([, c]) => c.type).sort());
    expect(Array.from(buildProject(project).show)).toEqual(Array.from(built.show));
  });

  it('un bloque que no se reproduce exacto se conserva como original', () => {
    const p = newProject('t');
    // alto de la fuente menor que 2 × ancho: el codificador lo corrige, así que no hay ida y vuelta
    const c = control('dataWindow', 100, 100, 160, 120);
    p.pages[0].controls.push(c);
    const show = buildProject(p).show;
    const blk = show.findIndex((_, i) => i >= 0x4000 && show[i] === 0x5a && show[i + 1] === 0x15);
    show[blk + 23] = 4;
    const { project, stats } = importDwinSet([{ name: '14ShowFile.bin', data: show }]);
    expect(stats.raw).toBe(1);
    expect(project.pages[0].controls[0].type).toBe('rawDisplay');
    expect(Array.from(buildProject(project).show)).toEqual(Array.from(show));
  });
});
