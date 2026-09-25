const { Router } = require('express');
const { getDb } = require('../db');
const { requireRole } = require('../auth');
const { PRODUCT_SELECT, mapProduct, getProduct, emitProduct, adjustStock } = require('../stock');
const { STATIONS } = require('../restaurantSchema');

const router = Router();
const STAFF = requireRole('admin', 'cashier');

router.get('/', (req, res) => {
  const { category, search } = req.query;
  let sql = `${PRODUCT_SELECT} WHERE 1=1`;
  const params = [];
  if (category) { sql += ' AND category_id = ?'; params.push(category); }
  if (search) { sql += ' AND name LIKE ?'; params.push(`%${search}%`); }
  sql += ' ORDER BY category_id, id';
  res.json(getDb().prepare(sql).all(...params).map(mapProduct));
});

// Productos con control de stock en o por debajo del mínimo (o agotados)
router.get('/low-stock', STAFF, (req, res) => {
  const rows = getDb().prepare(`${PRODUCT_SELECT} WHERE COALESCE(track_stock, 0) = 1 AND COALESCE(stock, 0) <= COALESCE(min_stock, 0) ORDER BY stock, name`).all();
  res.json(rows.map(mapProduct));
});

router.post('/', STAFF, (req, res) => {
  const { name, categoryId, price, available = true, image = null, description = null, sizes = null, trackStock = false, stock = 0, minStock = 0 } = req.body;
  if (!name || !categoryId || price == null) {
    return res.status(400).json({ error: 'Campos requeridos: name, categoryId, price' });
  }
  const db = getDb();
  const sizesJson = sizes ? JSON.stringify(sizes) : null;
  const ts = trackStock ? 1 : 0;
  const st = ts ? Math.max(0, Math.round(Number(stock) || 0)) : 0;
  const ms = ts ? Math.max(0, Math.round(Number(minStock) || 0)) : 0;
  const avail = ts && st <= 0 ? 0 : (available ? 1 : 0);
  const result = db.prepare(
    'INSERT INTO products (name, category_id, price, available, image, description, sizes, track_stock, stock, min_stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(name, categoryId, price, avail, image, description, sizesJson, ts, st, ms);
  if (ts && st > 0) {
    db.prepare("INSERT INTO stock_movements (product_id, delta, stock_after, reason, user_name) VALUES (?, ?, ?, 'inventario', ?)").run(result.lastInsertRowid, st, st, req.user?.name || '');
  }
  if (STATIONS.includes(req.body.station)) db.prepare('UPDATE products SET station = ? WHERE id = ?').run(req.body.station, result.lastInsertRowid);
  const product = getProduct(db, result.lastInsertRowid);
  emitProduct(req.app.io, product);
  res.status(201).json(product);
});

router.put('/:id', STAFF, (req, res) => {
  const { name, categoryId, price, available, image, description, sizes, trackStock, stock, minStock } = req.body;
  const db = getDb();
  const existing = db.prepare('SELECT *, COALESCE(track_stock, 0) AS ts, COALESCE(stock, 0) AS st FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Producto no encontrado' });

  const sizesJson = sizes !== undefined ? (sizes ? JSON.stringify(sizes) : null) : undefined;
  db.prepare(`
    UPDATE products SET
      name = COALESCE(?, name),
      category_id = COALESCE(?, category_id),
      price = COALESCE(?, price),
      available = COALESCE(?, available),
      image = COALESCE(?, image),
      description = COALESCE(?, description),
      sizes = COALESCE(?, sizes),
      track_stock = COALESCE(?, track_stock),
      min_stock = COALESCE(?, min_stock)
    WHERE id = ?
  `).run(name, categoryId, price, available != null ? (available ? 1 : 0) : null, image, description, sizesJson !== undefined ? sizesJson : null,
    trackStock !== undefined ? (trackStock ? 1 : 0) : null, minStock !== undefined ? Math.max(0, Math.round(Number(minStock) || 0)) : null, req.params.id);

  if (STATIONS.includes(req.body.station)) db.prepare('UPDATE products SET station = ? WHERE id = ?').run(req.body.station, req.params.id);
  // Cambio de stock desde el formulario: se registra como ajuste de inventario
  const nowTracking = trackStock !== undefined ? Boolean(trackStock) : Boolean(existing.ts);
  if (nowTracking && stock !== undefined && stock !== null && stock !== '') {
    const target = Math.max(0, Math.round(Number(stock) || 0));
    if (target !== existing.st) {
      db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(target, req.params.id);
      db.prepare("INSERT INTO stock_movements (product_id, delta, stock_after, reason, user_name) VALUES (?, ?, ?, 'inventario', ?)").run(req.params.id, target - existing.st, target, req.user?.name || '');
    }
    if (target <= 0) db.prepare('UPDATE products SET available = 0 WHERE id = ?').run(req.params.id);
    else if (existing.st <= 0 && available == null) db.prepare('UPDATE products SET available = 1 WHERE id = ?').run(req.params.id);
  }

  const product = getProduct(db, req.params.id);
  emitProduct(req.app.io, product);
  res.json(product);
});

router.patch('/:id/availability', STAFF, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE products SET available = NOT available WHERE id = ?').run(req.params.id);
  const product = getProduct(db, req.params.id);
  if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
  emitProduct(req.app.io, product);
  res.json(product);
});

// Ajuste de inventario: { delta: +5 | -2 } o { set: 12 }, con motivo (compra, merma, correccion, inventario)
router.post('/:id/stock', STAFF, (req, res) => {
  const db = getDb();
  const reason = ['compra', 'merma', 'correccion', 'inventario', 'ajuste'].includes(req.body.reason) ? req.body.reason : 'ajuste';
  const r = adjustStock(db, req.app.io, Number(req.params.id), { delta: req.body.delta, set: req.body.set }, reason, req.user?.name);
  if (r.error) return res.status(r.status || 400).json({ error: r.error });
  res.json(r);
});

router.get('/:id/movements', STAFF, (req, res) => {
  const rows = getDb().prepare(`SELECT id, product_id AS productId, delta, stock_after AS stockAfter, reason, order_id AS orderId, user_name AS userName, created_at AS createdAt
    FROM stock_movements WHERE product_id = ? ORDER BY id DESC LIMIT 100`).all(Number(req.params.id));
  res.json(rows);
});

router.delete('/:id', STAFF, (req, res) => {
  const db = getDb();
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
  db.prepare('DELETE FROM stock_movements WHERE product_id = ?').run(req.params.id);
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
