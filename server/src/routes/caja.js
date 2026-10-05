/**
 * Caja (estilo del sistema anterior del cliente): ventas con filtros y resumen, movimientos de caja, propinas y descuentos.
 * Los filtros por período (fecha) o por turno sirven para todas las vistas.
 */
const { Router } = require('express');
const { getDb } = require('../db');
const { requirePerm } = require('../auth');
const { today, isDate } = require('../cashHelpers');

const router = Router();
router.use(requirePerm('shift'));

const METHOD_LABEL = { cash: 'Efectivo', card_debit: 'Datáfono débito', card_credit: 'Datáfono crédito', card: 'Datáfono', transfer: 'Transferencia', platform: 'Plataforma', credit: 'Crédito', mixed: 'Mixto' };
const TYPE_LABEL = { 'dine-in': 'Mesa', pickup: 'Para llevar', delivery: 'Domicilio' };
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

/** Rango de fechas según período (diario, semanal, mensual, personalizado) o turno. */
function scope(db, q) {
  const t = today(db);
  if (q.shiftId) return { shiftId: Number(q.shiftId), label: `Turno #${Number(q.shiftId)}` };
  const date = isDate(q.date) ? q.date : t;
  const period = q.period || 'day';
  if (period === 'custom' && isDate(q.from) && isDate(q.to)) return { from: q.from, to: q.to, label: `Del ${q.from} al ${q.to}` };
  if (period === 'week') return { from: addDays(date, -6), to: date, label: `7 días al ${date}` };
  if (period === 'month') return { from: date.slice(0, 7) + '-01', to: date, label: `Mes ${date.slice(0, 7)}` };
  return { from: date, to: date, label: `Día ${date}` };
}
function where(sc, alias = 'o', dateCol = 'created_at') {
  if (sc.shiftId) return { sql: `${alias}.shift_id = ?`, params: [sc.shiftId] };
  return { sql: `date(${alias}.${dateCol}) BETWEEN ? AND ?`, params: [sc.from, sc.to] };
}
/** Reparte lo cobrado de un pedido por medio (pagos mixtos en sus dos medios; la propina va al medio principal). */
function paidParts(o) {
  const parts = {};
  if (o.payment_status !== 'paid') return parts;
  const due = (o.total || 0) + (o.tip || 0);
  let sp = null; try { sp = o.payment_split ? JSON.parse(o.payment_split) : null; } catch { sp = null; }
  if (sp && sp.method1) {
    const a1 = Math.round(Number(sp.amount1) || 0), a2 = Math.round(Number(sp.amount2) || 0);
    parts[sp.method1] = (parts[sp.method1] || 0) + a1 + (due - a1 - a2);
    if (sp.method2) parts[sp.method2] = (parts[sp.method2] || 0) + a2;
  } else parts[o.payment_method] = due;
  return parts;
}
const mapOrder = o => ({
  id: o.id, label: o.sale_label || null, type: o.type, typeLabel: TYPE_LABEL[o.type] || o.type, status: o.status, paymentStatus: o.payment_status,
  table: o.table_label || o.table_number || null, people: o.people || 0, waiter: o.type === 'delivery' ? (o.driver_name || o.waiter_name || '') : (o.waiter_name || ''),
  customer: o.customer_name || '', createdAt: o.created_at, closedAt: o.closed_at || o.delivered_at || null, closedBy: o.closed_by || o.cashier_name || '',
  method: o.payment_method, methodLabel: METHOD_LABEL[o.payment_method] || o.payment_method, parts: paidParts(o), total: o.total || 0, tip: o.tip || 0,
  discount: o.discount || 0, discountReason: o.discount_reason || '', subtotal: o.subtotal || 0, shiftId: o.shift_id || null,
});

