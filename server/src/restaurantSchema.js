/**
 * Módulo Restaurante: mesas (salones y plano), cuentas abiertas, comandas a cocina, pedidos para llevar y domicilios.
 * Migraciones idempotentes + configuración (guardada en la tabla settings).
 */

const CHANNELS = [
  { id: 'local', label: 'En el local' },
  { id: 'phone', label: 'Teléfono' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'rappi', label: 'Rappi' },
  { id: 'didi', label: 'DiDi Food' },
  { id: 'other', label: 'Otro' },
];

const STATIONS = ['cocina', 'barra', 'none'];

const DEFAULT_CONFIG = {
  modules: { tables: false, counter: false, delivery: false, kitchen: false },
  tipPercent: 10,
  tipDineIn: true,
  tipCounter: false,
  tipDelivery: false,
  deliveryFee: 5000,
  deliveryTimes: [15, 20, 30, 45, 60, 90],
  requireOpenShift: false,
  autoPrintKitchen: false,
  kitchenPrintMode: 'single', // 'single' = una comanda con todo · 'station' = una comanda por estación (cocina, barra)
  stationPrinters: { cocina: { enabled: true, label: '', copies: 1 }, barra: { enabled: true, label: '', copies: 1 } },
  staffDiscountEnabled: true,
  staffDiscountPct: 50,
  staffDiscountExcluded: null, // ids de categorías sin descuento de trabajador; null = se detectan las bebidas por nombre
};
const DRINK_RE = /bebida|soda|gaseosa|jugo|limonada|cerveza|licor|coctel|cóctel|agua|drink|refresco|vino/i;
const PRINT_STATIONS = ['cocina', 'barra'];

