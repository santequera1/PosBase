/**
 * Motor contable de partida doble.
 *  - Contabiliza automáticamente ventas entregadas (cerradas), abonos de clientes, gastos y compras, pagos a proveedores, nómina,
 *    anticipos, diferencias de caja y movimientos de caja sin soporte, según la parametrización (accountingSchema).
 *  - syncLedger() es idempotente: contabiliza lo que falte y anula asientos de documentos anulados o eliminados.
 *  - Informes: balance de prueba (por nivel y por tercero), libro auxiliar, estado de situación financiera,
 *    estado de resultados contable, cartera por cobrar y por pagar con vencimientos, terceros (exógena).
 */
const { readAcctMap, readAcctOptions } = require('./accountingSchema');
const { taxConfig, splitTax } = require('./accounting');
const { now, today } = require('./cashHelpers');

const PREFIX = { sale: 'V', payment_in: 'RC', expense: 'G', payment_out: 'CE', payroll: 'N', advance: 'A', shift: 'C', cash: 'C', manual: 'M', tip_payout: 'P', tip_in: 'PR' };
const SOURCE_LABEL = { sale: 'Venta', payment_in: 'Recibo de caja', expense: 'Compra / gasto', payment_out: 'Comprobante de egreso', payroll: 'Nómina', advance: 'Anticipo', shift: 'Cierre de caja', cash: 'Movimiento de caja', manual: 'Comprobante de contabilidad', tip_payout: 'Pago de propinas', tip_in: 'Propina recibida' };
const PLATFORM_NAME = { rappi: 'Rappi', didi: 'DiDi Food' };

/* =================== utilidades =================== */
function nextNumber(db, source) {
  const prefix = PREFIX[source] || 'X';
  const row = db.prepare("SELECT COUNT(*) AS c FROM journal_entries WHERE number LIKE ?").get(`${prefix}-%`);
  return `${prefix}-${String((row.c || 0) + 1).padStart(6, '0')}`;
}
function accountExists(db, code) { return Boolean(db.prepare('SELECT code FROM accounts WHERE code = ? AND active = 1').get(code)); }
function ensureAccount(db, code, fallback) { return accountExists(db, code) ? code : fallback; }

