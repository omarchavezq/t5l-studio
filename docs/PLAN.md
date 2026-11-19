# Plan de T5L Studio

Este es el **plan vigente**. Sustituye a las secciones de planificación de `MIGRACION_COMPATIBILIDAD_DWIN.md` y `ANALISIS_2026-11-18.md`, que quedan como investigación de fondo. El avance real de cada hito se registra en [ETAPAS.md](ETAPAS.md).

## Visión

Un editor **moderno y sencillo** para pantallas DWIN con firmware **DGUS II** (las que usa DGUS V7.651), que genere exactamente lo que la pantalla espera.

- El usuario piensa en **páginas, botones, textos y tamaños en píxeles**. El programa se encarga de direcciones VP, IDs de fuentes, sectores de memoria, ICL y CFG.
- **Un solo botón** («Generar para pantalla») produce la carpeta DWIN_SET completa, o la descarga por puerto serie.
- **Lo que se ve es lo que sale.** La vista previa se dibuja con las mismas fuentes e imágenes que se exportan.

## Principios (para no complicarlo)

1. **Un único núcleo DGUS II para todas las pantallas.** Las diferencias entre modelos se describen en un **perfil** pequeño, sin código especial por modelo.
2. **Compatibilidad comprobable.** Un proyecto importado y no modificado debe exportarse idéntico byte a byte. Un proyecto nuevo debe cumplir el formato documentado en [FORMATOS.md](FORMATOS.md).
3. **No inventar certezas.** Cada perfil y cada función indica si está *documentada*, *verificada con archivos* o *probada en pantalla*. Lo no probado se muestra como tal.
4. **Avisar en lugar de bloquear**, salvo cuando la salida no se pueda representar o sea seguro que se dañará. El usuario decide con información clara.
5. **Nada nuevo sin pruebas.** Cada cambio en `src/core` lleva pruebas, y la ida y vuelta de los proyectos reales debe seguir pasando.

**Fuera de alcance:** pantallas DWIN con firmware TA, Linux o Android, y certificar modelos que nadie ha probado.

## Perfil de pantalla (modelo simple)

Un perfil es un archivo JSON en `perfiles/`. Basta con esto:

```json
{
  "id": "dmg80480c070-04w",
  "nombre": "DMG80480C070_04W (7\" 800×480)",
  "resolucion": [800, 480],
  "forma": "rectangular",
  "flashMB": 16,
  "firmware": { "escalaTextoII": true, "crcPorDefecto": false },
  "verificacion": "documentado",
  "fuentes": ["https://…ficha.pdf"]
}
```

- Hay **perfiles genéricos** «T5L genérico W×H» para las resoluciones del selector V7.651 (`Config/Terminal.ini`), con 16 MB como punto de partida. No identifican la capacidad real ni confirman funciones multimedia; esos datos se ajustan según el modelo y su ficha.
- Los modelos concretos se añaden como perfiles nuevos, sin tocar código, cuando haya ficha o prueba.
- El proyecto guarda el `id` del perfil y puede cambiarse después. Cambiar de perfil solo ajusta tamaño, memoria y opciones, y avisa de lo que no quepa.
- Cuando una función dependa del firmware (por ejemplo, la escala del Texto DGUS II en COF), el perfil la activa o desactiva y el editor muestra solo lo que esa pantalla admite.

## Estado de partida

Ya hecho y verificado (detalle en [ETAPAS.md](ETAPAS.md) y [CONTINUAR.md](CONTINUAR.md)):
- Editor completo y los 48 controles de V7.651.
- 13/14/22 e ICL idénticos en 10 proyectos reales.
- Importación de DWIN_SET.
- Simulador.
- Puerto serie probado con un puerto falso.
- Fuentes 0#, gris y fijas.
- Guardado seguro.
- Vista previa con fuentes reales.
- Generación integrada con CFG básico.
- Instalador.

La suite tiene 118 pruebas.

**Sin verificar todavía:**
- Una pantalla física.
- Un adaptador USB real.
- Las fuentes gris y fija contra la pantalla.

