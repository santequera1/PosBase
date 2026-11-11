/**
 * API de solo lectura para el bot de WhatsApp que atiende a los clientes del negocio.
 * - Clave propia: BOT_API_KEY en server/.env (distinta de WHATSAPP_AI_API_KEY, que sí cambia precios y ve ventas).
 *   Sin BOT_API_KEY la API queda apagada: no hay clave por defecto.
 * - La clave va en la cabecera x-api-key o como "Authorization: Bearer ...", nunca en la dirección (queda en los registros).
 * - Solo consulta: menú con precios al público (sin costos ni existencias) y clientes con su historial de compras.
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
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Esta API es solo de consulta.' });
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

module.exports = router;
