/**
 * Avisos al bot de WhatsApp (p. ej. Merly en Wonka's) cuando un pedido de WhatsApp cambia de estado, para que le escriba al cliente:
 * - Para llevar: "listo para recoger" (estado ready)  → evento order.ready_for_pickup
 * - Domicilio: "va en camino" (estado shipped)         → evento order.on_the_way
 *
 * Se activa con BOT_WEBHOOK_URL en server/.env: el POS hace POST con JSON y la clave BOT_API_KEY en el encabezado x-api-key.
 * Solo pedidos de WhatsApp (canal WhatsApp o creados por el bot), con teléfono y de las últimas 12 horas.
 * Cada aviso sale una sola vez por pedido (columna orders.bot_notified), aunque el estado vaya y vuelva.
 * Registro de cada aviso en la tabla bot_notifications (enviado, error, código HTTP).
 */
const { now } = require('./cashHelpers');

const RULES = {
  pickup: { status: 'ready', event: 'order.ready_for_pickup', label: 'Listo para recoger' },
  delivery: { status: 'shipped', event: 'order.on_the_way', label: 'En camino' },
};
const MAX_AGE_HOURS = 12;

let ready = false;
function ensureSchema(db) {
  if (ready) return;
  const cols = db.prepare('PRAGMA table_info(orders)').all().map(c => c.name);
  if (!cols.includes('bot_notified')) db.prepare('ALTER TABLE orders ADD COLUMN bot_notified TEXT').run();
  db.exec(`CREATE TABLE IF NOT EXISTS bot_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, event TEXT NOT NULL, result TEXT, http_status INTEGER,
    attempts INTEGER DEFAULT 0, created_at TEXT, sent_at TEXT)`);
  ready = true;
}

const enabled = () => Boolean(process.env.BOT_WEBHOOK_URL) && process.env.DEMO_MODE !== '1';
const minusHours = (ts, h) => new Date(Date.parse(ts.replace(' ', 'T') + 'Z') - h * 3600000).toISOString().slice(0, 19).replace('T', ' ');

function payloadFor(o, row, rule, ts) {
  const deposit = (o.deposit && o.deposit.amount) || 0;
  const paid = o.paymentStatus === 'paid';
  const toPay = paid || o.paymentMethod === 'platform' ? 0 : Math.max(0, (o.amountDue ?? o.total ?? 0) - deposit);
  return {
    event: rule.event,
    orderId: o.id,
    externalId: row.external_ref || null,
    channel: o.channel,
    type: o.type,
    status: o.status,
    statusLabel: rule.label,
    customer: { name: (o.customer && o.customer.name) || '', phone: row.customer_phone },
    address: o.type === 'delivery' ? [o.customer && o.customer.address, o.customer && o.customer.address2].filter(Boolean).join(', ') || null : null,
    neighborhood: (o.customer && o.customer.neighborhood) || null,
    courier: o.type === 'delivery' ? o.driverName || null : null,
    total: o.total,
    paid: paid || (deposit > 0 && toPay === 0),
    toPay,
    paymentMethod: o.paymentMethod || null,
    changeDue: o.changeDue || 0,
    at: ts,
  };
}

function send(db, logId, payload, attempt) {
  const url = process.env.BOT_WEBHOOK_URL;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  const log = (result, status) => { try { db.prepare('UPDATE bot_notifications SET result = ?, http_status = ?, attempts = ?, sent_at = ? WHERE id = ?').run(result, status || null, attempt, now(db), logId); } catch { /* sin registro */ } };
  const retry = () => { if (attempt < 3) setTimeout(() => send(db, logId, payload, attempt + 1), attempt * 30000); };
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.BOT_API_KEY || '' }, body: JSON.stringify(payload), signal: ctrl.signal })
    .then(r => {
      clearTimeout(timer);
      log(r.ok ? 'sent' : `http ${r.status}`, r.status);
      if (!r.ok) { console.error(`[bot] aviso ${payload.event} #${payload.orderId}: HTTP ${r.status}`); if (r.status >= 500) retry(); }
    })
    .catch(e => { clearTimeout(timer); log(`error: ${e.name === 'AbortError' ? 'sin respuesta' : e.message}`.slice(0, 200)); console.error(`[bot] aviso ${payload.event} #${payload.orderId}: ${e.message}`); retry(); });
}

/** Revisa un pedido recién cambiado y, si corresponde, avisa al bot (una sola vez por evento). */
function onOrder(db, o) {
  const rule = RULES[o.type];
  if (!rule || o.status !== rule.status) return;
  ensureSchema(db);
  const row = db.prepare('SELECT id, channel, external_ref, customer_phone, created_at FROM orders WHERE id = ?').get(o.id);
  if (!row || !String(row.customer_phone || '').trim()) return;
  if (row.channel !== 'whatsapp' && !row.external_ref) return;
  const ts = now(db);
  if (String(row.created_at || '') < minusHours(ts, MAX_AGE_HOURS)) return;
  const tag = `|${rule.event}|`;
  const marked = db.prepare("UPDATE orders SET bot_notified = COALESCE(bot_notified, '') || ? WHERE id = ? AND INSTR(COALESCE(bot_notified, ''), ?) = 0").run(tag, o.id, tag);
  if (!marked.changes) return;
  const logId = Number(db.prepare("INSERT INTO bot_notifications (order_id, event, result, attempts, created_at) VALUES (?, ?, 'pending', 0, ?)").run(o.id, rule.event, ts).lastInsertRowid);
  send(db, logId, payloadFor(o, row, rule, ts), 1);
}

/** Engancha los avisos a los eventos de pedidos que ya emite el servidor (todas las rutas pasan por io.emit). */
function attach(io, getDb) {
  const orig = io.emit.bind(io);
  io.emit = (event, payload, ...rest) => {
    const r = orig(event, payload, ...rest);
    if ((event === 'order:updated' || event === 'order:new') && payload && payload.id && enabled()) {
      setImmediate(() => { try { onOrder(getDb(), payload); } catch (e) { console.error('[bot] aviso:', e.message); } });
    }
    return r;
  };
}

module.exports = { attach, onOrder, RULES };
