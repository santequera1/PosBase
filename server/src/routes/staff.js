const { Router } = require('express');
const { getDb } = require('../db');
const { requireRole, requirePerm, hasView } = require('../auth');
const { registerCashWithdrawal, removeCashMovementIfOpen, today, now, isDate } = require('../cashHelpers');
const payroll = require('../payroll');
const PX = require('../payrollExtras');
const EI = require('../employeeImport');
const L = require('../ledger');

const router = Router();
// Personal completo exige la sección 'Personal'; quien maneja la caja puede registrar propinas, anticipos y asistencia y consultar la lista de colaboradores
const CASH_OPS = ['GET /employees', 'GET /tips', 'POST /tips', 'GET /advances', 'POST /advances', 'GET /attendance', 'POST /attendance', 'GET /tips/config', 'GET /tips/statement', 'GET /tips/payouts', 'POST /tips/payouts'];
router.use((req, res, next) => {
  if (hasView(req.user, 'staff')) return next();
  if (hasView(req.user, 'shift') && CASH_OPS.includes(req.method + ' ' + req.path.replace(/[/]+$/, ''))) return next();
  return res.status(403).json({ error: 'No tienes permiso para esta sección o acción. Pídele acceso al administrador.', permission: 'staff' });
});
router.use(L.syncOnWrite(getDb));
const ADMIN = requireRole('admin');
const STAFF = requireRole('admin', 'cashier');

const PAY_MODES = ['monthly', 'biweekly', 'per_shift', 'per_day', 'hourly'];
const PAY_MODE_LABEL = { monthly: 'Sueldo mensual', biweekly: 'Sueldo quincenal', per_shift: 'Pago por turno', per_day: 'Pago por día', hourly: 'Pago por hora' };
const UNIT_LABEL = { monthly: 'mes', biweekly: 'quincena', per_shift: 'turnos', per_day: 'días', hourly: 'horas' };

const EMP_SELECT = `SELECT id, user_id AS userId, name, document, phone, email, position, pay_mode AS payMode, base_amount AS baseAmount,
  start_date AS startDate, active, notes, created_at AS createdAt, hours_per_day AS hoursPerDay, overtime, legal_deductions AS legalDeductions,
  transport_allowance AS transportAllowance, COALESCE(tip_points, 1) AS tipPoints FROM employees`;
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
  s.extras_total AS extrasTotal, s.allowance_total AS allowanceTotal, s.legal_deductions_total AS legalDeductionsTotal, s.details,
  s.novelties_extras AS noveltiesExtras, s.novelties_bonus AS noveltiesBonus, s.novelties_absence AS noveltiesAbsence, s.novelties_deductions AS noveltiesDeductions
  FROM payroll_settlements s JOIN employees e ON e.id = s.employee_id`;

const mapEmp = r => ({ ...r, active: Boolean(r.active), payModeLabel: PAY_MODE_LABEL[r.payMode] || r.payMode, hoursPerDay: Number(r.hoursPerDay) > 0 ? Number(r.hoursPerDay) : 8,
  overtime: Boolean(r.overtime), legalDeductions: Boolean(r.legalDeductions), transportAllowance: Boolean(r.transportAllowance), tipPoints: Number(r.tipPoints ?? 1) });
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
    tipPoints: body.tipPoints !== undefined && body.tipPoints !== '' && body.tipPoints !== null ? Math.min(100, Math.max(0, Number(body.tipPoints) || 0)) : (cur.tipPoints !== undefined ? Number(cur.tipPoints) : 1),
  };
}

function insertEmployee(db, p) {
  return db.prepare(`INSERT INTO employees (user_id, name, document, phone, email, position, pay_mode, base_amount, start_date, active, notes, hours_per_day, overtime, legal_deductions, transport_allowance, tip_points)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(p.userId, p.name, p.document, p.phone, p.email, p.position, p.payMode, p.baseAmount, p.startDate, p.active, p.notes, p.hoursPerDay, p.overtime, p.legalDeductions, p.transportAllowance, p.tipPoints);
}

