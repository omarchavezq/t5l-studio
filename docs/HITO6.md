# Hito 6: evidencia y trabajo pendiente

Actualizado el 18 de noviembre de 2026, etapa 11. El hito continúa abierto.

## Funciones disponibles

En **Herramientas** están los editores de PLC/Modbus y red, la tabla de idiomas, WAV a WAE y video a ICL. Los recursos generados se guardan dentro del `.dgusx` y se incluyen con **Generar para pantalla**. La importación de un proyecto completo intenta recuperar los metadatos HMI/TFT; no modifica los originales.

### Red

Se portó `Frm_NetConfig` del programa original. El editor guarda parches por campo, conserva los bytes desconocidos y la cola Modbus, y puede añadir un botón que escriba `5A00` en VP `0498`. La conexión requiere un módulo y firmware compatibles.

Se ejecutó `btnSave_Click` original mediante reflexión en un proceso de 32 bits sobre una imagen sintética de 131076 bytes: byte `i = (i × 17 + 23) % 256`. Activar la red sin editar campos produce el mismo SHA-256 en ambos programas:

`0ad138b7975a2ab4293bb25b27239f06d5f9106d9b41d109b06505a444a9873c`

No se comparó una conexión al servicio DWIN Cloud ni la asociación WiFi en hardware.

### Idiomas

La tabla admite hasta 32 idiomas y 4096 filas importadas. `2.xls` aporta GUID en la primera columna y traducciones en las siguientes; si hay una cabecera Clave/ID/GUID/Key, se usan sus nombres de idioma. Se leen valores, sin evaluar fórmulas ni ejecutar macros. La importación no traslada el formato de Excel.

Cada fila se enlaza a un control. Una sola rasterización crea los JPEG que después usan el lienzo y el ICL exportado. Los controles estándar de icono 0x00 comparten el VP de idioma; el valor 0 selecciona el primer idioma. Esto evita depender de los comandos globales DE/DF, que no se han portado. El fondo de cada traducción es opaco y los textos largos pueden quedar recortados al área elegida.

Al quitar una fila se restaura el control anterior; al quitar la última se elimina la tabla. El ICL se conserva para no romper otras referencias. La regeneración solo sustituye una biblioteca cuyo tamaño y CRC coincidan con el recurso administrado. Un valor inicial libre que ocupe el VP de idioma bloquea el paquete.

**Paquetes por idioma** usa la tabla ya guardada y prepara un ZIP con una carpeta DWIN_SET por idioma inicial; los recursos son comunes y cambia la palabra del idioma en el 22. No elimina las otras traducciones del ICL. Hay un límite de 65536 imágenes y 64 MB de JPEG durante la generación, además del espacio real que comprueba el paquete.

### Audio

WAV RIFF PCM de 8/16/24/32 bits o float32 se mezcla a mono y se convierte a 32 kHz mediante interpolación lineal. El WAE usa el modo PCM16 de AllTool, con rampa opcional de entrada de 5 ms. No se genera el modo comprimido 12:8. La conversión de frecuencia no usa un filtro de remuestreo de alta calidad.

La comparación independiente usa dos WAV mono PCM16 de 32 kHz: segmento 0, `[0, 1, -1, 32767, -32768]` repetido ocho veces; segmento 1, `[1000, -1000]` repetido 25 veces. Con la rampa predeterminada, AllTool y Studio producen 12288 bytes idénticos:

`a42e77865c4f61f5412006b34b17b52e34f6f48455f10502449e13d358332d4f`

La muestra comprueba la cabecera, el índice, el relleno y el comienzo de la rampa; no constituye una prueba de reproducción física ni de todos los casos de remuestreo. La suite también comprueba muestras sin rampa, índices dispersos y entradas inválidas.

### Video

La conversión usa el decodificador del navegador o Electron y genera JPEG consecutivos en un ICL. No utiliza FFmpeg en la aplicación ni extrae audio. Los límites del editor son 2000 fotogramas, 1–60 FPS, 2073600 píxeles por fotograma, hasta 1920 píxeles por lado y 64 MB de JPEG. La capacidad y velocidad del panel pueden ser menores.

La prueba del renderizador convirtió un WebM sintético de un segundo, 64×48, a cuatro fotogramas. Se verificó el CRC del ICL y la cancelación. El control se codifica e importa; el lienzo aún muestra su marcador, sin reproducir el video. Falta validar codecs de entrada adicionales y reproducción por firmware.

### Metadatos originales

