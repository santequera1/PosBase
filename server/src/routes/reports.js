const { Router } = require('express');
const { getDb } = require('../db');
const { requireRole } = require('../auth');

const router = Router();

function getPeriodFilter(period) {
  switch (period) {
    case 'today': return "AND date(created_at) = date('now', '-5 hours')";
    case 'yesterday': return "AND date(created_at) = date('now', '-5 hours', '-1 day')";
    case 'week': return "AND created_at >= datetime('now', '-5 hours', '-7 days')";
    case 'month': return "AND created_at >= datetime('now', '-5 hours', '-30 days')";
    default: return '';
  }
}

router.get('/summary', requireRole('admin', 'cashier'), (req, res) => {
  const db = getDb();
  const pf = getPeriodFilter(req.query.period);

  const sales = db.prepare(`SELECT COALESCE(SUM(total), 0) as totalSales, COUNT(*) as totalOrders FROM orders WHERE status != 'cancelled' ${pf}`).get();
  const completed = db.prepare(`SELECT COUNT(*) as count FROM orders WHERE status = 'delivered' ${pf}`).get();
  const avgTicket = sales.totalOrders > 0 ? Math.round(sales.totalSales / sales.totalOrders) : 0;

  res.json({
    totalSales: sales.totalSales,
    totalOrders: sales.totalOrders,
    completedOrders: completed.count,
    averageTicket: avgTicket,
  });
});

router.get('/top-products', requireRole('admin', 'cashier'), (req, res) => {
  const db = getDb();
  const pf = getPeriodFilter(req.query.period);

  const rows = db.prepare(`
    SELECT oi.name, oi.size, oi.flavors, SUM(oi.quantity) as totalQty, SUM(oi.quantity * oi.price) as totalRevenue
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.status != 'cancelled' ${pf}
    GROUP BY oi.name, oi.size, oi.flavors
    ORDER BY totalQty DESC
    LIMIT 15
  `).all();

  res.json(rows);
});

router.get('/by-payment', requireRole('admin', 'cashier'), (req, res) => {
  const db = getDb();
  const pf = getPeriodFilter(req.query.period);

  const rows = db.prepare(`
    SELECT payment_method as method, COUNT(*) as count, COALESCE(SUM(total), 0) as total
    FROM orders WHERE status != 'cancelled' ${pf}
    GROUP BY payment_method
  `).all();

  res.json(rows);
});

router.get('/by-type', requireRole('admin', 'cashier'), (req, res) => {
  const db = getDb();
  const pf = getPeriodFilter(req.query.period);

  const rows = db.prepare(`
    SELECT type, COUNT(*) as count, COALESCE(SUM(total), 0) as total
    FROM orders WHERE status != 'cancelled' ${pf}
    GROUP BY type
  `).all();

  res.json(rows);
});

router.get('/by-hour', requireRole('admin', 'cashier'), (req, res) => {
  const db = getDb();
  const pf = getPeriodFilter(req.query.period);

  const rows = db.prepare(`
    SELECT CAST(strftime('%H', created_at) AS INTEGER) as hour, COUNT(*) as count, COALESCE(SUM(total), 0) as total
    FROM orders WHERE status != 'cancelled' ${pf}
    GROUP BY hour
    ORDER BY hour
  `).all();

  res.json(rows);
});

// Top drivers by order count
router.get('/top-drivers', requireRole('admin', 'cashier'), (req, res) => {
  const db = getDb();
  const pf = getPeriodFilter(req.query.period);

  const rows = db.prepare(`
    SELECT d.id, d.name, d.phone, COUNT(o.id) as orderCount, COALESCE(SUM(o.total), 0) as totalRevenue
    FROM drivers d
    JOIN orders o ON o.driver_id = d.id
    WHERE o.status != 'cancelled' ${pf}
    GROUP BY d.id
    ORDER BY orderCount DESC
  `).all();

  res.json(rows);
});

module.exports = router;
