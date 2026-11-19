// Imagen de fondo de una página de teclado, dibujada con canvas (se exporta luego al ICL de fondos).
import type { KeyDef } from '../core/keyboard';

export function drawKeyboard(width: number, height: number, area: { x: number; y: number; w: number; h: number }, keys: KeyDef[], title: string): string {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0f151e';
  g.fillRect(0, 0, width, height);
  g.fillStyle = '#94a3b8';
  g.font = `600 ${Math.max(14, Math.round(width / 28))}px Arial`;
  g.textAlign = 'center';
  g.textBaseline = 'bottom';
  g.fillText(title, width / 2, area.y - 10);
  g.fillStyle = '#1e293b';
  g.strokeStyle = '#64748b';
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(area.x, area.y, area.w, area.h, 10);
  g.fill();
  g.stroke();
  for (const k of keys) {
    const special = k.code >= 0xf0 && k.code <= 0xff;
    g.fillStyle = k.label === 'OK' ? '#16a34a' : k.label === 'ESC' ? '#b91c1c' : special ? '#475569' : '#2563eb';
    g.beginPath();
    g.roundRect(k.x, k.y, k.w, k.h, 8);
    g.fill();
    g.fillStyle = '#ffffff';
    const size = Math.min(k.h * 0.45, (k.w / Math.max(2, k.label.length)) * 1.4);
    g.font = `600 ${Math.round(size)}px Arial`;
    g.textBaseline = 'middle';
    g.fillText(k.label, k.x + k.w / 2, k.y + k.h / 2 + 1);
  }
  return c.toDataURL('image/png');
}
