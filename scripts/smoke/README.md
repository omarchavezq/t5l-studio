# Guiones para la prueba de humo

Se ejecutan dentro de la app real (Electron, desde `dist`) con:

```
npm run build
DGUS_SMOKE=1 DGUS_SMOKE_SCRIPT=scripts/smoke/simulador.js npx electron .
```

Cada guion es una expresión JS (puede devolver una promesa); su resultado se imprime como `SMOKE_SCRIPT {...}`. La app arranca en la pantalla de bienvenida, así que los guiones abren primero el ejemplo.

- `bienvenida.js`: abre el ejemplo, vuelve al inicio y lo reabre desde «Recientes».
- `simulador.js`: botones + y −, entrada numérica con el diálogo propio y textos sin fuente.
- `fuentes.js`: genera la fuente 0# en el worker y cuenta los pasos de progreso.
