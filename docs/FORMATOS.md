# Formatos binarios de DGUS II (T5L)

Especificación reunida por interoperabilidad, a partir de la guía oficial DGUS II y del análisis de los archivos que genera DGUS V7.651; cada formato se comprobó contra proyectos reales y contra la salida de las herramientas originales. Los enteros de los archivos de pantalla son **big-endian**, salvo las excepciones indicadas (PCM, NRBF, ZIP). Las coordenadas son píxeles de pantalla.

## 13TouchFile.bin (controles táctiles)

Secuencia de bloques, sin cabecera. El archivo termina con `FF FF`.

- Las páginas se recorren en el orden de la lista de páginas.
- Dentro de cada página, los controles se escriben **del último al primero** (el último dibujado tiene prioridad).
- Tamaño del bloque según el control: 16, 32, 48 o 64 bytes.

### Primeros 16 bytes (comunes, `InputBase.GetByte`)

| Byte | Contenido |
|---|---|
| 0 | Página (bits 9-8) · si hay sonido IVR: `(pág & 3) + (IVR << 2)` |
| 1 | Página (byte bajo) |
| 2-3 | X1 · con tecla física: `FF`, `código-1` |
| 4-5 | Y1 · con tecla física: `00 00` |
| 6-7 | X2 (= X + ancho) · con tecla física: `FF`, `código` |
| 8-9 | Y2 (= Y + alto) · con tecla física: índice en `coords_13.json` |
| 10-11 | Página a la que salta (`FF 00` = ninguna) |
| 12-13 | Página del efecto de botón (`FF 00` = ninguna) |
| 14-15 | Código táctil `FE xx` (sin efecto de presión) o `FD xx` (con efecto) |

Códigos `xx`: 00 entrada numérica · 01 menú emergente · 02 ajuste incremental · 03 arrastre · 04 RTC · 05 valor de retorno · 06 texto ASCII/GBK · 07 parámetros · 08 copia al presionar/soltar · 09 giro · 0A deslizamiento · 0B páginas deslizantes · 0C arrastrar icono · 0D botón de bit. El toque básico (solo cambio de página) es un bloque de 16 bytes con código `FF 00`.

El detalle de cada bloque está en `src/core/controls/touch.ts`; cada función `encode` reproduce el `GetByte()` original con los mismos desplazamientos.

## 14ShowFile.bin (controles de visualización)

Modo normal (por defecto en DGUS 7.6, `Project_Custom = 2`):

```
0x0000  Cabecera de 16 bytes   14 44 47 55 53 5F 32 10  PP PP  00 00 00 00 00 00
                                "\x14DGUS_2\x10"         página máxima
0x0010  Índice: 4092 entradas de 4 bytes, una por página (0…4091)
        [n, 00, off_hi, off_lo]   n = número de controles de la página
        off empieza en 0x4000 y aumenta n×32 por página
0x4000  Bloques de 32 bytes, página por página (solo páginas existentes, de la 0 a la máxima)
fin     32 bytes FF
```

`Func02` y `Func03` de `DWINDLL.dll` generan la cabecera y las entradas del índice; se verificaron llamando a la DLL (ver `build.test.ts`).

- Máximo 255 controles de visualización por página.
- Dentro de cada página, los controles se escriben del último al primero.

**Modo cifrado** (`Project_Custom = 0`): el mismo contenido, con XOR por una tabla de 256 bytes y luego por `(i >> 16) + ((i >> 8) & 0xFF) + (i & 0xFF)`. Implementado en `xorObfuscate`.

**Modo de bloque fijo** (`Project_Custom = 1`): sin índice. Cada página ocupa `varsPerPage / 64 × 2048` bytes y la primera entrada de la página 0 es la cabecera `14 44 47 55 53 5F 32 VV PP PP`.

### Bloque de 32 bytes

| Byte | Contenido |
|---|---|
| 0-1 | `5A tt` (o `5F tt` si se muestra sobre menú emergente) |
| 2-3 | Puntero de descripción SP (`FFFF` = ninguno) |
| 4-5 | Longitud en palabras de la descripción |
| 6… | Específico de cada control |

