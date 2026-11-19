import { encodeFreeValue } from './build';
import { createControl, getDef } from './controls';
import type { Project } from './types';

export interface FskSetup { width: number; height: number; dataVp: string; sourceVp: string; camera: number; device: number; speed: number; wait: number; mirror: boolean; infrared: boolean }
export const DEFAULT_FSK: FskSetup = { width: 640, height: 480, dataVp: '4000', sourceVp: '2000', camera: 0, device: 2, speed: 4, wait: 16, mirror: false, infrared: false };
export const fskWords = (o: FskSetup) => Math.ceil(o.width * o.height / 8 / 4096) * 2048;
const nvp = (s: string) => /^[0-9a-f]{4}$/i.test(s) ? parseInt(s, 16) : NaN;
const hex = (n: number) => n.toString(16).toUpperCase().padStart(4, '0');

/** Guía FSK V49: reservar imagen y fuentes de los comandos, sin escribir sobre otras VP. */
export function checkFskSetup(p: Project, o: FskSetup): string[] {
  const errors: string[] = []; const image = nvp(o.dataVp), source = nvp(o.sourceVp);
  if (![o.width, o.height].every((n) => Number.isInteger(n) && n >= 4 && n <= 1024 && n % 4 === 0) || o.width * o.height > 524288) errors.push('La cámara requiere dimensiones múltiplos de 4 y un búfer de hasta 64 KB.');
  if (!Number.isInteger(o.camera) || o.camera < 0 || o.camera > 30 || !Number.isInteger(o.device) || o.device < 1 || o.device > 31 || !Number.isInteger(o.speed) || o.speed < 0 || o.speed > 4 || !Number.isInteger(o.wait) || o.wait < 1 || o.wait > 255) errors.push('ID de cámara, interfaz, velocidad o espera fuera de rango.');
  if (!Number.isInteger(image) || image < 0x2000 || image % 2 || image + fskWords(o) > 0x10000) errors.push('El VP de imagen debe ser par, desde 2000, y dejar espacio para todo el búfer hasta FFFF.');
  if (!Number.isInteger(source) || source < 0x2000 || source + 22 > 0x10000) errors.push('El VP de comandos debe estar desde 2000 y dejar 22 palabras hasta FFFF.');
  if (errors.length) return errors;
  const ranges = [{ start: image, end: image + fskWords(o), label: 'imagen' }, { start: source, end: source + 2, label: 'bus' }, { start: source + 16, end: source + 22, label: 'cámara' }];
  const overlap = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;
  for (const [i, a] of ranges.entries()) if (ranges.slice(i + 1).some((b) => overlap(a, b))) errors.push('El búfer de imagen se solapa con los comandos de activación.');
  for (const page of p.pages) for (const c of page.controls) {
    const def = getDef(c.type);
    const used = (def.vpFields ?? []).map((f) => ({ start: parseInt(String(c.props[f.key]), 16), end: parseInt(String(c.props[f.key]), 16) + Math.max(1, f.words(c.props)) }));
    try { for (const e of def.init?.(c) ?? []) used.push({ start: e.vp, end: e.vp + Math.ceil(e.bytes.length / 2) }); }
    catch { errors.push(`Revise los valores iniciales de «${c.name}» antes de añadir la cámara.`); }
    const sp = nvp(String(c.props.sp)); if (sp !== 0xffff && Number.isFinite(sp)) used.push({ start: sp, end: sp + 16 });
    if (used.some((u) => ranges.some((r) => overlap(u, r)))) errors.push(`«${c.name}» ocupa alguna VP reservada para la cámara.`);
  }
  for (const v of p.initValues ?? []) {
    const start = parseInt(v.vp, 16), data = encodeFreeValue(v);
    if (data && ranges.some((r) => overlap({ start, end: start + Math.ceil(data.length / 2) }, r))) errors.push(`El valor libre ${v.vp} ocupa alguna VP reservada para la cámara.`);
  }
  return errors;
}

/** Compone controles estándar y sus datos del 22; no conecta ni modifica la pantalla. */
export function addFskCamera(p: Project, pageId: number, o: FskSetup): Project {
  const errors = checkFskSetup(p, o); if (errors.length) throw new Error(errors.join('\n'));
  const out = structuredClone(p), page = out.pages.find((page) => page.id === pageId); if (!page) throw new Error('La página ya no existe.');
  const image = createControl('iconOverlay', 0, 0, `Cámara FSK ${o.camera}`); image.w = Math.min(o.width, p.settings.width); image.h = Math.min(o.height, p.settings.height);
  Object.assign(image.props, { vp: o.dataVp, mode: 1, jpgFormat: 1, vpAddr: 0, fskCamera: true, fskWords: fskWords(o) });
  const button = createControl('keyDoRet', 10, Math.max(0, p.settings.height - 50), 'Activar cámara FSK');
  const address = nvp(o.dataVp) / 2, source = nvp(o.sourceVp);
  const camera = [0x80 | o.camera, address >> 8, address & 255, 2, 0x51, (o.mirror ? 128 : 0) | (o.infrared ? 64 : 0), o.width >> 8, o.width & 255, o.height >> 8, o.height & 255, 0, 0];
  Object.assign(button.props, { tpOn: 1, vp1s: hex(source), vp1t: '0100', len1: 2, ini1: `5A${o.speed.toString(16).padStart(2, '0')}${o.wait.toString(16).padStart(2, '0')}00`, tpOff: 1, vp3s: hex(source + 16), vp3t: hex(0x100 + o.device * 16), len3: 6, ini3: camera.map((n) => (n & 255).toString(16).padStart(2, '0')).join('') });
  page.controls.push(image, button); return out;
}
