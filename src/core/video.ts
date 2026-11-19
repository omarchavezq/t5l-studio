/** Plan temporal para Movie2ICL. Los fotogramas se almacenan con IDs consecutivos desde 0. */
export function videoFrames(duration: number, fps: number, width: number, height: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isInteger(fps) || fps < 1 || fps > 60) throw new Error('Duración o FPS no válidos (1–60).');
  if (![width, height].every((n) => Number.isInteger(n) && n > 0 && n <= 1920) || width * height > 2073600) throw new Error('Resolución de vídeo no válida; máximo 1920×1080 o equivalente.');
  const count = Math.max(1, Math.ceil(duration * fps - 1e-7));
  if (count > 2000) throw new Error('La conversión integrada admite hasta 2000 fotogramas por biblioteca. Recorte el vídeo o reduzca sus FPS.');
  return Array.from({ length: count }, (_, i) => i / fps);
}
