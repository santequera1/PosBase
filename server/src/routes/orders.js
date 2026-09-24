const { Router } = require('express');
const { getDb } = require('../db');
const { applySaleStock, restoreOrderStock } = require('../stock');
const { issueTestInvoice, electronicInvoiceOf } = require('../einvoice');
const { requireRole } = require('../auth');
const path = require('path');
const fs = require('fs');

const router = Router();

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function formatOrder(db, order) {
  const items = db.prepare(
    'SELECT product_id AS productId, name, size, flavors, quantity, price, notes FROM order_items WHERE order_id = ?'
  ).all(order.id);

  return {
    id: order.id,
    type: order.type,
    status: order.status,
    customer: {
      name: order.customer_name || 'Consumidor Final',
      doc: order.customer_doc || '222222222222',
      email: order.customer_email || undefined,
      phone: order.customer_phone || undefined,
      address: order.customer_address || undefined,
      isElectronicInvoice: Boolean(order.is_electronic_invoice),
    },
    tableNumber: order.table_number || undefined,
    items,
    subtotal: order.subtotal,
    deliveryFee: order.delivery_fee,
    discount: order.discount || 0,
    total: order.total,
    paymentMethod: order.payment_method,
    paymentStatus: order.payment_status,
    cashReceived: order.cash_received || 0,
    cashChange: order.cash_change || 0,
    paymentSplit: order.payment_split ? (typeof order.payment_split === 'string' ? JSON.parse(order.payment_split) : order.payment_split) : undefined,
    createdAt: order.created_at,
    driverId: order.driver_id || undefined,
    receiptImage: order.receipt_image || undefined,
    notes: order.notes || '',
    shiftId: order.shift_id || undefined,
    cashierName: order.cashier_name || undefined,
    electronicInvoice: electronicInvoiceOf(order),
  };
}

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

router.post('/', (req, res) => {
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
      cashier_name, user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    sellerUserId
  );

  const orderId = result.lastInsertRowid;
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
  if (isElectronicInvoice) issueTestInvoice(db, orderId);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  const formatted = formatOrder(db, order);

  // Emit to socket.io if available
  if (req.app.io) {
    req.app.io.emit('order:new', formatted);
  }

  res.status(201).json(formatted);
});

// Factura electrónica (modo pruebas): genera el documento simulado para un pedido existente
router.post('/:id/electronic-invoice', (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (order.status === 'cancelled') return res.status(400).json({ error: 'El pedido está anulado' });
  const updated = issueTestInvoice(db, Number(req.params.id));
  const formatted = formatOrder(db, updated);
  if (req.app.io) req.app.io.emit('order:updated', formatted);
  res.json(formatted);
});

router.patch('/:id/status', (req, res) => {
  const { status } = req.body;
  const validStatuses = ['pending', 'preparing', 'ready', 'shipped', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }

  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

  if (status === 'cancelled' && order.status !== 'cancelled') restoreOrderStock(db, req.app.io, Number(req.params.id), req.user?.name);

  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
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
