# Guía para continuar el desarrollo

Este documento es para quien retome el proyecto (persona o modelo de IA). Léalo entero antes de cambiar código.

## Migración en curso

**Perfiles de pantalla:** un JSON por modelo en `perfiles/` (ver `perfiles/README.md`) más genéricos por resolución en `src/core/profiles.ts`. Cuando el usuario confirme su pantalla en el Hito 2, añadir su perfil con `verificacion: "pantalla"`.

**Prueba en pantalla real:** [PRUEBAS_HARDWARE.md](PRUEBAS_HARDWARE.md) con `ejemplos/prueba-t5l.dgusx` (`npm run ejemplo` lo regenera).

**El plan vigente es [PLAN.md](PLAN.md)**: hitos, principios y modelo de perfiles de pantalla. La lista de pendientes más abajo es histórica.

Antes de continuar, consultar [ETAPAS.md](ETAPAS.md), que registra cada etapa implementada y su validación. **Estado actual: etapa 11, Hito 6 en curso; 229 pruebas con las muestras configuradas.** Red, tabla de idiomas con ICL, WAE PCM16, video a ICL y recuperación de metadatos están implementados. Se añadieron ASCII gris fontbit4 de 4/8 bits y el asistente FSK V49 por JPEG. Faltan los generadores Roll Char/UIC y GTF, las otras codificaciones especiales y la verificación física de cámara/video. Leer [HITO6.md](HITO6.md) antes de retomarlos. El alcance está definido en [MIGRACION_COMPATIBILIDAD_DWIN.md](MIGRACION_COMPATIBILIDAD_DWIN.md). Los estados históricos siguientes no sustituyen el registro de etapas.

**Hallazgos al cerrar la etapa 3:** el flujo integrado conserva los recursos binarios de seis muestras y rechaza cuatro por solapes reales de archivos: fuentes 0/1 en Muestra A e ICL 23/24 en Muestra C (copia), Muestra C y Muestra D. Las diez pruebas anteriores del compilador siguen dando igualdad byte a byte; eso no equivale a aprobar la distribución física de todos los recursos. No eliminar archivos ni reasignar sus IDs automáticamente: las referencias, incluidos los bloques originales sin decodificar, deben revisarse primero. Los originales siguen siendo solo lectura.

La reasignación revisable de recursos, los perfiles, los teclados y la configuración de sistema se completaron en etapas posteriores; consultar el plan vigente. El CFG incluido en el paquete **no se transmite** con la descarga NOR actual: requiere SD. `src/core/package.ts` concentra asignación y validación; `src/core/zip.ts` crea la descarga única del navegador. En Electron, si ya existe DWIN_SET, se genera otra carpeta DGUS-…/DWIN_SET, conservando la anterior.

## Objetivo

T5L Studio reemplaza a **DGUS V7.651** (editor de DWIN para pantallas T5L) con una interfaz moderna estilo Nextion Editor. La regla de oro es la **compatibilidad binaria**: todo lo que se exporte debe ser lo que la pantalla espera, byte a byte, igual que lo genera DGUS 7.6.

- El usuario habla español. Toda la interfaz, los mensajes y la documentación van en español.
- La carpeta original de DGUS está en `<carpeta-de-DGUS-V7.651>` (este proyecto vive en su subcarpeta `DGUS-Studio`).
- Los proyectos reales del usuario (para verificar compatibilidad) están en `<carpeta-de-proyectos-DGUS>` (Muestra A, Muestra B, Muestra E, ROUND…). **Solo lectura**: no modificar ni copiar dentro del repositorio.

## Estado actual (noviembre 2026)