/* ---------- utilidades ---------- */
function hasCol(db, table, col) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col);
}
function addCol(db, table, col, def) {
  if (!hasCol(db, table, col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
function quoteDefault(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/^-?\d+(\.\d+)?$/.test(s) || /^'.*'$/.test(s) || /^NULL$/i.test(s)) return ` DEFAULT ${s}`;
  if (/^\(.*\)$/.test(s)) return ` DEFAULT ${s}`;
  return ` DEFAULT (${s})`;
}

/**
 * La tabla orders nació con CHECK(status IN (...)) y CHECK(type IN (...)); para las cuentas abiertas
 * ('open', 'billing') hay que recrearla sin esas restricciones conservando todas las columnas y los datos.
 */
function relaxOrdersConstraints(db) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'orders'").get();
  if (!row || !/CHECK\s*\(\s*status\s+IN/i.test(row.sql || '')) return;
  console.log('🔄 Migrando pedidos: estados de cuenta abierta (mesas, para llevar, domicilios)...');
  const cols = db.prepare('PRAGMA table_info(orders)').all();
  const defs = cols.map(c => {
    if (c.name === 'id') return 'id INTEGER PRIMARY KEY AUTOINCREMENT';
    return `${c.name} ${c.type || 'TEXT'}${c.notnull ? ' NOT NULL' : ''}${quoteDefault(c.dflt_value)}`;
  });
  const names = cols.map(c => c.name).join(', ');
  db.exec(`
    PRAGMA foreign_keys=off;
    BEGIN TRANSACTION;
    CREATE TABLE orders_new (${defs.join(', ')});
    INSERT INTO orders_new (${names}) SELECT ${names} FROM orders;
    DROP TABLE orders;
    ALTER TABLE orders_new RENAME TO orders;
    COMMIT;
    PRAGMA foreign_keys=on;
  `);
}

function initRestaurantSchema(db) {
  relaxOrdersConstraints(db);

  // Pedido: canal, etiqueta, mesa, personas, mesero, repartidor, propina, tiempos y cierre
  addCol(db, 'orders', 'channel', "TEXT DEFAULT 'local'");
  addCol(db, 'orders', 'split_from', 'INTEGER');
  addCol(db, 'orders', 'payroll_employee_id', 'INTEGER'); // venta cobrada con descuento de nómina a este empleado // cuenta separada: id de la cuenta de la mesa de la que salió
  addCol(db, 'orders', 'sale_label', 'TEXT');
  addCol(db, 'orders', 'table_id', 'INTEGER');
  addCol(db, 'orders', 'table_label', 'TEXT');
  addCol(db, 'orders', 'people', 'INTEGER DEFAULT 0');
  addCol(db, 'orders', 'waiter_id', 'INTEGER');
  addCol(db, 'orders', 'waiter_name', 'TEXT');
  addCol(db, 'orders', 'driver_name', 'TEXT');
  addCol(db, 'orders', 'tip', 'INTEGER DEFAULT 0');
  addCol(db, 'orders', 'tip_to', 'TEXT');
  addCol(db, 'orders', 'estimated_minutes', 'INTEGER');
  addCol(db, 'orders', 'discount_reason', 'TEXT');
  addCol(db, 'orders', 'customer_address2', 'TEXT');
  addCol(db, 'orders', 'customer_neighborhood', 'TEXT');
  addCol(db, 'orders', 'ready_at', 'TEXT');
  addCol(db, 'orders', 'shipped_at', 'TEXT');
  addCol(db, 'orders', 'delivered_at', 'TEXT');
  addCol(db, 'orders', 'closed_at', 'TEXT');
  addCol(db, 'orders', 'closed_by', 'TEXT');
  // Descuento de trabajador: a quién se le aplicó (para reportes y control)
  addCol(db, 'orders', 'discount_kind', 'TEXT');
  addCol(db, 'orders', 'discount_employee_id', 'INTEGER');
  addCol(db, 'orders', 'discount_employee_name', 'TEXT');
  addCol(db, 'orders', 'discount_id', 'INTEGER');
  addCol(db, 'orders', 'discount_name', 'TEXT');
  addCol(db, 'orders', 'cancel_reason', 'TEXT');
  addCol(db, 'orders', 'created_by', 'TEXT');
  // Conciliación de arqueos (la hace un supervisor)
  addCol(db, 'cash_shifts', 'reconciled_at', 'TEXT');
  addCol(db, 'cash_shifts', 'reconciled_by', 'TEXT');
  addCol(db, 'cash_shifts', 'reconciled_amount', 'INTEGER');
  addCol(db, 'cash_shifts', 'reconcile_reason', 'TEXT');
  addCol(db, 'cash_shifts', 'reconcile_comment', 'TEXT');
  db.exec(`CREATE TABLE IF NOT EXISTS order_item_cancellations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER,
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price INTEGER NOT NULL,
    was_sent INTEGER DEFAULT 0,
    reason TEXT,
    cancelled_by TEXT,
    cancelled_at TEXT NOT NULL DEFAULT (datetime('now', '-5 hours'))
  );`);
  require('./discounts').initDiscounts(db);

  // Ítems: comandas (tanda enviada a cocina) y estado en cocina
  addCol(db, 'order_items', 'batch', 'INTEGER');
  addCol(db, 'order_items', 'sent_at', 'TEXT');
  addCol(db, 'order_items', 'kitchen_status', "TEXT DEFAULT 'pending'");
  addCol(db, 'order_items', 'kitchen_ready_at', 'TEXT');

  // Clientes: dirección completa para domicilios
  addCol(db, 'customers', 'address2', "TEXT DEFAULT ''");
  addCol(db, 'customers', 'neighborhood', "TEXT DEFAULT ''");

  // Productos: estación donde se prepara (cocina, barra o no se prepara)
  addCol(db, 'products', 'station', "TEXT DEFAULT 'cocina'");

  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL REFERENCES rooms(id),
      label TEXT NOT NULL,
      shape TEXT DEFAULT 'square',
      seats INTEGER DEFAULT 4,
      x REAL DEFAULT 10,
      y REAL DEFAULT 10,
      w REAL DEFAULT 12,
      h REAL DEFAULT 14,
      active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_orders_table ON orders(table_id, status);
    CREATE INDEX IF NOT EXISTS idx_orders_status_type ON orders(status, type);
    CREATE INDEX IF NOT EXISTS idx_order_items_batch ON order_items(order_id, batch);
  `);

  // Salón inicial con las mesas de la configuración anterior (tableCount), en cuadrícula
  const roomCount = db.prepare('SELECT COUNT(*) AS c FROM rooms').get().c;
  if (roomCount === 0) {
    const setting = db.prepare("SELECT value FROM settings WHERE key = 'tableCount'").get();
    const n = Math.min(40, Math.max(1, Number(setting && setting.value) || 8));
    const info = db.prepare("INSERT INTO rooms (name, sort_order) VALUES ('Salón', 1)").run();
    const roomId = Number(info.lastInsertRowid);
    const ins = db.prepare('INSERT INTO tables (room_id, label, shape, seats, x, y, w, h, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const cols = 4;
    for (let i = 0; i < n; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      ins.run(roomId, String(i + 1), i % 3 === 2 ? 'round' : 'square', 4, 6 + col * 23, 8 + row * 24, 12, 16, i + 1);
    }
  }
}

/* ---------- configuración ---------- */
function readSetting(db, key) {
  const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return r ? r.value : undefined;
}
function readRestaurantConfig(db) {
  const cfg = { ...DEFAULT_CONFIG, modules: { ...DEFAULT_CONFIG.modules }, deliveryTimes: [...DEFAULT_CONFIG.deliveryTimes] };
  try { const m = readSetting(db, 'restaurantModules'); if (m) cfg.modules = { ...cfg.modules, ...JSON.parse(m) }; } catch { /* valor por defecto */ }
  try { const t = readSetting(db, 'deliveryTimes'); if (t) { const arr = JSON.parse(t); if (Array.isArray(arr) && arr.length) cfg.deliveryTimes = arr.map(Number).filter(n => n > 0); } } catch { /* valor por defecto */ }
  const num = (k, d) => { const v = readSetting(db, k); return v === undefined || v === '' ? d : Number(v); };
  const bool = (k, d) => { const v = readSetting(db, k); return v === undefined || v === '' ? d : (v === '1' || v === 'true'); };
  cfg.tipPercent = num('tipPercent', cfg.tipPercent);
  cfg.tipDineIn = bool('tipDineIn', cfg.tipDineIn);
  cfg.tipCounter = bool('tipCounter', cfg.tipCounter);
  cfg.tipDelivery = bool('tipDelivery', cfg.tipDelivery);
  cfg.deliveryFee = num('deliveryFee', cfg.deliveryFee);
  cfg.requireOpenShift = bool('requireOpenShift', cfg.requireOpenShift);
  cfg.autoPrintKitchen = bool('autoPrintKitchen', cfg.autoPrintKitchen);
  cfg.kitchenPrintMode = readSetting(db, 'kitchenPrintMode') === 'station' ? 'station' : 'single';
  cfg.stationPrinters = { cocina: { ...DEFAULT_CONFIG.stationPrinters.cocina }, barra: { ...DEFAULT_CONFIG.stationPrinters.barra } };
  try { const sp = readSetting(db, 'stationPrinters'); if (sp) { const j = JSON.parse(sp); for (const st of PRINT_STATIONS) if (j[st]) cfg.stationPrinters[st] = { ...cfg.stationPrinters[st], ...j[st] }; } } catch { /* valor por defecto */ }
  cfg.staffDiscountEnabled = bool('staffDiscountEnabled', cfg.staffDiscountEnabled);
  cfg.staffDiscountPct = num('staffDiscountPct', cfg.staffDiscountPct);
  let excluded = null;
  try { const v = readSetting(db, 'staffDiscountExcluded'); if (v) { const arr = JSON.parse(v); if (Array.isArray(arr)) excluded = arr.map(Number).filter(n => n > 0); } } catch { excluded = null; }
  if (excluded === null) excluded = db.prepare('SELECT id, name FROM categories').all().filter(c => DRINK_RE.test(c.name || '')).map(c => c.id);
  cfg.staffDiscountExcluded = excluded;
  cfg.printMode = readSetting(db, 'printMode') === 'agent' ? 'agent' : 'browser';
  try { const s = readSetting(db, 'serviceShifts'); cfg.serviceShifts = s ? JSON.parse(s) : []; } catch { cfg.serviceShifts = []; }
  cfg.mobileNav = readSetting(db, 'mobileNav') === 'top' ? 'top' : 'bottom';
  return cfg;
}

/**
 * Descuento de trabajador: porcentaje sobre los productos que no están en las categorías excluidas (bebidas).
 * items: [{ productId, price, quantity }]. Devuelve { eligible, amount, pct }.
 */
function computeStaffDiscount(db, items, cfg = readRestaurantConfig(db)) {
  const pct = Math.min(100, Math.max(0, Number(cfg.staffDiscountPct) || 0));
  const excluded = new Set((cfg.staffDiscountExcluded || []).map(Number));
  const catOf = db.prepare('SELECT category_id AS c FROM products WHERE id = ?');
  let eligible = 0;
  for (const it of items || []) {
    const row = it.productId ? catOf.get(Number(it.productId)) : null;
    if (row && excluded.has(Number(row.c))) continue;
    eligible += Math.round((Number(it.price) || 0) * (Number(it.quantity) || 0));
  }
  return { eligible, pct, amount: Math.round((eligible * pct) / 100) };
}

/** Valida el trabajador al que se aplica el descuento (colaborador activo). */
function staffDiscountEmployee(db, employeeId) {
  const id = Number(employeeId);
  if (!id) return null;
  return db.prepare('SELECT id, name FROM employees WHERE id = ? AND active = 1').get(id) || null;
}

function saveRestaurantConfig(db, body) {
  const up = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  if (body.modules && typeof body.modules === 'object') {
    const cur = readRestaurantConfig(db).modules;
    const next = { ...cur };
    for (const k of Object.keys(DEFAULT_CONFIG.modules)) if (body.modules[k] !== undefined) next[k] = Boolean(body.modules[k]);
    up.run('restaurantModules', JSON.stringify(next));
  }
  if (body.tipPercent !== undefined) { const n = Number(body.tipPercent); if (!Number.isFinite(n) || n < 0 || n > 50) throw new Error('La propina sugerida debe estar entre 0 y 50 %'); up.run('tipPercent', String(n)); }
  for (const k of ['tipDineIn', 'tipCounter', 'tipDelivery', 'requireOpenShift', 'autoPrintKitchen']) if (body[k] !== undefined) up.run(k, body[k] ? '1' : '0');
  if (body.kitchenPrintMode !== undefined) up.run('kitchenPrintMode', body.kitchenPrintMode === 'station' ? 'station' : 'single');
  if (body.stationPrinters && typeof body.stationPrinters === 'object') {
    const cur = readRestaurantConfig(db).stationPrinters;
    const next = {};
    for (const st of PRINT_STATIONS) {
      const b = body.stationPrinters[st] || {}, c = cur[st];
      next[st] = {
        enabled: b.enabled !== undefined ? Boolean(b.enabled) : c.enabled,
        label: b.label !== undefined ? String(b.label).trim().slice(0, 60) : c.label,
        copies: b.copies !== undefined ? Math.min(3, Math.max(1, Math.round(Number(b.copies)) || 1)) : c.copies,
      };
    }
    up.run('stationPrinters', JSON.stringify(next));
  }
  if (Array.isArray(body.serviceShifts)) up.run('serviceShifts', JSON.stringify(body.serviceShifts.map(s => ({ name: String(s.name || '').trim().slice(0, 30), from: /^\d{2}:\d{2}$/.test(s.from) ? s.from : '00:00', to: /^\d{2}:\d{2}$/.test(s.to) ? s.to : '23:59' })).filter(s => s.name)));
  if (body.mobileNav !== undefined) up.run('mobileNav', body.mobileNav === 'top' ? 'top' : 'bottom');
  if (body.staffDiscountEnabled !== undefined) up.run('staffDiscountEnabled', body.staffDiscountEnabled ? '1' : '0');
  if (body.staffDiscountPct !== undefined) { const n = Number(body.staffDiscountPct); if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('El descuento de trabajador debe estar entre 0 y 100 %'); up.run('staffDiscountPct', String(n)); }
  if (body.staffDiscountExcluded !== undefined && Array.isArray(body.staffDiscountExcluded)) up.run('staffDiscountExcluded', JSON.stringify(body.staffDiscountExcluded.map(Number).filter(n => n > 0)));
  if (body.deliveryFee !== undefined) { const n = Math.round(Number(body.deliveryFee)); if (!Number.isFinite(n) || n < 0) throw new Error('Costo de envío inválido'); up.run('deliveryFee', String(n)); }
  if (body.deliveryTimes !== undefined) {
    const arr = (Array.isArray(body.deliveryTimes) ? body.deliveryTimes : String(body.deliveryTimes).split(',')).map(v => Math.round(Number(v))).filter(n => n > 0 && n <= 2880);
    if (!arr.length) throw new Error('Indica al menos un tiempo estimado');
    up.run('deliveryTimes', JSON.stringify([...new Set(arr)].sort((a, b) => a - b)));
  }
  return readRestaurantConfig(db);
}

/** Meseros (todo el personal activo que no es repartidor) y repartidores (cargo de domicilios). */
function staffLists(db) {
  require('./permissions').ensureAllCouriers(db);
  const rows = db.prepare('SELECT id, name, position, user_id AS userId FROM employees WHERE active = 1 ORDER BY name').all();
  const isCourier = e => /domicil|repart|mensaj|motoriz/i.test(e.position || '');
  // La lista de meseros deja por fuera la cocina (auxiliar de cocina, planchero, cocinero...); si no queda nadie, van todos
  const isKitchen = e => /cocin|planch|parrill|chef|lavaplat|oficios|steward|bodeg/i.test(e.position || '');
  const others = rows.filter(e => !isCourier(e));
  const servers = others.filter(e => !isKitchen(e));
  return { waiters: servers.length ? servers : others, couriers: rows.filter(isCourier), all: rows };
}

module.exports = { initRestaurantSchema, readRestaurantConfig, saveRestaurantConfig, staffLists, computeStaffDiscount, staffDiscountEmployee, CHANNELS, STATIONS, DEFAULT_CONFIG };
