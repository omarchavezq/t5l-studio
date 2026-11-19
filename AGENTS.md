# Instrucciones para agentes de IA y colaboradores

Este proyecto se desarrolla en gran parte con agentes de programación. Las reglas valen igual para personas y agentes.

1. **Lea primero** [CLAUDE.md](CLAUDE.md), [docs/PLAN.md](docs/PLAN.md), [docs/CONTINUAR.md](docs/CONTINUAR.md) y [docs/FORMATOS.md](docs/FORMATOS.md).
2. **Idioma:** interfaz, mensajes, documentación y commits en español.
3. **Compatibilidad byte a byte:** toda la lógica binaria va en `src/core/` con pruebas en `src/core/__tests__/`. Un cambio que altere la salida de 13/14/22 o de los ICL necesita una prueba que fije los bytes esperados.
4. **Nada de DWIN en el repositorio:** no añada código, binarios, fuentes, imágenes ni documentos de DWIN, ni proyectos de usuarios. Las pruebas con proyectos reales se ejecutan con `DGUS_SAMPLES` apuntando a una carpeta local.
5. **Formatos nuevos:** documente cada formato en `docs/FORMATOS.md` con su fuente (guía pública, archivos de ejemplo o comparación de salidas). No invente un formato: si falta una referencia, déjelo pendiente y dígalo.
6. **Antes de dar algo por terminado:** `npm run verificar`, la prueba de humo (`scripts/smoke/`) y una entrada en `docs/ETAPAS.md`.
7. **Honestidad en los informes:** indique qué se verificó y qué no (por ejemplo, «sin probar en pantalla»).
