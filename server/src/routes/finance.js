const { Router } = require('express');
const { getDb } = require('../db');
const { requireRole } = require('../auth');
const { registerCashWithdrawal, removeCashMovementIfOpen, today, now, isDate } = require('../cashHelpers');

const router = Router();
const ADMIN = requireRole('admin');
const STAFF = requireRole('admin', 'cashier');

const KINDS = ['cogs', 'opex', 'payroll', 'other'];
const PAYMENT_METHODS = ['cash', 'transfer', 'card', 'credit'];
const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const CAT_SELECT = 'SELECT id, name, emoji, kind, sort_order AS sortOrder, is_system AS isSystem FROM expense_categories';
const SUP_SELECT = 'SELECT id, name, nit, phone, email, address, category, notes, active, created_at AS createdAt FROM suppliers';
const EXP_SELECT = `
  SELECT e.id, e.date, e.category_id AS categoryId, c.name AS categoryName, c.emoji AS categoryEmoji, c.kind AS categoryKind,
         e.supplier_id AS supplierId, s.name AS supplierName, e.description, e.amount, e.payment_method AS paymentMethod,
         e.status, e.due_date AS dueDate, e.paid_at AS paidAt, e.invoice_number AS invoiceNumber, e.notes,
         e.from_cash_register AS fromCashRegister, e.cash_movement_id AS cashMovementId, e.source, e.reference_id AS referenceId,
         e.created_by AS createdBy, e.created_at AS createdAt
  FROM expenses e
  JOIN expense_categories c ON c.id = e.category_id
  LEFT JOIN suppliers s ON s.id = e.supplier_id`;

/* ------------------------------------------------------------------ */
/* Períodos                                                             */
/* ------------------------------------------------------------------ */
function shiftDate(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function periodRange(db, q) {
  const t = today(db);
  const [y, m] = t.split('-').map(Number);
  const firstOfMonth = `${y}-${String(m).padStart(2, '0')}-01`;
  switch (q.period) {
    case 'today': return { from: t, to: t, label: 'Hoy' };
    case 'yesterday': { const d = shiftDate(t, -1); return { from: d, to: d, label: 'Ayer' }; }
    case 'week': return { from: shiftDate(t, -6), to: t, label: 'Últimos 7 días' };
    case 'last_month': {
      const pm = m === 1 ? 12 : m - 1; const py = m === 1 ? y - 1 : y;
      const from = `${py}-${String(pm).padStart(2, '0')}-01`;
      return { from, to: shiftDate(firstOfMonth, -1), label: `${MONTHS_ES[pm - 1]} ${py}` };
    }
    case 'year': return { from: `${y}-01-01`, to: t, label: `Año ${y}` };
    case 'custom':
      if (isDate(q.from) && isDate(q.to)) return { from: q.from, to: q.to, label: `${q.from} a ${q.to}` };
      return { from: firstOfMonth, to: t, label: `${MONTHS_ES[m - 1]} ${y}` };
    case 'month':
    default:
      return { from: firstOfMonth, to: t, label: `${MONTHS_ES[m - 1]} ${y}` };
  }
}

/* ------------------------------------------------------------------ */
/* Categorías de gasto                                                  */
/* ------------------------------------------------------------------ */
router.get('/categories', STAFF, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`${CAT_SELECT} ORDER BY sort_order, name`).all();
  res.json(rows.map(r => ({ ...r, isSystem: Boolean(r.isSystem) })));
});

