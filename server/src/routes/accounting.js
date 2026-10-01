/**
 * Contabilidad: plan de cuentas, parametrización, libro diario (asientos automáticos y manuales), balances,
 * estado de situación financiera, estado de resultados contable, cartera por tercero y terceros para exógena.
 */
const { Router } = require('express');
const { getDb } = require('../db');
const { requireRole } = require('../auth');
const L = require('../ledger');
const { readAcctMap, readAcctOptions, saveAcctConfig, DEFAULT_MAP } = require('../accountingSchema');
const { today, isDate } = require('../cashHelpers');
const { levelOf, parentOf, natureOf } = require('../puc');

const router = Router();
router.use(requireRole('admin'));

const MAP_LABELS = {
  cash: 'Efectivo (caja)', bank: 'Banco principal (datáfono y consignaciones)', transfer: 'Transferencias / Nequi / Daviplata', card: 'Recaudo de tarjetas (datáfono)',
  customerReceivable: 'Clientes a crédito (cartera)', platformReceivable: 'Plataformas de domicilios por cobrar', salesIncome: 'Ingreso por ventas', deliveryIncome: 'Ingreso por costo de envío',
  salesTaxINC: 'INC generado por pagar', salesTaxIVA: 'IVA generado por pagar', tipsPayable: 'Propinas por pagar al personal', supplierPayable: 'Proveedores (compras a crédito)',
  expensePayable: 'Gastos por pagar sin proveedor', purchaseIVA: 'IVA descontable en compras', retentionPayable: 'Retención en la fuente por pagar', payrollExpense: 'Sueldos',
  payrollExtras: 'Horas extras y recargos', payrollAllowance: 'Auxilio de transporte', payrollBonus: 'Bonificaciones', payrollHealth: 'Salud retenida al trabajador', payrollPension: 'Pensión retenida al trabajador',
  payrollPayable: 'Nómina por pagar', employeeAdvances: 'Anticipos y préstamos a empleados', cashShortage: 'Faltantes de caja', cashOverage: 'Sobrantes de caja',
  cashDepositSource: 'Origen del efectivo que entra a caja', cashWithdrawalOther: 'Retiros de caja sin soporte', inventory: 'Inventario (método permanente)', cogs: 'Costo de ventas (método permanente)',
  purchases: 'Compras (método periódico)', ownerEquity: 'Capital del propietario', retainedEarnings: 'Utilidades acumuladas', currentEarnings: 'Utilidad del ejercicio',
};
const range = (req) => {
  const db = getDb();
  const t = today(db);
  const from = isDate(req.query.from) ? req.query.from : `${t.slice(0, 7)}-01`;
  const to = isDate(req.query.to) ? req.query.to : t;
  return { from, to, t };
};

