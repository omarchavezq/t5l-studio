import { describe, expect, it } from 'vitest';
import { videoFrames } from '../video';
describe('plan del conversor de vídeo', () => {
  it('asigna tiempos consecutivos sin pedir un fotograma más allá del final', () => {
    expect(videoFrames(1, 4, 800, 480)).toEqual([0, 0.25, 0.5, 0.75]);
    expect(videoFrames(0.3, 4, 320, 240)).toEqual([0, 0.25]);
  });
  it('rechaza vídeos ilimitados y dimensiones o FPS no representables', () => {
    expect(() => videoFrames(Infinity, 15, 800, 480)).toThrow();
    expect(() => videoFrames(1, 0, 800, 480)).toThrow();
    expect(() => videoFrames(1, 15, 3840, 2160)).toThrow();
    expect(() => videoFrames(3000, 15, 800, 480)).toThrow('2000');
  });
});
