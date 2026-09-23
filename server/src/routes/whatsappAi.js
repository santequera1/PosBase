const { Router } = require('express');
const { getDb } = require('../db');

const router = Router();

// Configuration: API Key for WhatsApp AI integration
const API_KEY = process.env.WHATSAPP_AI_API_KEY || 'pos_ai_cambiar_esta_clave';
if (!process.env.WHATSAPP_AI_API_KEY) {
  console.warn('⚠️  WHATSAPP_AI_API_KEY no está definida en server/.env; se usa una clave por defecto insegura.');
}

// Nombre del negocio y prefijo de comprobante desde Ajustes (editables en la app)
function getSetting(key, fallback) {
  try {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row && row.value ? String(row.value) : fallback;
  } catch {
    return fallback;
  }
}
const businessName = () => getSetting('businessName', 'Mi Heladería');
const invoicePrefix = () => getSetting('invoicePrefix', 'POS');

// Helper for formatting COP prices
function formatCOP(val) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(val || 0);
}

// Middleware: Authenticate incoming webhook / API calls
function authenticateApiKey(req, res, next) {
  const incomingKey =
    req.headers['x-api-key'] ||
    (req.headers['authorization'] ? req.headers['authorization'].replace(/^Bearer\s+/i, '') : '') ||
    req.query.apiKey ||
    req.body?.apiKey;

  if (!incomingKey || incomingKey !== API_KEY) {
    return res.status(401).json({
      success: false,
      error: 'No autorizado. Proporcione una API Key válida en la cabecera x-api-key o Bearer token.',
    });
  }
  next();
}

router.use(authenticateApiKey);