router.post('/categories', ADMIN, (req, res) => {
  const db = getDb();
  const name = String(req.body.name || '').trim();
  const emoji = String(req.body.emoji || '💸').slice(0, 8);
  const kind = KINDS.includes(req.body.kind) ? req.body.kind : 'opex';
  if (name.length < 2) return res.status(400).json({ error: 'El nombre es requerido' });
  if (db.prepare('SELECT id FROM expense_categories WHERE LOWER(name) = LOWER(?)').get(name)) {
    return res.status(409).json({ error: 'Ya existe una categoría con ese nombre' });
  }
  const max = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM expense_categories').get().m;
  const info = db.prepare('INSERT INTO expense_categories (name, emoji, kind, sort_order) VALUES (?, ?, ?, ?)').run(name, emoji, kind, max + 1);
  const row = db.prepare(`${CAT_SELECT} WHERE id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ ...row, isSystem: false });
});

router.put('/categories/:id', ADMIN, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const cur = db.prepare(`${CAT_SELECT} WHERE id = ?`).get(id);
  if (!cur) return res.status(404).json({ error: 'Categoría no encontrada' });
  const name = req.body.name !== undefined ? String(req.body.name).trim() : cur.name;
  const emoji = req.body.emoji !== undefined ? String(req.body.emoji).slice(0, 8) : cur.emoji;
  const kind = req.body.kind !== undefined && KINDS.includes(req.body.kind) ? req.body.kind : cur.kind;
  if (name.length < 2) return res.status(400).json({ error: 'El nombre es requerido' });
  db.prepare('UPDATE expense_categories SET name = ?, emoji = ?, kind = ? WHERE id = ?').run(name, emoji, kind, id);
  const row = db.prepare(`${CAT_SELECT} WHERE id = ?`).get(id);
  res.json({ ...row, isSystem: Boolean(row.isSystem) });
});

router.delete('/categories/:id', ADMIN, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const cur = db.prepare(`${CAT_SELECT} WHERE id = ?`).get(id);
  if (!cur) return res.status(404).json({ error: 'Categoría no encontrada' });
  if (cur.isSystem) return res.status(400).json({ error: 'Esta categoría la usa el sistema y no puede eliminarse' });
  const used = db.prepare('SELECT COUNT(*) AS c FROM expenses WHERE category_id = ?').get(id).c;
  if (used > 0) return res.status(400).json({ error: `La categoría tiene ${used} gasto(s) registrados. Reasígnalos antes de eliminarla.` });
  db.prepare('DELETE FROM expense_categories WHERE id = ?').run(id);
  res.json({ success: true });
});

/* ------------------------------------------------------------------ */
/* Proveedores                                                          */
/* ------------------------------------------------------------------ */
router.get('/suppliers', STAFF, (req, res) => {
  const db = getDb();
  const search = String(req.query.search || '').trim().toLowerCase();
  const includeInactive = req.query.all === '1';
  let sql = `${SUP_SELECT} WHERE 1=1`;
  const params = [];
  if (!includeInactive) sql += ' AND active = 1';
  if (search) { sql += ' AND (LOWER(name) LIKE ? OR nit LIKE ? OR LOWER(category) LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  sql += ' ORDER BY name';
  const rows = db.prepare(sql).all(...params);
  const stats = db.prepare(`
    SELECT supplier_id AS id,
           COALESCE(SUM(amount), 0) AS totalPurchased,
           COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) AS pendingAmount,
           COUNT(*) AS purchases,
           MAX(date) AS lastPurchase
    FROM expenses WHERE supplier_id IS NOT NULL GROUP BY supplier_id
  `).all();
  const byId = Object.fromEntries(stats.map(s => [s.id, s]));
  res.json(rows.map(r => ({ ...r, active: Boolean(r.active), totalPurchased: byId[r.id]?.totalPurchased || 0, pendingAmount: byId[r.id]?.pendingAmount || 0, purchases: byId[r.id]?.purchases || 0, lastPurchase: byId[r.id]?.lastPurchase || null })));
});

function supplierPayload(body, cur = {}) {
  return {
    name: body.name !== undefined ? String(body.name).trim() : (cur.name || ''),
    nit: body.nit !== undefined ? String(body.nit).trim() : (cur.nit || ''),
    phone: body.phone !== undefined ? String(body.phone).trim() : (cur.phone || ''),
    email: body.email !== undefined ? String(body.email).trim() : (cur.email || ''),
    address: body.address !== undefined ? String(body.address).trim() : (cur.address || ''),
    category: body.category !== undefined ? String(body.category).trim() : (cur.category || ''),
    notes: body.notes !== undefined ? String(body.notes).trim() : (cur.notes || ''),
    active: body.active !== undefined ? (body.active ? 1 : 0) : (cur.active === undefined ? 1 : cur.active),
  };
}

router.post('/suppliers', ADMIN, (req, res) => {
  const db = getDb();
  const p = supplierPayload(req.body);
  if (p.name.length < 2) return res.status(400).json({ error: 'El nombre del proveedor es requerido' });
  const info = db.prepare('INSERT INTO suppliers (name, nit, phone, email, address, category, notes, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(p.name, p.nit, p.phone, p.email, p.address, p.category, p.notes, p.active);
  const row = db.prepare(`${SUP_SELECT} WHERE id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ ...row, active: Boolean(row.active), totalPurchased: 0, pendingAmount: 0, purchases: 0, lastPurchase: null });
});