/* ------------------------------------------------------------------ */
/* Importar colaboradores desde Excel                                   */
/* ------------------------------------------------------------------ */
router.post('/employees/import', ADMIN, (req, res) => {
  const db = getDb();
  const rows = Array.isArray(req.body.rows) ? req.body.rows.slice(0, 500) : [];
  const dryRun = Boolean(req.body.dryRun);
  const result = { created: 0, updated: 0, errors: [], preview: [] };
  const seen = new Set();
  const tx = db.transaction(() => {
    rows.forEach((raw, i) => {
      if (EI.isEmptyRow(raw)) return;
      const line = Number(raw && raw._line) || i + 2;
      const { body, error } = EI.normalizeRow(raw);
      if (error) { result.errors.push({ line, name: body.name || '', error }); return; }
      const key = (body.document || body.name).toLowerCase();
      if (seen.has(key)) { result.errors.push({ line, name: body.name, error: 'Repetido en el archivo' }); return; }
      seen.add(key);
      const cur = (body.document ? db.prepare(`${EMP_SELECT} WHERE document = ? AND document != ''`).get(body.document) : null)
        || db.prepare(`${EMP_SELECT} WHERE lower(trim(name)) = lower(?)`).get(body.name);
      const p = employeePayload(body, cur ? mapEmp(cur) : {});
      if (!PAY_MODES.includes(p.payMode)) { result.errors.push({ line, name: p.name, error: 'Forma de pago inválida' }); return; }
      result.preview.push({ line, action: cur ? 'update' : 'create', name: p.name, document: p.document, position: p.position, payModeLabel: PAY_MODE_LABEL[p.payMode], baseAmount: p.baseAmount });
      if (dryRun) { if (cur) result.updated++; else result.created++; return; }
      if (cur) {
        db.prepare(`UPDATE employees SET name = ?, document = ?, phone = ?, email = ?, position = ?, pay_mode = ?, base_amount = ?, start_date = ?, active = 1, notes = ?,
          hours_per_day = ?, overtime = ?, legal_deductions = ?, transport_allowance = ?, tip_points = ? WHERE id = ?`)
          .run(p.name, p.document, p.phone, p.email, p.position, p.payMode, p.baseAmount, p.startDate, p.notes, p.hoursPerDay, p.overtime, p.legalDeductions, p.transportAllowance, p.tipPoints, cur.id);
        result.updated++;
      } else { insertEmployee(db, p); result.created++; }
    });
  });
  tx();
  res.json(result);
});

