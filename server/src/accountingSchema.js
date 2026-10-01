/**
 * Contabilidad: plan de cuentas, asientos (libro diario), abonos parciales, datos del RUT en terceros,
 * documento soporte y parametrización (qué cuenta usa cada evento).
 */
const { PUC, levelOf, parentOf, natureOf, CATEGORY_DEFAULT_ACCOUNT, GROUP_DEFAULT_ACCOUNT } = require('./puc');

function hasCol(db, table, col) { return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col); }
function addCol(db, table, col, def) { if (!hasCol(db, table, col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); }

/** Parametrización por defecto: evento → cuenta. Todo es editable desde Finanzas → Plan de cuentas. */
const DEFAULT_MAP = {
  cash: '110505',               // efectivo (caja general)
  bank: '11100501',             // banco principal (datáfono, consignaciones)
  transfer: '11100502',         // Nequi / Daviplata / transferencias
  card: '11100503',             // recaudo de tarjetas (datáfono)
  customerReceivable: '13050501', // ventas a crédito
  platformReceivable: '13050502', // Rappi / DiDi (la plataforma paga después)
  salesIncome: '414015',        // ingreso por ventas
  deliveryIncome: '414095',     // costo de envío cobrado
  salesTaxINC: '249505',        // INC generado
  salesTaxIVA: '240805',        // IVA generado
  tipsPayable: '281505',        // propinas recibidas para el personal
  supplierPayable: '220501',    // compras a crédito con proveedor
  expensePayable: '233595',     // gastos por pagar sin proveedor
  purchaseIVA: '240810',        // IVA descontable (si es responsable de IVA)
  retentionPayable: '236540',   // retención en la fuente practicada
  payrollExpense: '510506',     // sueldos
  payrollExtras: '510515',      // horas extras y recargos
  payrollAllowance: '510527',   // auxilio de transporte
  payrollBonus: '510548',       // bonificaciones
  payrollHealth: '237005',      // salud (aporte del trabajador retenido)
  payrollPension: '238030',     // pensión (aporte del trabajador retenido)
  payrollPayable: '250505',     // salarios por pagar
  employeeAdvances: '136595',   // anticipos y préstamos a empleados
  cashShortage: '519595',       // faltantes de caja
  cashOverage: '429581',        // sobrantes de caja
  cashDepositSource: '11100501', // de dónde sale el efectivo que entra a caja (base, consignaciones)
  cashWithdrawalOther: '519595', // retiros de caja sin gasto asociado
  inventory: '143505',          // inventario (método permanente)
  cogs: '614015',               // costo de ventas (método permanente)
  purchases: '620505',          // compras (método periódico)
  ownerEquity: '313005',
  retainedEarnings: '370505',
  currentEarnings: '360505',
};

function initAccountingSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      level INTEGER NOT NULL,
      parent_code TEXT,
      nature TEXT NOT NULL DEFAULT 'D',
      active INTEGER DEFAULT 1,
      is_system INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-5 hours'))
    );
    CREATE TABLE IF NOT EXISTS journal_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT,
      date TEXT NOT NULL,
      source TEXT NOT NULL,
      source_id INTEGER,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'posted',
      created_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-5 hours')),
      voided_at TEXT,
      void_reason TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_journal_source ON journal_entries(source, source_id);
    CREATE INDEX IF NOT EXISTS idx_journal_date ON journal_entries(date);
    CREATE TABLE IF NOT EXISTS journal_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
      account_code TEXT NOT NULL,
      debit INTEGER NOT NULL DEFAULT 0,
      credit INTEGER NOT NULL DEFAULT 0,
      third_type TEXT,
      third_id INTEGER,
      third_doc TEXT,
      third_name TEXT,
      description TEXT DEFAULT '',
      doc_ref TEXT DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_lines_entry ON journal_lines(entry_id);
    CREATE INDEX IF NOT EXISTS idx_lines_account ON journal_lines(account_code);
    CREATE INDEX IF NOT EXISTS idx_lines_third ON journal_lines(third_doc);
    CREATE TABLE IF NOT EXISTS expense_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      amount INTEGER NOT NULL,
      method TEXT NOT NULL DEFAULT 'cash',
      notes TEXT DEFAULT '',
      cash_movement_id INTEGER,
      created_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-5 hours'))
    );
    CREATE INDEX IF NOT EXISTS idx_expense_payments ON expense_payments(expense_id);
    CREATE TABLE IF NOT EXISTS order_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      amount INTEGER NOT NULL,
      method TEXT NOT NULL DEFAULT 'cash',
      notes TEXT DEFAULT '',
      created_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-5 hours'))
    );
    CREATE INDEX IF NOT EXISTS idx_order_payments ON order_payments(order_id);
  `);

  // Plan de cuentas: se siembra una sola vez; luego el contador lo administra
  if (db.prepare('SELECT COUNT(*) AS c FROM accounts').get().c === 0) {
    const ins = db.prepare('INSERT INTO accounts (code, name, level, parent_code, nature, is_system) VALUES (?, ?, ?, ?, ?, 1)');
    const tx = db.transaction(() => { for (const [code, name, nature] of PUC) ins.run(code, name, levelOf(code), parentOf(code), nature || natureOf(code)); });
    tx();
  }

  // Gastos: abonos parciales, retención en la fuente y documento soporte
  addCol(db, 'journal_entries', 'doc_hash', 'TEXT');
  addCol(db, 'expenses', 'paid_amount', 'INTEGER DEFAULT 0');
  addCol(db, 'expenses', 'retention', 'INTEGER DEFAULT 0');
  addCol(db, 'expenses', 'retention_pct', 'REAL DEFAULT 0');
  addCol(db, 'expenses', 'support_doc', 'INTEGER DEFAULT 0');
  addCol(db, 'expenses', 'support_doc_number', 'TEXT');
  addCol(db, 'expenses', 'support_doc_status', 'TEXT');
  addCol(db, 'expenses', 'support_doc_issued_at', 'TEXT');
  addCol(db, 'expenses', 'invoice_date', 'TEXT');
  // Categoría de gasto → cuenta contable
  addCol(db, 'expense_categories', 'account_code', 'TEXT');
  const cats = db.prepare('SELECT id, name, pl_group FROM expense_categories WHERE account_code IS NULL OR account_code = \'\'').all();
  const upCat = db.prepare('UPDATE expense_categories SET account_code = ? WHERE id = ?');
  for (const c of cats) upCat.run(CATEGORY_DEFAULT_ACCOUNT[String(c.name).trim().toLowerCase()] || GROUP_DEFAULT_ACCOUNT[c.pl_group] || '519595', c.id);

  // Terceros: datos del RUT para información exógena
  for (const t of ['suppliers', 'customers']) {
    addCol(db, t, 'doc_type', "TEXT DEFAULT ''");       // NIT, CC, CE, PAS, TI
    addCol(db, t, 'dv', "TEXT DEFAULT ''");             // dígito de verificación
    addCol(db, t, 'legal_name', "TEXT DEFAULT ''");     // razón social (si difiere del nombre)
    addCol(db, t, 'first_name', "TEXT DEFAULT ''");
    addCol(db, t, 'last_name', "TEXT DEFAULT ''");
    addCol(db, t, 'person_type', "TEXT DEFAULT ''");    // natural | juridica
    addCol(db, t, 'city', "TEXT DEFAULT ''");
    addCol(db, t, 'state', "TEXT DEFAULT ''");
    addCol(db, t, 'country', "TEXT DEFAULT 'Colombia'");
    addCol(db, t, 'postal_code', "TEXT DEFAULT ''");
    addCol(db, t, 'ciiu', "TEXT DEFAULT ''");           // actividad económica
    addCol(db, t, 'iva_responsible', 'INTEGER DEFAULT 0');
    addCol(db, t, 'regime', "TEXT DEFAULT ''");         // ordinario | simple | no_responsable
    addCol(db, t, 'credit_days', 'INTEGER DEFAULT 0');
    addCol(db, t, 'retention_pct', 'REAL DEFAULT 0');   // % de retención en la fuente que se le practica
  }
  // Productos: costo unitario (inventario permanente)
  addCol(db, 'products', 'cost', 'INTEGER DEFAULT 0');
  // Pedidos: factura electrónica real (proveedor tecnológico)
  addCol(db, 'orders', 'fe_provider', 'TEXT');
  addCol(db, 'orders', 'fe_qr', 'TEXT');
  addCol(db, 'orders', 'fe_error', 'TEXT');
  addCol(db, 'orders', 'fe_public_url', 'TEXT');
}

/* ---------- parametrización ---------- */
function readAcctMap(db) {
  let saved = {};
  try { const r = db.prepare("SELECT value FROM settings WHERE key = 'acctMap'").get(); if (r && r.value) saved = JSON.parse(r.value) || {}; } catch { saved = {}; }
  const map = { ...DEFAULT_MAP };
  for (const k of Object.keys(DEFAULT_MAP)) if (saved[k] && /^\d{4,8}$/.test(String(saved[k]))) map[k] = String(saved[k]);
  return map;
}
function readAcctOptions(db) {
  const get = k => { const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(k); return r ? r.value : undefined; };
  return {
    ivaResponsible: get('ivaResponsible') === '1',
    inventoryMethod: get('inventoryMethod') === 'perpetual' ? 'perpetual' : 'periodic',
    retentionDefaultPct: Number(get('retentionDefaultPct')) || 0,
    fiscalYearStart: get('fiscalYearStart') || '01-01',
  };
}
function saveAcctConfig(db, body) {
  const up = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  if (body.map && typeof body.map === 'object') {
    const cur = readAcctMap(db);
    for (const k of Object.keys(DEFAULT_MAP)) {
      if (body.map[k] === undefined) continue;
      const code = String(body.map[k]).trim();
      if (!/^\d{4,8}$/.test(code)) throw new Error(`Cuenta inválida para ${k}: ${code}`);
      if (!db.prepare('SELECT code FROM accounts WHERE code = ? AND active = 1').get(code)) throw new Error(`La cuenta ${code} no existe en el plan de cuentas`);
      cur[k] = code;
    }
    up.run('acctMap', JSON.stringify(cur));
  }
  if (body.ivaResponsible !== undefined) up.run('ivaResponsible', body.ivaResponsible ? '1' : '0');
  if (body.inventoryMethod !== undefined) up.run('inventoryMethod', body.inventoryMethod === 'perpetual' ? 'perpetual' : 'periodic');
  if (body.retentionDefaultPct !== undefined) up.run('retentionDefaultPct', String(Math.max(0, Math.min(20, Number(body.retentionDefaultPct) || 0))));
  return { map: readAcctMap(db), ...readAcctOptions(db) };
}

module.exports = { initAccountingSchema, readAcctMap, readAcctOptions, saveAcctConfig, DEFAULT_MAP };
