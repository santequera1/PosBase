/**
 * Impresión en red propia (reemplaza servicios como PrintNode).
 *
 *  Servidor (aquí): impresoras registradas con su IP, cola de trabajos y plantillas ESC/POS
 *  (comanda por estación, precuenta, recibo, reporte de caja y página de prueba).
 *
 *  Agente (server/agent/agente-impresion.ps1): corre en un computador Windows del restaurante, en la misma red
 *  de las impresoras. Pregunta al servidor si hay trabajos (consulta larga por HTTPS, sin abrir puertos) y los
 *  envía a cada impresora por TCP (IP:9100). También informa si cada impresora responde y puede buscar
 *  impresoras en la red.
 *
 *  Así un mesero que envía la comanda desde el celular hace que salga en la impresora de cocina o de barra.
 */
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { Ticket, money } = require('./escpos');

const bus = new EventEmitter();
bus.setMaxListeners(50);
const ROLES = ['cocina', 'barra', 'caja'];
const ROLE_LABEL = { cocina: 'Cocina', barra: 'Barra', caja: 'Caja (recibos y precuentas)' };

function hasCol(db, table, col) { return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col); }

function initPrintingSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS printers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      ip TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 9100,
      roles TEXT NOT NULL DEFAULT '[]',
      paper INTEGER NOT NULL DEFAULT 80,
      codepage TEXT NOT NULL DEFAULT 'cp850',
      copies INTEGER NOT NULL DEFAULT 1,
      drawer INTEGER NOT NULL DEFAULT 0,
      beep INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      online INTEGER,
      checked_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-5 hours'))
    );
    CREATE TABLE IF NOT EXISTS print_agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      last_seen TEXT,
      info TEXT,
      scan_requested INTEGER DEFAULT 0,
      scan_result TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-5 hours'))
    );
    CREATE TABLE IF NOT EXISTS print_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      printer_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      title TEXT DEFAULT '',
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      agent_id INTEGER,
      order_id INTEGER,
      created_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-5 hours')),
      claimed_at TEXT,
      done_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_print_jobs_status ON print_jobs(status, id);
  `);
  if (!hasCol(db, 'printers', 'beep')) db.exec('ALTER TABLE printers ADD COLUMN beep INTEGER NOT NULL DEFAULT 0');
}

/* ---------------- configuración ---------------- */
const readSetting = (db, k) => { const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(k); return r ? r.value : undefined; };
/** 'browser' = se imprime desde el navegador (diálogo de impresión) · 'agent' = por red con el agente. */
function printMode(db) { return readSetting(db, 'printMode') === 'agent' ? 'agent' : 'browser'; }
function biz(db) {
  const g = k => readSetting(db, k) || '';
  return { name: g('businessName') || 'Mi Negocio', slogan: g('businessSlogan'), address: g('businessAddress'), phone: g('businessPhone'), nit: g('businessNit'), hours: g('businessHours'),
    prefix: g('invoicePrefix') || 'POS', taxType: g('taxType') || 'none', taxRate: Number(g('taxRate')) || 0, footer: g('receiptFooter') };
}

const mapPrinter = r => {
  let roles = []; try { roles = JSON.parse(r.roles || '[]'); } catch { roles = []; }
  return { id: r.id, name: r.name, ip: r.ip, port: r.port, roles, paper: r.paper, codepage: r.codepage, copies: r.copies, drawer: Boolean(r.drawer), beep: Boolean(r.beep), active: Boolean(r.active),
    online: r.online === null || r.online === undefined ? null : Boolean(r.online), checkedAt: r.checked_at || null };
};
const listPrinters = db => db.prepare('SELECT * FROM printers ORDER BY id').all().map(mapPrinter);
const printersFor = (db, role) => listPrinters(db).filter(p => p.active && p.roles.includes(role));
const ticketFor = p => new Ticket({ width: p.paper === 58 ? 32 : 48, codepage: p.codepage });

/* ---------------- cola ---------------- */
function enqueue(db, printer, kind, title, buf, { orderId = null, user = '' } = {}) {
  const copies = Math.min(3, Math.max(1, printer.copies || 1));
  const ids = [];
  for (let c = 0; c < copies; c++) {
    const info = db.prepare('INSERT INTO print_jobs (printer_id, kind, title, payload, order_id, created_by) VALUES (?, ?, ?, ?, ?, ?)')
      .run(printer.id, kind, String(title).slice(0, 80), buf.toString('base64'), orderId, user || '');
    ids.push(Number(info.lastInsertRowid));
  }
  bus.emit('job');
  return ids;
}

/** Trabajos pendientes para el agente (o reintentos de trabajos reclamados hace más de 60 s sin respuesta). */
function claimJobs(db, agentId, limit = 10) {
  const rows = db.prepare(`SELECT j.id, j.kind, j.title, j.payload, p.ip, p.port, p.name AS printer FROM print_jobs j JOIN printers p ON p.id = j.printer_id
    WHERE p.active = 1 AND (j.status = 'pending' OR (j.status = 'sent' AND j.claimed_at < datetime('now', '-5 hours', '-60 seconds') AND j.attempts < 4))
    ORDER BY j.id LIMIT ?`).all(limit);
  const upd = db.prepare("UPDATE print_jobs SET status = 'sent', claimed_at = datetime('now', '-5 hours'), attempts = attempts + 1, agent_id = ? WHERE id = ?");
  for (const r of rows) upd.run(agentId, r.id);
  return rows;
}

function finishJob(db, id, ok, error) {
  db.prepare(`UPDATE print_jobs SET status = ?, error = ?, done_at = datetime('now', '-5 hours') WHERE id = ?`).run(ok ? 'done' : 'error', ok ? null : String(error || 'Error').slice(0, 200), id);
}

/* ---------------- agentes ---------------- */
const hashToken = t => crypto.createHash('sha256').update(String(t)).digest('hex');
function createAgent(db, name) {
  const token = crypto.randomBytes(24).toString('hex');
  const info = db.prepare('INSERT INTO print_agents (name, token_hash) VALUES (?, ?)').run(String(name || 'Computador de la caja').slice(0, 60), hashToken(token));
  return { id: Number(info.lastInsertRowid), token };
}
function agentByToken(db, token) {
  if (!token || String(token).length < 20) return null;
  return db.prepare('SELECT * FROM print_agents WHERE token_hash = ? AND active = 1').get(hashToken(token)) || null;
}
function listAgents(db) {
  return db.prepare("SELECT id, name, last_seen AS lastSeen, info, scan_requested AS scanRequested, scan_result AS scanResult, created_at AS createdAt, (last_seen > datetime('now', '-5 hours', '-75 seconds')) AS online FROM print_agents WHERE active = 1 ORDER BY id")
    .all().map(a => { let info = null, scan = null; try { info = a.info ? JSON.parse(a.info) : null; } catch { info = null; } try { scan = a.scanResult ? JSON.parse(a.scanResult) : null; } catch { scan = null; } return { ...a, info, scanResult: scan, online: Boolean(a.online), scanRequested: Boolean(a.scanRequested) }; });
}

/* ---------------- plantillas ---------------- */
const STATION_TITLE = { cocina: 'COCINA', barra: 'BARRA' };
const fmtDateTime = ts => { const s = String(ts || ''); return s.length >= 16 ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11, 16)}` : s; };
const orderLabel = o => o.type === 'dine-in' ? `MESA ${o.table_label || o.table_number || ''}` : o.type === 'delivery' ? 'DOMICILIO' : `PARA LLEVAR${o.sale_label ? ': ' + o.sale_label : ''}`;

