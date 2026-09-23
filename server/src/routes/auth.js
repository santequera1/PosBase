const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const { generateToken } = require('../auth');

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

  const token = generateToken(user);
  res.json({
    token,
    user: { name: user.name, role: user.role },
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

module.exports = router;
