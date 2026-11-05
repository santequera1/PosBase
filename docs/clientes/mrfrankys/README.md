# Mr. Franky's — referencia de identidad para la demo (hamburguesería)

Proyecto que le gustó a Stiven como base visual para el paquete de demostración de hamburguesería / comida rápida.

- Fuente: https://www.behance.net/gallery/210038913/MRFRANKYS-Logo-Design-Brand-Identity
- Autor: Duong Bui (Behance). Marca real: Mr. Franky's, Ecuador (@mr.frankys.ec).
- Descargadas el 5-nov-2026 en tamaño original (26 imágenes, carpeta `referencia-behance/`, numeradas en el orden
  en que aparecen en el proyecto).

**Ojo con el uso:** es la identidad de un negocio real (Ecuador) hecha por un diseñador. Stiven decidió usarla tal cual,
con el eslogan traducido ("Muerde, disfruta y repite"), como marca del paquete de demostración de hamburguesería. Solo
para mostrar el sistema a prospectos; no es un cliente.

## Lo que ya está en la demo (5-nov-2026)

Stiven vectorizó y dejó el material en `referencia-behance/contenido/` (logos @4x, favicon SVG, `productos/` en PNG y
`sistema/` con las portadas). De ahí salió el paquete `hamburgueseria` de `server/src/demoPacks.js`, con los archivos ya
convertidos a WebP en `public/demo-packs/hamburgueseria/` (3 MB en total):

| Archivo del paquete | Origen | Dónde se ve |
|---|---|---|
| `logo.webp`, `logo-oscuro.webp` | `logo beige@4x.png` | barra lateral (negra) |
| `logo-login.webp` | `logo-original-rojo-negro@4x.png` | formulario de acceso (fondo beige), factura electrónica |
| `logo-pequeno.webp` | `hamburguesa roja con texto@4x.png` | menú lateral recogido |
| `logo-rojo.webp`, `logo-negro.webp`, `sello.webp`, `tag-*.webp` | los demás logos y sellos | de reserva (no se usan aún) |
| `favicon.png` (64 px, mascota sobre rojo), `apple-icon.png` (180 px), `favicon.svg` | `favicon-11.svg` | pestaña del navegador, ícono en el celular |
| `portada-login.webp` | `sistema/portada-login.jpg` | panel derecho del inicio de sesión |
| `portada-login-2.webp`, `fondo-mascota.webp`, `bandeja.webp` | `sistema/` | alternativas para la portada (cambiar en demoPacks.js: `portada-login`) |
| `recibo-logo.json` | `logo negro@4x.png` | logo del recibo térmico (mapa de bits de 320 puntos) |
| 15 fotos `<producto>.webp` | `productos/*.png` | tarjetas del POS y del menú |

Colores del tema: principal `#CC0023` (botones; el rojo `#F9002B` puro queda como acento porque el sistema exige un
color principal oscuro para que el texto se lea), barra lateral `#000000`, fondo `#F8EFDC`, tarjetas `#FFF9EE`.
Letras: Oswald (títulos) + Inter (texto) + Lobster (detalles).

Productos con foto: Franky clásica, Franky tocineta, Franky BBQ bacon, Doble Franky, Presas de pollo x2 (foto pequeña
y con papel de otra marca: reemplazar cuando haya una mejor), Combo pollo crispy + papas + gaseosa, Combo Franky +
nuggets, Combo pareja, Papas a la francesa, Salsas de la casa x3, Gaseosa personal, Limonada natural (vaso beige),
Limonada de coco (vaso rojo), Café americano (vaso negro) y Malteada de fresa. Los otros 13 productos salen sin foto.

Las 26 láminas de Behance, `contenido/productos/` y `contenido/sistema/` no van a git (pesan 45 MB); los logos @4x y
el favicon SVG sí.

## Colores (tomados de la lámina 07)

