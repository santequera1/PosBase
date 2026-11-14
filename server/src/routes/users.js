const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const { requireRole } = require('../auth');
const { VIEWS, ACTIONS, PROFILES, resolvePerms, normalizeUserPerms, profileOf, ensureCourierEmployee } = require('../permissions');

const router = Router();

const SELECT = 'SELECT id, username, name, role, COALESCE(active, 1) AS active, profile, permissions FROM users';

function validUsername(u) {
  return /^[a-z0-9._-]{3,30}$/.test(u);
}
function mapUser(r) {
  return { id: r.id, username: r.username, name: r.name, role: r.role, active: Boolean(r.active), profile: profileOf(r), perms: resolvePerms(r) };
}
/** Usuario con su ficha de Personal (con ella ve "Mi cuenta": su nómina, festivos, novedades y comprobantes). */
function withEmployee(db, r) {
  let e = null;
  try { e = db.prepare('SELECT id, name FROM employees WHERE user_id = ? AND active = 1 ORDER BY id LIMIT 1').get(r.id) || null; } catch { /* sin módulo de personal */ }
  return { ...mapUser(r), employee: e };
}
const POSITION_BY_PROFILE = { admin: 'Administrador', cashier: 'Cajero', waiter: 'Mesero', kitchen: 'Cocina', courier: 'Domiciliario', custom: 'Otro' };
/**
 * Vincula el usuario con su ficha de Personal. `link`: 'auto' (la ficha con el mismo nombre sin usuario, o una nueva),
 * 'new' (ficha nueva), 'none' (sin ficha) o el id de una ficha. Sin `link` no cambia nada.
 */
function linkEmployee(db, userId, link) {
  if (link === undefined || link === null || link === '') return null;
  const u = db.prepare('SELECT id, name, role, profile FROM users WHERE id = ?').get(userId);
  if (!u) return null;
  const create = () => Number(db.prepare("INSERT INTO employees (user_id, name, position, pay_mode, base_amount, active, notes) VALUES (?, ?, ?, 'monthly', 0, 1, 'Creado con su usuario: falta poner su sueldo y modalidad de pago')")
    .run(u.id, u.name, POSITION_BY_PROFILE[profileOf(u)] || 'Otro').lastInsertRowid);
  if (link === 'none') { db.prepare('UPDATE employees SET user_id = NULL WHERE user_id = ?').run(u.id); return null; }
  if (link === 'new') { db.prepare('UPDATE employees SET user_id = NULL WHERE user_id = ?').run(u.id); return create(); }
  if (link === 'auto') {
    const mine = db.prepare('SELECT id FROM employees WHERE user_id = ? AND active = 1 LIMIT 1').get(u.id);
    if (mine) return mine.id;
    const same = db.prepare('SELECT id FROM employees WHERE user_id IS NULL AND active = 1 AND LOWER(TRIM(name)) = LOWER(TRIM(?)) ORDER BY id DESC LIMIT 1').get(u.name);
    if (same) { db.prepare('UPDATE employees SET user_id = ? WHERE id = ?').run(u.id, same.id); return same.id; }
    return create();
  }
  const id = Number(link);
  const emp = Number.isInteger(id) && id > 0 ? db.prepare('SELECT id, user_id AS userId FROM employees WHERE id = ?').get(id) : null;
  if (!emp) throw new Error('No se encontró esa ficha en Personal');
  if (emp.userId && emp.userId !== u.id) throw new Error('Esa ficha ya está vinculada a otro usuario');
  db.prepare('UPDATE employees SET user_id = NULL WHERE user_id = ? AND id != ?').run(u.id, emp.id);
  db.prepare('UPDATE employees SET user_id = ?, active = 1 WHERE id = ?').run(u.id, emp.id);
  return emp.id;
}

// GET /api/users/catalog  → vistas, acciones y plantillas disponibles (para el formulario)
router.get('/catalog', requireRole('admin'), (req, res) => {
  res.json({ views: VIEWS, actions: ACTIONS, profiles: Object.entries(PROFILES).map(([key, p]) => ({ key, label: p.label, views: p.views, actions: p.actions })) });
});

// GET /api/users
router.get('/', requireRole('admin'), (req, res) => {
  const db = getDb();
  // Con su ficha de Personal vinculada el usuario ve "Mi cuenta" (su nómina, festivos, consumos y comprobantes)
  res.json(db.prepare(`${SELECT} ORDER BY id`).all().map(r => withEmployee(db, r)));
});

