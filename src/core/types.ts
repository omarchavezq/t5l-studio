import type { FreeInitValue } from './build';
import type { CfgModel } from './cfg';
import type { PlcConfig } from './modbus';
import type { NetworkSettings } from './network';
import type { LanguageTable } from './multilanguage';
// Modelo de proyecto de T5L Studio.
// Las coordenadas y tamaños están en píxeles de la pantalla física.

export type PropValue = number | string | boolean;
export type Props = Record<string, PropValue>;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ControlInstance extends Rect {
  id: string;
  type: string; // clave de ControlDef
  name: string;
  props: Props;
  locked?: boolean;
  hidden?: boolean;
  /** GUID original, cuando existe (enlace de la tabla 2.xls). */
  legacyId?: string;
}

export interface Page {
  id: number; // número de página DGUS (= número del archivo de fondo, p. ej. 0.jpg)
  name: string;
  background?: string; // dataURL o ruta relativa a DWIN_SET
  controls: ControlInstance[];
}

export type Rotation = 0 | 90 | 180 | 270;

export interface ProjectSettings {
  width: number;
  height: number;
  /** Variables por página en modo de bloque fijo (64/128/256). Solo afecta al modo "fixed". */
  varsPerPage: 64 | 128 | 256;
  /** Formato de 14ShowFile.bin: normal (recomendado), cifrado XOR o bloque fijo por página. */
  showFileMode: 'normal' | 'encrypted' | 'fixed';
  /** Nombres de los archivos de salida. DGUS 7.6 usa los nombres en inglés. */
  touchFileName: string;
  showFileName: string;
  configFileName: string;
  rotation: Rotation;
  /** Número del archivo ICL donde van los fondos de página (normalmente 32 → 32.icl). */
  bgIclId: number;
  /** Calidad JPEG (0-1) al generar ICL de fondos. */
  jpegQuality: number;
  /** Perfil de pantalla elegido (perfiles/*.json o generico-WxH). */
  profileId?: string;
  /** Versión de firmware leída de la pantalla (VP 0x000F), solo informativa. */
  firmwareVersion?: string;
  /** Capacidad NOR declarada; ausente en proyectos anteriores o importados. */
  flashMiB?: 8 | 16 | 32 | 64;
  autoFonts?: boolean;
  fontFamily?: string;
  /** Conservar CFG importado o generar solo parámetros lógicos, sin tiempos LCD/TP. */
  deviceConfig?: 'preserve' | 'basic' | 'custom';
  /** Configuración editada (modo «custom»): se escribe sobre el CFG importado o el básico. */
  cfg?: CfgModel;
}

export interface Project {
  format: 'dgus-studio';
  version: 1;
  name: string;
  settings: ProjectSettings;
  pages: Page[];
  /** Bibliotecas de iconos (.ICL) conocidas: id -> nombre de archivo */
  iconLibs: Record<number, string>;
  /** Fuentes: id -> nombre de archivo */
  fonts: Record<number, string>;
  /** Bibliotecas ICL de iconos incluidas en el proyecto: id -> contenido en base64. */
  icl?: Record<number, string>;
  /** Perilla física: modelo (índice de KNOB_MODELS) y RTC (0 ninguno, 1 8130, 2 2058). */
  knob?: { model: number; rtc: number };
  /** Valores iniciales libres de 22_Config.bin (como TOOL/22.exe de V7.651). */
  initValues?: FreeInitValue[];
  /** Comunicación con PLC o Modbus, guardada en 22_Config.bin (como TOOL/PLC_Config). */
  modbus?: PlcConfig;
  network?: NetworkSettings;
  multilanguage?: LanguageTable;
  /** Archivos de DWIN_SET que no se editan (fuentes .HZK/.DZK, CFG…): nombre -> base64. */
  extraFiles?: Record<string, string>;
}

export interface BuildContext {
  width: number;
  height: number;
}

export function defaultSettings(): ProjectSettings {
  return {
    width: 800,
    height: 480,
    varsPerPage: 64,
    showFileMode: 'normal',
    touchFileName: '13TouchFile.bin',
    showFileName: '14ShowFile.bin',
    configFileName: '22_Config.bin',
    rotation: 0,
    bgIclId: 32,
    jpegQuality: 0.9,
  };
}
