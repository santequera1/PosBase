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
];
const VIEW_KEYS = VIEWS.map(v => v.key);
const ACTION_KEYS = ACTIONS.map(a => a.key);

/** Plantillas: perfil → rol técnico + vistas y acciones por defecto. */
const PROFILES = {
  admin: { label: 'Administrador', role: 'admin', views: VIEW_KEYS, actions: ACTION_KEYS },
  cashier: { label: 'Cajero', role: 'cashier', views: ['pos', 'tables', 'counter', 'delivery', 'kitchen', 'shift', 'orders', 'reports', 'menu', 'customers', 'finance', 'settings'], actions: ['cancel_orders', 'discounts', 'edit_menu', 'cash_withdrawals'] },
  waiter: { label: 'Mesero', role: 'cashier', views: ['tables', 'counter', 'delivery', 'kitchen', 'orders'], actions: [] },
  kitchen: { label: 'Cocina', role: 'kitchen', views: ['kitchen'], actions: [] },
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

const hasView = (user, key) => Boolean(user && (user.role === 'admin' || (user.perms && user.perms.views.includes(key))));
const hasAction = (user, key) => Boolean(user && (user.role === 'admin' || (user.perms && user.perms.actions.includes(key))));

module.exports = { VIEWS, ACTIONS, PROFILES, VIEW_KEYS, ACTION_KEYS, PROFILE_KEYS, resolvePerms, normalizeUserPerms, profileOf, hasView, hasAction };
