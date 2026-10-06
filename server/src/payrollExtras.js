/**
 * Propinas por colaborador y novedades de nómina.
 *
 * Propinas (dinero de terceros, cuenta 281505):
 *  - Se acumulan por colaborador: propinas directas (cuenta del mesero) + su parte de la propina común del día.
 *  - La propina común se reparte entre quienes trabajaron ese día (asistencia) según la regla elegida:
 *    partes iguales, por horas trabajadas o por puntos (cada colaborador tiene puntos; 0 = no participa).
 *  - Se pagan aparte (abonos en cualquier momento y liquidación cada 15 o 30 días) o dentro de la nómina.
 *  - Saldo = acumulado − pagado (abonos + liquidaciones de propinas + propinas incluidas en liquidaciones de nómina).
 *
 * Novedades (incidencias) de nómina: festivos/dominicales trabajados, horas extra manuales, recargo nocturno,
 * bonificaciones, comisiones, incapacidades, vacaciones, faltas, licencias no remuneradas, préstamos y otros descuentos.
 * Se incluyen en la liquidación del período y quedan amarradas a ella.
 */
const payroll = require('./payroll');

function hasCol(db, table, col) { return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col); }
function addCol(db, table, col, def) { if (!hasCol(db, table, col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); }

function initPayrollExtras(db) {
  addCol(db, 'employees', 'tip_points', 'REAL DEFAULT 1');
  db.exec(`
    CREATE TABLE IF NOT EXISTS tip_payouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      date TEXT NOT NULL,
      amount INTEGER NOT NULL,
      method TEXT DEFAULT 'cash',
      kind TEXT DEFAULT 'abono',
      period_start TEXT,
      period_end TEXT,
      from_cash_register INTEGER DEFAULT 0,
      cash_movement_id INTEGER,
      notes TEXT DEFAULT '',
      created_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-5 hours'))
    );
    CREATE INDEX IF NOT EXISTS idx_tip_payouts_emp ON tip_payouts(employee_id, date);
    CREATE TABLE IF NOT EXISTS payroll_novelties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      quantity REAL DEFAULT 0,
      amount INTEGER NOT NULL DEFAULT 0,
      pct REAL,
      notes TEXT DEFAULT '',
      settlement_id INTEGER,
      created_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-5 hours'))
    );
    CREATE INDEX IF NOT EXISTS idx_novelties_emp ON payroll_novelties(employee_id, date);
    CREATE INDEX IF NOT EXISTS idx_tips_date ON tips(date);
  `);
  addCol(db, 'payroll_settlements', 'novelties_extras', 'INTEGER DEFAULT 0');
  addCol(db, 'payroll_settlements', 'novelties_bonus', 'INTEGER DEFAULT 0');
  addCol(db, 'payroll_settlements', 'novelties_absence', 'INTEGER DEFAULT 0');
  addCol(db, 'payroll_settlements', 'novelties_deductions', 'INTEGER DEFAULT 0');
  addCol(db, 'payroll_settlements', 'loans_total', 'INTEGER DEFAULT 0');
  addCol(db, 'employees', 'bank_account', "TEXT DEFAULT ''");
  addCol(db, 'payroll_novelties', 'label', 'TEXT');
  db.exec(`
    CREATE TABLE IF NOT EXISTS employee_loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      date TEXT NOT NULL,
      amount INTEGER NOT NULL,
      installments INTEGER NOT NULL DEFAULT 1,
      installment_amount INTEGER NOT NULL,
      paid_total INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      from_cash_register INTEGER DEFAULT 0,
      cash_movement_id INTEGER,
      notes TEXT DEFAULT '',
      created_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-5 hours'))
    );
    CREATE TABLE IF NOT EXISTS loan_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_id INTEGER NOT NULL REFERENCES employee_loans(id),
      employee_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      amount INTEGER NOT NULL,
      settlement_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-5 hours'))
    );
    CREATE INDEX IF NOT EXISTS idx_loans_emp ON employee_loans(employee_id, status);
    CREATE INDEX IF NOT EXISTS idx_loan_payments_loan ON loan_payments(loan_id);
  `);
  // Adicionales pagados por vez (armado de carne, lavado de campana...): tarifas editables en Personal → Novedades
  if (!db.prepare("SELECT 1 FROM settings WHERE key = 'payrollTasks'").get()) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('payrollTasks', ?)").run(JSON.stringify([{ id: 'armado_carne', name: 'Armado de carne', amount: 0 }, { id: 'lavado_campana', name: 'Lavado de campana', amount: 0 }]));
  }
}

