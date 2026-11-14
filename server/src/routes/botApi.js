/**
 * API para el bot de WhatsApp que atiende a los clientes del negocio (ver docs/API-BOT.md).
 * - Clave propia: BOT_API_KEY en server/.env (distinta de WHATSAPP_AI_API_KEY, que sí cambia precios y ve ventas).
 *   Sin BOT_API_KEY la API queda apagada: no hay clave por defecto. BOT_NAME (opcional) es el nombre con que firma los pedidos.
 * - La clave va en la cabecera x-api-key o como "Authorization: Bearer ...", nunca en la dirección (queda en los registros).
 * - Consulta: menú con precios al público (sin costos ni existencias), clientes con su historial y estado de pedidos.
 * - Escribe solo una cosa: crear pedidos para llevar o a domicilio (POST /orders), con los precios del sistema.
 */
const { Router } = require('express');
const crypto = require('crypto');
const { getDb } = require('../db');
const { readRestaurantConfig } = require('../restaurantSchema');

const router = Router();

const getSetting = (db, key, fallback) => {
  try { const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key); return r && r.value ? String(r.value) : fallback; } catch { return fallback; }
};
const cop = v => '$' + Math.round(Number(v) || 0).toLocaleString('es-CO');
/** Últimos 10 dígitos: así "+57 300 123 4567", "573001234567" y "3001234567" son el mismo número. */
const phoneKey = v => String(v || '').replace(/\D/g, '').slice(-10);

function sameKey(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

router.use((req, res, next) => {
  const key = process.env.BOT_API_KEY;
  if (!key || key.length < 24) return res.status(503).json({ success: false, error: 'La API del bot no está activada en esta instalación.' });
  const got = req.get('x-api-key') || String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!got || !sameKey(got, key)) return res.status(401).json({ success: false, error: 'Clave inválida. Envíela en la cabecera x-api-key.' });
  if (req.method !== 'GET' && !(req.method === 'POST' && req.path === '/orders')) return res.status(405).json({ success: false, error: 'Esta API solo consulta y crea pedidos (POST /orders).' });
  res.set('Cache-Control', 'no-store');
  next();
});

