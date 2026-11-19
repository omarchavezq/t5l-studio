# T5L Studio

Editor moderno para pantallas DWIN T5L que reemplaza a DGUS V7.651, con salida binaria compatible byte a byte.

- **El plan vigente está en `docs/PLAN.md`** (visión, principios, hitos). El avance se registra en `docs/ETAPAS.md`.
- **Antes de empezar, lea `docs/CONTINUAR.md`** (estado, pendientes, arquitectura, trampas) y `docs/FORMATOS.md` (formatos binarios).
- Interfaz, mensajes y documentación en **español**.
- Toda la lógica binaria va en `src/core/` con pruebas en `src/core/__tests__/`.
- Verificar siempre: `npx tsc --noEmit` y `DGUS_SAMPLES="<carpeta-de-proyectos-DGUS>" npm test` (las pruebas de ida y vuelta deben dar archivos idénticos).
- Los proyectos de `<carpeta-de-proyectos-DGUS>` son del usuario: solo lectura, nunca copiarlos al repositorio.
