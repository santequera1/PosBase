/**
 * Sedes (sucursales): un mismo sistema administra varios locales, por ejemplo el restaurante y la heladería de al lado.
 *
 *  - Cada petición trabaja sobre una sede activa (encabezado X-Branch-Id que manda la app; si no llega, la primera sede activa).
 *    Se guarda en un contexto por petición (AsyncLocalStorage), así "la caja abierta", las mesas, la cocina y las ventas
 *    se resuelven solas para la sede correcta sin pasarla a cada función.
 *  - Cada sede tiene su propia caja (turnos), salones y mesas, pedidos e impresoras.
 *  - El menú es compartido: desde una sede se pueden vender productos de la otra en la misma cuenta. Cada categoría puede
 *    marcarse con su sede de origen (para informes y para ordenar el catálogo).
 *  - Con una sola sede todo funciona igual que antes.
 */
const { AsyncLocalStorage } = require('async_hooks');

const ctx = new AsyncLocalStorage();

function hasCol(db, table, col) { return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col); }
function addCol(db, table, col, def) { if (!hasCol(db, table, col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); }

function initBranches(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS branches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      invoice_prefix TEXT DEFAULT '',
      color TEXT DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-5 hours'))
    );
  `);
  if (!db.prepare('SELECT id FROM branches LIMIT 1').get()) {
    const r = db.prepare("SELECT value FROM settings WHERE key = 'businessName'").get();
    db.prepare('INSERT INTO branches (id, name, sort_order) VALUES (1, ?, 1)').run((r && r.value) || 'Sede principal');
  }
  // Lo existente queda en la sede 1
  for (const t of ['orders', 'cash_shifts', 'rooms', 'expenses', 'printers']) {
    try { addCol(db, t, 'branch_id', 'INTEGER DEFAULT 1'); } catch { /* la tabla aún no existe */ }
  }
  try { addCol(db, 'categories', 'branch_id', 'INTEGER'); } catch { /* sin categorías */ }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_orders_branch ON orders(branch_id, created_at)'); } catch { /* */ }
}

const mapBranch = r => ({ id: r.id, name: r.name, address: r.address || '', phone: r.phone || '', invoicePrefix: r.invoice_prefix || '', color: r.color || '', active: Boolean(r.active), sortOrder: r.sort_order });
const listBranches = (db, all = false) => db.prepare(`SELECT * FROM branches ${all ? '' : 'WHERE active = 1'} ORDER BY sort_order, id`).all().map(mapBranch);

/** Middleware: fija la sede activa de la petición. */
let cache = { at: 0, ids: [1] };
function branchMiddleware(getDb) {
  return (req, res, next) => {
    const now = Date.now();
    if (now - cache.at > 5000) { try { cache = { at: now, ids: getDb().prepare('SELECT id FROM branches WHERE active = 1 ORDER BY sort_order, id').all().map(r => r.id) }; } catch { cache = { at: now, ids: [1] }; } }
    const asked = Number(req.get('X-Branch-Id') || req.query.branchId || 0);
    const branchId = cache.ids.includes(asked) ? asked : (cache.ids[0] || 1);
    req.branchId = branchId;
    ctx.run({ branchId }, () => next());
  };
}
/** Se llama al crear o editar sedes para que el cambio aplique de inmediato. */
const invalidateCache = () => { cache = { at: 0, ids: cache.ids }; };

/** Sede activa de la petición en curso (1 si no hay contexto, por ejemplo en tareas internas). */
function currentBranch() { const s = ctx.getStore(); return (s && s.branchId) || 1; }

/**
 * Condición SQL por sede. q.branch === 'all' → todas; un número → esa sede; si no, la sede activa.
 * Devuelve { sql: 'AND o.branch_id = ?', params: [id] } o { sql: '', params: [] }.
 */
function branchWhere(alias, q = {}) {
  const col = alias ? `COALESCE(${alias}.branch_id, 1)` : 'COALESCE(branch_id, 1)';
  if (q && q.branch === 'all') return { sql: '', params: [] };
  const id = q && q.branch && Number(q.branch) > 0 ? Number(q.branch) : currentBranch();
  return { sql: ` AND ${col} = ?`, params: [id] };
}

module.exports = { ctx, initBranches, listBranches, mapBranch, branchMiddleware, currentBranch, branchWhere, invalidateCache };