/** Inserta un asiento balanceado. lines: [{ account, debit, credit, third, description, docRef }]. */
function postEntry(db, { date, source, sourceId = null, description, lines, createdBy = '', hash = null }) {
  const clean = lines.map(l => ({ ...l, debit: Math.round(Number(l.debit) || 0), credit: Math.round(Number(l.credit) || 0) })).filter(l => l.debit > 0 || l.credit > 0);
  if (!clean.length) return null;
  const debits = clean.reduce((a, l) => a + l.debit, 0), credits = clean.reduce((a, l) => a + l.credit, 0);
  if (debits !== credits) throw new Error(`Asiento descuadrado (${source} ${sourceId || ''}): débitos ${debits} ≠ créditos ${credits}`);
  for (const l of clean) if (!accountExists(db, l.account)) throw new Error(`La cuenta ${l.account} no existe o está inactiva`);
  const info = db.prepare('INSERT INTO journal_entries (number, date, source, source_id, description, created_by, doc_hash) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(nextNumber(db, source), date, source, sourceId, String(description || '').slice(0, 200), createdBy || '', hash);
  const id = Number(info.lastInsertRowid);
  const ins = db.prepare('INSERT INTO journal_lines (entry_id, account_code, debit, credit, third_type, third_id, third_doc, third_name, description, doc_ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const l of clean) {
    const t = l.third || {};
    ins.run(id, l.account, l.debit, l.credit, t.type || null, t.id || null, t.doc ? String(t.doc) : null, t.name ? String(t.name).slice(0, 120) : null, String(l.description || '').slice(0, 160), String(l.docRef || '').slice(0, 60));
  }
  return id;
}
function voidEntry(db, id, reason) {
  db.prepare("UPDATE journal_entries SET status = 'void', voided_at = ?, void_reason = ? WHERE id = ? AND status = 'posted'").run(now(db), String(reason || '').slice(0, 160), id);
}
function postedEntry(db, source, sourceId) {
  return db.prepare("SELECT id FROM journal_entries WHERE source = ? AND source_id = ? AND status = 'posted' LIMIT 1").get(source, sourceId);
}

/** Huella del documento: si cambia (monto, medio de pago, cliente…), el asiento se anula y se vuelve a generar. */
const saleHash = o => JSON.stringify([o.status === 'cancelled' ? 'x' : 'ok', o.total, o.tip, o.delivery_fee, o.payment_method, o.payment_split, o.payment_status, o.customer_doc, o.customer_name, o.channel, String(o.created_at).slice(0, 10)]);
const expenseHash = e => JSON.stringify([e.date, e.category_id, e.supplier_id, e.amount, e.tax_amount, e.retention, e.description, e.invoice_number, e.source]);

const thirdOrder = o => (o.payment_method === 'platform'
  ? { type: 'platform', id: null, doc: o.channel || 'platform', name: PLATFORM_NAME[o.channel] || 'Plataforma de domicilios' }
  : { type: 'customer', id: o.customer_id || null, doc: o.customer_doc || '222222222222', name: o.customer_name || 'Consumidor Final' });
function thirdSupplier(db, supplierId) {
  if (!supplierId) return null;
  const s = db.prepare('SELECT id, name, nit FROM suppliers WHERE id = ?').get(supplierId);
  return s ? { type: 'supplier', id: s.id, doc: s.nit || '', name: s.name } : null;
}
function thirdEmployee(db, employeeId) {
  if (!employeeId) return null;
  const e = db.prepare('SELECT id, name, document FROM employees WHERE id = ?').get(employeeId);
  return e ? { type: 'employee', id: e.id, doc: e.document || '', name: e.name } : null;
}
const methodAccount = (map, method) => {
  if (method === 'cash') return map.cash;
  if (method === 'transfer') return map.transfer;
  if (method === 'card_debit' || method === 'card_credit' || method === 'card') return map.card;
  if (method === 'platform') return map.platformReceivable;
  return map.bank;
};

/* =================== contabilización de documentos =================== */
function postSale(db, o, ctx) {
  const { map, opts, tax } = ctx;
  const total = o.total || 0, tip = o.tip || 0;
  if (total + tip <= 0) return null;
  const date = String(o.created_at).slice(0, 10);
  const third = thirdOrder(o);
  const docRef = `Pedido #${o.id}`;
  const { base, tax: taxAmt } = splitTax(total, tax.rate);
  const fee = o.delivery_fee || 0;
  const feeBase = fee > 0 ? Math.round(fee / (1 + (tax.rate || 0) / 100)) : 0;
  const lines = [];
  // Ingreso y propina (crédito)
  lines.push({ account: map.salesIncome, credit: base - feeBase, third, description: 'Venta', docRef });
  if (feeBase > 0) lines.push({ account: map.deliveryIncome, credit: feeBase, third, description: 'Costo de envío cobrado', docRef });
  if (taxAmt > 0) lines.push({ account: tax.type === 'iva' ? map.salesTaxIVA : map.salesTaxINC, credit: taxAmt, third, description: `${tax.label} generado`, docRef });
  if (tip > 0) lines.push({ account: map.tipsPayable, credit: tip, third, description: 'Propina recibida', docRef });
  // Contrapartida (débito): efectivo, banco, plataforma o cartera
  const due = total + tip;
  if (o.payment_method === 'platform') {
    lines.push({ account: map.platformReceivable, debit: due, third, description: 'Por cobrar a la plataforma', docRef });
  } else if (o.payment_status && o.payment_status !== 'paid') {
    lines.push({ account: map.customerReceivable, debit: due, third, description: 'Venta a crédito', docRef });
  } else if (o.payment_method === 'mixed' && o.payment_split) {
    let s = null; try { s = JSON.parse(o.payment_split); } catch { s = null; }
    if (s && s.method1) {
      const a1 = Math.round(Number(s.amount1) || 0), a2 = Math.round(Number(s.amount2) || 0);
      const rest = due - a1 - a2; // propina o redondeo va al primer medio
      lines.push({ account: methodAccount(map, s.method1), debit: a1 + rest, third, description: `Pago ${s.method1}`, docRef });
      lines.push({ account: methodAccount(map, s.method2), debit: a2, third, description: `Pago ${s.method2}`, docRef });
    } else lines.push({ account: map.cash, debit: due, third, description: 'Pago', docRef });
  } else {
    lines.push({ account: methodAccount(map, o.payment_method), debit: due, third, description: `Pago ${o.payment_method}`, docRef });
  }
  // Inventario permanente: costo de ventas con el costo unitario del producto
  if (opts.inventoryMethod === 'perpetual') {
    const cost = db.prepare('SELECT COALESCE(SUM(oi.quantity * COALESCE(p.cost, 0)), 0) AS c FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?').get(o.id).c;
    if (cost > 0) { lines.push({ account: map.cogs, debit: cost, description: 'Costo de ventas', docRef }); lines.push({ account: map.inventory, credit: cost, description: 'Salida de inventario', docRef }); }
  }
  return postEntry(db, { date, source: 'sale', sourceId: o.id, description: `Venta pedido #${o.id} · ${third.name}`, lines, hash: saleHash(o) });
}

function postOrderPayment(db, p, ctx) {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(p.order_id);
  if (!o) return null;
  const third = thirdOrder(o);
  const receivable = o.payment_method === 'platform' ? ctx.map.platformReceivable : ctx.map.customerReceivable;
  return postEntry(db, { date: p.date, source: 'payment_in', sourceId: p.id, description: `Abono pedido #${o.id} · ${third.name}`, lines: [
    { account: methodAccount(ctx.map, p.method), debit: p.amount, third, description: `Abono ${p.method}`, docRef: `Pedido #${o.id}` },
    { account: receivable, credit: p.amount, third, description: 'Abono a cartera', docRef: `Pedido #${o.id}` },
  ] });
}

function postExpense(db, e, ctx) {
  const { map, opts } = ctx;
  const cat = db.prepare('SELECT id, name, pl_group, account_code FROM expense_categories WHERE id = ?').get(e.category_id);
  const third = thirdSupplier(db, e.supplier_id) || { type: 'supplier', id: null, doc: '', name: 'Sin proveedor' };
  const docRef = e.invoice_number ? `Fact. ${e.invoice_number}` : `Gasto #${e.id}`;
  const payable = e.supplier_id ? map.supplierPayable : map.expensePayable;
  const retention = e.retention || 0;
  if (e.source === 'payroll') return postPayroll(db, e, ctx, third, payable);
  const taxAmt = e.tax_amount || 0;
  let expenseAccount = ensureAccount(db, cat && cat.account_code, '519595');
  if (opts.inventoryMethod === 'perpetual' && cat && cat.pl_group === 'cost') expenseAccount = map.inventory;
  const lines = [];
  if (opts.ivaResponsible && taxAmt > 0) {
    lines.push({ account: expenseAccount, debit: e.amount - taxAmt, third, description: e.description, docRef });
    lines.push({ account: map.purchaseIVA, debit: taxAmt, third, description: 'IVA descontable', docRef });
  } else {
    lines.push({ account: expenseAccount, debit: e.amount, third, description: e.description, docRef });
  }
  if (retention > 0) lines.push({ account: map.retentionPayable, credit: retention, third, description: 'Retención en la fuente practicada', docRef });
  lines.push({ account: payable, credit: e.amount - retention, third, description: e.supplier_id ? 'Por pagar al proveedor' : 'Gasto por pagar', docRef });
  return postEntry(db, { date: e.date, source: 'expense', sourceId: e.id, description: `${cat ? cat.name : 'Gasto'}: ${e.description}`, lines, hash: expenseHash(e) });
}

/** Nómina: el gasto de nómina trae la liquidación con su desglose (sueldo, extras, auxilio, propinas, deducciones, anticipos). */
function postPayroll(db, e, ctx, third, payable) {
  const { map } = ctx;
  const s = e.reference_id ? db.prepare('SELECT * FROM payroll_settlements WHERE id = ?').get(e.reference_id) : null;
  const emp = s ? thirdEmployee(db, s.employee_id) : null;
  const t = emp || third;
  const docRef = s ? `Liquidación #${s.id}` : `Gasto #${e.id}`;
  if (!s) {
    return postEntry(db, { date: e.date, source: 'payroll', sourceId: e.id, description: e.description, lines: [
      { account: map.payrollExpense, debit: e.amount, third: t, description: e.description, docRef },
      { account: payable, credit: e.amount, third: t, description: 'Nómina por pagar', docRef },
    ] });
  }
  let details = null; try { details = s.details ? JSON.parse(s.details) : null; } catch { details = null; }
  const health = (details?.legalDeductions || []).filter(l => l.key === 'health').reduce((a, l) => a + l.amount, 0);
  const pension = (details?.legalDeductions || []).filter(l => l.key === 'pension').reduce((a, l) => a + l.amount, 0);
  const legalOther = (s.legal_deductions_total || 0) - health - pension;
  const lines = [
    { account: map.payrollExpense, debit: (s.base_total || 0) + (s.bonuses || 0), third: t, description: 'Sueldo y bonificaciones', docRef },
    { account: map.payrollExtras, debit: (s.extras_total || 0) + (s.novelties_extras || 0), third: t, description: 'Horas extras y recargos', docRef },
    { account: ensureAccount(db, map.payrollBonus, map.payrollExpense), debit: s.novelties_bonus || 0, third: t, description: 'Bonificaciones, comisiones y otros pagos', docRef },
    { account: map.payrollExpense, credit: s.novelties_absence || 0, third: t, description: 'Faltas y licencias no remuneradas', docRef },
    { account: map.payrollAllowance, debit: s.allowance_total || 0, third: t, description: 'Auxilio de transporte', docRef },
    { account: map.tipsPayable, debit: s.tips_total || 0, third: t, description: 'Propinas entregadas', docRef },
    { account: map.payrollHealth, credit: health + legalOther, third: t, description: 'Salud (aporte del trabajador)', docRef },
    { account: map.payrollPension, credit: pension, third: t, description: 'Pensión (aporte del trabajador)', docRef },
    { account: map.employeeAdvances, credit: (s.advances_total || 0) + (s.deductions || 0) + (s.novelties_deductions || 0), third: t, description: 'Anticipos, préstamos y descuentos', docRef },
    { account: map.payrollPayable, credit: s.total || 0, third: t, description: 'Neto a pagar', docRef },
  ];
  return postEntry(db, { date: e.date, source: 'payroll', sourceId: e.id, description: `Nómina: ${t.name} (${s.period_start} a ${s.period_end})`, lines });
}

function postExpensePayment(db, p, ctx) {
  const e = db.prepare('SELECT * FROM expenses WHERE id = ?').get(p.expense_id);
  if (!e) return null;
  const third = e.source === 'payroll' && e.reference_id
    ? (thirdEmployee(db, (db.prepare('SELECT employee_id FROM payroll_settlements WHERE id = ?').get(e.reference_id) || {}).employee_id) || thirdSupplier(db, e.supplier_id))
    : (thirdSupplier(db, e.supplier_id) || { type: 'supplier', id: null, doc: '', name: 'Sin proveedor' });
  const payable = e.source === 'payroll' ? ctx.map.payrollPayable : (e.supplier_id ? ctx.map.supplierPayable : ctx.map.expensePayable);
  const docRef = e.invoice_number ? `Fact. ${e.invoice_number}` : `Gasto #${e.id}`;
  return postEntry(db, { date: p.date, source: 'payment_out', sourceId: p.id, description: `Pago: ${e.description}${third && third.name ? ' · ' + third.name : ''}`, lines: [
    { account: payable, debit: p.amount, third, description: 'Pago a cuenta por pagar', docRef },
    { account: methodAccount(ctx.map, p.method), credit: p.amount, third, description: `Pago ${p.method}`, docRef },
  ] });
}

function postAdvance(db, a, ctx) {
  const third = thirdEmployee(db, a.employee_id);
  return postEntry(db, { date: a.date, source: 'advance', sourceId: a.id, description: `Anticipo a ${third ? third.name : 'colaborador'}`, lines: [
    { account: ctx.map.employeeAdvances, debit: a.amount, third, description: 'Anticipo de nómina', docRef: `Anticipo #${a.id}` },
    { account: a.from_cash_register ? ctx.map.cash : ctx.map.bank, credit: a.amount, third, description: 'Entrega del anticipo', docRef: `Anticipo #${a.id}` },
  ] });
}

/** Propina registrada a mano en Personal (no viene de una venta): entra el dinero y queda por pagar al personal. */
function postManualTip(db, t, ctx) {
  const third = t.employee_id ? thirdEmployee(db, t.employee_id) : { type: 'employee', id: null, doc: '', name: 'Propina común' };
  const docRef = `Propina #${t.id}`;
  return postEntry(db, { date: t.date, source: 'tip_in', sourceId: t.id, description: `Propina recibida${third && third.name ? ' · ' + third.name : ''}`, lines: [
    { account: methodAccount(ctx.map, t.method || 'cash'), debit: t.amount, third, description: 'Propina recibida', docRef },
    { account: ctx.map.tipsPayable, credit: t.amount, third, description: 'Propinas por pagar al personal', docRef },
  ] });
}

function postTipPayout(db, p, ctx) {
  const third = thirdEmployee(db, p.employee_id);
  const docRef = `Propinas #${p.id}`;
  return postEntry(db, { date: p.date, source: 'tip_payout', sourceId: p.id, description: `Pago de propinas a ${third ? third.name : 'colaborador'}${p.period_start ? ` (${p.period_start} a ${p.period_end})` : ''}`, lines: [
    { account: ctx.map.tipsPayable, debit: p.amount, third, description: p.kind === 'liquidacion' ? 'Liquidación de propinas' : 'Abono de propinas', docRef },
    { account: p.from_cash_register || p.method === 'cash' ? ctx.map.cash : ctx.map.bank, credit: p.amount, third, description: 'Entrega de propinas', docRef },
  ] });
}

function postShiftDifference(db, s, ctx) {
  const diff = s.difference || 0;
  if (!diff) return null;
  const date = String(s.closed_at || s.opened_at).slice(0, 10);
  const docRef = `Turno #${s.id}`;
  const lines = diff < 0
    ? [{ account: ctx.map.cashShortage, debit: -diff, description: 'Faltante de caja', docRef }, { account: ctx.map.cash, credit: -diff, description: 'Faltante de caja', docRef }]
    : [{ account: ctx.map.cash, debit: diff, description: 'Sobrante de caja', docRef }, { account: ctx.map.cashOverage, credit: diff, description: 'Sobrante de caja', docRef }];
  return postEntry(db, { date, source: 'shift', sourceId: s.id, description: `Cierre de caja turno #${s.id} · ${s.cashier_name}${s.notes ? ' · ' + s.notes : ''}`, lines });
}

function postCashMovement(db, m, ctx) {
  const date = String(m.created_at).slice(0, 10);
  const docRef = `Mov. caja #${m.id}`;
  const lines = m.type === 'withdrawal'
    ? [{ account: ctx.map.cashWithdrawalOther, debit: m.amount, description: m.reason || 'Retiro de caja', docRef }, { account: ctx.map.cash, credit: m.amount, description: 'Retiro de caja', docRef }]
    : [{ account: ctx.map.cash, debit: m.amount, description: m.reason || 'Ingreso a caja', docRef }, { account: ctx.map.cashDepositSource, credit: m.amount, description: 'Ingreso a caja', docRef }];
  return postEntry(db, { date, source: 'cash', sourceId: m.id, description: `${m.type === 'withdrawal' ? 'Retiro' : 'Ingreso'} de caja: ${m.reason || ''}`, lines });
}

/* =================== sincronización idempotente =================== */
function context(db) { return { map: readAcctMap(db), opts: readAcctOptions(db), tax: taxConfig(db) }; }

function syncLedger(db) {
  const ctx = context(db);
  const errors = [];
  const safe = (label, fn) => { try { fn(); } catch (e) { errors.push(`${label}: ${e.message}`); } };
  const tx = db.transaction(() => {
    // Documentos modificados después de contabilizarse: se anula el asiento y se genera uno nuevo
    for (const r of db.prepare("SELECT j.id AS entryId, j.doc_hash AS hash, o.* FROM journal_entries j JOIN orders o ON o.id = j.source_id WHERE j.source = 'sale' AND j.status = 'posted' AND j.doc_hash IS NOT NULL AND o.status != 'cancelled'").all()) if (r.hash !== saleHash(r)) voidEntry(db, r.entryId, 'Pedido modificado');
    for (const r of db.prepare("SELECT j.id AS entryId, j.doc_hash AS hash, e.* FROM journal_entries j JOIN expenses e ON e.id = j.source_id WHERE j.source = 'expense' AND j.status = 'posted' AND j.doc_hash IS NOT NULL").all()) if (r.hash !== expenseHash(r)) voidEntry(db, r.entryId, 'Gasto modificado');
    // Ventas nuevas y anulaciones
    for (const o of db.prepare("SELECT o.* FROM orders o LEFT JOIN journal_entries j ON j.source = 'sale' AND j.source_id = o.id AND j.status = 'posted' WHERE j.id IS NULL AND o.status = 'delivered' ORDER BY o.id").all()) safe(`venta #${o.id}`, () => postSale(db, o, ctx));
    for (const j of db.prepare("SELECT j.id FROM journal_entries j LEFT JOIN orders o ON o.id = j.source_id WHERE j.source = 'sale' AND j.status = 'posted' AND (o.id IS NULL OR o.status != 'delivered')").all()) voidEntry(db, j.id, 'Pedido anulado, eliminado o reabierto');
    // Abonos de clientes
    for (const p of db.prepare("SELECT p.* FROM order_payments p LEFT JOIN journal_entries j ON j.source = 'payment_in' AND j.source_id = p.id AND j.status = 'posted' WHERE j.id IS NULL ORDER BY p.id").all()) safe(`abono cliente #${p.id}`, () => postOrderPayment(db, p, ctx));
    for (const j of db.prepare("SELECT j.id FROM journal_entries j LEFT JOIN order_payments p ON p.id = j.source_id WHERE j.source = 'payment_in' AND j.status = 'posted' AND p.id IS NULL").all()) voidEntry(db, j.id, 'Abono eliminado');
    // Gastos pagados sin abono registrado (gastos anteriores a la cartera): se crea el pago por el saldo
    for (const e of db.prepare("SELECT e.* FROM expenses e WHERE e.status = 'paid' AND NOT EXISTS (SELECT 1 FROM expense_payments p WHERE p.expense_id = e.id)").all()) {
      const amount = (e.amount || 0) - (e.retention || 0);
      if (amount > 0) {
        db.prepare("INSERT INTO expense_payments (expense_id, date, amount, method, notes, cash_movement_id, created_by) VALUES (?, ?, ?, ?, 'Pago registrado con el gasto', ?, ?)")
          .run(e.id, String(e.paid_at || e.date).slice(0, 10), amount, e.payment_method === 'credit' ? 'cash' : e.payment_method, e.cash_movement_id || null, e.created_by || '');
        db.prepare('UPDATE expenses SET paid_amount = ? WHERE id = ?').run(amount, e.id);
      }
    }
    for (const e of db.prepare("SELECT e.* FROM expenses e LEFT JOIN journal_entries j ON j.source IN ('expense', 'payroll') AND j.source_id = e.id AND j.status = 'posted' WHERE j.id IS NULL ORDER BY e.id").all()) safe(`gasto #${e.id}`, () => postExpense(db, e, ctx));
    for (const j of db.prepare("SELECT j.id FROM journal_entries j LEFT JOIN expenses e ON e.id = j.source_id WHERE j.source IN ('expense', 'payroll') AND j.status = 'posted' AND e.id IS NULL").all()) voidEntry(db, j.id, 'Gasto eliminado');
    for (const p of db.prepare("SELECT p.* FROM expense_payments p LEFT JOIN journal_entries j ON j.source = 'payment_out' AND j.source_id = p.id AND j.status = 'posted' WHERE j.id IS NULL ORDER BY p.id").all()) safe(`pago gasto #${p.id}`, () => postExpensePayment(db, p, ctx));
    for (const j of db.prepare("SELECT j.id FROM journal_entries j LEFT JOIN expense_payments p ON p.id = j.source_id WHERE j.source = 'payment_out' AND j.status = 'posted' AND p.id IS NULL").all()) voidEntry(db, j.id, 'Pago eliminado');
    // Anticipos a empleados
    for (const a of db.prepare("SELECT a.* FROM advances a LEFT JOIN journal_entries j ON j.source = 'advance' AND j.source_id = a.id AND j.status = 'posted' WHERE j.id IS NULL ORDER BY a.id").all()) safe(`anticipo #${a.id}`, () => postAdvance(db, a, ctx));
    for (const j of db.prepare("SELECT j.id FROM journal_entries j LEFT JOIN advances a ON a.id = j.source_id WHERE j.source = 'advance' AND j.status = 'posted' AND a.id IS NULL").all()) voidEntry(db, j.id, 'Anticipo eliminado');
    // Propinas anotadas a mano (las de los pedidos ya entran con la venta)
    for (const t of db.prepare("SELECT t.* FROM tips t LEFT JOIN journal_entries j ON j.source = 'tip_in' AND j.source_id = t.id AND j.status = 'posted' WHERE j.id IS NULL AND COALESCE(t.notes, '') NOT LIKE 'Propina pedido #%' ORDER BY t.id").all()) safe(`propina #${t.id}`, () => postManualTip(db, t, ctx));
    for (const j of db.prepare("SELECT j.id FROM journal_entries j LEFT JOIN tips t ON t.id = j.source_id WHERE j.source = 'tip_in' AND j.status = 'posted' AND t.id IS NULL").all()) voidEntry(db, j.id, 'Propina eliminada');
    // Pagos de propinas (abonos y liquidaciones)
    for (const p of db.prepare("SELECT p.* FROM tip_payouts p LEFT JOIN journal_entries j ON j.source = 'tip_payout' AND j.source_id = p.id AND j.status = 'posted' WHERE j.id IS NULL ORDER BY p.id").all()) safe(`propinas #${p.id}`, () => postTipPayout(db, p, ctx));
    for (const j of db.prepare("SELECT j.id FROM journal_entries j LEFT JOIN tip_payouts p ON p.id = j.source_id WHERE j.source = 'tip_payout' AND j.status = 'posted' AND p.id IS NULL").all()) voidEntry(db, j.id, 'Pago de propinas eliminado');
    // Diferencias de caja al cierre
    for (const s of db.prepare("SELECT s.* FROM cash_shifts s LEFT JOIN journal_entries j ON j.source = 'shift' AND j.source_id = s.id AND j.status = 'posted' WHERE j.id IS NULL AND s.status = 'closed' AND COALESCE(s.difference, 0) != 0").all()) safe(`cierre #${s.id}`, () => postShiftDifference(db, s, ctx));
    // Movimientos de caja sin gasto, anticipo ni pago asociado
    for (const m of db.prepare(`SELECT m.* FROM cash_movements m LEFT JOIN journal_entries j ON j.source = 'cash' AND j.source_id = m.id AND j.status = 'posted'
      WHERE j.id IS NULL AND m.id NOT IN (SELECT cash_movement_id FROM expenses WHERE cash_movement_id IS NOT NULL)
        AND m.id NOT IN (SELECT cash_movement_id FROM advances WHERE cash_movement_id IS NOT NULL)
        AND m.id NOT IN (SELECT cash_movement_id FROM expense_payments WHERE cash_movement_id IS NOT NULL)
        AND m.id NOT IN (SELECT cash_movement_id FROM tip_payouts WHERE cash_movement_id IS NOT NULL) ORDER BY m.id`).all()) safe(`movimiento caja #${m.id}`, () => postCashMovement(db, m, ctx));
  });
  tx();
  return { errors };
}

/** Middleware: tras cualquier escritura exitosa en una ruta, contabiliza lo pendiente. */
function syncOnWrite(getDbFn) {
  return (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      res.on('finish', () => { if (res.statusCode < 300) { try { syncLedger(getDbFn()); } catch (e) { console.warn('Contabilidad:', e.message); } } });
    }
    next();
  };
}

