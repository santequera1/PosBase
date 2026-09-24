const { Router } = require('express');
const { getDb } = require('../db');
const { requireRole } = require('../auth');
const { registerCashWithdrawal, removeCashMovementIfOpen, today, now, isDate } = require('../cashHelpers');
const payroll = require('../payroll');

const router = Router();
const ADMIN = requireRole('admin');
const STAFF = requireRole('admin', 'cashier');

const PAY_MODES = ['monthly', 'biweekly', 'per_shift', 'per_day', 'hourly'];
const PAY_MODE_LABEL = { monthly: 'Sueldo mensual', biweekly: 'Sueldo quincenal', per_shift: 'Pago por turno', per_day: 'Pago por día', hourly: 'Pago por hora' };
const UNIT_LABEL = { monthly: 'mes', biweekly: 'quincena', per_shift: 'turnos', per_day: 'días', hourly: 'horas' };

const EMP_SELECT = `SELECT id, user_id AS userId, name, document, phone, email, position, pay_mode AS payMode, base_amount AS baseAmount,
  start_date AS startDate, active, notes, created_at AS createdAt, hours_per_day AS hoursPerDay, overtime, legal_deductions AS legalDeductions,
  transport_allowance AS transportAllowance FROM employees`;
const ATT_SELECT = `SELECT a.id, a.employee_id AS employeeId, e.name AS employeeName, a.date, a.check_in AS checkIn, a.check_out AS checkOut,
  a.hours, a.shift_id AS shiftId, a.source, a.notes FROM attendance a JOIN employees e ON e.id = a.employee_id`;
const TIP_SELECT = `SELECT t.id, t.date, t.employee_id AS employeeId, e.name AS employeeName, t.amount, t.method, t.shift_id AS shiftId, t.notes, t.created_at AS createdAt
  FROM tips t LEFT JOIN employees e ON e.id = t.employee_id`;
const ADV_SELECT = `SELECT a.id, a.employee_id AS employeeId, e.name AS employeeName, a.date, a.amount, a.from_cash_register AS fromCashRegister,
  a.cash_movement_id AS cashMovementId, a.settled, a.settlement_id AS settlementId, a.notes, a.created_at AS createdAt
  FROM advances a JOIN employees e ON e.id = a.employee_id`;
const SET_SELECT = `SELECT s.id, s.employee_id AS employeeId, e.name AS employeeName, e.position, s.period_start AS periodStart, s.period_end AS periodEnd,
  s.pay_mode AS payMode, s.units, s.unit_amount AS unitAmount, s.base_total AS baseTotal, s.tips_total AS tipsTotal, s.advances_total AS advancesTotal,
  s.bonuses, s.deductions, s.total, s.status, s.paid_at AS paidAt, s.payment_method AS paymentMethod, s.expense_id AS expenseId, s.notes, s.created_at AS createdAt,
  s.extras_total AS extrasTotal, s.allowance_total AS allowanceTotal, s.legal_deductions_total AS legalDeductionsTotal, s.details
  FROM payroll_settlements s JOIN employees e ON e.id = s.employee_id`;

const mapEmp = r => ({ ...r, active: Boolean(r.active), payModeLabel: PAY_MODE_LABEL[r.payMode] || r.payMode, hoursPerDay: Number(r.hoursPerDay) > 0 ? Number(r.hoursPerDay) : 8,
  overtime: Boolean(r.overtime), legalDeductions: Boolean(r.legalDeductions), transportAllowance: Boolean(r.transportAllowance) });
const mapSet = r => { let details = null; try { details = r.details ? JSON.parse(r.details) : null; } catch { details = null; } return { ...r, details }; };
const mapAdv = r => ({ ...r, fromCashRegister: Boolean(r.fromCashRegister), settled: Boolean(r.settled) });

