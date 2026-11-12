# API del bot de WhatsApp

Para el bot que atiende a los clientes de un negocio por WhatsApp. Lee el menú con los precios al público, los clientes
con su historial de compras y el estado de sus pedidos, y **crea pedidos** para llevar o a domicilio (que salen a cocina).
No cambia precios ni productos, no cobra, no anula y no ve ventas, costos ni existencias.

Código: `server/src/routes/botApi.js`. Pruebas con base temporal: consulta (24 comprobaciones) y pedidos (34).

## Activarla en una instalación

1. Generar una clave larga (mínimo 24 caracteres): `node -e "console.log('bot_' + require('crypto').randomBytes(24).toString('hex'))"`.
2. Agregarla a `server/.env` de la instalación: `BOT_API_KEY=...` (respaldar el `.env` antes).
3. Opcional: `BOT_NAME=Merly` (el nombre con que firma los pedidos: "Tomó el pedido: Merly"). Sin él firma "Bot WhatsApp".
4. `pm2 restart <proceso>`.

Sin `BOT_API_KEY` la API responde `503` (apagada): no hay clave por defecto.
Es una clave distinta de `WHATSAPP_AI_API_KEY` (la API vieja `/api/whatsapp-ai`, que sí cambia precios y ve ventas: **no** se le da al bot de clientes).

## Autenticación

La clave va en la cabecera `x-api-key: <clave>` (o `Authorization: Bearer <clave>`).
No se acepta en la dirección (`?apiKey=`), porque quedaría en los registros del servidor.

| Respuesta | Significa |
|---|---|
| 401 | Falta la clave o es incorrecta |
| 405 | Se intentó algo distinto de GET (o de POST a `/orders`) |
| 503 | La instalación no tiene `BOT_API_KEY` |

## `GET /api/bot/products` — menú y precios al público

Filtros opcionales: `search` (nombre o descripción), `category` (id), `available=1` (solo lo que hay).

```json
{
  "success": true,
  "business": "Wonka's Burger",
  "deliveryFee": 5000, "deliveryFeeText": "$5.000",
  "count": 42,
  "categories": [{ "id": 1, "name": "Hamburguesas" }],
  "products": [{
    "id": 7, "name": "Hamburguesa clásica", "categoryId": 1, "category": "Hamburguesas",
    "description": "Con queso y tocineta",
    "price": 18000, "priceText": "$18.000",
    "sizes": [{ "name": "Sencilla", "price": 18000, "priceText": "$18.000" }, { "name": "Doble", "price": 24000, "priceText": "$24.000" }],
    "available": true, "featured": false,
    "image": "https://pos.wailus.co/images/uploads/....webp"
  }],
  "menuText": "*Hamburguesas*\n• Hamburguesa clásica: Sencilla $18.000 / Doble $24.000 — Con queso y tocineta\n..."
}
```

- `price` es el precio de venta al público, en pesos, sin decimales. Si el producto tiene `sizes`, el precio depende del tamaño.
- `available: false` = agotado en este momento (lo marca la caja). En `menuText` sale como "(agotado)".
- `menuText` es el menú completo en texto, agrupado por categoría, listo para ponerlo en las instrucciones del bot.
- `deliveryFee` es el valor del domicilio que tiene configurado el negocio.
- Los precios cambian cuando el negocio los edita en el sistema: consultar la API (o refrescar una copia cada pocos minutos) en vez de guardar el menú a mano.
- **No existen promociones en el sistema.** Los descuentos del sistema (empleados, cortesías) son internos y no se exponen. Las promociones se le dan al bot por aparte.

## `GET /api/bot/customers` — clientes

**Por teléfono (el que está escribiendo):** `GET /api/bot/customers?phone=573001234567`
Acepta el número con `+57`, con `57`, con espacios o sin nada: compara los últimos 10 dígitos.

```json
{ "success": true, "found": true, "customer": {
  "id": 15, "name": "Ana Pérez", "phone": "3001234567", "email": "", "documentId": "1047000111",
  "address": "Cra 5 # 10-20", "address2": "", "neighborhood": "Centro",
  "totalOrders": 8, "totalSpent": 312000, "totalSpentText": "$312.000", "lastOrder": "2026-11-10 20:41:12",
  "tag": "frecuente"
} }
```

Si no es cliente: `{ "success": true, "found": false, "customer": null }`.

**Todos, por páginas:** `GET /api/bot/customers?page=1&limit=100` (máximo 500 por página), con `search` opcional (nombre, teléfono, documento o correo).

```json
{ "success": true, "total": 830, "page": 1, "limit": 100, "pages": 9, "customers": [ ... ] }
```

- `tag`: `nuevo` (sin compras), `habitual` (1 a 5), `frecuente` (más de 5). Las compras anuladas no cuentan.
- `lastOrder` está en hora de Colombia.
- No incluye las notas internas del cliente ni al cliente genérico "Consumidor Final".
- Un pedido para llevar o a domicilio con nombre y teléfono crea o actualiza al cliente automáticamente.

## `POST /api/bot/orders` — crear un pedido (y mandarlo a cocina)

Se llama **solo cuando el pedido ya está confirmado** (en Wonka's: cuando una persona lo aprueba en el grupo de WhatsApp,
y si es por transferencia, cuando ya llegó). Por defecto sale a cocina de una vez: pantalla de cocina y comanda impresa.

