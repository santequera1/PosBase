/**
 * Módulo Caja / Ventas (referencia: Fudo): Ventas, Movimientos de caja, Arqueos (con conciliación), Propinas y Descuentos.
 *
 * Período común a todas las vistas:
 *  - period: day | week | month | year | custom (con hora) o shiftId (= "Arqueo": exactamente las ventas de ese turno de caja)
 *  - dateBy: start (hora de inicio) | close (hora de cierre)
 *  - turno: nombre de un turno de servicio configurado (Almuerzo, Cena…) → filtra por la hora del día
 */
const { Router } = require('express');
const { getDb } = require('../db');
const { requirePerm, hasAction } = require('../auth');
const { today, isDate, now } = require('../cashHelpers');
const { formatOrder } = require('../orderFormat');
const { readRestaurantConfig } = require('../restaurantSchema');
const D = require('../discounts');
const { branchWhere } = require('../branches');
const L = require('../ledger');

const router = Router();
router.use(requirePerm('shift'));
router.use(L.syncOnWrite(getDb));

const METHOD_LABEL = { cash: 'Efectivo', card_debit: 'Datáfono débito', card_credit: 'Datáfono crédito', card: 'Datáfono', transfer: 'Transferencia', platform: 'Plataforma', credit: 'A crédito', mixed: 'Mixto' };
const TYPE_LABEL = { 'dine-in': 'Mesa', pickup: 'Mostrador', delivery: 'Domicilio' };
const STATUS_LABEL = { cancelled: 'Cancelada', delivered: 'Cerrada', shipped: 'Enviado', open: 'En curso', pending: 'Pendiente', preparing: 'En curso', billing: 'Pagando', ready: 'A entregar' };
const METHODS = ['cash', 'card_debit', 'card_credit', 'card', 'transfer', 'platform', 'credit', 'mixed'];
const pad = n => String(n).padStart(2, '0');
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const fmtTs = ts => `${ts.slice(8, 10)}/${ts.slice(5, 7)}/${ts.slice(2, 4)} ${ts.slice(11, 16)} hs`;

