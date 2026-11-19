// Perfiles de pantalla: un JSON por modelo (carpeta perfiles/) más un perfil genérico por
// cada resolución de V7.651. Ver perfiles/README.md y docs/PLAN.md (Hito 3).

import { RESOLUTIONS } from './project';
import type { Project, ProjectSettings } from './types';

export type Verification = 'documentado' | 'archivos' | 'pantalla';

export interface ScreenProfile {
  id: string;
  nombre: string;
  familia?: 'T5L' | 'COF' | '2K';
  resolucion: [number, number];
  forma: 'rectangular' | 'circular';
  flashMB: 8 | 16 | 32 | 64;
  firmware: { escalaTextoII: boolean; crcPorDefecto: boolean; videoICL?: boolean; audioWAE?: boolean; camaraFSK?: boolean; camara31?: boolean };
  verificacion: Verification;
  fuentes?: string[];
  notas?: string;
  generico?: boolean;
}

export const VERIFICATION_LABEL: Record<Verification, string> = {
  documentado: 'Documentado',
  archivos: 'Verificado con archivos',
  pantalla: 'Probado en pantalla',
};

const FLASH = [8, 16, 32, 64];

/** Comprueba un perfil leído de JSON. Devuelve los problemas encontrados. */
export function checkProfile(p: Partial<ScreenProfile>): string[] {
  const errs: string[] = [];
  if (!p.id || !/^[a-z0-9-]+$/.test(p.id)) errs.push('id vacío o con caracteres no válidos');
  if (!p.nombre) errs.push('falta nombre');
  const r = p.resolucion;
  if (!Array.isArray(r) || r.length !== 2 || !r.every((n) => Number.isInteger(n) && n > 0 && n <= 4096)) errs.push('resolución no válida');
  if (p.forma !== 'rectangular' && p.forma !== 'circular') errs.push('forma no válida');
  if (!FLASH.includes(Number(p.flashMB))) errs.push('flashMB debe ser 8, 16, 32 o 64');
  if (typeof p.firmware?.escalaTextoII !== 'boolean' || typeof p.firmware?.crcPorDefecto !== 'boolean') errs.push('firmware incompleto');
  for (const key of ['videoICL', 'audioWAE', 'camaraFSK', 'camara31'] as const) if (p.firmware?.[key] !== undefined && typeof p.firmware[key] !== 'boolean') errs.push(`${key} debe ser booleano u omitirse si se desconoce`);
  if (!p.verificacion || !(p.verificacion in VERIFICATION_LABEL)) errs.push('verificación no válida');
  return errs;
}

/** Perfil genérico para una resolución: 16 MB, Texto DGUS II con escala, sin CRC. */
export function genericProfile(w: number, h: number): ScreenProfile {
  return {
    id: `generico-${w}x${h}`,
    nombre: `T5L genérico ${w} × ${h}`,
    familia: 'T5L',
    resolucion: [w, h],
    forma: 'rectangular',
    flashMB: 16,
    firmware: { escalaTextoII: true, crcPorDefecto: false },
    verificacion: 'documentado',
    notas: 'Resolución del selector de V7.651 (Config/Terminal.ini). Ajuste la memoria si su modelo es distinto.',
    generico: true,
  };
}

const modules = import.meta.glob<{ default: ScreenProfile }>('../../perfiles/*.json', { eager: true });

export const MODEL_PROFILES: ScreenProfile[] = Object.values(modules)
  .map((m) => m.default)
  .filter((p) => checkProfile(p).length === 0)
  .sort((a, b) => a.nombre.localeCompare(b.nombre));

export const GENERIC_PROFILES: ScreenProfile[] = RESOLUTIONS.map((r) => genericProfile(r.w, r.h));

export const ALL_PROFILES: ScreenProfile[] = [...MODEL_PROFILES, ...GENERIC_PROFILES];

