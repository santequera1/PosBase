/**
 * Informe contable del período para el contador: libro de ventas (diario y por
 * comprobante), libro de compras y gastos, impuestos, nómina, cierres de caja y
 * cuentas por pagar. Todo se calcula desde las tablas operativas; no hay
 * asientos contables ni doble partida (eso lo sigue haciendo el contador en su
 * software), pero los datos salen listos para digitar o importar.
 */

const PAYMENT_LABEL = { cash: 'Efectivo', card_debit: 'Tarjeta débito', card_credit: 'Tarjeta crédito', card: 'Tarjeta', transfer: 'Transferencia / QR', mixed: 'Mixto', credit: 'Crédito' };
const TAX_LABEL = { none: 'Sin impuesto', iva: 'IVA', inc: 'INC (impuesto al consumo)' };

function readSettings(db, keys) {
  const rows = db.prepare(`SELECT key, value FROM settings WHERE key IN (${keys.map(() => '?').join(',')})`).all(...keys);
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

function taxConfig(db) {
  const s = readSettings(db, ['taxType', 'taxRate']);
  const type = ['none', 'iva', 'inc'].includes(s.taxType) ? s.taxType : 'none';
  const rate = type === 'none' ? 0 : Math.max(0, Number(s.taxRate) || 0);
  return { type, rate, label: TAX_LABEL[type], shortLabel: type === 'none' ? '' : type.toUpperCase() };
}

/** Los precios del POS incluyen el impuesto: base = total / (1 + tarifa). */
function splitTax(total, rate) {
  if (!rate) return { base: total, tax: 0 };
  const base = Math.round(total / (1 + rate / 100));
  return { base, tax: total - base };
}

function paymentParts(o) {
  const parts = { cash: 0, debit: 0, credit: 0, transfer: 0 };
  const add = (m, amt) => {
    if (m === 'cash') parts.cash += amt;
    else if (m === 'card_debit') parts.debit += amt;
    else if (m === 'card_credit' || m === 'card') parts.credit += amt;
    else if (m === 'transfer') parts.transfer += amt;
  };
  if (o.payment_split) {
    try {
      const split = typeof o.payment_split === 'string' ? JSON.parse(o.payment_split) : o.payment_split;
      if (split && split.method1 && split.amount1) { add(split.method1, Number(split.amount1)); if (split.method2 && split.amount2) add(split.method2, Number(split.amount2)); return parts; }
    } catch { /* cae al método simple */ }
  }
  add(o.payment_method, o.total);
  return parts;
}

function splitDateTime(ts) {
  const s = String(ts || '');
  return { date: s.slice(0, 10), time: s.includes('T') ? s.slice(11, 16) : s.slice(11, 16) };
}

function buildAccounting(db, range) {
  const { from, to } = range;
  const tax = taxConfig(db);
  const biz = readSettings(db, ['businessName', 'businessNit', 'businessAddress', 'businessPhone', 'invoicePrefix', 'dianResolution']);
  const prefix = biz.invoicePrefix || 'POS';

  /* ---------- Ventas ---------- */
  const orderRows = db.prepare(`
    SELECT id, created_at, customer_name, customer_doc, payment_method, payment_split, subtotal, discount, delivery_fee, total, status, is_electronic_invoice
    FROM orders WHERE date(created_at) BETWEEN ? AND ? ORDER BY created_at, id
  `).all(from, to);

  const byDayMap = new Map();
  const byPaymentMap = { cash: 0, debit: 0, credit: 0, transfer: 0 };
  const byPaymentCount = { cash: 0, debit: 0, credit: 0, transfer: 0 };
  let count = 0, gross = 0, base = 0, taxTotal = 0, cancelledCount = 0, cancelledTotal = 0, discounts = 0, electronicCount = 0;

  const orders = orderRows.map(o => {
    const { date, time } = splitDateTime(o.created_at);
    const cancelled = o.status === 'cancelled';
    const t = cancelled ? { base: 0, tax: 0 } : splitTax(o.total, tax.rate);
    if (cancelled) { cancelledCount++; cancelledTotal += o.total; }
    else {
      count++; gross += o.total; base += t.base; taxTotal += t.tax; discounts += o.discount || 0;
      if (o.is_electronic_invoice) electronicCount++;
      const parts = paymentParts(o);
      for (const k of Object.keys(parts)) { byPaymentMap[k] += parts[k]; if (parts[k] > 0) byPaymentCount[k]++; }
      const d = byDayMap.get(date) || { date, count: 0, total: 0, base: 0, tax: 0, cash: 0, debit: 0, credit: 0, transfer: 0 };
      d.count++; d.total += o.total; d.base += t.base; d.tax += t.tax; d.cash += parts.cash; d.debit += parts.debit; d.credit += parts.credit; d.transfer += parts.transfer;
      byDayMap.set(date, d);
    }
    return {
      id: o.id, number: `${prefix}-${o.id}`, date, time, customer: o.customer_name || 'Consumidor Final', doc: o.customer_doc || '',
      method: PAYMENT_LABEL[o.payment_method] || o.payment_method, methodKey: o.payment_method, status: cancelled ? 'Anulado' : 'Válido',
      subtotal: o.subtotal, discount: o.discount || 0, deliveryFee: o.delivery_fee || 0, total: o.total, base: t.base, tax: t.tax,
      electronic: Boolean(o.is_electronic_invoice),
    };
  });

  const byPayment = [
    { key: 'cash', label: 'Efectivo', total: byPaymentMap.cash, count: byPaymentCount.cash },
    { key: 'debit', label: 'Tarjeta débito', total: byPaymentMap.debit, count: byPaymentCount.debit },
    { key: 'credit', label: 'Tarjeta crédito', total: byPaymentMap.credit, count: byPaymentCount.credit },
    { key: 'transfer', label: 'Transferencia / QR', total: byPaymentMap.transfer, count: byPaymentCount.transfer },
  ];

  /* ---------- Compras y gastos ---------- */
  const expenseRows = db.prepare(`
    SELECT e.id, e.date, e.description, e.amount, COALESCE(e.tax_amount, 0) AS taxAmount, e.payment_method AS method, e.status, e.due_date AS dueDate, e.paid_at AS paidAt,
           e.invoice_number AS invoice, e.source, c.name AS category, c.kind, s.name AS supplier, s.nit AS supplierNit
    FROM expenses e JOIN expense_categories c ON c.id = e.category_id LEFT JOIN suppliers s ON s.id = e.supplier_id
    WHERE e.date BETWEEN ? AND ? ORDER BY e.date, e.id
  `).all(from, to);
  const purchases = expenseRows.map(e => ({
    ...e, base: e.amount - e.taxAmount, methodLabel: PAYMENT_LABEL[e.method] || e.method, statusLabel: e.status === 'paid' ? 'Pagado' : 'Pendiente',
  }));
  const pTotals = purchases.reduce((a, e) => {
    a.count++; a.total += e.amount; a.tax += e.taxAmount; a.base += e.base;
    if (e.status === 'pending') a.pending += e.amount;
    a.byKind[e.kind] = (a.byKind[e.kind] || 0) + e.amount;
    return a;
  }, { count: 0, total: 0, tax: 0, base: 0, pending: 0, byKind: {} });

  /* ---------- Nómina pagada en el período ---------- */
  const payrollRows = db.prepare(`
    SELECT s.id, e.name AS employee, e.document, s.period_start AS periodStart, s.period_end AS periodEnd, s.base_total AS baseTotal, s.tips_total AS tipsTotal,
           s.advances_total AS advancesTotal, s.bonuses, s.deductions, s.total, s.paid_at AS paidAt, s.payment_method AS method
    FROM payroll_settlements s JOIN employees e ON e.id = s.employee_id
    WHERE s.status = 'paid' AND date(s.paid_at) BETWEEN ? AND ? ORDER BY s.paid_at
  `).all(from, to);
  const payrollTotal = payrollRows.reduce((a, r) => a + r.total, 0);

  /* ---------- Caja ---------- */
  const shifts = db.prepare(`
    SELECT id, cashier_name AS cashier, opened_at AS openedAt, closed_at AS closedAt, initial_cash AS initialCash, expected_cash AS expectedCash,
           actual_cash AS actualCash, difference, total_cash_sales AS cashSales, total_card_debit AS debitSales, total_card_credit AS creditSales,
           total_transfer AS transferSales, total_sales AS totalSales, total_orders AS totalOrders, notes
    FROM cash_shifts WHERE status = 'closed' AND date(closed_at) BETWEEN ? AND ? ORDER BY closed_at
  `).all(from, to);
  const movements = db.prepare(`
    SELECT type, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM cash_movements WHERE date(created_at) BETWEEN ? AND ? GROUP BY type
  `).all(from, to);
  const cash = {
    shifts,
    withdrawals: movements.find(m => m.type === 'withdrawal')?.total || 0,
    deposits: movements.find(m => m.type === 'deposit')?.total || 0,
    difference: shifts.reduce((a, s) => a + (s.difference || 0), 0),
  };

  /* ---------- Cuentas por pagar (saldo actual) ---------- */
  const payables = db.prepare("SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM expenses WHERE status = 'pending'").get();

  /* ---------- Estado de resultados del período ---------- */
  const cogs = pTotals.byKind.cogs || 0, opex = pTotals.byKind.opex || 0, payrollExp = pTotals.byKind.payroll || 0, other = pTotals.byKind.other || 0;
  const expensesTotal = cogs + opex + payrollExp + other;

  return {
    period: range,
    business: { name: biz.businessName || 'Mi Heladería', nit: biz.businessNit || '', address: biz.businessAddress || '', phone: biz.businessPhone || '', prefix, dianResolution: biz.dianResolution || '' },
    tax,
    sales: {
      totals: { count, gross, base, tax: taxTotal, discounts, cancelledCount, cancelledTotal, electronicCount },
      byDay: Array.from(byDayMap.values()),
      byPayment,
      orders,
    },
    purchases: { totals: pTotals, rows: purchases },
    payroll: { total: payrollTotal, rows: payrollRows },
    cash,
    payables,
    pnl: { sales: gross, cogs, opex, payroll: payrollExp, other, expenses: expensesTotal, net: gross - expensesTotal, netMargin: gross > 0 ? Math.round(((gross - expensesTotal) / gross) * 1000) / 10 : 0 },
  };
}

module.exports = { buildAccounting, taxConfig, splitTax };