Corrección respecto a las notas iniciales: **DWprj.hmi es un INI**. Los documentos MS-NRBF están en `DWprj.tft` y `TFT/*.tft`. El lector limita tamaños, profundidad y número de registros, no carga assemblies y no ejecuta BinaryFormatter. La carga opcional admite hasta 32 MB por archivo y 64 MB en conjunto.

Se enlazan rectángulos por página, tipo táctil/visual, posición y VP, solo cuando hay un candidato único. Se recuperan nombres, bloqueo, GUID y los tamaños que no alteren la codificación. Se compara de nuevo la compilación completa antes y después. Nueve muestras reales recuperan metadatos; el proyecto Muestra A más antiguo tiene documentos TFT sin controles editables. Las diez mantienen 13/14/22 idénticos.

## Etapa 11: fuentes grises y cámara FSK

### ASCII gris de fontbit4

El generador de Fuentes añade la variante ASCII de `fontbit4.exe`, a 4 u 8 bits por píxel, con tamaño fijo elegido por el usuario. Incluye `!` a `~`, espacio y saltos; no incluye Ñ ni otros caracteres fuera de ASCII. Unicode mantiene su generador anterior. El lector y la vista previa admiten los índices ASCII de 256 entradas y los glifos de 8 bits. También reconocen una fuente gris BIN importada por su cabecera.

La referencia ejecuta **el código x86 original en un emulador**, sin abrir ventanas ni cargar sus DLL. Se sustituye el dibujo tipográfico por un raster conocido, y las API Qt por operaciones de memoria. Se ejecutan las rutinas originales de índices, empaquetado, cabecera y CRC. Por tanto, esta comprobación no afirma que Canvas y Qt dibujen Arial con los mismos píxeles.

Las salidas de referencia de esa comprobación quedaron fijadas como SHA-256 en las pruebas.

Fuente: EXE local SHA-256 `f869cb62448ba535b1701d727727cc7e35621817feb1aa8ca1848ba71ca2817d`. Raster de 6×4: píxel `(x,y)` del código `c` = `((c+x+3y)&15)*17`.

| Variante | Tamaño | SHA-256 del archivo original emulado, idéntico a Studio |
|---|---:|---|
| 4 bits | 2664 | `4ff4d1c6c3561250751ddf50b05223584b136889f6e8bfed43e485397d59f1ff` |
| 8 bits | 3792 | `00ccb81923848887c4899625559a0ad66528f41a94cc17ad8d02c3d77ccc5116` |

La generación evita que un glifo cruce un banco de 16 MB. El paquete comprueba ese límite y el reasignador busca un destino que lo conserve. Se mantiene la lectura de las fuentes Unicode anteriores, incluida su disposición continua cuando el ancho es impar. Las otras codificaciones de fontbit4 y el uso por Texto desplazado siguen pendientes; esto no genera GTF ni UIC.

### Asistente FSK y perfiles

**Herramientas → Preparar cámara FSK** crea una ventana JPEG inversa, un botón visible en el fondo y los comandos del 22. Usa la página actual si está vacía; en otro caso añade una página para enlazar desde la navegación. Al presionar activa el bus; al soltar copia la configuración temporal de cámara. Reserva el búfer de imagen en bloques de 4 KB y comprueba las VP de controles e inicializaciones que puede interpretar. No configura por serie ni cambia firmware.