Tipos `tt`: 00 icono de variable / multilenguaje · 01 icono animado · 02 deslizante · 03 número con iconos · 04 animación de imágenes · 05 icono giratorio · 06 icono por bit · 07 desplazamiento de imagen · 08 imagen variable · 09 iconos en lote · 10 variable numérica · 11 texto · 12 RTC / reloj analógico · 13 HEX · 14 texto en movimiento · 15 ventana de datos · 16 texto DGUS II · 17 rodillo · 18 GTF · 20 curva · 21 gráficos básicos · 22 tabla · 23 barra de progreso / industrial · 24 desplazamiento de zona · 25 QR · 26 brillo de zona · 30 envío de datos · 31 cámara / video.

Tres controles usan `SetData` de `DWINDLL.dll` para empaquetar su bloque (ventana de datos = 21, desplazamiento de zona = 36, brillo de zona = 38). Su disposición se obtuvo alimentando la DLL con valores conocidos; está documentada en `display.ts`. La ventana de datos calcula el alto de fuente como `max(alto, 2 × ancho)`.

## 22_Config.bin (valores iniciales)

Imagen de la memoria de variables: 131 076 bytes (`0x20004`). El valor de la dirección VP `v` está en el byte `v × 2`.

- Solo se escriben valores iniciales para VP > `0x100`.
- Códigos de tipo: 3 int16 · 30 uint16 · 4 int32 · 42 uint32 · 41 int64 · 43 float32 · 44 float64 · 1 byte alto · 2 byte bajo · 5 texto.
- El texto UNICODE se escribe en UTF-16 big-endian. El texto en movimiento empieza 3 palabras después de su VP.
- Los datos origen de «copia al presionar/soltar» (`Key_DO_Ret`) se escriben como bytes hexadecimales en su VP de origen.

## Archivos de proyecto de DGUS 7.6

- `DWprj.hmi`: manifiesto INI. `[IMG]` relaciona el número de página con el nombre del documento.
- `DWprj.tft` y `TFT/*.tft`: documentos serializados MS-NRBF de .NET, en ocasiones con el XOR de DGUS. Los nombres, GUID y rectángulos de edición se recuperan con un lector de datos acotado (`nrbf.ts`), sin instanciar tipos .NET. El importador solo aplica enlaces únicos y tamaños que no cambien 13/14/22. Un documento desconocido no impide importar los binarios.
- `HMIConfig.bin`: bloques de 16 bytes por rectángulo (página, área, `Toimage`, `DHXG`, `CodeCMD`).
- `DWIN_SET/`: imágenes de fondo, `13*.bin`, `14*.bin`, `22*.bin`, fuentes `.HZK/.DZK` y bibliotecas `.ICL`.

## Bibliotecas .ICL (formato "DGUS_3")

Verificado con 21 archivos `.icl` reales: se leen y se vuelven a generar idénticos byte a byte.

```
0x00  "DGUS_3"
0x06  CRC16 Modbus de los bytes 8…fin (byte bajo primero)
0x08  tamaño del archivo − 8 (u32)
0x0C  04
0x0D  último ID de imagen (u16)
0x0F  00
0x10  índice: (último ID + 1) × u32 con el desplazamiento de cada imagen (0 = no existe)
…     registros de imagen, uno tras otro
```

Registro de imagen:

| Bytes | Contenido |
|---|---|
| 0-1 | ancho |
| 2-3 | alto |
| 4-5 | largo de la cabecera JPEG (hasta el inicio de los datos del escaneo) |
| 6-9 | largo de los datos (escaneo + `FF D9` + 8 ceros + relleno a 4) |
| 10… | JPEG baseline 4:2:0 (Y 2×2, Cb 1×1, Cr 1×1) |

Para que los datos del escaneo empiecen alineados a 4 bytes, se insertan bytes `00` al final del segmento SOS y se aumenta su longitud (por eso los SOS miden 15 en lugar de 12). Si una imagen cruzaría un límite de 16 MB en la flash (`ID del ICL × 256 KB + desplazamiento`), se rellena con ceros hasta ese límite.

Los fondos de página van en el ICL número 32 (configurable): la imagen N es el fondo de la página N.

## Importación de proyectos de DGUS 7.6

T5L Studio importa la carpeta `DWIN_SET` (o la del proyecto que la contiene):

