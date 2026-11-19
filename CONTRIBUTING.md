# Cómo contribuir

Gracias por su interés. Toda ayuda suma, sobre todo **pruebas en pantallas reales**.

## Informar un fallo

Abra un [issue](https://github.com/omarchavezq/t5l-studio/issues/new/choose) con:

- la versión de T5L Studio y si usa la app instalada o el navegador;
- el modelo de pantalla DWIN y su resolución;
- los pasos para reproducirlo, qué esperaba y qué pasó;
- una captura. Si el fallo está en los archivos generados, adjunte el `.dgusx` o un DWIN_SET mínimo (sin datos privados).

## Proponer cambios

1. Haga un fork y cree una rama desde `main`.
2. `npm ci` y luego `npm run dev` para trabajar en el navegador.
3. Siga [AGENTS.md](AGENTS.md): lógica binaria en `src/core/` con pruebas, textos en español y nada de archivos de DWIN.
4. Antes de abrir el pull request ejecute `npm run verificar` (tipos, pruebas, build y auditoría).
5. Describa qué cambió, cómo lo comprobó y qué queda sin verificar.

## Publicar una versión (mantenedores)

1. Suba la versión en `package.json` y registre la etapa en `docs/ETAPAS.md`.
2. `npm run dist` genera `release/T5L-Studio-Setup-<versión>.exe`.
3. Calcule `SHA256SUMS.txt` y publique ambos archivos en una release `v<versión>`.

Al contribuir acepta que su aporte se distribuya bajo la licencia MIT o la Apache 2.0, como el resto del proyecto.
