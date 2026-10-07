const { Router } = require('express');
const { getDb } = require('../db');
const { requireRole, requirePerm } = require('../auth');
const { registerCashWithdrawal, removeCashMovementIfOpen, today, now, isDate } = require('../cashHelpers');
const L = require('../ledger');

const router = Router();
router.use(requirePerm('finance'));
router.use(L.syncOnWrite(getDb));
const ADMIN = requireRole('admin');
const STAFF = requireRole('admin', 'cashier');

const KINDS = ['cogs', 'opex', 'payroll', 'other'];
const PL_GROUPS = ['cost', 'personnel', 'admin', 'sales', 'financial', 'other'];
const defaultGroup = kind => ({ cogs: 'cost', payroll: 'personnel', other: 'other' }[kind] || 'admin');
const PAYMENT_METHODS = ['cash', 'transfer', 'card', 'credit'];
const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const CAT_SELECT = 'SELECT id, name, emoji, kind, pl_group AS plGroup, sort_order AS sortOrder, is_system AS isSystem FROM expense_categories';
const SUP_SELECT = `SELECT id, name, nit, phone, email, address, category, notes, active, created_at AS createdAt,
  COALESCE(doc_type, '') AS docType, COALESCE(dv, '') AS dv, COALESCE(legal_name, '') AS legalName, COALESCE(first_name, '') AS firstName, COALESCE(last_name, '') AS lastName,
  COALESCE(person_type, '') AS personType, COALESCE(city, '') AS city, COALESCE(state, '') AS state, COALESCE(country, 'Colombia') AS country, COALESCE(postal_code, '') AS postalCode,
  COALESCE(ciiu, '') AS ciiu, COALESCE(iva_responsible, 0) AS ivaResponsible, COALESCE(regime, '') AS regime, COALESCE(credit_days, 0) AS creditDays, COALESCE(retention_pct, 0) AS retentionPct FROM suppliers`;
const RUT_REQUIRED = ['nit', 'address', 'city', 'phone', 'email', 'ciiu'];
const supplierComplete = s => RUT_REQUIRED.every(k => String(s[k] || '').trim() !== '') && (s.docType || '') !== '' && (s.personType || '') !== '';
const EXP_SELECT = `
  SELECT e.id, e.number, e.date, e.category_id AS categoryId, c.name AS categoryName, c.emoji AS categoryEmoji, c.kind AS categoryKind,
         e.supplier_id AS supplierId, s.name AS supplierName, e.description, e.amount, e.payment_method AS paymentMethod,
         e.status, e.due_date AS dueDate, e.paid_at AS paidAt, e.invoice_number AS invoiceNumber, e.notes,
         e.from_cash_register AS fromCashRegister, e.cash_movement_id AS cashMovementId, e.source, e.reference_id AS referenceId,
         e.created_by AS createdBy, e.created_at AS createdAt, COALESCE(e.tax_amount, 0) AS taxAmount, e.voided_at AS voidedAt, e.void_reason AS voidReason, e.voided_by AS voidedBy,
         COALESCE(e.retention, 0) AS retention, COALESCE(e.retention_pct, 0) AS retentionPct, COALESCE(e.paid_amount, 0) AS paidAmount,
         (e.amount - COALESCE(e.retention, 0) - COALESCE(e.paid_amount, 0)) AS balance,
         COALESCE(e.support_doc, 0) AS supportDoc, e.support_doc_number AS supportDocNumber, e.support_doc_status AS supportDocStatus, e.support_doc_issued_at AS supportDocIssuedAt,
         e.invoice_date AS invoiceDate, s.nit AS supplierNit
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
  const plGroup = PL_GROUPS.includes(req.body.plGroup) ? req.body.plGroup : defaultGroup(kind);
  const info = db.prepare('INSERT INTO expense_categories (name, emoji, kind, pl_group, sort_order) VALUES (?, ?, ?, ?, ?)').run(name, emoji, kind, plGroup, max + 1);
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
  const plGroup = PL_GROUPS.includes(req.body.plGroup) ? req.body.plGroup : (kind !== cur.kind ? defaultGroup(kind) : (cur.plGroup || defaultGroup(kind)));
  db.prepare('UPDATE expense_categories SET name = ?, emoji = ?, kind = ?, pl_group = ? WHERE id = ?').run(name, emoji, kind, plGroup, id);
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
    FROM expenses WHERE supplier_id IS NOT NULL AND voided_at IS NULL GROUP BY supplier_id
  `).all();
  const byId = Object.fromEntries(stats.map(s => [s.id, s]));
  res.json(rows.map(r => ({ ...r, active: Boolean(r.active), ivaResponsible: Boolean(r.ivaResponsible), rutComplete: supplierComplete(r), totalPurchased: byId[r.id]?.totalPurchased || 0, pendingAmount: byId[r.id]?.pendingAmount || 0, purchases: byId[r.id]?.purchases || 0, lastPurchase: byId[r.id]?.lastPurchase || null })));
});

