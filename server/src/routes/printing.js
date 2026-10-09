/**
 * /api/printing — configuración de impresoras en red y envío de documentos (usuarios del sistema).
 * /api/print-agent — lo que usa el agente instalado en el restaurante (se autentica con su token, no con usuario).
 */
const fs = require('fs');
const path = require('path');
const { Router } = require('express');
const { getDb } = require('../db');
const { requireRole } = require('../auth');
const P = require('../printing');

const router = Router();
// Configuración de impresoras: el administrador o quien tenga el permiso "Configurar impresoras"
const { hasAction } = require('../auth');
const ADMIN = (req, res, next) => (req.user && (req.user.role === 'admin' || hasAction(req.user, 'manage_printers')) ? next() : res.status(403).json({ error: 'Necesitas el permiso "Configurar impresoras". Pídeselo al administrador.' }));
const IP_RE = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

function printerPayload(b, cur = {}) {
  let roles = Array.isArray(b.roles) ? b.roles.filter(r => P.ROLES.includes(r)) : (cur.roles || []);
  // Sin función marcada se deduce del nombre ("Cocina", "Caja", "Barra") para que no quede una impresora que nunca imprime
  if (!roles.length) { const n = String(b.name !== undefined ? b.name : cur.name || '').toLowerCase(); roles = P.ROLES.filter(r => n.includes(r)); }
  return {
    name: b.name !== undefined ? String(b.name).trim().slice(0, 60) : cur.name,
    ip: b.ip !== undefined ? String(b.ip).trim() : cur.ip,
    port: b.port !== undefined ? Math.round(Number(b.port)) || 9100 : (cur.port || 9100),
    roles,
    paper: (b.paper !== undefined ? Number(b.paper) : cur.paper) === 58 ? 58 : 80,
    codepage: (b.codepage !== undefined ? b.codepage : cur.codepage) === 'ascii' ? 'ascii' : 'cp850',
    copies: Math.min(3, Math.max(1, Math.round(Number(b.copies !== undefined ? b.copies : cur.copies) || 1))),
    drawer: b.drawer !== undefined ? Boolean(b.drawer) : Boolean(cur.drawer),
    beep: b.beep !== undefined ? Boolean(b.beep) : Boolean(cur.beep),
    active: b.active !== undefined ? Boolean(b.active) : (cur.active === undefined ? true : Boolean(cur.active)),
    branchId: b.branchId !== undefined ? (b.branchId === null || b.branchId === '' ? null : Number(b.branchId)) : (cur.branchId === undefined ? require('../branches').currentBranch() : cur.branchId),
  };
}
function validate(p) {
  if (!p.name || p.name.length < 2) return 'Ponle un nombre a la impresora (ej. Cocina)';
  if (!IP_RE.test(p.ip || '')) return 'La IP no es válida (ej. 192.168.1.100)';
  if (p.port < 1 || p.port > 65535) return 'Puerto inválido';
  return null;
}

/* Modo de impresión: lo consulta cualquier usuario para saber si imprime por red o por el navegador */
router.get('/mode', (req, res) => {
  const db = getDb();
  const printers = P.listPrinters(db).filter(p => p.active);
  const agents = P.listAgents(db);
  res.json({ mode: P.printMode(db), roles: { cocina: printers.some(p => p.roles.includes('cocina')), barra: printers.some(p => p.roles.includes('barra')), caja: printers.some(p => p.roles.includes('caja')) }, agentOnline: agents.some(a => a.online) });
});

router.get('/config', ADMIN, (req, res) => {
  const db = getDb();
  const jobs = db.prepare(`SELECT j.id, j.kind, j.title, j.status, j.attempts, j.error, j.created_at AS createdAt, j.done_at AS doneAt, j.created_by AS createdBy, COALESCE(p.name, j.ip) AS printer
    FROM print_jobs j LEFT JOIN printers p ON p.id = j.printer_id ORDER BY j.id DESC LIMIT 40`).all();
  let logo = null; try { logo = JSON.parse((db.prepare("SELECT value FROM settings WHERE key = 'receiptLogo'").get() || {}).value || 'null'); } catch { logo = null; }
  res.json({ mode: P.printMode(db), printers: P.listPrinters(db), agents: P.listAgents(db), jobs, roles: P.ROLE_LABEL, logo });
});

