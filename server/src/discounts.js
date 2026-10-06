/**
 * Catálogo de descuentos (como en Fudo): nombre, tipo porcentual o fijo, importe fijo o libre (lo define el cajero),
 * si aplica a todo o deja por fuera las bebidas, si exige elegir al trabajador, y activo/inactivo.
 * "Empleados" es especial: su porcentaje y si está activo viven en la configuración del restaurante
 * (staffDiscountPct / staffDiscountEnabled) y siempre deja por fuera las categorías marcadas como bebidas.
 */
const { readRestaurantConfig } = require('./restaurantSchema');

function initDiscounts(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS discounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'percent',
      value REAL,
      apply_to TEXT NOT NULL DEFAULT 'all',
      requires_employee INTEGER NOT NULL DEFAULT 0,
      special TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-5 hours'))
    );
  `);
  if (!db.prepare("SELECT id FROM discounts WHERE special = 'staff'").get()) {
    db.prepare("INSERT INTO discounts (name, kind, value, apply_to, requires_employee, special) VALUES ('Empleados', 'percent', NULL, 'no_drinks', 1, 'staff')").run();
  }
}

function mapDiscount(db, r, cfg) {
  const d = { id: r.id, name: r.name, kind: r.kind === 'fixed' ? 'fixed' : 'percent', value: r.value === null || r.value === undefined ? null : Number(r.value),
    applyTo: r.apply_to === 'no_drinks' ? 'no_drinks' : 'all', requiresEmployee: Boolean(r.requires_employee), special: r.special || null, active: Boolean(r.active), createdAt: r.created_at };
  if (d.special === 'staff') {
    const c = cfg || readRestaurantConfig(db);
    d.kind = 'percent'; d.value = Number(c.staffDiscountPct) || 0; d.active = c.staffDiscountEnabled !== false; d.applyTo = 'no_drinks'; d.requiresEmployee = true;
  }
  return d;
}

function listDiscounts(db, { onlyActive = false } = {}) {
  const cfg = readRestaurantConfig(db);
  const rows = db.prepare('SELECT * FROM discounts ORDER BY (special IS NULL), name').all().map(r => mapDiscount(db, r, cfg));
  return onlyActive ? rows.filter(d => d.active) : rows;
}
const getDiscount = (db, id) => { const r = db.prepare('SELECT * FROM discounts WHERE id = ?').get(Number(id)); return r ? mapDiscount(db, r) : null; };
const staffDiscountId = db => (db.prepare("SELECT id FROM discounts WHERE special = 'staff'").get() || {}).id || null;

function saveDiscount(db, body, id = null) {
  const cur = id ? db.prepare('SELECT * FROM discounts WHERE id = ?').get(Number(id)) : null;
  if (id && !cur) throw new Error('Descuento no encontrado');
  const name = String(body.name ?? (cur ? cur.name : '')).trim().slice(0, 60);
  if (name.length < 2) throw new Error('El descuento necesita un nombre');
  const kind = (body.kind ?? (cur ? cur.kind : 'percent')) === 'fixed' ? 'fixed' : 'percent';
  let value = body.value !== undefined ? (body.value === null || body.value === '' ? null : Number(body.value)) : (cur ? cur.value : null);
  if (value !== null && (!Number.isFinite(value) || value <= 0)) throw new Error('El importe debe ser mayor a cero (o vacío para que el cajero lo defina)');
  if (value !== null && kind === 'percent' && value > 100) throw new Error('El porcentaje no puede pasar de 100');
  const applyTo = (body.applyTo ?? (cur ? cur.apply_to : 'all')) === 'no_drinks' ? 'no_drinks' : 'all';
  const requiresEmployee = body.requiresEmployee !== undefined ? (body.requiresEmployee ? 1 : 0) : (cur ? cur.requires_employee : 0);
  const active = body.active !== undefined ? (body.active ? 1 : 0) : (cur ? cur.active : 1);
  if (cur && cur.special === 'staff') {
    // El descuento de empleados se guarda en la configuración del restaurante
    const up = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    if (body.value !== undefined && value !== null) up.run('staffDiscountPct', String(kind === 'percent' ? value : 50));
    if (body.active !== undefined) up.run('staffDiscountEnabled', active ? '1' : '0');
    db.prepare('UPDATE discounts SET name = ? WHERE id = ?').run(name, cur.id);
    return getDiscount(db, cur.id);
  }
  if (cur) db.prepare('UPDATE discounts SET name = ?, kind = ?, value = ?, apply_to = ?, requires_employee = ?, active = ? WHERE id = ?').run(name, kind, value, applyTo, requiresEmployee, active, cur.id);
  else id = Number(db.prepare('INSERT INTO discounts (name, kind, value, apply_to, requires_employee, active) VALUES (?, ?, ?, ?, ?, ?)').run(name, kind, value, applyTo, requiresEmployee, active).lastInsertRowid);
  return getDiscount(db, cur ? cur.id : id);
}

/**
 * Calcula un descuento del catálogo sobre los productos de la venta.
 * items: [{ productId, price, quantity }]. opts.value: importe cuando el descuento es libre. opts.employeeId: trabajador.
 */
function computeDiscount(db, discountId, items, opts = {}) {
  const d = getDiscount(db, discountId);
  if (!d) return { error: 'Descuento no encontrado' };
  if (!d.active) return { error: `El descuento "${d.name}" está inactivo` };
  let employee = null;
  if (d.requiresEmployee) {
    employee = opts.employeeId ? db.prepare('SELECT id, name FROM employees WHERE id = ? AND active = 1').get(Number(opts.employeeId)) : null;
    if (!employee) return { error: 'Elige el trabajador al que se le aplica el descuento' };
  }
  const value = d.value !== null ? d.value : Number(opts.value);
  if (!Number.isFinite(value) || value <= 0) return { error: `Indica el ${d.kind === 'percent' ? 'porcentaje' : 'valor'} del descuento "${d.name}"` };
  if (d.kind === 'percent' && value > 100) return { error: 'El porcentaje no puede pasar de 100' };
  const cfg = readRestaurantConfig(db);
  const excluded = new Set(d.applyTo === 'no_drinks' ? (cfg.staffDiscountExcluded || []).map(Number) : []);
  const catOf = db.prepare('SELECT category_id AS c FROM products WHERE id = ?');
  let base = 0;
  for (const it of items || []) {
    const row = it.productId ? catOf.get(Number(it.productId)) : null;
    if (row && excluded.has(Number(row.c))) continue;
    base += Math.round((Number(it.price) || 0) * (Number(it.quantity) || 0));
  }
  const amount = d.kind === 'percent' ? Math.round((base * value) / 100) : Math.min(base, Math.round(value));
  const label = d.kind === 'percent' ? `${value}%` : `$${Math.round(value).toLocaleString('es-CO')}`;
  const reason = d.special === 'staff' ? `Descuento de trabajador ${value}%: ${employee.name}` : `${d.name} ${label}${employee ? ': ' + employee.name : ''}`;
  return { amount, reason, discount: d, employee, base, value, kind: d.special === 'staff' ? 'staff' : 'catalog' };
}

/** Uso de cada descuento: veces, monto y última vez (histórico) y en el rango. */
function discountUsage(db, from, to) {
  const all = Object.fromEntries(db.prepare("SELECT discount_id AS id, COUNT(*) AS times, COALESCE(SUM(discount), 0) AS amount, MAX(COALESCE(closed_at, created_at)) AS last FROM orders WHERE discount_id IS NOT NULL AND status != 'cancelled' AND discount > 0 GROUP BY discount_id").all().map(r => [r.id, r]));
  const period = from ? Object.fromEntries(db.prepare("SELECT discount_id AS id, COUNT(*) AS times, COALESCE(SUM(discount), 0) AS amount FROM orders WHERE discount_id IS NOT NULL AND status != 'cancelled' AND discount > 0 AND date(created_at) BETWEEN ? AND ? GROUP BY discount_id").all(from, to).map(r => [r.id, r])) : {};
  return { all, period };
}

module.exports = { initDiscounts, listDiscounts, getDiscount, saveDiscount, computeDiscount, discountUsage, staffDiscountId };
