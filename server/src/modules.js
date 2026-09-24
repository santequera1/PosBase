/**
 * Esquema de los módulos financieros y de personal.
 * Se ejecuta en cada arranque (CREATE TABLE IF NOT EXISTS) y siembra las
 * categorías de gasto básicas si la tabla está vacía.
 */
function initModulesSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      nit TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      address TEXT DEFAULT '',
      category TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-5 hours'))
    );

    CREATE TABLE IF NOT EXISTS expense_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      emoji TEXT DEFAULT '💸',
      kind TEXT NOT NULL DEFAULT 'opex' CHECK(kind IN ('cogs', 'opex', 'payroll', 'other')),
      sort_order INTEGER DEFAULT 0,
      is_system INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      category_id INTEGER NOT NULL REFERENCES expense_categories(id),
      supplier_id INTEGER REFERENCES suppliers(id),
      description TEXT NOT NULL,
      amount INTEGER NOT NULL,
      tax_amount INTEGER DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      status TEXT NOT NULL DEFAULT 'paid' CHECK(status IN ('paid', 'pending')),
      due_date TEXT,
      paid_at TEXT,
      invoice_number TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      from_cash_register INTEGER DEFAULT 0,
      cash_movement_id INTEGER,
      source TEXT DEFAULT 'manual',
      reference_id INTEGER,
      created_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-5 hours'))
    );
    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
    CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);

    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      name TEXT NOT NULL,
      document TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      position TEXT DEFAULT 'Cajero',
      pay_mode TEXT NOT NULL DEFAULT 'per_shift' CHECK(pay_mode IN ('monthly', 'biweekly', 'per_shift', 'per_day', 'hourly')),
      base_amount INTEGER NOT NULL DEFAULT 0,
      start_date TEXT,
      active INTEGER DEFAULT 1,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-5 hours'))
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      date TEXT NOT NULL,
      check_in TEXT,
      check_out TEXT,
      hours REAL DEFAULT 0,
      shift_id INTEGER,
      source TEXT DEFAULT 'manual',
      notes TEXT DEFAULT '',
      UNIQUE(employee_id, date)
    );

    CREATE TABLE IF NOT EXISTS tips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      employee_id INTEGER REFERENCES employees(id),
      amount INTEGER NOT NULL,
      method TEXT DEFAULT 'cash',
      shift_id INTEGER,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-5 hours'))
    );

    CREATE TABLE IF NOT EXISTS advances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      date TEXT NOT NULL,
      amount INTEGER NOT NULL,
      from_cash_register INTEGER DEFAULT 0,
      cash_movement_id INTEGER,
      settled INTEGER DEFAULT 0,
      settlement_id INTEGER,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-5 hours'))
    );

    CREATE TABLE IF NOT EXISTS payroll_settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      pay_mode TEXT NOT NULL,
      units REAL DEFAULT 0,
      unit_amount INTEGER DEFAULT 0,
      base_total INTEGER DEFAULT 0,
      tips_total INTEGER DEFAULT 0,
      advances_total INTEGER DEFAULT 0,
      bonuses INTEGER DEFAULT 0,
      deductions INTEGER DEFAULT 0,
      total INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'paid')),
      paid_at TEXT,
      payment_method TEXT DEFAULT 'cash',
      expense_id INTEGER,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-5 hours'))
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      delta INTEGER NOT NULL,
      stock_after INTEGER NOT NULL,
      reason TEXT DEFAULT 'ajuste',
      order_id INTEGER,
      user_name TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-5 hours'))
    );
    CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
  `);

  // Migración para bases creadas antes del campo de IVA en gastos
  const expenseCols = db.prepare('PRAGMA table_info(expenses)').all().map(c => c.name);
  if (!expenseCols.includes('tax_amount')) db.exec('ALTER TABLE expenses ADD COLUMN tax_amount INTEGER DEFAULT 0');

  // Nómina: jornada, extras/recargos, deducciones de ley y auxilio de transporte por colaborador; detalle guardado en cada liquidación
  const empCols = db.prepare('PRAGMA table_info(employees)').all().map(c => c.name);
  if (!empCols.includes('hours_per_day')) db.exec('ALTER TABLE employees ADD COLUMN hours_per_day REAL DEFAULT 8');
  if (!empCols.includes('overtime')) db.exec('ALTER TABLE employees ADD COLUMN overtime INTEGER DEFAULT 1');
  if (!empCols.includes('legal_deductions')) db.exec('ALTER TABLE employees ADD COLUMN legal_deductions INTEGER DEFAULT 0');
  if (!empCols.includes('transport_allowance')) db.exec('ALTER TABLE employees ADD COLUMN transport_allowance INTEGER DEFAULT 0');
  const setCols = db.prepare('PRAGMA table_info(payroll_settlements)').all().map(c => c.name);
  if (!setCols.includes('extras_total')) db.exec('ALTER TABLE payroll_settlements ADD COLUMN extras_total INTEGER DEFAULT 0');
  if (!setCols.includes('allowance_total')) db.exec('ALTER TABLE payroll_settlements ADD COLUMN allowance_total INTEGER DEFAULT 0');
  if (!setCols.includes('legal_deductions_total')) db.exec('ALTER TABLE payroll_settlements ADD COLUMN legal_deductions_total INTEGER DEFAULT 0');
  if (!setCols.includes('details')) db.exec('ALTER TABLE payroll_settlements ADD COLUMN details TEXT');

  // Estado de resultados: grupo contable de cada categoría de gasto (costo de ventas, personal, administrativos, ventas, financieros, otros)
  const catCols = db.prepare('PRAGMA table_info(expense_categories)').all().map(c => c.name);
  if (!catCols.includes('pl_group')) db.exec('ALTER TABLE expense_categories ADD COLUMN pl_group TEXT');
  backfillPlGroups(db);

  const count = db.prepare('SELECT COUNT(*) AS c FROM expense_categories').get().c;
  if (count === 0) {
    const ins = db.prepare('INSERT INTO expense_categories (name, emoji, kind, sort_order, is_system) VALUES (?, ?, ?, ?, ?)');
    const seed = [
      ['Materia prima', '🥛', 'cogs', 1, 0],
      ['Empaques y vasos', '🥤', 'cogs', 2, 0],
      ['Arriendo', '🏠', 'opex', 3, 0],
      ['Servicios públicos', '💡', 'opex', 4, 0],
      ['Mantenimiento', '🔧', 'opex', 5, 0],
      ['Nómina y turnos', '👥', 'payroll', 6, 1],
      ['Marketing y publicidad', '📣', 'opex', 7, 0],
      ['Impuestos y bancos', '🏦', 'opex', 8, 0],
      ['Transporte y domicilios', '🛵', 'opex', 9, 0],
      ['Otros', '📦', 'other', 10, 1],
    ];
    for (const row of seed) ins.run(...row);
    backfillPlGroups(db);
  }
}

/** Asigna el grupo del estado de resultados a las categorías que no lo tienen, según su tipo y nombre. */
function backfillPlGroups(db) {
  db.exec(`
    UPDATE expense_categories SET pl_group = CASE
      WHEN kind = 'cogs' THEN 'cost'
      WHEN kind = 'payroll' THEN 'personnel'
      WHEN kind = 'other' THEN 'other'
      WHEN LOWER(name) LIKE '%marketing%' OR LOWER(name) LIKE '%publicidad%' OR LOWER(name) LIKE '%transporte%' OR LOWER(name) LIKE '%domicilio%' THEN 'sales'
      WHEN LOWER(name) LIKE '%banco%' OR LOWER(name) LIKE '%financier%' OR LOWER(name) LIKE '%inter%s%' THEN 'financial'
      ELSE 'admin' END
    WHERE pl_group IS NULL OR pl_group = ''`);
}

module.exports = { initModulesSchema };
