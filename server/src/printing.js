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
  // Trabajos directos a una IP (hoja de identificación de una impresora aún no registrada): printer_id = 0
  if (!hasCol(db, 'print_jobs', 'ip')) db.exec('ALTER TABLE print_jobs ADD COLUMN ip TEXT');
  if (!hasCol(db, 'print_jobs', 'port')) db.exec('ALTER TABLE print_jobs ADD COLUMN port INTEGER');
}

/* ---------------- configuración ---------------- */
const readSetting = (db, k) => { const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(k); return r ? r.value : undefined; };
/** 'browser' = se imprime desde el navegador (diálogo de impresión) · 'agent' = por red con el agente. */
function printMode(db) { return readSetting(db, 'printMode') === 'agent' ? 'agent' : 'browser'; }
/** Datos del negocio con la dirección y el teléfono de la sede (si los tiene) y su nombre cuando hay varias sedes. */
function bizFor(db, branchId) {
  const b = biz(db);
  try {
    const br = db.prepare('SELECT * FROM branches WHERE id = ?').get(Number(branchId || 1));
    const many = db.prepare('SELECT COUNT(*) AS c FROM branches WHERE active = 1').get().c > 1;
    if (br) { if (br.address) b.address = br.address; if (br.phone) b.phone = br.phone; if (many) b.slogan = [b.slogan, `Sede ${br.name}`].filter(Boolean).join(' · '); }
  } catch { /* sin sedes */ }
  return b;
}
function biz(db) {
  const g = k => readSetting(db, k) || '';
  return { name: g('businessName') || 'Mi Negocio', slogan: g('businessSlogan'), address: g('businessAddress'), phone: g('businessPhone'), nit: g('businessNit'), hours: g('businessHours'),
    prefix: g('invoicePrefix') || 'POS', taxType: g('taxType') || 'none', taxRate: Number(g('taxRate')) || 0, footer: g('receiptFooter'), logo: receiptLogo(db) };
}
/** Logo en blanco y negro para precuentas y recibos (Configuración → Impresoras). null si está apagado. */
function receiptLogo(db) {
  try { const l = JSON.parse(readSetting(db, 'receiptLogo') || 'null'); return l && l.on && l.w && l.h && l.data ? l : null; } catch { return null; }
}

const mapPrinter = r => {
  let roles = []; try { roles = JSON.parse(r.roles || '[]'); } catch { roles = []; }
  return { id: r.id, name: r.name, ip: r.ip, port: r.port, roles, paper: r.paper, codepage: r.codepage, copies: r.copies, drawer: Boolean(r.drawer), beep: Boolean(r.beep), active: Boolean(r.active),
    online: r.online === null || r.online === undefined ? null : Boolean(r.online), checkedAt: r.checked_at || null, branchId: r.branch_id === null || r.branch_id === undefined ? null : Number(r.branch_id) };
};
const listPrinters = db => db.prepare('SELECT * FROM printers ORDER BY id').all().map(mapPrinter);
/** Impresoras activas con esa función en la sede (las que no tienen sede sirven para todas). */
const printersFor = (db, role, branchId = 1) => listPrinters(db).filter(p => p.active && p.roles.includes(role) && (p.branchId === null || p.branchId === Number(branchId || 1)));
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
  const rows = db.prepare(`SELECT j.id, j.kind, j.title, j.payload, COALESCE(j.ip, p.ip) AS ip, COALESCE(j.port, p.port) AS port, COALESCE(p.name, 'Impresora ' || j.ip) AS printer
    FROM print_jobs j LEFT JOIN printers p ON p.id = j.printer_id
    WHERE (p.active = 1 OR (j.printer_id = 0 AND j.ip IS NOT NULL)) AND (j.status = 'pending' OR (j.status = 'sent' AND j.claimed_at < datetime('now', '-5 hours', '-60 seconds') AND j.attempts < 4))
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
const STATION_TITLE = { cocina: 'COCINA', barra: 'BEBIDAS' };
const fmtDateTime = ts => { const s = String(ts || ''); return s.length >= 16 ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11, 16)}` : s; };
const orderLabel = o => o.type === 'dine-in' ? `MESA ${o.table_label || o.table_number || ''}` : o.type === 'delivery' ? 'DOMICILIO' : `PARA LLEVAR${o.sale_label ? ': ' + o.sale_label : ''}`;