/* ---------- configuración ---------- */
router.get('/config', (req, res) => {
  const db = getDb();
  const map = readAcctMap(db);
  const accounts = Object.fromEntries(L.accounts(db).map(a => [a.code, a.name]));
  res.json({
    map, labels: MAP_LABELS, defaults: DEFAULT_MAP, ...readAcctOptions(db),
    mapDetail: Object.keys(DEFAULT_MAP).map(k => ({ key: k, label: MAP_LABELS[k] || k, code: map[k], name: accounts[map[k]] || '(cuenta no existe)' })),
    categories: db.prepare('SELECT id, name, emoji, kind, pl_group AS plGroup, account_code AS accountCode FROM expense_categories ORDER BY sort_order, name').all().map(c => ({ ...c, accountName: accounts[c.accountCode] || '' })),
  });
});
router.put('/config', (req, res) => {
  const db = getDb();
  try {
    const out = saveAcctConfig(db, req.body || {});
    if (Array.isArray(req.body.categories)) {
      const up = db.prepare('UPDATE expense_categories SET account_code = ? WHERE id = ?');
      for (const c of req.body.categories) {
        const code = String(c.accountCode || '').trim();
        if (!/^\d{4,8}$/.test(code) || !db.prepare('SELECT code FROM accounts WHERE code = ? AND active = 1').get(code)) return res.status(400).json({ error: `Cuenta inválida para la categoría ${c.id}: ${code}` });
        up.run(code, Number(c.id));
      }
    }
    res.json(out);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

/* ---------- plan de cuentas ---------- */
router.get('/accounts', (req, res) => {
  const db = getDb();
  const all = req.query.all === '1';
  const used = Object.fromEntries(db.prepare('SELECT account_code AS code, COUNT(*) AS n FROM journal_lines GROUP BY account_code').all().map(r => [r.code, r.n]));
  res.json(L.accounts(db).filter(a => all || a.active).map(a => ({ ...a, active: Boolean(a.active), isSystem: Boolean(a.isSystem), used: used[a.code] || 0 })));
});
router.post('/accounts', (req, res) => {
  const db = getDb();
  const code = String(req.body.code || '').trim();
  const name = String(req.body.name || '').trim();
  if (!/^\d{2}$|^\d{4}$|^\d{6}$|^\d{8}$/.test(code)) return res.status(400).json({ error: 'El código debe tener 2, 4, 6 u 8 dígitos (grupo, cuenta, subcuenta o auxiliar)' });
  if (name.length < 2) return res.status(400).json({ error: 'El nombre es requerido' });
  if (db.prepare('SELECT code FROM accounts WHERE code = ?').get(code)) return res.status(409).json({ error: 'Ya existe una cuenta con ese código' });
  const parent = parentOf(code);
  if (parent && !db.prepare('SELECT code FROM accounts WHERE code = ?').get(parent)) return res.status(400).json({ error: `Primero crea la cuenta superior ${parent}` });
  const nature = ['D', 'C'].includes(req.body.nature) ? req.body.nature : natureOf(code);
  db.prepare('INSERT INTO accounts (code, name, level, parent_code, nature, is_system) VALUES (?, ?, ?, ?, ?, 0)').run(code, name, levelOf(code), parent, nature);
  res.status(201).json({ code, name, level: levelOf(code), parentCode: parent, nature, active: true, isSystem: false, used: 0 });
});
router.put('/accounts/:code', (req, res) => {
  const db = getDb();
  const cur = db.prepare('SELECT * FROM accounts WHERE code = ?').get(req.params.code);
  if (!cur) return res.status(404).json({ error: 'Cuenta no encontrada' });
  const name = req.body.name !== undefined ? String(req.body.name).trim() : cur.name;
  if (name.length < 2) return res.status(400).json({ error: 'El nombre es requerido' });
  const active = req.body.active !== undefined ? (req.body.active ? 1 : 0) : cur.active;
  const nature = ['D', 'C'].includes(req.body.nature) ? req.body.nature : cur.nature;
  db.prepare('UPDATE accounts SET name = ?, active = ?, nature = ? WHERE code = ?').run(name, active, nature, cur.code);
  res.json({ ...cur, name, active: Boolean(active), nature });
});
router.delete('/accounts/:code', (req, res) => {
  const db = getDb();
  const cur = db.prepare('SELECT * FROM accounts WHERE code = ?').get(req.params.code);
  if (!cur) return res.status(404).json({ error: 'Cuenta no encontrada' });
  const used = db.prepare('SELECT COUNT(*) AS n FROM journal_lines WHERE account_code = ?').get(cur.code).n;
  const children = db.prepare('SELECT COUNT(*) AS n FROM accounts WHERE parent_code = ?').get(cur.code).n;
  if (used || children || cur.is_system) { db.prepare('UPDATE accounts SET active = 0 WHERE code = ?').run(cur.code); return res.json({ ok: true, deactivated: true }); }
  db.prepare('DELETE FROM accounts WHERE code = ?').run(cur.code);
  res.json({ ok: true, deleted: true });
});

/* ---------- libro diario ---------- */
router.get('/entries', (req, res) => {
  const db = getDb();
  L.syncLedger(db);
  const { from, to } = range(req);
  const limit = Math.min(Number(req.query.limit) || 300, 2000);
  let sql = 'SELECT * FROM journal_entries WHERE date >= ? AND date <= ?';
  const params = [from, to];
  if (req.query.source) { sql += ' AND source = ?'; params.push(String(req.query.source)); }
  if (req.query.status === 'void') sql += " AND status = 'void'"; else if (req.query.status !== 'all') sql += " AND status = 'posted'";
  if (req.query.search) { sql += ' AND (LOWER(description) LIKE ? OR number LIKE ? OR CAST(source_id AS TEXT) = ?)'; const s = `%${String(req.query.search).toLowerCase()}%`; params.push(s, `%${req.query.search}%`, String(req.query.search)); }
  sql += ' ORDER BY date DESC, id DESC LIMIT ?'; params.push(limit);
  const entries = db.prepare(sql).all(...params);
  const names = Object.fromEntries(L.accounts(db).map(a => [a.code, a.name]));
  const lines = entries.length ? db.prepare(`SELECT * FROM journal_lines WHERE entry_id IN (${entries.map(() => '?').join(',')}) ORDER BY id`).all(...entries.map(e => e.id)) : [];
  const byEntry = new Map();
  for (const l of lines) byEntry.set(l.entry_id, [...(byEntry.get(l.entry_id) || []), { id: l.id, account: l.account_code, accountName: names[l.account_code] || '', debit: l.debit, credit: l.credit, thirdType: l.third_type, thirdDoc: l.third_doc, thirdName: l.third_name, description: l.description, docRef: l.doc_ref }]);
  res.json({ from, to, entries: entries.map(e => ({ id: e.id, number: e.number, date: e.date, source: e.source, sourceLabel: L.SOURCE_LABEL[e.source] || e.source, sourceId: e.source_id, description: e.description, status: e.status, createdBy: e.created_by, voidReason: e.void_reason, lines: byEntry.get(e.id) || [], total: (byEntry.get(e.id) || []).reduce((a, l) => a + l.debit, 0) })) });
});
router.post('/entries', (req, res) => {
  const db = getDb();
  const date = isDate(req.body.date) ? req.body.date : today(db);
  const lines = (Array.isArray(req.body.lines) ? req.body.lines : []).map(l => ({
    account: String(l.account || '').trim(), debit: Math.round(Number(l.debit) || 0), credit: Math.round(Number(l.credit) || 0),
    third: l.thirdDoc || l.thirdName ? { type: l.thirdType || 'other', id: l.thirdId || null, doc: l.thirdDoc || '', name: l.thirdName || '' } : null, description: l.description || '',
  })).filter(l => l.account);
  if (lines.length < 2) return res.status(400).json({ error: 'Un asiento necesita al menos dos líneas' });
  for (const l of lines) {
    if (l.debit > 0 && l.credit > 0) return res.status(400).json({ error: `La cuenta ${l.account} no puede tener débito y crédito en la misma línea` });
    if (l.account.length < 6) return res.status(400).json({ error: `Usa subcuentas o auxiliares (6 u 8 dígitos) para registrar movimientos: ${l.account}` });
  }
  try {
    const id = L.postEntry(db, { date, source: 'manual', sourceId: null, description: String(req.body.description || 'Comprobante de contabilidad'), lines, createdBy: req.user?.name || '' });
    res.status(201).json({ id, ...db.prepare('SELECT number, date, description FROM journal_entries WHERE id = ?').get(id) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/entries/:id/void', (req, res) => {
  const db = getDb();
  const e = db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(Number(req.params.id));
  if (!e) return res.status(404).json({ error: 'Asiento no encontrado' });
  if (e.source !== 'manual') return res.status(400).json({ error: 'Los asientos automáticos se anulan anulando el documento que los originó (pedido, gasto, pago)' });
  L.voidEntry(db, e.id, req.body.reason || 'Anulado manualmente');
  res.json({ ok: true });
});
router.post('/sync', (req, res) => res.json(L.syncLedger(getDb())));
router.post('/rebuild', (req, res) => {
  const db = getDb();
  const t = today(db);
  const from = isDate(req.body.from) ? req.body.from : '2000-01-01';
  const to = isDate(req.body.to) ? req.body.to : t;
  res.json(L.rebuildLedger(db, from, to));
});

/* ---------- informes ---------- */
router.get('/trial-balance', (req, res) => { const db = getDb(); L.syncLedger(db); const { from, to } = range(req); res.json(L.trialBalance(db, { from, to, level: Number(req.query.level) || 6, byThird: req.query.third === '1' })); });
router.get('/ledger', (req, res) => {
  const db = getDb(); L.syncLedger(db);
  const { from, to } = range(req);
  const code = String(req.query.code || '').trim();
  if (!/^\d{1,8}$/.test(code)) return res.status(400).json({ error: 'Indica el código de la cuenta' });
  res.json(L.ledgerAccount(db, { code, from, to, thirdDoc: req.query.third ? String(req.query.third) : undefined }));
});
router.get('/balance-sheet', (req, res) => { const db = getDb(); L.syncLedger(db); const { t } = range(req); const date = isDate(req.query.date) ? req.query.date : t; res.json(L.balanceSheet(db, { date, fiscalYearStart: isDate(req.query.fiscalYearStart) ? req.query.fiscalYearStart : undefined })); });
router.get('/income-statement', (req, res) => { const db = getDb(); L.syncLedger(db); const { from, to } = range(req); res.json(L.incomeStatementLedger(db, { from, to })); });
router.get('/receivables', (req, res) => { const db = getDb(); const { t } = range(req); res.json(L.agingReceivables(db, { date: isDate(req.query.date) ? req.query.date : t, thirdDoc: req.query.third ? String(req.query.third) : undefined })); });
router.get('/payables', (req, res) => { const db = getDb(); const { t } = range(req); res.json(L.agingPayables(db, { date: isDate(req.query.date) ? req.query.date : t, thirdDoc: req.query.third ? String(req.query.third) : undefined })); });
router.get('/third-parties', (req, res) => { const db = getDb(); const { from, to } = range(req); res.json(L.thirdPartiesReport(db, { from, to })); });
router.get('/summary', (req, res) => {
  const db = getDb();
  const sync = L.syncLedger(db);
  const { from, to } = range(req);
  const tb = L.trialBalance(db, { from, to, level: 1 });
  const entries = db.prepare("SELECT COUNT(*) AS n FROM journal_entries WHERE status = 'posted' AND date >= ? AND date <= ?").get(from, to).n;
  const manual = db.prepare("SELECT COUNT(*) AS n FROM journal_entries WHERE status = 'posted' AND source = 'manual' AND date >= ? AND date <= ?").get(from, to).n;
  res.json({ from, to, entries, manual, balanced: tb.balanced, debits: tb.totals.debits, credits: tb.totals.credits, syncErrors: sync.errors, receivables: L.agingReceivables(db, { date: to }).total, payables: L.agingPayables(db, { date: to }).total });
});

module.exports = router;
