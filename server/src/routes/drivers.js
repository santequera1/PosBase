const { Router } = require('express');
const { getDb } = require('../db');

const router = Router();

router.get('/', (req, res) => {
  const rows = getDb().prepare('SELECT id, name, phone, available FROM drivers ORDER BY name').all();
  res.json(rows.map(r => ({ ...r, available: !!r.available })));
});

router.post('/', (req, res) => {
  const { name, phone, available = true } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'Campos requeridos: name, phone' });
  const result = getDb().prepare('INSERT INTO drivers (name, phone, available) VALUES (?, ?, ?)').run(name, phone, available ? 1 : 0);
  res.status(201).json({ id: result.lastInsertRowid, name, phone, available });
});

router.put('/:id', (req, res) => {
  const { name, phone, available } = req.body;
  const db = getDb();
  db.prepare(`
    UPDATE drivers SET
      name = COALESCE(?, name),
      phone = COALESCE(?, phone),
      available = COALESCE(?, available)
    WHERE id = ?
  `).run(name, phone, available != null ? (available ? 1 : 0) : null, req.params.id);
  const updated = db.prepare('SELECT id, name, phone, available FROM drivers WHERE id = ?').get(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Domiciliario no encontrado' });
  res.json({ ...updated, available: !!updated.available });
});

router.delete('/:id', (req, res) => {
  getDb().prepare('DELETE FROM drivers WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
