const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const { requireRole } = require('../auth');

const router = Router();

const ROLES = ['admin', 'cashier', 'kitchen'];
const SELECT = 'SELECT id, username, name, role, COALESCE(active, 1) AS active FROM users';

function validUsername(u) {
  return /^[a-z0-9._-]{3,30}$/.test(u);
}

// GET /api/users
router.get('/', requireRole('admin'), (req, res) => {
  const rows = getDb().prepare(`${SELECT} ORDER BY id`).all();
  res.json(rows.map(r => ({ ...r, active: Boolean(r.active) })));
});

// POST /api/users  { username, name, role, password }
router.post('/', requireRole('admin'), (req, res) => {
  const db = getDb();
  const username = String(req.body.username || '').trim().toLowerCase();
  const name = String(req.body.name || '').trim();
  const role = String(req.body.role || 'cashier');
  const password = String(req.body.password || '');

  if (!validUsername(username)) return res.status(400).json({ error: 'Usuario inválido: 3 a 30 caracteres, solo letras minúsculas, números, punto, guion o guion bajo' });
  if (name.length < 2) return res.status(400).json({ error: 'El nombre es requerido' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Rol inválido' });
  if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  if (db.prepare('SELECT id FROM users WHERE LOWER(username) = ?').get(username)) {
    return res.status(409).json({ error: 'Ese nombre de usuario ya existe' });
  }

  const info = db.prepare('INSERT INTO users (username, password, name, role, active) VALUES (?, ?, ?, ?, 1)')
    .run(username, bcrypt.hashSync(password, 10), name, role);
  const created = db.prepare(`${SELECT} WHERE id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ ...created, active: true });
});

// PUT /api/users/:id  { name?, role?, active?, password? }
router.put('/:id', requireRole('admin'), (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const current = db.prepare(`${SELECT} WHERE id = ?`).get(id);
  if (!current) return res.status(404).json({ error: 'Usuario no encontrado' });

  const isSelf = req.user && req.user.id === id;
  const name = req.body.name !== undefined ? String(req.body.name).trim() : current.name;
  const role = req.body.role !== undefined ? String(req.body.role) : current.role;
  const active = req.body.active !== undefined ? (req.body.active ? 1 : 0) : current.active;
  const password = req.body.password !== undefined && req.body.password !== '' ? String(req.body.password) : null;

  if (name.length < 2) return res.status(400).json({ error: 'El nombre es requerido' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Rol inválido' });
  if (password !== null && password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  if (isSelf && (role !== 'admin' || !active)) {
    return res.status(400).json({ error: 'No puedes quitarte el rol de administrador ni desactivar tu propio usuario' });
  }
  if (current.role === 'admin' && (role !== 'admin' || !active)) {
    const admins = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND COALESCE(active, 1) = 1 AND id != ?").get(id).c;
    if (admins === 0) return res.status(400).json({ error: 'Debe quedar al menos un administrador activo' });
  }

  if (password !== null) {
    db.prepare('UPDATE users SET name = ?, role = ?, active = ?, password = ? WHERE id = ?').run(name, role, active, bcrypt.hashSync(password, 10), id);
  } else {
    db.prepare('UPDATE users SET name = ?, role = ?, active = ? WHERE id = ?').run(name, role, active, id);
  }
  const updated = db.prepare(`${SELECT} WHERE id = ?`).get(id);
  res.json({ ...updated, active: Boolean(updated.active) });
});

// DELETE /api/users/:id  (si tiene historial de caja asociado, se desactiva en lugar de borrarse)
router.delete('/:id', requireRole('admin'), (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const current = db.prepare(`${SELECT} WHERE id = ?`).get(id);
  if (!current) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (req.user && req.user.id === id) return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
  if (current.role === 'admin') {
    const admins = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND COALESCE(active, 1) = 1 AND id != ?").get(id).c;
    if (admins === 0) return res.status(400).json({ error: 'Debe quedar al menos un administrador activo' });
  }

  const hasShifts = db.prepare('SELECT COUNT(*) AS c FROM cash_shifts WHERE user_id = ?').get(id).c > 0;
  if (hasShifts) {
    db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(id);
    return res.json({ success: true, deactivated: true, message: 'El usuario tiene turnos de caja registrados; se desactivó en lugar de eliminarse' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ success: true, deleted: true });
});

module.exports = router;
