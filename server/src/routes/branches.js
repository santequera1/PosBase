/** /api/branches — sedes del negocio. Todos los usuarios ven la lista (para cambiar de sede); solo el administrador la edita. */
const { Router } = require('express');
const { getDb } = require('../db');
const { requireRole } = require('../auth');
const { listBranches, mapBranch, invalidateCache } = require('../branches');

const router = Router();
const ADMIN = requireRole('admin');

router.get('/', (req, res) => {
  const db = getDb();
  const all = req.query.all === '1' && req.user?.role === 'admin';
  const rows = listBranches(db, all);
  const cats = db.prepare('SELECT id, name, branch_id AS branchId FROM categories ORDER BY id').all();
  res.json({ branches: rows, current: req.branchId, categories: cats });
});

function payload(b, cur = {}) {
  return {
    name: b.name !== undefined ? String(b.name).trim().slice(0, 60) : cur.name,
    address: b.address !== undefined ? String(b.address).trim().slice(0, 160) : (cur.address || ''),
    phone: b.phone !== undefined ? String(b.phone).trim().slice(0, 40) : (cur.phone || ''),
    invoicePrefix: b.invoicePrefix !== undefined ? String(b.invoicePrefix).trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) : (cur.invoicePrefix || ''),
    color: b.color !== undefined ? String(b.color).trim().slice(0, 20) : (cur.color || ''),
    active: b.active !== undefined ? Boolean(b.active) : (cur.active === undefined ? true : cur.active),
  };
}

router.post('/', ADMIN, (req, res) => {
  const db = getDb();
  const p = payload(req.body || {});
  if (!p.name || p.name.length < 2) return res.status(400).json({ error: 'Ponle un nombre a la sede (ej. Heladería)' });
  const max = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM branches').get().m;
  const info = db.prepare('INSERT INTO branches (name, address, phone, invoice_prefix, color, active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(p.name, p.address, p.phone, p.invoicePrefix, p.color, p.active ? 1 : 0, max + 1);
  const id = Number(info.lastInsertRowid);
  invalidateCache();
  // Cada sede nueva arranca con su salón para las mesas
  db.prepare("INSERT INTO rooms (name, sort_order, branch_id) VALUES ('Salón', ?, ?)").run((db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM rooms').get().m || 0) + 1, id);
  res.status(201).json(mapBranch(db.prepare('SELECT * FROM branches WHERE id = ?').get(id)));
});

router.put('/:id', ADMIN, (req, res) => {
  const db = getDb();
  const curRow = db.prepare('SELECT * FROM branches WHERE id = ?').get(Number(req.params.id));
  if (!curRow) return res.status(404).json({ error: 'Sede no encontrada' });
  const p = payload(req.body || {}, mapBranch(curRow));
  if (!p.name || p.name.length < 2) return res.status(400).json({ error: 'Ponle un nombre a la sede' });
  if (!p.active && db.prepare('SELECT COUNT(*) AS c FROM branches WHERE active = 1 AND id != ?').get(curRow.id).c === 0) return res.status(400).json({ error: 'Debe quedar al menos una sede activa' });
  if (!p.active && db.prepare("SELECT id FROM cash_shifts WHERE status = 'open' AND COALESCE(branch_id, 1) = ?").get(curRow.id)) return res.status(400).json({ error: 'Esa sede tiene la caja abierta: ciérrala antes de desactivarla' });
  db.prepare('UPDATE branches SET name = ?, address = ?, phone = ?, invoice_prefix = ?, color = ?, active = ? WHERE id = ?')
    .run(p.name, p.address, p.phone, p.invoicePrefix, p.color, p.active ? 1 : 0, curRow.id);
  invalidateCache();
  res.json(mapBranch(db.prepare('SELECT * FROM branches WHERE id = ?').get(curRow.id)));
});

// Sede de origen de cada categoría (para ordenar el catálogo e informes por sede): { categoryId: branchId | null }
router.put('/categories/assign', ADMIN, (req, res) => {
  const db = getDb();
  const map = req.body && typeof req.body.assign === 'object' ? req.body.assign : {};
  const upd = db.prepare('UPDATE categories SET branch_id = ? WHERE id = ?');
  for (const [cid, bid] of Object.entries(map)) upd.run(bid === null || bid === '' ? null : Number(bid), Number(cid));
  res.json({ success: true, categories: db.prepare('SELECT id, name, branch_id AS branchId FROM categories ORDER BY id').all() });
});

module.exports = router;