/* ---------------- período ---------------- */
function scope(db, q) {
  const t = today(db);
  const dateBy = q.dateBy === 'close' ? 'close' : 'start';
  const turno = q.turno ? String(q.turno) : '';
  if (q.shiftId) {
    const s = db.prepare('SELECT id, opened_at, closed_at, cashier_name FROM cash_shifts WHERE id = ?').get(Number(q.shiftId));
    return { shiftId: Number(q.shiftId), dateBy, turno, label: s ? `Arqueo #${s.id} · ${s.cashier_name} · del ${fmtTs(s.opened_at)}${s.closed_at ? ' al ' + fmtTs(s.closed_at) : ' (abierto)'}` : `Arqueo #${q.shiftId}` };
  }
  const date = isDate(q.date) ? q.date : t;
  const period = q.period || 'day';
  let from = date, to = addDays(date, 1), fromTime = '00:00', toTime = '00:00';
  if (period === 'week') { from = addDays(date, -6); to = addDays(date, 1); }
  else if (period === 'month') { from = date.slice(0, 7) + '-01'; const [y, m] = date.split('-').map(Number); to = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`; }
  else if (period === 'year') { from = date.slice(0, 4) + '-01-01'; to = `${Number(date.slice(0, 4)) + 1}-01-01`; }
  else if (period === 'custom' && isDate(q.from) && isDate(q.to)) {
    fromTime = /^\d{2}:\d{2}$/.test(q.fromTime || '') ? q.fromTime : '00:00';
    toTime = /^\d{2}:\d{2}$/.test(q.toTime || '') ? q.toTime : '';
    from = q.from; to = toTime ? q.to : addDays(q.to, 1); if (!toTime) toTime = '00:00';
  }
  const fromTs = `${from} ${fromTime}:00`, toTs = `${to} ${toTime}:00`;
  return { from, to: addDays(to, -1), fromTs, toTs, dateBy, turno, period, q: { branch: q.branch }, label: `Del ${fmtTs(fromTs)} al ${fmtTs(toTs)}` };
}
const tsExpr = (sc, alias = 'o') => (sc.dateBy === 'close' ? `COALESCE(${alias}.closed_at, ${alias}.delivered_at, ${alias}.created_at)` : `${alias}.created_at`);
function where(sc, alias = 'o') {
  if (sc.shiftId) return { sql: `${alias}.shift_id = ?`, params: [sc.shiftId] };
  const bw = branchWhere(alias, sc.q || {});
  return { sql: `${tsExpr(sc, alias)} >= ? AND ${tsExpr(sc, alias)} < ?${bw.sql}`, params: [sc.fromTs, sc.toTs, ...bw.params] };
}
/** ¿La hora del día cae en el turno de servicio (Almuerzo, Cena…)? Admite turnos que pasan la medianoche. */
function inTurno(db, sc, ts) {
  if (!sc.turno || !ts) return true;
  const t = (readRestaurantConfig(db).serviceShifts || []).find(s => s.name === sc.turno);
  if (!t) return true;
  const hm = String(ts).slice(11, 16);
  return t.from <= t.to ? hm >= t.from && hm <= t.to : hm >= t.from || hm <= t.to;
}

/** Lo cobrado de un pedido por medio (pagos mixtos en sus dos medios; la propina va al medio principal). */
const PS = require('../paymentSplit');
function paidParts(o) {
  const parts = {};
  if (o.payment_status !== 'paid') return parts;
  const due = (o.total || 0) + (o.tip || 0);
  const sp = PS.splitParts(o.payment_split);
  if (sp.length) {
    const sum = sp.reduce((a, p) => a + p.amount, 0);
    sp.forEach((p, i) => { parts[p.method] = (parts[p.method] || 0) + p.amount + (i === 0 ? due - sum : 0); });
  } else parts[o.payment_method] = due;
  return parts;
}
function roomsMap(db) {
  try { return Object.fromEntries(db.prepare('SELECT t.id, r.name FROM tables t LEFT JOIN rooms r ON r.id = t.room_id').all().map(r => [r.id, r.name || 'Salón'])); } catch { return {}; }
}
const mapOrder = (o, rooms = {}) => ({
  id: o.id, label: o.sale_label || null, type: o.type, typeLabel: TYPE_LABEL[o.type] || o.type, status: o.status, statusLabel: STATUS_LABEL[o.status] || o.status, paymentStatus: o.payment_status,
  table: o.table_label || o.table_number || null, room: o.table_id ? (rooms[o.table_id] || 'Salón') : null, people: o.people || 0,
  waiter: o.type === 'delivery' ? (o.driver_name || o.waiter_name || '') : (o.waiter_name || ''),
  customer: o.customer_name && o.customer_name !== 'Consumidor Final' ? o.customer_name : '', customerPhone: o.customer_phone || '',
  createdAt: o.created_at, closedAt: o.closed_at || o.delivered_at || (o.status === 'delivered' ? o.created_at : null), closedBy: o.closed_by || '', createdBy: o.created_by || o.cashier_name || '',
  method: o.payment_method, methodLabel: METHOD_LABEL[o.payment_method] || o.payment_method, parts: paidParts(o), total: o.total || 0, tip: o.tip || 0, deliveryFee: o.delivery_fee || 0,
  discount: o.discount || 0, discountReason: o.discount_reason || '', discountName: o.discount_name || '', subtotal: o.subtotal || 0, shiftId: o.shift_id || null,
  invoiced: Boolean(o.fe_number), invoiceNumber: o.fe_number || '', cancelReason: o.cancel_reason || '',
});

function loadOrders(db, q) {
  const sc = scope(db, q);
  const w = where(sc);
  let sql = `SELECT o.* FROM orders o WHERE ${w.sql} AND (o.status != 'open' OR EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id))`;
  const params = [...w.params];
  if (q.type) { sql += ' AND o.type = ?'; params.push(String(q.type)); }
  if (q.waiter) { sql += " AND (COALESCE(o.waiter_name, '') = ? OR COALESCE(o.driver_name, '') = ?)"; params.push(String(q.waiter), String(q.waiter)); }
  const st = String(q.status || '');
  if (st === 'cancelled') sql += " AND o.status = 'cancelled'";
  else if (st === 'closed' || st === 'delivered') sql += " AND o.status = 'delivered'";
  else if (st === 'shipped') sql += " AND o.status = 'shipped'";
  else if (st === 'active') sql += " AND o.status IN ('open', 'preparing', 'pending')";
  else if (st === 'billing') sql += " AND o.status = 'billing'";
  else if (st === 'ready') sql += " AND o.status = 'ready'";
  else if (st === 'unpaid') sql += " AND o.payment_status != 'paid' AND o.status = 'delivered'";
  if (q.table) { sql += ' AND COALESCE(o.table_label, CAST(o.table_number AS TEXT)) = ?'; params.push(String(q.table)); }
  if (q.customer) { sql += " AND (LOWER(COALESCE(o.customer_name, '')) LIKE ? OR COALESCE(o.customer_phone, '') LIKE ?)"; const s = `%${String(q.customer).toLowerCase()}%`; params.push(s, `%${String(q.customer).replace(/\D/g, '') || '§'}%`); }
  if (q.invoiced === 'yes') sql += ' AND o.fe_number IS NOT NULL';
  else if (q.invoiced === 'no') sql += ' AND o.fe_number IS NULL';
  if (q.discountId) { sql += ' AND o.discount_id = ?'; params.push(Number(q.discountId)); }
  if (q.search) { sql += " AND (CAST(o.id AS TEXT) = ? OR LOWER(COALESCE(o.customer_name, '')) LIKE ? OR LOWER(COALESCE(o.sale_label, '')) LIKE ?)"; const s = `%${String(q.search).toLowerCase()}%`; params.push(String(q.search).replace(/\D/g, ''), s, s); }
  sql += ` ORDER BY ${tsExpr(sc)} DESC, o.id DESC`;
  const rooms = roomsMap(db);
  let rows = db.prepare(sql).all(...params).filter(o => inTurno(db, sc, sc.dateBy === 'close' ? (o.closed_at || o.delivered_at || o.created_at) : o.created_at)).map(o => mapOrder(o, rooms));
  if (q.method) rows = rows.filter(o => o.method === q.method || (o.parts && o.parts[q.method] > 0) || (q.method === 'card' && ['card_debit', 'card_credit', 'card'].some(m => o.parts[m] > 0)));
  return { sc, rows };
}

/* ---------------- Ventas ---------------- */
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
  const byType = {}, byRoom = {};
  for (const o of valid) {
    const b = byType[o.type] || (byType[o.type] = { type: o.type, label: o.typeLabel, count: 0, total: 0, tips: 0 }); b.count++; b.total += o.total; b.tips += o.tip;
    const rk = o.room || 'Sin salón'; byRoom[rk] = (byRoom[rk] || 0) + o.total;
  }
  // Adiciones canceladas (productos quitados de cuentas ya enviadas a cocina o antes de cobrar)
  const ids = rows.map(o => o.id);
  let cancels = { count: 0, amount: 0 };
  if (ids.length) {
    const c = db.prepare(`SELECT COUNT(*) AS c, COALESCE(SUM(quantity * price), 0) AS a FROM order_item_cancellations WHERE order_id IN (${ids.map(() => '?').join(',')})`).get(...ids);
    cancels = { count: c.c, amount: c.a };
  }
  const waiters = [...new Set(db.prepare("SELECT DISTINCT COALESCE(waiter_name, '') AS w FROM orders WHERE COALESCE(waiter_name, '') != '' UNION SELECT DISTINCT COALESCE(driver_name, '') FROM orders WHERE COALESCE(driver_name, '') != ''").all().map(r => r.w).filter(Boolean))].sort();
  const tables = [...new Set(db.prepare('SELECT label FROM tables WHERE active = 1 ORDER BY sort_order, id').all().map(r => r.label))];
  res.json({
    scope: sc, records: rows.length,
    summary: {
      count: valid.length, total, tips, totalWithTips: total + tips, avgTicket: valid.length ? Math.round(total / valid.length) : 0,
      people, avgPerPerson: people ? Math.round(dine.reduce((a, o) => a + o.total, 0) / people) : 0, deliveryFees: valid.reduce((a, o) => a + o.deliveryFee, 0),
      discounts: valid.reduce((a, o) => a + o.discount, 0), cancelled: rows.length - valid.length, cancelledTotal: rows.filter(o => o.status === 'cancelled').reduce((a, o) => a + o.total, 0), pending,
      cancelledItems: cancels.count, cancelledItemsAmount: cancels.amount,
    },
    byMethod: Object.entries(byMethod).map(([method, amount]) => ({ method, label: METHOD_LABEL[method] || method, amount })).sort((a, b) => b.amount - a.amount),
    byType: Object.values(byType), byRoom: Object.entries(byRoom).map(([room, amount]) => ({ room, amount })).sort((a, b) => b.amount - a.amount),
    orders: rows, waiters, tables, serviceShifts: readRestaurantConfig(db).serviceShifts || [],
  });
});

/** Detalle de una venta: productos, cancelaciones, pagos, propina y turno de caja. */
router.get('/sales/:id', (req, res) => {
  const db = getDb();
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(req.params.id));
  if (!o) return res.status(404).json({ error: 'Venta no encontrada' });
  const shift = o.shift_id ? db.prepare('SELECT id, status, cashier_name AS cashierName FROM cash_shifts WHERE id = ?').get(o.shift_id) : null;
  res.json({
    order: formatOrder(db, o), summary: mapOrder(o, roomsMap(db)), shift,
    cancellations: db.prepare('SELECT id, name, quantity, price, was_sent AS wasSent, reason, cancelled_by AS cancelledBy, cancelled_at AS cancelledAt FROM order_item_cancellations WHERE order_id = ? ORDER BY id').all(o.id),
    creditPayments: db.prepare('SELECT id, date, amount, method, notes FROM order_payments WHERE order_id = ? ORDER BY id').all(o.id),
    canEdit: canEditSale(db, { role: req.user?.role }, o),
  });
});

/** Corregir pagos o propinas: el administrador siempre; los demás solo si la venta es de una caja que sigue abierta. */
function canEditSale(db, user, o) {
  if (!o || o.status !== 'delivered') return false;
  if (user && user.role === 'admin') return true;
  const s = o.shift_id ? db.prepare('SELECT status FROM cash_shifts WHERE id = ?').get(o.shift_id) : null;
  return Boolean(s && s.status === 'open');
}

router.post('/sales/:id/payment', (req, res) => {
  const db = getDb();
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(req.params.id));
  if (!o) return res.status(404).json({ error: 'Venta no encontrada' });
  if (o.status !== 'delivered') return res.status(400).json({ error: 'Solo se corrige el pago de ventas cerradas' });
  if (!canEditSale(db, req.user, o)) return res.status(403).json({ error: 'La caja de esta venta ya está cerrada: solo un administrador puede corregir el pago' });
  if (o.payment_method === 'payroll') return res.status(400).json({ error: 'Esta venta se cobró por descuento de nómina: para cambiar el pago, anúlala y vuelve a cobrarla' });
  const method = String(req.body.paymentMethod || '');
  if (!METHODS.includes(method)) return res.status(400).json({ error: 'Medio de pago inválido' });
  const due = (o.total || 0) + (o.tip || 0);
  let split = null;
  if (method === 'mixed') {
    const r = PS.readSplitInput(req.body.paymentSplit, due, METHODS);
    if (r.error) return res.status(400).json({ error: r.error });
    split = r.split;
  }
  const paymentStatus = method === 'credit' ? 'pending' : 'paid';
  db.prepare('UPDATE orders SET payment_method = ?, payment_split = ?, payment_status = ?, cash_received = ?, cash_change = 0 WHERE id = ?')
    .run(method, split ? JSON.stringify(split) : null, paymentStatus, method === 'cash' ? due : (split ? PS.cashOf(split) : 0), o.id);
  if (o.tip > 0) {
    const tipMethod = method === 'cash' || (split && PS.hasMethod(split, 'cash')) ? 'cash' : method === 'transfer' ? 'transfer' : 'card';
    db.prepare('UPDATE tips SET method = ? WHERE notes = ?').run(tipMethod, `Propina pedido #${o.id}`);
  }
  const fresh = formatOrder(db, db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id));
  if (req.app.io) req.app.io.emit('order:updated', fresh);
  res.json(fresh);
});