router.put('/suppliers/:id', ADMIN, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const cur = db.prepare(`${SUP_SELECT} WHERE id = ?`).get(id);
  if (!cur) return res.status(404).json({ error: 'Proveedor no encontrado' });
  const p = supplierPayload(req.body, cur);
  if (p.name.length < 2) return res.status(400).json({ error: 'El nombre del proveedor es requerido' });
  db.prepare('UPDATE suppliers SET name = ?, nit = ?, phone = ?, email = ?, address = ?, category = ?, notes = ?, active = ? WHERE id = ?')
    .run(p.name, p.nit, p.phone, p.email, p.address, p.category, p.notes, p.active, id);
  const row = db.prepare(`${SUP_SELECT} WHERE id = ?`).get(id);
  res.json({ ...row, active: Boolean(row.active) });
});

router.delete('/suppliers/:id', ADMIN, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM suppliers WHERE id = ?').get(id)) return res.status(404).json({ error: 'Proveedor no encontrado' });
  const used = db.prepare('SELECT COUNT(*) AS c FROM expenses WHERE supplier_id = ?').get(id).c;
  if (used > 0) {
    db.prepare('UPDATE suppliers SET active = 0 WHERE id = ?').run(id);
    return res.json({ success: true, deactivated: true, message: 'El proveedor tiene compras registradas; se marcó como inactivo' });
  }
  db.prepare('DELETE FROM suppliers WHERE id = ?').run(id);
  res.json({ success: true, deleted: true });
});

/* ------------------------------------------------------------------ */
/* Gastos                                                               */
/* ------------------------------------------------------------------ */
function mapExpense(r) {
  return { ...r, fromCashRegister: Boolean(r.fromCashRegister) };
}

router.get('/expenses', STAFF, (req, res) => {
  const db = getDb();
  const { from, to, categoryId, supplierId, status, search } = req.query;
  const limit = Math.min(Number(req.query.limit) || 300, 1000);
  let sql = `${EXP_SELECT} WHERE 1=1`;
  const params = [];
  if (isDate(from)) { sql += ' AND e.date >= ?'; params.push(from); }
  if (isDate(to)) { sql += ' AND e.date <= ?'; params.push(to); }
  if (categoryId) { sql += ' AND e.category_id = ?'; params.push(Number(categoryId)); }
  if (supplierId) { sql += ' AND e.supplier_id = ?'; params.push(Number(supplierId)); }
  if (status === 'paid' || status === 'pending') { sql += ' AND e.status = ?'; params.push(status); }
  if (search) { sql += ' AND (LOWER(e.description) LIKE ? OR LOWER(COALESCE(s.name, \'\')) LIKE ? OR e.invoice_number LIKE ?)'; const s = `%${String(search).toLowerCase()}%`; params.push(s, s, s); }
  sql += ' ORDER BY e.date DESC, e.id DESC LIMIT ?';
  params.push(limit);
  const rows = db.prepare(sql).all(...params).map(mapExpense);
  const total = rows.reduce((a, r) => a + r.amount, 0);
  res.json({ expenses: rows, total, count: rows.length });
});