const DOC_TYPES = ['NIT', 'CC', 'CE', 'PAS', 'TI', 'PEP', 'NUIP'];
const PERSON_TYPES = ['natural', 'juridica'];
const REGIMES = ['ordinario', 'simple', 'no_responsable'];
const str = (body, cur, k, max = 120) => (body[k] !== undefined ? String(body[k] ?? '').trim().slice(0, max) : (cur[k] || ''));
function supplierPayload(body, cur = {}) {
  return {
    docType: body.docType !== undefined ? (DOC_TYPES.includes(body.docType) ? body.docType : '') : (cur.docType || ''),
    dv: str(body, cur, 'dv', 2),
    legalName: str(body, cur, 'legalName'),
    firstName: str(body, cur, 'firstName', 80),
    lastName: str(body, cur, 'lastName', 80),
    personType: body.personType !== undefined ? (PERSON_TYPES.includes(body.personType) ? body.personType : '') : (cur.personType || ''),
    city: str(body, cur, 'city', 80),
    state: str(body, cur, 'state', 80),
    country: body.country !== undefined ? (String(body.country).trim() || 'Colombia') : (cur.country || 'Colombia'),
    postalCode: str(body, cur, 'postalCode', 12),
    ciiu: str(body, cur, 'ciiu', 12),
    ivaResponsible: body.ivaResponsible !== undefined ? (body.ivaResponsible ? 1 : 0) : (cur.ivaResponsible ? 1 : 0),
    regime: body.regime !== undefined ? (REGIMES.includes(body.regime) ? body.regime : '') : (cur.regime || ''),
    creditDays: body.creditDays !== undefined ? Math.max(0, Math.min(365, Math.round(Number(body.creditDays) || 0))) : (cur.creditDays || 0),
    retentionPct: body.retentionPct !== undefined ? Math.max(0, Math.min(100, Number(body.retentionPct) || 0)) : (cur.retentionPct || 0),
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
  const info = db.prepare(`INSERT INTO suppliers (name, nit, phone, email, address, category, notes, active, doc_type, dv, legal_name, first_name, last_name, person_type, city, state, country, postal_code, ciiu, iva_responsible, regime, credit_days, retention_pct)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(p.name, p.nit, p.phone, p.email, p.address, p.category, p.notes, p.active, p.docType, p.dv, p.legalName, p.firstName, p.lastName, p.personType, p.city, p.state, p.country, p.postalCode, p.ciiu, p.ivaResponsible, p.regime, p.creditDays, p.retentionPct);
  const row = db.prepare(`${SUP_SELECT} WHERE id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ ...row, active: Boolean(row.active), ivaResponsible: Boolean(row.ivaResponsible), rutComplete: supplierComplete(row), totalPurchased: 0, pendingAmount: 0, purchases: 0, lastPurchase: null });
});

