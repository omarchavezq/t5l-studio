import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { buildWae, pcm32k, readWav } from '../audio';
import { crc16Modbus } from '../icl';

function wav(samples: number[], rate = 32000, channels = 1): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2); const v = new DataView(bytes.buffer);
  const str = (at: number, s: string) => bytes.set([...s].map((c) => c.charCodeAt(0)), at);
  str(0, 'RIFF'); v.setUint32(4, bytes.length - 8, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, channels, true); v.setUint32(24, rate, true); v.setUint32(28, rate * channels * 2, true); v.setUint16(32, channels * 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, s, true)); return bytes;
}

describe('WAV y WAE DGUS II', () => {
  it('coincide con el WAE generado por AllTool (dos WAV sintéticos, modo 32k 16bit)', () => {
    const a = Array.from({ length: 40 }, (_, i) => [0, 1, -1, 32767, -32768][i % 5]);
    const b = Array.from({ length: 50 }, (_, i) => i % 2 ? -1000 : 1000);
    const out = buildWae([a, b].map((s, id) => ({ id, samples: readWav(wav(s)).samples })));
    expect(createHash('sha256').update(out).digest('hex')).toBe('a42e77865c4f61f5412006b34b17b52e34f6f48455f10502449e13d358332d4f');
    expect(out.length).toBe(12288); expect((out[7] << 8) | out[6]).toBe(crc16Modbus(out, 8));
  });
  it('preserva PCM16 mono, mezcla estéreo y convierte la frecuencia sin depender del PC', () => {
    expect([...readWav(wav([32767, -32768, 0])).samples]).toEqual([32767, -32768, 0]);
    const pcm = readWav(wav([1000, -1000, 2000, 4000], 16000, 2));
    expect([...pcm.samples]).toEqual([0, 3000]); expect([...pcm32k(pcm)]).toEqual([0, 1500, 3000, 3000]);
  });
  it('representa IDs dispersos, alinea a 4KB y usa PCM little-endian en el segmento', () => {
    const out = buildWae([{ id: 2, samples: new Int16Array([0x1234, -2]) }], false); const v = new DataView(out.buffer);
    expect(v.getUint16(13)).toBe(3); expect(v.getUint32(16)).toBe(0); expect(v.getUint32(32)).toBe(4096); expect(v.getUint32(36)).toBe(6);
    expect([...out.slice(4096, 4102)]).toEqual([0x34, 0x12, 0xfe, 0xff, 0, 0]);
  });
  it('rechaza audio truncado, formatos incoherentes e IDs ambiguos', () => {
    const bytes = wav([1, 2]); expect(() => readWav(bytes.slice(0, -1))).toThrow('truncado');
    bytes[32] = 7; expect(() => readWav(bytes)).toThrow('Formato');
    expect(() => buildWae([{ id: 0, samples: new Int16Array([1]) }, { id: 0, samples: new Int16Array([2]) }])).toThrow('IDs distintos');
  });
});