/* ======================= Adicionales (tarifas) ======================= */
function readTasks(db) {
  try { const r = db.prepare("SELECT value FROM settings WHERE key = 'payrollTasks'").get(); const a = r && r.value ? JSON.parse(r.value) : []; return Array.isArray(a) ? a : []; } catch { return []; }
}
function saveTasks(db, list) {
  const seen = new Set();
  const clean = (Array.isArray(list) ? list : []).map((t, i) => {
    const name = String(t.name || '').trim().slice(0, 60);
    let id = String(t.id || '').trim() || name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'adicional_' + i;
    while (seen.has(id)) id += '_';
    seen.add(id);
    return { id, name, amount: Math.max(0, Math.round(Number(t.amount) || 0)) };
  }).filter(t => t.name);
  db.prepare("INSERT INTO settings (key, value) VALUES ('payrollTasks', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(clean));
  return clean;
}

/* ======================= Préstamos a empleados (libranza sin intereses) ======================= */
/**
 * Cuotas que se descuentan en la liquidación del período. skip = préstamos cuya cuota no se cobra este período;
 * payoff = préstamos que se cobran completos (por ejemplo en la liquidación final).
 */
function loanPlan(db, empId, to, { skip = [], payoff = [] } = {}) {
  const lines = [];
  for (const l of db.prepare("SELECT * FROM employee_loans WHERE employee_id = ? AND status = 'active' AND date <= ? ORDER BY date, id").all(empId, to)) {
    const balance = l.amount - l.paid_total;
    if (balance <= 0) continue;
    const number = db.prepare('SELECT COUNT(*) AS c FROM loan_payments WHERE loan_id = ?').get(l.id).c + 1;
    const isPayoff = payoff.includes(l.id);
    const amount = isPayoff ? balance : Math.min(l.installment_amount, balance);
    lines.push({ id: l.id, date: l.date, notes: l.notes, total: l.amount, installments: l.installments, number, balance, amount, payoff: isPayoff, skipped: !isPayoff && skip.includes(l.id) });
  }
  return { lines, total: lines.filter(x => !x.skipped).reduce((a, x) => a + x.amount, 0) };
}
function applyLoanPlan(db, empId, to, settlementId, plan) {
  for (const x of plan.lines.filter(l => !l.skipped)) {
    db.prepare('INSERT INTO loan_payments (loan_id, employee_id, date, amount, settlement_id) VALUES (?, ?, ?, ?, ?)').run(x.id, empId, to, x.amount, settlementId);
    db.prepare("UPDATE employee_loans SET paid_total = paid_total + ?, status = CASE WHEN paid_total + ? >= amount THEN 'paid' ELSE 'active' END WHERE id = ?").run(x.amount, x.amount, x.id);
  }
}
function revertLoanPayments(db, settlementId) {
  for (const p of db.prepare('SELECT loan_id AS id, SUM(amount) AS t FROM loan_payments WHERE settlement_id = ? GROUP BY loan_id').all(settlementId)) {
    db.prepare("UPDATE employee_loans SET paid_total = MAX(0, paid_total - ?), status = 'active' WHERE id = ?").run(p.t, p.id);
  }
  db.prepare('DELETE FROM loan_payments WHERE settlement_id = ?').run(settlementId);
}

/* ======================= Propinas ======================= */
const TIPS_DEFAULT = { payout: 'payroll', commonSplit: 'equal', period: 'biweekly' };
function readTipsConfig(db) {
  let saved = {};
  try { const r = db.prepare("SELECT value FROM settings WHERE key = 'tipsConfig'").get(); if (r && r.value) saved = JSON.parse(r.value) || {}; } catch { saved = {}; }
  return {
    payout: saved.payout === 'separate' ? 'separate' : 'payroll',
    commonSplit: ['equal', 'hours', 'points'].includes(saved.commonSplit) ? saved.commonSplit : 'equal',
    period: saved.period === 'monthly' ? 'monthly' : 'biweekly',
  };
}
function saveTipsConfig(db, body) {
  const cur = readTipsConfig(db);
  const next = {
    payout: body.payout !== undefined ? (body.payout === 'separate' ? 'separate' : 'payroll') : cur.payout,
    commonSplit: body.commonSplit !== undefined ? (['equal', 'hours', 'points'].includes(body.commonSplit) ? body.commonSplit : 'equal') : cur.commonSplit,
    period: body.period !== undefined ? (body.period === 'monthly' ? 'monthly' : 'biweekly') : cur.period,
  };
  db.prepare("INSERT INTO settings (key, value) VALUES ('tipsConfig', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(next));
  return readTipsConfig(db);
}

/**
 * Reparto de la propina común de un día: devuelve Map(employeeId → parte).
 * Participan quienes tienen asistencia ese día y puntos > 0; si nadie marcó asistencia, todo el personal activo con puntos > 0.
 */
function shareCommonDay(db, date, amount, cfg) {
  const pts = db.prepare('SELECT id, active, COALESCE(tip_points, 1) AS points FROM employees').all();
  const pointsOf = new Map(pts.map(e => [e.id, Number(e.points)]));
  let people = db.prepare('SELECT employee_id AS id, COALESCE(SUM(hours), 0) AS hours FROM attendance WHERE date = ? GROUP BY employee_id').all(date)
    .filter(p => (pointsOf.get(p.id) ?? 1) > 0);
  if (!people.length) people = pts.filter(e => e.active && Number(e.points) > 0).map(e => ({ id: e.id, hours: 0 }));
  if (!people.length) return new Map();
  const weightOf = p => cfg.commonSplit === 'hours' ? (Number(p.hours) > 0 ? Number(p.hours) : 0) : cfg.commonSplit === 'points' ? (pointsOf.get(p.id) ?? 1) : 1;
  let weights = people.map(p => ({ id: p.id, w: weightOf(p) }));
  if (weights.every(x => x.w <= 0)) weights = people.map(p => ({ id: p.id, w: 1 })); // sin horas registradas: partes iguales
  const total = weights.reduce((a, x) => a + x.w, 0);
  const out = new Map();
  for (const x of weights) if (x.w > 0) out.set(x.id, Math.round((amount * x.w) / total));
  return out;
}

/** Propinas ganadas por un colaborador en el rango: directas + parte de la común (con detalle por día). */
function tipAccrual(db, empId, from, to, cfg = readTipsConfig(db)) {
  const direct = db.prepare('SELECT COALESCE(SUM(amount), 0) AS t FROM tips WHERE employee_id = ? AND date BETWEEN ? AND ?').get(empId, from, to).t;
  const commonByDate = db.prepare('SELECT date, SUM(amount) AS t FROM tips WHERE employee_id IS NULL AND date BETWEEN ? AND ? GROUP BY date ORDER BY date').all(from, to);
  let shared = 0;
  const sharedDetail = [];
  for (const row of commonByDate) {
    const shares = shareCommonDay(db, row.date, row.t, cfg);
    if (shares.has(empId)) { const share = shares.get(empId); shared += share; sharedDetail.push({ date: row.date, total: row.t, people: shares.size, share }); }
  }
  return { direct, shared, total: direct + shared, sharedDetail };
}

/** Lo que ya se le pagó de propinas hasta la fecha (abonos, liquidaciones de propinas y propinas dentro de la nómina). */
function tipsPaid(db, empId, to, from = '0000-01-01') {
  const payouts = db.prepare('SELECT COALESCE(SUM(amount), 0) AS t FROM tip_payouts WHERE employee_id = ? AND date BETWEEN ? AND ?').get(empId, from, to).t;
  const inPayroll = db.prepare('SELECT COALESCE(SUM(tips_total), 0) AS t FROM payroll_settlements WHERE employee_id = ? AND period_end BETWEEN ? AND ?').get(empId, from, to).t;
  return { payouts, inPayroll, total: payouts + inPayroll };
}

function tipBalance(db, empId, to, cfg = readTipsConfig(db)) {
  const accrued = tipAccrual(db, empId, '0000-01-01', to, cfg).total;
  const paid = tipsPaid(db, empId, to).total;
  return { accrued, paid, balance: accrued - paid };
}

/** Estado de cuenta de propinas de todo el personal para un período. */
function tipStatement(db, from, to) {
  const cfg = readTipsConfig(db);
  const emps = db.prepare('SELECT id, name, position, active, COALESCE(tip_points, 1) AS points FROM employees ORDER BY active DESC, name').all();
  const dayBefore = db.prepare("SELECT date(?, '-1 day') AS d").get(from).d;
  const rows = [];
  for (const e of emps) {
    const period = tipAccrual(db, e.id, from, to, cfg);
    const paidPeriod = tipsPaid(db, e.id, to, from);
    const before = tipBalance(db, e.id, dayBefore, cfg).balance;
    const balance = before + period.total - paidPeriod.total;
    if (!e.active && !period.total && !paidPeriod.total && !balance) continue;
    rows.push({ employeeId: e.id, name: e.name, position: e.position, active: Boolean(e.active), points: Number(e.points), previousBalance: before, direct: period.direct, shared: period.shared,
      accrued: period.total, paid: paidPeriod.total, paidInPayroll: paidPeriod.inPayroll, balance, sharedDetail: period.sharedDetail });
  }
  const pool = db.prepare('SELECT COALESCE(SUM(CASE WHEN employee_id IS NULL THEN amount ELSE 0 END), 0) AS common, COALESCE(SUM(CASE WHEN employee_id IS NOT NULL THEN amount ELSE 0 END), 0) AS direct FROM tips WHERE date BETWEEN ? AND ?').get(from, to);
  return { from, to, config: cfg, rows, totals: rows.reduce((a, r) => ({ accrued: a.accrued + r.accrued, paid: a.paid + r.paid, balance: a.balance + r.balance }), { accrued: 0, paid: 0, balance: 0 }), pool };
}

/* ======================= Novedades ======================= */
// group: extras (510515) · bonus (510548) · absence (resta sueldo) · deduction (136595: préstamos y descuentos)
const NOVELTY_TYPES = {
  holiday_worked: { label: 'Festivo o dominical trabajado', group: 'extras', unit: 'días', auto: true, help: 'Recargo de ley sobre el valor del día (90 % desde jul-2026, 100 % desde jul-2027).' },
  extra_day: { label: 'Horas extra diurnas', group: 'extras', unit: 'horas', auto: true, help: 'Valor hora + 25 %.' },
  extra_night: { label: 'Horas extra nocturnas', group: 'extras', unit: 'horas', auto: true, help: 'Valor hora + 75 %.' },
  night_surcharge: { label: 'Recargo nocturno', group: 'extras', unit: 'horas', auto: true, help: '35 % del valor hora (7 p. m. a 6 a. m.).' },
  bonus: { label: 'Bonificación', group: 'bonus', unit: 'valor' },
  commission: { label: 'Comisión', group: 'bonus', unit: 'valor' },
  incapacity: { label: 'Incapacidad (lo que paga la empresa)', group: 'bonus', unit: 'días', auto: true, help: '2/3 del valor del día (los dos primeros días los paga el empleador).' },
  vacation: { label: 'Vacaciones pagadas', group: 'bonus', unit: 'días', auto: true, help: 'Valor del día por cada día de vacaciones.' },
  other_income: { label: 'Otro pago', group: 'bonus', unit: 'valor' },
  task: { label: 'Adicional (armado de carne, lavado de campana...)', group: 'bonus', unit: 'veces', auto: true, help: 'Se paga la tarifa del adicional por cada vez que se hace.' },
  absence: { label: 'Falta / ausencia no pagada', group: 'absence', unit: 'días', auto: true, help: 'Descuenta el valor del día.' },
  unpaid_leave: { label: 'Licencia no remunerada', group: 'absence', unit: 'días', auto: true, help: 'Descuenta el valor del día.' },
  loan: { label: 'Cuota de préstamo', group: 'deduction', unit: 'valor' },
  damage: { label: 'Descuento autorizado (daños, faltantes)', group: 'deduction', unit: 'valor' },
  other_deduction: { label: 'Otro descuento', group: 'deduction', unit: 'valor' },
};
const SIGN = { extras: 1, bonus: 1, absence: -1, deduction: -1 };

function dayValue(emp, cfg) {
  const hpd = Number(emp.hoursPerDay) > 0 ? Number(emp.hoursPerDay) : cfg.hoursPerDay;
  switch (emp.payMode) {
    case 'monthly': return emp.baseAmount / 30;
    case 'biweekly': return emp.baseAmount / 15;
    case 'hourly': return emp.baseAmount * hpd;
    default: return emp.baseAmount;
  }
}

/** Calcula el valor sugerido de una novedad (el usuario puede escribir otro). */
function noveltyAmount(emp, type, quantity, date, cfg) {
  const t = NOVELTY_TYPES[type];
  if (!t || !t.auto) return { amount: null, pct: null };
  const q = Number(quantity) || 0;
  const hpd = Number(emp.hoursPerDay) > 0 ? Number(emp.hoursPerDay) : cfg.hoursPerDay;
  const hv = payroll.hourlyValue(emp, cfg, hpd);
  const dv = dayValue(emp, cfg);
  const sundayPct = cfg.sundayPct !== null && cfg.sundayPct !== undefined ? cfg.sundayPct : payroll.sundayPctFor(date);
  switch (type) {
    case 'holiday_worked': return { amount: Math.round(q * dv * sundayPct / 100), pct: sundayPct };
    case 'extra_day': return { amount: Math.round(q * hv * (1 + cfg.extraDayPct / 100)), pct: cfg.extraDayPct };
    case 'extra_night': return { amount: Math.round(q * hv * (1 + cfg.extraNightPct / 100)), pct: cfg.extraNightPct };
    case 'night_surcharge': return { amount: Math.round(q * hv * cfg.nightPct / 100), pct: cfg.nightPct };
    case 'incapacity': return { amount: Math.round(q * dv * 2 / 3), pct: 66.67 };
    case 'vacation':
    case 'absence':
    case 'unpaid_leave': return { amount: Math.round(q * dv), pct: 100 };
    default: return { amount: null, pct: null };
  }
}

const NOV_SELECT = `SELECT n.id, n.employee_id AS employeeId, e.name AS employeeName, n.label AS taskLabel, n.date, n.type, n.quantity, n.amount, n.pct, n.notes, n.settlement_id AS settlementId, n.created_by AS createdBy, n.created_at AS createdAt
  FROM payroll_novelties n JOIN employees e ON e.id = n.employee_id`;
const mapNovelty = r => { const t = NOVELTY_TYPES[r.type] || { label: r.type, group: 'bonus', unit: 'valor' }; return { ...r, label: r.taskLabel ? `${t.label.split(' (')[0]}: ${r.taskLabel}` : t.label, group: t.group, unit: t.unit, sign: SIGN[t.group] || 1, signedAmount: (SIGN[t.group] || 1) * r.amount }; };

/** Novedades pendientes (sin liquidar) del período, agrupadas para la liquidación. */
function noveltiesFor(db, empId, from, to, settlementId = null) {
  const rows = (settlementId
    ? db.prepare(`${NOV_SELECT} WHERE n.settlement_id = ? ORDER BY n.date, n.id`).all(settlementId)
    : db.prepare(`${NOV_SELECT} WHERE n.employee_id = ? AND n.date BETWEEN ? AND ? AND n.settlement_id IS NULL ORDER BY n.date, n.id`).all(empId, from, to)).map(mapNovelty);
  const sum = g => rows.filter(r => r.group === g).reduce((a, r) => a + r.amount, 0);
  return { rows, extras: sum('extras'), bonus: sum('bonus'), absence: sum('absence'), deductions: sum('deduction') };
}

module.exports = {
  initPayrollExtras, readTipsConfig, saveTipsConfig, shareCommonDay, tipAccrual, tipsPaid, tipBalance, tipStatement,
  NOVELTY_TYPES, noveltyAmount, noveltiesFor, mapNovelty, NOV_SELECT, dayValue,
  readTasks, saveTasks, loanPlan, applyLoanPlan, revertLoanPayments,
};