// -------------------------------------------------------------
// 1. GET /api/whatsapp-ai/sales/summary - Reporte de Ventas
// -------------------------------------------------------------
router.get('/sales/summary', (req, res) => {
  const { period = 'today' } = req.query;
  const db = getDb();

  let dateFilter = "date(created_at) = date('now', '-5 hours')";
  let periodLabel = 'Hoy';

  if (period === 'yesterday') {
    dateFilter = "date(created_at) = date('now', '-5 hours', '-1 day')";
    periodLabel = 'Ayer';
  } else if (period === 'week') {
    dateFilter = "date(created_at) >= date('now', '-5 hours', '-7 days')";
    periodLabel = 'Últimos 7 días';
  } else if (period === 'month') {
    dateFilter = "strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', '-5 hours')";
    periodLabel = 'Este Mes';
  }

  // Summary query
  const summary = db.prepare(`
    SELECT
      COUNT(*) as totalOrders,
      COALESCE(SUM(total), 0) as totalRevenue,
      COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END), 0) as cashTotal,
      COALESCE(SUM(CASE WHEN payment_method IN ('card_debit', 'card_credit') THEN total ELSE 0 END), 0) as cardsTotal,
      COALESCE(SUM(CASE WHEN payment_method = 'transfer' THEN total ELSE 0 END), 0) as transferTotal
    FROM orders
    WHERE status != 'cancelled' AND ${dateFilter}
  `).get();

  const totalOrders = summary.totalOrders || 0;
  const totalRevenue = summary.totalRevenue || 0;
  const avgTicket = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  // Top products/flavors in period
  // Top products/flavors in period
  const topItems = db.prepare(`
    SELECT oi.name, oi.flavors, SUM(oi.quantity) as qty, SUM(oi.price * oi.quantity) as revenue
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.status != 'cancelled' AND ${dateFilter}
    GROUP BY oi.name
    ORDER BY qty DESC
    LIMIT 3
  `).all();

  // Presentations / Containers breakdown
  const itemsRows = db.prepare(`
    SELECT oi.name, oi.size, oi.quantity, oi.price
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.status != 'cancelled' AND ${dateFilter}
  `).all();

  const presentations = {
    vaso4oz: { name: 'Vaso 4 oz', qty: 0, revenue: 0 },
    vaso6oz: { name: 'Vaso 6 oz', qty: 0, revenue: 0 },
    cono: { name: 'Conos', qty: 0, revenue: 0 },
    litro: { name: 'Litro Familiar', qty: 0, revenue: 0 },
    otros: { name: 'Bebidas & Otros', qty: 0, revenue: 0 },
  };

  itemsRows.forEach(it => {
    const n = (it.name || '').toLowerCase();
    const s = (it.size || '').toLowerCase();
    const rev = it.price * it.quantity;

    if (n.includes('4 oz') || s.includes('4 oz') || s.includes('pequeño') || s.includes('pequeno')) {
      presentations.vaso4oz.qty += it.quantity;
      presentations.vaso4oz.revenue += rev;
    } else if (n.includes('6 oz') || s.includes('6 oz') || s.includes('grande')) {
      presentations.vaso6oz.qty += it.quantity;
      presentations.vaso6oz.revenue += rev;
    } else if (n.includes('cono') || s.includes('cono')) {
      presentations.cono.qty += it.quantity;
      presentations.cono.revenue += rev;
    } else if (n.includes('litro') || s.includes('litro') || s.includes('1000 ml')) {
      presentations.litro.qty += it.quantity;
      presentations.litro.revenue += rev;
    } else {
      presentations.otros.qty += it.quantity;
      presentations.otros.revenue += rev;
    }
  });

  const totalCups = presentations.vaso4oz.qty + presentations.vaso6oz.qty;
  const totalCupsRevenue = presentations.vaso4oz.revenue + presentations.vaso6oz.revenue;
  const totalHelados = totalCups + presentations.cono.qty + presentations.litro.qty;

  // Preformatted WhatsApp message
  let whatsappText = `📊 *REPORTE DE VENTAS — ${businessName().toUpperCase()}*\n`;
  whatsappText += `📅 *Período:* ${periodLabel}\n\n`;
  whatsappText += `💰 *Total Ventas:* ${formatCOP(totalRevenue)}\n`;
  whatsappText += `🧾 *Comprobantes:* ${totalOrders} pedidos\n`;
  whatsappText += `🎯 *Ticket Promedio:* ${formatCOP(avgTicket)}\n\n`;

  whatsappText += `🍨 *Envases y Presentaciones:*\n`;
  whatsappText += `• 📦 *Total Vasos (4oz + 6oz):* *${totalCups} vasos* (${formatCOP(totalCupsRevenue)})\n`;
  whatsappText += `  ├ Vasos 4 oz: *${presentations.vaso4oz.qty} uds.* (${formatCOP(presentations.vaso4oz.revenue)})\n`;
  whatsappText += `  └ Vasos 6 oz: *${presentations.vaso6oz.qty} uds.* (${formatCOP(presentations.vaso6oz.revenue)})\n`;
  if (presentations.cono.qty > 0) whatsappText += `• 🍦 Conos: *${presentations.cono.qty} uds.* (${formatCOP(presentations.cono.revenue)})\n`;
  if (presentations.litro.qty > 0) whatsappText += `• 🧊 Litro Familiar: *${presentations.litro.qty} uds.* (${formatCOP(presentations.litro.revenue)})\n`;
  if (presentations.otros.qty > 0) whatsappText += `• ☕ Bebidas & Otros: *${presentations.otros.qty} uds.* (${formatCOP(presentations.otros.revenue)})\n`;
  whatsappText += `• 🍧 Total Helados: *${totalHelados} uds.*\n`;

  whatsappText += `\n💳 *Métodos de Pago:*\n`;
  whatsappText += `• Efectivo: ${formatCOP(summary.cashTotal)}\n`;
  whatsappText += `• Tarjetas: ${formatCOP(summary.cardsTotal)}\n`;
  whatsappText += `• QR / Bancolombia: ${formatCOP(summary.transferTotal)}\n`;

  if (topItems.length > 0) {
    whatsappText += `\n🍨 *Sabores / Productos Top:*\n`;
    topItems.forEach((it, idx) => {
      whatsappText += `${idx + 1}. *${it.name}* (${it.qty} uds.) — ${formatCOP(it.revenue)}\n`;
    });
  }

  res.json({
    success: true,
    period,
    periodLabel,
    data: {
      totalRevenue,
      totalOrders,
      avgTicket,
      totalCups,
      totalCupsRevenue,
      totalHelados,
      presentations,
      paymentBreakdown: {
        cash: summary.cashTotal,
        cards: summary.cardsTotal,
        transfer: summary.transferTotal,
      },
      topItems,
    },
    whatsappText,
  });
});