export function findProfile(id: string | undefined): ScreenProfile | undefined {
  if (!id) return undefined;
  const known = ALL_PROFILES.find((p) => p.id === id);
  if (known) return known;
  const m = /^generico-(\d+)x(\d+)$/.exec(id);
  return m ? genericProfile(Number(m[1]), Number(m[2])) : undefined;
}

/** Perfil del proyecto: el elegido o, si no hay, el genérico de su resolución. */
export function projectProfile(project: Project): ScreenProfile {
  return findProfile(project.settings.profileId) ?? genericProfile(project.settings.width, project.settings.height);
}

export function searchProfiles(q: string): ScreenProfile[] {
  const needle = q.trim().toLowerCase().replace(/×/g, 'x').replace(/\s+/g, '');
  if (!needle) return ALL_PROFILES;
  return ALL_PROFILES.filter((p) => `${p.nombre} ${p.id} ${p.resolucion[0]}x${p.resolucion[1]} ${p.familia ?? ''}`.toLowerCase().replace(/×/g, 'x').replace(/\s+/g, '').includes(needle));
}

/** Ajustes que fija un perfil. El resto de la configuración del proyecto se conserva. */
export function profileSettings(p: ScreenProfile): Partial<ProjectSettings> {
  return { profileId: p.id, width: p.resolucion[0], height: p.resolucion[1], flashMiB: p.flashMB };
}

export interface ProfileIssue {
  level: 'warn' | 'error';
  text: string;
  pageId?: number;
  controlId?: string;
}

/** Comprueba el proyecto contra su perfil: forma circular y funciones del firmware. */
export function checkAgainstProfile(project: Project): ProfileIssue[] {
  const p = projectProfile(project);
  const out: ProfileIssue[] = [];
  const { width: W, height: H } = project.settings;
  for (const page of project.pages)
    for (const c of page.controls) {
      if (p.forma === 'circular') {
        const r = Math.min(W, H) / 2;
        const cx = W / 2;
        const cy = H / 2;
        const corners = [
          [c.x, c.y],
          [c.x + c.w, c.y],
          [c.x, c.y + c.h],
          [c.x + c.w, c.y + c.h],
        ];
        if (corners.some(([x, y]) => (x - cx) ** 2 + (y - cy) ** 2 > r * r)) {
          out.push({ level: 'warn', text: `"${c.name}" queda en parte fuera del círculo visible de la pantalla.`, pageId: page.id, controlId: c.id });
        }
      }
      if (c.type === 'textII' && !p.firmware.escalaTextoII && Number(c.props.fontHeight ?? 100) !== 100) {
        out.push({ level: 'warn', text: `"${c.name}": este perfil no admite escala en Texto DGUS II; se verá al 100 %.`, pageId: page.id, controlId: c.id });
      }
      const capability = c.type === 'video' ? 'videoICL' : c.type === 'camera' ? 'camara31' : c.type === 'iconOverlay' && c.props.fskCamera ? 'camaraFSK' : null;
      if (capability) {
        const status = p.firmware[capability];
        const feature = capability === 'videoICL' ? 'video ICL (requiere GUI V50 compatible)' : capability === 'camara31' ? 'cámara 0x31' : 'cámara FSK por JPEG (requiere GUI V49 y bus FSK)';
        out.push({ level: 'warn', text: `"${c.name}": ${status === true ? `soporte documentado de ${feature}; compruebe el firmware y el hardware instalados` : status === false ? `el perfil indica que no admite ${feature}` : `soporte de ${feature} sin confirmar en este perfil`}. La reproducción no está emulada en el lienzo.`, pageId: page.id, controlId: c.id });
      }
    }
  if (Object.keys(project.extraFiles ?? {}).some((name) => /\.wae$/i.test(name)) && p.firmware.audioWAE !== true) out.push({ level: 'warn', text: 'Audio WAE: confirme la salida de sonido y el firmware del modelo elegido.' });
  return out;
}