function kitchenTicket(printer, order, items, { station, batch, now }) {
  const t = ticketFor(printer);
  if (printer.beep) t.beep(2);
  t.align('center').size(2).bold().line(station ? STATION_TITLE[station] || station.toUpperCase() : 'COMANDA').size(1).bold(false);
  t.size(2).bold().line(orderLabel(order)).size(1).bold(false);
  const info = [`Pedido #${order.id}`, batch ? `tanda ${batch}` : '', order.people ? `${order.people} pers.` : ''].filter(Boolean).join(' · ');
  t.line(info);
  if (order.waiter_name) t.line(`Mesero: ${order.waiter_name}`);
  if (order.type === 'delivery' && order.customer_name) t.line(`Cliente: ${order.customer_name}`);
  if (order.channel && order.channel !== 'local') t.line(`Canal: ${order.channel}`);
  t.line(fmtDateTime(now)).align('left').sep('=');
  for (const it of items) {
    t.size('tall').bold().line(`${it.quantity} x ${it.name}${it.size ? ' (' + it.size + ')' : ''}`).size(1).bold(false);
    if (it.flavors) t.line(`   ${it.flavors}`);
    if (it.notes) t.bold().line(`   ** ${it.notes}`).bold(false);
  }
  t.sep('=');
  if (order.notes) t.bold().line(`NOTA: ${order.notes}`).bold(false);
  return t.cut().buffer();
}

