/**
 * Permisos por usuario: vistas (secciones del menú) y acciones.
 * El rol técnico (admin / cashier / kitchen) se mantiene; el administrador siempre tiene todo.
 * Los demás usuarios llevan un perfil (plantilla) y, si se personalizan, una lista propia de vistas y acciones.
 */
const VIEWS = [
  { key: 'pos', label: 'Punto de venta', group: 'Ventas' },
  { key: 'tables', label: 'Mesas', group: 'Ventas' },
  { key: 'counter', label: 'Para llevar', group: 'Ventas' },
  { key: 'delivery', label: 'Domicilios', group: 'Ventas' },
  { key: 'kitchen', label: 'Cocina (monitor)', group: 'Ventas' },
  { key: 'courier', label: 'Mis domicilios (repartidor)', group: 'Ventas' },
  { key: 'shift', label: 'Cierre de caja', group: 'Caja y pedidos' },
  { key: 'orders', label: 'Historial de pedidos', group: 'Caja y pedidos' },
  { key: 'reports', label: 'Ventas e ingresos', group: 'Caja y pedidos' },
  { key: 'menu', label: 'Menú', group: 'Catálogo y clientes' },
  { key: 'customers', label: 'Clientes y F.E.', group: 'Catálogo y clientes' },
  { key: 'finance', label: 'Finanzas', group: 'Administración' },
  { key: 'staff', label: 'Personal y nómina', group: 'Administración' },
  { key: 'settings', label: 'Configuración', group: 'Administración' },
];
const ACTIONS = [
  { key: 'cancel_orders', label: 'Anular pedidos y cuentas' },
  { key: 'discounts', label: 'Aplicar descuentos' },
  { key: 'edit_menu', label: 'Crear y editar productos y precios' },
  { key: 'cash_withdrawals', label: 'Registrar retiros de caja' },
  { key: 'manage_printers', label: 'Configurar impresoras' },
];
const VIEW_KEYS = VIEWS.map(v => v.key);
const ACTION_KEYS = ACTIONS.map(a => a.key);

/** Plantillas: perfil → rol técnico + vistas y acciones por defecto. */
const PROFILES = {
  admin: { label: 'Administrador', role: 'admin', views: VIEW_KEYS, actions: ACTION_KEYS },
  cashier: { label: 'Cajero', role: 'cashier', views: ['pos', 'tables', 'counter', 'delivery', 'kitchen', 'shift', 'orders', 'reports', 'menu', 'customers', 'finance', 'settings'], actions: ['cancel_orders', 'discounts', 'edit_menu', 'cash_withdrawals'] },
  waiter: { label: 'Mesero', role: 'cashier', views: ['tables', 'counter', 'delivery', 'kitchen', 'orders'], actions: [] },
  kitchen: { label: 'Cocina', role: 'kitchen', views: ['kitchen'], actions: [] },
  courier: { label: 'Domiciliario', role: 'cashier', views: ['courier'], actions: [] },
  custom: { label: 'Personalizado', role: 'cashier', views: [], actions: [] },
};
const PROFILE_KEYS = Object.keys(PROFILES);

function profileOf(row) {
  if (row.role === 'admin') return 'admin';
  if (row.profile && PROFILES[row.profile] && row.profile !== 'admin') return row.profile;
  return row.role === 'kitchen' ? 'kitchen' : 'cashier';
}

/** Resuelve las vistas y acciones efectivas de un usuario (fila de la tabla users o payload del token). */
function resolvePerms(row) {
  if (!row) return { views: [], actions: [] };
  if (row.role === 'admin') return { views: [...VIEW_KEYS], actions: [...ACTION_KEYS] };
  const profile = profileOf(row);
  if (profile === 'custom' || row.permissions) {
    try {
      const p = typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions;
      if (p && (Array.isArray(p.views) || Array.isArray(p.actions))) {
        return { views: (p.views || []).filter(v => VIEW_KEYS.includes(v)), actions: (p.actions || []).filter(a => ACTION_KEYS.includes(a)) };
      }
    } catch { /* se usa la plantilla */ }
  }
  const t = PROFILES[profile];
  return { views: [...t.views], actions: [...t.actions] };
}