- `13*.bin` y `14*.bin` se decodifican control por control (`controls/decoders.ts`). Los tipos sin decodificador se conservan como «bloque original» y se exportan sin cambios.
- `22*.bin` se conserva como base y se leen los valores iniciales de variables numéricas, texto e iconos.
- Los `.icl` se guardan en el proyecto. El de fondos se usa como fondo de cada página.
- Fuentes (`.HZK`, `.DZK`) y otros archivos se copian tal cual al exportar.
- La resolución se deduce de los fondos y de las coordenadas (DGUS recorta las áreas de teclado al tamaño de pantalla, así que una resolución equivocada cambiaría bytes). Se puede corregir en «Proyecto».

Prueba con proyectos reales: `DGUS_SAMPLES="C:/ruta/proyectos" npm test` importa cada `DWIN_SET` encontrado y comprueba que 13, 14 y todos los ICL se regeneran idénticos.

## Protocolo serie DGUS II

Trama: `H1 H2 LEN CMD DATOS… [CRC]`. La cabecera es `5A A5` por defecto; `LEN` cuenta CMD + datos (+2 si hay CRC). El CRC es Modbus sobre CMD + datos, byte bajo primero (el mismo de los ICL).

| Comando | Envío | Respuesta |
|---|---|---|
| Escribir VP | `82 VPH VPL d0 d1 …` | `82 4F 4B` (OK) |
| Leer VP | `83 VPH VPL N` | `83 VPH VPL N d0 d1 …` |
| Subida automática | — | la pantalla envía `83 VPH VPL N …` cuando el usuario cambia un valor |
| Descarga | `8F 55 NN` | cualquier respuesta; luego el PC envía hasta 256 KB del sector NN |

Direcciones del sistema usadas: `0x0004` reinicio (`55 AA 5A A5`), `0x0014` página actual, `0x0084` cambio de página (`5A 01 PP PP`).

Descarga (tomada de `frmTextA.Downfile` de DGUS V7.651): cada archivo se parte en sectores de 256 KB que empiezan en el sector de su número (13TouchFile.bin → 13, 32.icl → 32, 33…). Por cada sector: petición `8F 55 NN`, espera de respuesta (8 s como máximo), envío de los bytes del sector (el último puede ser más corto) y pausa de 0,5 s.

## Fuentes

### ASCII 0# (`N_DWIN_ASC.HZK`)

Tomado de `DW_0Font.exe` y verificado reconstruyendo byte a byte un `0_DWIN_ASC.HZK` real (3 082 752 bytes).

- Sin cabecera. Para cada ancho `i` de 4 a 64 px, en orden: 128 caracteres (0x00–0x7F) de `i × 2i` píxeles.
- 1 bit por píxel, bit más significativo a la izquierda, filas de `⌈i/8⌉` bytes.
- Desplazamiento del ancho `i`: suma de `128 × 2k × ⌈k/8⌉` para k = 4…i−1.
- Las variables numéricas, el RTC y el HEX la usan con «Fuente (ID)» = número del archivo y «tamaño» = ancho del carácter (el alto es el doble).

### Unicode en grises `DGUS_2` (Texto DGUS II)

Portado de `UnicodeGrayFont.dll` (sin muestra real para comparar):

```
0x000  "DGUS_2" 00 00 · tamaño total (u32) · 01 · caracteres + 3 (u16) · 01 04 80 00 04 · ancho máx · alto máx · 01 · 233 × 00
0x100  índice: 65 536 × 5 bytes = [ancho útil, F0 | dir>>24, dir>>16, dir>>8, dir]   (dir desde el inicio del archivo)
0x50100 glifos de ancho máx × alto máx a 4 bits por píxel (dos píxeles por byte), alineados a la izquierda
```

Los códigos 10, 13 y 32 tienen entradas especiales (salto de línea y espacio de ancho máx/4).

### Mapa de bits de tamaño fijo

Según el manual de DGUS II (no verificado con un archivo real): `índice × bytes por carácter`, donde el índice es el código (8 bits o Unicode) o `(alto−0xA1) × 94 + (bajo−0xA1)` en GB2312.

## Paquete integrado y CFG lógico (etapa 3)

`src/core/package.ts` comprueba nombres, números de 13/14/22, ocupación por sectores NOR de 256 KB y capacidad declarada. Un archivo de más de un sector reserva también los siguientes. La ausencia de una capacidad física produce un aviso; el asignador de fuentes usa entonces un límite conservador de 16 MB, que no constituye una detección del dispositivo.