/**
 * Corregir datos de una venta (cliente, documento, contacto, dirección, mesero, personas, etiqueta, comentario) para
 * reimprimir el recibo actualizado. No toca productos ni valores. Si ya tiene factura electrónica, el cliente no cambia.
 */
router.post('/sales/:id/details', (req, res) => {
  const db = getDb();
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(req.params.id));
  if (!o) return res.status(404).json({ error: 'Venta no encontrada' });
  if (o.status === 'cancelled') return res.status(400).json({ error: 'La venta está anulada' });
  const b = req.body || {};
  const customerKeys = ['customerName', 'customerDoc', 'customerEmail', 'customerPhone', 'customerAddress', 'customerNeighborhood'];
  // Los datos del cliente (para la factura electrónica) se pueden completar aunque la caja ya esté cerrada: no tocan valores
  const onlyCustomer = Object.keys(b).every(k => customerKeys.includes(k) || ['customerId', 'saveCustomer', 'isCompany', 'dv'].includes(k));
  if (o.status === 'delivered' && !onlyCustomer && !canEditSale(db, req.user, o)) return res.status(403).json({ error: 'La caja de esta venta ya está cerrada: solo un administrador puede editar sus datos' });
  const str = (v, max) => String(v === undefined || v === null ? '' : v).trim().slice(0, max);
  const invoiced = Boolean(o.fe_cufe || o.fe_number);
  const sets = [], vals = [];
  const set = (col, v) => { sets.push(col + ' = ?'); vals.push(v); };
  if (invoiced && customerKeys.some(k => b[k] !== undefined && str(b[k], 160) !== str(o[k.replace(/[A-Z]/g, m => '_' + m.toLowerCase())], 160))) {
    return res.status(400).json({ error: 'Esta venta ya tiene factura electrónica: los datos del cliente no se pueden cambiar' });
  }
  if (b.customerName !== undefined) set('customer_name', str(b.customerName, 120) || 'Consumidor Final');
  if (b.customerDoc !== undefined) set('customer_doc', str(b.customerDoc, 30).replace(/[^0-9A-Za-z-]/g, '') || '222222222222');
  if (b.customerEmail !== undefined) set('customer_email', str(b.customerEmail, 120) || null);
  if (b.customerPhone !== undefined) set('customer_phone', str(b.customerPhone, 40) || null);
  if (b.customerAddress !== undefined) set('customer_address', str(b.customerAddress, 160) || null);
  if (b.customerNeighborhood !== undefined) set('customer_neighborhood', str(b.customerNeighborhood, 80) || null);
  if (b.label !== undefined) set('sale_label', str(b.label, 80) || null);
  if (b.notes !== undefined) set('notes', str(b.notes, 300));
  if (b.people !== undefined) set('people', Math.max(0, Math.round(Number(b.people) || 0)));
  if (b.driverId !== undefined) {
    const d = Number(b.driverId) ? db.prepare('SELECT id, name FROM employees WHERE id = ?').get(Number(b.driverId)) : null;
    set('driver_id', d ? d.id : null); set('driver_name', d ? d.name : null);
  }
  if (b.waiterId !== undefined) {
    const w = Number(b.waiterId) ? db.prepare('SELECT id, name FROM employees WHERE id = ?').get(Number(b.waiterId)) : null;
    set('waiter_id', w ? w.id : null); set('waiter_name', w ? w.name : null);
    // La propina asignada al mesero pasa al nuevo mesero
    if (o.tip > 0 && o.tip_to === 'waiter') db.prepare('UPDATE tips SET employee_id = ? WHERE notes = ?').run(w ? w.id : null, `Propina pedido #${o.id}`);
  }
  // Cliente del directorio: se vincula (la factura toma de ahí si es empresa, su DV y su responsabilidad de IVA)
  let customerId = null;
  if (!invoiced && b.customerId) {
    const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(Number(b.customerId));
    if (!c) return res.status(400).json({ error: 'Cliente no encontrado' });
    customerId = c.id;
  }
  // Guardar (o actualizar) en el directorio con los datos escritos
  if (!invoiced && b.saveCustomer) {
    const doc = str(b.customerDoc, 30).replace(/[^0-9A-Za-z-]/g, '');
    const name = str(b.customerName, 120);
    if (!doc || doc === '222222222222' || name.length < 2) return res.status(400).json({ error: 'Para guardar el cliente escribe su nombre y su cédula o NIT' });
    const isCompany = b.isCompany ? 1 : 0;
    const dv = isCompany ? str(b.dv, 2).replace(/\D/g, '') : '';
    const cur = (customerId && db.prepare('SELECT id FROM customers WHERE id = ?').get(customerId)) || db.prepare('SELECT id FROM customers WHERE document_id = ?').get(doc);
    if (cur) {
      db.prepare('UPDATE customers SET name = ?, document_id = ?, email = ?, phone = ?, address = COALESCE(NULLIF(?, \'\'), address), is_company = ?, dv = ?, doc_type = ? WHERE id = ?')
        .run(name, doc, str(b.customerEmail, 120), str(b.customerPhone, 40), str(b.customerAddress, 160), isCompany, dv, isCompany ? 'NIT' : 'CC', cur.id);
      customerId = cur.id;
    } else {
      customerId = Number(db.prepare("INSERT INTO customers (name, document_id, email, phone, address, notes, is_company, dv, doc_type) VALUES (?, ?, ?, ?, ?, 'Creado desde Caja → Ventas', ?, ?, ?)")
        .run(name, doc, str(b.customerEmail, 120), str(b.customerPhone, 40), str(b.customerAddress, 160), isCompany, dv, isCompany ? 'NIT' : 'CC').lastInsertRowid);
    }
  }
  if (customerId) set('customer_id', customerId);
  if (!sets.length) return res.status(400).json({ error: 'No hay cambios' });
  db.prepare(`UPDATE orders SET ${sets.join(', ')} WHERE id = ?`).run(...vals, o.id);
  const fresh = formatOrder(db, db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id));
  if (req.app.io) req.app.io.emit('order:updated', fresh);
  res.json(fresh);
});

