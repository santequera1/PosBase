const { Router } = require('express');
const { getDb } = require('../db');

const router = Router();

// Datos de marca necesarios ANTES de iniciar sesión (pantalla de acceso, favicon, tema).
// No expone nada sensible: solo nombre, eslogan, logos, tema y fuentes.
const KEYS = ['businessName', 'businessSlogan', 'logoUrl', 'logoLoginUrl', 'faviconUrl', 'appleIconUrl', 'theme', 'customFonts'];

router.get('/branding', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`SELECT key, value FROM settings WHERE key IN (${KEYS.map(() => '?').join(',')})`).all(...KEYS);
  const out = {
    businessName: 'Mi Heladería',
    businessSlogan: '',
    logoUrl: '',
    logoLoginUrl: '',
    faviconUrl: '',
    appleIconUrl: '',
    theme: null,
    customFonts: [],
  };
  for (const r of rows) {
    if (r.key === 'theme' || r.key === 'customFonts') {
      try { out[r.key] = JSON.parse(r.value); } catch { /* valor inválido: se ignora */ }
    } else {
      out[r.key] = r.value;
    }
  }
  res.set('Cache-Control', 'no-store');
  res.json(out);
});

module.exports = router;