| Área | Estado | Verificación |
|---|---|---|
| Editor (lienzo, páginas, propiedades, deshacer, temas) | Hecho | Probado en navegador |
| 48 controles con codificación 13/14 | Hecho | Pruebas + 10 proyectos reales idénticos |
| 22_Config.bin (valores iniciales) | Hecho | 10 proyectos reales idénticos |
| Importar DWIN_SET de DGUS 7.6 | Hecho | 10 proyectos reales |
| ICL (leer/generar, fondos 32.icl, iconos) | Hecho | 21 ICL reales idénticos |
| Simulador en el lienzo | Hecho | Pruebas + navegador |
| Puerto serie: monitor, variables, descarga, «PC simula la pantalla» | Hecho | Solo con puerto falso; **falta hardware real** |
| Fuentes 0# ASCII | Hecho | Reconstruye un 0_DWIN_ASC.HZK real byte a byte |
| Fuente Unicode gris DGUS_2 | Hecho | Portado del código; sin archivo real para comparar |
| Fuentes de mapa de bits fijo (GB2312/Unicode/8 bits) | Hecho | **No verificado** (según manual) |
| Instalador NSIS | Hecho | La app empaquetada arranca; instalador no ejecutado |

## Pendiente, por prioridad

1. **Probar con hardware real** (lo pide el usuario como siguiente paso natural):
   - Exportar un proyecto creado desde cero y cargarlo por SD en una pantalla T5L.
   - Puerto serie con adaptador USB real: comprobar que Electron lista el puerto (`select-serial-port` en `electron/main.cjs`), lectura/escritura de VP y descarga por sectores. La respuesta exacta de la pantalla a `5A A5 03 8F 55 NN` no se conoce; hoy se acepta cualquier respuesta (igual que DGUS).
2. **Completar Hito 6:** Roll Char/UIC, fuentes GTF y grises especiales, y verificar video/cámara por perfil. El generador de teclados por páginas está hecho desde la etapa 7; no confundir `Keyboard_UIC.exe` con `Font_UIC.exe`, usado para Roll Char. Consultar [HITO6.md](HITO6.md) para las referencias nativas.
3. **Verificar con la pantalla** la fuente gris DGUS_2 y las de mapa de bits fijo; ajustar `src/core/fonts.ts` si algo no cuadra.
4. **Metadatos:** hecho en etapa 10. `DWprj.hmi` es un INI; los documentos NRBF están en los TFT. Los metadatos ambiguos o que cambien los binarios se ignoran.
5. **Decodificadores:** los siete restantes conocidos se hicieron en etapa 9. Un bloque no reproducible se conserva como original; no convertirlo sin comprobar igualdad.
6. Firma digital del instalador (evita el aviso de SmartScreen) y actualizaciones automáticas.
7. Rendimiento: el bundle pesa ~950 KB porque `Icon.tsx` importa todos los iconos de lucide; usar imports con nombre.

## Cómo trabajar

```bash
cd DGUS-Studio
npm install
npm run dev            # navegador en http://localhost:5173
npm run build && npm run electron   # app de escritorio
npm test               # pruebas
DGUS_SAMPLES="<carpeta-de-proyectos-DGUS>" npm test   # + compatibilidad con proyectos reales
npm run dist           # instalador en release/
DGUS_SMOKE=1 npx electron .        # prueba de humo: carga oculta y sale, imprime "SMOKE {...}"
DGUS_SMOKE=1 DGUS_SMOKE_SCRIPT=scripts/smoke/simulador.js npx electron .   # además ejecuta un guion en la app (ver scripts/smoke/README.md)
npm run verificar      # lo mismo que la integración continua: tipos, pruebas, build y npm audit
```

**Antes de dar algo por terminado:** `npm run build` (incluye TypeScript), `npm test` con `DGUS_SAMPLES` (244 pruebas en la etapa 17, incluidas las de ida y vuelta), prueba de humo y `git diff --check`. Cerrar cada etapa con documentación y commit. El instalador de release no se actualiza al compilar: no presentar uno anterior como la versión actual.

## Arquitectura

