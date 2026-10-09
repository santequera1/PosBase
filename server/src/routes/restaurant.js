/**
 * Módulo Restaurante: salones y mesas, cuentas abiertas (mesa, para llevar, domicilio), comandas a cocina,
 * cobro con propina y descuento, repartidores y reportes por tipo de venta, mesero y repartidor.
 */
const { Router } = require('express');
const { getDb } = require('../db');
const { requireRole, requirePerm, hasAction } = require('../auth');
const { formatOrder } = require('../orderFormat');
const { applySaleStock, restoreOrderStock, recordMovement, syncAvailability, getProduct, emitProduct } = require('../stock');
const { getOpenShift, now, today, isDate } = require('../cashHelpers');
const { branchWhere, currentBranch } = require('../branches');
const { readRestaurantConfig, saveRestaurantConfig, staffLists, CHANNELS, STATIONS } = require('../restaurantSchema');
const D = require('../discounts');

const L = require('../ledger');

const router = Router();
router.use(L.syncOnWrite(getDb));
const ADMIN = requireRole('admin');
const TYPES = ['dine-in', 'pickup', 'delivery'];
const ACTIVE = ['open', 'pending', 'preparing', 'ready', 'shipped', 'billing'];
const ACTIVE_SQL = ACTIVE.map(s => `'${s}'`).join(',');
const CHANNEL_IDS = CHANNELS.map(c => c.id);

const emit = (req, event, payload) => { if (req.app.io) req.app.io.emit(event, payload); };
const getOrder = (db, id) => db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(id));
const fmt = (db, id) => formatOrder(db, getOrder(db, id));
// La cuenta principal de la mesa (las cuentas separadas que se están cobrando no cuentan)
const activeOrderForTable = (db, tableId) => db.prepare(`SELECT * FROM orders WHERE table_id = ? AND split_from IS NULL AND status IN (${ACTIVE_SQL}) ORDER BY id DESC LIMIT 1`).get(tableId);

function recomputeTotals(db, orderId) {
  const o = getOrder(db, orderId);
  const subtotal = db.prepare('SELECT COALESCE(SUM(quantity * price), 0) AS s FROM order_items WHERE order_id = ?').get(orderId).s;
  const total = Math.max(0, subtotal + (o.delivery_fee || 0) - (o.discount || 0));
  db.prepare('UPDATE orders SET subtotal = ?, total = ? WHERE id = ?').run(subtotal, total, orderId);
}

/**
 * Consumo del empleado por una venta cobrada con descuento de nómina: un "préstamo" de tipo consumo atado a la venta,
 * que se descuenta en las próximas liquidaciones. Si la venta deja de ser por nómina, el consumo sin cuotas se elimina.
 */
function syncPayrollConsumo(db, orderId, emp, installments, userName) {
  require('../payrollExtras').ensureConsumoCols(db);
  const cur = db.prepare("SELECT * FROM employee_loans WHERE order_id = ? AND kind = 'consumo'").get(orderId);
  const paid = cur ? db.prepare('SELECT COUNT(*) AS c FROM loan_payments WHERE loan_id = ?').get(cur.id).c : 0;
  if (cur && !paid) db.prepare('DELETE FROM employee_loans WHERE id = ?').run(cur.id);
  if (!emp || (cur && paid)) return;
  const o = db.prepare('SELECT total, created_at FROM orders WHERE id = ?').get(orderId);
  const amount = o.total || 0;
  if (amount <= 0) return;
  db.prepare(`INSERT INTO employee_loans (employee_id, date, amount, installments, installment_amount, from_cash_register, notes, created_by, kind, order_id)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'consumo', ?)`).run(emp.id, today(db), amount, installments, Math.ceil(amount / installments), `Consumo venta #${orderId}`, userName || '', orderId);
}

/** Envía a cocina los ítems que aún no tienen comanda. Devuelve el número de comanda o null si no había nada nuevo. */
function sendUnsent(db, io, order, userName, out = {}) {
  const unsent = db.prepare('SELECT * FROM order_items WHERE order_id = ? AND batch IS NULL').all(order.id);
  if (!unsent.length) return null;
  const batch = (db.prepare('SELECT COALESCE(MAX(batch), 0) AS b FROM order_items WHERE order_id = ?').get(order.id).b || 0) + 1;
  const ts = now(db);
  const upd = db.prepare('UPDATE order_items SET batch = ?, sent_at = ?, kitchen_status = ? WHERE id = ?');
  for (const it of unsent) {
    const station = db.prepare('SELECT COALESCE(station, \'cocina\') AS s FROM products WHERE id = ?').get(it.product_id);
    const skip = station && station.s === 'none';
    upd.run(batch, ts, skip ? 'ready' : 'pending', it.id);
  }
  applySaleStock(db, io, order.id, unsent.map(i => ({ productId: i.product_id, quantity: i.quantity })), userName);
  if (order.status === 'open' && order.type !== 'dine-in') db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('pending', order.id);
  out.printed = require('../printing').autoKitchen(db, order.id, batch, userName);
  return batch;
}

function upsertCustomer(db, c, save) {
  const phone = String(c.phone || '').trim();
  const doc = String(c.doc || '').trim() || '222222222222';
  if (!save) return null;
  if (phone.length < 7 && doc === '222222222222') return null;
  const name = String(c.name || '').trim() || 'Cliente';
  const existing = db.prepare("SELECT id FROM customers WHERE (phone = ? AND ? != '') OR (document_id = ? AND ? != '222222222222') LIMIT 1").get(phone, phone, doc, doc);
  const addr = String(c.address || '').trim(), addr2 = String(c.address2 || '').trim(), hood = String(c.neighborhood || '').trim();
  if (existing) {
    db.prepare(`UPDATE customers SET name = ?, phone = CASE WHEN ? != '' THEN ? ELSE phone END,
      address = CASE WHEN ? != '' THEN ? ELSE address END, address2 = CASE WHEN ? != '' THEN ? ELSE COALESCE(address2, '') END,
      neighborhood = CASE WHEN ? != '' THEN ? ELSE COALESCE(neighborhood, '') END WHERE id = ?`)
      .run(name, phone, phone, addr, addr, addr2, addr2, hood, hood, existing.id);
    return existing.id;
  }
  const r = db.prepare('INSERT INTO customers (name, document_id, email, phone, address, address2, neighborhood, notes, is_company) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)')
    .run(name, doc, String(c.email || '').trim(), phone, addr, addr2, hood, 'Creado desde domicilios / para llevar');
  return Number(r.lastInsertRowid);
}

function employee(db, id) {
  if (!id) return null;
  return db.prepare('SELECT id, name, position FROM employees WHERE id = ?').get(Number(id)) || null;
}

