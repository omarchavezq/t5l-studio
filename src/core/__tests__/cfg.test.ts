import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCfg, checkCfg, defaultCfg, parseCfg } from '../cfg';
import { basicDeviceConfig } from '../package';
import { newProject } from '../project';

describe('T5LCFG.CFG', () => {
  it('byte 0x05 según la guía: 0x38 = cargar 22, subida y sonido; 0x39 = además 90°', () => {
    const m = { ...defaultCfg(32), rotation: 90 as const };
    const b = buildCfg(m, new Uint8Array(0));
    expect(String.fromCharCode(...b.slice(0, 5))).toBe('T5LC1');
    expect(b[5]).toBe(0x39);
    expect(buildCfg({ ...m, rotation: 0 }, b)[5]).toBe(0x38);
    expect(buildCfg({ ...m, crc: true }, b)[5]).toBe(0xb9);
  });
  it('baudios, brillo y reposo', () => {
    const b = buildCfg({ ...defaultCfg(23), baud: 9600, brightness: 64, standbyBrightness: 5, standbyDelayMs: 30000 }, new Uint8Array(0));
    expect([b[0x0a], b[0x0b]]).toEqual([0x01, 0x50]); // ejemplo de la guía: 9600 → 0x0150
    expect(b[8]).toBe(23);
    expect([b[0x0c], b[0x0d], (b[0x0e] << 8) | b[0x0f]]).toEqual([64, 5, 3000]);
    expect(parseCfg(b).baud).toBe(9600);
  });
  it('campos opcionales: táctil, zumbador, archivo inicial y carpeta SD', () => {
    const b = buildCfg({ ...defaultCfg(), touchSensitivity: 0x20, buzzerVolume: 0x30, buzzerTimeMs: 100, initFileId: 15, sdFolder: 'RGZN_SET' }, new Uint8Array(0));
    expect([b[0x20], b[0x22], b[0x2b], b[0x2d], b[0x2e], b[0x2f]]).toEqual([0x5a, 0x20, 0x30, 10, 0x5a, 15]);
    expect([b[0x40], b[0x41], b[0x42]]).toEqual([0x5a, 0xa5, 8]);
    const m = parseCfg(b);
    expect([m.touchSensitivity, m.buzzerVolume, m.buzzerTimeMs, m.initFileId, m.sdFolder]).toEqual([0x20, 0x30, 100, 15, 'RGZN_SET']);
    // Quitar la carpeta y el archivo inicial desactiva sus marcas
    const c = buildCfg({ ...m, sdFolder: null, initFileId: null }, b);
    expect([c[0x40], c[0x2e]]).toEqual([0, 0]);
  });
  it('rechaza valores imposibles', () => {
    expect(checkCfg({ ...defaultCfg(), baud: 1000, brightness: 150, sdFolder: 'DEMASIADO_LARGO' }).length).toBe(3);
  });
  it('conserva los bytes desconocidos del CFG de base (p. ej. el CFG básico)', () => {
    const base = basicDeviceConfig(newProject('t'));
    expect(Buffer.compare(Buffer.from(buildCfg(parseCfg(base), base)), Buffer.from(base))).toBe(0);
  });

  const root = process.env.DGUS_SAMPLES;
  const cfgs = root ? readdirSync(root, { recursive: true }).map(String).filter((n) => /T5LCFG.*\.cfg$/i.test(n)) : [];
  it.skipIf(!cfgs.length)('los CFG reales salen idénticos si no se cambian', () => {
    for (const n of cfgs) {
      const p = join(root!, n);
      if (!existsSync(p)) continue;
      const b = new Uint8Array(readFileSync(p));
      expect(Buffer.compare(Buffer.from(buildCfg(parseCfg(b), b)), Buffer.from(b)), n).toBe(0);
    }
  });
});