```
src/core/        Sin interfaz, sin DOM salvo atob/btoa. Todo lo binario vive aquí y tiene pruebas.
  types.ts         Modelo de proyecto (.dgusx = JSON)
  bytes.ts         Buf (escritura big-endian), hex, base64, RGB565
  controls/
    schema.ts      ControlDef: campos (FieldDef), encode(), init(), preview()
    display.ts     32 controles de 14ShowFile.bin (bloques de 32 bytes)
    touch.ts       16 controles de 13TouchFile.bin (16/32/48/64 bytes)
    decoders.ts    Inversa de display/touch para importar
    raw.ts         Bloques importados que se conservan tal cual
    init.ts        Valores iniciales para 22_Config.bin
  build.ts         Genera 13/14/22 (modos normal, cifrado XOR, bloque fijo)
  importer.ts      Importa una carpeta DWIN_SET
  icl.ts           Formato ICL "DGUS_3"
  fonts.ts         Fuentes 0#, DGUS_2, mapa de bits
  protocol.ts      Tramas serie DGUS II y plan de descarga por sectores
  simulator.ts     Memoria VP y comportamiento táctil
src/ui/          React 18 + zustand 5
  store.ts         Proyecto, selección, deshacer (copias completas, máx. 100)
  comm.ts          Puerto serie (Web Serial), simulador, descarga
  actions.ts       Abrir/guardar/importar/exportar
  platform.ts      Electron (window.dgus) o navegador
  iconCache.ts, fontRender.ts   Vista previa de iconos ICL y fuentes
  components/      Topbar, Toolbox(+Resources), Canvas, ControlView, Pages, Properties, Output(panel inferior), dialogs
electron/        main.cjs (diálogos, archivos, Web Serial, apertura de .dgusx) y preload.cjs
docs/FORMATOS.md Especificación de todos los formatos binarios y del protocolo
```

Para **añadir un control**: crear su `ControlDef` en `display.ts` o `touch.ts` (campos + `encode`), registrarlo en la lista exportada, añadir su decodificador en `decoders.ts` y, si muestra iconos, su entrada en `ICON_PREVIEW` (`ui/iconCache.ts`) y en `ICON_OF` (`core/importer.ts`).

## De dónde sale cada formato

Los formatos se documentaron por **interoperabilidad**: a partir de la guía oficial *T5L DGUS II Application Development Guide* y del análisis de los archivos y el comportamiento de DGUS V7.651 en una copia instalada legalmente. El detalle de cada archivo está en [FORMATOS.md](FORMATOS.md). Las salidas de referencia quedaron fijadas como pruebas en `src/core/__tests__/` (por ejemplo, `build.test.ts`).

Este repositorio **no contiene código, binarios, recursos ni documentos de DWIN**. Las pruebas de ida y vuelta usan proyectos del usuario, que no se publican (`DGUS_SAMPLES`).

## Trampas conocidas (descubiertas con los proyectos reales)

- **Resolución**: los proyectos del usuario son verticales **480×854**. DGUS recorta áreas de teclado/menú a ancho-1/alto-1, así que una resolución errónea cambia bytes. `importer.ts` la deduce de fondos + coordenadas.
- «Limitar rango» de la entrada numérica se guarda como `0xFF`, no `1`. El origen de teclado `0x0F` debe conservarse.
- En «Texto ASCII» el área de escritura (bytes 27–36) es distinta del área táctil (campos `scanAuto`/`scanX1…`).
- La variable numérica puede tener texto de unidad con longitud 0 (campo `unitLen`).
- El «tamaño de fuente» de variables/RTC/HEX es el **ancho**; el alto es el doble.
- ICL real: el relleno del segmento SOS es `00` (no `FF`), y tras `FF D9` van 8 ceros + relleno a 4.
- Fondos: se prefiere la imagen del `32.icl` sobre los BMP/PNG sueltos de DWIN_SET (lo que se ve en pantalla es el ICL). Los JPEG ya válidos se reutilizan sin recodificar para no perder calidad.
- Dentro de cada página, 13 y 14 guardan los controles **del último al primero**.
- Zustand 5: un selector que devuelve un objeto nuevo (`?? {}`) provoca bucles; usar constantes vacías fuera del componente.
- En modo estricto de React, no poner efectos dentro de actualizadores de estado (`setX(fn)`): se ejecutan dos veces.

## Verificación sin hardware

`src/ui/comm.ts` usa `navigator.serial`. En el navegador de pruebas se puede sustituir por un puerto falso con `Object.defineProperty(navigator, 'serial', …)` que devuelva `readable`/`writable` simulando la pantalla o el MCU; así se probaron lectura/escritura de VP, la descarga por sectores y el modo «PC simula la pantalla».
