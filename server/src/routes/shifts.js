const { Router } = require('express');
const { getDb } = require('../db');

const router = Router();

// Calculate live stats for a shift (STRICTLY isolated by shift_id)
function getShiftLiveStats(db, shift) {
  if (!shift || !shift.id) return null;

  // Sales totals strictly for this shift
  const orders = db.prepare(`
    SELECT payment_method, total, payment_split
    FROM orders
    WHERE status != 'cancelled' AND shift_id = ?
  `).all(shift.id);

  let cashSales = 0;
  let debitSales = 0;
  let creditSales = 0;
  let transferSales = 0;
  let totalOrders = orders.length;
  let totalSales = 0;

  for (const o of orders) {
    totalSales += o.total;
    if (o.payment_split) {
      try {
        const split = typeof o.payment_split === 'string' ? JSON.parse(o.payment_split) : o.payment_split;
        const addSplit = (m, amt) => {
          if (m === 'cash') cashSales += amt;
          else if (m === 'card_debit') debitSales += amt;
          else if (m === 'card_credit' || m === 'card') creditSales += amt;
          else if (m === 'transfer') transferSales += amt;
        };
        if (split.method1 && split.amount1) addSplit(split.method1, Number(split.amount1));
        if (split.method2 && split.amount2) addSplit(split.method2, Number(split.amount2));
        continue;
      } catch (e) {
        // fallback
      }
    }

    if (o.payment_method === 'cash') cashSales += o.total;
    else if (o.payment_method === 'card_debit') debitSales += o.total;
    else if (o.payment_method === 'card_credit' || o.payment_method === 'card') creditSales += o.total;
    else if (o.payment_method === 'transfer') transferSales += o.total;
  }

  // Cash Movements (Withdrawals / Deposits) strictly for this shift
  const movements = db.prepare(`SELECT * FROM cash_movements WHERE shift_id = ? ORDER BY created_at DESC`).all(shift.id);
  let totalWithdrawals = 0;
  let totalDeposits = 0;

  for (const m of movements) {
    if (m.type === 'withdrawal') totalWithdrawals += m.amount;
    else if (m.type === 'deposit') totalDeposits += m.amount;
  }

  // Flavors / products breakdown strictly for this shift
  const flavorStats = db.prepare(`
    SELECT
      oi.name,
      oi.size,
      oi.flavors,
      SUM(oi.quantity) as qty,
      SUM(oi.quantity * oi.price) as revenue
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.status != 'cancelled' AND o.shift_id = ?
    GROUP BY oi.name, oi.size, oi.flavors
    ORDER BY qty DESC
  `).all(shift.id);

  const initialCash = shift.initial_cash !== undefined ? shift.initial_cash : (shift.initialCash || 0);
  const expectedCash = initialCash + cashSales + totalDeposits - totalWithdrawals;

  return {
    ...shift,
    cashierName: shift.cashier_name || shift.cashierName || 'Cajero',
    initialCash,
    cashSales,
    debitSales,
    creditSales,
    transferSales,
    totalSales,
    totalOrders,
    totalWithdrawals,
    totalDeposits,
    expectedCash,
    movements,
    flavorStats,
  };
}

// Get current open shift
router.get('/current', (req, res) => {
  const db = getDb();
  const shift = db.prepare("SELECT * FROM cash_shifts WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1").get();

  if (!shift) {
    return res.json(null);
  }

  const live = getShiftLiveStats(db, shift);
  res.json(live);
});