El asignador automático utiliza inicios de fuente entre 0 y 47, evita los sectores 12/13/14/22 y todos los recursos incluidos. Genera primero ASCII 0# (12 sectores) y después bibliotecas de matriz o DGUS_2. Esta elección conservadora pertenece al editor; no define los límites universales de las pantallas DWIN.

El CFG básico tiene 128 bytes: cabecera ASCII `T5LC1`, byte 5 con carga de 22 y subida táctil habilitadas más orientación en los dos bits bajos, byte 8 con el ID del ICL de fondos, byte 9 = `28`, divisor de baudios en 10–11 = `001C` (115200), brillo en 12 = 100. Los demás bytes quedan a cero. En particular, no se habilita `5AA5` en 0x10–0x11 ni `5A` en 0x20, por lo que no se sustituyen los parámetros LCD/TP de fábrica. Solo se crea si se ha elegido la opción básica y no hay CFG importado. El existente conserva todos sus bytes.

Referencia: [guía oficial T5L DGUS II](https://ecdn6.globalso.com/upload/p/1355/source/2026-03/T5L_DGUSII-Application-Development-Guide-V2.921.pdf), apartado de CFG, páginas impresas 32–36. Para Texto 0x11, la página 158 asigna Font1 a los modos 0/5 y Font0 al ASCII de los modos mixtos 1–4; la generación automática actual se limita a 0/5. La elección de una resolución no configura por sí sola el controlador LCD ni identifica el modelo comercial.

La importación lee el ID de fondos y la orientación de un único CFG reconocido. Si existe un ICL de fondos compilado, las imágenes sueltas no añaden páginas; se pueden incorporar de forma explícita con «Importar fondos». Una imagen del ICL sin editar conserva sus píxeles y dimensiones, incluidos fondos parciales de teclado.

El navegador empaqueta los mismos bytes en un ZIP sin compresión con nombres UTF-8 y CRC-32, dentro de DWIN_SET/. Ese contenedor se debe extraer antes de usar una SD. No cambia el formato de los archivos de pantalla.

## T5LCFG.CFG

Según la guía DGUS II V2.9 (sección «CFG file») y verificado con los CFG de los proyectos del usuario (salen idénticos si no se cambian). Implementado en `src/core/cfg.ts`.

| Dirección | Contenido |
|---|---|
| 0x00 | `T5LC1` |
| 0x05 | bit 7 CRC · bit 6 música (1) / zumbador (0) · bit 5 cargar 22 · bit 4 subida automática · bit 3 sonido táctil · bit 2 reposo de la retroiluminación · bits 1–0 orientación |
| 0x07 | WAE de música |
| 0x08 | ICL de fondos |
| 0x0A–0x0B | 3225600 / baudios (máximo 0x03FF) |
| 0x0C / 0x0D | brillo / brillo en reposo (0–0x64) |
| 0x0E–0x0F | tiempo hasta el reposo (×10 ms) |
| 0x10–0x11 | `5A A5` activa los tiempos LCD de 0x12–0x1F |
| 0x20 | `5A` activa 0x21 (tipo y calibración del táctil) y 0x22 (sensibilidad) |
| 0x2B / 0x2D | volumen del zumbador / duración del pitido (×10 ms) |
| 0x2E–0x2F | `5A` y el ID del archivo de valores iniciales (en lugar de 22) |
| 0x40–0x4A | `5A A5`, longitud y nombre de la carpeta de la SD |

## 120.lib (perilla física)

Portado de `RotaryKnob.GetRotaryKnobData` y `TDocumentSpace`:
- **Cabecera de 96 bytes:** `5A A5 55 AA`, tipo (2 para el primer modelo y 1 para el resto), RTC, puertos `(puerto<<4)|pin` de reloj, dato y pulsador, y número de páginas (u16).
- **Por página, 8 bytes:** página (u16), número de perillas, 00 y desplazamiento (u32).
- **Por perilla, 32 bytes:**
  - 8 bytes de efecto: VP, o SP + tipo + iconos o color.
  - La acción al pulsar o al girar: VP, banderas, tipo de dato, pasos, máximo y mínimo.

## Otros archivos de DWIN_SET (guía, sección 3.3)

- **`.LIB`:** memoria NOR interna (IDs 0–79, 2 K palabras cada uno).
- **`.UIC`:** módulos de 32 KB.
- **Programas `T5L*.BIN` y `DWINOS*.BIN`, y `T5LCFG.CFG`:** solo se cargan por SD; la descarga serie por sectores (`8F`) solo sirve para fuentes, ICL, WAE y 13/14/22.
- **`22_Config.bin`:** la pantalla carga las direcciones 0x2000–0xFFFF. Las herramientas Modbus (`PLC_Config`) y de red (`22.exe`) amplían o modifican este archivo; T5L Studio conserva esos datos al importar.

## PLC / Modbus en 22_Config.bin (TOOL/modbus/PLC_Config)

Portado de `MainWindowViewModel.SaveModbus_Executed` (`src/core/modbus.ts`). Todo en big-endian.

- **Relleno:** el 22 se rellena con ceros (o se recorta) hasta **0x30000** y después va un bloque de 4 KB.
- **Cabecera:** en `0x30000 + (COM − 2) × 32` (COM2, COM4 o COM5). Contiene el modo, `00` y los baudios (u32). El modo es el índice del selector; «Modbus esclavo» se escribe como 16.
- **Modbus maestro (1):**
  - La cabecera sigue con: número de lecturas, escrituras y comandos de entrada (u16 cada uno), separación en ms (u16) y la palabra donde empiezan los comandos (u32, `(0x30000 + 4096) / 2`).
  - Los comandos van tras el bloque. Los de lectura y escritura ocupan 8 bytes: esclavo, función, registro (u16), longitud, VP (u16) y espera.
  - Los de entrada ocupan 16 bytes: los mismos 8 más una copia en la que la función se cambia por un tipo (05 y 0F → 1; 06 y 10 → 3; resto → 5).
  - Los de entrada se agrupan por página.
- **Tabla de páginas en 0x20000** (pisa los 4 últimos bytes del 22):
  - 8 ceros.
  - Por página hasta la mayor: desplazamiento (u32) y palabras (u32), o 8 ceros si la página no tiene comandos.
  - Por comando de entrada, 10 palabras: `00 06 · VP vigilado · COM · 0/1 · id de comando · 00 01`, dos veces.
- **PLC de marca (4–9):** la cabecera sigue con máximo de palabras, separación, respuesta y reintentos. En `bloque + 3328` van 4 pares (VP, cantidad), que son X, Y, M y D en Mitsubishi.
- **Modbus esclavo (10):** en `bloque + 3376` van el VP y la cantidad de solo lectura, y el VP y la cantidad de lectura y escritura.
- **Ninguno, 82/83 y reservado:** sin bloque; se escriben un cero de más y los 6 bytes de la cabecera al final.

Al importar, la configuración se vuelve editable solo si al regenerarla el 22 sale idéntico; si no, se conserva tal cual.

## Red WiFi / DWIN Cloud en el 22

Implementado en `src/core/network.ts`, portado de `Frm_NetConfig` de V7.651 y contrastado con su método original de guardado. Las posiciones de esta tabla son VP; el byte está en `VP × 2`.

| VP | Longitud en bytes | Campo |
|---|---|---|
| 0400 | 2 | `5A A5` habilita la interfaz |
| 0411 / 0413 / 0414 | 4 / 2 / 4 | Fabricante, clase y número de dispositivo |
| 0416 | 52 | Descripción de 8 bits |
| 0480 | 20 | Información de comunicación de 8 bits |
| 048A / 048E | 8 / 4 | MAC y configuración de comunicación |
| 0498 / 04A5 | 8 / 6 | Configuración y estado de red |
| 04B0 / 04C0 | 31 / 31 | SSID y SN/clave de 8 bits |

Al habilitar por primera vez se aplican los valores constantes que escribe el editor original en los bytes 0820, 0860, 0870 y 0894. Los parches posteriores solo escriben los campos editados. Los textos editados se rellenan con ceros dentro de su longitud; no se toca el byte reservado que sigue a los de 31 bytes. El botón de configuración escribe `5A00` en VP `0498`. Estas direcciones necesitan el firmware de red que las interpreta.

## Audio WAE PCM16 (modo 03)

Verificado con una biblioteca sintética de dos segmentos generada por AllTool; detalle y SHA-256 en [HITO6.md](HITO6.md).

| Desplazamiento | Contenido |
|---|---|
| 0–5 | ASCII `DGUS_2` |
| 6–7 | CRC16 Modbus de los bytes 8…fin, byte bajo primero |
| 8–11 | Tamaño total menos 8, u32 big-endian |
| 12 | `03`, PCM16 |
| 13–14 | Número de entradas, último ID + 1, u16 big-endian |
| 15 | `00` |
| 16… | Una entrada de 8 bytes por ID: desplazamiento u32 y longitud u32, big-endian |
| 4096… | Segmentos PCM16 mono 32 kHz, muestras **little-endian** |

La cabecera y cada segmento se alinean a 4096 bytes. La longitud indexada incluye dos bytes cero tras las muestras, sin contar el resto del relleno. Un ID ausente tiene una entrada cero. Studio admite IDs 0–255 y hasta 64 MB por biblioteca. La rampa opcional de 5 ms acumula la ganancia en float32, como la referencia AllTool, y convierte a entero con empate al par. No se genera el modo comprimido 12:8.

## Idiomas y video generados

Usan el formato ICL anterior, sin otra cabecera. En idiomas, el ID es `fila × númeroDeIdiomas + idioma`; un control de icono estándar por fila usa el VP común, valores `0…n−1` y el intervalo de imágenes de su fila. Se conserva el control anterior en los metadatos del `.dgusx` para restaurarlo. El ZIP por idioma cambia únicamente el valor inicial de ese VP en el 22 de cada copia.

En video, los fotogramas tienen IDs consecutivos desde 0 y el control 0x31 referencia el ICL y sus FPS. El audio WAE se asigna aparte. La conversión válida del contenedor no demuestra que un firmware concreto reproduzca ese control.

## ASCII gris fontbit4 (etapa 11)

Variante DGUS_2 distinta del generador UnicodeGrayFont anterior. Cabecera de 256 bytes: `DGUS_2`, CRC16 Modbus con byte bajo primero en 6–7, tamaño menos 8 en 8–11, `01` en 12 y número de glifos dibujados (94) en 13–14. Bytes 15–22: `00 00 80 00 bits ancho alto 01`, donde bits es 4 u 8.

El índice empieza en 256 y tiene 256 entradas de cinco bytes. Cada entrada lleva ancho útil y un puntero de 28 bits, con nibble alto F para los glifos. Sus datos empiezan en 1536. LF, CR y espacio usan tipos 2, 1 y 3, sin datos de píxeles; el espacio avanza ancho/2. Se dibujan los códigos 33–126. Los glifos de 4 bits se empaquetan por filas (nibble alto primero), con ceil(ancho/2) bytes por fila; los de 8 bits usan un byte por píxel. Cada glifo se rellena a número par de bytes y se desplaza al siguiente banco si cruzaría 16 MB físicos.

La función `grayGlyph` reconoce el índice ASCII y los 8 bits, y conserva la lectura del generador Unicode anterior, que empaqueta sus píxeles de forma continua. El formato se verifica con el empaquetador x86 original emulado y raster sintético; véase [HITO6.md](HITO6.md).

## FSK por JPEG (GUI V49)

No es el control de cámara anterior 0x31. Usa Imagen variable JPEG 0x5A08, modo 1 y orden inverso en el bit 7 del byte 19. El nibble bajo de ese byte es la página alta de VP. Se corrigieron los nombres de estas opciones en la interfaz sin cambiar su codificador.

El asistente limita su búfer a la página VP de 16 bits: dirección par desde 2000, reserva ceil(ancho×alto/8/4096)×4096 bytes, máximo 64 KB. En el dispositivo FSK se escribe la dirección de **doble palabra**, VP/2. Los comandos se conservan en VP cargables desde el 22 y se copian al sistema mediante Key_DO_Ret: dos palabras a 0100 al presionar y seis a la interfaz de cámara al soltar. La orden temporal 51 incluye espejo/IR y resolución múltiplo de 4. El esquema completo de memoria y el ejemplo se documentan en [HITO6.md](HITO6.md).

UIC mantiene su espacio lógico por módulos de 32 KB (ID de 16 bits). La validación detecta solapes entre UIC, sin asumir que su ID sea un sector NOR de 256 KB. Los archivos GTF se conservan como recursos; su ID de archivo y el juego interno del control son referencias distintas.
