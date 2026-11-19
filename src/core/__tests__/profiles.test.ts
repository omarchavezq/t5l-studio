import { describe, expect, it } from 'vitest';
import { ALL_PROFILES, GENERIC_PROFILES, MODEL_PROFILES, checkAgainstProfile, checkProfile, findProfile, profileSettings, projectProfile, searchProfiles } from '../profiles';
import { RESOLUTIONS, newProject } from '../project';
import { createControl } from '../controls';
import { buildProject } from '../build';

describe('catálogo de perfiles', () => {
  it('los JSON de perfiles/ son válidos y se cargan', () => {
    expect(MODEL_PROFILES.map((p) => p.id).sort()).toEqual(['dmg10600t070-26w', 'dmg19108c156-05wtc', 'dmg48480f021-01w', 'dmg80480c070-04w']);
    for (const p of MODEL_PROFILES) expect(checkProfile(p), p.id).toEqual([]);
  });
  it('un genérico por cada resolución de V7.651, sin ids repetidos', () => {
    expect(GENERIC_PROFILES).toHaveLength(RESOLUTIONS.length);
    const ids = ALL_PROFILES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(findProfile('generico-480x854')?.resolucion).toEqual([480, 854]);
  });
  it('búsqueda por resolución o modelo', () => {
    expect(searchProfiles('480x854').map((p) => p.id)).toContain('generico-480x854');
    expect(searchProfiles('480 × 480').map((p) => p.id)).toContain('dmg48480f021-01w');
    expect(searchProfiles('dmg8048').map((p) => p.id)).toEqual(['dmg80480c070-04w']);
  });
  it('detecta perfiles mal escritos', () => {
    expect(checkProfile({ id: 'X Y', resolucion: [0, 1], forma: 'cuadrada' as never, flashMB: 12 as never }).length).toBeGreaterThan(3);
  });
  it('proyectos sin perfil usan el genérico de su resolución', () => {
    const p = newProject('t', { width: 854, height: 480 });
    expect(projectProfile(p).id).toBe('generico-854x480');
  });
});

describe('perfil aplicado al proyecto', () => {
  it('fija resolución y memoria', () => {
    const round = findProfile('dmg48480f021-01w')!;
    expect(profileSettings(round)).toEqual({ profileId: 'dmg48480f021-01w', width: 480, height: 480, flashMiB: 8 });
  });
  it('pantalla circular: avisa de controles fuera del círculo', () => {
    const p = newProject('t', profileSettings(findProfile('dmg48480f021-01w')!));
    const corner = createControl('dataVar', 0, 0);
    const center = createControl('dataVar', 200, 220);
    center.w = 80;
    center.h = 40;
    p.pages[0].controls.push(corner, center);
    const issues = checkAgainstProfile(p);
    expect(issues.map((i) => i.controlId)).toEqual([corner.id]);
    expect(buildProject(p).messages.some((m) => m.controlId === corner.id && m.text.includes('círculo'))).toBe(true);
  });
  it('firmware sin escala de Texto DGUS II: avisa si se pide otra altura', () => {
    const p = newProject('t', profileSettings(findProfile('dmg48480f021-01w')!));
    const t = createControl('textII', 150, 200);
    t.props.fontHeight = 200;
    p.pages[0].controls.push(t);
    expect(checkAgainstProfile(p).some((i) => i.text.includes('escala'))).toBe(true);
    const q = newProject('t', profileSettings(findProfile('dmg80480c070-04w')!));
    q.pages[0].controls.push(t);
    expect(checkAgainstProfile(q)).toEqual([]);
  });
  it('distingue soporte multimedia documentado de un perfil desconocido', () => {
    const generic = newProject(); generic.pages[0].controls.push(createControl('video', 0, 0));
    expect(checkAgainstProfile(generic).some((i) => i.text.includes('sin confirmar'))).toBe(true);
    const fsk = newProject('t', profileSettings(findProfile('dmg10600t070-26w')!)); fsk.pages[0].controls.push(createControl('video', 0, 0));
    expect(checkAgainstProfile(fsk).some((i) => i.text.includes('soporte documentado'))).toBe(true);
    expect(findProfile('dmg10600t070-26w')?.flashMB).toBe(32);
    expect(checkProfile({ ...findProfile('dmg10600t070-26w')!, firmware: { escalaTextoII: true, crcPorDefecto: false, videoICL: 'sí' as never } })).toContain('videoICL debe ser booleano u omitirse si se desconoce');
  });
});