function validateExpense(db, body, cur = null) {
  const date = body.date !== undefined ? String(body.date) : (cur ? cur.date : today(db));
  if (!isDate(date)) return { error: 'Fecha inválida (AAAA-MM-DD)' };
  const categoryId = body.categoryId !== undefined ? Number(body.categoryId) : (cur ? cur.categoryId : 0);
  if (!db.prepare('SELECT id FROM expense_categories WHERE id = ?').get(categoryId)) return { error: 'Selecciona una categoría válida' };
  const supplierId = body.supplierId !== undefined ? (body.supplierId ? Number(body.supplierId) : null) : (cur ? cur.supplierId : null);
  if (supplierId && !db.prepare('SELECT id FROM suppliers WHERE id = ?').get(supplierId)) return { error: 'Proveedor no encontrado' };
  const description = body.description !== undefined ? String(body.description).trim() : (cur ? cur.description : '');
  if (description.length < 2) return { error: 'Describe el gasto (mínimo 2 caracteres)' };
  const amount = body.amount !== undefined ? Math.round(Number(body.amount)) : (cur ? cur.amount : 0);
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'El monto debe ser mayor a cero' };
  let paymentMethod = body.paymentMethod !== undefined ? String(body.paymentMethod) : (cur ? cur.paymentMethod : 'cash');
  if (!PAYMENT_METHODS.includes(paymentMethod)) return { error: 'Método de pago inválido' };
  let status = body.status !== undefined ? String(body.status) : (cur ? cur.status : 'paid');
  if (paymentMethod === 'credit') status = 'pending';
  if (!['paid', 'pending'].includes(status)) return { error: 'Estado inválido' };
  const dueDate = body.dueDate !== undefined ? (body.dueDate ? String(body.dueDate) : null) : (cur ? cur.dueDate : null);
  if (dueDate && !isDate(dueDate)) return { error: 'Fecha de vencimiento inválida' };
  const invoiceNumber = body.invoiceNumber !== undefined ? String(body.invoiceNumber).trim() : (cur ? cur.invoiceNumber : '');
  const notes = body.notes !== undefined ? String(body.notes).trim() : (cur ? cur.notes : '');
  return { date, categoryId, supplierId, description, amount, paymentMethod, status, dueDate, invoiceNumber, notes };
}