router.post('/employees', ADMIN, (req, res) => {
  const db = getDb();
  const p = employeePayload(req.body);
  if (p.name.length < 2) return res.status(400).json({ error: 'El nombre es requerido' });
  if (!PAY_MODES.includes(p.payMode)) return res.status(400).json({ error: 'Modalidad de pago inválida' });
  if (p.userId && !db.prepare('SELECT id FROM users WHERE id = ?').get(p.userId)) return res.status(400).json({ error: 'Usuario de acceso no encontrado' });
  const info = insertEmployee(db, p);
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
    hours_per_day = ?, overtime = ?, legal_deductions = ?, transport_allowance = ?, tip_points = ? WHERE id = ?`)
    .run(p.userId, p.name, p.document, p.phone, p.email, p.position, p.payMode, p.baseAmount, p.startDate, p.active, p.notes, p.hoursPerDay, p.overtime, p.legalDeductions, p.transportAllowance, p.tipPoints, id);
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

  // Propinas: si se pagan aparte (Personal → Propinas) no entran a la liquidación de nómina
  const tipsCfg = PX.readTipsConfig(db);
  const acc = PX.tipAccrual(db, emp.id, from, to, tipsCfg);
  const tipsDirect = acc.direct, tipsShared = acc.shared, sharedDetail = acc.sharedDetail;
  const tipsSeparate = tipsCfg.payout === 'separate';
  const tipsTotal = tipsSeparate ? 0 : acc.total;
  // Novedades del período (festivos, extras manuales, bonificaciones, faltas, préstamos...)
  const novelties = PX.noveltiesFor(db, emp.id, from, to);
  const advances = db.prepare(`${ADV_SELECT} WHERE a.employee_id = ? AND a.settled = 0 AND a.date <= ? ORDER BY a.date`).all(emp.id, to).map(mapAdv);
  const advancesTotal = advances.reduce((a, r) => a + r.amount, 0);

  // Horas extra, recargos nocturnos/dominicales, auxilio de transporte y deducciones de ley (salud y pensión)
  const cfg = payroll.readConfig(db);
  const extras = emp.overtime ? payroll.computeExtras(emp, attendance, cfg, to) : { ...payroll.computeExtras(emp, [], cfg, to), disabled: true };
  const extrasTotal = extras.extrasTotal;
  const allowance = payroll.computeAllowance(emp, cfg, from, to, attendance.length);
  const salaryBase = Math.max(0, baseTotal + extrasTotal + novelties.extras + novelties.bonus - novelties.absence);
  const legalDeductions = payroll.computeLegalDeductions(emp, cfg, salaryBase);

  return {
    employee: mapEmp(emp), periodStart: from, periodEnd: to, payMode: emp.payMode, payModeLabel: PAY_MODE_LABEL[emp.payMode], unitLabel: UNIT_LABEL[emp.payMode],
    units, unitAmount, baseTotal, attendance, tipsDirect, tipsShared, sharedDetail, tipsTotal, tipsSeparate, tipsAccrued: acc.total, advances, advancesTotal,
    extras, extrasTotal, allowance, allowanceTotal: allowance.amount, salaryBase, legalDeductions, legalDeductionsTotal: legalDeductions.total, config: cfg,
    novelties: novelties.rows, noveltiesExtras: novelties.extras, noveltiesBonus: novelties.bonus, noveltiesAbsence: novelties.absence, noveltiesDeductions: novelties.deductions,
    subtotal: baseTotal + extrasTotal + allowance.amount + tipsTotal + novelties.extras + novelties.bonus - novelties.absence - novelties.deductions - advancesTotal - legalDeductions.total,
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
  const total = c.baseTotal + c.extrasTotal + c.allowanceTotal + c.tipsTotal + bonuses + c.noveltiesExtras + c.noveltiesBonus - c.noveltiesAbsence - c.noveltiesDeductions - c.advancesTotal - c.legalDeductionsTotal - deductions;
  const details = JSON.stringify({
    extras: c.extras.lines, hours: c.extras.hoursSummary, hourlyValue: c.extras.hourlyValue, hoursPerDay: c.extras.hoursPerDay, sundayPct: c.extras.sundayPct,
    allowance: c.allowance, legalDeductions: c.legalDeductions.lines, salaryBase: c.salaryBase, tipsDirect: c.tipsDirect, tipsShared: c.tipsShared, tipsSeparate: c.tipsSeparate,
    novelties: c.novelties.map(n => ({ id: n.id, date: n.date, type: n.type, label: n.label, group: n.group, quantity: n.quantity, amount: n.amount, notes: n.notes })),
  });
  const info = db.prepare(`INSERT INTO payroll_settlements (employee_id, period_start, period_end, pay_mode, units, unit_amount, base_total, tips_total, advances_total, bonuses, deductions, total, status, notes,
    extras_total, allowance_total, legal_deductions_total, details, novelties_extras, novelties_bonus, novelties_absence, novelties_deductions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(emp.id, from, to, emp.payMode, c.units, c.unitAmount, c.baseTotal, c.tipsTotal, c.advancesTotal, bonuses, deductions, total, String(req.body.notes || '').trim(),
      c.extrasTotal, c.allowanceTotal, c.legalDeductionsTotal, details, c.noveltiesExtras, c.noveltiesBonus, c.noveltiesAbsence, c.noveltiesDeductions);
  const id = Number(info.lastInsertRowid);
  if (c.novelties.length) db.prepare(`UPDATE payroll_novelties SET settlement_id = ? WHERE id IN (${c.novelties.map(() => '?').join(',')})`).run(id, ...c.novelties.map(n => n.id));
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
  db.prepare('UPDATE payroll_novelties SET settlement_id = NULL WHERE settlement_id = ?').run(cur.id);
  db.prepare('DELETE FROM payroll_settlements WHERE id = ?').run(cur.id);
  res.json({ success: true });
});


/* ------------------------------------------------------------------ */
/* Propinas por colaborador: reparto, saldo, abonos y liquidación       */
/* ------------------------------------------------------------------ */
const PAYOUT_SELECT = `SELECT p.id, p.employee_id AS employeeId, e.name AS employeeName, e.document, e.position, p.date, p.amount, p.method, p.kind, p.period_start AS periodStart, p.period_end AS periodEnd,
  p.from_cash_register AS fromCashRegister, p.cash_movement_id AS cashMovementId, p.notes, p.created_by AS createdBy, p.created_at AS createdAt
  FROM tip_payouts p JOIN employees e ON e.id = p.employee_id`;
const mapPayout = r => ({ ...r, fromCashRegister: Boolean(r.fromCashRegister) });

router.get('/tips/config', STAFF, (req, res) => res.json(PX.readTipsConfig(getDb())));
router.put('/tips/config', ADMIN, (req, res) => res.json(PX.saveTipsConfig(getDb(), req.body || {})));

router.get('/tips/statement', STAFF, (req, res) => {
  const db = getDb();
  const from = isDate(req.query.from) ? req.query.from : `${today(db).slice(0, 7)}-01`;
  const to = isDate(req.query.to) ? req.query.to : today(db);
  if (from > to) return res.status(400).json({ error: 'Período inválido' });
  res.json(PX.tipStatement(db, from, to));
});

router.get('/tips/payouts', STAFF, (req, res) => {
  const db = getDb();
  let sql = `${PAYOUT_SELECT} WHERE 1=1`;
  const params = [];
  if (req.query.employeeId) { sql += ' AND p.employee_id = ?'; params.push(Number(req.query.employeeId)); }
  if (isDate(req.query.from)) { sql += ' AND p.date >= ?'; params.push(req.query.from); }
  if (isDate(req.query.to)) { sql += ' AND p.date <= ?'; params.push(req.query.to); }
  sql += ' ORDER BY p.date DESC, p.id DESC LIMIT 500';
  const rows = db.prepare(sql).all(...params).map(mapPayout);
  res.json({ payouts: rows, total: rows.reduce((a, r) => a + r.amount, 0) });
});

function createPayout(db, req, { employeeId, amount, date, method, fromCash, kind, periodStart, periodEnd, notes }) {
  const emp = db.prepare(`${EMP_SELECT} WHERE id = ?`).get(employeeId);
  if (!emp) return { error: 'Colaborador no encontrado' };
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'El monto debe ser mayor a cero' };
  const bal = PX.tipBalance(db, emp.id, date);
  if (amount > bal.balance) return { error: `${emp.name} tiene ${bal.balance.toLocaleString('es-CO')} de propinas por pagar; no se puede pagar más` };
  let cashMovementId = null;
  if (fromCash) {
    const r = registerCashWithdrawal(db, amount, `Propinas: ${emp.name}`, req.user?.name);
    if (r.error) return { error: r.error };
    cashMovementId = r.id;
  }
  const info = db.prepare('INSERT INTO tip_payouts (employee_id, date, amount, method, kind, period_start, period_end, from_cash_register, cash_movement_id, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(emp.id, date, amount, method, kind, periodStart || null, periodEnd || null, fromCash ? 1 : 0, cashMovementId, String(notes || '').trim(), req.user?.name || '');
  return { payout: mapPayout(db.prepare(`${PAYOUT_SELECT} WHERE p.id = ?`).get(info.lastInsertRowid)) };
}

// Abono: pago parcial de propinas en cualquier momento (sale de la caja o por transferencia)
router.post('/tips/payouts', STAFF, (req, res) => {
  const db = getDb();
  const method = ['cash', 'transfer'].includes(req.body.method) ? req.body.method : 'cash';
  const r = createPayout(db, req, {
    employeeId: Number(req.body.employeeId), amount: Math.round(Number(req.body.amount)), date: isDate(req.body.date) ? req.body.date : today(db),
    method, fromCash: method === 'cash' && Boolean(req.body.fromCashRegister), kind: 'abono', notes: req.body.notes,
  });
  if (r.error) return res.status(400).json({ error: r.error });
  res.status(201).json(r.payout);
});

// Liquidación de propinas del período (quincena o mes): paga el saldo pendiente de cada colaborador al corte
router.post('/tips/settle', ADMIN, (req, res) => {
  const db = getDb();
  const { from, to } = req.body;
  if (!isDate(from) || !isDate(to) || from > to) return res.status(400).json({ error: 'Período inválido' });
  const method = ['cash', 'transfer'].includes(req.body.method) ? req.body.method : 'cash';
  const fromCash = method === 'cash' && Boolean(req.body.fromCashRegister);
  const ids = Array.isArray(req.body.employeeIds) && req.body.employeeIds.length ? req.body.employeeIds.map(Number) : null;
  const st = PX.tipStatement(db, from, to);
  const targets = st.rows.filter(r => r.balance > 0 && (!ids || ids.includes(r.employeeId)));
  if (!targets.length) return res.status(400).json({ error: 'No hay propinas pendientes por pagar en ese corte' });
  const created = [], errors = [];
  const tx = db.transaction(() => {
    for (const t of targets) {
      const r = createPayout(db, req, { employeeId: t.employeeId, amount: t.balance, date: to > today(db) ? today(db) : to, method, fromCash, kind: 'liquidacion', periodStart: from, periodEnd: to, notes: req.body.notes || `Propinas ${from} a ${to}` });
      if (r.error) errors.push({ employeeId: t.employeeId, name: t.name, error: r.error }); else created.push(r.payout);
    }
    if (errors.length && fromCash) throw new Error(errors[0].error);
  });
  try { tx(); } catch (e) { return res.status(400).json({ error: e.message }); }
  res.status(201).json({ created, errors, total: created.reduce((a, p) => a + p.amount, 0) });
});

router.delete('/tips/payouts/:id', ADMIN, (req, res) => {
  const db = getDb();
  const cur = db.prepare('SELECT * FROM tip_payouts WHERE id = ?').get(Number(req.params.id));
  if (!cur) return res.status(404).json({ error: 'Pago no encontrado' });
  removeCashMovementIfOpen(db, cur.cash_movement_id);
  db.prepare('DELETE FROM tip_payouts WHERE id = ?').run(cur.id);
  res.json({ success: true });
});

/* ------------------------------------------------------------------ */
/* Novedades de nómina (incidencias)                                    */
/* ------------------------------------------------------------------ */
router.get('/novelties/types', STAFF, (req, res) => res.json(Object.entries(PX.NOVELTY_TYPES).map(([id, t]) => ({ id, ...t }))));

router.get('/novelties', ADMIN, (req, res) => {
  const db = getDb();
  let sql = `${PX.NOV_SELECT} WHERE 1=1`;
  const params = [];
  if (req.query.employeeId) { sql += ' AND n.employee_id = ?'; params.push(Number(req.query.employeeId)); }
  if (isDate(req.query.from)) { sql += ' AND n.date >= ?'; params.push(req.query.from); }
  if (isDate(req.query.to)) { sql += ' AND n.date <= ?'; params.push(req.query.to); }
  if (req.query.pending === '1') sql += ' AND n.settlement_id IS NULL';
  sql += ' ORDER BY n.date DESC, n.id DESC LIMIT 500';
  res.json(db.prepare(sql).all(...params).map(PX.mapNovelty));
});

function noveltyInput(db, body, preview = false) {
  const emp = db.prepare(`${EMP_SELECT} WHERE id = ?`).get(Number(body.employeeId));
  if (!emp) return { error: 'Colaborador no encontrado' };
  const type = String(body.type || '');
  const t = PX.NOVELTY_TYPES[type];
  if (!t) return { error: 'Tipo de novedad inválido' };
  const date = isDate(body.date) ? body.date : today(db);
  const quantity = Math.max(0, Number(body.quantity) || 0);
  const cfg = payroll.readConfig(db);
  const auto = PX.noveltyAmount(mapEmp(emp), type, quantity, date, cfg);
  const manual = body.amount !== undefined && body.amount !== null && body.amount !== '' ? Math.round(Number(body.amount)) : null;
  const amount = manual !== null && Number.isFinite(manual) ? manual : auto.amount;
  if (preview && t.auto && amount === 0) return { emp, type, t, date, quantity, amount: 0, pct: auto.pct, suggested: 0, warnings: ['Este colaborador no tiene valor base (sueldo o valor por día) en su ficha; edítalo o escribe el valor a mano.'] };
  if (amount === null || !Number.isFinite(amount) || amount <= 0) return { error: t.auto ? 'Indica la cantidad (días u horas) o el valor' : 'Indica el valor' };
  if (t.unit !== 'valor' && quantity <= 0 && manual === null) return { error: `Indica la cantidad de ${t.unit}` };
  // Aviso: si el colaborador tiene extras/recargos automáticos por asistencia, un festivo con asistencia ya se paga solo
  const warnings = [];
  if (type === 'holiday_worked' && emp.overtime && db.prepare('SELECT id FROM attendance WHERE employee_id = ? AND date = ?').get(emp.id, date) && payroll.isSundayOrHoliday(date))
    warnings.push('Ese día tiene asistencia y el colaborador tiene activos los recargos automáticos: el recargo festivo ya se calcula solo en la liquidación. Revisa que no se pague dos veces.');
  return { emp, type, t, date, quantity, amount, pct: manual === null ? auto.pct : null, suggested: auto.amount, warnings };
}

router.post('/novelties/preview', ADMIN, (req, res) => {
  const r = noveltyInput(getDb(), req.body || {}, true);
  if (r.error) return res.status(400).json({ error: r.error });
  res.json({ amount: r.amount, suggested: r.suggested, pct: r.pct, label: r.t.label, unit: r.t.unit, group: r.t.group, warnings: r.warnings });
});

router.post('/novelties', ADMIN, (req, res) => {
  const db = getDb();
  const r = noveltyInput(db, req.body || {});
  if (r.error) return res.status(400).json({ error: r.error });
  const info = db.prepare('INSERT INTO payroll_novelties (employee_id, date, type, quantity, amount, pct, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(r.emp.id, r.date, r.type, r.quantity, r.amount, r.pct, String(req.body.notes || '').trim(), req.user?.name || '');
  res.status(201).json({ ...PX.mapNovelty(db.prepare(`${PX.NOV_SELECT} WHERE n.id = ?`).get(info.lastInsertRowid)), warnings: r.warnings });
});

router.delete('/novelties/:id', ADMIN, (req, res) => {
  const db = getDb();
  const cur = db.prepare('SELECT id, settlement_id FROM payroll_novelties WHERE id = ?').get(Number(req.params.id));
  if (!cur) return res.status(404).json({ error: 'Novedad no encontrada' });
  if (cur.settlement_id) return res.status(400).json({ error: 'Esta novedad ya está en una liquidación; elimina primero la liquidación' });
  db.prepare('DELETE FROM payroll_novelties WHERE id = ?').run(cur.id);
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
