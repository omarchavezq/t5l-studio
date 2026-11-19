// Configuración PLC/Modbus en 22_Config.bin (TOOL/PLC_Config de V7.651).
import { describe, expect, it } from 'vitest';
import { buildProject } from '../build';
import { importDwinSet } from '../importer';
import { applyPlcConfig, checkPlcConfig, defaultPlcConfig, MODBUS_BASE, readPlcConfig, type PlcConfig } from '../modbus';
import { newProject } from '../project';

const hex = (b: ArrayLike<number>) => Array.from(b, (x) => x.toString(16).padStart(2, '0').toUpperCase()).join(' ');
const base = () => new Uint8Array(131076).fill(0x11);

function master(): PlcConfig {
  return {
    ...defaultPlcConfig(),
    mode: 1,
    port: 4,
    baud: 9600,
    spanTime: 20,
    read: [{ id: 1, cmd: 3, register: 0x0010, length: 4, vp: 0x5000, timeout: 50 }],
    write: [{ id: 1, cmd: 6, register: 0x0020, length: 1, vp: 0x5100, timeout: 50 }],
    enter: [
      { id: 2, cmd: 16, register: 0x0100, length: 2, vp: 0x5200, timeout: 30, page: 3, monitorVp: 0x5300 },
      { id: 2, cmd: 5, register: 0x0001, length: 1, vp: 0x5210, timeout: 30, page: 1, monitorVp: 0x5310 },
    ],
  };
}

describe('PLC_Config en 22_Config.bin', () => {
  it('Modbus maestro: cabecera, comandos y tabla de páginas como PLC_Config', () => {
    const d = applyPlcConfig(base(), master());
    // el 22 se rellena con ceros hasta 0x30000; COM4 → cabecera a 64 bytes del bloque
    expect(d[0x1ffff]).toBe(0x11);
    // la tabla de páginas empieza con 8 ceros en 0x20000 y pisa los 4 últimos bytes del 22
    expect(d[0x20003]).toBe(0);
    expect(d[131076 + 8]).toBe(0);
    const h = MODBUS_BASE + 64;
    expect(hex(d.subarray(MODBUS_BASE, h))).toBe(hex(new Uint8Array(64)));
    // modo 1, 00, 9600, 1 lectura, 1 escritura, 2 de entrada, 20 ms, comandos en (0x30000 + 4096) / 2
    expect(hex(d.subarray(h, h + 18))).toBe('01 00 00 00 25 80 00 01 00 01 00 02 00 14 00 01 88 00');
    const c = MODBUS_BASE + 4096;
    expect(hex(d.subarray(c, c + 16))).toBe('01 03 00 10 04 50 00 32 01 06 00 20 01 51 00 32');
    // los de entrada van ordenados por página: primero la 1 (función 05 → tipo 1)
    expect(hex(d.subarray(c + 16, c + 32))).toBe('02 05 00 01 01 52 10 1E 02 01 00 01 01 52 10 1E');
    // función 10 → tipo 3
    expect(hex(d.subarray(c + 32, c + 48))).toBe('02 10 01 00 02 52 00 1E 02 03 01 00 02 52 00 1E');
    expect(d.length).toBe(c + 48);
    // tabla en 0x20000: 8 ceros, página 0 vacía, páginas 1 y 3 con 10 palabras cada una
    const t = 0x20000;
    expect(hex(d.subarray(t, t + 48))).toBe(
      ['00 00 00 00 00 00 00 00', '00 00 00 00 00 00 00 00', '00 00 00 28 00 00 00 0A', '00 00 00 00 00 00 00 00', '00 00 00 3C 00 00 00 0A', '00 06 53 10 04 00 00 02'].join(' '),
    );
    // segundo comando del primer bloque: id de comando 3, después página 3 con los ids 4 y 5
    expect(hex(d.subarray(t + 0x28 + 10, t + 0x28 + 20))).toBe('00 06 53 10 04 01 00 03 00 01');
    expect(hex(d.subarray(t + 0x3c, t + 0x3c + 8))).toBe('00 06 53 00 04 00 00 04');
  });

  it('lee y vuelve a escribir igual en todos los modos', () => {
    const cases: PlcConfig[] = [
      master(),
      { ...defaultPlcConfig(), mode: 1, port: 2 },
      { ...defaultPlcConfig(), mode: 4, port: 5, baud: 19200, plcMaxWords: 32, spanTime: 5, respondTime: 100, retryTimes: 3, areas: [{ vp: 0x1000, count: 16 }, { vp: 0x1100, count: 16 }, { vp: 0x1200, count: 64 }, { vp: 0x1300, count: 100 }] },
      { ...defaultPlcConfig(), mode: 10, port: 2, baud: 38400, slave: { roVp: 0x2000, roCount: 10, rwVp: 0x3000, rwCount: 20 } },
      { ...defaultPlcConfig(), mode: 2, port: 4, baud: 57600 },
      { ...defaultPlcConfig(), mode: 0, port: 2, baud: 115200 },
    ];
    for (const cfg of cases) {
      const d = applyPlcConfig(base(), cfg);
      const back = readPlcConfig(d);
      expect(back, `modo ${cfg.mode}`).not.toBeNull();
      expect(hex(applyPlcConfig(base(), back!))).toBe(hex(d));
      expect(back!.mode).toBe(cfg.mode);
      expect(back!.port).toBe(cfg.port);
    }
  });

  it('Modbus esclavo se guarda con el byte 16', () => {
    const d = applyPlcConfig(base(), { ...defaultPlcConfig(), mode: 10, port: 2, baud: 115200 });
    expect(d[MODBUS_BASE]).toBe(16);
  });

  it('modos sin bloque: un cero de más y 6 bytes al final', () => {
    const d = applyPlcConfig(base(), { ...defaultPlcConfig(), mode: 2, port: 5, baud: 115200 });
    expect(d.length).toBe(MODBUS_BASE + 96 + 1 + 6);
    expect(hex(d.subarray(d.length - 6))).toBe('02 00 00 01 C2 00');
  });

  it('un 22 normal no tiene configuración', () => {
    expect(readPlcConfig(base())).toBeNull();
  });

  it('avisos de valores imposibles', () => {
    const cfg = master();
    cfg.read[0].id = 0;
    cfg.write[0].vp = 0x0010;
    expect(checkPlcConfig(cfg).length).toBe(2);
  });

  it('el proyecto la genera y la importación la recupera editable', () => {
    const p = newProject('t');
    p.modbus = master();
    const built = buildProject(p);
    expect(built.config.length).toBeGreaterThan(MODBUS_BASE);
    const { project } = importDwinSet([
      { name: '13TouchFile.bin', data: built.touch },
      { name: '14ShowFile.bin', data: built.show },
      { name: '22_Config.bin', data: built.config },
    ]);
    // los comandos de entrada vuelven ordenados por página, como los guarda PLC_Config
    expect(project.modbus).toEqual({ ...p.modbus, enter: [...p.modbus.enter].sort((a, b) => a.page - b.page) });
    expect(hex(buildProject(project).config)).toBe(hex(built.config));
  });
});
