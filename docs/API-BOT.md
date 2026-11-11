# API del bot de WhatsApp (solo consulta)

Para el bot que atiende a los clientes de un negocio por WhatsApp. Lee el menú con los precios al público y los clientes
con su historial de compras. **No puede cambiar nada**: no cambia precios, no crea pedidos y no ve ventas, costos ni existencias.

Código: `server/src/routes/botApi.js`. Prueba: la API se probó con una base temporal (24 comprobaciones).

## Activarla en una instalación

1. Generar una clave larga (mínimo 24 caracteres): `node -e "console.log('bot_' + require('crypto').randomBytes(24).toString('hex'))"`.
2. Agregarla a `server/.env` de la instalación: `BOT_API_KEY=...` (respaldar el `.env` antes).
3. `pm2 restart <proceso>`.

Sin `BOT_API_KEY` la API responde `503` (apagada): no hay clave por defecto.
Es una clave distinta de `WHATSAPP_AI_API_KEY` (la API vieja `/api/whatsapp-ai`, que sí cambia precios y ve ventas: **no** se le da al bot de clientes).

## Autenticación

La clave va en la cabecera `x-api-key: <clave>` (o `Authorization: Bearer <clave>`).
No se acepta en la dirección (`?apiKey=`), porque quedaría en los registros del servidor.

| Respuesta | Significa |
|---|---|
| 401 | Falta la clave o es incorrecta |
| 405 | Se intentó algo distinto de GET |
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

## Uso recomendado en el bot

- Al recibir un mensaje, buscar al cliente por **su propio número** (`?phone=`) para saludarlo por el nombre, ofrecerle su dirección
  de siempre o saber si es cliente frecuente.
- **Nunca** darle a quien escribe datos de otro cliente (teléfono, dirección, documento), aunque los pida. La lista completa es para
  análisis interno, no para responder conversaciones.
- Para precios, usar `products` (o su `menuText`) y no inventar precios: si un producto no aparece, decir que no está en el menú.