function itemsBlock(t, items) {
  for (const it of items) {
    t.pair(`${it.quantity} x ${it.name}${it.size ? ' (' + it.size + ')' : ''}`, money(it.price * it.quantity));
    if (it.flavors) t.line(`   ${it.flavors}`);
  }
}
function headerBlock(t, b) {
  t.align('center').size(2).bold().line(b.name).size(1).bold(false);
  if (b.slogan) t.line(b.slogan);
  if (b.nit) t.line(`NIT ${b.nit}`);
  if (b.address) t.line(b.address);
  if (b.phone) t.line(`Tel. ${b.phone}`);
}
const PAY = { cash: 'Efectivo', card_debit: 'Tarjeta débito', card_credit: 'Tarjeta crédito', card: 'Tarjeta', transfer: 'Transferencia / QR', platform: 'Plataforma', credit: 'A crédito', mixed: 'Mixto' };

function preBillTicket(printer, b, order, items, tipPct) {
  const t = ticketFor(printer);
  headerBlock(t, b);
  t.nl().size(2).bold().line('PRECUENTA').size(1).bold(false).line(orderLabel(order));
  if (order.waiter_name) t.line(`Atiende: ${order.waiter_name}${order.people ? ` · ${order.people} personas` : ''}`);
  t.line(fmtDateTime(order.now)).align('left').sep();
  itemsBlock(t, items);
  t.sep();
  const subtotal = order.subtotal || 0;
  if (order.delivery_fee) t.pair('Envío', money(order.delivery_fee));
  if (order.discount) t.pair('Descuento', '-' + money(order.discount));
  t.bold().size('tall').pair('TOTAL', money(order.total)).size(1).bold(false);
  if (tipPct > 0) {
    const tip = Math.round((order.total * tipPct) / 100);
    t.nl().pair(`Propina sugerida ${tipPct}% (voluntaria)`, money(tip)).bold().pair('Total con propina', money(order.total + tip)).bold(false);
  }
  void subtotal;
  t.nl().align('center').line('Este documento no es una factura.').line('Gracias por tu visita');
  return t.cut().buffer();
}

function receiptTicket(printer, b, order, items) {
  const t = ticketFor(printer);
  if (printer.drawer && (order.payment_method === 'cash' || /"cash"/.test(order.payment_split || ''))) t.drawer();
  headerBlock(t, b);
  t.nl().bold().line(`RECIBO DE VENTA ${b.prefix}-${order.id}`).bold(false).line(fmtDateTime(order.closed_at || order.created_at));
  t.align('left');
  t.line(`Cliente: ${order.customer_name || 'Consumidor Final'}`);
  if (order.customer_doc && order.customer_doc !== '222222222222') t.line(`C.C./NIT: ${order.customer_doc}`);
  if (order.type === 'dine-in') t.line(`${orderLabel(order)}${order.waiter_name ? ' · Atiende: ' + order.waiter_name : ''}`);
  if (order.type === 'delivery') t.line(`Domicilio: ${[order.customer_address, order.customer_neighborhood].filter(Boolean).join(' · ')}`);
  t.sep();
  itemsBlock(t, items);
  t.sep();
  t.pair('Subtotal', money(order.subtotal));
  if (order.delivery_fee) t.pair('Envío', money(order.delivery_fee));
  if (order.discount) t.pair(`Descuento${order.discount_reason ? ' (' + order.discount_reason + ')' : ''}`, '-' + money(order.discount));
  if (b.taxType !== 'none' && b.taxRate > 0) {
    const base = Math.round(order.total / (1 + b.taxRate / 100));
    t.pair('Base', money(base)).pair(`${b.taxType === 'iva' ? 'IVA' : 'INC'} ${b.taxRate}% incluido`, money(order.total - base));
  }
  t.bold().size('tall').pair('TOTAL', money(order.total)).size(1).bold(false);
  if (order.tip) t.pair('Propina (voluntaria)', money(order.tip)).bold().pair('TOTAL PAGADO', money(order.total + order.tip)).bold(false);
  t.nl();
  let split = null; try { split = order.payment_split ? JSON.parse(order.payment_split) : null; } catch { split = null; }
  if (order.payment_method === 'mixed' && split) { t.pair(PAY[split.method1] || split.method1, money(split.amount1)).pair(PAY[split.method2] || split.method2, money(split.amount2)); }
  else t.pair('Pago', PAY[order.payment_method] || order.payment_method || '');
  if (order.cash_received && order.payment_method === 'cash') t.pair('Recibido', money(order.cash_received)).pair('Cambio', money(order.cash_change || 0));
  t.nl().align('center');
  if (b.footer) t.line(b.footer);
  t.line('¡Gracias por tu compra!');
  if (b.hours) t.line(b.hours);
  return t.cut().buffer();
}