// POST /api/users  { username, name, password, profile, permissions? }
router.post('/', requireRole('admin'), (req, res) => {
  const db = getDb();
  const username = String(req.body.username || '').trim().toLowerCase();
  const name = String(req.body.name || '').trim();
  const password = String(req.body.password || '');
  // Compatibilidad: si solo llega role, se traduce a perfil
  const body = { ...req.body };
  if (body.profile === undefined && body.role) body.profile = body.role === 'admin' ? 'admin' : body.role === 'kitchen' ? 'kitchen' : 'cashier';
  const { role, profile, permissions } = normalizeUserPerms(body);

  if (!validUsername(username)) return res.status(400).json({ error: 'Usuario inválido: 3 a 30 caracteres, solo letras minúsculas, números, punto, guion o guion bajo' });
  if (name.length < 2) return res.status(400).json({ error: 'El nombre es requerido' });
  if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  if (db.prepare('SELECT id FROM users WHERE LOWER(username) = ?').get(username)) {
    return res.status(409).json({ error: 'Ese nombre de usuario ya existe' });
  }

  if (req.body.employeeLink !== undefined && !['auto', 'new', 'none', ''].includes(String(req.body.employeeLink))) {
    const e = db.prepare('SELECT user_id AS userId FROM employees WHERE id = ?').get(Number(req.body.employeeLink));
    if (!e) return res.status(400).json({ error: 'No se encontró esa ficha en Personal' });
    if (e.userId) return res.status(400).json({ error: 'Esa ficha ya está vinculada a otro usuario' });
  }
  const info = db.prepare('INSERT INTO users (username, password, name, role, active, profile, permissions) VALUES (?, ?, ?, ?, 1, ?, ?)')
    .run(username, bcrypt.hashSync(password, 10), name, role, profile, permissions);
  const newId = Number(info.lastInsertRowid);
  // Ficha de Personal: así el usuario ve "Mi cuenta" (su nómina) desde el primer día
  try { linkEmployee(db, newId, req.body.employeeLink === undefined ? undefined : String(req.body.employeeLink)); } catch { /* validado arriba */ }
  ensureCourierEmployee(db, newId);
  if (req.app && req.app.io) req.app.io.emit('staff:updated', {});
  res.status(201).json(withEmployee(db, db.prepare(`${SELECT} WHERE id = ?`).get(newId)));
});

// PUT /api/users/:id  { name?, profile?, permissions?, active?, password? }
router.put('/:id', requireRole('admin'), (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const current = db.prepare(`${SELECT} WHERE id = ?`).get(id);
  if (!current) return res.status(404).json({ error: 'Usuario no encontrado' });

  const isSelf = req.user && req.user.id === id;
  const name = req.body.name !== undefined ? String(req.body.name).trim() : current.name;
  const body = { ...req.body };
  if (body.profile === undefined && body.role) body.profile = body.role === 'admin' ? 'admin' : body.role === 'kitchen' ? 'kitchen' : 'cashier';
  const { role, profile, permissions } = (body.profile !== undefined || body.permissions !== undefined) ? normalizeUserPerms(body, current) : { role: current.role, profile: current.profile, permissions: current.permissions };
  const active = req.body.active !== undefined ? (req.body.active ? 1 : 0) : current.active;
  const password = req.body.password !== undefined && req.body.password !== '' ? String(req.body.password) : null;

  if (name.length < 2) return res.status(400).json({ error: 'El nombre es requerido' });
  if (password !== null && password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  if (isSelf && (role !== 'admin' || !active)) {
    return res.status(400).json({ error: 'No puedes quitarte el perfil de administrador ni desactivar tu propio usuario' });
  }
  if (current.role === 'admin' && (role !== 'admin' || !active)) {
    const admins = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND COALESCE(active, 1) = 1 AND id != ?").get(id).c;
    if (admins === 0) return res.status(400).json({ error: 'Debe quedar al menos un administrador activo' });
  }

  try {
    db.transaction(() => {
      if (password !== null) {
        db.prepare('UPDATE users SET name = ?, role = ?, active = ?, profile = ?, permissions = ?, password = ? WHERE id = ?').run(name, role, active, profile, permissions, bcrypt.hashSync(password, 10), id);
      } else {
        db.prepare('UPDATE users SET name = ?, role = ?, active = ?, profile = ?, permissions = ? WHERE id = ?').run(name, role, active, profile, permissions, id);
      }
      linkEmployee(db, id, req.body.employeeLink === undefined ? undefined : String(req.body.employeeLink));
    })();
  } catch (e) { return res.status(400).json({ error: e.message }); }
  ensureCourierEmployee(db, id);
  if (req.body.employeeLink !== undefined && req.app && req.app.io) req.app.io.emit('staff:updated', {});
  res.json(withEmployee(db, db.prepare(`${SELECT} WHERE id = ?`).get(id)));
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
  // El colaborador vinculado (p. ej. repartidor) se conserva en Personal con su historial; solo se desvincula del usuario
  db.prepare('UPDATE employees SET user_id = NULL WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ success: true, deleted: true });
});

module.exports = router;
