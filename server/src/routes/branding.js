const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db');
const { requireRole } = require('../auth');

const router = Router();

const PUBLIC_DIR = path.resolve(__dirname, '../../../public');
const DIST_DIR = path.resolve(__dirname, '../../../dist');

const IMAGE_KINDS = { logo: 'logoUrl', logoLogin: 'logoLoginUrl', favicon: 'faviconUrl', appleIcon: 'appleIconUrl' };
const IMAGE_EXT_BY_MIME = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/svg+xml': '.svg', 'image/webp': '.webp' };
const FONT_EXTS = ['.ttf', '.otf', '.woff', '.woff2'];

// Guarda en public/ (desarrollo con Vite) y en dist/ (producción servida por Nginx) sin recompilar.
function saveFile(subdir, filename, buffer) {
  const pubDir = path.join(PUBLIC_DIR, subdir);
  fs.mkdirSync(pubDir, { recursive: true });
  fs.writeFileSync(path.join(pubDir, filename), buffer);
  if (fs.existsSync(DIST_DIR)) {
    const distDir = path.join(DIST_DIR, subdir);
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(path.join(distDir, filename), buffer);
  }
  return `/${subdir}/${filename}`.replace(/\\/g, '/');
}

function setSetting(db, key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
}

function getJsonSetting(db, key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row || !row.value) return fallback;
  try { return JSON.parse(row.value); } catch { return fallback; }
}

function parseDataUrl(data) {
  const m = String(data || '').match(/^data:([^;,]*);base64,(.+)$/);
  if (!m) return null;
  return { mime: m[1].toLowerCase(), buffer: Buffer.from(m[2], 'base64') };
}

// PUT /api/branding/theme  { theme: { primary, accent, background, dark?, card?, muted?, wine?, fontHeading?, fontBody?, fontScript? } }
router.put('/theme', requireRole('admin'), (req, res) => {
  const theme = req.body && req.body.theme;
  if (!theme || typeof theme !== 'object') return res.status(400).json({ error: 'Tema inválido' });
  const allowed = ['primary', 'accent', 'background', 'dark', 'card', 'muted', 'wine', 'fontHeading', 'fontBody', 'fontScript'];
  const clean = {};
  for (const k of allowed) {
    const v = theme[k];
    if (v === undefined || v === null || v === '') continue;
    clean[k] = String(v).slice(0, 80);
  }
  if (!clean.primary || !clean.accent || !clean.background) {
    return res.status(400).json({ error: 'Se requieren los colores principal, acento y fondo' });
  }
  setSetting(getDb(), 'theme', JSON.stringify(clean));
  res.json({ success: true, theme: clean });
});

// POST /api/branding/image  { kind: 'logo'|'logoLogin'|'favicon'|'appleIcon', filename, data: dataURL }
router.post('/image', requireRole('admin'), (req, res) => {
  try {
    const { kind, filename, data } = req.body || {};
    const settingKey = IMAGE_KINDS[kind];
    if (!settingKey) return res.status(400).json({ error: 'Tipo de imagen inválido' });
    const parsed = parseDataUrl(data);
    if (!parsed) return res.status(400).json({ error: 'La imagen debe enviarse en base64 (data URL)' });
    if (parsed.buffer.length > 5 * 1024 * 1024) return res.status(400).json({ error: 'La imagen supera 5 MB' });

    const ext = IMAGE_EXT_BY_MIME[parsed.mime] || (path.extname(filename || '') || '.png').toLowerCase();
    if (!['.png', '.jpg', '.svg', '.webp'].includes(ext)) return res.status(400).json({ error: 'Formato no soportado (PNG, JPG, SVG o WEBP)' });

    const name = `${kind}_${Date.now()}${ext}`;
    const url = saveFile('branding', name, parsed.buffer);
    setSetting(getDb(), settingKey, url);
    res.json({ success: true, url, key: settingKey });
  } catch (err) {
    console.error('Error guardando imagen de marca:', err);
    res.status(500).json({ error: 'No se pudo guardar la imagen' });
  }
});

// DELETE /api/branding/image/:kind  → vuelve al logo/ícono de ejemplo
router.delete('/image/:kind', requireRole('admin'), (req, res) => {
  const settingKey = IMAGE_KINDS[req.params.kind];
  if (!settingKey) return res.status(400).json({ error: 'Tipo de imagen inválido' });
  setSetting(getDb(), settingKey, '');
  res.json({ success: true, key: settingKey });
});

// POST /api/branding/font  { family, filename, data: dataURL }
router.post('/font', requireRole('admin'), (req, res) => {
  try {
    const { family, filename, data } = req.body || {};
    const cleanFamily = String(family || '').trim().replace(/[^\w\s-]/g, '').slice(0, 40);
    if (cleanFamily.length < 2) return res.status(400).json({ error: 'Indica un nombre para la fuente (mínimo 2 caracteres)' });
    const ext = (path.extname(filename || '') || '').toLowerCase();
    if (!FONT_EXTS.includes(ext)) return res.status(400).json({ error: 'Formato de fuente no soportado (TTF, OTF, WOFF o WOFF2)' });
    const parsed = parseDataUrl(data);
    if (!parsed) return res.status(400).json({ error: 'La fuente debe enviarse en base64 (data URL)' });
    if (parsed.buffer.length > 8 * 1024 * 1024) return res.status(400).json({ error: 'La fuente supera 8 MB' });

    const safe = cleanFamily.replace(/[^a-zA-Z0-9]+/g, '-');
    const name = `${safe}_${Date.now()}${ext}`;
    const url = saveFile('fonts/uploads', name, parsed.buffer);

    const db = getDb();
    const list = getJsonSetting(db, 'customFonts', []).filter(f => f && f.family !== cleanFamily);
    list.push({ family: cleanFamily, url });
    setSetting(db, 'customFonts', JSON.stringify(list));
    res.json({ success: true, font: { family: cleanFamily, url }, customFonts: list });
  } catch (err) {
    console.error('Error guardando fuente:', err);
    res.status(500).json({ error: 'No se pudo guardar la fuente' });
  }
});

// DELETE /api/branding/font/:family
router.delete('/font/:family', requireRole('admin'), (req, res) => {
  const db = getDb();
  const family = decodeURIComponent(req.params.family);
  const list = getJsonSetting(db, 'customFonts', []).filter(f => f && f.family !== family);
  setSetting(db, 'customFonts', JSON.stringify(list));
  res.json({ success: true, customFonts: list });
});

module.exports = router;