## Hitos

Cada hito se cierra con:
- pruebas en verde (incluida la ida y vuelta con `DGUS_SAMPLES`),
- una entrada en `ETAPAS.md`,
- un commit.

Los hitos 1 y 2 son prioritarios. Del 3 en adelante el orden puede cambiar según lo que pida el usuario. La tabla **Paridad con V7.651** del final dice qué falta y en qué hito va.

### Hito 1. Cerrar lo abierto (corto) — ✅ hecho (etapa 4)

1. **Commit** del trabajo de las etapas 1–3, que sigue sin guardar en git.
2. **Proyectos con archivos solapados** (4 de las 10 muestras: fuentes 0/1 en Muestra A e ICL 23/24 en tres carpetas). Al generar, mostrar el conflicto y dar dos salidas:
   - **«Reasignar automáticamente»**: propone nuevos números libres, enseña qué controles y referencias cambian (incluidos el CFG y los bloques originales que contengan IDs) y aplica el cambio en el proyecto, nunca en los archivos originales.
   - **«Generar igualmente»**: crea la carpeta tal cual, como hace DGUS 7.6, con un aviso claro de que un archivo sobrescribirá parte de otro en la pantalla.
3. **Puerto serie robusto**:
   - Rechazar las tramas con CRC incorrecto.
   - Tiempos de espera y reintentos.
   - Cola de envíos, para que no se mezclen lecturas y descarga.
   - Cancelar la descarga deja el estado limpio.
   - Probarlo con el puerto falso en todos los casos: respuesta rápida, partida, corrupta y ausente.
4. **Regenerar el instalador** (`npm run dist`) y comprobar en el PC instalación, apertura de un `.dgusx` y desinstalación.

*Listo cuando:* las 10 muestras generan su carpeta (reasignadas o con aviso), las pruebas serie cubren los cuatro casos y el instalador nuevo funciona.

### Hito 2. Prueba en pantalla real (puerta de calidad)

**Estado:** preparado (etapa 5). Proyecto `ejemplos/prueba-t5l.dgusx` y guía [PRUEBAS_HARDWARE.md](PRUEBAS_HARDWARE.md) listos; falta que el usuario lo pruebe en su pantalla y envíe los resultados.

Necesita al usuario y su pantalla, que tiene un panel vertical de 480×854.

1. Crear en el repositorio un **proyecto de referencia** pequeño y sin datos privados, `ejemplos/prueba-t5l.dgusx`, que cubra:
   - variable numérica, texto, Texto DGUS II, RTC y barra;
   - botón con valor de retorno, +/−, bit, entrada numérica con teclado y cambio de página;
   - valores iniciales y fuentes generadas.
2. Escribir una **lista de comprobación** en `docs/PRUEBAS_HARDWARE.md`: cargar por SD, comparar la posición y el tamaño de los textos con la vista previa, tocar cada botón, leer y escribir VP por serie y descargar por serie.
3. Registrar el modelo, el firmware, el CFG y los resultados. El perfil usado pasa a «probado en pantalla».
4. Corregir lo que salga distinto. Lo más probable son textos y escalas: ajustar `textLayout.ts` y `fonts.ts`.

*Listo cuando:* el proyecto de referencia se ve y funciona en la pantalla igual que en el simulador.

### Hito 3. Perfiles de pantalla — ✅ hecho (etapa 6)

1. Crear la carpeta `perfiles/` con:
   - los genéricos por resolución;
   - tres modelos documentados (DMG80480C070_04W, DMG48480F021_01W circular, DMG19108C156_05WTC 2K);
   - el perfil de la pantalla del usuario tras el hito 2.
2. El diálogo «Nuevo proyecto» elige un **perfil** (con buscador) en lugar de solo la resolución. En «Proyecto» se puede cambiar.
3. Usar el perfil en el editor y en la generación:
   - **forma**: máscara circular en el lienzo para pantallas redondas;
   - **memoria**: límite de sectores;
   - **firmware**: opciones disponibles y CRC por defecto.