function loadOrders(db, q) {
  const sc = scope(db, q);
  const w = where(sc);
  let sql = `SELECT o.* FROM orders o WHERE ${w.sql} AND o.status != 'open'`;
  const params = [...w.params];
  if (q.type) { sql += ' AND o.type = ?'; params.push(String(q.type)); }
  if (q.waiter) { sql += " AND (COALESCE(o.waiter_name, '') = ? OR COALESCE(o.driver_name, '') = ?)"; params.push(String(q.waiter), String(q.waiter)); }
  if (q.status === 'cancelled') sql += " AND o.status = 'cancelled'";
  else if (q.status === 'closed') sql += " AND o.status = 'delivered'";
  else if (q.status === 'active') sql += " AND o.status NOT IN ('delivered', 'cancelled')";
  if (q.unpaid === '1') sql += " AND o.payment_status != 'paid' AND o.status != 'cancelled'";
  if (q.search) { sql += ' AND (CAST(o.id AS TEXT) = ? OR LOWER(COALESCE(o.customer_name, \'\')) LIKE ? OR LOWER(COALESCE(o.sale_label, \'\')) LIKE ?)'; const s = `%${String(q.search).toLowerCase()}%`; params.push(String(q.search).replace(/\D/g, ''), s, s); }
  sql += ' ORDER BY o.created_at DESC, o.id DESC';
  let rows = db.prepare(sql).all(...params).map(mapOrder);
  if (q.method) rows = rows.filter(o => o.method === q.method || (o.parts && o.parts[q.method] > 0) || (q.method === 'card' && ['card_debit', 'card_credit', 'card'].some(m => o.parts[m] > 0)));
  return { sc, rows };
}

/* ---------- Ventas ---------- */
router.get('/sales', (req, res) => {
  const db = getDb();
  const { sc, rows } = loadOrders(db, req.query);
  const valid = rows.filter(o => o.status !== 'cancelled');
  const total = valid.reduce((a, o) => a + o.total, 0);
  const tips = valid.reduce((a, o) => a + o.tip, 0);
  const dine = valid.filter(o => o.type === 'dine-in');
  const people = dine.reduce((a, o) => a + (o.people || 0), 0);
  const byMethod = {};
  for (const o of valid) for (const [m, v] of Object.entries(o.parts)) byMethod[m] = (byMethod[m] || 0) + v;
  const pending = valid.filter(o => o.paymentStatus !== 'paid').reduce((a, o) => a + o.total + o.tip, 0);
  const byType = {};
  for (const o of valid) { const b = byType[o.type] || (byType[o.type] = { type: o.type, label: o.typeLabel, count: 0, total: 0, tips: 0 }); b.count++; b.total += o.total; b.tips += o.tip; }
  const waiters = [...new Set(db.prepare("SELECT DISTINCT COALESCE(waiter_name, '') AS w FROM orders WHERE COALESCE(waiter_name, '') != '' UNION SELECT DISTINCT COALESCE(driver_name, '') FROM orders WHERE COALESCE(driver_name, '') != ''").all().map(r => r.w).filter(Boolean))].sort();
  res.json({
    scope: sc,
    summary: {
      count: valid.length, total, tips, totalWithTips: total + tips, avgTicket: valid.length ? Math.round(total / valid.length) : 0,
      people, avgPerPerson: people ? Math.round(dine.reduce((a, o) => a + o.total, 0) / people) : 0,
      discounts: valid.reduce((a, o) => a + o.discount, 0), cancelled: rows.length - valid.length, cancelledTotal: rows.filter(o => o.status === 'cancelled').reduce((a, o) => a + o.total, 0), pending,
    },
    byMethod: Object.entries(byMethod).map(([method, amount]) => ({ method, label: METHOD_LABEL[method] || method, amount })).sort((a, b) => b.amount - a.amount),
    byType: Object.values(byType), orders: rows, waiters,
  });
});

/* ---------- Propinas ---------- */
router.get('/tips', (req, res) => {
  const db = getDb();
  const { sc, rows } = loadOrders(db, req.query);
  const list = rows.filter(o => o.status !== 'cancelled' && o.tip > 0).map(o => ({ id: o.id, date: o.closedAt || o.createdAt, table: o.table, type: o.typeLabel, waiter: o.waiter, customer: o.customer, method: o.methodLabel, saleTotal: o.total, amount: o.tip, source: 'sale' }));
  // Propinas registradas a mano en Personal (no vienen de una venta)
  const w = sc.shiftId ? { sql: 't.shift_id = ?', params: [sc.shiftId] } : { sql: 't.date BETWEEN ? AND ?', params: [sc.from, sc.to] };
  for (const t of db.prepare(`SELECT t.*, e.name AS emp FROM tips t LEFT JOIN employees e ON e.id = t.employee_id WHERE ${w.sql} AND COALESCE(t.notes, '') NOT LIKE 'Propina pedido #%'`).all(...w.params)) {
    if (req.query.waiter && t.emp !== req.query.waiter) continue;
    list.push({ id: null, date: t.date, table: null, type: 'Registro manual', waiter: t.emp || 'Común', customer: '', method: METHOD_LABEL[t.method] || t.method, saleTotal: 0, amount: t.amount, source: 'manual' });
  }
  list.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const byWaiter = {};
  for (const t of list) { const k = t.waiter || 'Sin mesero'; byWaiter[k] = (byWaiter[k] || 0) + t.amount; }
  const byMethod = {};
  for (const t of list) byMethod[t.method] = (byMethod[t.method] || 0) + t.amount;
  res.json({ scope: sc, count: list.length, total: list.reduce((a, t) => a + t.amount, 0), tips: list, byWaiter: Object.entries(byWaiter).map(([waiter, amount]) => ({ waiter, amount })), byMethod: Object.entries(byMethod).map(([method, amount]) => ({ method, amount })) });
});