// -------------------------------------------------------------
// 2. GET /api/whatsapp-ai/products - Catálogo y búsqueda de productos
// -------------------------------------------------------------
router.get('/products', (req, res) => {
  const { search } = req.query;
  const db = getDb();

  let sql = 'SELECT id, name, category_id, price, available, description FROM products WHERE 1=1';
  const params = [];

  if (search) {
    sql += ' AND (name LIKE ? OR description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  sql += ' ORDER BY category_id, name';

  const products = db.prepare(sql).all(...params).map(p => ({
    ...p,
    available: Boolean(p.available),
  }));

  let whatsappText = `🍨 *CATÁLOGO ${businessName().toUpperCase()}* (${products.length} productos):\n\n`;
  products.slice(0, 15).forEach(p => {
    const status = p.available ? '✅ Disponible' : '❌ Agotado';
    whatsappText += `• *${p.name}* (ID: ${p.id})\n  Precio: ${formatCOP(p.price)} | ${status}\n`;
  });

  if (products.length > 15) {
    whatsappText += `\n_...y ${products.length - 15} productos más._`;
  }

  res.json({
    success: true,
    count: products.length,
    products,
    whatsappText,
  });
});

// -------------------------------------------------------------
// 3. POST /api/whatsapp-ai/products/update-price - Cambiar precio
// -------------------------------------------------------------
router.post('/products/update-price', (req, res) => {
  const { id, search, price } = req.body;
  const newPrice = Number(price);

  if (isNaN(newPrice) || newPrice <= 0) {
    return res.status(400).json({ success: false, error: 'Debe especificar un precio numérico válido.' });
  }

  const db = getDb();
  let product = null;

  if (id) {
    product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  } else if (search) {
    product = db.prepare('SELECT * FROM products WHERE name LIKE ? LIMIT 1').get(`%${search}%`);
  }

  if (!product) {
    return res.status(404).json({ success: false, error: 'Producto no encontrado.' });
  }

  const oldPrice = product.price;
  db.prepare('UPDATE products SET price = ? WHERE id = ?').run(newPrice, product.id);

  const updatedProduct = db.prepare('SELECT * FROM products WHERE id = ?').get(product.id);

  // Broadcast change via Socket.IO if available
  if (req.app.io) {
    req.app.io.emit('product:updated', updatedProduct);
  }

  const whatsappText = `✅ *PRECIO ACTUALIZADO*\n` +
    `🍨 *Producto:* ${product.name}\n` +
    `💵 *Precio anterior:* ${formatCOP(oldPrice)}\n` +
    `🆕 *Nuevo precio:* *${formatCOP(newPrice)}*\n` +
    `_El cambio ya está reflejado en el Punto de Venta (POS)._`;

  res.json({
    success: true,
    product: updatedProduct,
    oldPrice,
    newPrice,
    whatsappText,
  });
});

// -------------------------------------------------------------
// 4. POST /api/whatsapp-ai/products/toggle-availability - Agotado/Disponible
// -------------------------------------------------------------
router.post('/products/toggle-availability', (req, res) => {
  const { id, search, available } = req.body;
  const db = getDb();

  let product = null;
  if (id) {
    product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  } else if (search) {
    product = db.prepare('SELECT * FROM products WHERE name LIKE ? LIMIT 1').get(`%${search}%`);
  }

  if (!product) {
    return res.status(404).json({ success: false, error: 'Producto no encontrado.' });
  }

  const newStatus = available !== undefined ? (available ? 1 : 0) : (product.available ? 0 : 1);
  db.prepare('UPDATE products SET available = ? WHERE id = ?').run(newStatus, product.id);

  const updatedProduct = db.prepare('SELECT * FROM products WHERE id = ?').get(product.id);

  if (req.app.io) {
    req.app.io.emit('product:updated', updatedProduct);
  }

  const statusLabel = newStatus ? 'DISPONIBLE ✅' : 'AGOTADO / PAUSADO ❌';
  const whatsappText = `🍨 *ESTADO DE DISPONIBILIDAD*\n` +
    `• *Producto:* ${product.name}\n` +
    `• *Nuevo estado:* *${statusLabel}*\n` +
    `_Los cajeros verán este estado inmediatamente._`;

  res.json({
    success: true,
    product: updatedProduct,
    available: Boolean(newStatus),
    whatsappText,
  });
});

// -------------------------------------------------------------
// 5. GET /api/whatsapp-ai/orders/recent - Últimos pedidos
// -------------------------------------------------------------
router.get('/orders/recent', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 5, 20);
  const db = getDb();

  const orders = db.prepare(`
    SELECT o.*, GROUP_CONCAT(oi.name || ' (' || oi.quantity || ')') as items_summary
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    GROUP BY o.id
    ORDER BY o.id DESC
    LIMIT ?
  `).all(limit);

  let whatsappText = `🧾 *ÚLTIMOS ${orders.length} COMPROBANTES:*\n\n`;
  orders.forEach(o => {
    const pay = o.payment_method === 'cash' ? 'Efectivo' :
                o.payment_method === 'card_debit' ? 'T. Débito' :
                o.payment_method === 'card_credit' ? 'T. Crédito' : 'QR';
    whatsappText += `• *${invoicePrefix()}-${o.id}* — ${formatCOP(o.total)} [${pay}]\n`;
    whatsappText += `  Cliente: ${o.customer_name}\n`;
    if (o.items_summary) whatsappText += `  Ítems: ${o.items_summary}\n`;
    whatsappText += `  Hora: ${o.created_at.split(' ')[1] || o.created_at}\n\n`;
  });

  res.json({
    success: true,
    count: orders.length,
    orders,
    whatsappText,
  });
});