4. Leer la versión del firmware por serie (VP `0x000F`) y sugerir el perfil, siempre como sugerencia.

*Listo cuando:* elegir otro perfil cambia lienzo, límites y opciones sin errores, y los perfiles indican su nivel de verificación.

### Hito 4. Teclados, asistentes y edición diaria — ✅ hecho (etapa 7; Roll Char pasa al Hito 6)

1. **Generador de teclados**: numérico, alfanumérico español (con ñ y tildes) y hexadecimal. Crea una página con su imagen y sus teclas (`basicTouch` con el código ASCII, como en los proyectos TECLADO del usuario). Las entradas numéricas y de texto se enlazan a ese teclado con un clic. En el simulador se muestra esa página en lugar de la ventana del navegador.
2. ~~Rodillo de caracteres (Roll Char)~~ → movido al Hito 6: su archivo UIC lo genera una herramienta nativa (`TOOL/Keyboard_UIC.exe`, Qt) y el formato aún no está descifrado.
3. **Edición como en V7.651**:
   - igualar ancho y alto, y distribuir espacios;
   - **arrays** de controles: copiar en filas y columnas incrementando la VP;
   - **editar una propiedad común en varios controles a la vez**;
   - bloquear y desbloquear en lote.
4. **Buscar VP** (`FrmFind`): localizar qué controles usan una dirección.
5. **Importar páginas** desde otro proyecto y una lista de **proyectos recientes**.
6. **Exportar la tabla de variables**. V7.651 genera `TouchConfig.xls` y `DisplayConfig.xls`, y el usuario los tiene en sus proyectos. Exportar CSV/XLSX con página, control, VP, tipo y longitud, más un **encabezado C (`.h`)** con `#define` de cada VP para el firmware del MCU. Esto último es una mejora sobre V7.651.
7. **Aviso de zonas táctiles superpuestas** en la misma página. V7.611 deja continuar al usuario; nosotros lo mismo.

### Hito 5. Funciones de sistema y comunicación — ✅ hecho (etapa 8; editores de red y Modbus pasan al Hito 6)

1. **Editor completo de `T5LCFG.CFG`** en «Proyecto», equivalente al «Config Generator»: brillo, zumbador, sensibilidad táctil, baudios, CRC, subida automática, orientación y carga de valores iniciales. Hoy solo se genera un CFG básico. Los valores que no conozcamos se conservan.
2. **Perilla giratoria física (encoder)**. V7.651 la configura por proyecto (puertos y pines del tipo de perilla) y por página, y genera `120.lib`. Hay que portarlo desde `frm_RotaryKnob` y `Project.GetRotaryKnobData`.
3. **Valores iniciales libres**: una tabla VP → valor para lo que no pertenece a ningún control, equivalente a `TOOL/22.exe`.
4. **Red y nube** (V7.59 y V7.642): configuración de red guardada en la zona de `22_Config.bin` que hoy se toma de `22.bakdata`, y el control de **configuración de red (配网)**.
5. **Comunicación Modbus con PLC** («HMI communication settings», `TOOL/modbus/PLC_Config.exe`, .NET). Documentar y reproducir el formato del archivo que genera.
6. **Descarga serie completa**: añadir `T5L51.bin` (programa del núcleo 8051) y los archivos UIC, que V7.651 también descarga y que hoy se descartan por no empezar con número. Avisar de que el CFG solo se carga por SD.

### Hito 6. Multilenguaje, multimedia y paridad restante — 🟡 en curso (etapas 9–11)

