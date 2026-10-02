const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const { generateToken, authMiddleware } = require('../auth');
const { resolvePerms, profileOf } = require('../permissions');

const router = Router();

router.post('/login', (req, res) => {
  let { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  }

  username = String(username).trim();
  password = String(password).trim();

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE LOWER(TRIM(username)) = LOWER(?)').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }
  if (user.active === 0) {
    return res.status(401).json({ error: 'Usuario desactivado. Contacta al administrador.' });
  }

  const token = generateToken(user);
  res.json({
    token,
    user: { id: user.id, name: user.name, role: user.role, profile: profileOf(user), perms: resolvePerms(user) },
  });
});

router.post('/change-password', (req, res) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }
  const { JWT_SECRET } = require('../auth');
  const jwt = require('jsonwebtoken');
  let decoded;
  try {
    decoded = jwt.verify(header.slice(7), JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }

  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id);
  if (!user || !bcrypt.compareSync(currentPassword, user.password)) {
    return res.status(400).json({ error: 'Contraseña actual incorrecta' });
  }

  const hashed = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, user.id);
  res.json({ success: true, message: 'Contraseña actualizada con éxito' });
});

// Usuario actual con sus permisos vigentes (se consulta al entrar y al cambiar de sección)
router.get('/me', authMiddleware, (req, res) => res.json({ id: req.user.id, name: req.user.name, role: req.user.role, profile: req.user.profile, perms: req.user.perms }));

module.exports = router;