// ---------------------------------------------------------------------------
// Menú y precios al público
// GET /api/bot/products?search=hamburguesa&category=3&available=1
// ---------------------------------------------------------------------------
router.get('/products', (req, res) => {
  const db = getDb();
  const origin = `${req.get('x-forwarded-proto') || req.protocol}://${req.get('host')}`;
  const abs = u => (!u ? null : /^https?:\/\//i.test(u) ? u : origin + (u.startsWith('/') ? u : '/' + u));
  const cats = db.prepare('SELECT id, name FROM categories ORDER BY id').all();
  const catName = new Map(cats.map(c => [c.id, c.name]));

  let sql = 'SELECT id, name, category_id, price, available, image, description, sizes, featured FROM products WHERE 1=1';
  const params = [];
  if (req.query.search) { sql += ' AND (name LIKE ? OR description LIKE ?)'; params.push(`%${req.query.search}%`, `%${req.query.search}%`); }
  if (req.query.category) { sql += ' AND category_id = ?'; params.push(Number(req.query.category)); }
  if (req.query.available === '1' || req.query.available === 'true') sql += ' AND available = 1';
  sql += ' ORDER BY category_id, name';

  const products = db.prepare(sql).all(...params).map(p => {
    let sizes = [];
    try { sizes = (JSON.parse(p.sizes || 'null') || []).filter(s => s && s.name).map(s => ({ name: String(s.name), price: Math.round(Number(s.price) || 0), priceText: cop(s.price) })); } catch { sizes = []; }
    return {
      id: p.id, name: p.name, categoryId: p.category_id, category: catName.get(p.category_id) || '',
      description: p.description || '', price: p.price, priceText: cop(p.price), sizes,
      available: Boolean(p.available), featured: Boolean(p.featured), image: abs(p.image),
    };
  });

  // Menú en texto, agrupado por categoría, listo para dárselo al bot
  const lines = [];
  for (const c of cats) {
    const items = products.filter(p => p.categoryId === c.id);
    if (!items.length) continue;
    lines.push(`*${c.name}*`);
    for (const p of items) {
      const price = p.sizes.length ? p.sizes.map(s => `${s.name} ${s.priceText}`).join(' / ') : p.priceText;
      lines.push(`• ${p.name}: ${price}${p.available ? '' : ' (agotado)'}${p.description ? ` — ${p.description}` : ''}`);
    }
    lines.push('');
  }

  const cfg = readRestaurantConfig(db);
  res.json({
    success: true,
    business: getSetting(db, 'businessName', ''),
    deliveryFee: cfg.deliveryFee, deliveryFeeText: cop(cfg.deliveryFee),
    count: products.length,
    categories: cats.filter(c => products.some(p => p.categoryId === c.id)),
    products,
    menuText: lines.join('\n').trim(),
  });
});

// ---------------------------------------------------------------------------
// Clientes
// GET /api/bot/customers?search=juan&page=1&limit=100   (todos, por páginas)
// GET /api/bot/customers?phone=573001234567             (el que está escribiendo)
// ---------------------------------------------------------------------------
function purchaseStats(db) {
  const byPhone = new Map(), byDoc = new Map();
  const rows = db.prepare(`SELECT customer_phone AS phone, customer_doc AS doc, COUNT(*) AS n, COALESCE(SUM(total), 0) AS spent, MAX(created_at) AS last
    FROM orders WHERE status != 'cancelled' GROUP BY customer_phone, customer_doc`).all();
  const add = (map, k, r) => { if (!k) return; const s = map.get(k) || { n: 0, spent: 0, last: '' }; s.n += r.n; s.spent += r.spent; if ((r.last || '') > s.last) s.last = r.last; map.set(k, s); };
  for (const r of rows) {
    const pk = phoneKey(r.phone);
    if (pk.length >= 7) add(byPhone, pk, r);
    else if (r.doc && r.doc !== '222222222222') add(byDoc, String(r.doc), r);
  }
  return { byPhone, byDoc };
}

function mapCustomer(c, stats) {
  const s = stats.byPhone.get(phoneKey(c.phone)) || stats.byDoc.get(String(c.document_id || '')) || { n: 0, spent: 0, last: '' };
  return {
    id: c.id, name: c.name, phone: c.phone || '', email: c.email || '',
    documentId: c.document_id && c.document_id !== '222222222222' ? c.document_id : '',
    address: c.address || '', address2: c.address2 || '', neighborhood: c.neighborhood || '',
    totalOrders: s.n, totalSpent: s.spent, totalSpentText: cop(s.spent), lastOrder: s.last || '',
    tag: s.n > 5 ? 'frecuente' : s.n > 0 ? 'habitual' : 'nuevo',
  };
}

router.get('/customers', (req, res) => {
  const db = getDb();
  const stats = purchaseStats(db);
  // El cliente genérico del mostrador no es una persona: el bot no lo ve
  const GENERIC = "lower(trim(name)) = 'consumidor final'";

  if (req.query.phone !== undefined) {
    const k = phoneKey(req.query.phone);
    if (k.length < 7) return res.status(400).json({ success: false, error: 'Número de teléfono inválido.' });
    const found = db.prepare(`SELECT * FROM customers WHERE NOT (${GENERIC})`).all().filter(c => phoneKey(c.phone) === k);
    if (!found.length) return res.json({ success: true, found: false, customer: null });
    return res.json({ success: true, found: true, customer: mapCustomer(found[0], stats) });
  }

  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const page = Math.max(Number(req.query.page) || 1, 1);
  let where = ` WHERE NOT (${GENERIC})`;
  const params = [];
  if (req.query.search) {
    where += ' AND (name LIKE ? OR phone LIKE ? OR document_id LIKE ? OR email LIKE ?)';
    const q = `%${req.query.search}%`; params.push(q, q, q, q);
  }
  const total = db.prepare(`SELECT COUNT(*) AS n FROM customers${where}`).get(...params).n;
  const rows = db.prepare(`SELECT * FROM customers${where} ORDER BY name LIMIT ? OFFSET ?`).all(...params, limit, (page - 1) * limit);
  res.json({ success: true, total, page, limit, pages: Math.ceil(total / limit), customers: rows.map(c => mapCustomer(c, stats)) });
});

// ---------------------------------------------------------------------------
// Pedidos
// POST /api/bot/orders           crea un pedido para llevar o a domicilio y (por defecto) lo manda a cocina
// GET  /api/bot/orders?phone=... pedidos de las últimas 24 horas de ese número, con su estado
// GET  /api/bot/orders/:id       un pedido creado por el bot
// ---------------------------------------------------------------------------
const PAY = { cash: 'cash', efectivo: 'cash', transfer: 'transfer', transferencia: 'transfer', card: 'card', tarjeta: 'card', link: 'card', datafono: 'card' };
const BOT_CHANNELS = ['whatsapp', 'web', 'meta_ads'];
const norm = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const botName = () => String(process.env.BOT_NAME || 'Bot WhatsApp').trim().slice(0, 40) || 'Bot WhatsApp';

function statusText(o) {
  if (o.status === 'cancelled') return 'cancelado';
  if (o.status === 'delivered') return 'entregado';
  if (o.status === 'shipped') return 'en camino';
  if (o.status === 'ready' || o.status === 'billing') return o.type === 'delivery' ? 'listo, esperando al domiciliario' : 'listo para recoger';
  if (o.status === 'preparing') return 'en preparación';
  if (o.status === 'pending') return 'en cocina';
  return 'recibido, sin enviar a cocina';
}

function orderSummary(db, id) {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(id));
  if (!o) return null;
  const items = db.prepare('SELECT name, size, quantity, price, notes, batch FROM order_items WHERE order_id = ? ORDER BY id').all(o.id);
  return {
    id: o.id, type: o.type, channel: o.channel || 'local', status: o.status, statusText: statusText(o),
    customer: { name: o.customer_name, phone: o.customer_phone || '', address: o.customer_address || '', address2: o.customer_address2 || '', neighborhood: o.customer_neighborhood || '' },
    items: items.map(i => ({ name: i.name, size: i.size || '', quantity: i.quantity, price: i.price, priceText: cop(i.price), notes: i.notes || '', sentToKitchen: i.batch != null })),
    subtotal: o.subtotal, deliveryFee: o.delivery_fee || 0, total: o.total, totalText: cop(o.total),
    paymentMethod: o.payment_method, payWith: o.cash_received || 0, prepaid: o.deposit_amount || 0,
    // Transfirió de más: lo que hay que devolverle (lo lleva el domiciliario)
    changeDue: o.payment_status === 'paid' ? (o.change_due || 0) : Math.max(0, (o.deposit_amount || 0) - o.total - (o.tip || 0)),
    paid: o.payment_status === 'paid', notes: o.notes || '', externalId: o.external_ref || '', createdAt: o.created_at,
  };
}

