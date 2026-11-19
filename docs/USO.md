# Guía de uso

## Flujo de trabajo

1. **Nuevo** → elija la resolución de la pantalla, o **Importar DGUS** → elija la carpeta de un proyecto hecho con DGUS 7.6 (o su `DWIN_SET`).
2. **Importar fondos**: seleccione `0.jpg`, `1.jpg`, `2_menu.png`… El número inicial del nombre indica la página; si la página no existe, se crea.
3. Arrastre controles desde la caja de herramientas al lienzo (o doble clic). Los controles naranjas son táctiles y los verdes son de visualización.
4. Edite las propiedades a la derecha. Las direcciones VP se asignan solas sin repetirse; el compilador avisa si dos variables se solapan.
5. **Compilar** (`Ctrl+B`) muestra errores y avisos. Haga clic en un mensaje para ir al control.
6. **Generar para pantalla** (`F5`) prepara `13TouchFile.bin`, `14ShowFile.bin`, `22_Config.bin`, los fondos y los recursos incluidos. En proyectos nuevos genera las fuentes que falten para números, RTC, HEX, Texto y Texto DGUS II; puede crear un CFG lógico básico sin alterar los tiempos LCD ni la configuración táctil de fábrica. El panel **Proyecto** permite elegir memoria NOR, tipografía y política de CFG. Los proyectos importados conservan sus recursos y opciones.
7. En Electron, elija la carpeta de salida. Si ya contiene DWIN_SET, la nueva salida queda en una subcarpeta DGUS-…/DWIN_SET para conservar la anterior. En el navegador se descarga un único **DWIN_SET.zip**: extraiga su carpeta DWIN_SET y cópiela a la raíz de la SD. Guarde también el `.dgusx` para conservar las fuentes generadas.

Los solapes de memoria y los errores del paquete bloquean la generación. La capacidad desconocida y los recursos no incluidos quedan señalados; no se supone que todas las pantallas tienen 16 MB. La descarga serie actual envía recursos NOR numerados y **no transmite T5LCFG.CFG**. Use SD para aplicar ese archivo.

En la pestaña **Recursos** puede ver las bibliotecas ICL, añadir archivos `.icl` o crear uno nuevo a partir de imágenes (`0.png`, `1.png`…: el número es el ID del icono). Con un control de icono seleccionado, un clic en un icono lo asigna.

En **Herramientas** puede configurar red y PLC/Modbus, editar traducciones desde `2.xls` / XLSX / CSV y generar su ICL, convertir WAV a WAE PCM16 y video a ICL. Los recursos se guardan en el proyecto y salen con F5. El generador de idiomas permite descargar un paquete por idioma inicial. Consulte [docs/HITO6.md](docs/HITO6.md) para los límites y la evidencia de compatibilidad; Roll Char/UIC, GTF y la validación física de multimedia siguen pendientes.

El generador de **Fuentes** incluye ASCII gris de 4/8 bits (`fontbit4`), además de Unicode. **Preparar cámara FSK** crea la página, el botón visible y sus comandos para el bus GUI V49; requiere hardware FSK y una cámara compatibles. En **Recursos** se pueden incluir fuentes, UIC, GTF y WAE existentes sin cambiar sus bytes. La importación de UIC/GTF no sustituye a sus generadores, que siguen pendientes.

Atajos: `Ctrl+Z/Y` deshacer/rehacer · `Ctrl+C/V/D` copiar/pegar/duplicar · flechas mueven 1 px (`Mayús` 10 px) · `Alt` al arrastrar desactiva la rejilla · `Ctrl+rueda` zoom · `Supr` elimina.
