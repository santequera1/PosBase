const { Router } = require('express');
const { getDb } = require('../db');
const { requirePerm } = require('../auth');

const router = Router();

router.get('/', (req, res) => {
  const cats = getDb().prepare('SELECT * FROM categories ORDER BY id').all();
  res.json(cats);
});

// La categoría se identifica con un emoji o con una foto (image); si no trae ninguno, queda 🍽️
const cleanImage = v => (v ? String(v).slice(0, 300) : null);

router.post('/', requirePerm('edit_menu'), (req, res) => {
  const { name, color } = req.body;
  const image = cleanImage(req.body.image);
  const emoji = String(req.body.emoji || '').trim() || (image ? '' : '🍽️');
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Escribe el nombre de la categoría' });
  const col = color || '#6B7280';
  const result = getDb().prepare('INSERT INTO categories (name, emoji, color, image) VALUES (?, ?, ?, ?)').run(String(name).trim(), emoji, col, image);
  res.status(201).json({ id: result.lastInsertRowid, name: String(name).trim(), emoji, color: col, image });
});

router.put('/:id', requirePerm('edit_menu'), (req, res) => {
  const { name, emoji, color } = req.body;
  const { id } = req.params;
  if (name !== undefined && !String(name).trim()) return res.status(400).json({ error: 'El nombre no puede estar vacío' });
  getDb().prepare('UPDATE categories SET name = COALESCE(?, name), emoji = COALESCE(?, emoji), color = COALESCE(?, color) WHERE id = ?')
    .run(name, emoji, color, id);
  // image: se cambia solo si viene en la petición (null o vacío = quitar la foto)
  if (Object.prototype.hasOwnProperty.call(req.body, 'image')) getDb().prepare('UPDATE categories SET image = ? WHERE id = ?').run(cleanImage(req.body.image), id);
  const cat = getDb().prepare('SELECT * FROM categories WHERE id = ?').get(id);
  res.json(cat);
});

router.delete('/:id', requirePerm('edit_menu'), (req, res) => {
  const db = getDb();
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM products WHERE category_id = ?').get(req.params.id);
  if (n > 0) return res.status(409).json({ error: `La categoría tiene ${n} producto(s). Muévelos a otra categoría antes de eliminarla.` });
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
