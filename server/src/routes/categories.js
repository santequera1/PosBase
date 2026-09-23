const { Router } = require('express');
const { getDb } = require('../db');
const { requireRole } = require('../auth');

const router = Router();

router.get('/', (req, res) => {
  const cats = getDb().prepare('SELECT * FROM categories ORDER BY id').all();
  res.json(cats);
});

router.post('/', requireRole('admin'), (req, res) => {
  const { name, emoji, color } = req.body;
  if (!name || !emoji || !color) return res.status(400).json({ error: 'Campos requeridos: name, emoji, color' });
  const result = getDb().prepare('INSERT INTO categories (name, emoji, color) VALUES (?, ?, ?)').run(name, emoji, color);
  res.status(201).json({ id: result.lastInsertRowid, name, emoji, color });
});

router.put('/:id', requireRole('admin'), (req, res) => {
  const { name, emoji, color } = req.body;
  const { id } = req.params;
  getDb().prepare('UPDATE categories SET name = COALESCE(?, name), emoji = COALESCE(?, emoji), color = COALESCE(?, color) WHERE id = ?')
    .run(name, emoji, color, id);
  const cat = getDb().prepare('SELECT * FROM categories WHERE id = ?').get(id);
  res.json(cat);
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  getDb().prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