// -------------------------------------------------------------
// 6. GET /api/whatsapp-ai/customers - Búsqueda de Clientes
// -------------------------------------------------------------
router.get('/customers', (req, res) => {
  const { search } = req.query;
  const db = getDb();

  let sql = 'SELECT * FROM customers WHERE 1=1';
  const params = [];

  if (search) {
    sql += ' AND (name LIKE ? OR phone LIKE ? OR document_id LIKE ? OR email LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  sql += ' ORDER BY id DESC LIMIT 10';

  const customers = db.prepare(sql).all(...params).map(c => {
    const stats = db.prepare(`
      SELECT COUNT(*) as orders, COALESCE(SUM(total), 0) as spent
      FROM orders WHERE customer_phone = ? OR customer_doc = ?
    `).get(c.phone, c.document_id);

    return {
      ...c,
      totalOrders: stats?.orders || 0,
      totalSpent: stats?.spent || 0,
    };
  });

  let whatsappText = `👥 *CLIENTES ENCONTRADOS* (${customers.length}):\n\n`;
  customers.forEach(c => {
    whatsappText += `• *${c.name}*\n`;
    whatsappText += `  Tel: ${c.phone} | Doc: ${c.document_id || 'N/A'}\n`;
    whatsappText += `  Total comprado: ${formatCOP(c.totalSpent)} (${c.totalOrders} pedidos)\n\n`;
  });

  res.json({
    success: true,
    count: customers.length,
    customers,
    whatsappText,
  });
});

// -------------------------------------------------------------
// 7. POST /api/whatsapp-ai/webhook - Webhook Universal para Agentes de IA
// -------------------------------------------------------------
router.post('/webhook', (req, res) => {
  const { action, params = {} } = req.body;
  const db = getDb();

  try {
    switch (action) {
      case 'get_sales': {
        const period = params.period || 'today';
        let dateFilter = "date(created_at) = date('now', '-5 hours')";
        let label = 'Hoy';

        if (period === 'yesterday') {
          dateFilter = "date(created_at) = date('now', '-5 hours', '-1 day')";
          label = 'Ayer';
        } else if (period === 'week') {
          dateFilter = "date(created_at) >= date('now', '-5 hours', '-7 days')";
          label = 'Últimos 7 días';
        }

        const stats = db.prepare(`
          SELECT
            COUNT(*) as totalOrders,
            COALESCE(SUM(total), 0) as totalRevenue,
            COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END), 0) as cash,
            COALESCE(SUM(CASE WHEN payment_method IN ('card_debit', 'card_credit') THEN total ELSE 0 END), 0) as cards,
            COALESCE(SUM(CASE WHEN payment_method = 'transfer' THEN total ELSE 0 END), 0) as qr
          FROM orders WHERE status != 'cancelled' AND ${dateFilter}
        `).get();

        const text = `📊 *Ventas ${label}:*\n• Total: *${formatCOP(stats.totalRevenue)}*\n• Pedidos: ${stats.totalOrders}\n• Efectivo: ${formatCOP(stats.cash)}\n• Tarjetas: ${formatCOP(stats.cards)}\n• QR: ${formatCOP(stats.qr)}`;
        return res.json({ success: true, action, data: stats, whatsappText: text });
      }

      case 'update_price': {
        const { id, search, price } = params;
        const newPrice = Number(price);
        let product = id
          ? db.prepare('SELECT * FROM products WHERE id = ?').get(id)
          : db.prepare('SELECT * FROM products WHERE name LIKE ? LIMIT 1').get(`%${search}%`);

        if (!product) {
          return res.status(404).json({ success: false, error: 'Producto no encontrado' });
        }

        db.prepare('UPDATE products SET price = ? WHERE id = ?').run(newPrice, product.id);
        const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(product.id);
        if (req.app.io) req.app.io.emit('product:updated', updated);

        const text = `✅ *Precio actualizado:* *${product.name}* ahora cuesta *${formatCOP(newPrice)}*.`;
        return res.json({ success: true, action, data: updated, whatsappText: text });
      }

      case 'toggle_product': {
        const { id, search, available } = params;
        let product = id
          ? db.prepare('SELECT * FROM products WHERE id = ?').get(id)
          : db.prepare('SELECT * FROM products WHERE name LIKE ? LIMIT 1').get(`%${search}%`);

        if (!product) {
          return res.status(404).json({ success: false, error: 'Producto no encontrado' });
        }

        const newStatus = available !== undefined ? (available ? 1 : 0) : (product.available ? 0 : 1);
        db.prepare('UPDATE products SET available = ? WHERE id = ?').run(newStatus, product.id);
        const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(product.id);
        if (req.app.io) req.app.io.emit('product:updated', updated);

        const text = `🍨 *${product.name}* ahora está marcado como *${newStatus ? 'DISPONIBLE ✅' : 'AGOTADO ❌'}*.`;
        return res.json({ success: true, action, data: updated, whatsappText: text });
      }

      case 'get_products': {
        const { search } = params;
        let sql = 'SELECT id, name, price, available FROM products';
        const p = [];
        if (search) {
          sql += ' WHERE name LIKE ?';
          p.push(`%${search}%`);
        }
        sql += ' LIMIT 10';
        const prods = db.prepare(sql).all(...p);
        let text = `🍨 *Productos encontrados (${prods.length}):*\n`;
        prods.forEach(pr => {
          text += `• *${pr.name}*: ${formatCOP(pr.price)} [${pr.available ? '✅' : '❌'}]\n`;
        });
        return res.json({ success: true, action, data: prods, whatsappText: text });
      }

      case 'get_customer': {
        const { query } = params;
        const customer = db.prepare('SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ? OR document_id LIKE ? LIMIT 1').get(`%${query}%`, `%${query}%`, `%${query}%`);
        if (!customer) {
          return res.json({ success: false, error: 'Cliente no encontrado', whatsappText: `❌ No se encontró ningún cliente con "${query}".` });
        }
        const stats = db.prepare('SELECT COUNT(*) as orders, COALESCE(SUM(total), 0) as spent FROM orders WHERE customer_phone = ?').get(customer.phone);
        const text = `👤 *Cliente:* *${customer.name}*\n• Tel: ${customer.phone}\n• NIT/CC: ${customer.document_id || 'N/A'}\n• Compras: ${formatCOP(stats?.spent || 0)} (${stats?.orders || 0} pedidos)`;
        return res.json({ success: true, action, data: { ...customer, ...stats }, whatsappText: text });
      }

      default:
        return res.status(400).json({
          success: false,
          error: `Acción no soportada: "${action}". Acciones válidas: get_sales, update_price, toggle_product, get_products, get_customer.`,
        });
    }
  } catch (err) {
    console.error('Error in WhatsApp AI webhook:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