function shiftReportTicket(printer, b, s, isZ) {
  const t = ticketFor(printer);
  t.align('center').bold().line(b.name).bold(false).size(2).bold().line(isZ ? 'CIERRE DE CAJA (Z)' : 'CORTE PARCIAL (X)').size(1).bold(false);
  t.line(`Turno #${s.id} · ${s.cashierName}`).line(`Apertura ${fmtDateTime(s.opened_at)}`);
  if (isZ && s.closed_at) t.line(`Cierre ${fmtDateTime(s.closed_at)}`);
  t.align('left').sep();
  t.pair('Base inicial', money(s.initialCash));
  t.pair('Ventas en efectivo', money(s.cashSales)).pair('Tarjeta débito', money(s.debitSales)).pair('Tarjeta crédito', money(s.creditSales))
    .pair('Transferencia / QR', money(s.transferSales)).pair('Plataformas', money(s.platformSales)).pair('A crédito', money(s.pendingSales));
  t.bold().pair(`Total ventas (${s.totalOrders})`, money(s.totalSales)).bold(false).sep();
  t.pair('Propinas efectivo', money(s.tips.cash)).pair('Propinas tarjeta', money(s.tips.card)).pair('Propinas transferencia', money(s.tips.transfer));
  t.pair('Ingresos de caja', money(s.totalDeposits)).pair('Retiros de caja', '-' + money(s.totalWithdrawals)).sep();
  t.bold().pair('EFECTIVO ESPERADO', money(s.expectedCash)).bold(false);
  if (isZ) {
    let counted = null; try { counted = s.counted_detail ? JSON.parse(s.counted_detail) : null; } catch { counted = null; }
    if (s.actual_cash !== undefined && s.actual_cash !== null) t.pair('Efectivo contado', money(s.actual_cash));
    if (counted) { if (counted.transfer !== undefined) t.pair('Transferencias contadas', money(counted.transfer)); if (counted.card !== undefined) t.pair('Datáfono contado', money(counted.card)); }
    if (s.difference !== undefined && s.difference !== null) t.bold().pair('Diferencia', money(s.difference)).bold(false);
    t.nl(2).align('center').line('______________________').line('Firma cajero');
  }
  return t.cut().buffer();
}

function testTicket(printer, b) {
  const t = ticketFor(printer);
  if (printer.beep) t.beep(1);
  t.align('center').size(2).bold().line('PRUEBA OK').size(1).bold(false).line(b.name).sep();
  t.align('left').line(`Impresora: ${printer.name}`).line(`IP: ${printer.ip}:${printer.port} · ${printer.paper} mm`).line(`Funciones: ${printer.roles.map(r => ROLE_LABEL[r] || r).join(', ') || 'ninguna'}`);
  t.line('Tildes: áéíóú ÁÉÍÓÚ ñ Ñ ¿? ¡!').pair('Columna izquierda', '$123.456').size('tall').line('Letra alta').size(2).line('GRANDE').size(1);
  t.sep().align('center').line('Si ves bien las tildes, la tabla PC850 funciona.').line('Si salen símbolos raros, elige "Sin tildes".');
  return t.cut().buffer();
}

/* ---------------- envío de documentos ---------------- */
function orderRow(db, id) { return db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(id)); }

/**
 * Comanda de una tanda: una por estación (cocina/barra) si el restaurante imprime por estación; si una estación no tiene
 * impresora propia, su comanda sale en la de cocina. Devuelve la cantidad de trabajos encolados.
 */