router.put('/suppliers/:id', ADMIN, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const cur = db.prepare(`${SUP_SELECT} WHERE id = ?`).get(id);
  if (!cur) return res.status(404).json({ error: 'Proveedor no encontrado' });
  const p = supplierPayload(req.body, cur);
  if (p.name.length < 2) return res.status(400).json({ error: 'El nombre del proveedor es requerido' });
  db.prepare(`UPDATE suppliers SET name = ?, nit = ?, phone = ?, email = ?, address = ?, category = ?, notes = ?, active = ?, doc_type = ?, dv = ?, legal_name = ?, first_name = ?, last_name = ?, person_type = ?, city = ?, state = ?, country = ?, postal_code = ?, ciiu = ?, iva_responsible = ?, regime = ?, credit_days = ?, retention_pct = ? WHERE id = ?`)
    .run(p.name, p.nit, p.phone, p.email, p.address, p.category, p.notes, p.active, p.docType, p.dv, p.legalName, p.firstName, p.lastName, p.personType, p.city, p.state, p.country, p.postalCode, p.ciiu, p.ivaResponsible, p.regime, p.creditDays, p.retentionPct, id);
  const row = db.prepare(`${SUP_SELECT} WHERE id = ?`).get(id);
  res.json({ ...row, active: Boolean(row.active), ivaResponsible: Boolean(row.ivaResponsible), rutComplete: supplierComplete(row) });
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
  return { ...r, fromCashRegister: Boolean(r.fromCashRegister), supportDoc: Boolean(r.supportDoc) };
}
const EXP_PAY_SELECT = 'SELECT id, expense_id AS expenseId, date, amount, method, notes, cash_movement_id AS cashMovementId, created_by AS createdBy, created_at AS createdAt FROM expense_payments';
/** Registra un abono (o pago total) de un gasto y actualiza saldo y estado. */
function recordExpensePayment(db, expense, { date, amount, method, notes, cashMovementId, createdBy }) {
  const info = db.prepare('INSERT INTO expense_payments (expense_id, date, amount, method, notes, cash_movement_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(expense.id, date, amount, method, notes || '', cashMovementId || null, createdBy || '');
  refreshExpenseBalance(db, expense.id);
  return Number(info.lastInsertRowid);
}
function refreshExpenseBalance(db, id) {
  const e = db.prepare('SELECT amount, COALESCE(retention, 0) AS retention, payment_method AS pm, paid_at AS paidAt FROM expenses WHERE id = ?').get(id);
  if (!e) return;
  const paid = db.prepare('SELECT COALESCE(SUM(amount), 0) AS s, MAX(date) AS last, (SELECT method FROM expense_payments WHERE expense_id = ? ORDER BY id DESC LIMIT 1) AS lastMethod FROM expense_payments WHERE expense_id = ?').get(id, id);
  const due = e.amount - e.retention;
  const status = paid.s >= due ? 'paid' : 'pending';
  db.prepare('UPDATE expenses SET paid_amount = ?, status = ?, paid_at = CASE WHEN ? = \'paid\' THEN COALESCE(paid_at, ?) ELSE NULL END, payment_method = ? WHERE id = ?')
    .run(paid.s, status, status, paid.last ? `${paid.last} 12:00:00` : now(db), status === 'paid' ? (paid.lastMethod || e.pm) : (paid.s > 0 ? (paid.lastMethod || e.pm) : 'credit'), id);
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
  if (search) { sql += ' AND (LOWER(e.description) LIKE ? OR LOWER(COALESCE(s.name, \'\')) LIKE ? OR e.invoice_number LIKE ? OR CAST(e.number AS TEXT) = ?)'; const s = `%${String(search).toLowerCase()}%`; params.push(s, s, s, String(Number(String(search).replace(/\D/g, '')) || '')); }
  sql += ' ORDER BY e.date DESC, e.id DESC LIMIT ?';
  params.push(limit);
  const rows = db.prepare(sql).all(...params).map(mapExpense);
  const total = rows.filter(r => !r.voidedAt).reduce((a, r) => a + r.amount, 0);
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
  const taxAmount = body.taxAmount !== undefined && body.taxAmount !== null && body.taxAmount !== '' ? Math.round(Number(body.taxAmount) || 0) : (cur ? (cur.taxAmount || 0) : 0);
  if (taxAmount < 0 || taxAmount > amount) return { error: 'El IVA no puede ser negativo ni superar el monto total' };
  // Retención en la fuente: % sobre la base (monto sin IVA); por defecto el % configurado al proveedor
  const supplier = supplierId ? db.prepare('SELECT credit_days AS creditDays, retention_pct AS retentionPct FROM suppliers WHERE id = ?').get(supplierId) : null;
  let retentionPct = body.retentionPct !== undefined && body.retentionPct !== null && body.retentionPct !== '' ? Number(body.retentionPct) : (cur ? (cur.retentionPct || 0) : (supplier ? (supplier.retentionPct || 0) : 0));
  if (!Number.isFinite(retentionPct) || retentionPct < 0 || retentionPct > 100) return { error: 'El porcentaje de retención debe estar entre 0 y 100' };
  let retention = body.retention !== undefined && body.retention !== null && body.retention !== '' ? Math.round(Number(body.retention) || 0) : Math.round((amount - taxAmount) * retentionPct / 100);
  if (retention < 0 || retention >= amount) return { error: 'La retención no puede ser negativa ni igualar el monto' };
  if (retention === 0) retentionPct = 0;
  const invoiceDate = body.invoiceDate !== undefined ? (body.invoiceDate ? String(body.invoiceDate) : null) : (cur ? cur.invoiceDate : null);
  if (invoiceDate && !isDate(invoiceDate)) return { error: 'Fecha de la factura inválida' };
  const supportDoc = body.supportDoc !== undefined ? (body.supportDoc ? 1 : 0) : (cur ? (cur.supportDoc ? 1 : 0) : 0);
  const finalDue = dueDate || (status === 'pending' && supplier && supplier.creditDays > 0 ? shiftDate(date, supplier.creditDays) : dueDate);
  return { date, categoryId, supplierId, description, amount, paymentMethod, status, dueDate: finalDue, invoiceNumber, notes, taxAmount, retention, retentionPct, invoiceDate, supportDoc };
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
  const payable = v.amount - v.retention;
  if (fromCash && cashMovementId && payable !== v.amount) db.prepare('UPDATE cash_movements SET amount = ? WHERE id = ?').run(payable, cashMovementId);
  const info = db.prepare(`
    INSERT INTO expenses (date, category_id, supplier_id, description, amount, tax_amount, payment_method, status, due_date, paid_at, invoice_number, notes, from_cash_register, cash_movement_id, created_by, retention, retention_pct, invoice_date, support_doc)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(v.date, v.categoryId, v.supplierId, v.description, v.amount, v.taxAmount, v.paymentMethod, v.status, v.dueDate,
    v.status === 'paid' ? now(db) : null, v.invoiceNumber, v.notes, fromCash ? 1 : 0, cashMovementId, req.user?.name || '', v.retention, v.retentionPct, v.invoiceDate, v.supportDoc);
  const id = Number(info.lastInsertRowid);
  db.prepare('UPDATE expenses SET branch_id = ? WHERE id = ?').run(require('../branches').currentBranch(), id);
  if (v.status === 'paid') recordExpensePayment(db, { id }, { date: v.date, amount: payable, method: v.paymentMethod, notes: 'Pago registrado con el gasto', cashMovementId, createdBy: req.user?.name });
  if (v.supportDoc) issueSupportDoc(db, id);
  const row = db.prepare(`${EXP_SELECT} WHERE e.id = ?`).get(id);
  res.status(201).json(mapExpense(row));
});

router.put('/expenses/:id', ADMIN, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const cur = db.prepare(`${EXP_SELECT} WHERE e.id = ?`).get(id);
  if (!cur) return res.status(404).json({ error: 'Gasto no encontrado' });
  if (cur.voidedAt) return res.status(400).json({ error: 'Este gasto está anulado; no se puede editar' });
  if (cur.source !== 'manual') return res.status(400).json({ error: 'Este gasto lo generó el módulo de nómina; edítalo desde allí' });
  const v = validateExpense(db, req.body, cur);
  if (v.error) return res.status(400).json({ error: v.error });
  const paidAt = v.status === 'paid' ? (cur.paidAt || now(db)) : null;
  db.prepare(`
    UPDATE expenses SET date = ?, category_id = ?, supplier_id = ?, description = ?, amount = ?, tax_amount = ?, payment_method = ?, status = ?, due_date = ?, paid_at = ?, invoice_number = ?, notes = ?,
      retention = ?, retention_pct = ?, invoice_date = ?, support_doc = ?
    WHERE id = ?
  `).run(v.date, v.categoryId, v.supplierId, v.description, v.amount, v.taxAmount, v.paymentMethod, v.status, v.dueDate, paidAt, v.invoiceNumber, v.notes, v.retention, v.retentionPct, v.invoiceDate, v.supportDoc, id);
  const payable = v.amount - v.retention;
  if (cur.cashMovementId && payable !== cur.amount - cur.retention) {
    db.prepare('UPDATE cash_movements SET amount = ?, reason = ? WHERE id = ?').run(payable, `Gasto: ${v.description}`, cur.cashMovementId);
  }
  // Pagos: si el gasto pasa a pagado sin abonos se registra el pago completo; si vuelve a pendiente se retiran los abonos automáticos
  const payments = db.prepare(`${EXP_PAY_SELECT} WHERE expense_id = ? ORDER BY id`).all(id);
  if (v.status === 'paid') {
    if (payments.length === 1 && payments[0].notes === 'Pago registrado con el gasto') db.prepare('UPDATE expense_payments SET amount = ?, method = ?, date = ? WHERE id = ?').run(payable, v.paymentMethod, v.date, payments[0].id);
    const paid = db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM expense_payments WHERE expense_id = ?').get(id).s;
    if (paid < payable) recordExpensePayment(db, { id }, { date: v.date, amount: payable - paid, method: v.paymentMethod, notes: payments.length ? 'Saldo pagado al editar el gasto' : 'Pago registrado con el gasto', createdBy: req.user?.name });
    else refreshExpenseBalance(db, id);
  } else {
    db.prepare("DELETE FROM expense_payments WHERE expense_id = ? AND notes = 'Pago registrado con el gasto'").run(id);
    refreshExpenseBalance(db, id);
    if (cur.status === 'paid' && v.status === 'pending') db.prepare("UPDATE expenses SET status = 'pending', paid_at = NULL, payment_method = CASE WHEN paid_amount > 0 THEN payment_method ELSE 'credit' END WHERE id = ?").run(id);
  }
  if (v.supportDoc && !cur.supportDocNumber) issueSupportDoc(db, id);
  res.json(mapExpense(db.prepare(`${EXP_SELECT} WHERE e.id = ?`).get(id)));
});

/** Pago total o abono parcial de un gasto / factura de proveedor (cuentas por pagar). */
router.post('/expenses/:id/pay', STAFF, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const cur = db.prepare(`${EXP_SELECT} WHERE e.id = ?`).get(id);
  if (!cur) return res.status(404).json({ error: 'Gasto no encontrado' });
  if (cur.voidedAt) return res.status(400).json({ error: 'Este gasto está anulado' });
  if (cur.status === 'paid' || cur.balance <= 0) return res.status(400).json({ error: 'Este gasto ya está pagado' });
  const amount = req.body.amount === undefined || req.body.amount === null || req.body.amount === '' ? cur.balance : Math.round(Number(req.body.amount));
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'El abono debe ser mayor a cero' });
  if (amount > cur.balance) return res.status(400).json({ error: `El abono supera el saldo pendiente (${cur.balance})` });
  const paymentMethod = PAYMENT_METHODS.includes(req.body.paymentMethod) && req.body.paymentMethod !== 'credit' ? req.body.paymentMethod : 'cash';
  const fromCash = Boolean(req.body.fromCashRegister) && paymentMethod === 'cash';
  let cashMovementId = null;
  if (fromCash) {
    const r = registerCashWithdrawal(db, amount, `${amount < cur.balance ? 'Abono' : 'Pago'}: ${cur.description}${cur.supplierName ? ' (' + cur.supplierName + ')' : ''}`, req.user?.name);
    if (r.error) return res.status(400).json({ error: r.error });
    cashMovementId = r.id;
  }
  const date = isDate(req.body.paidAt) ? req.body.paidAt : (isDate(req.body.date) ? req.body.date : today(db));
  const paymentId = recordExpensePayment(db, cur, { date, amount, method: paymentMethod, notes: String(req.body.notes || '').slice(0, 200), cashMovementId, createdBy: req.user?.name });
  if (fromCash) db.prepare('UPDATE expenses SET from_cash_register = 1, cash_movement_id = COALESCE(cash_movement_id, ?) WHERE id = ?').run(cashMovementId, id);
  res.json({ ...mapExpense(db.prepare(`${EXP_SELECT} WHERE e.id = ?`).get(id)), paymentId });
});

router.get('/expenses/:id/payments', STAFF, (req, res) => {
  const db = getDb();
  const cur = db.prepare(`${EXP_SELECT} WHERE e.id = ?`).get(Number(req.params.id));
  if (!cur) return res.status(404).json({ error: 'Gasto no encontrado' });
  const supplier = cur.supplierId ? db.prepare("SELECT name, nit, COALESCE(dv, '') AS dv, COALESCE(doc_type, '') AS docType, address, COALESCE(city, '') AS city, phone, email FROM suppliers WHERE id = ?").get(cur.supplierId) : null;
  const cat = db.prepare('SELECT c.account_code AS code, a.name FROM expense_categories c LEFT JOIN accounts a ON a.code = c.account_code WHERE c.id = ?').get(cur.categoryId) || {};
  res.json({ expense: mapExpense(cur), supplier, account: cat, payments: db.prepare(`${EXP_PAY_SELECT} WHERE expense_id = ? ORDER BY date, id`).all(cur.id) });
});

router.delete('/expenses/:id/payments/:pid', ADMIN, (req, res) => {
  const db = getDb();
  const p = db.prepare(`${EXP_PAY_SELECT} WHERE id = ? AND expense_id = ?`).get(Number(req.params.pid), Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Abono no encontrado' });
  removeCashMovementIfOpen(db, p.cashMovementId);
  db.prepare('DELETE FROM expense_payments WHERE id = ?').run(p.id);
  refreshExpenseBalance(db, p.expenseId);
  res.json({ success: true, expense: mapExpense(db.prepare(`${EXP_SELECT} WHERE e.id = ?`).get(p.expenseId)) });
});

/** Documento soporte (compras a no obligados a facturar). Numeración interna de PRUEBA hasta habilitar la emisión real vía Factus. */
function issueSupportDoc(db, id) {
  const cur = db.prepare('SELECT id, support_doc_number AS n FROM expenses WHERE id = ?').get(id);
  if (!cur || cur.n) return cur ? cur.n : null;
  const seq = db.prepare('SELECT COUNT(*) AS c FROM expenses WHERE support_doc_number IS NOT NULL').get().c + 1;
  const number = `DSP-${String(seq).padStart(6, '0')}`;
  db.prepare("UPDATE expenses SET support_doc = 1, support_doc_number = ?, support_doc_status = 'test', support_doc_issued_at = ? WHERE id = ?").run(number, now(db), id);
  return number;
}
router.post('/expenses/:id/support-doc', ADMIN, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const cur = db.prepare(`${EXP_SELECT} WHERE e.id = ?`).get(id);
  if (!cur) return res.status(404).json({ error: 'Gasto no encontrado' });
  if (!cur.supplierId) return res.status(400).json({ error: 'El documento soporte requiere un proveedor con NIT o cédula' });
  issueSupportDoc(db, id);
  res.json(mapExpense(db.prepare(`${EXP_SELECT} WHERE e.id = ?`).get(id)));
});

/** Anular un gasto: conserva el número consecutivo (no queda hueco), sale de totales e informes y se reversa su contabilidad.
 * Si salió de una caja que sigue abierta, se devuelve el retiro; los pagos registrados se eliminan. */
router.post('/expenses/:id/void', STAFF, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const cur = db.prepare(`${EXP_SELECT} WHERE e.id = ?`).get(id);
  if (!cur) return res.status(404).json({ error: 'Gasto no encontrado' });
  if (cur.voidedAt) return res.status(400).json({ error: 'Este gasto ya está anulado' });
  if (cur.source !== 'manual') return res.status(400).json({ error: 'Este gasto lo generó el módulo de nómina; anula la liquidación desde Personal' });
  const reason = String(req.body.reason || '').trim().slice(0, 200);
  if (reason.length < 3) return res.status(400).json({ error: 'Escribe el motivo de la anulación' });
  removeCashMovementIfOpen(db, cur.cashMovementId);
  for (const p of db.prepare('SELECT cash_movement_id AS cm FROM expense_payments WHERE expense_id = ? AND cash_movement_id IS NOT NULL').all(id)) if (p.cm !== cur.cashMovementId) removeCashMovementIfOpen(db, p.cm);
  db.prepare('DELETE FROM expense_payments WHERE expense_id = ?').run(id);
  db.prepare('UPDATE expenses SET voided_at = ?, void_reason = ?, voided_by = ?, paid_amount = 0 WHERE id = ?').run(now(db), reason, req.user?.name || '', id);
  res.json(mapExpense(db.prepare(`${EXP_SELECT} WHERE e.id = ?`).get(id)));
});

router.delete('/expenses/:id', ADMIN, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const cur = db.prepare(`${EXP_SELECT} WHERE e.id = ?`).get(id);
  if (!cur) return res.status(404).json({ error: 'Gasto no encontrado' });
  if (cur.source !== 'manual') return res.status(400).json({ error: 'Este gasto lo generó el módulo de nómina; anula la liquidación desde allí' });
  removeCashMovementIfOpen(db, cur.cashMovementId);
  for (const p of db.prepare('SELECT cash_movement_id AS cm FROM expense_payments WHERE expense_id = ? AND cash_movement_id IS NOT NULL').all(id)) if (p.cm !== cur.cashMovementId) removeCashMovementIfOpen(db, p.cm);
  db.prepare('DELETE FROM expense_payments WHERE expense_id = ?').run(id);
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
  const rows = db.prepare(`${EXP_SELECT} WHERE e.status = 'pending' AND e.voided_at IS NULL ORDER BY COALESCE(e.due_date, e.date), e.id`).all().map(r => ({
    ...mapExpense(r),
    overdue: Boolean(r.dueDate && r.dueDate < t),
    dueSoon: Boolean(r.dueDate && r.dueDate >= t && r.dueDate <= soon),
    daysToDue: r.dueDate ? Math.round((new Date(r.dueDate + 'T00:00:00Z') - new Date(t + 'T00:00:00Z')) / 86400000) : null,
  }));
  const total = rows.reduce((a, r) => a + r.balance, 0);
  const overdue = rows.filter(r => r.overdue).reduce((a, r) => a + r.balance, 0);
  const dueSoon = rows.filter(r => r.dueSoon).reduce((a, r) => a + r.balance, 0);
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
    WHERE e.date BETWEEN ? AND ? AND e.voided_at IS NULL GROUP BY c.kind
  `).all(range.from, range.to);
  const k = Object.fromEntries(byKind.map(r => [r.kind, r.total]));
  const cogs = k.cogs || 0, opex = k.opex || 0, payroll = k.payroll || 0, other = k.other || 0;
  const totalExpenses = cogs + opex + payroll + other;
  const net = sales.s - totalExpenses;
  const byCategory = db.prepare(`
    SELECT c.id, c.name, c.emoji, c.kind, COALESCE(SUM(e.amount), 0) AS total, COUNT(e.id) AS count
    FROM expense_categories c
    LEFT JOIN expenses e ON e.category_id = c.id AND e.date BETWEEN ? AND ? AND e.voided_at IS NULL
    GROUP BY c.id ORDER BY total DESC, c.sort_order
  `).all(range.from, range.to);
  const pending = db.prepare("SELECT COALESCE(SUM(amount), 0) AS t, COUNT(*) AS c FROM expenses WHERE status = 'pending' AND voided_at IS NULL").get();
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
    WHERE e.date >= ? AND e.voided_at IS NULL GROUP BY mth, c.kind
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

/* ------------------------------------------------------------------ */
/* Informe contable para el contador                                    */
/* ------------------------------------------------------------------ */
const { buildAccounting } = require('../accounting');
router.get('/accounting', ADMIN, (req, res) => {
  const db = getDb();
  const range = periodRange(db, req.query);
  res.json(buildAccounting(db, range));
});

module.exports = router;