router.post('/sales/:id/tip', (req, res) => {
  const db = getDb();
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(req.params.id));
  if (!o) return res.status(404).json({ error: 'Venta no encontrada' });
  if (o.status !== 'delivered') return res.status(400).json({ error: 'Solo se corrige la propina de ventas cerradas' });
  if (!canEditSale(db, req.user, o)) return res.status(403).json({ error: 'La caja de esta venta ya está cerrada: solo un administrador puede corregir la propina' });
  const tip = Math.max(0, Math.round(Number(req.body.tip) || 0));
  const tipTo = req.body.tipTo === 'waiter' && o.waiter_id ? 'waiter' : 'common';
  // En pagos mixtos la diferencia de la propina se carga al primer medio
  let split = null;
  const sp = PS.splitParts(o.payment_split);
  if (sp.length) { sp[0].amount = Math.max(0, sp[0].amount + (tip - (o.tip || 0))); split = PS.makeSplit(sp); }
  db.prepare('UPDATE orders SET tip = ?, tip_to = ?, payment_split = ?, cash_received = CASE WHEN payment_method = \'cash\' THEN total + ? ELSE cash_received END WHERE id = ?')
    .run(tip, tip > 0 ? tipTo : null, split ? JSON.stringify(split) : o.payment_split, tip, o.id);
  const prev = db.prepare('SELECT * FROM tips WHERE notes = ?').get(`Propina pedido #${o.id}`);
  db.prepare('DELETE FROM tips WHERE notes = ?').run(`Propina pedido #${o.id}`);
  if (tip > 0) {
    const m = o.payment_method;
    const tipMethod = m === 'cash' || (split && PS.hasMethod(split, 'cash')) ? 'cash' : m === 'transfer' ? 'transfer' : 'card';
    db.prepare('INSERT INTO tips (date, employee_id, amount, method, shift_id, notes) VALUES (?, ?, ?, ?, ?, ?)')
      .run(prev ? prev.date : String(o.closed_at || o.created_at).slice(0, 10), tipTo === 'waiter' ? o.waiter_id : null, tip, tipMethod, o.shift_id || null, `Propina pedido #${o.id}`);
  }
  const fresh = formatOrder(db, db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id));
  if (req.app.io) req.app.io.emit('order:updated', fresh);
  res.json(fresh);
});

