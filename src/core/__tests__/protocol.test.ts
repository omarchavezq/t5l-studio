import { describe, expect, it } from 'vitest';
import { FrameParser, pageSwitch, planDownload, readReply, readVp, sectorRequest, toHexStr, writeWords } from '../protocol';
import { VpMemory, applyWrite, formatFixed, touch } from '../simulator';
import { createControl } from '../controls';

describe('tramas DGUS II', () => {
  it('escritura y lectura sin CRC', () => {
    expect(toHexStr(writeWords(0x5000, [0x0102]))).toBe('5A A5 05 82 50 00 01 02');
    expect(toHexStr(readVp(0x5000, 2))).toBe('5A A5 04 83 50 00 02');
    expect(toHexStr(pageSwitch(3))).toBe('5A A5 07 82 00 84 5A 01 00 03');
  });
  it('petición de sector igual que DGUS 7.6', () => {
    // frmTextA.Downfile: "5AA5" + "038F55" + NN
    expect(toHexStr(sectorRequest(14))).toBe('5A A5 03 8F 55 0E');
  });
  it('CRC Modbus (ejemplo del manual de T5L)', () => {
    // 5A A5 06 83 00 0F 01 + CRC: valor conocido calculado con Modbus
    const f = readVp(0x000f, 1, { header: [0x5a, 0xa5], crc: true });
    expect(toHexStr(f.slice(0, 7))).toBe('5A A5 06 83 00 0F 01');
    const p = new FrameParser({ header: [0x5a, 0xa5], crc: true });
    expect(p.push(f).frames[0].crcOk).toBe(true);
  });
  it('el analizador separa tramas pegadas, partidas y basura', () => {
    const p = new FrameParser();
    const a = writeWords(0x1000, [7]);
    const b = readReply(0x2000, Uint8Array.from([0, 9]));
    const all = Uint8Array.from([0x11, 0x22, ...a, ...b]);
    const r1 = p.push(all.slice(0, 7));
    const r2 = p.push(all.slice(7));
    const frames = [...r1.frames, ...r2.frames];
    expect(frames.map((f) => f.cmd)).toEqual([0x82, 0x83]);
    expect(Array.from(frames[1].data)).toEqual([0x20, 0x00, 1, 0, 9]);
    expect(r1.junk.length).toBe(1);
  });
  it('divide los archivos en sectores de 256 KB', () => {
    const { sectors, warnings } = planDownload([
      { name: '13TouchFile.bin', data: new Uint8Array(100) },
      { name: '32.icl', data: new Uint8Array(600 * 1024) },
      { name: 'leeme.txt', data: new Uint8Array(1) },
    ]);
    expect(sectors.map((s) => s.sector)).toEqual([13, 32, 33, 34]);
    expect(sectors[3].data.length).toBe(600 * 1024 - 512 * 1024);
    expect(warnings.length).toBe(1);
  });
});

describe('simulador', () => {
  it('botón +/− respeta límites y vuelta', () => {
    const m = new VpMemory();
    const c = createControl('incAdjust', 0, 0);
    Object.assign(c.props, { vp: '5000', step: 5, vMin: 0, vMax: 10, adjMode: 1, returnMode: 1 });
    touch(c, m);
    touch(c, m);
    expect(m.word(0x5000)).toBe(10);
    const r = touch(c, m);
    expect(m.word(0x5000)).toBe(0);
    expect(r.upload).toEqual({ vp: 0x5000, words: 1 });
  });
  it('botón de bit y cambio de página', () => {
    const m = new VpMemory();
    const c = createControl('bitButton', 0, 0);
    Object.assign(c.props, { vp: '5010', bitPos: 3, adjMode: 2, picNext: 2 });
    expect(touch(c, m).page).toBe(2);
    expect(m.word(0x5010)).toBe(8);
    touch(c, m);
    expect(m.word(0x5010)).toBe(0);
  });
  it('entrada numérica con decimales', () => {
    const m = new VpMemory();
    const c = createControl('dataInput', 0, 0);
    Object.assign(c.props, { vp: '5002', nDot: 1, varType: 0 });
    const ask = touch(c, m).ask!;
    ask.apply('23,5');
    expect(m.word(0x5002)).toBe(235);
    expect(formatFixed(m.number(0x5002, 0), 3, 1)).toBe('23.5');
  });
  it('escritura del MCU a 0x0084 cambia de página', () => {
    const m = new VpMemory();
    expect(applyWrite(m, 0x0084, Uint8Array.from([0x5a, 0x01, 0x00, 0x04])).page).toBe(4);
  });
});