1. **Editores de red (配网, 22.bakdata) y Modbus (PLC_Config)**: ✅ Modbus/PLC hecho (etapa 9), red hecha (etapa 10). La red modifica solo los campos editados del 22 y conserva los restantes. Activación comparada con `Frm_NetConfig` original; conexión física pendiente.
2. **Rodillo de caracteres (Roll Char, UIC)**: descifrar el formato UIC desde los archivos que genera la herramienta de DWIN y crear el asistente.
3. **Multilenguaje**, el foco de V7.648–V7.651: ✅ flujo integrado (etapa 10).
   - Tabla por idioma, importación de valores de `2.xls` / XLSX / CSV y exportación XLSX. El estilo se configura en el editor.
   - VP común e idioma inicial; botones opcionales para cambiarlo.
   - ZIP con un DWIN_SET por idioma inicial.
   - ICL de traducciones rasterizadas y controles estándar 0x00. No reproduce los comandos globales DE/DF de otras herramientas; mantiene el cambio por VP.
4. **Audio y video**: 🟡 generadores hechos (etapa 10); reproducción y perfiles pendientes.
   - ✅ WAV a **WAE PCM16 de 32 kHz**, con muestra idéntica a AllTool. La modalidad comprimida 12:8 no se genera.
   - ✅ **Video a ICL**, con codecs del navegador/Electron y cancelación. No incluye audio ni emula la reproducción en el lienzo.
   - 🟡 Etapa 11: perfil FSK DMG10600T070_26W de 32 MB, capacidades multimedia con estado desconocido cuando no hay evidencia, y asistente de bus V49 por JPEG. Cámara 0x31 se mantiene diferenciada. Falta reproducción física.
5. **Fuentes GTF y grises especiales**: 🟡 etapa 11 añade ASCII de fontbit4, 4/8 bits, y su vista previa. Faltan el generador GTF, otras codificaciones de fontbit4 y la comprobación del texto desplazado.
6. ✅ Decodificadores editables para los 7 controles que se importaban como bloque original (etapa 9). Los tipos que siguen sin decodificador lo explican en el panel.
7. ✅ Recuperación opcional de nombres y tamaños (etapa 10). `DWprj.hmi` es un INI; los documentos NRBF están en `DWprj.tft` y `TFT/*.tft`. Se leen como datos, sin ejecutar la deserialización de .NET, y solo se aplican si 13/14/22 permanecen idénticos.

**Para cerrar el hito:** generador Roll Char/UIC, fuentes GTF y paridad de las fuentes especiales restantes, y evidencia física de video/cámara por perfil. Detalle del trabajo pendiente y de las muestras nativas: [HITO6.md](HITO6.md). La etapa 11 no cierra el Hito 6 ni la validación física del Hito 2.

### Hito 7. Calidad del producto — 🟡 en curso (etapa 13)

1. ✅ Electron 45, electron-builder 26, Vite 8 y Vitest 5 (etapa 16). `npm audit --omit=dev`: 0 vulnerabilidades. Quedan 6 avisos moderados de `minimatch` en la ruta de macOS de electron-builder (dmg-builder), que no se usa para el instalador de Windows.
2. ✅ Electron endurecido:
   - CSP en el build;
   - IPC solo desde la página de la app y con tipos validados;
   - `save-project` solo escribe en rutas elegidas por el usuario;
   - sin navegación, ventanas nuevas ni `webview`;
   - permisos denegados salvo el puerto serie.
3. ✅ Integración continua: `.github/workflows/ci.yml` (se activa al subir el repositorio a GitHub) y `npm run verificar` en local.
4. Rendimiento:
   - ✅ iconos de lucide importados por nombre (bundle principal de 1178 KB a 540 KB);
   - ✅ generación de fuentes en un *worker*, con progreso y cancelación, y respaldo en la ventana si el worker no carga;
   - ✅ historial de deshacer sin copiar los recursos binarios (etapa 14).
5. ⬜ Firmar el instalador y añadir actualizaciones automáticas: requiere un certificado de firma y un servidor de descargas del usuario.

## Paridad con V7.651

Inventario sacado de los menús (`Language/English.ini`), la pantalla de inicio, las herramientas de `TOOL/` y el historial `version.cfg`. **Estado:** ✅ hecho · 🟡 parcial · ⬜ pendiente.