/* ---------------- Propinas ---------------- */
router.get('/tips', (req, res) => {
  const db = getDb();
  const { sc, rows } = loadOrders(db, req.query);
  const list = rows.filter(o => o.status !== 'cancelled' && o.tip > 0).map(o => ({ id: o.id, date: o.closedAt || o.createdAt, table: o.table, type: o.typeLabel, waiter: o.waiter, customer: o.customer, method: o.methodLabel, saleTotal: o.total, amount: o.tip, source: 'sale', createdAt: o.createdAt, closedAt: o.closedAt }));
  // Propinas registradas a mano en Personal (no vienen de una venta)
  if (!req.query.customer && !req.query.type) {
    const w = sc.shiftId ? { sql: 't.shift_id = ?', params: [sc.shiftId] } : { sql: 't.date BETWEEN ? AND ?', params: [sc.from, sc.to] };
    for (const t of db.prepare(`SELECT t.*, e.name AS emp FROM tips t LEFT JOIN employees e ON e.id = t.employee_id WHERE ${w.sql} AND COALESCE(t.notes, '') NOT LIKE 'Propina pedido #%'`).all(...w.params)) {
      if (req.query.waiter && t.emp !== req.query.waiter) continue;
      if (req.query.method && t.method !== req.query.method) continue;
      list.push({ id: null, date: t.date, table: null, type: 'Registro manual', waiter: t.emp || 'Común', customer: '', method: METHOD_LABEL[t.method] || t.method, saleTotal: 0, amount: t.amount, source: 'manual', manualId: t.id, notes: t.notes });
    }
  }
  list.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const byWaiter = {};
  for (const t of list) { const k = t.waiter || 'Sin mesero'; byWaiter[k] = (byWaiter[k] || 0) + t.amount; }
  const byMethod = {};
  for (const t of list) byMethod[t.method] = (byMethod[t.method] || 0) + t.amount;
  res.json({ scope: sc, count: list.length, total: list.reduce((a, t) => a + t.amount, 0), tips: list, byWaiter: Object.entries(byWaiter).map(([waiter, amount]) => ({ waiter, amount })).sort((a, b) => b.amount - a.amount), byMethod: Object.entries(byMethod).map(([method, amount]) => ({ method, amount })) });
});

