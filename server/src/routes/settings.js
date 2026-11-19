const { Router } = require('express');
const { getDb } = require('../db');
const { requireRole } = require('../auth');

const router = Router();

router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of rows) {
    settings[row.key] = row.value === '' || row.value === null || isNaN(row.value) ? row.value : Number(row.value);
  }
  res.json(settings);
});

// Clave del módulo de IA para WhatsApp (solo admin). Se define en server/.env (WHATSAPP_AI_API_KEY).
router.get('/integration', requireRole('admin'), (req, res) => {
  res.json({
    whatsappApiKey: process.env.WHATSAPP_AI_API_KEY || '',
    configured: Boolean(process.env.WHATSAPP_AI_API_KEY),
  });
});

router.put('/', requireRole('admin'), (req, res) => {
  const db = getDb();
  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');

  const body = { ...(req.body || {}) };
  // El valor del domicilio es para el domiciliario (no es ingreso del negocio): desde ese momento el envío no lleva impuesto.
  // Se guarda la fecha y hora del cambio para que lo ya facturado antes (con el impuesto) no cambie.
  if (body.deliveryFeeUntaxed !== undefined) {
    const on = body.deliveryFeeUntaxed === true || body.deliveryFeeUntaxed === 1 || body.deliveryFeeUntaxed === '1' || body.deliveryFeeUntaxed === 'true';
    const cur = db.prepare("SELECT value FROM settings WHERE key = 'deliveryFeeUntaxedFrom'").get();
    if (on && !(cur && cur.value)) upsert.run('deliveryFeeUntaxedFrom', db.prepare("SELECT datetime('now', '-5 hours') AS d").get().d);
    if (!on) upsert.run('deliveryFeeUntaxedFrom', '');
    delete body.deliveryFeeUntaxed;
    delete body.deliveryFeeUntaxedFrom;
  }
  for (const [key, value] of Object.entries(body)) {
    upsert.run(key, String(value));
  }

  // Return updated settings
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of rows) {
    settings[row.key] = row.value === '' || row.value === null || isNaN(row.value) ? row.value : Number(row.value);
  }
  res.json(settings);
});

module.exports = router;
