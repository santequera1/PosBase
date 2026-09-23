const { Router } = require('express');
const { getDb } = require('../db');
const { requireRole } = require('../auth');

const router = Router();

router.get('/', (req, res) => {
  const { category, search } = req.query;
  let sql = 'SELECT id, name, category_id AS categoryId, price, available, image, description, sizes, color_bg, color_accent FROM products WHERE 1=1';
  const params = [];

  if (category) {
    sql += ' AND category_id = ?';
    params.push(category);
  }
  if (search) {
    sql += ' AND name LIKE ?';
    params.push(`%${search}%`);
  }
  sql += ' ORDER BY category_id, id';

  const rows = getDb().prepare(sql).all(...params);
  res.json(rows.map(r => ({
    ...r,
    available: !!r.available,
    sizes: r.sizes ? JSON.parse(r.sizes) : null,
  })));
});

router.post('/', requireRole('admin', 'cashier'), (req, res) => {
  const { name, categoryId, price, available = true, image = null, description = null, sizes = null } = req.body;
  if (!name || !categoryId || price == null) {
    return res.status(400).json({ error: 'Campos requeridos: name, categoryId, price' });
  }
  const sizesJson = sizes ? JSON.stringify(sizes) : null;
  const result = getDb().prepare(
    'INSERT INTO products (name, category_id, price, available, image, description, sizes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(name, categoryId, price, available ? 1 : 0, image, description, sizesJson);

  res.status(201).json({ id: result.lastInsertRowid, name, categoryId, price, available, image, description, sizes });
});

router.put('/:id', requireRole('admin', 'cashier'), (req, res) => {
  const { name, categoryId, price, available, image, description, sizes } = req.body;
  const db = getDb();
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
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
      sizes = COALESCE(?, sizes)
    WHERE id = ?
  `).run(name, categoryId, price, available != null ? (available ? 1 : 0) : null, image, description, sizesJson !== undefined ? sizesJson : null, req.params.id);

  const updated = db.prepare('SELECT id, name, category_id AS categoryId, price, available, image, description, sizes, color_bg, color_accent FROM products WHERE id = ?').get(req.params.id);
  res.json({ ...updated, available: !!updated.available, sizes: updated.sizes ? JSON.parse(updated.sizes) : null });
});

router.patch('/:id/availability', requireRole('admin', 'cashier'), (req, res) => {
  const db = getDb();
  db.prepare('UPDATE products SET available = NOT available WHERE id = ?').run(req.params.id);
  const product = db.prepare('SELECT id, name, category_id AS categoryId, price, available, image, description, sizes, color_bg, color_accent FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json({ ...product, available: !!product.available, sizes: product.sizes ? JSON.parse(product.sizes) : null });
});

router.delete('/:id', requireRole('admin', 'cashier'), (req, res) => {
  const db = getDb();
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