/* ---------------- Descuentos: aplicados en el período + catálogo ---------------- */
router.get('/discounts', (req, res) => {
  const db = getDb();
  const { sc, rows } = loadOrders(db, req.query);
  const list = rows.filter(o => o.status !== 'cancelled' && o.discount > 0).map(o => ({ id: o.id, date: o.closedAt || o.createdAt, table: o.table, type: o.typeLabel, waiter: o.waiter, customer: o.customer, reason: o.discountReason, name: o.discountName || 'Otro descuento', by: o.closedBy, saleTotal: o.total, amount: o.discount }));
  res.json({ scope: sc, count: list.length, total: list.reduce((a, d) => a + d.amount, 0), discounts: list });
});

router.get('/discounts-catalog', (req, res) => {
  const db = getDb();
  const sc = scope(db, req.query);
  const usage = D.discountUsage(db, sc.from, sc.to);
  const catalog = D.listDiscounts(db).map(d => ({ ...d, timesUsed: usage.all[d.id]?.times || 0, amountUsed: usage.all[d.id]?.amount || 0, lastUsed: usage.all[d.id]?.last || null, periodTimes: usage.period[d.id]?.times || 0, periodAmount: usage.period[d.id]?.amount || 0 }));
  const manual = db.prepare("SELECT COUNT(*) AS c, COALESCE(SUM(discount), 0) AS a FROM orders WHERE discount > 0 AND discount_id IS NULL AND status != 'cancelled' AND date(created_at) BETWEEN ? AND ?").get(sc.from || '0000-01-01', sc.to || '9999-12-31');
  res.json({
    scope: sc, catalog,
    kpis: { active: catalog.filter(d => d.active).length, inactive: catalog.filter(d => !d.active).length, applied: catalog.reduce((a, d) => a + d.periodTimes, 0) + manual.c, total: catalog.reduce((a, d) => a + d.periodAmount, 0) + manual.a },
    manual: { times: manual.c, amount: manual.a },
  });
});
const ADMIN_ONLY = (req, res, next) => (req.user?.role === 'admin' ? next() : res.status(403).json({ error: 'Solo un administrador puede crear o editar descuentos' }));
router.post('/discounts-catalog', ADMIN_ONLY, (req, res) => {
  try { res.status(201).json(D.saveDiscount(getDb(), req.body || {})); } catch (e) { res.status(400).json({ error: e.message }); }
});
router.put('/discounts-catalog/:id', ADMIN_ONLY, (req, res) => {
  try { res.json(D.saveDiscount(getDb(), req.body || {}, req.params.id)); } catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/discounts-catalog/:id', ADMIN_ONLY, (req, res) => {
  const db = getDb();
  const d = db.prepare('SELECT * FROM discounts WHERE id = ?').get(Number(req.params.id));
  if (!d) return res.status(404).json({ error: 'Descuento no encontrado' });
  if (d.special) return res.status(400).json({ error: 'El descuento de empleados no se elimina; puedes desactivarlo' });
  const used = db.prepare('SELECT COUNT(*) AS c FROM orders WHERE discount_id = ?').get(d.id).c;
  if (used) { db.prepare('UPDATE discounts SET active = 0 WHERE id = ?').run(d.id); return res.json({ success: true, deactivated: true }); }
  db.prepare('DELETE FROM discounts WHERE id = ?').run(d.id);
  res.json({ success: true, deleted: true });
});

