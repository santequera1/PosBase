/** Modo demostración: lista y aplica paquetes de negocio ficticio (solo en instalaciones con DEMO_MODE=1). */
const { Router } = require('express');
const { getDb } = require('../db');
const { requireRole } = require('../auth');
const DP = require('../demoPacks');

const router = Router();

router.get('/packs', (req, res) => {
  if (!DP.demoEnabled()) return res.json({ enabled: false, packs: [] });
  res.json({ enabled: true, packs: DP.listPacks(getDb()) });
});

router.post('/apply', requireRole('admin'), (req, res) => {
  if (!DP.demoEnabled()) return res.status(403).json({ error: 'Esta instalación no es de demostración' });
  try {
    const r = DP.applyPack(getDb(), String((req.body || {}).pack || ''), req.user?.name);
    if (req.app.io) req.app.io.emit('demo:applied', r);
    res.json(r);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