/** Normaliza el perfil y los permisos que llegan del formulario de usuarios. Devuelve { role, profile, permissions (JSON o null) }. */
function normalizeUserPerms(body, current = {}) {
  let profile = body.profile !== undefined ? String(body.profile) : (current.profile || profileOf(current));
  if (!PROFILE_KEYS.includes(profile)) profile = 'cashier';
  const role = PROFILES[profile].role;
  let permissions = null;
  if (profile === 'custom') {
    const p = body.permissions && typeof body.permissions === 'object' ? body.permissions : (current.permissions ? JSON.parse(current.permissions) : { views: [], actions: [] });
    permissions = JSON.stringify({ views: (p.views || []).filter(v => VIEW_KEYS.includes(v)), actions: (p.actions || []).filter(a => ACTION_KEYS.includes(a)) });
  }
  return { role, profile, permissions };
}

/**
 * Un usuario repartidor (vista "courier") necesita un colaborador en Personal para que se le puedan asignar pedidos
 * y para el cuadre por repartidor. Si no existe, se crea con cargo "Domiciliario"; si existe con otro cargo, se ajusta.
 */
function ensureCourierEmployee(db, userId) {
  const u = db.prepare('SELECT id, username, name, role, profile, permissions, COALESCE(active, 1) AS active FROM users WHERE id = ?').get(userId);
  if (!u || !resolvePerms(u).views.includes('courier') || u.role === 'admin') return null;
  let emp = db.prepare('SELECT id, position, active FROM employees WHERE user_id = ? ORDER BY id LIMIT 1').get(u.id);
  // Si ya existe en Personal un colaborador sin usuario con el mismo nombre (p. ej. el domiciliario creado antes), se vincula en vez de duplicarlo
  if (!emp) {
    const same = db.prepare('SELECT id, position, active FROM employees WHERE user_id IS NULL AND LOWER(TRIM(name)) = LOWER(TRIM(?)) ORDER BY active DESC, id DESC LIMIT 1').get(u.name);
    if (same) { db.prepare('UPDATE employees SET user_id = ? WHERE id = ?').run(u.id, same.id); emp = same; }
  }
  if (!emp) {
    const info = db.prepare("INSERT INTO employees (user_id, name, position, pay_mode, base_amount, active, notes) VALUES (?, ?, 'Domiciliario', 'per_day', 0, ?, 'Creado al darle el perfil Domiciliario al usuario')").run(u.id, u.name, u.active ? 1 : 0);
    return Number(info.lastInsertRowid);
  }
  if (!/domicil|repart|mensaj|motoriz/i.test(emp.position || '')) db.prepare("UPDATE employees SET position = 'Domiciliario' WHERE id = ?").run(emp.id);
  if (u.active && !emp.active) db.prepare('UPDATE employees SET active = 1 WHERE id = ?').run(emp.id);
  return emp.id;
}
/** Vincula todos los usuarios repartidores que aún no tengan colaborador (usuarios creados antes de esta función). */
function ensureAllCouriers(db) {
  try {
    for (const u of db.prepare("SELECT id FROM users WHERE role != 'admin' AND COALESCE(active, 1) = 1 AND (profile = 'courier' OR permissions LIKE '%courier%')").all()) ensureCourierEmployee(db, u.id);
  } catch { /* tablas en migración */ }
}

const hasView = (user, key) => Boolean(user && (user.role === 'admin' || (user.perms && user.perms.views.includes(key))));
const hasAction = (user, key) => Boolean(user && (user.role === 'admin' || (user.perms && user.perms.actions.includes(key))));

module.exports = { VIEWS, ACTIONS, PROFILES, VIEW_KEYS, ACTION_KEYS, PROFILE_KEYS, resolvePerms, normalizeUserPerms, profileOf, hasView, hasAction, ensureCourierEmployee, ensureAllCouriers };