| Nombre | HEX | RGB | Uso |
|---|---|---|---|
| Rojo | `#F9002B` | 249 / 0 / 43 | fondo principal, logotipo, sello |
| Beige | `#F8EFDC` | 248 / 239 / 220 | fondo claro, logotipo sobre rojo |
| Negro | `#000000` | 0 / 0 / 0 | eslogan, mascota en línea, textos |

## Elementos de la marca que se repiten

- **Logotipo** "Mr. Franky's" en script grueso con el eslogan "Smash, Eat & Repeat" debajo (láminas 03, 05, 06).
- **Mascota**: hamburguesa con gafas de sol, banderín con la "F" y piernas caminando. Versiones rellena (04),
  en línea (05, 10), dentro de un círculo con texto (03, derecha) y como silueta beige (16).
- **Sello / escudo**: banderín con la "F" dentro de un sello ondulado con el eslogan alrededor (03, izquierda).
- **Logo compacto**: el nombre apilado dentro de la silueta de la mascota (02, 13).
- **Patrón** con el logotipo y la mascota repetidos en diagonal (06, 08) y **cuadros de bandera a cuadros** rojo/beige
  como adorno (03, 11, 12, 18).
- **Eslogan manuscrito** "Smash, Eat & Repeat" con un óvalo rojo y subrayado; "Bad place for diet" como segundo
  mensaje (06, 13, 17).
- Tipografía: script personalizada para el nombre; sans grotesca ancha en mayúsculas para "SMASH, EAT & REPEAT"
  (la E de "REPEAT" dibujada con tres barras); manuscrita para los eslóganes.

## Índice de imágenes

| # | Contenido |
|---|---|
| 01 | Portada: logotipo beige sobre rojo con hamburguesa real y stickers de la mascota |
| 02 | Logo compacto (nombre apilado en la silueta de la mascota) beige sobre rojo |
| 03 | Las tres versiones del logo en rojo sobre beige: sello, logotipo principal, mascota en círculo |
| 04 | Mascota beige con la cinta negra "SMASH, EAT & REPEAT!" sobre rojo |
| 05 | Logotipo negro con la mascota roja en línea integrada entre "Fran" y "ky's" (sobre beige) |
| 06 | Logotipo beige sobre rojo con papas fritas |
| 07 | Paleta de colores (rojo, beige, negro) con CMYK/RGB/HEX |
| 08 | Lámina de aplicaciones: eslogan vertical, sello, patrón, eslogan manuscrito, logo en bloque |
| 09 | Empaque de papas con la mascota |
| 10 | Envoltorios de hamburguesa con el patrón y el sticker circular |
| 11 | Bolsas de papel rojas con la mascota y el logotipo |
| 12 | Hoja de stickers (todas las versiones del logo y la mascota) |
| 13 | Vasos de papel (rojo, beige y negro) y hamburguesa real |
| 14 | Delantal rojo con el logotipo y cuadros de bandera |
| 15 | Hamburguesas reales en patrón sobre rojo con la silueta de la mascota |
| 16 | Vasos apilados y "Bad place for diet" |
| 17 | Caja de hamburguesa roja con la mascota |
| 18 | Tres publicaciones para Instagram |
| 19–26 | Más aplicaciones (menú, señalética, uniformes, empaques, redes); pendiente de revisar una a una |

## Para dónde va en la demo (propuesta)

Cuando estén vectorizadas, los archivos del paquete van en `public/demo-packs/hamburgueseria/`:

- `logo.png` (logotipo principal sobre fondo transparente), `logo-oscuro.png` (versión beige para fondos rojos),
  `logo-pequeno.png` (mascota sola, para el menú lateral y el ícono) y `logo-login.png` (logotipo + mascota).
- Portada del login: una lámina tipo 01 o 15 (rojo con hamburguesas).
- Fotos de productos en fondo blanco con el prompt de `docs/clientes/moodi/prompt-fotos-productos.md`.
- Colores del paquete en `demoPacks.js`: primario `#F9002B`, fondo `#F8EFDC`, oscuro `#000000`.
