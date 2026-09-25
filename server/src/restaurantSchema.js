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
};

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
  return cfg;
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
  const rows = db.prepare('SELECT id, name, position FROM employees WHERE active = 1 ORDER BY name').all();
  const isCourier = e => /domicil|repart|mensaj|motoriz/i.test(e.position || '');
  return { waiters: rows.filter(e => !isCourier(e)), couriers: rows.filter(isCourier) };
}

module.exports = { initRestaurantSchema, readRestaurantConfig, saveRestaurantConfig, staffLists, CHANNELS, STATIONS, DEFAULT_CONFIG };
