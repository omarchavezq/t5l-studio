# Prueba en pantalla real (Hito 2)

Esta guía comprueba que lo que genera T5L Studio funciona en una pantalla DWIN T5L igual que en el simulador. Use el proyecto de referencia `ejemplos/prueba-t5l.dgusx` (480×854 vertical, como sus proyectos Muestra A y TECLADO). Para regenerarlo:

```bash
npx vite-node scripts/make-test-project.ts
```

Tiempo estimado: 30–45 minutos. Anote los resultados en la tabla del final.

## Qué necesita

- La pantalla DWIN y su fuente de alimentación.
- Una tarjeta microSD (FAT32, preferiblemente de 8–32 GB).
- Para las pruebas serie (opcional): un adaptador USB-TTL a 3,3 V o 5 V según su placa, conectado al puerto de usuario de la pantalla (UART2: TX, RX y GND).
- **Una copia del DWIN_SET que tiene ahora la pantalla** (por ejemplo, la de Muestra C o Muestra B), para devolverla a su estado al terminar.

## 1. Preparar el paquete

1. Abra T5L Studio → **Abrir** → `ejemplos/prueba-t5l.dgusx`.
2. Pulse **Simular** y recorra el proyecto. Así sabrá cómo debe verse en la pantalla. Si puede, saque una captura de la página 0.
3. **Proyecto → ICL de fondos**: ponga el mismo número que usa la configuración de su pantalla. El paquete no incluye `T5LCFG.CFG`, así que la pantalla conserva la suya.
   - Si la pantalla tiene cargado **Muestra B**: **32** (el valor por defecto).
   - Si tiene **Muestra C** o **Muestra D**: **23**.
   - Si no lo sabe, deje 32. Si en la pantalla no aparecen los fondos, cambie a 23 y repita desde el paso 4.
4. Pulse **Generar para pantalla** (F5). Debe terminar sin errores y crear una carpeta `DWIN_SET` con 7 archivos:

   | Archivo | Qué es |
   |---|---|
   | `13TouchFile.bin`, `14ShowFile.bin`, `22_Config.bin` | Controles y valores iniciales |
   | `32.icl` (o `23.icl`) | Fondos de las 3 páginas |
   | `0_Studio_ascii0.HZK` | Fuente ASCII 0# para números y reloj |
   | `15_Studio_fixed.DZK` | Fuente del texto ASCII (control Texto) |
   | `16_Studio_gray.DZK` | Fuente gris Unicode (Texto DGUS II) |

   Los avisos «capacidad de memoria sin declarar» y «se conserva la configuración» son normales.

## 2. Cargar por SD

1. Copie la carpeta `DWIN_SET` a la raíz de la microSD. No debe haber otra carpeta `DWIN_SET` en la tarjeta.
2. Con la pantalla apagada, inserte la tarjeta y enciéndala. Espere a que termine la carga (pantalla azul con el progreso).
3. Apague, retire la tarjeta y vuelva a encender.

> Esto sustituye la fuente 0 y los fondos de la pantalla. Al terminar, cargue de nuevo su DWIN_SET original.

## 3. Comprobaciones en la pantalla

Compare cada punto con el simulador. «Posición y tamaño» significa que el texto queda dentro de su recuadro del fondo, sin desbordarse ni desplazarse.

| # | Prueba | Resultado esperado |
|---|---|---|
| 1 | Número (VP 5000) | Muestra **23.5 C** en amarillo, dentro de su recuadro |
| 2 | Texto ASCII (VP 5100) | **Hola T5L Studio 123** en blanco, dentro del recuadro |
| 3 | Texto DGUS II (VP 5120) | **Presión 25°C ñ á** con bordes suaves, en cian; se ven la ñ, las tildes y el ° |
| 4 | Reloj | Fecha y hora con formato `AA-MM-DD HH:MM:SS`, avanzando cada segundo |
| 5 | Barra y +/− | Al empezar, la barra está al 40 % y el número dice 40; **+** y **−** cambian de 10 en 10, entre 0 y 100 |
| 6 | Valor de retorno | **VALOR 1** pone 1 en el número de la derecha; **VALOR 2** pone 2 |
| 7 | Bit 0 | Cada toque alterna el número entre 0 y 1 |
| 8 | Entrada numérica | Al tocar el recuadro aparece el teclado en la parte inferior; con **OK** el valor queda en el recuadro, **ESC** cancela y **BORRAR** borra un dígito |
| 9 | Ir a página 2 | Muestra «PAGINA 2» con el mismo 23.5 C en grande; **VOLVER** regresa a la página 0 |
| 10 | Fondos | Los tres fondos se ven completos y sin colores raros |

Los códigos de las teclas son los mismos de su proyecto Muestra E, que ya funciona: `00F0` (ESC), `00F1` (OK) y `00F2` (BORRAR).

## 4. Pruebas por puerto serie (opcional)

En T5L Studio, pulse **Puerto serie**:
1. Elija **PC ↔ pantalla** y 115200 baudios. Marque **CRC** solo si su configuración lo tiene activo.
2. **Conectar** y elija el puerto del adaptador.

| # | Prueba | Resultado esperado |
|---|---|---|
| S1 | Variables → VP `5000` int16 → leer | Muestra **235** |
| S2 | Escribir `999` en VP `5000` | La pantalla muestra **99.9 C** |
| S3 | Tocar **+** en la pantalla | El Monitor muestra una trama `83` de VP 5003. Requiere la subida automática activa en su CFG; si no aparece, anótelo |
| S4 | Monitor → «Cambiar a la página» 2 | La pantalla pasa a la página 2 |
| S5 | Variables → VP `000F` → leer | Versión del firmware: anótela |
| S6 | Descargar → preparar y descargar (opcional, tarda varios minutos) | Termina sin errores; tras reiniciar, la pantalla sigue igual |

## 5. Anotar y enviar

Copie esta tabla con sus resultados (✅ bien, ❌ mal, ⚠️ diferente) y una foto de la página 0 junto a la captura del simulador:

| Dato | Valor |
|---|---|
| Modelo (etiqueta trasera) | |
| Versión de firmware (S5) | |
| ICL de fondos usado | 32 / 23 |
| Pruebas 1–10 | |
| Pruebas S1–S6 | |
| Diferencias de posición o tamaño de texto | |

Con eso se corrige lo que salga distinto y el perfil de su pantalla pasa a «probado en pantalla» (Hito 3).

## 6. Restaurar

Cargue por SD el `DWIN_SET` original de la pantalla. Así recupera su fuente 0, sus fondos y sus controles.