/** Borra los asientos automáticos del rango y los vuelve a generar con la parametrización actual. */
function rebuildLedger(db, from, to) {
  const tx = db.transaction(() => {
    const ids = db.prepare("SELECT id FROM journal_entries WHERE source != 'manual' AND date BETWEEN ? AND ?").all(from, to).map(r => r.id);
    if (ids.length) {
      db.prepare(`DELETE FROM journal_lines WHERE entry_id IN (${ids.map(() => '?').join(',')})`).run(...ids);
      db.prepare(`DELETE FROM journal_entries WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
    }
  });
  tx();
  return syncLedger(db);
}

/* =================== informes =================== */
function accounts(db) { return db.prepare('SELECT code, name, level, parent_code AS parentCode, nature, active, is_system AS isSystem FROM accounts ORDER BY code').all(); }
const accountName = (db, code) => (db.prepare('SELECT name FROM accounts WHERE code = ?').get(code) || { name: '' }).name;

/** Saldos por cuenta (y opcionalmente por tercero): inicial antes de `from`, movimientos en el rango, saldo final. */
function leafBalances(db, from, to, byThird = false) {
  const g = byThird ? ', COALESCE(l.third_doc, \'\'), COALESCE(l.third_name, \'\')' : '';
  return db.prepare(`
    SELECT l.account_code AS code${byThird ? ", COALESCE(l.third_doc, '') AS thirdDoc, COALESCE(l.third_name, '') AS thirdName" : ''},
           COALESCE(SUM(CASE WHEN e.date < ? THEN l.debit - l.credit ELSE 0 END), 0) AS opening,
           COALESCE(SUM(CASE WHEN e.date >= ? AND e.date <= ? THEN l.debit ELSE 0 END), 0) AS debits,
           COALESCE(SUM(CASE WHEN e.date >= ? AND e.date <= ? THEN l.credit ELSE 0 END), 0) AS credits
    FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id
    WHERE e.status = 'posted' AND e.date <= ?
    GROUP BY l.account_code${g}
    ORDER BY l.account_code
  `).all(from, from, to, from, to, to);
}

function trialBalance(db, { from, to, level = 6, byThird = false }) {
  const lvl = [1, 2, 4, 6, 8].includes(Number(level)) ? Number(level) : 6;
  const names = Object.fromEntries(accounts(db).map(a => [a.code, a]));
  const leaves = leafBalances(db, from, to, byThird);
  const agg = new Map();
  for (const r of leaves) {
    const code = r.code.length > lvl ? r.code.slice(0, lvl) : r.code;
    const key = byThird ? `${code}|${r.thirdDoc}|${r.thirdName}` : code;
    const cur = agg.get(key) || { code, name: (names[code] || names[r.code] || { name: r.code }).name, nature: (names[code] || { nature: 'D' }).nature, thirdDoc: r.thirdDoc, thirdName: r.thirdName, opening: 0, debits: 0, credits: 0 };
    cur.opening += r.opening; cur.debits += r.debits; cur.credits += r.credits;
    agg.set(key, cur);
  }
  const rows = [...agg.values()].map(r => ({ ...r, closing: r.opening + r.debits - r.credits })).filter(r => r.opening || r.debits || r.credits).sort((a, b) => a.code.localeCompare(b.code) || String(a.thirdName || '').localeCompare(String(b.thirdName || '')));
  const totals = rows.reduce((a, r) => ({ opening: a.opening + r.opening, debits: a.debits + r.debits, credits: a.credits + r.credits, closing: a.closing + r.closing }), { opening: 0, debits: 0, credits: 0, closing: 0 });
  return { from, to, level: lvl, byThird, rows, totals, balanced: totals.debits === totals.credits && totals.closing === 0 };
}

/** Libro auxiliar de un rango de cuentas (desde – hasta): una sección por cuenta con saldo inicial, movimientos y saldo final. */
function ledgerRange(db, { codeFrom, codeTo, from, to, thirdDoc }) {
  const lo = String(codeFrom), hi = String(codeTo) + '99999999';
  const t = thirdDoc ? " AND COALESCE(l.third_doc, '') = ?" : '';
  const tp = thirdDoc ? [thirdDoc] : [];
  const codes = db.prepare(`SELECT DISTINCT l.account_code AS code FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id WHERE e.status = 'posted' AND l.account_code >= ? AND l.account_code <= ? AND e.date <= ?${t} ORDER BY l.account_code`).all(lo, hi, to, ...tp).map(r => r.code);
  const accountsOut = [];
  for (const c of codes) {
    const opening = db.prepare(`SELECT COALESCE(SUM(l.debit - l.credit), 0) AS s FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id WHERE e.status = 'posted' AND l.account_code = ? AND e.date < ?${t}`).get(c, from, ...tp).s;
    const lines = db.prepare(`SELECT e.id AS entryId, e.number, e.date, e.source, e.description AS entryDescription, l.account_code AS code, l.debit, l.credit, l.third_doc AS thirdDoc, l.third_name AS thirdName, l.description, l.doc_ref AS docRef
      FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id WHERE e.status = 'posted' AND l.account_code = ? AND e.date >= ? AND e.date <= ?${t} ORDER BY e.date, e.id, l.id`).all(c, from, to, ...tp);
    if (!opening && !lines.length) continue;
    let bal = opening;
    const rows = lines.map(l => { bal += l.debit - l.credit; return { ...l, balance: bal }; });
    accountsOut.push({ code: c, name: accountName(db, c), opening, rows, closing: bal, debits: rows.reduce((a, r) => a + r.debit, 0), credits: rows.reduce((a, r) => a + r.credit, 0) });
  }
  const totals = accountsOut.reduce((a, x) => ({ opening: a.opening + x.opening, debits: a.debits + x.debits, credits: a.credits + x.credits, closing: a.closing + x.closing }), { opening: 0, debits: 0, credits: 0, closing: 0 });
  return { codeFrom: lo, codeTo: String(codeTo), from, to, accounts: accountsOut, totals };
}

function ledgerAccount(db, { code, from, to, thirdDoc }) {
  const like = `${code}%`;
  const params = [like, from];
  let thirdSql = '';
  if (thirdDoc) { thirdSql = ' AND COALESCE(l.third_doc, \'\') = ?'; }
  const opening = db.prepare(`SELECT COALESCE(SUM(l.debit - l.credit), 0) AS s FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id WHERE e.status = 'posted' AND l.account_code LIKE ? AND e.date < ?${thirdSql}`).get(...params, ...(thirdDoc ? [thirdDoc] : [])).s;
  const lines = db.prepare(`SELECT e.id AS entryId, e.number, e.date, e.source, e.description AS entryDescription, l.account_code AS code, l.debit, l.credit, l.third_doc AS thirdDoc, l.third_name AS thirdName, l.description, l.doc_ref AS docRef
    FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id WHERE e.status = 'posted' AND l.account_code LIKE ? AND e.date >= ? AND e.date <= ?${thirdSql} ORDER BY e.date, e.id, l.id`).all(like, from, to, ...(thirdDoc ? [thirdDoc] : []));
  let bal = opening;
  const rows = lines.map(l => { bal += l.debit - l.credit; return { ...l, balance: bal }; });
  return { code, name: accountName(db, code), from, to, opening, rows, closing: bal, debits: rows.reduce((a, r) => a + r.debit, 0), credits: rows.reduce((a, r) => a + r.credit, 0) };
}

function groupRows(db, leaves, filterFn, level = 4) {
  const names = Object.fromEntries(accounts(db).map(a => [a.code, a.name]));
  const groups = new Map();
  for (const r of leaves) {
    if (!filterFn(r.code)) continue;
    const g = r.code.slice(0, level);
    const cur = groups.get(g) || { code: g, name: names[g] || g, balance: 0, accounts: new Map() };
    const sub = r.code.length >= 6 ? r.code.slice(0, 6) : r.code;
    const subCur = cur.accounts.get(sub) || { code: sub, name: names[sub] || names[r.code] || sub, balance: 0 };
    subCur.balance += r.net; cur.balance += r.net;
    cur.accounts.set(sub, subCur);
    groups.set(g, cur);
  }
  return [...groups.values()].map(g => ({ ...g, accounts: [...g.accounts.values()].filter(a => a.balance !== 0) })).filter(g => g.balance !== 0 || g.accounts.length);
}

/** Estado de situación financiera a una fecha. Los resultados (4, 5, 6, 7) se muestran como utilidad del ejercicio y acumulada. */
function balanceSheet(db, { date, fiscalYearStart }) {
  const fyStart = fiscalYearStart || `${date.slice(0, 4)}-01-01`;
  const rows = db.prepare(`SELECT l.account_code AS code, COALESCE(SUM(l.debit - l.credit), 0) AS net,
      COALESCE(SUM(CASE WHEN e.date < ? THEN l.debit - l.credit ELSE 0 END), 0) AS netBefore
    FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id WHERE e.status = 'posted' AND e.date <= ? GROUP BY l.account_code`).all(fyStart, date);
  const isResult = c => ['4', '5', '6', '7'].includes(c[0]);
  const assets = groupRows(db, rows, c => c[0] === '1');
  const liabilities = groupRows(db, rows.map(r => ({ ...r, net: -r.net })), c => c[0] === '2');
  const equity = groupRows(db, rows.map(r => ({ ...r, net: -r.net })), c => c[0] === '3');
  const resultYear = rows.filter(r => isResult(r.code)).reduce((a, r) => a - (r.net - r.netBefore), 0); // crédito positivo = utilidad
  const resultPrior = rows.filter(r => isResult(r.code)).reduce((a, r) => a - r.netBefore, 0);
  const totalAssets = assets.reduce((a, g) => a + g.balance, 0);
  const totalLiabilities = liabilities.reduce((a, g) => a + g.balance, 0);
  const equityAccounts = equity.reduce((a, g) => a + g.balance, 0);
  const totalEquity = equityAccounts + resultYear + resultPrior;
  return { date, fiscalYearStart: fyStart, assets, liabilities, equity, resultYear, resultPrior, totalAssets, totalLiabilities, equityAccounts, totalEquity, balanced: totalAssets === totalLiabilities + totalEquity };
}

/** Estado de resultados contable (clases 4, 5, 6 y 7) por grupo y cuenta. */
function incomeStatementLedger(db, { from, to }) {
  const rows = db.prepare(`SELECT l.account_code AS code, COALESCE(SUM(l.credit - l.debit), 0) AS net
    FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id WHERE e.status = 'posted' AND e.date >= ? AND e.date <= ? GROUP BY l.account_code`).all(from, to);
  const income = groupRows(db, rows, c => c[0] === '4');
  const costs = groupRows(db, rows.map(r => ({ ...r, net: -r.net })), c => c[0] === '6' || c[0] === '7');
  const expenses = groupRows(db, rows.map(r => ({ ...r, net: -r.net })), c => c[0] === '5' && c.slice(0, 2) !== '54');
  const incomeTax = rows.filter(r => r.code.startsWith('54')).reduce((a, r) => a - r.net, 0);
  const totalIncome = income.reduce((a, g) => a + g.balance, 0), totalCosts = costs.reduce((a, g) => a + g.balance, 0), totalExpenses = expenses.reduce((a, g) => a + g.balance, 0);
  const grossProfit = totalIncome - totalCosts, beforeTax = grossProfit - totalExpenses, net = beforeTax - incomeTax;
  return { from, to, income, costs, expenses, totalIncome, totalCosts, totalExpenses, grossProfit, beforeTax, incomeTax, net };
}

/* ---------- cartera ---------- */
const bucketOf = days => (days <= 0 ? 'current' : days <= 30 ? 'd30' : days <= 60 ? 'd60' : days <= 90 ? 'd90' : 'd90plus');
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

function agingReceivables(db, { date, thirdDoc }) {
  const t = date || today(db);
  const orders = db.prepare(`SELECT o.id, o.created_at, o.customer_name, o.customer_doc, o.customer_id, o.customer_phone, o.channel, o.payment_method, o.total, o.tip, o.type, c.credit_days AS creditDays,
      COALESCE((SELECT SUM(amount) FROM order_payments p WHERE p.order_id = o.id), 0) AS paid
    FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
    WHERE o.status = 'delivered' AND (COALESCE(o.payment_status, 'paid') != 'paid' OR o.payment_method = 'platform') AND date(o.created_at) <= ?`).all(t);
  const docs = [];
  for (const o of orders) {
    const total = (o.total || 0) + (o.tip || 0);
    const balance = total - o.paid;
    if (balance <= 0) continue;
    if (o.payment_method === 'platform' && o.paid === 0 && false) continue;
    const third = o.payment_method === 'platform' ? { doc: o.channel || 'platform', name: PLATFORM_NAME[o.channel] || 'Plataforma de domicilios', type: 'platform' } : { doc: o.customer_doc || '222222222222', name: o.customer_name, type: 'customer', id: o.customer_id };
    if (thirdDoc && third.doc !== thirdDoc) continue;
    const issued = String(o.created_at).slice(0, 10);
    const due = addDays(issued, o.payment_method === 'platform' ? 15 : (o.creditDays || 30));
    const overdueDays = daysBetween(due, t);
    docs.push({ id: o.id, doc: `Pedido #${o.id}`, date: issued, dueDate: due, third, total, paid: o.paid, balance, overdueDays, bucket: bucketOf(overdueDays), phone: o.customer_phone || '' });
  }
  return summarizeAging(docs, t);
}

function agingPayables(db, { date, thirdDoc }) {
  const t = date || today(db);
  const rows = db.prepare(`SELECT e.*, s.name AS supplierName, s.nit AS supplierNit, c.name AS categoryName FROM expenses e LEFT JOIN suppliers s ON s.id = e.supplier_id JOIN expense_categories c ON c.id = e.category_id
    WHERE e.date <= ? AND (e.amount - COALESCE(e.retention, 0) - COALESCE(e.paid_amount, 0)) > 0 AND e.status != 'paid'`).all(t);
  const docs = [];
  for (const e of rows) {
    const third = { doc: e.supplierNit || '', name: e.supplierName || 'Sin proveedor', type: 'supplier', id: e.supplier_id || null };
    if (thirdDoc && third.doc !== thirdDoc) continue;
    const balance = e.amount - (e.retention || 0) - (e.paid_amount || 0);
    const due = e.due_date || e.date;
    const overdueDays = daysBetween(due, t);
    docs.push({ id: e.id, doc: e.invoice_number ? `Fact. ${e.invoice_number}` : `Gasto #${e.id}`, description: e.description, category: e.categoryName, date: e.date, dueDate: due, third, total: e.amount - (e.retention || 0), paid: e.paid_amount || 0, balance, overdueDays, bucket: bucketOf(overdueDays) });
  }
  return summarizeAging(docs, t);
}

function summarizeAging(docs, date) {
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };
  const byThird = new Map();
  for (const d of docs) {
    buckets[d.bucket] += d.balance;
    const key = `${d.third.doc}|${d.third.name}`;
    const cur = byThird.get(key) || { doc: d.third.doc, name: d.third.name, type: d.third.type, id: d.third.id || null, phone: d.phone || '', count: 0, balance: 0, overdue: 0, current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0, oldestDue: null, documents: [] };
    cur.count++; cur.balance += d.balance; cur[d.bucket] += d.balance; if (d.overdueDays > 0) cur.overdue += d.balance;
    if (!cur.oldestDue || d.dueDate < cur.oldestDue) cur.oldestDue = d.dueDate;
    cur.documents.push(d);
    byThird.set(key, cur);
  }
  const thirds = [...byThird.values()].sort((a, b) => b.balance - a.balance).map(x => ({ ...x, documents: x.documents.sort((a, b) => a.dueDate.localeCompare(b.dueDate)) }));
  return { date, total: docs.reduce((a, d) => a + d.balance, 0), overdue: docs.filter(d => d.overdueDays > 0).reduce((a, d) => a + d.balance, 0), dueSoon: docs.filter(d => d.overdueDays <= 0 && d.overdueDays >= -7).reduce((a, d) => a + d.balance, 0), buckets, thirds, count: docs.length };
}

/* ---------- terceros (información exógena) ---------- */
function thirdPartiesReport(db, { from, to }) {
  const sup = db.prepare(`SELECT s.*, COALESCE(SUM(e.amount), 0) AS purchases, COALESCE(SUM(e.tax_amount), 0) AS iva, COALESCE(SUM(e.retention), 0) AS retention, COUNT(e.id) AS docs
    FROM suppliers s LEFT JOIN expenses e ON e.supplier_id = s.id AND e.date BETWEEN ? AND ? GROUP BY s.id ORDER BY purchases DESC`).all(from, to);
  const cus = db.prepare(`SELECT c.*, COALESCE(SUM(o.total), 0) AS sales, COUNT(o.id) AS docs FROM customers c
    LEFT JOIN orders o ON (o.customer_id = c.id OR (o.customer_doc = c.document_id AND c.document_id != '222222222222')) AND o.status NOT IN ('open', 'cancelled') AND date(o.created_at) BETWEEN ? AND ?
    WHERE c.document_id != '222222222222' OR c.phone != '' GROUP BY c.id ORDER BY sales DESC`).all(from, to);
  const emp = db.prepare(`SELECT e.id, e.name, e.document, e.phone, e.email, e.position, COALESCE(SUM(s.total), 0) AS payroll, COALESCE(SUM(s.legal_deductions_total), 0) AS legalDeductions, COUNT(s.id) AS settlements
    FROM employees e LEFT JOIN payroll_settlements s ON s.employee_id = e.id AND s.status = 'paid' AND date(s.paid_at) BETWEEN ? AND ? GROUP BY e.id ORDER BY payroll DESC`).all(from, to);
  const mapT = r => ({ id: r.id, name: r.name, legalName: r.legal_name || '', docType: r.doc_type || (r.is_company ? 'NIT' : ''), doc: r.nit || r.document_id || '', dv: r.dv || '', personType: r.person_type || '', address: r.address || '', city: r.city || '', state: r.state || '', country: r.country || 'Colombia', postalCode: r.postal_code || '', phone: r.phone || '', email: r.email || '', ciiu: r.ciiu || '', ivaResponsible: Boolean(r.iva_responsible), regime: r.regime || '' });
  return {
    from, to,
    suppliers: sup.map(r => ({ ...mapT(r), purchases: r.purchases, iva: r.iva, retention: r.retention, docs: r.docs, base: r.purchases - r.iva, complete: Boolean(r.nit && r.address && r.city && r.email && r.ciiu) })),
    customers: cus.map(r => ({ ...mapT(r), sales: r.sales, docs: r.docs, complete: Boolean(r.document_id && r.document_id !== '222222222222' && r.address && r.city) })),
    employees: emp.map(r => ({ id: r.id, name: r.name, doc: r.document || '', phone: r.phone || '', email: r.email || '', position: r.position, payroll: r.payroll, legalDeductions: r.legalDeductions, settlements: r.settlements })),
  };
}

module.exports = { postEntry, voidEntry, postedEntry, syncLedger, syncOnWrite, rebuildLedger, accounts, trialBalance, ledgerAccount, ledgerRange, balanceSheet, incomeStatementLedger, agingReceivables, agingPayables, thirdPartiesReport, SOURCE_LABEL, PREFIX };