function kitchenTicket(printer, order, items, { station, batch, now }) {
  const t = ticketFor(printer);
  if (printer.beep) t.beep(2);
  t.align('center').size(2).bold().line(station ? STATION_TITLE[station] || station.toUpperCase() : 'COMANDA').size(1).bold(false);
  t.size(2).bold().line(orderLabel(order)).size(1).bold(false);
  // Para llevar y domicilio: aviso en negro para que en cocina lo empaquen
  const pack = packBanner(order);
  if (pack) t.size(2).bold().invert().line(` ${pack} `).invert(false).size(1).bold(false);
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

/** Aviso de empaque según el tipo de pedido (null en mesa). */
const packBanner = o => o.type === 'pickup' ? 'PARA LLEVAR' : o.type === 'delivery' ? 'DOMICILIO' : null;

function itemsBlock(t, items) {
  for (const it of items) {
    t.pair(`${it.quantity} x ${it.name}${it.size ? ' (' + it.size + ')' : ''}`, money(it.price * it.quantity));
    if (it.flavors) t.line(`   ${it.flavors}`);
  }
}
function headerBlock(t, b) {
  t.align('center');
  if (b.logo && b.logo.w <= t.width * 12) t.image(b.logo).nl();
  t.size(2).bold().line(b.name).size(1).bold(false);
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
  if (packBanner(order)) t.size(2).bold().invert().line(` ${packBanner(order)} `).invert(false).size(1).bold(false);
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
  if (packBanner(order)) t.size(2).bold().invert().line(` ${packBanner(order)} `).invert(false).size(1).bold(false);
  t.align('left');
  t.line(`Cliente: ${order.customer_name || 'Consumidor Final'}`);
  if (order.customer_doc && order.customer_doc !== '222222222222') t.line(`C.C./NIT: ${order.customer_doc}`);
  if (order.type === 'dine-in') t.line(`${orderLabel(order)}${order.waiter_name ? ' · Atiende: ' + order.waiter_name : ''}`);
  if (order.type === 'delivery') t.line(`Domicilio: ${[order.customer_address, order.customer_neighborhood].filter(Boolean).join(' · ')}`);
  if (order.type === 'pickup') t.line(`Para llevar${order.sale_label ? ': ' + order.sale_label : ''}`);
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

/** Hoja grande para saber qué impresora física tiene cada IP (antes de registrarla). */
function identifyTicket(ip, port, b) {
  const t = new Ticket({ width: 48, codepage: 'cp850' });
  t.beep(1).align('center').size(2).bold().line('IMPRESORA').line(ip).size(1).bold(false).line(`Puerto ${port}`).sep();
  t.line(b.name).line('Si esta hoja salió aquí, esta impresora').line(`tiene la IP ${ip}.`).nl();
  t.line('En el POS: Configuracion > Impresoras >').line('Agregar impresora con esta IP y elegir si es').line('de Cocina, Barra o Caja.');
  return t.cut().buffer();
}
function enqueueIdentify(db, ip, port, user) {
  const info = db.prepare("INSERT INTO print_jobs (printer_id, kind, title, payload, ip, port, created_by) VALUES (0, 'identificar', ?, ?, ?, ?, ?)")
    .run(`Identificar ${ip}`, identifyTicket(ip, port, biz(db)).toString('base64'), ip, port, user || '');
  bus.emit('job');
  return Number(info.lastInsertRowid);
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
  const kitchenPrinters = printersFor(db, 'cocina', order.branch_id);
  const kmode = mode || (readSetting(db, 'kitchenPrintMode') === 'station' ? 'station' : 'single');
  let n = 0;
  if (kmode === 'single') {
    for (const p of kitchenPrinters) n += enqueue(db, p, 'comanda', `Comanda #${order.id}`, kitchenTicket(p, order, items, { batch, now }), { orderId: order.id, user }).length;
    return n;
  }
  for (const st of ['cocina', 'barra']) {
    const list = items.filter(i => (i.station === 'barra' ? 'barra' : 'cocina') === st);
    if (!list.length) continue;
    // Bebidas: en la impresora de barra; si no hay, en la de caja (se despachan desde ahí). Nunca en cocina.
    const barra = st === 'barra' ? printersFor(db, 'barra', order.branch_id) : [];
    const targets = st === 'barra' ? (barra.length ? barra : printersFor(db, 'caja', order.branch_id)) : kitchenPrinters;
    for (const p of targets) n += enqueue(db, p, 'comanda', `Comanda ${st} #${order.id}`, kitchenTicket(p, order, list, { station: st, batch, now }), { orderId: order.id, user }).length;
  }
  return n;
}

function enqueuePreBill(db, orderId, tipPct, user) {
  const order = orderRow(db, orderId);
  if (!order) throw new Error('Pedido no encontrado');
  const items = db.prepare('SELECT name, size, flavors, quantity, price FROM order_items WHERE order_id = ? ORDER BY id').all(order.id);
  order.now = db.prepare("SELECT datetime('now', '-5 hours') AS d").get().d;
  const b = bizFor(db, order.branch_id);
  return printersFor(db, 'caja', order.branch_id).reduce((n, p) => n + enqueue(db, p, 'precuenta', `Precuenta #${order.id}`, preBillTicket(p, b, order, items, Number(tipPct) || 0), { orderId: order.id, user }).length, 0);
}

function enqueueReceipt(db, orderId, user) {
  const order = orderRow(db, orderId);
  if (!order) throw new Error('Pedido no encontrado');
  const items = db.prepare('SELECT name, size, flavors, quantity, price FROM order_items WHERE order_id = ? ORDER BY id').all(order.id);
  const b = bizFor(db, order.branch_id);
  return printersFor(db, 'caja', order.branch_id).reduce((n, p) => n + enqueue(db, p, 'recibo', `Recibo ${b.prefix}-${order.id}`, receiptTicket(p, b, order, items), { orderId: order.id, user }).length, 0);
}

function enqueueShiftReport(db, stats, isZ, user) {
  const b = bizFor(db, stats.branch_id);
  return printersFor(db, 'caja', stats.branch_id).reduce((n, p) => n + enqueue(db, p, isZ ? 'cierre' : 'corte', `${isZ ? 'Cierre' : 'Corte'} turno #${stats.id}`, shiftReportTicket(p, b, stats, isZ), { user }).length, 0);
}

function enqueueTest(db, printerId, user) {
  const p = listPrinters(db).find(x => x.id === Number(printerId));
  if (!p) throw new Error('Impresora no encontrada');
  return enqueue(db, { ...p, copies: 1 }, 'prueba', `Prueba ${p.name}`, testTicket(p, biz(db)), { user });
}

/**
 * Impresiones de ejemplo para probar una impresora sin hacer ventas reales: según su función imprime una comanda de cocina,
 * una de barra, una precuenta y un recibo con productos del menú. Todo sale marcado como EJEMPLO.
 */
function enqueueSamples(db, printerId, user) {
  const p = listPrinters(db).find(x => x.id === Number(printerId));
  if (!p) throw new Error('Impresora no encontrada');
  const prods = db.prepare("SELECT p.name, p.price, COALESCE(p.station, 'cocina') AS station FROM products p WHERE COALESCE(p.available, 1) = 1 AND p.price > 0 ORDER BY p.id").all();
  const food = prods.filter(x => x.station !== 'barra').slice(0, 3);
  const drinks = prods.filter(x => x.station === 'barra').slice(0, 2);
  const pick = food.length || drinks.length ? [...food, ...drinks] : [{ name: 'Hamburguesa clasica', price: 25000, station: 'cocina' }, { name: 'Papas fritas', price: 8000, station: 'cocina' }, { name: 'Gaseosa', price: 5000, station: 'barra' }];
  const items = pick.map((x, i) => ({ name: x.name, quantity: i === 0 ? 2 : 1, price: x.price, station: x.station, notes: i === 0 ? 'sin cebolla (ejemplo)' : '' }));
  const now = db.prepare("SELECT datetime('now', '-5 hours') AS d").get().d;
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const order = { id: 0, type: 'dine-in', table_label: '5 (EJEMPLO)', people: 3, waiter_name: 'Mesero de prueba', customer_name: 'Consumidor Final', created_at: now, closed_at: now, now,
    subtotal, discount: 0, delivery_fee: 0, tip: Math.round(subtotal * 0.1), total: subtotal + Math.round(subtotal * 0.1), payment_method: 'cash', cash_received: Math.ceil((subtotal * 1.1) / 10000) * 10000, notes: 'Pedido de ejemplo para probar la impresora' };
  order.cash_change = order.cash_received - order.total;
  const b = { ...bizFor(db, p.branchId || 1), prefix: 'EJEMPLO' };
  const one = { ...p, copies: 1, drawer: false };
  let n = 0;
  if (p.roles.includes('cocina')) {
    const list = items.filter(i => i.station !== 'barra');
    n += enqueue(db, one, 'prueba', 'Ejemplo comanda cocina', kitchenTicket(one, order, list.length ? list : items, { station: p.roles.includes('barra') ? null : 'cocina', batch: 1, now }), { user }).length;
  }
  if (p.roles.includes('barra')) {
    const list = items.filter(i => i.station === 'barra');
    n += enqueue(db, one, 'prueba', 'Ejemplo comanda barra', kitchenTicket(one, order, list.length ? list : items, { station: 'barra', batch: 1, now }), { user }).length;
  }
  if (p.roles.includes('caja')) {
    n += enqueue(db, one, 'prueba', 'Ejemplo precuenta', preBillTicket(one, b, order, items, 10), { user }).length;
    n += enqueue(db, one, 'prueba', 'Ejemplo recibo', receiptTicket(one, b, order, items), { user }).length;
  }
  if (!n) n += enqueue(db, one, 'prueba', `Prueba ${p.name}`, testTicket(p, biz(db)), { user }).length;
  return n;
}

/** Al enviar una tanda a cocina: si está activa la impresión en red y la impresión automática, sale sola. */
function autoKitchen(db, orderId, batch, user) {
  try {
    // Con impresión en red, la comanda sale al enviarla salvo que se haya desactivado explícitamente
    if (printMode(db) !== 'agent' || readSetting(db, 'autoPrintKitchen') === '0' || !batch) return 0;
    return enqueueKitchen(db, orderId, batch, { user });
  } catch (e) { console.warn('Impresión de comanda:', e.message); return 0; }
}

module.exports = {
  receiptLogo, initPrintingSchema, bus, ROLES, ROLE_LABEL, printMode, listPrinters, mapPrinter, enqueue, claimJobs, finishJob,
  createAgent, agentByToken, listAgents, hashToken, enqueueKitchen, enqueueIdentify, enqueuePreBill, enqueueReceipt, enqueueShiftReport, enqueueTest, enqueueSamples, autoKitchen,
  kitchenTicket, receiptTicket, preBillTicket, testTicket, shiftReportTicket, biz,
};
