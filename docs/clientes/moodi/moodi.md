# Moodi Shake — heladería (prospecto)

- **Instalación:** moodi.stiven.app · `/home/ubuntu/apps/pos-moodi` · PM2 `pos-moodi` · slug `moodi`.
- **Material que mandaron:** `menu moodi_version 2.pdf` (9 páginas, solo imágenes), `logo-barra-recogida.jpg`, logos `.webp`.
  Instagram @moodi_shake · Tel. 301 566 5596.
- **22-oct-2026, menú real cargado** (respaldo previo en `/home/ubuntu/backups/pos/moodi/antes-menu-real-*.db`):
  10 categorías (Malteadas, Granizados, Sodas, Waffles, Brownies, Fresas con crema, Ensalada de frutas, Conos, Canastas,
  Copas) y 33 productos con descripción y precio del PDF; Moodi Tropical con tamaños Mediana $18.500 / Grande $22.500.
  Categorías desde el id 10: el menú es por productos, no se usa la pantalla de sabores de ejemplo. "Mood Trandicional"
  del PDF quedó como "Mood Tradicional".
- **Fotos de producto:** 10 reales (ver 28-oct); las demás llevan la provisional (logo apilado lila sobre amarillo crema).
- **Marca:** colores del portafolio — barra y botones morado profundo (#5B3766 / #6A4275), acento coral #F2685B,
  tarjetas amarillo crema #FCF8C9; modo oscuro con su propia barra (#4A2D55). Fuentes: Baloo 2 + Quicksand (las eligió
  Stiven). Logo pequeño del menú recogido en círculo (`logo-barra-recogida.jpg`), favicon igual. Login con la portada del
  menú ("¿Cuál es tu MOOD de hoy?", mitad derecha). Recibo con el logo apilado.
- **Horario:** Lun a Vie 4:00–9:30 p.m. · Sáb, Dom y festivos 4:00–10:00 p.m.
- **Pendiente:** fotos de productos, lista de sabores de helado ("helado a elección"), NIT, dirección e impresoras.
- **Claves:** en `documentacionyclaves.md` (local).
- **28-oct-2026:** fotos de producto subidas (10 de 33, editadas con IA desde las fotos del cliente; están en
  `fotos-productos/finales/fondo-blanco/`, versión con fondo blanco; `listas/` es la primera versión con fondo). Usuario `caja` (perfil Cajero) creado. Guía de uso entregada:
  `Guia-de-uso-Moodi-Shake.pdf` (fuente en `guia/guia.html`; se regenera con `node guia/pdf.cjs <raíz del repo> salida.pdf`
  y las capturas se toman con el script de la sesión contra moodi.stiven.app). Café (capuchino, espresso, lattes) no está
  en el menú: pendiente confirmar si lo venden.
- **28-oct-2026 (tarde):** Stiven había aplicado el estilo "Heladería pastel"; se volvió a los colores propios de Moodi (morado
  #6A4275 / #5B3766, coral #F2685B, tarjetas #FCF8C9; respaldo `antes-colores-2026-10-28-15-04.db`). Fondo del login un poco
  más oscuro que el del tema (#f8f3db) con la opción nueva Marca → Pantalla de acceso → "Color de fondo del formulario".
  Logo del login: el horizontal "moodi" (lo subió Stiven ese día). Guía regenerada con las fotos de fondo blanco.
- **28-oct-2026 (noche):** la imagen provisional de los 23 productos sin foto es ahora el logo apilado lila sin fondo
  (`logo--04.webp` reducido a 600 px, `producto-moodi-sin-fondo.webp`); las tarjetas ya no ponen sombra ni recuadro crema a
  las fotos. Guía regenerada.
- **28-oct-2026 (noche, 2):** guía rediseñada: portada a sangre sin fotos ni "preparada por", capítulos de corrido (sin
  páginas medio vacías), 19 páginas. `guia/pdf.cjs` necesita `python` con `pypdf` para unir la portada; sin eso queda la
  portada dentro de los márgenes. Las fotos de producto ya no se usan en la portada (las 4 copias en `guia/` sobran).