/* ---------- Descuentos ---------- */
router.get('/discounts', (req, res) => {
  const db = getDb();
  const { sc, rows } = loadOrders(db, req.query);
  const list = rows.filter(o => o.status !== 'cancelled' && o.discount > 0).map(o => ({ id: o.id, date: o.closedAt || o.createdAt, table: o.table, type: o.typeLabel, waiter: o.waiter, customer: o.customer, reason: o.discountReason, by: o.closedBy, gross: o.subtotal + 0, saleTotal: o.total, amount: o.discount }));
  res.json({ scope: sc, count: list.length, total: list.reduce((a, d) => a + d.amount, 0), discounts: list });
});

/* ---------- Movimientos de caja ---------- */
router.get('/movements', (req, res) => {
  const db = getDb();
  const sc = scope(db, req.query);
  const w = sc.shiftId ? { sql: 'm.shift_id = ?', params: [sc.shiftId] } : { sql: 'date(m.created_at) BETWEEN ? AND ?', params: [sc.from, sc.to] };
  let sql = `SELECT m.*, s.cashier_name AS shiftCashier FROM cash_movements m LEFT JOIN cash_shifts s ON s.id = m.shift_id WHERE ${w.sql}`;
  if (req.query.type === 'withdrawal' || req.query.type === 'deposit') sql += ` AND m.type = '${req.query.type}'`;
  const rows = db.prepare(sql + ' ORDER BY m.created_at DESC, m.id DESC').all(...w.params);
  // Origen del movimiento: gasto, anticipo, abono a proveedor o manual
  const expBy = Object.fromEntries(db.prepare('SELECT cash_movement_id AS m, number, description FROM expenses WHERE cash_movement_id IS NOT NULL').all().map(r => [r.m, r]));
  const advBy = Object.fromEntries(db.prepare('SELECT a.cash_movement_id AS m, e.name FROM advances a LEFT JOIN employees e ON e.id = a.employee_id WHERE a.cash_movement_id IS NOT NULL').all().map(r => [r.m, r]));
  const list = rows.map(m => ({ id: m.id, date: m.created_at, shiftId: m.shift_id, type: m.type, typeLabel: m.type === 'withdrawal' ? 'Egreso' : 'Ingreso', amount: m.amount, reason: m.reason, user: m.cashier_name || m.shiftCashier || '',
    origin: expBy[m.id] ? `Gasto N.º ${String(expBy[m.id].number || '').padStart(6, '0')}` : advBy[m.id] ? `Anticipo a ${advBy[m.id].name}` : 'Manual' }));
  res.json({ scope: sc, movements: list, deposits: list.filter(m => m.type === 'deposit').reduce((a, m) => a + m.amount, 0), withdrawals: list.filter(m => m.type === 'withdrawal').reduce((a, m) => a + m.amount, 0) });
});

/* ---------- Turnos (para el filtro y la lista de arqueos) ---------- */
router.get('/shifts', (req, res) => {
  const rows = getDb().prepare('SELECT id, cashier_name AS cashierName, opened_at AS openedAt, closed_at AS closedAt, status, initial_cash AS initialCash, expected_cash AS expectedCash, actual_cash AS actualCash, difference, total_sales AS totalSales, COALESCE(total_tips, 0) AS totalTips, total_orders AS totalOrders, counted_detail AS countedDetail, expected_detail AS expectedDetail FROM cash_shifts ORDER BY opened_at DESC, id DESC LIMIT 60').all();
  res.json(rows.map(r => ({ ...r, countedDetail: r.countedDetail ? JSON.parse(r.countedDetail) : null, expectedDetail: r.expectedDetail ? JSON.parse(r.expectedDetail) : null })));
});

module.exports = router;