| Función de V7.651 | Estado | Hito |
|---|---|---|
| Nuevo, abrir, guardar, generar, cerrar | ✅ | — |
| Importar proyecto (DWIN_SET) | ✅ | — |
| Importar páginas de otro proyecto | ✅ | — |
| Proyectos recientes | ✅ (app de escritorio) | — |
| Exportar tabla de variables (`TouchConfig.xls`, `DisplayConfig.xls`) | ✅ (CSV para Excel y `.h`) | — |
| 48 controles de visualización y táctiles | ✅ (todos editables al importar) | — |
| Mostrar controles sobre menú emergente | ✅ | — |
| Bloquear controles | ✅ (también en lote) | — |
| Alinear | ✅ | — |
| Igualar ancho y alto, distribuir | ✅ | — |
| Arrays | ✅ | — |
| Edición de propiedades en lote | ✅ | — |
| Buscar VP | ✅ | — |
| Comprobar variables (solapes de VP) | ✅ | — |
| Detección de zonas táctiles superpuestas | ✅ (aviso) | — |
| Vista previa y simulación desde la página actual o la primera | ✅ | — |
| Resolución y orientación vertical | ✅ (con perfiles de pantalla) | 3 |
| Variables por página, modo de icono, subida automática | ✅ | — |
| Puerto serie, depuración y descarga | ✅ (sin hardware) | 1–2 |
| Descarga de `T5L51.bin` y UIC | ✅ por SD (la guía indica que van solo por SD; la descarga serie avisa) | — |
| Generador ICL | ✅ | — |
| Conversión de imágenes | ✅ | — |
| Fuente 0# | ✅ | — |
| Fuente gris | ✅ UnicodeGrayFont; ASCII fontbit4 4/8 bits añadido (sin hardware) | 6 |
| Fuentes DGUS (HZK/DZK) | 🟡 (sin verificar) | 2 |
| Fuentes GTF | ⬜ | 6 |
| Config Generator (`T5LCFG.CFG`) | ✅ (campos de la guía; tiempos LCD se conservan) | — |
| Teclados | ✅ (página con teclas; UIC no necesario) | — |
| Rodillo (Roll Char UIC) | ⬜ | 6 |
| Perilla giratoria (`120.lib`) | ✅ | — |
| Editor de valores iniciales (`22.exe`) | ✅ (valores libres) | — |
| Configuración de red y control de red | ✅ (editor y botón; sin hardware) | 6 |
| Comunicación Modbus (PLC_Config) | ✅ (editor; se importa editable si sale idéntico) | — |
| Multilenguaje (edición, generación, ICL) | ✅ (tabla y VP común; comandos DE/DF no portados) | 6 |
| Generador WAE (audio) | ✅ (PCM16; muestra nativa idéntica) | 6 |
| Video a ICL | ✅ (conversión; reproducción física pendiente) | 6 |
| Cámara | 🟡 (0x31 conservado; asistente FSK V49 por JPEG y perfil documentado; sin hardware) | 6 |
| Nombres y metadatos de HMI/TFT | ✅ (recuperación conservadora sin cambiar binarios) | 6 |
| Opción «OS < V21 / > V21» | — no cambia la salida de V7.651; se registra en el perfil si alguna vez importa | 3 |

**Mejoras sobre V7.651** (no existen en el original): perfiles de pantalla, vista previa con las fuentes reales, generación con un botón, reasignación de recursos solapados, «PC simula la pantalla», encabezado `.h` para el MCU, tema oscuro e interfaz en un solo panel.

## Interfaz: criterios de diseño

- **Modo simple por defecto.** Las propiedades avanzadas (SP, códigos FE/FD, bytes) quedan plegadas en «Avanzado».
- **Errores que llevan al objeto.** Cada aviso de compilación selecciona la página y el control afectados.
- **Unidades humanas.** Píxeles, porcentaje y texto; el hexadecimal solo donde DGUS lo exige (VP).
- **Rápido.** Abrir, editar y generar sin esperas visibles; las tareas largas, con progreso y cancelables.
- **Consistente.** Nombres en español, mismos iconos y atajos que hoy, y tema claro y oscuro.