router.post('/expenses', STAFF, (req, res) => {
  const db = getDb();
  const v = validateExpense(db, req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  const fromCash = Boolean(req.body.fromCashRegister) && v.paymentMethod === 'cash' && v.status === 'paid';
  let cashMovementId = null;
  if (fromCash) {
    const r = registerCashWithdrawal(db, v.amount, `Gasto: ${v.description}`, req.user?.name);
    if (r.error) return res.status(400).json({ error: r.error });
    cashMovementId = r.id;
  }
  const info = db.prepare(`
    INSERT INTO expenses (date, category_id, supplier_id, description, amount, payment_method, status, due_date, paid_at, invoice_number, notes, from_cash_register, cash_movement_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(v.date, v.categoryId, v.supplierId, v.description, v.amount, v.paymentMethod, v.status, v.dueDate,
    v.status === 'paid' ? now(db) : null, v.invoiceNumber, v.notes, fromCash ? 1 : 0, cashMovementId, req.user?.name || '');
  const row = db.prepare(`${EXP_SELECT} WHERE e.id = ?`).get(info.lastInsertRowid);
  res.status(201).json(mapExpense(row));
});

router.put('/expenses/:id', ADMIN, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const cur = db.prepare(`${EXP_SELECT} WHERE e.id = ?`).get(id);
  if (!cur) return res.status(404).json({ error: 'Gasto no encontrado' });
  if (cur.source !== 'manual') return res.status(400).json({ error: 'Este gasto lo generó el módulo de nómina; edítalo desde allí' });
  const v = validateExpense(db, req.body, cur);
  if (v.error) return res.status(400).json({ error: v.error });
  const paidAt = v.status === 'paid' ? (cur.paidAt || now(db)) : null;
  db.prepare(`
    UPDATE expenses SET date = ?, category_id = ?, supplier_id = ?, description = ?, amount = ?, payment_method = ?, status = ?, due_date = ?, paid_at = ?, invoice_number = ?, notes = ?
    WHERE id = ?
  `).run(v.date, v.categoryId, v.supplierId, v.description, v.amount, v.paymentMethod, v.status, v.dueDate, paidAt, v.invoiceNumber, v.notes, id);
  if (cur.cashMovementId && v.amount !== cur.amount) {
    db.prepare('UPDATE cash_movements SET amount = ?, reason = ? WHERE id = ?').run(v.amount, `Gasto: ${v.description}`, cur.cashMovementId);
  }
  res.json(mapExpense(db.prepare(`${EXP_SELECT} WHERE e.id = ?`).get(id)));
});

router.post('/expenses/:id/pay', STAFF, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const cur = db.prepare(`${EXP_SELECT} WHERE e.id = ?`).get(id);
  if (!cur) return res.status(404).json({ error: 'Gasto no encontrado' });
  if (cur.status === 'paid') return res.status(400).json({ error: 'Este gasto ya está pagado' });
  const paymentMethod = PAYMENT_METHODS.includes(req.body.paymentMethod) && req.body.paymentMethod !== 'credit' ? req.body.paymentMethod : 'cash';
  const fromCash = Boolean(req.body.fromCashRegister) && paymentMethod === 'cash';
  let cashMovementId = cur.cashMovementId;
  if (fromCash) {
    const r = registerCashWithdrawal(db, cur.amount, `Pago: ${cur.description}${cur.supplierName ? ' (' + cur.supplierName + ')' : ''}`, req.user?.name);
    if (r.error) return res.status(400).json({ error: r.error });
    cashMovementId = r.id;
  }
  const paidAt = isDate(req.body.paidAt) ? `${req.body.paidAt} 12:00:00` : now(db);
  db.prepare("UPDATE expenses SET status = 'paid', payment_method = ?, paid_at = ?, from_cash_register = ?, cash_movement_id = ? WHERE id = ?")
    .run(paymentMethod, paidAt, fromCash ? 1 : 0, cashMovementId, id);
  res.json(mapExpense(db.prepare(`${EXP_SELECT} WHERE e.id = ?`).get(id)));
});

router.delete('/expenses/:id', ADMIN, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const cur = db.prepare(`${EXP_SELECT} WHERE e.id = ?`).get(id);
  if (!cur) return res.status(404).json({ error: 'Gasto no encontrado' });
  if (cur.source !== 'manual') return res.status(400).json({ error: 'Este gasto lo generó el módulo de nómina; anula la liquidación desde allí' });
  removeCashMovementIfOpen(db, cur.cashMovementId);
  db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
  res.json({ success: true });
});

/* ------------------------------------------------------------------ */
/* Cuentas por pagar                                                    */
/* ------------------------------------------------------------------ */
router.get('/payables', STAFF, (req, res) => {
  const db = getDb();
  const t = today(db);
  const soon = shiftDate(t, 7);
  const rows = db.prepare(`${EXP_SELECT} WHERE e.status = 'pending' ORDER BY COALESCE(e.due_date, e.date), e.id`).all().map(r => ({
    ...mapExpense(r),
    overdue: Boolean(r.dueDate && r.dueDate < t),
    dueSoon: Boolean(r.dueDate && r.dueDate >= t && r.dueDate <= soon),
  }));
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const overdue = rows.filter(r => r.overdue).reduce((a, r) => a + r.amount, 0);
  const dueSoon = rows.filter(r => r.dueSoon).reduce((a, r) => a + r.amount, 0);
  res.json({ payables: rows, total, overdue, dueSoon, count: rows.length });
});

/* ------------------------------------------------------------------ */
/* Resumen (P&L) del período                                            */
/* ------------------------------------------------------------------ */
router.get('/summary', ADMIN, (req, res) => {
  const db = getDb();
  const range = periodRange(db, req.query);
  const sales = db.prepare("SELECT COALESCE(SUM(total), 0) AS s, COUNT(*) AS c FROM orders WHERE status != 'cancelled' AND date(created_at) BETWEEN ? AND ?").get(range.from, range.to);
  const byKind = db.prepare(`
    SELECT c.kind, COALESCE(SUM(e.amount), 0) AS total
    FROM expenses e JOIN expense_categories c ON c.id = e.category_id
    WHERE e.date BETWEEN ? AND ? GROUP BY c.kind
  `).all(range.from, range.to);
  const k = Object.fromEntries(byKind.map(r => [r.kind, r.total]));
  const cogs = k.cogs || 0, opex = k.opex || 0, payroll = k.payroll || 0, other = k.other || 0;
  const totalExpenses = cogs + opex + payroll + other;
  const net = sales.s - totalExpenses;
  const byCategory = db.prepare(`
    SELECT c.id, c.name, c.emoji, c.kind, COALESCE(SUM(e.amount), 0) AS total, COUNT(e.id) AS count
    FROM expense_categories c
    LEFT JOIN expenses e ON e.category_id = c.id AND e.date BETWEEN ? AND ?
    GROUP BY c.id ORDER BY total DESC, c.sort_order
  `).all(range.from, range.to);
  const pending = db.prepare("SELECT COALESCE(SUM(amount), 0) AS t, COUNT(*) AS c FROM expenses WHERE status = 'pending'").get();
  res.json({
    period: range,
    sales: sales.s,
    salesCount: sales.c,
    cogs, opex, payroll, other, totalExpenses, net,
    grossMargin: sales.s > 0 ? Math.round(((sales.s - cogs) / sales.s) * 1000) / 10 : 0,
    netMargin: sales.s > 0 ? Math.round((net / sales.s) * 1000) / 10 : 0,
    byCategory,
    pendingPayables: pending.t,
    pendingPayablesCount: pending.c,
  });
});

router.get('/pnl', ADMIN, (req, res) => {
  const db = getDb();
  const months = Math.min(Math.max(Number(req.query.months) || 6, 1), 24);
  const t = today(db);
  const [y, m] = t.split('-').map(Number);
  const keys = [];
  for (let i = months - 1; i >= 0; i--) {
    let mm = m - i, yy = y;
    while (mm <= 0) { mm += 12; yy -= 1; }
    keys.push(`${yy}-${String(mm).padStart(2, '0')}`);
  }
  const start = `${keys[0]}-01`;
  const salesRows = db.prepare("SELECT strftime('%Y-%m', created_at) AS mth, COALESCE(SUM(total), 0) AS s, COUNT(*) AS c FROM orders WHERE status != 'cancelled' AND created_at >= ? GROUP BY mth").all(start);
  const expRows = db.prepare(`
    SELECT substr(e.date, 1, 7) AS mth, c.kind, COALESCE(SUM(e.amount), 0) AS t
    FROM expenses e JOIN expense_categories c ON c.id = e.category_id
    WHERE e.date >= ? GROUP BY mth, c.kind
  `).all(start);
  const sales = Object.fromEntries(salesRows.map(r => [r.mth, r]));
  const exp = {};
  for (const r of expRows) { exp[r.mth] = exp[r.mth] || {}; exp[r.mth][r.kind] = r.t; }
  const out = keys.map(key => {
    const [yy, mm] = key.split('-').map(Number);
    const s = sales[key]?.s || 0;
    const e = exp[key] || {};
    const cogs = e.cogs || 0, opex = e.opex || 0, payroll = e.payroll || 0, other = e.other || 0;
    const expenses = cogs + opex + payroll + other;
    return {
      month: key,
      label: `${MONTHS_ES[mm - 1]} ${String(yy).slice(2)}`,
      sales: s,
      orders: sales[key]?.c || 0,
      cogs, opex, payroll, other, expenses,
      net: s - expenses,
      netMargin: s > 0 ? Math.round(((s - expenses) / s) * 1000) / 10 : 0,
    };
  });
  res.json(out);
});

module.exports = router;