/* ---------------- Movimientos de caja ---------------- */
router.get('/movements', (req, res) => {
  const db = getDb();
  const sc = scope(db, req.query);
  const mbw = branchWhere('s', req.query);
  const w = sc.shiftId ? { sql: 'm.shift_id = ?', params: [sc.shiftId] } : { sql: 'm.created_at >= ? AND m.created_at < ?' + mbw.sql, params: [sc.fromTs, sc.toTs, ...mbw.params] };
  let sql = `SELECT m.*, s.cashier_name AS shiftCashier FROM cash_movements m LEFT JOIN cash_shifts s ON s.id = m.shift_id WHERE ${w.sql}`;
  if (req.query.type === 'withdrawal' || req.query.type === 'deposit') sql += ` AND m.type = '${req.query.type}'`;
  const rows = db.prepare(sql + ' ORDER BY m.created_at DESC, m.id DESC').all(...w.params).filter(m => inTurno(db, sc, m.created_at));
  // Origen del movimiento: gasto, anticipo, préstamo, propinas o manual
  const expBy = Object.fromEntries(db.prepare('SELECT cash_movement_id AS m, number, description FROM expenses WHERE cash_movement_id IS NOT NULL').all().map(r => [r.m, r]));
  const advBy = Object.fromEntries(db.prepare('SELECT a.cash_movement_id AS m, e.name FROM advances a LEFT JOIN employees e ON e.id = a.employee_id WHERE a.cash_movement_id IS NOT NULL').all().map(r => [r.m, r]));
  const loanBy = Object.fromEntries(db.prepare('SELECT l.cash_movement_id AS m, e.name FROM employee_loans l LEFT JOIN employees e ON e.id = l.employee_id WHERE l.cash_movement_id IS NOT NULL').all().map(r => [r.m, r]));
  const tipBy = Object.fromEntries(db.prepare('SELECT p.cash_movement_id AS m, e.name FROM tip_payouts p LEFT JOIN employees e ON e.id = p.employee_id WHERE p.cash_movement_id IS NOT NULL').all().map(r => [r.m, r]));
  const list = rows.map(m => ({ id: m.id, date: m.created_at, shiftId: m.shift_id, type: m.type, typeLabel: m.type === 'withdrawal' ? 'Egreso' : 'Ingreso', amount: m.amount, reason: m.reason, user: m.cashier_name || m.shiftCashier || '', caja: 'Principal',
    origin: expBy[m.id] ? `Gasto N.º ${String(expBy[m.id].number || '').padStart(6, '0')}` : advBy[m.id] ? `Anticipo a ${advBy[m.id].name}` : loanBy[m.id] ? `Préstamo a ${loanBy[m.id].name}` : tipBy[m.id] ? `Propinas a ${tipBy[m.id].name}` : 'Manual' }));
  const deposits = list.filter(m => m.type === 'deposit').reduce((a, m) => a + m.amount, 0), withdrawals = list.filter(m => m.type === 'withdrawal').reduce((a, m) => a + m.amount, 0);
  res.json({ scope: sc, movements: list, deposits, withdrawals, count: list.length, net: deposits - withdrawals });
});

