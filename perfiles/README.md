# Perfiles de pantalla

Un archivo JSON por modelo. Para añadir una pantalla, copie uno existente y ajuste los campos; no hace falta tocar el código.

| Campo | Significado |
|---|---|
| `id` | Identificador único, en minúsculas |
| `nombre` | Lo que ve el usuario |
| `familia` | `T5L`, `COF` o `2K` (solo informativo) |
| `resolucion` | `[ancho, alto]` del lienzo en píxeles |
| `forma` | `rectangular` o `circular` (máscara en el lienzo y aviso de controles fuera) |
| `flashMB` | Memoria NOR: 8, 16, 32 o 64 (límite de sectores al generar) |
| `firmware.escalaTextoII` | Si el Texto DGUS II admite escala de altura |
| `firmware.crcPorDefecto` | Si el puerto serie usa CRC por defecto |
| `firmware.videoICL`, `audioWAE`, `camaraFSK`, `camara31` | Capacidades opcionales: `true` documentado, `false` no admitido según la fuente; ausente significa desconocido. No se deducen de la resolución |
| `verificacion` | `documentado` (ficha), `archivos` (proyectos reales comparados) o `pantalla` (probado en el equipo) |
| `fuentes` | Enlaces a fichas o guías |
| `notas` | Texto libre |

Además de estos archivos, la aplicación crea un perfil **genérico** por cada resolución de V7.651 (16 MB como valor inicial). Un genérico no identifica el hardware ni confirma multimedia. Se conservan los controles y se avisa de las capacidades sin confirmar.

`dmg10600t070-26w` documenta variantes TC/TR con 32 MB según la ficha revisada. La cámara FSK de bus GUI V49 se configura mediante 0x5A08; no se presume que sea equivalente al control anterior 0x5A31. El video digital ICL requiere firmware compatible con GUI V50. Ninguna de estas funciones se declara probada físicamente.
