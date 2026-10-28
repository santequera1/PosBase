// Entrega dist/index.html con los metadatos de ESTA instalación (título, descripción, imagen y color), para que al
// compartir el enlace por WhatsApp o redes salga el nombre y el logo del negocio y no "Punto de Venta" genérico.
// nginx sirve los archivos del build y manda aquí cualquier otra ruta (la app es una sola página).
const fs = require('fs');
const path = require('path');
const { getDb } = require('./db');

const INDEX = path.resolve(__dirname, '../../dist/index.html');
const KEYS = ['businessName', 'businessSlogan', 'logoUrl', 'logoSmallUrl', 'loginImageUrl', 'theme'];

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function readSettings() {
  const out = {};
  try {
    const rows = getDb().prepare(`SELECT key, value FROM settings WHERE key IN (${KEYS.map(() => '?').join(',')})`).all(...KEYS);
    for (const r of rows) out[r.key] = r.value;
  } catch { /* sin base: se usan los valores genéricos */ }
  return out;
}

/** Arma el HTML de la página con los metadatos del negocio. `base` es la dirección pública (https://dominio). */
function renderIndex(html, s, base) {
  const name = (s.businessName || '').trim() || 'Punto de Venta';
  const slogan = (s.businessSlogan || '').trim();
  const desc = slogan ? `${slogan} · ${name}` : `${name}: pedidos, ventas, caja y reportes en un solo lugar.`;
  const img = s.loginImageUrl || s.logoUrl || s.logoSmallUrl || '';
  let color = '';
  try { color = JSON.parse(s.theme || 'null')?.primary || ''; } catch { /* tema inválido */ }

  let out = html
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(name)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${esc(desc)}" />`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${esc(name)}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/?>/, `<meta property="og:description" content="${esc(desc)}" />`);
  if (/^#[0-9a-fA-F]{6}$/.test(color)) out = out.replace(/<meta name="theme-color" content="[^"]*"\s*\/?>/, `<meta name="theme-color" content="${esc(color)}" />`);

  const extra = [
    `<meta property="og:url" content="${esc(base + '/')}" />`,
    `<meta property="og:site_name" content="${esc(name)}" />`,
    `<meta property="og:locale" content="es_CO" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${esc(name)}" />`,
    `<meta name="twitter:description" content="${esc(desc)}" />`,
  ];
  if (img) {
    const abs = /^https?:\/\//.test(img) ? img : base + (img.startsWith('/') ? '' : '/') + img;
    extra.push(`<meta property="og:image" content="${esc(abs)}" />`, `<meta name="twitter:image" content="${esc(abs)}" />`);
  }
  return out.replace('</head>', extra.map((l) => '    ' + l).join('\n') + '\n  </head>');
}

/** Ruta de Express: GET de cualquier página de la app (no /api, no archivos). Si no hay build, sigue al 404 normal. */
function indexHandler(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  let html;
  try { html = fs.readFileSync(INDEX, 'utf8'); } catch { return next(); }
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  const host = (req.get('x-forwarded-host') || req.get('host') || 'localhost').split(',')[0].trim();
  const base = `${proto}://${host}`;
  res.set('Cache-Control', 'no-cache, must-revalidate');
  res.type('html').send(renderIndex(html, readSettings(), base));
}

module.exports = { indexHandler, renderIndex };