// Logo de precuentas y recibos: mapa de bits de 1 bit ya convertido en el navegador
router.put('/logo', ADMIN, (req, res) => {
  const db = getDb();
  const b = req.body || {};
  let value;
  if (!b.on) value = { on: false };
  else {
    const w = Math.round(Number(b.w)), h = Math.round(Number(b.h)), data = String(b.data || '');
    if (!w || w % 8 || w > 576 || !h || h > 600) return res.status(400).json({ error: 'Tamaño de logo inválido' });
    if (Buffer.from(data, 'base64').length !== (w / 8) * h) return res.status(400).json({ error: 'La imagen del logo está incompleta' });
    value = { on: true, w, h, data };
  }
  db.prepare("INSERT INTO settings (key, value) VALUES ('receiptLogo', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(value));
  res.json({ success: true, logo: value });
});

router.put('/mode', ADMIN, (req, res) => {
  const db = getDb();
  const mode = req.body.mode === 'agent' ? 'agent' : 'browser';
  db.prepare("INSERT INTO settings (key, value) VALUES ('printMode', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(mode);
  res.json({ mode });
});

router.post('/printers', ADMIN, (req, res) => {
  const db = getDb();
  const p = printerPayload(req.body || {});
  const err = validate(p);
  if (err) return res.status(400).json({ error: err });
  const info = db.prepare('INSERT INTO printers (name, ip, port, roles, paper, codepage, copies, drawer, beep, active, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(p.name, p.ip, p.port, JSON.stringify(p.roles), p.paper, p.codepage, p.copies, p.drawer ? 1 : 0, p.beep ? 1 : 0, p.active ? 1 : 0, p.branchId);
  res.status(201).json(P.listPrinters(db).find(x => x.id === Number(info.lastInsertRowid)));
});

router.put('/printers/:id', ADMIN, (req, res) => {
  const db = getDb();
  const cur = P.listPrinters(db).find(x => x.id === Number(req.params.id));
  if (!cur) return res.status(404).json({ error: 'Impresora no encontrada' });
  const p = printerPayload(req.body || {}, cur);
  const err = validate(p);
  if (err) return res.status(400).json({ error: err });
  db.prepare('UPDATE printers SET name = ?, ip = ?, port = ?, roles = ?, paper = ?, codepage = ?, copies = ?, drawer = ?, beep = ?, active = ?, branch_id = ? WHERE id = ?')
    .run(p.name, p.ip, p.port, JSON.stringify(p.roles), p.paper, p.codepage, p.copies, p.drawer ? 1 : 0, p.beep ? 1 : 0, p.active ? 1 : 0, p.branchId, cur.id);
  res.json(P.listPrinters(db).find(x => x.id === cur.id));
});

router.delete('/printers/:id', ADMIN, (req, res) => {
  const db = getDb();
  db.prepare("UPDATE print_jobs SET status = 'error', error = 'Impresora eliminada' WHERE printer_id = ? AND status IN ('pending', 'sent')").run(Number(req.params.id));
  db.prepare('DELETE FROM printers WHERE id = ?').run(Number(req.params.id));
  res.json({ success: true });
});

router.post('/printers/:id/test', ADMIN, (req, res) => {
  try { const ids = P.enqueueTest(getDb(), req.params.id, req.user?.name); res.json({ queued: ids.length }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/printers/:id/samples', ADMIN, (req, res) => {
  try { res.json({ queued: P.enqueueSamples(getDb(), req.params.id, req.user?.name) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// Imprimir una hoja de identificación en una IP (para saber qué impresora física es antes de registrarla)
router.post('/identify', ADMIN, (req, res) => {
  const db = getDb();
  const ip = String(req.body.ip || '').trim();
  const port = Math.round(Number(req.body.port)) || 9100;
  if (!IP_RE.test(ip)) return res.status(400).json({ error: 'La IP no es válida (ej. 192.168.1.100)' });
  if (!P.listAgents(db).some(a => a.online)) return res.status(400).json({ error: 'El agente de impresión no está en línea: enciende el computador del local' });
  res.json({ jobId: P.enqueueIdentify(db, ip, port, req.user?.name) });
});

router.post('/agents', ADMIN, (req, res) => {
  const a = P.createAgent(getDb(), req.body.name);
  res.status(201).json(a);
});
router.delete('/agents/:id', ADMIN, (req, res) => {
  getDb().prepare('UPDATE print_agents SET active = 0 WHERE id = ?').run(Number(req.params.id));
  res.json({ success: true });
});
router.post('/agents/:id/scan', ADMIN, (req, res) => {
  getDb().prepare('UPDATE print_agents SET scan_requested = 1, scan_result = NULL WHERE id = ?').run(Number(req.params.id));
  P.bus.emit('job');
  res.json({ success: true });
});

router.post('/jobs/:id/retry', ADMIN, (req, res) => {
  getDb().prepare("UPDATE print_jobs SET status = 'pending', error = NULL, attempts = 0 WHERE id = ?").run(Number(req.params.id));
  P.bus.emit('job');
  res.json({ success: true });
});

/* -------- Documentos (cualquier usuario con sesión: meseros, caja, cocina) -------- */
const needAgentMode = (db, res) => { if (P.printMode(db) !== 'agent') { res.status(400).json({ error: 'La impresión en red está desactivada' }); return false; } return true; };
const queued = (res, n, what) => n > 0 ? res.json({ queued: n }) : res.status(400).json({ error: `No hay impresora activa para ${what}. Configúrala en Configuración → Impresoras.` });

router.post('/kitchen', (req, res) => {
  const db = getDb();
  if (!needAgentMode(db, res)) return;
  const n = P.enqueueKitchen(db, req.body.orderId, req.body.batch ? Number(req.body.batch) : null, { user: req.user?.name, mode: req.body.station ? 'station' : undefined });
  queued(res, n, 'cocina o barra');
});
router.post('/prebill', (req, res) => {
  const db = getDb();
  if (!needAgentMode(db, res)) return;
  try { queued(res, P.enqueuePreBill(db, req.body.orderId, req.body.tipPct, req.user?.name), 'la caja'); } catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/receipt', (req, res) => {
  const db = getDb();
  if (!needAgentMode(db, res)) return;
  try { queued(res, P.enqueueReceipt(db, req.body.orderId, req.user?.name), 'la caja'); } catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/shift-report', (req, res) => {
  const db = getDb();
  if (!needAgentMode(db, res)) return;
  const shift = req.body.shiftId
    ? db.prepare('SELECT * FROM cash_shifts WHERE id = ?').get(Number(req.body.shiftId))
    : require('../cashHelpers').getOpenShift(db);
  if (!shift) return res.status(404).json({ error: 'Turno no encontrado' });
  const stats = require('./shifts').getShiftLiveStats(db, shift);
  queued(res, P.enqueueShiftReport(db, stats, req.body.type === 'Z' || shift.status === 'closed', req.user?.name), 'la caja');
});

/* ================= Agente ================= */
const agentRouter = Router();
const AGENT_SCRIPT = path.join(__dirname, '..', '..', 'agent', 'agente-impresion.ps1');

agentRouter.get('/script', (req, res) => {
  res.type('text/plain; charset=utf-8').send(fs.readFileSync(AGENT_SCRIPT, 'utf8'));
});

function agentAuth(req, res, next) {
  const db = getDb();
  const agent = P.agentByToken(db, req.get('X-Agent-Token'));
  if (!agent) return res.status(401).json({ error: 'Agente no autorizado' });
  req.agent = agent;
  next();
}

// Consulta larga: responde apenas haya trabajos (o a los 25 s). Sirve también de latido del agente.
agentRouter.post('/poll', agentAuth, async (req, res) => {
  const db = getDb();
  const b = req.body || {};
  const info = { version: String(b.version || '').slice(0, 20), hostname: String(b.hostname || '').slice(0, 60), ip: req.ip, localIps: Array.isArray(b.ips) ? b.ips.map(String).filter(x => IP_RE.test(x)).slice(0, 8) : [] };
  db.prepare("UPDATE print_agents SET last_seen = datetime('now', '-5 hours'), info = ? WHERE id = ?").run(JSON.stringify(info), req.agent.id);
  if (Array.isArray(b.printers)) {
    const upd = db.prepare("UPDATE printers SET online = ?, checked_at = datetime('now', '-5 hours') WHERE id = ?");
    for (const p of b.printers) if (p && p.id) upd.run(p.online ? 1 : 0, Number(p.id));
  }
  if (Array.isArray(b.scan)) db.prepare('UPDATE print_agents SET scan_result = ?, scan_requested = 0 WHERE id = ?').run(JSON.stringify(b.scan.map(String).slice(0, 100)), req.agent.id);
  const answer = () => {
    const a = db.prepare('SELECT scan_requested FROM print_agents WHERE id = ?').get(req.agent.id);
    const jobs = P.claimJobs(db, req.agent.id);
    return { jobs, scan: Boolean(a && a.scan_requested) && !Array.isArray(b.scan), printers: P.listPrinters(db).filter(p => p.active).map(p => ({ id: p.id, ip: p.ip, port: p.port, name: p.name })) };
  };
  let out = answer();
  if (out.jobs.length || out.scan || b.nowait) return res.json(out);
  const wait = Math.min(25000, Math.max(1000, Number(b.wait) || 25000));
  await new Promise(resolve => {
    const t = setTimeout(done, wait);
    function done() { clearTimeout(t); P.bus.off('job', done); resolve(); }
    P.bus.on('job', done);
    res.on('close', done); // el agente se desconectó (en Node moderno req 'close' salta al terminar de leer el cuerpo)
  });
  if (res.writableEnded || res.destroyed) return;
  out = answer();
  res.json(out);
});

agentRouter.post('/jobs/:id/result', agentAuth, (req, res) => {
  P.finishJob(getDb(), Number(req.params.id), Boolean(req.body.ok), req.body.error);
  res.json({ success: true });
});

module.exports = { router, agentRouter };