/* ------------------------------------------------------------------ */
/* Colaboradores                                                        */
/* ------------------------------------------------------------------ */
router.get('/employees', STAFF, (req, res) => {
  const db = getDb();
  const all = req.query.all === '1';
  const rows = db.prepare(`${EMP_SELECT} ${all ? '' : 'WHERE active = 1'} ORDER BY active DESC, name`).all();
  const monthStart = `${today(db).slice(0, 7)}-01`;
  const att = Object.fromEntries(db.prepare('SELECT employee_id AS id, COUNT(*) AS c, COALESCE(SUM(hours), 0) AS h FROM attendance WHERE date >= ? GROUP BY employee_id').all(monthStart).map(r => [r.id, r]));
  const adv = Object.fromEntries(db.prepare('SELECT employee_id AS id, COALESCE(SUM(amount), 0) AS t FROM advances WHERE settled = 0 GROUP BY employee_id').all().map(r => [r.id, r.t]));
  res.json(rows.map(r => ({ ...mapEmp(r), monthAttendance: att[r.id]?.c || 0, monthHours: Math.round((att[r.id]?.h || 0) * 10) / 10, unsettledAdvances: adv[r.id] || 0 })));
});

function employeePayload(body, cur = {}) {
  const payMode = body.payMode !== undefined ? String(body.payMode) : (cur.payMode || 'per_shift');
  return {
    userId: body.userId !== undefined ? (body.userId ? Number(body.userId) : null) : (cur.userId ?? null),
    name: body.name !== undefined ? String(body.name).trim() : (cur.name || ''),
    document: body.document !== undefined ? String(body.document).trim() : (cur.document || ''),
    phone: body.phone !== undefined ? String(body.phone).trim() : (cur.phone || ''),
    email: body.email !== undefined ? String(body.email).trim() : (cur.email || ''),
    position: body.position !== undefined ? String(body.position).trim() : (cur.position || 'Cajero'),
    payMode,
    baseAmount: body.baseAmount !== undefined ? Math.round(Number(body.baseAmount) || 0) : (cur.baseAmount || 0),
    startDate: body.startDate !== undefined ? (isDate(body.startDate) ? body.startDate : null) : (cur.startDate || null),
    active: body.active !== undefined ? (body.active ? 1 : 0) : (cur.active === undefined ? 1 : (cur.active ? 1 : 0)),
    notes: body.notes !== undefined ? String(body.notes).trim() : (cur.notes || ''),
    hoursPerDay: body.hoursPerDay !== undefined ? Math.min(16, Math.max(1, Number(body.hoursPerDay) || 8)) : (Number(cur.hoursPerDay) > 0 ? Number(cur.hoursPerDay) : 8),
    overtime: body.overtime !== undefined ? (body.overtime ? 1 : 0) : (cur.overtime === undefined ? 1 : (cur.overtime ? 1 : 0)),
    legalDeductions: body.legalDeductions !== undefined ? (body.legalDeductions ? 1 : 0) : (cur.legalDeductions ? 1 : 0),
    transportAllowance: body.transportAllowance !== undefined ? (body.transportAllowance ? 1 : 0) : (cur.transportAllowance ? 1 : 0),
  };
}

