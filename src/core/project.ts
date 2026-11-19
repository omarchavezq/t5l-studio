import { createControl } from './controls';
import { defaultSettings, type Page, type Project, type ProjectSettings } from './types';

export const PROJECT_EXT = '.dgusx';

export const RESOLUTIONS: { label: string; w: number; h: number }[] = [
  { label: '480 × 272 (4.3")', w: 480, h: 272 },
  { label: '800 × 480 (5" / 7")', w: 800, h: 480 },
  { label: '1024 × 600 (7" / 10.1")', w: 1024, h: 600 },
  { label: '1280 × 800 (10.1")', w: 1280, h: 800 },
  { label: '320 × 240 (3.5")', w: 320, h: 240 },
  { label: '240 × 320 (2.8" vertical)', w: 240, h: 320 },
  { label: '480 × 480 (redonda / cuadrada)', w: 480, h: 480 },
  { label: '854 × 480', w: 854, h: 480 },
  { label: '1024 × 768', w: 1024, h: 768 },
  { label: '1280 × 480 (barra)', w: 1280, h: 480 },
  // Resoluciones adicionales de Config/Terminal.ini de V7.651, sin duplicados.
  ...[[320, 160], [480, 854], [800, 600], [512, 480], [512, 300], [400, 400], [640, 512],
    [850, 600], [854, 600], [600, 1024], [272, 480], [480, 400], [600, 800], [1364, 768],
    [768, 1024], [480, 320], [1280, 760], [720, 1280], [720, 720], [480, 800], [1920, 1080]]
    .map(([w, h]) => ({ label: `${w} × ${h}`, w, h })),
];

export function newProject(name = 'Proyecto nuevo', settings: Partial<ProjectSettings> = {}): Project {
  return {
    format: 'dgus-studio',
    version: 1,
    name,
    settings: { ...defaultSettings(), autoFonts: true, fontFamily: 'Arial', deviceConfig: 'basic', ...settings },
    pages: [{ id: 0, name: 'Inicio', controls: [] }],
    iconLibs: {},
    fonts: {},
  };
}

export function demoProject(): Project {
  const p = newProject('Demo');
  const home = p.pages[0];
  const title = createControl('text', 40, 30, 'Título');
  title.w = 420;
  title.h = 40;
  Object.assign(title.props, { vp: '5100', textLength: 32, init: 'Panel de control', fontX: 16, fontY: 32 });
  const temp = createControl('dataVar', 40, 110, 'Temperatura');
  temp.w = 200;
  temp.h = 48;
  Object.assign(temp.props, { vp: '5000', nInt: 3, nDot: 1, unit: ' C', init: '235', fontSize: 40, color: 0xffe0 });
  const set = createControl('dataInput', 40, 190, 'Consigna');
  Object.assign(set.props, { vp: '5002', nInt: 3, nDot: 1 });
  // Muestra la consigna para ver el efecto de la entrada y de los botones + / −.
  const setShow = createControl('dataVar', 360, 186, 'Consigna (valor)');
  Object.assign(setShow.props, { vp: '5002', nInt: 3, nDot: 1, unit: ' C', init: '200', fontSize: 20, color: 0x07ff });
  Object.assign(setShow, { w: 6 * 20, h: 40 });
  const minus = createControl('incAdjust', 200, 186, 'Bajar');
  Object.assign(minus.props, { vp: '5002', adjMode: 0, step: 5, vMax: 999 });
  const plus = createControl('incAdjust', 276, 186, 'Subir');
  Object.assign(plus.props, { vp: '5002', adjMode: 1, step: 5, vMax: 999 });
  const bar = createControl('progressBar', 40, 270, 'Nivel');
  Object.assign(bar.props, { vp: '5003', vMax: 100 });
  const btn = createControl('basicTouch', 600, 400, 'Ajustes');
  Object.assign(btn.props, { picNext: 1 });
  const clock = createControl('rtc', 560, 20, 'Hora');
  Object.assign(clock.props, { format: 'H:Q:S' });
  home.controls.push(title, temp, set, setShow, minus, plus, bar, btn, clock);
  // Valor inicial del nivel, para que la barra se vea igual en el editor y en la simulación.
  p.initValues = [{ vp: '5003', type: 'uint16', value: '50', note: 'Nivel inicial' }];

  const settings: Page = { id: 1, name: 'Ajustes', controls: [] };
  const back = createControl('basicTouch', 20, 400, 'Volver');
  Object.assign(back.props, { picNext: 0 });
  const sw = createControl('bitButton', 40, 80, 'Ventilador');
  Object.assign(sw.props, { vp: '5010', bitPos: 0 });
  const st = createControl('bitIcon', 160, 72, 'Estado ventilador');
  Object.assign(st.props, { vp: '5010', vpAux: '5011' });
  settings.controls.push(back, sw, st);
  p.pages.push(settings);
  return p;
}

export function serialize(project: Project): string {
  return JSON.stringify(project, null, 2);
}

export function deserialize(text: string): Project {
  const data = JSON.parse(text);
  if (data?.format !== 'dgus-studio') throw new Error('El archivo no es un proyecto de T5L Studio.');
  const p = data as Project;
  p.settings = { ...defaultSettings(), ...p.settings };
  p.iconLibs ??= {};
  p.fonts ??= {};
  for (const page of p.pages) page.controls ??= [];
  return p;
}

/** "12_fondo.jpg" -> 12; "DWIN_SET/3.bmp" -> 3 */
export function pageIdFromFileName(name: string): number | null {
  const base = name.split(/[\\/]/).pop() ?? name;
  const m = /^(\d+)/.exec(base);
  return m ? parseInt(m[1], 10) : null;
}

export function nextFreePageId(project: Project): number {
  const used = new Set(project.pages.map((p) => p.id));
  let i = 0;
  while (used.has(i)) i++;
  return i;
}
