# Seguridad

## Versiones con soporte

Solo la última versión publicada recibe correcciones.

## Informar una vulnerabilidad

No abra un issue público. Use **Report a vulnerability** en la pestaña [Security](https://github.com/omarchavezq/t5l-studio/security/advisories/new) del repositorio. Indique la versión, los pasos para reproducirlo y el impacto. Se responderá lo antes posible.

## Medidas actuales

- La app de escritorio usa `contextIsolation` y `sandbox`, una política de contenido (CSP) y un IPC que solo atiende a la página de la app y valida los datos.
- Solo escribe proyectos en rutas elegidas por el usuario.
- Bloquea la navegación, las ventanas nuevas y los permisos que no sean el puerto serie.
- Descargue el instalador solo desde las Releases de este repositorio y compruebe su SHA-256.
