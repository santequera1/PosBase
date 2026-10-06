const { Router } = require('express');
const { getDb } = require('../db');
const { applySaleStock, restoreOrderStock } = require('../stock');
const { issueElectronicInvoice } = require('../einvoice');
const L = require('../ledger');
const { formatOrder } = require('../orderFormat');
const { readRestaurantConfig, computeStaffDiscount, staffDiscountEmployee, CHANNELS } = require('../restaurantSchema');
const { getOpenShift, now } = require('../cashHelpers');
const CHANNEL_IDS = CHANNELS.map(c => c.id);
const METHODS = ['cash', 'card_debit', 'card_credit', 'card', 'transfer', 'platform', 'credit', 'mixed'];
const { requireRole, hasAction } = require('../auth');
const path = require('path');
const fs = require('fs');

const router = Router();
router.use(L.syncOnWrite(getDb));

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });


router.get('/', (req, res) => {
  const { status, search } = req.query;
  const db = getDb();
  let sql = 'SELECT * FROM orders WHERE 1=1';
  const params = [];

  if (status && status !== 'all') {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (search) {
    sql += ' AND (CAST(id AS TEXT) LIKE ? OR customer_name LIKE ? OR customer_doc LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  sql += ' ORDER BY created_at DESC';

  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(o => formatOrder(db, o)));
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
  res.json(formatOrder(db, order));
});

router.post('/', async (req, res) => {
  const {
    type = 'pickup',
    status = 'delivered',
    customer = {},
    tableNumber,
    items,
    subtotal,
    deliveryFee = 0,
    discount = 0,
    total,
    paymentMethod = 'cash',
    paymentStatus = 'paid',
    cashReceived = 0,
    cashChange = 0,
    paymentSplit,
    receiptImage,
    notes = '',
    shiftId,
    channel = 'local',
    label,
    tip = 0,
    discountReason = '',
    staffDiscountEmployeeId,
  } = req.body;

  if (!items || !items.length || !paymentMethod) {
    return res.status(400).json({ error: 'Campos requeridos: items, paymentMethod' });
  }

  const custName = customer.name?.trim() || 'Consumidor Final';
  const custDoc = customer.doc?.trim() || '222222222222';
  const custEmail = customer.email?.trim() || '';
  const custPhone = customer.phone?.trim() || '';
  const custAddress = customer.address?.trim() || '';
  const isElectronicInvoice = customer.isElectronicInvoice ? 1 : 0;
  const splitJson = paymentSplit ? JSON.stringify(paymentSplit) : null;

  const db = getDb();
  if (!METHODS.includes(paymentMethod)) return res.status(400).json({ error: 'Medio de pago inválido' });
  const rcfg = readRestaurantConfig(db);
  if (rcfg.requireOpenShift && !getOpenShift(db)) return res.status(400).json({ error: 'Abre la caja antes de registrar ventas' });
  // Descuento de trabajador: se valida contra el cálculo del servidor (porcentaje sobre productos que no son bebidas)
  let staffEmp = null;
  let reason = String(discountReason || '').trim().slice(0, 160);
  if (staffDiscountEmployeeId) {
    if (!rcfg.staffDiscountEnabled) return res.status(400).json({ error: 'El descuento de trabajador está desactivado' });
    staffEmp = staffDiscountEmployee(db, staffDiscountEmployeeId);
    if (!staffEmp) return res.status(400).json({ error: 'Trabajador no encontrado o inactivo' });
    const sd = computeStaffDiscount(db, items, rcfg);
    if (Math.abs(sd.amount - Math.round(Number(discount) || 0)) > 1) return res.status(400).json({ error: `El descuento de trabajador debe ser ${sd.amount}` });
    reason = `Descuento de trabajador ${sd.pct}%: ${staffEmp.name}`;
  }

  // Guardar o actualizar el cliente en el directorio cuando trae documento (F.E.) o teléfono
  let customerId = null;
  if (custDoc !== '222222222222' || (custPhone && custPhone.length >= 7)) {
    try {
      const existing = db.prepare("SELECT id FROM customers WHERE (document_id = ? AND ? != '222222222222') OR (phone = ? AND ? != '') LIMIT 1").get(custDoc, custDoc, custPhone, custPhone);
      if (!existing) {
        const r = db.prepare('INSERT INTO customers (name, document_id, email, phone, address, notes, is_company) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(custName, custDoc, custEmail, custPhone, custAddress, isElectronicInvoice ? 'Creado desde POS (factura electrónica)' : 'Creado desde POS', customer.isCompany ? 1 : 0);
        customerId = Number(r.lastInsertRowid);
      } else {
        db.prepare("UPDATE customers SET name = ?, email = CASE WHEN ? != '' THEN ? ELSE email END, document_id = ?, phone = CASE WHEN ? != '' THEN ? ELSE phone END WHERE id = ?")
          .run(custName, custEmail, custEmail, custDoc, custPhone, custPhone, existing.id);
        customerId = existing.id;
      }
    } catch (e) {
      console.error('No se pudo guardar el cliente desde el POS:', e.message);
    }
  }

  // Auto-link to active open shift if shiftId is not provided or zero
  let effectiveShiftId = Number(shiftId);
  if (!effectiveShiftId || effectiveShiftId <= 0) {
    const openShift = db.prepare("SELECT id FROM cash_shifts WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1").get();
    effectiveShiftId = openShift ? openShift.id : null;
  }

  // Vendedor: el usuario que registra la venta; si no hay sesión con nombre, el cajero del turno
  let cashierName = (req.user && req.user.name) ? String(req.user.name).trim() : '';
  if (!cashierName && effectiveShiftId) {
    const sh = db.prepare('SELECT cashier_name FROM cash_shifts WHERE id = ?').get(effectiveShiftId);
    cashierName = sh && sh.cashier_name ? sh.cashier_name : '';
  }
  const sellerUserId = req.user && req.user.id ? Number(req.user.id) : null;

  const result = db.prepare(`
    INSERT INTO orders (
      type, status, customer_name, customer_doc, customer_email, customer_phone, customer_address,
      is_electronic_invoice, table_number, subtotal, delivery_fee, discount, total,
      payment_method, payment_status, cash_received, cash_change, receipt_image, notes, shift_id, payment_split, customer_id,
      cashier_name, user_id, channel, sale_label, tip
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    type, status,
    custName, custDoc, custEmail, custPhone, custAddress,
    isElectronicInvoice,
    tableNumber || null,
    subtotal, deliveryFee, discount, total,
    paymentMethod, paymentStatus,
    cashReceived, cashChange,
    receiptImage || null,
    notes,
    effectiveShiftId,
    splitJson,
    customerId,
    cashierName || null,
    sellerUserId,
    CHANNEL_IDS.includes(channel) ? channel : 'local',
    label ? String(label).trim().slice(0, 60) : null,
    Math.max(0, Math.round(Number(tip) || 0))
  );

  const orderId = result.lastInsertRowid;
  if (Number(discount) > 0) db.prepare('UPDATE orders SET discount_reason = ?, discount_kind = ?, discount_employee_id = ?, discount_employee_name = ? WHERE id = ?')
    .run(reason || null, staffEmp ? 'staff' : 'manual', staffEmp ? staffEmp.id : null, staffEmp ? staffEmp.name : null, orderId);
  const insertItem = db.prepare(`
    INSERT INTO order_items (order_id, product_id, name, size, flavors, quantity, price, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const item of items) {
    insertItem.run(
      orderId,
      item.productId || 0,
      item.name,
      item.size || null,
      item.flavors || null,
      item.quantity || 1,
      item.price || 0,
      item.notes || ''
    );
  }

  applySaleStock(db, req.app.io, orderId, items, req.user?.name);
  // Pedidos que no se entregan de inmediato: todos sus productos salen como primera comanda a cocina
  if (status !== 'delivered' && status !== 'cancelled') {
    db.prepare("UPDATE order_items SET batch = 1, sent_at = datetime('now', '-5 hours'), kitchen_status = 'pending' WHERE order_id = ?").run(orderId);
    require('../printing').autoKitchen(db, orderId, 1, req.user?.name);
  }
  if (isElectronicInvoice) { try { await issueElectronicInvoice(db, orderId); } catch (e) { console.warn('Factura electrónica:', e.message); } }
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  const formatted = formatOrder(db, order);

  // Emit to socket.io if available
  if (req.app.io) {
    req.app.io.emit('order:new', formatted);
  }

  res.status(201).json(formatted);
});

// Factura electrónica: con Factus configurado emite la factura real; si no, el documento simulado de pruebas
router.post('/:id/electronic-invoice', async (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (order.status === 'cancelled') return res.status(400).json({ error: 'El pedido está anulado' });
  try {
    const updated = await issueElectronicInvoice(db, Number(req.params.id));
    const formatted = formatOrder(db, updated);
    if (req.app.io) req.app.io.emit('order:updated', formatted);
    res.json(formatted);
  } catch (e) {
    const formatted = formatOrder(db, db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id));
    if (req.app.io) req.app.io.emit('order:updated', formatted);
    res.status(400).json({ error: e.message, order: formatted });
  }
});

// Abonos de clientes (ventas a crédito y plataformas): cartera por cobrar
router.get('/:id/payments', (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
  const payments = db.prepare('SELECT id, date, amount, method, notes, created_by AS createdBy, created_at AS createdAt FROM order_payments WHERE order_id = ? ORDER BY date, id').all(order.id);
  const paid = payments.reduce((a, p) => a + p.amount, 0);
  res.json({ payments, paid, total: (order.total || 0) + (order.tip || 0), balance: (order.total || 0) + (order.tip || 0) - paid });
});
router.post('/:id/payments', (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (order.status === 'cancelled') return res.status(400).json({ error: 'El pedido está anulado' });
  if (order.payment_status === 'paid' && order.payment_method !== 'platform') return res.status(400).json({ error: 'Este pedido ya está pagado' });
  const total = (order.total || 0) + (order.tip || 0);
  const paid = db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM order_payments WHERE order_id = ?').get(order.id).s;
  const balance = total - paid;
  if (balance <= 0) return res.status(400).json({ error: 'Este pedido no tiene saldo pendiente' });
  const amount = req.body.amount === undefined || req.body.amount === null || req.body.amount === '' ? balance : Math.round(Number(req.body.amount));
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'El abono debe ser mayor a cero' });
  if (amount > balance) return res.status(400).json({ error: `El abono supera el saldo pendiente (${balance})` });
  const method = ['cash', 'transfer', 'card', 'card_debit', 'card_credit'].includes(req.body.method) ? req.body.method : 'cash';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body.date || '')) ? req.body.date : now(db).slice(0, 10);
  const info = db.prepare('INSERT INTO order_payments (order_id, date, amount, method, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .run(order.id, date, amount, method, String(req.body.notes || '').slice(0, 200), req.user?.name || '');
  if (paid + amount >= total) db.prepare("UPDATE orders SET payment_status = 'paid' WHERE id = ?").run(order.id);
  const formatted = formatOrder(db, db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id));
  if (req.app.io) req.app.io.emit('order:updated', formatted);
  res.status(201).json({ id: Number(info.lastInsertRowid), amount, balance: balance - amount, order: formatted });
});
router.delete('/:id/payments/:pid', requireRole('admin'), (req, res) => {
  const db = getDb();
  const p = db.prepare('SELECT * FROM order_payments WHERE id = ? AND order_id = ?').get(req.params.pid, req.params.id);
  if (!p) return res.status(404).json({ error: 'Abono no encontrado' });
  db.prepare('DELETE FROM order_payments WHERE id = ?').run(p.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(p.order_id);
  if (order && order.payment_method !== 'platform') db.prepare("UPDATE orders SET payment_status = 'pending' WHERE id = ?").run(order.id);
  const formatted = formatOrder(db, db.prepare('SELECT * FROM orders WHERE id = ?').get(p.order_id));
  if (req.app.io) req.app.io.emit('order:updated', formatted);
  res.json({ success: true, order: formatted });
});

router.patch('/:id/status', (req, res) => {
  const { status } = req.body;
  const validStatuses = ['open', 'pending', 'preparing', 'ready', 'shipped', 'delivered', 'billing', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }

  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

  if (status === 'cancelled' && order.status !== 'cancelled' && !hasAction(req.user, 'cancel_orders')) return res.status(403).json({ error: 'No tienes permiso para anular pedidos. Pídele a un administrador.' });
  if (status === 'cancelled' && order.status !== 'cancelled') restoreOrderStock(db, req.app.io, Number(req.params.id), req.user?.name);

  const ts = now(db);
  db.prepare(`UPDATE orders SET status = ?,
    ready_at = CASE WHEN ? = 'ready' THEN COALESCE(ready_at, ?) ELSE ready_at END,
    shipped_at = CASE WHEN ? = 'shipped' THEN ? ELSE shipped_at END,
    delivered_at = CASE WHEN ? = 'delivered' THEN COALESCE(delivered_at, ?) ELSE delivered_at END,
    closed_at = CASE WHEN ? IN ('delivered', 'cancelled') THEN ? ELSE closed_at END,
    closed_by = CASE WHEN ? IN ('delivered', 'cancelled') THEN ? ELSE closed_by END
    WHERE id = ?`).run(status, status, ts, status, ts, status, ts, status, ts, status, req.user?.name || null, req.params.id);
  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  const formatted = formatOrder(db, updated);

  // Emit to socket.io
  if (req.app.io) {
    req.app.io.emit('order:updated', formatted);
  }

  res.json(formatted);
});

router.patch('/:id/driver', (req, res) => {
  const { driverId } = req.body;
  const db = getDb();
  db.prepare('UPDATE orders SET driver_id = ? WHERE id = ?').run(driverId, req.params.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
  const formatted = formatOrder(db, order);
  if (req.app.io) req.app.io.emit('order:updated', formatted);
  res.json(formatted);
});

// Update payment status and optionally payment method
router.patch('/:id/payment', (req, res) => {
  const { paymentStatus, paymentMethod } = req.body;
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

  if (paymentMethod) {
    db.prepare('UPDATE orders SET payment_status = ?, payment_method = ? WHERE id = ?').run(paymentStatus, paymentMethod, req.params.id);
  } else {
    db.prepare('UPDATE orders SET payment_status = ? WHERE id = ?').run(paymentStatus, req.params.id);
  }

  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  const formatted = formatOrder(db, updated);
  if (req.app.io) req.app.io.emit('order:updated', formatted);
  res.json(formatted);
});

// Update customer info on an order (useful for dine-in orders)
router.patch('/:id/customer', (req, res) => {
  const { name, phone, address } = req.body;
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

  db.prepare('UPDATE orders SET customer_name = ?, customer_phone = ?, customer_address = ? WHERE id = ?')
    .run(name || order.customer_name, phone || order.customer_phone, address || order.customer_address, req.params.id);

  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  const formatted = formatOrder(db, updated);
  if (req.app.io) req.app.io.emit('order:updated', formatted);
  res.json(formatted);
});

// Upload receipt image (base64)
router.patch('/:id/receipt', (req, res) => {
  const { receiptImage } = req.body;
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

  db.prepare('UPDATE orders SET receipt_image = ? WHERE id = ?').run(receiptImage, req.params.id);

  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  const formatted = formatOrder(db, updated);
  res.json(formatted);
});

// Update notes
router.patch('/:id/notes', (req, res) => {
  const { notes } = req.body;
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

  db.prepare('UPDATE orders SET notes = ? WHERE id = ?').run(notes || '', req.params.id);

  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  const formatted = formatOrder(db, updated);
  res.json(formatted);
});

// Delete order (Admin only)
router.delete('/:id', requireRole('admin'), (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

  if (order.status !== 'cancelled') restoreOrderStock(db, req.app.io, Number(req.params.id), req.user?.name);

  db.prepare('DELETE FROM order_items WHERE order_id = ?').run(req.params.id);
  db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);

  if (req.app.io) {
    req.app.io.emit('order:deleted', { id: Number(req.params.id) });
  }

  res.json({ success: true });
});

module.exports = router;
