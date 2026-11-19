import { buildIcl, type IclImage } from '../core/icl';
import { videoFrames } from '../core/video';
import { iclJpeg } from './platform';

function waitVideo(video: HTMLVideoElement, event: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const clean = () => { clearTimeout(timer); video.removeEventListener(event, done); video.removeEventListener('error', error); signal.removeEventListener('abort', abort); };
    const done = () => { clean(); resolve(); };
    const error = () => { clean(); reject(new Error('No se pudo decodificar el vídeo. Use un MP4/WebM compatible con el reproductor del PC.')); };
    const abort = () => { clean(); reject(new Error('Conversión cancelada.')); };
    const timer = setTimeout(() => { clean(); reject(new Error('El decodificador de vídeo no respondió en 15 segundos.')); }, 15000);
    video.addEventListener(event, done, { once: true }); video.addEventListener('error', error, { once: true }); signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

export async function videoToIcl(file: File, opts: { id: number; fps: number; width: number; height: number; quality: number }, signal: AbortSignal, progress: (n: number, total: number) => void): Promise<Uint8Array> {
  const video = document.createElement('video'); const url = URL.createObjectURL(file);
  try {
    video.muted = true; video.preload = 'auto';
    const ready = waitVideo(video, 'loadeddata', signal); video.src = url; video.load(); await ready;
    const times = videoFrames(video.duration, opts.fps, opts.width, opts.height);
    const canvas = document.createElement('canvas'); canvas.width = opts.width; canvas.height = opts.height; const g = canvas.getContext('2d')!;
    const images: IclImage[] = []; let bytes = 0;
    for (const time of times) {
      if (signal.aborted) throw new Error('Conversión cancelada.');
      if (Math.abs(video.currentTime - time) > 0.00001) { const sought = waitVideo(video, 'seeked', signal); video.currentTime = time; await sought; }
      g.fillStyle = '#000'; g.fillRect(0, 0, canvas.width, canvas.height); g.drawImage(video, 0, 0, canvas.width, canvas.height);
      const j = await iclJpeg(canvas.toDataURL('image/jpeg', opts.quality), null, null, opts.quality);
      bytes += j.jpeg.length; if (bytes > 64 * 1024 * 1024) throw new Error('Los fotogramas superan 64 MB. Reduzca la duración, resolución o calidad.');
      images.push({ id: images.length, jpeg: j.jpeg, width: canvas.width, height: canvas.height });
      progress(images.length, times.length);
    }
    return buildIcl(images, opts.id);
  } finally { video.pause(); video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
}