/* ---------------- Arqueos (turnos de caja) y conciliación ---------------- */
const SHIFT_SELECT = `SELECT id, cashier_name AS cashierName, opened_at AS openedAt, closed_at AS closedAt, status, initial_cash AS initialCash, expected_cash AS expectedCash, actual_cash AS actualCash, difference,
  total_sales AS totalSales, COALESCE(total_tips, 0) AS totalTips, total_orders AS totalOrders, counted_detail AS countedDetail, expected_detail AS expectedDetail, notes,
  reconciled_at AS reconciledAt, reconciled_by AS reconciledBy, reconciled_amount AS reconciledAmount, reconcile_reason AS reconcileReason, reconcile_comment AS reconcileComment FROM cash_shifts`;
function mapShift(r) {
  const countedDetail = r.countedDetail ? JSON.parse(r.countedDetail) : null, expectedDetail = r.expectedDetail ? JSON.parse(r.expectedDetail) : null;
  const sum = o => (o ? ['cash', 'transfer', 'card'].reduce((a, k) => a + (Number(o[k]) || 0), 0) : null);
  const system = expectedDetail ? sum(expectedDetail) : (r.expectedCash ?? null);
  const user = countedDetail ? sum(countedDetail) : (r.actualCash ?? null);
  return { ...r, countedDetail, expectedDetail, systemTotal: system, userTotal: user, diff: r.status === 'closed' && system !== null && user !== null ? user - system : null,
    reconciled: Boolean(r.reconciledAt), reconcileDiff: r.reconciledAt && system !== null ? (r.reconciledAmount || 0) - system : null };
}
router.get('/shifts', (req, res) => {
  const db = getDb();
  const sbw = branchWhere('', req.query);
  let sql = `${SHIFT_SELECT} WHERE 1=1${sbw.sql}`;
  const params = [...sbw.params];
  if (req.query.status === 'open' || req.query.status === 'closed') { sql += ' AND status = ?'; params.push(req.query.status); }
  if (req.query.reconciled === 'yes') sql += ' AND reconciled_at IS NOT NULL';
  else if (req.query.reconciled === 'no') sql += " AND reconciled_at IS NULL AND status = 'closed'";
  if (req.query.closedBy) { sql += ' AND cashier_name = ?'; params.push(String(req.query.closedBy)); }
  if (isDate(req.query.from) && isDate(req.query.to)) { sql += ' AND date(opened_at) BETWEEN ? AND ?'; params.push(req.query.from, req.query.to); }
  sql += ' ORDER BY opened_at DESC, id DESC LIMIT ' + Math.min(500, Math.max(10, Number(req.query.limit) || 60));
  res.json(db.prepare(sql).all(...params).map(mapShift));
});
router.post('/shifts/:id/reconcile', (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'La conciliación la hace un administrador' });
  const db = getDb();
  const s = db.prepare(`${SHIFT_SELECT} WHERE id = ?`).get(Number(req.params.id));
  if (!s) return res.status(404).json({ error: 'Arqueo no encontrado' });
  if (s.status !== 'closed') return res.status(400).json({ error: 'Solo se concilian cajas cerradas' });
  const amount = Math.round(Number(req.body.amount));
  if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: 'Indica el monto conciliado' });
  const m = mapShift(s);
  const reason = String(req.body.reason || '').trim().slice(0, 120);
  if (m.systemTotal !== null && amount !== m.systemTotal && !reason) return res.status(400).json({ error: 'Hay diferencia con el sistema: escribe el motivo' });
  db.prepare('UPDATE cash_shifts SET reconciled_at = ?, reconciled_by = ?, reconciled_amount = ?, reconcile_reason = ?, reconcile_comment = ? WHERE id = ?')
    .run(now(db), req.user?.name || '', amount, reason || null, String(req.body.comment || '').trim().slice(0, 300) || null, s.id);
  res.json(mapShift(db.prepare(`${SHIFT_SELECT} WHERE id = ?`).get(s.id)));
});
router.delete('/shifts/:id/reconcile', (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Solo un administrador' });
  const db = getDb();
  db.prepare('UPDATE cash_shifts SET reconciled_at = NULL, reconciled_by = NULL, reconciled_amount = NULL, reconcile_reason = NULL, reconcile_comment = NULL WHERE id = ?').run(Number(req.params.id));
  res.json({ success: true });
});

module.exports = router;
module.exports.canEditSale = canEditSale;
void hasAction;
