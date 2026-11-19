# Hoja de ruta

El plan completo, con la tabla de paridad frente a DGUS V7.651, está en [docs/PLAN.md](docs/PLAN.md). El registro de cada etapa está en [docs/ETAPAS.md](docs/ETAPAS.md).

## Hecho

- **Hitos 1 a 5:** editor, importación y generación byte a byte de 13/14/22 e ICL, simulador, puerto serie y descarga, fuentes, teclados, `T5LCFG.CFG`, perilla giratoria y valores iniciales.
- **Hito 6 (casi completo):** Modbus/PLC, red WiFi / DWIN Cloud, textos multilenguaje con ICL, WAV → WAE, video → ICL, metadatos de DGUS V7.6 y decodificadores de todos los controles.
- **Hito 7 (casi completo):** Electron 45, seguridad, integración continua, bundle más liviano, fuentes en segundo plano, historial de deshacer eficiente y pantalla de bienvenida.

## Siguiente

| Prioridad | Tarea | Qué falta |
|---|---|---|
| 1 | Pruebas en pantallas físicas | Resultados de usuarios con distintos modelos ([guía](docs/PRUEBAS_HARDWARE.md)) |
| 2 | Rodillo de caracteres (UIC) | Archivos de referencia generados con `Font_UIC.exe` |
| 3 | Fuentes GTF | Archivos de referencia de GTF Tool |
| 4 | Instalador firmado y actualizaciones automáticas | Certificado de firma de código |
| 5 | Versión en inglés de la interfaz | — |
| 6 | macOS y Linux | Probar el empaquetado de Electron en esos sistemas |