// Register cash movement (withdrawal / deposit)
router.post('/movement', (req, res) => {
  const { shiftId, type = 'withdrawal', amount, reason, cashierName } = req.body;
  if (!amount || amount <= 0 || !reason?.trim()) {
    return res.status(400).json({ error: 'Monto y motivo del retiro son requeridos' });
  }

  const db = getDb();
  let shift = shiftId
    ? db.prepare('SELECT * FROM cash_shifts WHERE id = ?').get(shiftId)
    : db.prepare("SELECT * FROM cash_shifts WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1").get();

  if (!shift) {
    return res.status(404).json({ error: 'No hay turno abierto' });
  }

  const name = cashierName || req.user?.name || shift.cashier_name || 'Cajero';
  const result = db.prepare(`
    INSERT INTO cash_movements (shift_id, type, amount, reason, cashier_name, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now', '-5 hours'))
  `).run(shift.id, type, Number(amount), reason.trim(), name);

  const movement = db.prepare('SELECT * FROM cash_movements WHERE id = ?').get(result.lastInsertRowid);
  const live = getShiftLiveStats(db, shift);

  res.status(201).json({ movement, shift: live });
});

// Get movements for a shift
router.get('/movements', (req, res) => {
  const { shiftId } = req.query;
  const db = getDb();
  let shift = shiftId
    ? db.prepare('SELECT * FROM cash_shifts WHERE id = ?').get(shiftId)
    : db.prepare("SELECT * FROM cash_shifts WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1").get();

  if (!shift) return res.json([]);
  const movements = db.prepare('SELECT * FROM cash_movements WHERE shift_id = ? ORDER BY created_at DESC').all(shift.id);
  res.json(movements);
});

// Open a new shift
router.post('/open', (req, res) => {
  const { initialCash = 0, cashierName, notes = '' } = req.body;
  const db = getDb();

  // Close any previously open shift first
  db.prepare("UPDATE cash_shifts SET status = 'closed', closed_at = datetime('now', '-5 hours') WHERE status = 'open'").run();

  const name = cashierName || req.user?.name || 'Caja';
  const result = db.prepare(`
    INSERT INTO cash_shifts (user_id, cashier_name, opened_at, initial_cash, status, notes)
    VALUES (?, ?, datetime('now', '-5 hours'), ?, 'open', ?)
  `).run(req.user?.id || 1, name, Number(initialCash) || 0, notes);

  const shift = db.prepare('SELECT * FROM cash_shifts WHERE id = ?').get(result.lastInsertRowid);
  res.json(getShiftLiveStats(db, shift));
});

// Close shift (Arqueo / Cierre Z)
router.post('/close', (req, res) => {
  const { shiftId, actualCash = 0, notes = '' } = req.body;
  const db = getDb();

  let shift = shiftId
    ? db.prepare('SELECT * FROM cash_shifts WHERE id = ?').get(shiftId)
    : db.prepare("SELECT * FROM cash_shifts WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1").get();

  if (!shift) {
    return res.status(404).json({ error: 'No hay turno abierto para cerrar' });
  }

  const stats = getShiftLiveStats(db, shift);
  const countedCash = Number(actualCash) || 0;
  const diff = countedCash - stats.expectedCash;

  db.prepare(`
    UPDATE cash_shifts SET
      status = 'closed',
      closed_at = datetime('now', '-5 hours'),
      expected_cash = ?,
      actual_cash = ?,
      difference = ?,
      total_cash_sales = ?,
      total_card_debit = ?,
      total_card_credit = ?,
      total_transfer = ?,
      total_sales = ?,
      total_orders = ?,
      notes = ?
    WHERE id = ?
  `).run(
    stats.expectedCash,
    countedCash,
    diff,
    stats.cashSales,
    stats.debitSales,
    stats.creditSales,
    stats.transferSales,
    stats.totalSales,
    stats.totalOrders,
    notes || shift.notes || '',
    shift.id
  );

  const closed = db.prepare('SELECT * FROM cash_shifts WHERE id = ?').get(shift.id);
  res.json({
    ...getShiftLiveStats(db, closed),
    difference: diff,
    actualCash: countedCash,
  });
});

// Shift history
router.get('/history', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM cash_shifts ORDER BY opened_at DESC LIMIT 30').all();
  res.json(rows);
});

module.exports = router;