function enqueueKitchen(db, orderId, batch, { user = '', mode } = {}) {
  const order = orderRow(db, orderId);
  if (!order) return 0;
  const items = db.prepare(`SELECT oi.name, oi.size, oi.flavors, oi.quantity, oi.notes, COALESCE(p.station, 'cocina') AS station FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = ? ${batch ? 'AND oi.batch = ?' : 'AND oi.batch IS NOT NULL'} ORDER BY oi.id`).all(...(batch ? [order.id, batch] : [order.id])).filter(i => i.station !== 'none');
  if (!items.length) return 0;
  const now = db.prepare("SELECT datetime('now', '-5 hours') AS d").get().d;
  const kitchenPrinters = printersFor(db, 'cocina');
  const kmode = mode || (readSetting(db, 'kitchenPrintMode') === 'station' ? 'station' : 'single');
  let n = 0;
  if (kmode === 'single') {
    for (const p of kitchenPrinters) n += enqueue(db, p, 'comanda', `Comanda #${order.id}`, kitchenTicket(p, order, items, { batch, now }), { orderId: order.id, user }).length;
    return n;
  }
  for (const st of ['cocina', 'barra']) {
    const list = items.filter(i => (i.station === 'barra' ? 'barra' : 'cocina') === st);
    if (!list.length) continue;
    const targets = printersFor(db, st).length ? printersFor(db, st) : kitchenPrinters;
    for (const p of targets) n += enqueue(db, p, 'comanda', `Comanda ${st} #${order.id}`, kitchenTicket(p, order, list, { station: st, batch, now }), { orderId: order.id, user }).length;
  }
  return n;
}

function enqueuePreBill(db, orderId, tipPct, user) {
  const order = orderRow(db, orderId);
  if (!order) throw new Error('Pedido no encontrado');
  const items = db.prepare('SELECT name, size, flavors, quantity, price FROM order_items WHERE order_id = ? ORDER BY id').all(order.id);
  order.now = db.prepare("SELECT datetime('now', '-5 hours') AS d").get().d;
  const b = biz(db);
  return printersFor(db, 'caja').reduce((n, p) => n + enqueue(db, p, 'precuenta', `Precuenta #${order.id}`, preBillTicket(p, b, order, items, Number(tipPct) || 0), { orderId: order.id, user }).length, 0);
}

function enqueueReceipt(db, orderId, user) {
  const order = orderRow(db, orderId);
  if (!order) throw new Error('Pedido no encontrado');
  const items = db.prepare('SELECT name, size, flavors, quantity, price FROM order_items WHERE order_id = ? ORDER BY id').all(order.id);
  const b = biz(db);
  return printersFor(db, 'caja').reduce((n, p) => n + enqueue(db, p, 'recibo', `Recibo ${b.prefix}-${order.id}`, receiptTicket(p, b, order, items), { orderId: order.id, user }).length, 0);
}

function enqueueShiftReport(db, stats, isZ, user) {
  const b = biz(db);
  return printersFor(db, 'caja').reduce((n, p) => n + enqueue(db, p, isZ ? 'cierre' : 'corte', `${isZ ? 'Cierre' : 'Corte'} turno #${stats.id}`, shiftReportTicket(p, b, stats, isZ), { user }).length, 0);
}

function enqueueTest(db, printerId, user) {
  const p = listPrinters(db).find(x => x.id === Number(printerId));
  if (!p) throw new Error('Impresora no encontrada');
  return enqueue(db, { ...p, copies: 1 }, 'prueba', `Prueba ${p.name}`, testTicket(p, biz(db)), { user });
}

/** Al enviar una tanda a cocina: si está activa la impresión en red y la impresión automática, sale sola. */
function autoKitchen(db, orderId, batch, user) {
  try {
    if (printMode(db) !== 'agent' || readSetting(db, 'autoPrintKitchen') !== '1' || !batch) return 0;
    return enqueueKitchen(db, orderId, batch, { user });
  } catch (e) { console.warn('Impresión de comanda:', e.message); return 0; }
}

module.exports = {
  initPrintingSchema, bus, ROLES, ROLE_LABEL, printMode, listPrinters, mapPrinter, enqueue, claimJobs, finishJob,
  createAgent, agentByToken, listAgents, hashToken, enqueueKitchen, enqueuePreBill, enqueueReceipt, enqueueShiftReport, enqueueTest, autoKitchen,
  kitchenTicket, receiptTicket, preBillTicket, testTicket, shiftReportTicket, biz,
};