router.post('/employees', ADMIN, (req, res) => {
  const db = getDb();
  const p = employeePayload(req.body);
  if (p.name.length < 2) return res.status(400).json({ error: 'El nombre es requerido' });
  if (!PAY_MODES.includes(p.payMode)) return res.status(400).json({ error: 'Modalidad de pago inválida' });
  if (p.userId && !db.prepare('SELECT id FROM users WHERE id = ?').get(p.userId)) return res.status(400).json({ error: 'Usuario de acceso no encontrado' });
  const info = db.prepare(`INSERT INTO employees (user_id, name, document, phone, email, position, pay_mode, base_amount, start_date, active, notes, hours_per_day, overtime, legal_deductions, transport_allowance)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(p.userId, p.name, p.document, p.phone, p.email, p.position, p.payMode, p.baseAmount, p.startDate, p.active, p.notes, p.hoursPerDay, p.overtime, p.legalDeductions, p.transportAllowance);
  res.status(201).json({ ...mapEmp(db.prepare(`${EMP_SELECT} WHERE id = ?`).get(info.lastInsertRowid)), monthAttendance: 0, monthHours: 0, unsettledAdvances: 0 });
});

router.put('/employees/:id', ADMIN, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const cur = db.prepare(`${EMP_SELECT} WHERE id = ?`).get(id);
  if (!cur) return res.status(404).json({ error: 'Colaborador no encontrado' });
  const p = employeePayload(req.body, cur);
  if (p.name.length < 2) return res.status(400).json({ error: 'El nombre es requerido' });
  if (!PAY_MODES.includes(p.payMode)) return res.status(400).json({ error: 'Modalidad de pago inválida' });
  db.prepare(`UPDATE employees SET user_id = ?, name = ?, document = ?, phone = ?, email = ?, position = ?, pay_mode = ?, base_amount = ?, start_date = ?, active = ?, notes = ?,
    hours_per_day = ?, overtime = ?, legal_deductions = ?, transport_allowance = ? WHERE id = ?`)
    .run(p.userId, p.name, p.document, p.phone, p.email, p.position, p.payMode, p.baseAmount, p.startDate, p.active, p.notes, p.hoursPerDay, p.overtime, p.legalDeductions, p.transportAllowance, id);
  res.json(mapEmp(db.prepare(`${EMP_SELECT} WHERE id = ?`).get(id)));
});

router.delete('/employees/:id', ADMIN, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM employees WHERE id = ?').get(id)) return res.status(404).json({ error: 'Colaborador no encontrado' });
  const refs = ['attendance', 'tips', 'advances', 'payroll_settlements'].reduce((n, t) => n + db.prepare(`SELECT COUNT(*) AS c FROM ${t} WHERE employee_id = ?`).get(id).c, 0);
  if (refs > 0) {
    db.prepare('UPDATE employees SET active = 0 WHERE id = ?').run(id);
    return res.json({ success: true, deactivated: true, message: 'El colaborador tiene historial; se marcó como inactivo' });
  }
  db.prepare('DELETE FROM employees WHERE id = ?').run(id);
  res.json({ success: true, deleted: true });
});

/* ------------------------------------------------------------------ */
/* Asistencia                                                           */
/* ------------------------------------------------------------------ */
router.get('/attendance', STAFF, (req, res) => {
  const db = getDb();
  const from = isDate(req.query.from) ? req.query.from : `${today(db).slice(0, 7)}-01`;
  const to = isDate(req.query.to) ? req.query.to : today(db);
  let sql = `${ATT_SELECT} WHERE a.date BETWEEN ? AND ?`;
  const params = [from, to];
  if (req.query.employeeId) { sql += ' AND a.employee_id = ?'; params.push(Number(req.query.employeeId)); }
  sql += ' ORDER BY a.date DESC, e.name';
  res.json(db.prepare(sql).all(...params));
});

router.post('/attendance', STAFF, (req, res) => {
  const db = getDb();
  const employeeId = Number(req.body.employeeId);
  const date = isDate(req.body.date) ? req.body.date : today(db);
  if (!db.prepare('SELECT id FROM employees WHERE id = ?').get(employeeId)) return res.status(400).json({ error: 'Colaborador no encontrado' });
  const checkIn = req.body.checkIn ? `${date} ${String(req.body.checkIn).slice(0, 5)}:00` : null;
  const checkOut = req.body.checkOut ? `${date} ${String(req.body.checkOut).slice(0, 5)}:00` : null;
  let hours = req.body.hours !== undefined && req.body.hours !== '' ? Number(req.body.hours) : 0;
  if (!hours && checkIn && checkOut) {
    const h = db.prepare('SELECT ROUND((julianday(?) - julianday(?)) * 24, 2) AS h').get(checkOut, checkIn).h;
    hours = h > 0 ? h : 0;
  }
  db.prepare(`INSERT INTO attendance (employee_id, date, check_in, check_out, hours, source, notes) VALUES (?, ?, ?, ?, ?, 'manual', ?)
    ON CONFLICT(employee_id, date) DO UPDATE SET check_in = COALESCE(excluded.check_in, attendance.check_in), check_out = COALESCE(excluded.check_out, attendance.check_out),
    hours = CASE WHEN excluded.hours > 0 THEN excluded.hours ELSE attendance.hours END, notes = excluded.notes`)
    .run(employeeId, date, checkIn, checkOut, hours, String(req.body.notes || '').trim());
  res.status(201).json(db.prepare(`${ATT_SELECT} WHERE a.employee_id = ? AND a.date = ?`).get(employeeId, date));
});

router.delete('/attendance/:id', ADMIN, (req, res) => {
  getDb().prepare('DELETE FROM attendance WHERE id = ?').run(Number(req.params.id));
  res.json({ success: true });
});

/* ------------------------------------------------------------------ */
/* Propinas                                                             */
/* ------------------------------------------------------------------ */
router.get('/tips', STAFF, (req, res) => {
  const db = getDb();
  const from = isDate(req.query.from) ? req.query.from : `${today(db).slice(0, 7)}-01`;
  const to = isDate(req.query.to) ? req.query.to : today(db);
  const rows = db.prepare(`${TIP_SELECT} WHERE t.date BETWEEN ? AND ? ORDER BY t.date DESC, t.id DESC`).all(from, to);
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const common = rows.filter(r => !r.employeeId).reduce((a, r) => a + r.amount, 0);
  res.json({ tips: rows, total, common, direct: total - common });
});

router.post('/tips', STAFF, (req, res) => {
  const db = getDb();
  const amount = Math.round(Number(req.body.amount));
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'El monto debe ser mayor a cero' });
  const date = isDate(req.body.date) ? req.body.date : today(db);
  const employeeId = req.body.employeeId ? Number(req.body.employeeId) : null;
  if (employeeId && !db.prepare('SELECT id FROM employees WHERE id = ?').get(employeeId)) return res.status(400).json({ error: 'Colaborador no encontrado' });
  const method = ['cash', 'card', 'transfer'].includes(req.body.method) ? req.body.method : 'cash';
  const shift = db.prepare("SELECT id FROM cash_shifts WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1").get();
  const info = db.prepare('INSERT INTO tips (date, employee_id, amount, method, shift_id, notes) VALUES (?, ?, ?, ?, ?, ?)')
    .run(date, employeeId, amount, method, shift ? shift.id : null, String(req.body.notes || '').trim());
  res.status(201).json(db.prepare(`${TIP_SELECT} WHERE t.id = ?`).get(info.lastInsertRowid));
});

router.delete('/tips/:id', ADMIN, (req, res) => {
  getDb().prepare('DELETE FROM tips WHERE id = ?').run(Number(req.params.id));
  res.json({ success: true });
});

/* ------------------------------------------------------------------ */
/* Anticipos                                                            */
/* ------------------------------------------------------------------ */
router.get('/advances', STAFF, (req, res) => {
  const db = getDb();
  let sql = `${ADV_SELECT} WHERE 1=1`;
  const params = [];
  if (req.query.employeeId) { sql += ' AND a.employee_id = ?'; params.push(Number(req.query.employeeId)); }
  if (req.query.unsettled === '1') sql += ' AND a.settled = 0';
  if (isDate(req.query.from)) { sql += ' AND a.date >= ?'; params.push(req.query.from); }
  if (isDate(req.query.to)) { sql += ' AND a.date <= ?'; params.push(req.query.to); }
  sql += ' ORDER BY a.date DESC, a.id DESC LIMIT 300';
  const rows = db.prepare(sql).all(...params).map(mapAdv);
  res.json({ advances: rows, total: rows.reduce((a, r) => a + r.amount, 0), unsettledTotal: rows.filter(r => !r.settled).reduce((a, r) => a + r.amount, 0) });
});

router.post('/advances', STAFF, (req, res) => {
  const db = getDb();
  const employeeId = Number(req.body.employeeId);
  const emp = db.prepare(`${EMP_SELECT} WHERE id = ?`).get(employeeId);
  if (!emp) return res.status(400).json({ error: 'Colaborador no encontrado' });
  const amount = Math.round(Number(req.body.amount));
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'El monto debe ser mayor a cero' });
  const date = isDate(req.body.date) ? req.body.date : today(db);
  const fromCash = Boolean(req.body.fromCashRegister);
  let cashMovementId = null;
  if (fromCash) {
    const r = registerCashWithdrawal(db, amount, `Anticipo de sueldo: ${emp.name}`, req.user?.name);
    if (r.error) return res.status(400).json({ error: r.error });
    cashMovementId = r.id;
  }
  const info = db.prepare('INSERT INTO advances (employee_id, date, amount, from_cash_register, cash_movement_id, notes) VALUES (?, ?, ?, ?, ?, ?)')
    .run(employeeId, date, amount, fromCash ? 1 : 0, cashMovementId, String(req.body.notes || '').trim());
  res.status(201).json(mapAdv(db.prepare(`${ADV_SELECT} WHERE a.id = ?`).get(info.lastInsertRowid)));
});

router.delete('/advances/:id', ADMIN, (req, res) => {
  const db = getDb();
  const cur = db.prepare(`${ADV_SELECT} WHERE a.id = ?`).get(Number(req.params.id));
  if (!cur) return res.status(404).json({ error: 'Anticipo no encontrado' });
  if (cur.settled) return res.status(400).json({ error: 'Este anticipo ya fue descontado en una liquidación' });
  removeCashMovementIfOpen(db, cur.cashMovementId);
  db.prepare('DELETE FROM advances WHERE id = ?').run(cur.id);
  res.json({ success: true });
});

/* ------------------------------------------------------------------ */
/* Liquidaciones                                                        */
/* ------------------------------------------------------------------ */
function computeSettlement(db, emp, from, to) {
  const attendance = db.prepare('SELECT date, check_in AS checkIn, check_out AS checkOut, hours, source FROM attendance WHERE employee_id = ? AND date BETWEEN ? AND ? ORDER BY date').all(emp.id, from, to);
  let units, unitAmount = emp.baseAmount, baseTotal;
  switch (emp.payMode) {
    case 'monthly':
    case 'biweekly':
      units = 1; baseTotal = emp.baseAmount; break;
    case 'hourly':
      units = Math.round(attendance.reduce((a, r) => a + (Number(r.hours) || 0), 0) * 100) / 100;
      baseTotal = Math.round(units * emp.baseAmount); break;
    case 'per_day':
    case 'per_shift':
    default:
      units = attendance.length; baseTotal = units * emp.baseAmount;
  }

  const tipsDirect = db.prepare('SELECT COALESCE(SUM(amount), 0) AS t FROM tips WHERE employee_id = ? AND date BETWEEN ? AND ?').get(emp.id, from, to).t;
  const commonByDate = db.prepare('SELECT date, SUM(amount) AS t FROM tips WHERE employee_id IS NULL AND date BETWEEN ? AND ? GROUP BY date').all(from, to);
  const activeCount = db.prepare('SELECT COUNT(*) AS c FROM employees WHERE active = 1').get().c;
  let tipsShared = 0;
  const sharedDetail = [];
  for (const row of commonByDate) {
    const present = db.prepare('SELECT employee_id AS id FROM attendance WHERE date = ?').all(row.date).map(r => r.id);
    let n = present.length, included = present.includes(emp.id);
    if (n === 0) { n = activeCount; included = Boolean(emp.active); }
    if (included && n > 0) { const share = Math.round(row.t / n); tipsShared += share; sharedDetail.push({ date: row.date, total: row.t, people: n, share }); }
  }
  const tipsTotal = tipsDirect + tipsShared;
  const advances = db.prepare(`${ADV_SELECT} WHERE a.employee_id = ? AND a.settled = 0 AND a.date <= ? ORDER BY a.date`).all(emp.id, to).map(mapAdv);
  const advancesTotal = advances.reduce((a, r) => a + r.amount, 0);

  // Horas extra, recargos nocturnos/dominicales, auxilio de transporte y deducciones de ley (salud y pensión)
  const cfg = payroll.readConfig(db);
  const extras = emp.overtime ? payroll.computeExtras(emp, attendance, cfg, to) : { ...payroll.computeExtras(emp, [], cfg, to), disabled: true };
  const extrasTotal = extras.extrasTotal;
  const allowance = payroll.computeAllowance(emp, cfg, from, to, attendance.length);
  const salaryBase = baseTotal + extrasTotal;
  const legalDeductions = payroll.computeLegalDeductions(emp, cfg, salaryBase);

  return {
    employee: mapEmp(emp), periodStart: from, periodEnd: to, payMode: emp.payMode, payModeLabel: PAY_MODE_LABEL[emp.payMode], unitLabel: UNIT_LABEL[emp.payMode],
    units, unitAmount, baseTotal, attendance, tipsDirect, tipsShared, sharedDetail, tipsTotal, advances, advancesTotal,
    extras, extrasTotal, allowance, allowanceTotal: allowance.amount, salaryBase, legalDeductions, legalDeductionsTotal: legalDeductions.total, config: cfg,
    subtotal: baseTotal + extrasTotal + allowance.amount + tipsTotal - advancesTotal - legalDeductions.total,
  };
}

router.get('/settlements/preview', ADMIN, (req, res) => {
  const db = getDb();
  const emp = db.prepare(`${EMP_SELECT} WHERE id = ?`).get(Number(req.query.employeeId));
  if (!emp) return res.status(404).json({ error: 'Colaborador no encontrado' });
  const { from, to } = req.query;
  if (!isDate(from) || !isDate(to) || from > to) return res.status(400).json({ error: 'Período inválido' });
  res.json(computeSettlement(db, emp, from, to));
});

router.get('/settlements', ADMIN, (req, res) => {
  const db = getDb();
  let sql = `${SET_SELECT} WHERE 1=1`;
  const params = [];
  if (req.query.employeeId) { sql += ' AND s.employee_id = ?'; params.push(Number(req.query.employeeId)); }
  if (req.query.status === 'pending' || req.query.status === 'paid') { sql += ' AND s.status = ?'; params.push(req.query.status); }
  sql += ' ORDER BY s.period_end DESC, s.id DESC LIMIT 200';
  res.json(db.prepare(sql).all(...params).map(mapSet));
});

router.post('/settlements', ADMIN, (req, res) => {
  const db = getDb();
  const emp = db.prepare(`${EMP_SELECT} WHERE id = ?`).get(Number(req.body.employeeId));
  if (!emp) return res.status(404).json({ error: 'Colaborador no encontrado' });
  const { from, to } = req.body;
  if (!isDate(from) || !isDate(to) || from > to) return res.status(400).json({ error: 'Período inválido' });
  const overlap = db.prepare("SELECT id FROM payroll_settlements WHERE employee_id = ? AND NOT (period_end < ? OR period_start > ?)").get(emp.id, from, to);
  if (overlap) return res.status(409).json({ error: 'Ya existe una liquidación que se cruza con ese período para este colaborador' });
  const c = computeSettlement(db, emp, from, to);
  const bonuses = Math.max(0, Math.round(Number(req.body.bonuses) || 0));
  const deductions = Math.max(0, Math.round(Number(req.body.deductions) || 0));
  const total = c.baseTotal + c.extrasTotal + c.allowanceTotal + c.tipsTotal + bonuses - c.advancesTotal - c.legalDeductionsTotal - deductions;
  const details = JSON.stringify({
    extras: c.extras.lines, hours: c.extras.hoursSummary, hourlyValue: c.extras.hourlyValue, hoursPerDay: c.extras.hoursPerDay, sundayPct: c.extras.sundayPct,
    allowance: c.allowance, legalDeductions: c.legalDeductions.lines, salaryBase: c.salaryBase, tipsDirect: c.tipsDirect, tipsShared: c.tipsShared,
  });
  const info = db.prepare(`INSERT INTO payroll_settlements (employee_id, period_start, period_end, pay_mode, units, unit_amount, base_total, tips_total, advances_total, bonuses, deductions, total, status, notes,
    extras_total, allowance_total, legal_deductions_total, details)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`)
    .run(emp.id, from, to, emp.payMode, c.units, c.unitAmount, c.baseTotal, c.tipsTotal, c.advancesTotal, bonuses, deductions, total, String(req.body.notes || '').trim(),
      c.extrasTotal, c.allowanceTotal, c.legalDeductionsTotal, details);
  const id = Number(info.lastInsertRowid);
  if (c.advances.length) db.prepare(`UPDATE advances SET settled = 1, settlement_id = ? WHERE id IN (${c.advances.map(() => '?').join(',')})`).run(id, ...c.advances.map(a => a.id));
  res.status(201).json(mapSet(db.prepare(`${SET_SELECT} WHERE s.id = ?`).get(id)));
});

router.post('/settlements/:id/pay', ADMIN, (req, res) => {
  const db = getDb();
  const cur = db.prepare(`${SET_SELECT} WHERE s.id = ?`).get(Number(req.params.id));
  if (!cur) return res.status(404).json({ error: 'Liquidación no encontrada' });
  if (cur.status === 'paid') return res.status(400).json({ error: 'Esta liquidación ya está pagada' });
  const paymentMethod = ['cash', 'transfer', 'card'].includes(req.body.paymentMethod) ? req.body.paymentMethod : 'cash';
  const fromCash = Boolean(req.body.fromCashRegister) && paymentMethod === 'cash';
  let cashMovementId = null;
  if (fromCash && cur.total > 0) {
    const r = registerCashWithdrawal(db, cur.total, `Pago de nómina: ${cur.employeeName}`, req.user?.name);
    if (r.error) return res.status(400).json({ error: r.error });
    cashMovementId = r.id;
  }
  const cat = db.prepare("SELECT id FROM expense_categories WHERE kind = 'payroll' ORDER BY id LIMIT 1").get() || db.prepare('SELECT id FROM expense_categories ORDER BY id LIMIT 1').get();
  const t = today(db);
  let expenseId = null;
  if (cur.total > 0 && cat) {
    const info = db.prepare(`INSERT INTO expenses (date, category_id, description, amount, payment_method, status, paid_at, from_cash_register, cash_movement_id, source, reference_id, created_by, notes)
      VALUES (?, ?, ?, ?, ?, 'paid', ?, ?, ?, 'payroll', ?, ?, ?)`)
      .run(t, cat.id, `Nómina: ${cur.employeeName} (${cur.periodStart} a ${cur.periodEnd})`, cur.total, paymentMethod, now(db), fromCash ? 1 : 0, cashMovementId, cur.id, req.user?.name || '', cur.notes || '');
    expenseId = Number(info.lastInsertRowid);
  }
  db.prepare("UPDATE payroll_settlements SET status = 'paid', paid_at = ?, payment_method = ?, expense_id = ? WHERE id = ?").run(now(db), paymentMethod, expenseId, cur.id);
  res.json(mapSet(db.prepare(`${SET_SELECT} WHERE s.id = ?`).get(cur.id)));
});

router.delete('/settlements/:id', ADMIN, (req, res) => {
  const db = getDb();
  const cur = db.prepare(`${SET_SELECT} WHERE s.id = ?`).get(Number(req.params.id));
  if (!cur) return res.status(404).json({ error: 'Liquidación no encontrada' });
  if (cur.expenseId) {
    const exp = db.prepare('SELECT id, cash_movement_id AS cm FROM expenses WHERE id = ?').get(cur.expenseId);
    if (exp) { removeCashMovementIfOpen(db, exp.cm); db.prepare('DELETE FROM expenses WHERE id = ?').run(exp.id); }
  }
  db.prepare('UPDATE advances SET settled = 0, settlement_id = NULL WHERE settlement_id = ?').run(cur.id);
  db.prepare('DELETE FROM payroll_settlements WHERE id = ?').run(cur.id);
  res.json({ success: true });
});

/* ------------------------------------------------------------------ */
/* Resumen                                                              */
/* ------------------------------------------------------------------ */
router.get('/summary', ADMIN, (req, res) => {
  const db = getDb();
  const t = today(db);
  const monthStart = `${t.slice(0, 7)}-01`;
  res.json({
    activeEmployees: db.prepare('SELECT COUNT(*) AS c FROM employees WHERE active = 1').get().c,
    presentToday: db.prepare('SELECT COUNT(*) AS c FROM attendance WHERE date = ?').get(t).c,
    monthTips: db.prepare('SELECT COALESCE(SUM(amount), 0) AS t FROM tips WHERE date >= ?').get(monthStart).t,
    unsettledAdvances: db.prepare('SELECT COALESCE(SUM(amount), 0) AS t FROM advances WHERE settled = 0').get().t,
    pendingSettlements: db.prepare("SELECT COALESCE(SUM(total), 0) AS t, COUNT(*) AS c FROM payroll_settlements WHERE status = 'pending'").get(),
    monthPayrollPaid: db.prepare("SELECT COALESCE(SUM(total), 0) AS t FROM payroll_settlements WHERE status = 'paid' AND paid_at >= ?").get(monthStart).t,
    payModes: PAY_MODE_LABEL,
  });
});

/* ------------------------------------------------------------------ */
/* Parámetros de nómina (jornada, recargos, salario mínimo...)          */
/* ------------------------------------------------------------------ */
router.get('/payroll-config', STAFF, (req, res) => res.json({ ...payroll.readConfig(getDb()), defaults: payroll.DEFAULT_CONFIG }));
router.put('/payroll-config', ADMIN, (req, res) => {
  try { res.json({ ...payroll.saveConfig(getDb(), req.body || {}), defaults: payroll.DEFAULT_CONFIG }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
router.get('/holidays/:year', STAFF, (req, res) => {
  const year = Number(req.params.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return res.status(400).json({ error: 'Año inválido' });
  res.json([...payroll.colombianHolidays(year)].sort());
});

module.exports = router;
