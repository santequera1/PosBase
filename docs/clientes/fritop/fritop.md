# Fritop (Cartagena) — arepas, empanadas, combos

- **Versión nueva (en revisión):** fritop.stiven.app · `/home/ubuntu/apps/pos-fritop` · PM2 `pos-fritop` · puerto 3102 · slug `fritop`.
- **Versión vieja (la que usan hoy):** fritop.wailus.co · `/home/ubuntu/apps/fritop` (repo fritopApp, versión primitiva regalada).
- **Migración 22-oct-2026:** 3 usuarios (jorge, cajero, cocina) con sus mismas contraseñas, 9 categorías, 70 productos,
  6 mesas, 3.969 ventas cerradas desde may-2026 ($60.300.000, cuadra igual que la vieja). No se pasaron 45 cuentas que
  quedaron abiertas o a medias en la versión vieja.
- **23-oct-2026:** el arranque del sistema aplicaba ajustes de la heladería original a toda base con categorías 1-3 y dañó el menú
  migrado (precios en 15.000, categorías 4 y 5 renombradas, productos de helado). Corregido en el código; se respaldó y se volvió
  a correr la migración (menú igual a la versión vieja: 9 categorías, 70 productos).
- **Marca aplicada:** logo blanco en la barra (café #5A2C2B), logo con fondo naranja en el acceso, la mascota recortada para el
  menú recogido y el favicon; acento naranja #F47B20, fondo beige; letras Luckiest Guy (títulos) + Fredoka (texto); eslogan
  "Tradición y Sabor". Todo se cambia en Configuración → Marca.
- **Cómo venden:** casi todo en mesa (6 mesas), efectivo y transferencia.
- **Para pasarse:** volver a correr la migración el día del cambio (trae las ventas nuevas), revisar el menú, configurar
  impresoras, crear usuarios por persona y apuntar fritop.wailus.co a la nueva instalación (o quedarse en fritop.stiven.app).
- **Claves:** en `documentacionyclaves.md` (local).
