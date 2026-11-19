import { crc16Modbus } from './icl';

export interface PcmAudio { samples: Int16Array; rate: number }

/** RIFF/WAVE PCM (8/16/24/32 bits) y IEEE float32; chunks adicionales se omiten. */
export function readWav(data: Uint8Array): PcmAudio {
  const v = new DataView(data.buffer, data.byteOffset, data.length);
  const text = (at: number, n: number) => String.fromCharCode(...data.slice(at, at + n));
  if (data.length < 12 || text(0, 4) !== 'RIFF' || text(8, 4) !== 'WAVE') throw new Error('El archivo no es un WAV RIFF.');
  const end = v.getUint32(4, true) + 8; if (end > data.length) throw new Error('WAV truncado.');
  let format = 0, channels = 0, rate = 0, bits = 0, align = 0; let audio: Uint8Array | undefined;
  for (let at = 12; at + 8 <= end;) {
    const size = v.getUint32(at + 4, true), name = text(at, 4), start = at + 8;
    if (start + size > end) throw new Error('Chunk WAV truncado.');
    if (name === 'fmt ') {
      if (size < 16) throw new Error('Cabecera WAV incompleta.');
      format = v.getUint16(start, true); channels = v.getUint16(start + 2, true); rate = v.getUint32(start + 4, true); align = v.getUint16(start + 12, true); bits = v.getUint16(start + 14, true);
    } else if (name === 'data' && !audio) audio = data.subarray(start, start + size);
    at = start + size + (size & 1);
  }
  if (!audio || ![1, 3].includes(format) || ![8, 16, 24, 32].includes(bits) || (format === 3 && bits !== 32) || channels < 1 || channels > 8 || rate < 4000 || rate > 192000 || align !== channels * bits / 8 || audio.length % align) throw new Error('Formato WAV no admitido. Use PCM de 8/16/24/32 bits o float32.');
  const count = audio.length / align;
  if (!count || count > 16000000) throw new Error('El audio está vacío o supera el límite de 16 millones de muestras.');
  const pcm = new Int16Array(count); const dv = new DataView(audio.buffer, audio.byteOffset, audio.length); const bytes = bits / 8;
  for (let i = 0; i < count; i++) {
    let value = 0;
    for (let c = 0; c < channels; c++) {
      const at = i * align + c * bytes;
      const n = format === 3 ? dv.getFloat32(at, true) * 32768 : bits === 8 ? (dv.getUint8(at) - 128) * 256 : bits === 16 ? dv.getInt16(at, true) : bits === 24 ? ((dv.getUint8(at) | dv.getUint8(at + 1) << 8 | dv.getInt8(at + 2) << 16) / 256) : dv.getInt32(at, true) / 65536;
      if (!Number.isFinite(n)) throw new Error('El WAV contiene muestras no finitas.'); value += n;
    }
    pcm[i] = Math.max(-32768, Math.min(32767, Math.round(value / channels)));
  }
  return { samples: pcm, rate };
}

/** Mezcla mono y conversión determinista a 32 kHz. Sin dependencia del dispositivo de sonido. */
export function pcm32k(audio: PcmAudio): Int16Array {
  if (audio.rate === 32000) return audio.samples.slice();
  const n = Math.ceil(audio.samples.length * 32000 / audio.rate); if (n > 16000000) throw new Error('El audio convertido supera el límite de muestras.');
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const position = i * audio.rate / 32000, a = Math.floor(position), f = position - a;
    out[i] = Math.round(audio.samples[Math.min(a, audio.samples.length - 1)] * (1 - f) + audio.samples[Math.min(a + 1, audio.samples.length - 1)] * f);
  }
  return out;
}

/** DGUS_2 WAE de PCM 16 bits, modo 03 de AllTool. Índice y segmentos alineados a 4 KB. */
export function buildWae(clips: { id: number; samples: Int16Array }[], fadeIn = true): Uint8Array {
  if (!clips.length || clips.length > 256 || clips.some((c) => !Number.isInteger(c.id) || c.id < 0 || c.id > 255 || !c.samples.length) || new Set(clips.map((c) => c.id)).size !== clips.length) throw new Error('Use de 1 a 256 segmentos con IDs distintos entre 0 y 255 y audio no vacío.');
  const count = Math.max(...clips.map((c) => c.id)) + 1;
  const size = 4096 + clips.reduce((n, c) => n + Math.ceil((c.samples.length * 2 + 2) / 4096) * 4096, 0);
  if (size > 64 * 1024 * 1024) throw new Error('La biblioteca WAE supera 64 MB.');
  const out = new Uint8Array(size); const v = new DataView(out.buffer);
  out.set([68, 71, 85, 83, 95, 50]); v.setUint32(8, size - 8); out[12] = 3; v.setUint16(13, count);
  let at = 4096;
  for (const clip of [...clips].sort((a, b) => a.id - b.id)) {
    v.setUint32(16 + clip.id * 8, at); v.setUint32(20 + clip.id * 8, clip.samples.length * 2 + 2);
    let gain = Math.fround(0); const step = Math.fround(1 / 160);
    for (let i = 0; i < clip.samples.length; i++) {
      let sample = clip.samples[i];
      if (fadeIn) {
        // AllTool/BASS: ganancia acumulada float32 y conversión PCM con empate al par.
        gain = Math.fround(gain + step);
        const value = Math.fround(Math.fround(sample / 32768) * Math.min(1, gain)) * 32768;
        const low = Math.floor(value); sample = value - low === 0.5 ? low + (low % 2 !== 0 ? 1 : 0) : Math.round(value);
      }
      v.setInt16(at + i * 2, sample, true);
    }
    at += Math.ceil((clip.samples.length * 2 + 2) / 4096) * 4096;
  }
  const crc = crc16Modbus(out, 8); out[6] = crc & 255; out[7] = crc >> 8;
  return out;
}