/* =================== Configuración =================== */
router.get('/config', (req, res) => {
  const db = getDb();
  res.json({ ...readRestaurantConfig(db), channels: CHANNELS, stations: STATIONS, staff: staffLists(db), discounts: D.listDiscounts(db, { onlyActive: true }) });
});
router.put('/config', ADMIN, (req, res) => {
  try { const db = getDb(); res.json({ ...saveRestaurantConfig(db, req.body || {}), channels: CHANNELS, stations: STATIONS, staff: staffLists(db), discounts: D.listDiscounts(db, { onlyActive: true }) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

/* =================== Salones y mesas =================== */
function roomsWithTables(db) {
  const rooms = db.prepare('SELECT id, name, sort_order AS sortOrder FROM rooms WHERE active = 1 AND COALESCE(branch_id, 1) = ? ORDER BY sort_order, id').all(currentBranch());
  const tables = db.prepare('SELECT id, room_id AS roomId, label, shape, seats, x, y, w, h, sort_order AS sortOrder FROM tables WHERE active = 1 ORDER BY sort_order, id').all();
  return rooms.map(r => ({ ...r, tables: tables.filter(t => t.roomId === r.id) }));
}
function tablesState(db) {
  const rooms = roomsWithTables(db);
  const active = db.prepare(`SELECT id, table_id, status, people, waiter_name, total, tip, created_at, sale_label, customer_name, notes FROM orders WHERE table_id IS NOT NULL AND split_from IS NULL AND status IN (${ACTIVE_SQL})`).all();
  const counts = db.prepare(`SELECT order_id, SUM(CASE WHEN batch IS NULL THEN 1 ELSE 0 END) AS unsent, COUNT(*) AS items FROM order_items GROUP BY order_id`).all();
  const countMap = Object.fromEntries(counts.map(c => [c.order_id, c]));
  const lineRows = active.length ? db.prepare(`SELECT order_id, name, quantity, batch FROM order_items WHERE order_id IN (${active.map(() => '?').join(',')}) ORDER BY id`).all(...active.map(a => a.id)) : [];
  for (const r of rooms) {
    for (const t of r.tables) {
      const o = active.find(a => a.table_id === t.id);
      t.order = o ? { id: o.id, status: o.status, people: o.people || 0, waiterName: o.waiter_name || '', total: o.total || 0, since: o.created_at, items: countMap[o.id]?.items || 0, unsent: countMap[o.id]?.unsent || 0, label: o.sale_label || o.customer_name, notes: o.notes || '', lines: lineRows.filter(l => l.order_id === o.id).map(l => ({ name: l.name, qty: l.quantity, sent: l.batch !== null })) } : null;
      t.state = !o ? 'free' : o.status === 'billing' ? 'billing' : 'occupied';
    }
  }
  return rooms;
}
router.get('/rooms', (req, res) => res.json(roomsWithTables(getDb())));
router.get('/tables/state', (req, res) => res.json(tablesState(getDb())));

router.post('/rooms', ADMIN, (req, res) => {
  const db = getDb();
  const name = String(req.body.name || '').trim();
  if (name.length < 2) return res.status(400).json({ error: 'El nombre del salón es requerido' });
  const max = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM rooms').get().m;
  const info = db.prepare('INSERT INTO rooms (name, sort_order, branch_id) VALUES (?, ?, ?)').run(name, max + 1, currentBranch());
  res.status(201).json(roomsWithTables(db).find(r => r.id === Number(info.lastInsertRowid)));
});
router.put('/rooms/:id', ADMIN, (req, res) => {
  const db = getDb();
  const name = String(req.body.name || '').trim();
  if (name.length < 2) return res.status(400).json({ error: 'El nombre del salón es requerido' });
  db.prepare('UPDATE rooms SET name = ? WHERE id = ?').run(name, Number(req.params.id));
  res.json(roomsWithTables(db).find(r => r.id === Number(req.params.id)) || {});
});
router.delete('/rooms/:id', ADMIN, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const busy = db.prepare(`SELECT COUNT(*) AS c FROM orders o JOIN tables t ON t.id = o.table_id WHERE t.room_id = ? AND o.status IN (${ACTIVE_SQL})`).get(id).c;
  if (busy) return res.status(409).json({ error: 'Hay mesas con cuentas abiertas en este salón' });
  if (db.prepare('SELECT COUNT(*) AS c FROM rooms WHERE active = 1 AND COALESCE(branch_id, 1) = ?').get(currentBranch()).c <= 1) return res.status(400).json({ error: 'Debe quedar al menos un salón' });
  db.prepare('UPDATE tables SET active = 0 WHERE room_id = ?').run(id);
  db.prepare('UPDATE rooms SET active = 0 WHERE id = ?').run(id);
  res.json({ ok: true });
});

const tablePayload = (body, cur = {}) => ({
  roomId: body.roomId !== undefined ? Number(body.roomId) : cur.room_id,
  label: body.label !== undefined ? String(body.label).trim().slice(0, 12) : cur.label,
  shape: ['square', 'round', 'rect'].includes(body.shape) ? body.shape : (cur.shape || 'square'),
  seats: body.seats !== undefined ? Math.max(1, Math.min(30, Math.round(Number(body.seats) || 4))) : (cur.seats || 4),
  x: body.x !== undefined ? Math.max(0, Math.min(95, Number(body.x) || 0)) : (cur.x ?? 10),
  y: body.y !== undefined ? Math.max(0, Math.min(95, Number(body.y) || 0)) : (cur.y ?? 10),
  w: body.w !== undefined ? Math.max(6, Math.min(40, Number(body.w) || 12)) : (cur.w ?? 12),
  h: body.h !== undefined ? Math.max(6, Math.min(40, Number(body.h) || 14)) : (cur.h ?? 14),
});
router.post('/tables', ADMIN, (req, res) => {
  const db = getDb();
  const p = tablePayload(req.body);
  if (!p.roomId || !db.prepare('SELECT id FROM rooms WHERE id = ? AND active = 1').get(p.roomId)) return res.status(400).json({ error: 'Salón no encontrado' });
  if (!p.label) return res.status(400).json({ error: 'La mesa necesita un nombre o número' });
  if (db.prepare('SELECT id FROM tables WHERE active = 1 AND room_id = ? AND LOWER(label) = LOWER(?)').get(p.roomId, p.label)) return res.status(409).json({ error: 'Ya existe una mesa con ese nombre en el salón' });
  const max = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM tables WHERE room_id = ?').get(p.roomId).m;
  const info = db.prepare('INSERT INTO tables (room_id, label, shape, seats, x, y, w, h, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(p.roomId, p.label, p.shape, p.seats, p.x, p.y, p.w, p.h, max + 1);
  res.status(201).json(db.prepare('SELECT id, room_id AS roomId, label, shape, seats, x, y, w, h FROM tables WHERE id = ?').get(info.lastInsertRowid));
});
router.put('/tables/layout', ADMIN, (req, res) => {
  const db = getDb();
  const list = Array.isArray(req.body.tables) ? req.body.tables : [];
  const upd = db.prepare('UPDATE tables SET x = ?, y = ?, w = ?, h = ? WHERE id = ?');
  const tx = db.transaction(items => { for (const t of items) { const p = tablePayload(t, db.prepare('SELECT * FROM tables WHERE id = ?').get(Number(t.id)) || {}); upd.run(p.x, p.y, p.w, p.h, Number(t.id)); } });
  tx(list);
  res.json(roomsWithTables(db));
});
router.put('/tables/:id', ADMIN, (req, res) => {
  const db = getDb();
  const cur = db.prepare('SELECT * FROM tables WHERE id = ?').get(Number(req.params.id));
  if (!cur) return res.status(404).json({ error: 'Mesa no encontrada' });
  const p = tablePayload(req.body, cur);
  if (!p.label) return res.status(400).json({ error: 'La mesa necesita un nombre o número' });
  const dup = db.prepare('SELECT id FROM tables WHERE active = 1 AND room_id = ? AND LOWER(label) = LOWER(?) AND id != ?').get(p.roomId, p.label, cur.id);
  if (dup) return res.status(409).json({ error: 'Ya existe una mesa con ese nombre en el salón' });
  db.prepare('UPDATE tables SET room_id = ?, label = ?, shape = ?, seats = ?, x = ?, y = ?, w = ?, h = ? WHERE id = ?').run(p.roomId, p.label, p.shape, p.seats, p.x, p.y, p.w, p.h, cur.id);
  db.prepare('UPDATE orders SET table_label = ? WHERE table_id = ? AND status IN (' + ACTIVE_SQL + ')').run(p.label, cur.id);
  res.json(db.prepare('SELECT id, room_id AS roomId, label, shape, seats, x, y, w, h FROM tables WHERE id = ?').get(cur.id));
});
router.delete('/tables/:id', ADMIN, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  if (activeOrderForTable(db, id)) return res.status(409).json({ error: 'La mesa tiene una cuenta abierta' });
  db.prepare('UPDATE tables SET active = 0 WHERE id = ?').run(id);
  res.json({ ok: true });
});

/* =================== Cuentas abiertas =================== */
// Abre una cuenta (mesa, para llevar o domicilio) sin productos todavía
router.post('/orders', (req, res) => {
  const db = getDb();
  const b = req.body || {};
  const cfg = readRestaurantConfig(db);
  const type = TYPES.includes(b.type) ? b.type : 'pickup';
  const shift = getOpenShift(db);
  if (cfg.requireOpenShift && !shift) return res.status(400).json({ error: 'Abre la caja antes de registrar ventas' });

  let table = null;
  if (type === 'dine-in') {
    table = db.prepare('SELECT * FROM tables WHERE id = ? AND active = 1').get(Number(b.tableId));
    if (!table) return res.status(400).json({ error: 'Selecciona una mesa' });
    if (activeOrderForTable(db, table.id)) return res.status(409).json({ error: `La mesa ${table.label} ya tiene una cuenta abierta` });
  }
  const c = b.customer || {};
  const custName = String(c.name || '').trim() || (type === 'dine-in' ? 'Consumidor Final' : (String(b.label || '').trim() || 'Consumidor Final'));
  if (type === 'delivery' && !String(c.address || '').trim()) return res.status(400).json({ error: 'El domicilio necesita una dirección' });
  const customerId = upsertCustomer(db, { ...c, name: custName }, c.saveCustomer !== false && type !== 'dine-in');
  const waiter = employee(db, b.waiterId);
  const driver = employee(db, b.driverId);
  const channel = CHANNEL_IDS.includes(b.channel) ? b.channel : 'local';
  const deliveryFee = type === 'delivery' ? Math.max(0, Math.round(Number(b.deliveryFee ?? cfg.deliveryFee) || 0)) : 0;
  const people = type === 'dine-in' ? Math.max(1, Math.round(Number(b.people) || 1)) : 0;
  const paymentMethod = ['cash', 'card_debit', 'card_credit', 'card', 'transfer', 'platform', 'credit', 'mixed'].includes(b.paymentMethod) ? b.paymentMethod : 'cash';

  const info = db.prepare(`
    INSERT INTO orders (type, status, customer_name, customer_doc, customer_email, customer_phone, customer_address, customer_address2, customer_neighborhood, customer_id,
      is_electronic_invoice, table_id, table_label, table_number, people, waiter_id, waiter_name, driver_id, driver_name, channel, sale_label,
      subtotal, delivery_fee, discount, total, payment_method, payment_status, notes, shift_id, cashier_name, user_id, estimated_minutes)
    VALUES (?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?, 'pending', ?, ?, ?, ?, ?)
  `).run(
    type, custName, String(c.doc || '').trim() || '222222222222', String(c.email || '').trim(), String(c.phone || '').trim(), String(c.address || '').trim(),
    String(c.address2 || '').trim(), String(c.neighborhood || '').trim(), customerId,
    table ? table.id : null, table ? table.label : null, table ? (parseInt(table.label, 10) || null) : null, people,
    waiter ? waiter.id : null, waiter ? waiter.name : null, driver ? driver.id : null, driver ? driver.name : null, channel, String(b.label || '').trim() || null,
    deliveryFee, deliveryFee, paymentMethod, String(b.notes || '').trim(), shift ? shift.id : null, req.user?.name || null, req.user?.id || null,
    b.estimatedMinutes ? Math.round(Number(b.estimatedMinutes)) : null,
  );
  db.prepare('UPDATE orders SET created_by = COALESCE(created_by, ?), branch_id = ? WHERE id = ?').run(req.user?.name || null, currentBranch(), info.lastInsertRowid);
  const formatted = fmt(db, info.lastInsertRowid);
  emit(req, 'order:new', formatted);
  res.status(201).json(formatted);
});

// Pedidos activos (tablero para llevar / domicilios / mesas)
router.get('/orders/active', (req, res) => {
  const db = getDb();
  const type = TYPES.includes(req.query.type) ? req.query.type : null;
  const bw = branchWhere('', req.query);
  let sql = `SELECT * FROM orders WHERE status IN (${ACTIVE_SQL})${bw.sql}`;
  const params = [...bw.params];
  if (type) { sql += ' AND type = ?'; params.push(type); }
  sql += ' ORDER BY created_at';
  res.json(db.prepare(sql).all(...params).map(o => formatOrder(db, o)));
});

// Reemplaza los productos que aún no se han enviado a cocina (los enviados no se tocan)
router.put('/orders/:id/items', (req, res) => {
  const db = getDb();
  const order = getOrder(db, req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (!ACTIVE.includes(order.status)) return res.status(400).json({ error: 'El pedido ya está cerrado' });
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM order_items WHERE order_id = ? AND batch IS NULL').run(order.id);
    const ins = db.prepare('INSERT INTO order_items (order_id, product_id, name, size, flavors, quantity, price, notes, seat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const it of items) {
      const qty = Math.max(1, Math.round(Number(it.quantity) || 1));
      const seat = Math.round(Number(it.seat) || 0);
      ins.run(order.id, Number(it.productId) || 0, String(it.name || 'Producto').slice(0, 120), it.size || null, it.flavors || null, qty, Math.max(0, Math.round(Number(it.price) || 0)), String(it.notes || '').slice(0, 200), seat > 0 && seat <= 50 ? seat : null);
    }
    recomputeTotals(db, order.id);
  });
  tx();
  const formatted = fmt(db, order.id);
  emit(req, 'order:updated', formatted);
  res.json(formatted);
});

// Ajusta un ítem ya enviado (cantidad o retiro) — solo admin, y devuelve stock si baja la cantidad
router.delete('/orders/:id/items/:itemId', (req, res) => {
  const db = getDb();
  if (req.user?.role !== 'admin' && !hasAction(req.user, 'cancel_orders')) return res.status(403).json({ error: 'No tienes permiso para cancelar productos ya enviados. Pídele a un administrador.' });
  const order = getOrder(db, req.params.id);
  const item = db.prepare('SELECT * FROM order_items WHERE id = ? AND order_id = ?').get(Number(req.params.itemId), Number(req.params.id));
  if (!order || !item) return res.status(404).json({ error: 'Ítem no encontrado' });
  if (!ACTIVE.includes(order.status)) return res.status(400).json({ error: 'El pedido ya está cerrado' });
  // Cantidad a cancelar: toda la línea o solo algunas unidades (ej. de 2 Coca-Cola dejar 1)
  const cancelQty = Math.min(item.quantity, Math.max(1, Math.round(Number(req.query.quantity || req.body?.quantity) || item.quantity)));
  db.prepare('INSERT INTO order_item_cancellations (order_id, product_id, name, quantity, price, was_sent, reason, cancelled_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(order.id, item.product_id, item.name, cancelQty, item.price, item.batch ? 1 : 0, String(req.query.reason || req.body?.reason || '').slice(0, 120) || null, req.user?.name || '');
  if (item.batch) {
    // Devuelve al inventario lo que ya se había descontado por la comanda (movimiento de venta en positivo para que la anulación cuadre)
    const cur = db.prepare('SELECT COALESCE(track_stock, 0) AS ts, COALESCE(stock, 0) AS stock FROM products WHERE id = ?').get(item.product_id);
    if (cur && cur.ts) {
      const newStock = cur.stock + cancelQty;
      db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(newStock, item.product_id);
      syncAvailability(db, item.product_id, cur.stock, newStock);
      recordMovement(db, item.product_id, cancelQty, newStock, 'venta', order.id, req.user?.name);
      emitProduct(req.app.io, getProduct(db, item.product_id));
    }
    // Ingredientes de la receta: vuelven al inventario
    try {
      const INV = require('../inventory');
      for (const r of db.prepare('SELECT r.ingredient_id AS id, r.quantity, i.waste_pct AS w FROM recipe_items r JOIN ingredients i ON i.id = r.ingredient_id WHERE r.product_id = ?').all(item.product_id))
        INV.move(db, r.id, r.quantity * cancelQty * (1 + (r.w || 0) / 100), 'ajuste', { orderId: order.id, notes: `Producto cancelado: ${item.name}`, user: req.user?.name });
    } catch (e) { console.warn('Ingredientes del producto cancelado:', e.message); }
  }
  // Si ya estaba en cocina, sale un ticket de cancelación para que no lo preparen
  if (item.batch) { try { require('../printing').enqueueCancel(db, order.id, [{ ...item, quantity: cancelQty }], { reason: String(req.query.reason || req.body?.reason || ''), user: req.user?.name }); } catch (e) { console.warn('Ticket de cancelación:', e.message); } }
  if (cancelQty < item.quantity) db.prepare('UPDATE order_items SET quantity = quantity - ? WHERE id = ?').run(cancelQty, item.id);
  else db.prepare('DELETE FROM order_items WHERE id = ?').run(item.id);
  recomputeTotals(db, order.id);
  const formatted = fmt(db, order.id);
  emit(req, 'order:updated', formatted);
  res.json(formatted);
});

// Manda a cocina solo lo nuevo
router.post('/orders/:id/send', (req, res) => {
  const db = getDb();
  const order = getOrder(db, req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (!ACTIVE.includes(order.status)) return res.status(400).json({ error: 'El pedido ya está cerrado' });
  const out = {};
  const batch = sendUnsent(db, req.app.io, order, req.user?.name, out);
  const formatted = fmt(db, order.id);
  emit(req, batch ? 'order:updated' : 'order:updated', formatted);
  if (batch) emit(req, 'kitchen:new', { orderId: order.id, batch });
  res.json({ order: formatted, batch, items: batch ? formatted.items.filter(i => i.batch === batch) : [], printed: out.printed || 0 });
});

// Datos de cabecera: personas, mesero, cliente, etiqueta, canal, comentario, repartidor, tiempo, envío
router.patch('/orders/:id', (req, res) => {
  const db = getDb();
  const order = getOrder(db, req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
  const b = req.body || {};
  const sets = [], vals = [];
  const set = (col, v) => { sets.push(`${col} = ?`); vals.push(v); };
  if (b.people !== undefined) set('people', Math.max(0, Math.round(Number(b.people) || 0)));
  if (b.waiterId !== undefined) { const w = employee(db, b.waiterId); set('waiter_id', w ? w.id : null); set('waiter_name', w ? w.name : null); }
  if (b.driverId !== undefined) { const d = employee(db, b.driverId); set('driver_id', d ? d.id : null); set('driver_name', d ? d.name : null); }
  if (b.label !== undefined) set('sale_label', String(b.label).trim() || null);
  if (b.channel !== undefined && CHANNEL_IDS.includes(b.channel)) set('channel', b.channel);
  if (b.notes !== undefined) set('notes', String(b.notes).trim());
  if (b.estimatedMinutes !== undefined) set('estimated_minutes', b.estimatedMinutes ? Math.round(Number(b.estimatedMinutes)) : null);
  if (b.deliveryFee !== undefined && order.type === 'delivery') set('delivery_fee', Math.max(0, Math.round(Number(b.deliveryFee) || 0)));
  if (b.paymentMethod !== undefined && ['cash', 'card_debit', 'card_credit', 'card', 'transfer', 'platform', 'credit', 'mixed'].includes(b.paymentMethod) && order.payment_status !== 'paid') set('payment_method', b.paymentMethod);
  if (b.customer && typeof b.customer === 'object') {
    const c = b.customer;
    if (c.name !== undefined) set('customer_name', String(c.name).trim() || 'Consumidor Final');
    if (c.phone !== undefined) set('customer_phone', String(c.phone).trim());
    if (c.doc !== undefined) set('customer_doc', String(c.doc).trim() || '222222222222');
    if (c.email !== undefined) set('customer_email', String(c.email).trim());
    if (c.address !== undefined) set('customer_address', String(c.address).trim());
    if (c.address2 !== undefined) set('customer_address2', String(c.address2).trim());
    if (c.neighborhood !== undefined) set('customer_neighborhood', String(c.neighborhood).trim());
    if (c.isElectronicInvoice !== undefined) set('is_electronic_invoice', c.isElectronicInvoice ? 1 : 0);
    if (c.saveCustomer) { const id = upsertCustomer(db, { ...c, name: c.name || order.customer_name, phone: c.phone ?? order.customer_phone, address: c.address ?? order.customer_address, address2: c.address2 ?? order.customer_address2, neighborhood: c.neighborhood ?? order.customer_neighborhood }, true); if (id) set('customer_id', id); }
  }
  if (sets.length) { vals.push(order.id); db.prepare(`UPDATE orders SET ${sets.join(', ')} WHERE id = ?`).run(...vals); }
  if (b.deliveryFee !== undefined) recomputeTotals(db, order.id);
  const formatted = fmt(db, order.id);
  emit(req, 'order:updated', formatted);
  res.json(formatted);
});

/* ---------- Mis domicilios: lo que ve el repartidor en su celular ---------- */
const courierEmployee = (db, userId) => db.prepare('SELECT id, name, phone FROM employees WHERE user_id = ? AND COALESCE(active, 1) = 1 ORDER BY id LIMIT 1').get(userId);
router.get('/my-deliveries', requirePerm('courier'), (req, res) => {
  const db = getDb();
  const emp = courierEmployee(db, req.user.id);
  if (!emp) return res.json({ linked: false, courier: null, active: [], delivered: [], cashToCollect: 0, cashCollected: 0 });
  const t = today(db);
  const active = db.prepare(`SELECT id FROM orders WHERE type = 'delivery' AND driver_id = ? AND status IN (${ACTIVE_SQL}) ORDER BY created_at`).all(emp.id).map(r => fmt(db, r.id));
  const delivered = db.prepare("SELECT id FROM orders WHERE type = 'delivery' AND driver_id = ? AND status = 'delivered' AND date(COALESCE(delivered_at, created_at)) = ? ORDER BY delivered_at DESC").all(emp.id, t).map(r => fmt(db, r.id));
  const due = o => (o.paymentStatus === 'paid' || o.paymentMethod === 'platform' ? 0 : (o.amountDue ?? o.total));
  const collected = db.prepare("SELECT COALESCE(SUM(total + COALESCE(tip, 0)), 0) AS s FROM orders WHERE type = 'delivery' AND driver_id = ? AND status = 'delivered' AND payment_method = 'cash' AND date(COALESCE(delivered_at, created_at)) = ?").get(emp.id, t).s;
  res.json({ linked: true, courier: emp, active, delivered, cashToCollect: active.reduce((a, o) => a + due(o), 0), cashCollected: collected });
});
// El repartidor marca "voy en camino" o "entregado"; al entregar un pedido que se paga contra entrega, queda cobrado con el medio que indique
router.post('/my-deliveries/:id/:action', requirePerm('courier'), (req, res) => {
  const db = getDb();
  const order = getOrder(db, req.params.id);
  if (!order || order.type !== 'delivery') return res.status(404).json({ error: 'Pedido no encontrado' });
  const emp = courierEmployee(db, req.user.id);
  if (req.user.role !== 'admin' && (!emp || order.driver_id !== emp.id)) return res.status(403).json({ error: 'Este pedido no está asignado a ti' });
  if (order.status === 'cancelled') return res.status(400).json({ error: 'El pedido fue anulado' });
  if (order.status === 'delivered') return res.status(400).json({ error: 'El pedido ya fue entregado' });
  const ts = now(db);
  if (req.params.action === 'shipped') {
    sendUnsent(db, req.app.io, order, req.user?.name);
    db.prepare("UPDATE orders SET status = 'shipped', shipped_at = COALESCE(shipped_at, ?) WHERE id = ?").run(ts, order.id);
  } else if (req.params.action === 'delivered') {
    sendUnsent(db, req.app.io, order, req.user?.name);
    if (order.payment_status !== 'paid' && order.payment_method !== 'platform') {
      const method = ['cash', 'transfer', 'card'].includes(req.body.method) ? req.body.method : 'cash';
      const received = Math.max(0, Math.round(Number(req.body.cashReceived) || 0));
      const due = (order.total || 0) + (order.tip || 0);
      db.prepare("UPDATE orders SET payment_status = 'paid', payment_method = ?, payment_split = NULL, cash_received = ?, cash_change = ? WHERE id = ?")
        .run(method, method === 'cash' ? (received || due) : 0, method === 'cash' && received > due ? received - due : 0, order.id);
    }
    db.prepare("UPDATE orders SET status = 'delivered', shipped_at = COALESCE(shipped_at, ?), delivered_at = ?, closed_at = ?, closed_by = ? WHERE id = ?").run(ts, ts, ts, req.user?.name || null, order.id);
  } else return res.status(400).json({ error: 'Acción inválida' });
  const formatted = fmt(db, order.id);
  emit(req, 'order:updated', formatted);
  res.json(formatted);
});

// Cambio de estado con marcas de tiempo (listo, enviado, entregado, pidiendo la cuenta, cancelado)
router.post('/orders/:id/status', (req, res) => {
  const db = getDb();
  const order = getOrder(db, req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
  const status = String(req.body.status || '');
  const allowed = ['open', 'pending', 'preparing', 'ready', 'shipped', 'delivered', 'billing', 'cancelled'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Estado inválido' });
  if (status === 'cancelled' && !hasAction(req.user, 'cancel_orders')) return res.status(403).json({ error: 'No tienes permiso para anular cuentas. Pídele a un administrador.' });
  if (order.status === 'cancelled') return res.status(400).json({ error: 'El pedido está anulado' });
  if (order.status === 'delivered' && status !== 'cancelled') return res.status(400).json({ error: 'El pedido ya está cerrado' });
  if (status === 'shipped' && order.type === 'delivery' && !order.driver_id && !req.body.driverId) return res.status(400).json({ error: 'Asigna un repartidor antes de marcar el pedido como enviado' });
  if (status === 'billing' && order.type !== 'dine-in') return res.status(400).json({ error: 'Solo las mesas pasan a "pidiendo la cuenta"' });
  const ts = now(db);
  const sets = ['status = ?'], vals = [status];
  if (req.body.driverId) { const d = employee(db, req.body.driverId); if (d) { sets.push('driver_id = ?', 'driver_name = ?'); vals.push(d.id, d.name); } }
  if (status === 'ready') { sets.push('ready_at = COALESCE(ready_at, ?)'); vals.push(ts); }
  if (status === 'shipped') { sets.push('shipped_at = ?'); vals.push(ts); }
  if (status === 'delivered') { sets.push('delivered_at = ?', 'closed_at = ?', 'closed_by = ?'); vals.push(ts, ts, req.user?.name || null); }
  if (status === 'cancelled') { sets.push('closed_at = ?', 'closed_by = ?', 'cancel_reason = ?'); vals.push(ts, req.user?.name || null, String(req.body.reason || '').trim().slice(0, 160) || null); }
  // Al marcar listo/enviado/entregado un pedido con productos sin comanda, se envían para que el inventario y la cocina queden al día
  if (['ready', 'shipped', 'delivered'].includes(status)) sendUnsent(db, req.app.io, order, req.user?.name);
  // Cuenta anulada con productos ya en cocina: aviso para que no los preparen
  if (status === 'cancelled' && ACTIVE.includes(order.status)) {
    try { const sent = db.prepare('SELECT * FROM order_items WHERE order_id = ? AND batch IS NOT NULL').all(order.id); if (sent.length) require('../printing').enqueueCancel(db, order.id, sent, { reason: String(req.body.reason || ''), user: req.user?.name, whole: true }); } catch (e) { console.warn('Ticket de anulación:', e.message); }
  }
  if (status === 'cancelled' && order.payment_method === 'payroll') {
    require('../payrollExtras').ensureConsumoCols(db);
    const c = db.prepare("SELECT id FROM employee_loans WHERE order_id = ? AND kind = 'consumo'").get(order.id);
    if (c && db.prepare('SELECT COUNT(*) AS n FROM loan_payments WHERE loan_id = ?').get(c.id).n > 0) return res.status(400).json({ error: 'Este consumo ya se descontó en una liquidación de nómina: no se puede anular la venta' });
    if (c) db.prepare('DELETE FROM employee_loans WHERE id = ?').run(c.id);
  }
  if (status === 'cancelled') restoreOrderStock(db, req.app.io, order.id, req.user?.name);
  // La propina de una venta anulada no se le debe al personal
  if (status === 'cancelled') db.prepare('DELETE FROM tips WHERE notes = ?').run(`Propina pedido #${order.id}`);
  vals.push(order.id);
  db.prepare(`UPDATE orders SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  const formatted = fmt(db, order.id);
  emit(req, 'order:updated', formatted);
  res.json(formatted);
});

// Cobro: medio(s) de pago, descuento con motivo, propina; cierra la cuenta (mesa / para llevar) o registra el pago del domicilio
router.post('/orders/:id/close', (req, res) => {
  const db = getDb();
  const order = getOrder(db, req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (order.status === 'cancelled') return res.status(400).json({ error: 'El pedido está anulado' });
  if (order.payment_status === 'paid' && order.status === 'delivered') return res.status(400).json({ error: 'El pedido ya está cobrado y cerrado' });
  const b = req.body || {};
  const cfg = readRestaurantConfig(db);
  if (cfg.requireOpenShift && !getOpenShift(db)) return res.status(400).json({ error: 'Abre la caja antes de cobrar' });
  const itemsCount = db.prepare('SELECT COUNT(*) AS c FROM order_items WHERE order_id = ?').get(order.id).c;
  if (!itemsCount) return res.status(400).json({ error: 'La cuenta no tiene productos' });

  sendUnsent(db, req.app.io, order, req.user?.name);
  let discount = Math.max(0, Math.round(Number(b.discount ?? order.discount) || 0));
  let discountReason = discount > 0 ? String(b.discountReason || order.discount_reason || '').trim() : null;
  let dk = discount > 0 ? 'manual' : null, dId = null, dName = null, empId = null, empName = null;
  // Se conserva el descuento del catálogo que ya tenía la cuenta si no llega uno nuevo
  if (b.discountId === undefined && b.staffDiscountEmployeeId === undefined && discount > 0 && discount === (order.discount || 0) && order.discount_kind && order.discount_kind !== 'manual') {
    dk = order.discount_kind; dId = order.discount_id; dName = order.discount_name; empId = order.discount_employee_id; empName = order.discount_employee_name;
  }
  // Descuento del catálogo (Empleados, Clientes...): el servidor calcula el valor sobre los productos de la cuenta
  const catId = b.discountId ? Number(b.discountId) : (b.staffDiscountEmployeeId ? D.staffDiscountId(db) : null);
  if (catId) {
    const items = db.prepare('SELECT product_id AS productId, price, quantity FROM order_items WHERE order_id = ?').all(order.id);
    const r = D.computeDiscount(db, catId, items, { value: b.discountValue, employeeId: b.discountEmployeeId || b.staffDiscountEmployeeId });
    if (r.error) return res.status(400).json({ error: r.error });
    discount = r.amount; discountReason = r.reason; dk = r.kind; dId = r.discount.id; dName = r.discount.name; empId = r.employee ? r.employee.id : null; empName = r.employee ? r.employee.name : null;
  }
  if (discount > 0 && discount !== (order.discount || 0) && !hasAction(req.user, 'discounts')) return res.status(403).json({ error: 'No tienes permiso para aplicar descuentos. Pídele a un administrador.' });
  // Venta por descuento de nómina: nunca lleva propina (se valida antes de guardar nada)
  if (b.paymentMethod === 'payroll' && Math.round(Number(b.tip) || 0) > 0) return res.status(400).json({ error: 'Las ventas por descuento de nómina no llevan propina' });
  const tip = b.paymentMethod === 'payroll' ? 0 : Math.max(0, Math.round(Number(b.tip ?? order.tip) || 0));
  db.prepare('UPDATE orders SET discount = ?, discount_reason = ?, tip = ?, tip_to = ?, discount_kind = ?, discount_employee_id = ?, discount_employee_name = ?, discount_id = ?, discount_name = ? WHERE id = ?')
    .run(discount, discount > 0 ? discountReason : null, tip, tip > 0 ? (b.tipTo === 'waiter' ? 'waiter' : 'common') : null,
      discount > 0 ? dk : null, discount > 0 ? empId : null, discount > 0 ? empName : null, discount > 0 ? dId : null, discount > 0 ? dName : null, order.id);
  recomputeTotals(db, order.id);
  const fresh = getOrder(db, order.id);
  const due = fresh.total + tip;

  const method = ['cash', 'card_debit', 'card_credit', 'card', 'transfer', 'platform', 'credit', 'mixed', 'payroll'].includes(b.paymentMethod) ? b.paymentMethod : (fresh.payment_method || 'cash');
  // Descuento de nómina: no entra a la caja; queda como consumo del empleado y se descuenta en su liquidación
  let payrollEmp = null, payrollInstallments = 1;
  if (method === 'payroll') {
    payrollEmp = db.prepare('SELECT id, name FROM employees WHERE id = ? AND active = 1').get(Number(b.payrollEmployeeId));
    if (!payrollEmp) return res.status(400).json({ error: 'Elige el empleado al que se le descuenta de la nómina' });
    payrollInstallments = Math.min(6, Math.max(1, Math.round(Number(b.payrollInstallments) || 1)));
  }
  let split = null;
  if (method === 'mixed') {
    const s = b.paymentSplit || {};
    const a1 = Math.round(Number(s.amount1) || 0), a2 = Math.round(Number(s.amount2) || 0);
    if (!s.method1 || !s.method2 || a1 + a2 !== due) return res.status(400).json({ error: `La suma de los dos medios de pago debe ser ${due}` });
    split = { method1: s.method1, amount1: a1, method2: s.method2, amount2: a2 };
  }
  const paymentStatus = method === 'credit' ? 'pending' : 'paid';
  const cashReceived = method === 'cash' ? Math.max(due, Math.round(Number(b.cashReceived) || due)) : (method === 'mixed' ? (split.method1 === 'cash' ? split.amount1 : split.method2 === 'cash' ? split.amount2 : 0) : 0);
  const cashChange = method === 'cash' ? Math.max(0, cashReceived - due) : 0;
  const ts = now(db);
  const closeNow = fresh.type !== 'delivery' || Boolean(b.markDelivered) || fresh.status === 'delivered';
  const sets = ['payment_method = ?', 'payment_split = ?', 'payment_status = ?', 'cash_received = ?', 'cash_change = ?', 'closed_by = ?', 'payroll_employee_id = ?'];
  const vals = [method, split ? JSON.stringify(split) : null, paymentStatus, cashReceived, cashChange, req.user?.name || null, payrollEmp ? payrollEmp.id : null];
  if (closeNow) { sets.push('status = ?', 'delivered_at = COALESCE(delivered_at, ?)', 'closed_at = ?'); vals.push('delivered', ts, ts); }
  vals.push(order.id);
  db.prepare(`UPDATE orders SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  syncPayrollConsumo(db, order.id, payrollEmp, payrollInstallments, req.user?.name);

  // Propina → módulo de personal (directa al mesero o común)
  if (tip > 0) {
    try {
      const shift = getOpenShift(db);
      const tipMethod = method === 'cash' || (split && (split.method1 === 'cash' || split.method2 === 'cash')) ? 'cash' : method === 'transfer' ? 'transfer' : 'card';
      db.prepare('DELETE FROM tips WHERE notes = ?').run(`Propina pedido #${order.id}`);
      db.prepare('INSERT INTO tips (date, employee_id, amount, method, shift_id, notes) VALUES (?, ?, ?, ?, ?, ?)')
        .run(today(db), b.tipTo === 'waiter' && fresh.waiter_id ? fresh.waiter_id : null, tip, tipMethod, shift ? shift.id : null, `Propina pedido #${order.id}`);
    } catch (e) { console.warn('No se pudo registrar la propina:', e.message); }
  }
  const formatted = fmt(db, order.id);
  emit(req, 'order:updated', formatted);
  res.json(formatted);
});

// Cambiar de mesa
router.post('/orders/:id/move', (req, res) => {
  const db = getDb();
  const order = getOrder(db, req.params.id);
  if (!order || order.type !== 'dine-in') return res.status(404).json({ error: 'Cuenta de mesa no encontrada' });
  if (!ACTIVE.includes(order.status)) return res.status(400).json({ error: 'La cuenta ya está cerrada' });
  const table = db.prepare('SELECT * FROM tables WHERE id = ? AND active = 1').get(Number(req.body.tableId));
  if (!table) return res.status(400).json({ error: 'Mesa no encontrada' });
  const busy = activeOrderForTable(db, table.id);
  if (busy && busy.id !== order.id) return res.status(409).json({ error: `La mesa ${table.label} está ocupada` });
  db.prepare('UPDATE orders SET table_id = ?, table_label = ?, table_number = ? WHERE id = ?').run(table.id, table.label, parseInt(table.label, 10) || null, order.id);
  const formatted = fmt(db, order.id);
  emit(req, 'order:updated', formatted);
  res.json(formatted);
});

// Unir esta cuenta a otra mesa (los productos pasan a la cuenta destino)
router.post('/orders/:id/merge', (req, res) => {
  const db = getDb();
  const source = getOrder(db, req.params.id);
  const target = getOrder(db, req.body.intoOrderId);
  if (!source || !target || source.id === target.id) return res.status(404).json({ error: 'Cuenta no encontrada' });
  if (!ACTIVE.includes(source.status) || !ACTIVE.includes(target.status)) return res.status(400).json({ error: 'Ambas cuentas deben estar abiertas' });
  const tx = db.transaction(() => {
    db.prepare('UPDATE order_items SET order_id = ? WHERE order_id = ?').run(target.id, source.id);
    db.prepare("UPDATE stock_movements SET order_id = ? WHERE order_id = ?").run(target.id, source.id);
    db.prepare('UPDATE orders SET people = people + ?, notes = TRIM(notes || ? ) WHERE id = ?').run(source.people || 0, source.notes ? ` · ${source.notes}` : '', target.id);
    db.prepare("UPDATE orders SET status = 'cancelled', subtotal = 0, total = 0, notes = ?, closed_at = ?, closed_by = ? WHERE id = ?").run(`Unida a la cuenta #${target.id}`, now(db), req.user?.name || null, source.id);
    recomputeTotals(db, target.id);
  });
  tx();
  emit(req, 'order:updated', fmt(db, source.id));
  const formatted = fmt(db, target.id);
  emit(req, 'order:updated', formatted);
  res.json(formatted);
});

/**
 * Cuenta separada: pasa los productos elegidos (con cantidad, se puede partir una línea) a una cuenta nueva de la misma
 * mesa para cobrarla aparte con su propio recibo/factura. La cuenta de la mesa sigue abierta con el resto.
 * Body: { items: [{ itemId, quantity }], people? }
 */
router.post('/orders/:id/split', (req, res) => {
  const db = getDb();
  const parent = getOrder(db, req.params.id);
  if (!parent) return res.status(404).json({ error: 'Cuenta no encontrada' });
  if (!ACTIVE.includes(parent.status)) return res.status(400).json({ error: 'La cuenta ya está cerrada' });
  if (parent.split_from) return res.status(400).json({ error: 'Esta ya es una cuenta separada' });
  const wanted = (Array.isArray(req.body.items) ? req.body.items : []).map(i => ({ itemId: Number(i.itemId), quantity: Math.round(Number(i.quantity) || 0) })).filter(i => i.itemId && i.quantity > 0);
  if (!wanted.length) return res.status(400).json({ error: 'Elige los productos de esta cuenta' });
  const rows = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(parent.id);
  const totalQty = rows.reduce((s, r) => s + r.quantity, 0);
  let moving = 0;
  for (const w of wanted) {
    const r = rows.find(x => x.id === w.itemId);
    if (!r) return res.status(400).json({ error: 'Un producto ya no está en la cuenta: recarga la página' });
    if (w.quantity > r.quantity) return res.status(400).json({ error: `"${r.name}": solo hay ${r.quantity}` });
    moving += w.quantity;
  }
  if (moving >= totalQty) return res.status(400).json({ error: 'Para cobrar todo, usa Cobrar en la cuenta de la mesa' });
  let childId;
  const tx = db.transaction(() => {
    const info = db.prepare(`INSERT INTO orders (type, status, customer_name, customer_doc, table_id, table_label, table_number, people, waiter_id, waiter_name, channel, sale_label,
        subtotal, delivery_fee, discount, total, payment_method, payment_status, notes, shift_id, cashier_name, user_id, created_by, branch_id, split_from)
      VALUES (?, ?, 'Consumidor Final', '222222222222', ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 'cash', 'pending', '', ?, ?, ?, ?, ?, ?)`)
      .run(parent.type, parent.status === 'billing' ? 'open' : parent.status, parent.table_id, parent.table_label, parent.table_number, Math.max(0, Math.round(Number(req.body.people) || 1)),
        parent.waiter_id, parent.waiter_name, parent.channel || 'local', `Cuenta separada de #${parent.id}`, parent.shift_id, parent.cashier_name, req.user?.id || null, req.user?.name || null, parent.branch_id || 1, parent.id);
    childId = Number(info.lastInsertRowid);
    const copy = db.prepare('INSERT INTO order_items (order_id, product_id, name, size, flavors, quantity, price, notes, batch, sent_at, kitchen_status, kitchen_ready_at, seat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const w of wanted) {
      const r = rows.find(x => x.id === w.itemId);
      if (w.quantity === r.quantity) db.prepare('UPDATE order_items SET order_id = ? WHERE id = ?').run(childId, r.id);
      else {
        db.prepare('UPDATE order_items SET quantity = quantity - ? WHERE id = ?').run(w.quantity, r.id);
        copy.run(childId, r.product_id, r.name, r.size, r.flavors, w.quantity, r.price, r.notes, r.batch, r.sent_at, r.kitchen_status, r.kitchen_ready_at, r.seat ?? null);
      }
    }
    recomputeTotals(db, parent.id);
    recomputeTotals(db, childId);
  });
  tx();
  emit(req, 'order:updated', fmt(db, parent.id));
  res.status(201).json({ split: fmt(db, childId), parent: fmt(db, parent.id) });
});

// Deshacer una cuenta separada que no se cobró: los productos vuelven a la cuenta de la mesa
router.post('/orders/:id/unsplit', (req, res) => {
  const db = getDb();
  const child = getOrder(db, req.params.id);
  if (!child || !child.split_from) return res.status(404).json({ error: 'Cuenta separada no encontrada' });
  if (!ACTIVE.includes(child.status) || child.payment_status === 'paid') return res.status(400).json({ error: 'Esa cuenta ya se cobró' });
  const parent = getOrder(db, child.split_from);
  const tx = db.transaction(() => {
    if (parent && ACTIVE.includes(parent.status)) {
      db.prepare('UPDATE order_items SET order_id = ? WHERE order_id = ?').run(parent.id, child.id);
      recomputeTotals(db, parent.id);
      db.prepare('DELETE FROM orders WHERE id = ?').run(child.id);
    }
  });
  tx();
  const formatted = parent ? fmt(db, parent.id) : null;
  if (formatted) emit(req, 'order:updated', formatted);
  res.json(formatted || { success: true });
});

/* =================== Cocina (comandas) =================== */
router.get('/kitchen', (req, res) => {
  const db = getDb();
  const station = STATIONS.includes(req.query.station) ? req.query.station : null;
  const rows = db.prepare(`
    SELECT o.id AS orderId, o.type, o.status, o.sale_label AS label, o.customer_name AS customerName, o.table_label AS tableLabel, o.people, o.waiter_name AS waiterName, o.notes AS orderNotes, o.channel,
           oi.id AS itemId, oi.batch, oi.sent_at AS sentAt, COALESCE(oi.kitchen_status, 'pending') AS kitchenStatus, oi.kitchen_ready_at AS readyAt, oi.name, oi.size, oi.flavors, oi.quantity, oi.notes,
           COALESCE(p.station, 'cocina') AS station
    FROM order_items oi JOIN orders o ON o.id = oi.order_id LEFT JOIN products p ON p.id = oi.product_id
    WHERE oi.batch IS NOT NULL AND (o.status IN (${ACTIVE_SQL}) OR (o.split_from IS NOT NULL AND o.status != 'cancelled' AND o.created_at >= datetime('now', '-5 hours', '-12 hours'))) AND COALESCE(o.branch_id, 1) = ${Number(currentBranch())}
      AND (COALESCE(oi.kitchen_status, 'pending') != 'ready' OR oi.kitchen_ready_at >= datetime('now', '-5 hours', '-45 minutes'))
      AND COALESCE(p.station, 'cocina') != 'none'
    ORDER BY oi.sent_at, o.id, oi.batch, oi.id
  `).all();
  const map = new Map();
  for (const r of rows) {
    if (station && r.station !== station) continue;
    const key = `${r.orderId}-${r.batch}`;
    if (!map.has(key)) map.set(key, { key, orderId: r.orderId, batch: r.batch, type: r.type, status: r.status, label: r.label, customerName: r.customerName, tableLabel: r.tableLabel, people: r.people, waiterName: r.waiterName, orderNotes: r.orderNotes, channel: r.channel, sentAt: r.sentAt, items: [] });
    map.get(key).items.push({ id: r.itemId, name: r.name, size: r.size, flavors: r.flavors, quantity: r.quantity, notes: r.notes, station: r.station, kitchenStatus: r.kitchenStatus, readyAt: r.readyAt });
  }
  const tickets = [...map.values()].map(t => {
    const st = t.items.every(i => i.kitchenStatus === 'ready') ? 'ready' : t.items.some(i => i.kitchenStatus === 'preparing') ? 'preparing' : 'new';
    return { ...t, kitchenStatus: st };
  });
  res.json(tickets);
});

router.post('/kitchen/:orderId/:batch', (req, res) => {
  const db = getDb();
  const orderId = Number(req.params.orderId), batch = Number(req.params.batch);
  const order = getOrder(db, orderId);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
  const action = String(req.body.action || 'ready');
  const target = action === 'start' ? 'preparing' : action === 'undo' ? 'pending' : 'ready';
  let sql = 'UPDATE order_items SET kitchen_status = ?, kitchen_ready_at = ? WHERE order_id = ? AND batch = ?';
  const params = [target, target === 'ready' ? now(db) : null, orderId, batch];
  if (STATIONS.includes(req.body.station) && req.body.station !== 'none') { sql += ' AND product_id IN (SELECT id FROM products WHERE COALESCE(station, \'cocina\') = ?)'; params.push(req.body.station); }
  db.prepare(sql).run(...params);
  // Estado del pedido (no aplica a mesas, cuya cuenta sigue abierta)
  if (order.type !== 'dine-in' && ['pending', 'preparing'].includes(order.status)) {
    if (target === 'preparing') db.prepare("UPDATE orders SET status = 'preparing' WHERE id = ?").run(orderId);
    if (target === 'ready') {
      const pendingLeft = db.prepare("SELECT COUNT(*) AS c FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ? AND oi.batch IS NOT NULL AND COALESCE(oi.kitchen_status, 'pending') != 'ready' AND COALESCE(p.station, 'cocina') != 'none'").get(orderId).c;
      if (!pendingLeft) db.prepare("UPDATE orders SET status = 'ready', ready_at = COALESCE(ready_at, ?) WHERE id = ?").run(now(db), orderId);
    }
    if (target === 'pending' && order.status === 'preparing') db.prepare("UPDATE orders SET status = 'pending' WHERE id = ?").run(orderId);
  }
  const formatted = fmt(db, orderId);
  emit(req, 'order:updated', formatted);
  emit(req, 'kitchen:updated', { orderId, batch, status: target });
  res.json(formatted);
});

/* =================== Reportes =================== */
function range(req) {
  const t = today(getDb());
  const from = isDate(req.query.from) ? req.query.from : t;
  const to = isDate(req.query.to) ? req.query.to : t;
  return { from, to };
}
const TYPE_LABEL = { 'dine-in': 'Mesas', pickup: 'Para llevar', delivery: 'Domicilios' };
function cashPart(o) {
  if (o.payment_status !== 'paid') return 0;
  if (o.payment_method === 'cash') return o.total + (o.tip || 0);
  if (o.payment_method === 'mixed' && o.payment_split) {
    try { const s = JSON.parse(o.payment_split); return (s.method1 === 'cash' ? Number(s.amount1) : 0) + (s.method2 === 'cash' ? Number(s.amount2) : 0); } catch { return 0; }
  }
  return 0;
}

router.get('/stats', requireRole('admin', 'cashier'), (req, res) => {
  const db = getDb();
  const { from, to } = range(req);
  const bw = branchWhere('', req.query);
  const orders = db.prepare(`SELECT * FROM orders WHERE status != 'cancelled' AND date(created_at) BETWEEN ? AND ?${bw.sql}`).all(from, to, ...bw.params);
  const byType = {}, byChannel = {}, byWaiter = {}, byCourier = {};
  let tips = 0, deliveryFees = 0, people = 0, dineInTotal = 0, discounts = 0;
  for (const o of orders) {
    const t = byType[o.type] || (byType[o.type] = { type: o.type, label: TYPE_LABEL[o.type] || o.type, count: 0, total: 0, tips: 0, deliveryFees: 0, people: 0, pending: 0 });
    t.count++; t.total += o.total; t.tips += o.tip || 0; t.deliveryFees += o.delivery_fee || 0; t.people += o.people || 0; if (o.payment_status !== 'paid') t.pending += o.total;
    const ch = o.channel || 'local';
    const c = byChannel[ch] || (byChannel[ch] = { channel: ch, label: (CHANNELS.find(x => x.id === ch) || { label: ch }).label, count: 0, total: 0 });
    c.count++; c.total += o.total;
    tips += o.tip || 0; deliveryFees += o.delivery_fee || 0; discounts += o.discount || 0;
    if (o.type === 'dine-in') {
      people += o.people || 0; dineInTotal += o.total;
      const wn = o.waiter_name || 'Sin mesero';
      const w = byWaiter[wn] || (byWaiter[wn] = { waiter: wn, orders: 0, people: 0, total: 0, tips: 0 });
      w.orders++; w.people += o.people || 0; w.total += o.total; w.tips += o.tip || 0;
    }
    if (o.type === 'delivery') {
      const dn = o.driver_name || 'Sin repartidor';
      const d = byCourier[dn] || (byCourier[dn] = { courier: dn, driverId: o.driver_id || null, orders: 0, delivered: 0, total: 0, deliveryFees: 0, cashCollected: 0, platform: 0, pending: 0 });
      d.orders++; if (o.status === 'delivered') d.delivered++; d.total += o.total; d.deliveryFees += o.delivery_fee || 0; d.cashCollected += cashPart(o);
      if (o.payment_method === 'platform') d.platform += o.total; if (o.payment_status !== 'paid') d.pending += o.total;
    }
  }
  const sales = orders.reduce((a, o) => a + o.total, 0);
  res.json({
    period: { from, to },
    summary: { orders: orders.length, sales, avgTicket: orders.length ? Math.round(sales / orders.length) : 0, tips, deliveryFees, discounts, people, avgPerPerson: people ? Math.round(dineInTotal / people) : 0 },
    byType: Object.values(byType), byChannel: Object.values(byChannel).sort((a, b) => b.total - a.total),
    byWaiter: Object.values(byWaiter).map(w => ({ ...w, avgPerPerson: w.people ? Math.round(w.total / w.people) : 0 })).sort((a, b) => b.total - a.total),
    byCourier: Object.values(byCourier).sort((a, b) => b.orders - a.orders),
  });
});

// Cuadre de repartidor: pedidos del período con lo que debe entregar en efectivo
router.get('/couriers/:driverId', requireRole('admin', 'cashier'), (req, res) => {
  const db = getDb();
  const { from, to } = range(req);
  const rows = db.prepare("SELECT * FROM orders WHERE type = 'delivery' AND status != 'cancelled' AND driver_id = ? AND date(created_at) BETWEEN ? AND ? ORDER BY created_at").all(Number(req.params.driverId), from, to);
  const orders = rows.map(o => ({ id: o.id, createdAt: o.created_at, status: o.status, customer: o.customer_name, address: o.customer_address, neighborhood: o.customer_neighborhood, total: o.total, deliveryFee: o.delivery_fee || 0, paymentMethod: o.payment_method, paymentStatus: o.payment_status, cash: cashPart(o) }));
  res.json({ period: { from, to }, driver: employee(db, req.params.driverId), orders, totals: { orders: orders.length, total: orders.reduce((a, o) => a + o.total, 0), deliveryFees: orders.reduce((a, o) => a + o.deliveryFee, 0), cash: orders.reduce((a, o) => a + o.cash, 0), pending: orders.filter(o => o.paymentStatus !== 'paid').reduce((a, o) => a + o.total, 0) } });
});

module.exports = router;
