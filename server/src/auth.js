const jwt = require('jsonwebtoken');
const { resolvePerms, profileOf, hasView, hasAction } = require('./permissions');

const JWT_SECRET = process.env.JWT_SECRET || 'fritop-secret-key-2026';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, name: user.name, role: user.role, profile: profileOf(user), perms: resolvePerms(user) },
    JWT_SECRET,
    { expiresIn: process.env.SESSION_TTL || '7d' }
  );
}

/** Verifica el token y refresca rol, estado y permisos desde la base: un cambio de permisos aplica de inmediato sin volver a entrar. */
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
  try {
    const { getDb } = require('./db');
    const row = getDb().prepare('SELECT id, username, name, role, COALESCE(active, 1) AS active, profile, permissions FROM users WHERE id = ?').get(req.user.id);
    if (row) {
      if (row.active === 0) return res.status(401).json({ error: 'Usuario desactivado. Contacta al administrador.' });
      req.user = { ...req.user, name: row.name, role: row.role, profile: profileOf(row), perms: resolvePerms(row) };
    } else if (!req.user.perms) {
      req.user.perms = resolvePerms(req.user);
    }
  } catch { /* si la base no responde se usan los datos del token */ }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'No tienes permiso para esta acción' });
    }
    next();
  };
}

/** Exige una vista (sección) o una acción del catálogo de permisos. El administrador siempre pasa. */
function requirePerm(key) {
  return (req, res, next) => {
    if (hasView(req.user, key) || hasAction(req.user, key)) return next();
    return res.status(403).json({ error: 'No tienes permiso para esta sección o acción. Pídele acceso al administrador.', permission: key });
  };
}

module.exports = { generateToken, authMiddleware, requireRole, requirePerm, hasView, hasAction, JWT_SECRET };