router.post('/orders', (req, res) => {
  const db = getDb();
  const R = require('./restaurant').helpers;
  const b = req.body || {};
  const bad = (error, extra = {}) => res.status(400).json({ success: false, error, ...extra });

  // Reintentos: la misma referencia devuelve el pedido ya creado en vez de duplicarlo
  const ref = String(b.externalId || '').trim().slice(0, 120);
  if (ref) {
    const prev = db.prepare('SELECT id FROM orders WHERE external_ref = ?').get(ref);
    if (prev) return res.json({ success: true, duplicate: true, order: orderSummary(db, prev.id) });
  }
  const type = b.type === 'delivery' || b.type === 'pickup' ? b.type : null;
  if (!type) return bad('type debe ser "delivery" (domicilio) o "pickup" (para llevar)');
  const c = b.customer || {};
  if (!String(c.name || '').trim()) return bad('Falta el nombre del cliente (customer.name)');
  if (phoneKey(c.phone).length < 7) return bad('Falta el teléfono del cliente (customer.phone)');
  if (type === 'delivery') {
    if (!String(c.address || '').trim()) return bad('El domicilio necesita la dirección (customer.address)');
    if (b.deliveryFee === undefined || b.deliveryFee === null || !(Number(b.deliveryFee) >= 0)) return bad('Falta el valor del domicilio (deliveryFee), según la lista de barrios');
  }
  const pay = PAY[norm(b.paymentMethod)];
  if (!pay) return bad('paymentMethod debe ser "cash", "transfer" o "card"');
  if (b.prepaid && pay !== 'transfer') return bad('prepaid solo aplica a pagos por transferencia');
  if (b.prepaidAmount !== undefined && !(Number(b.prepaidAmount) >= 0)) return bad('prepaidAmount debe ser el valor del comprobante, en pesos');
  const channel = BOT_CHANNELS.includes(b.channel) ? b.channel : 'whatsapp';

  // Productos: el precio lo pone el sistema (el del tamaño elegido), no el bot
  if (!Array.isArray(b.items) || !b.items.length) return bad('El pedido no tiene productos (items)');
  if (b.items.length > 60) return bad('Demasiadas líneas en un solo pedido (máximo 60)');
  const lines = [], errors = [], unavailable = [];
  b.items.forEach((it, i) => {
    const p = db.prepare('SELECT id, name, price, available, sizes FROM products WHERE id = ?').get(Number(it && it.productId));
    if (!p) { errors.push(`Línea ${i + 1}: el producto ${it && it.productId} no existe`); return; }
    if (!p.available) { unavailable.push(p.name); return; }
    let sizes = [];
    try { sizes = JSON.parse(p.sizes || 'null') || []; } catch { sizes = []; }
    let price = p.price, size = null;
    if (sizes.length) {
      const s = sizes.find(x => x && norm(x.name) === norm(it.size));
      if (!s) { errors.push(`${p.name}: falta el tamaño (${sizes.map(x => x.name).join(', ')})`); return; }
      price = Math.round(Number(s.price) || 0); size = String(s.name);
    }
    const qty = Math.round(Number(it.quantity ?? 1));
    if (!(qty >= 1 && qty <= 50)) { errors.push(`${p.name}: cantidad inválida`); return; }
    lines.push({ productId: p.id, name: size ? `${p.name} - ${size}` : p.name, size, quantity: qty, price, notes: String(it.notes || '').trim().slice(0, 200) });
  });
  if (unavailable.length) return res.status(409).json({ success: false, code: 'UNAVAILABLE', unavailable, error: `Agotado en este momento: ${unavailable.join(', ')}` });
  if (errors.length) return bad(errors.join(' · '), { errors });

  const user = { name: botName(), id: null };
  let id;
  try {
    id = db.transaction(() => {
      const r = R.createOrder(db, {
        type, channel, paymentMethod: pay, payWith: b.payWith, deliveryFee: type === 'delivery' ? Math.round(Number(b.deliveryFee)) : 0,
        notes: String(b.notes || '').trim().slice(0, 300), label: String(b.label || '').trim().slice(0, 40) || undefined,
        estimatedMinutes: b.estimatedMinutes,
        customer: { name: String(c.name).trim().slice(0, 80), phone: String(c.phone).trim(), address: c.address, address2: c.address2, neighborhood: c.neighborhood, email: c.email, doc: c.doc },
      }, user);
      if (r.error) { const e = new Error(r.error); e.status = r.code === 'CASH_CLOSED' ? 409 : r.status; e.code = r.code; throw e; }
      const ins = db.prepare('INSERT INTO order_items (order_id, product_id, name, size, flavors, quantity, price, notes, seat) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, NULL)');
      for (const l of lines) ins.run(r.id, l.productId, l.name, l.size, l.quantity, l.price, l.notes);
      R.recomputeTotals(db, r.id);
      // Todo pedido del bot queda marcado (si no trae referencia, "bot-<número>")
      db.prepare('UPDATE orders SET external_ref = ? WHERE id = ?').run(ref || `bot-${r.id}`, r.id);
      // Transferencia ya recibida (la confirmó una persona en el grupo): queda como abono y la caja no la vuelve a cobrar
      if (b.prepaid) {
        const total = db.prepare('SELECT total FROM orders WHERE id = ?').get(r.id).total;
        // prepaidAmount = lo que dice el comprobante. Si es más que el total, la diferencia queda como vuelto para el cliente
        const amount = b.prepaidAmount !== undefined ? Math.round(Number(b.prepaidAmount) || 0) : total;
        if (amount > total * 2 + 50000) { const e = new Error(`El comprobante (${cop(amount)}) es mucho mayor que el pedido (${cop(total)}): revisa el valor`); e.status = 400; throw e; }
        db.prepare("UPDATE orders SET deposit_amount = ?, deposit_method = 'transfer', deposit_note = ?, deposit_at = datetime('now', '-5 hours'), deposit_by = ? WHERE id = ?")
          .run(amount, String(b.prepaidNote || 'Transferencia confirmada por WhatsApp').slice(0, 120), user.name, r.id);
      }
      return r.id;
    })();
  } catch (e) {
    if (!e.status) { console.error('Bot: error creando pedido', e); return res.status(500).json({ success: false, error: 'No se pudo crear el pedido' }); }
    return res.status(e.status).json({ success: false, error: e.message, ...(e.code ? { code: e.code } : {}) });
  }

  const io = req.app.io;
  if (io) io.emit('order:new', R.fmt(db, id));
  let sentToKitchen = false, printed = 0, warning;
  if (b.sendToKitchen !== false) {
    try {
      const out = {};
      const batch = R.sendUnsent(db, io, R.getOrder(db, id), user.name, out);
      sentToKitchen = Boolean(batch); printed = out.printed || 0;
      if (io) { io.emit('order:updated', R.fmt(db, id)); if (batch) io.emit('kitchen:new', { orderId: id, batch }); }
    } catch (e) {
      console.error('Bot: el pedido se creó pero no salió a cocina', e);
      warning = 'El pedido quedó creado pero no salió a cocina: la caja debe confirmarlo';
    }
  }
  res.status(201).json({ success: true, duplicate: false, sentToKitchen, printed, ...(warning ? { warning } : {}), order: orderSummary(db, id) });
});

router.get('/orders', (req, res) => {
  const db = getDb();
  const k = phoneKey(req.query.phone);
  if (k.length < 7) return res.status(400).json({ success: false, error: 'Indique el teléfono (?phone=)' });
  const rows = db.prepare("SELECT id, customer_phone FROM orders WHERE created_at >= datetime('now', '-5 hours', '-1 day') AND type IN ('pickup', 'delivery') ORDER BY id DESC").all()
    .filter(o => phoneKey(o.customer_phone) === k);
  res.json({ success: true, orders: rows.map(o => orderSummary(db, o.id)) });
});

router.get('/orders/:id', (req, res) => {
  const db = getDb();
  const o = db.prepare('SELECT id FROM orders WHERE id = ? AND external_ref IS NOT NULL').get(Number(req.params.id));
  if (!o) return res.status(404).json({ success: false, error: 'Pedido no encontrado (solo se consultan los pedidos que creó el bot)' });
  res.json({ success: true, order: orderSummary(db, o.id) });
});

module.exports = router;