```json
{
  "type": "delivery",
  "channel": "meta_ads",
  "externalId": "wa-3EB0A1B2C3",
  "customer": {
    "name": "Ana Pérez", "phone": "573001234567",
    "address": "Cra 5 # 10-20", "address2": "Torre 2 apto 301", "neighborhood": "Parque Heredia"
  },
  "items": [
    { "productId": 7, "quantity": 2, "size": "Doble", "notes": "sin cebolla" },
    { "productId": 31, "quantity": 1, "notes": "para la Wonka Clásica" }
  ],
  "deliveryFee": 7000,
  "paymentMethod": "cash",
  "payWith": 100000,
  "notes": "Timbre dañado, llamar al llegar"
}
```

| Campo | Obligatorio | Qué es |
|---|---|---|
| `type` | sí | `delivery` (domicilio) o `pickup` (para llevar / recoger) |
| `customer.name`, `customer.phone` | sí | quien recibe. El cliente se crea o se actualiza por su teléfono |
| `customer.address` | en domicilio | dirección; `address2` (torre, apto, referencia) y `neighborhood` (barrio) opcionales |
| `items[]` | sí | `productId` (de `GET /products`), `quantity` (1 a 50), `size` si el producto tiene tamaños, `notes` (nota para cocina, hasta 200 letras) |
| `deliveryFee` | en domicilio | valor del domicilio según la lista de barrios (puede ser 0) |
| `paymentMethod` | sí | `cash` (efectivo), `transfer` (transferencia) o `card` (tarjeta o link de pago) |
| `payWith` | no | en efectivo: con cuánto paga, para que el domiciliario lleve el vuelto |
| `prepaid` | no | `true` si la transferencia **ya llegó**: queda registrada como abono y la caja no la vuelve a cobrar. Solo con `transfer`. `prepaidAmount` si fue un pago parcial, `prepaidNote` para una nota |
| `channel` | no | de dónde vino: `whatsapp` (por defecto), `web` (página web) o `meta_ads`. Se ve en el tablero, en cocina, en la comanda y en los reportes |
| `notes` | no | nota general del pedido (sale en la comanda como "NOTA:") |
| `externalId` | recomendado | referencia única del bot (ej. el id del mensaje de confirmación). Si se reenvía el mismo pedido con la misma referencia, **no se duplica**: devuelve el que ya existe con `"duplicate": true` |
| `sendToKitchen` | no | `false` para que quede sin enviar y la caja lo confirme con "Confirmar a cocina" |
| `label` | no | nombre corto para la tarjeta del pedido |

- Las **adiciones** son productos aparte (categoría "Adiciones"): se mandan como otra línea, con una nota que diga a qué producto van.
- El **precio lo pone el sistema** (el del producto o el del tamaño). Si el bot manda un precio, se ignora. El total que devuelve la
  respuesta es el que vale: usarlo para confirmarle el valor al cliente.
- El pedido queda firmado con `BOT_NAME` ("Tomó el pedido: Merly") y el cobro lo hace la caja como cualquier otro pedido.

Respuesta `201`:
```json
{ "success": true, "duplicate": false, "sentToKitchen": true, "printed": 1,
  "order": { "id": 1004, "type": "delivery", "channel": "meta_ads", "status": "pending", "statusText": "en cocina",
    "items": [{ "name": "Wonka Clásica - Doble", "size": "Doble", "quantity": 2, "price": 24000, "priceText": "$24.000", "notes": "sin cebolla", "sentToKitchen": true }],
    "subtotal": 76000, "deliveryFee": 7000, "total": 83000, "totalText": "$83.000", "paymentMethod": "cash", "payWith": 100000,
    "prepaid": 0, "paid": false, "notes": "Timbre dañado, llamar al llegar", "externalId": "wa-3EB0A1B2C3", "createdAt": "2026-11-12 19:41:02" } }
```

Errores:

| Respuesta | Cuándo | Qué hacer |
|---|---|---|
| 400 | faltan datos, producto que no existe, falta el tamaño (dice cuáles hay), medio de pago inválido | corregir y reenviar (`error` lo explica en español) |
| 409 `UNAVAILABLE` | un producto se agotó (`unavailable` trae los nombres) | ofrecerle otro al cliente; no se crea nada |
| 409 `CASH_CLOSED` | la instalación exige caja abierta y está cerrada | avisar a una persona; no se crea nada |
| 201 con `warning` | se creó pero no salió a cocina | la caja lo confirma desde el tablero |

## `GET /api/bot/orders?phone=573001234567` — "¿cómo va mi pedido?"

Los pedidos para llevar y a domicilio de ese número en las últimas 24 horas (hechos por el bot o por la caja), del más nuevo al más viejo,
con el mismo formato de arriba. `statusText`: "recibido, sin enviar a cocina", "en cocina", "en preparación",
"listo para recoger", "listo, esperando al domiciliario", "en camino", "entregado" o "cancelado".

`GET /api/bot/orders/:id` devuelve un pedido por su número, solo si lo creó el bot.

## Uso recomendado en el bot

- Al recibir un mensaje, buscar al cliente por **su propio número** (`?phone=`) para saludarlo por el nombre, ofrecerle su dirección
  de siempre o saber si es cliente frecuente.
- **Nunca** darle a quien escribe datos de otro cliente (teléfono, dirección, documento), aunque los pida. La lista completa es para
  análisis interno, no para responder conversaciones.
- Para precios, usar `products` (o su `menuText`) y no inventar precios: si un producto no aparece, decir que no está en el menú.