Se sigue la vía FSK por control **0x5A08** y GUI **V49** descrita en la [guía oficial del bus FSK](https://ecdn6.globalso.com/upload/p/1355/source/2024-11/FSK%C2%A0Bus%C2%A0Camera%C2%A0Development%C2%A0Guide1.pdf) y el [procedimiento de la serie 26W](https://ecdn6.globalso.com/upload/p/1355/source/2024-11/The-Development-Process-of-DWIN-26WSeries-Model-FSK-Bus-Camera-Screen1.pdf). Se conserva el control anterior 0x31 como función distinta. Se usa la orden temporal 0x51, sin cambiar de forma persistente el ID de la cámara. Un OS de fábrica que controle la cámara puede interferir y debe revisarse en la prueba física.

El perfil `DMG10600T070_26W` declara 1024×600 y 32 MB para TC/TR, según la [ficha oficial revisada](https://ecdn6.globalso.com/upload/p/1355/source/2024-11/Datasheet-DMG10600T070_26W.zip). Tiene soporte documentado de bus FSK, video y audio; no verificación física. Las capacidades omitidas de otros perfiles se tratan como desconocidas. La [publicación oficial sobre video digital](https://www.dwin-global.com/news/upgrade-of-dgus-full-support-for-digital-video-playback/) identifica GUI V50 y excluye la serie F; no se deduce soporte universal por compartir resolución o chip.

Prueba del ejemplo con VP de imagen 4000, comandos en 2000/2010, cámara 0 e interfaz 2: el 22 contiene `5A 04 10 00` para el bus y, con espejo, `80 20 00 02 51 80 02 80 01 E0 00 00` para la cámara. El búfer 640×480 reserva 40 KB. El paquete avisa si el CFG no carga el 22. El lienzo muestra un marcador JPEG, sin emular el video de la cámara.

**Recursos → Importar recursos** permite incluir fuentes, UIC, GTF y audio existentes sin cambiar sus bytes. UIC se valida en módulos de 32 KB, por separado de los sectores NOR. Se corrigió la reasignación de GTF: `gtfId` es el archivo; `fontId` es un juego interno y no se mueve. El `fontId` de Roll Char es un módulo UIC y tampoco se trata como fuente NOR.

## Pendientes para cerrar el hito

1. **Roll Char/UIC.** Generar varias referencias controladas con `Font_UIC.exe`, cambiando un único parámetro cada vez: código, posición, altura de fuente y módulo. `Keyboard_UIC.exe` genera otro tipo de recurso; su muestra no demuestra el formato del rodillo. Aún no hay generador UIC en Studio.
2. **GTF y fuentes especiales restantes.** El generador GTF sigue pendiente. ASCII fontbit4 4/8 bits está implementado; faltan otras codificaciones y la comprobación del texto desplazado. No reutilizar DGUS_2 suponiendo que sea GTF.
3. **Cámara y video por perfil.** Hay perfil FSK documentado y asistente de la vía V49, además de la codificación y conservación anteriores. Falta evidencia física de reproducción y ampliar las fichas verificadas para otras variantes.
4. **Pantalla real.** Completar el protocolo de [PRUEBAS_HARDWARE.md](PRUEBAS_HARDWARE.md), sobre todo tamaño y posición de textos, idiomas y multimedia. Las pruebas de archivos no certifican modelos futuros ni todas las variantes comerciales.

Se obtuvo una muestra sintética de `Keyboard_UIC.exe`, 8268 bytes, SHA-256 `2a0089e694cc5e0d1865f4ca7978e03a2e58dbb37d6bba46b23c716594d78229`. Contiene un registro JPEG de 480×272 desde el desplazamiento 360 y un rectángulo de 8 bytes desde 352. El resto de su cabecera no está especificado. Estos datos son observaciones de esa muestra y no una especificación UIC general.

Las muestras sintéticas y las capturas de esta sesión quedan temporalmente en `%TEMP%/dgus-hito6-20261118`; no son una dependencia de la aplicación. Las herramientas nativas usadas para investigar pueden guardar parámetros en su propia carpeta. Los proyectos del usuario en Documentos/DWIN se mantienen en solo lectura.

Investigación UIC adicional: en el EXE local Font_UIC, la rutina de generación situada en 0x004918E0 inicializa 0x900 bytes y escribe versión 2; la muestra de Keyboard_UIC es versión 1. No se ha reconstruido su tabla de glifos ni validado un generador de rodillo. La automatización nativa disponible falló al inicializar sus archivos de entorno, por lo que esta etapa usó análisis estático y emulación de las rutinas de fuentes. Ese error no justifica dar por compatible un UIC inferido. `GTFTool.exe`, citado por la guía, no se encontró en la distribución local revisada.

## Fuentes

- [Guía oficial T5L DGUS II V2.921](https://ecdn6.globalso.com/upload/p/1355/source/2026-03/T5L_DGUSII-Application-Development-Guide-V2.921.pdf): configuración de red, recursos y controles Roll Char/GTF.
- Ejecutables y bibliotecas de la distribución V7.651 local: `DwinTerminal.dll`, `DGUS_V7.651.exe`, `AllTool.exe`, `Keyboard_UIC.exe`, `Font_UIC.exe`, `Excel2ICL.dll` y `Movie2ICL.exe`.
- [Microsoft MS-NRBF](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-nrbf/ca3ad2bc-777b-413a-a72a-9ba6ced76bc3): registros de serialización binaria .NET.
- [Instalación oficial de SheetJS](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/): dependencia fijada en 0.20.3 desde su CDN oficial, cargada bajo demanda para XLS/XLSX.
