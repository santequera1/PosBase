/**
 * Configuración inicial de una instalación nueva (asistente de primer arranque).
 * Una base de datos recién creada queda con setupPending = 1: no se puede iniciar sesión hasta completar este paso,
 * que crea el administrador con su contraseña, guarda los datos del negocio, activa los módulos según el tipo de
 * negocio y deja el catálogo vacío o con un menú de ejemplo. Si el servidor tiene SETUP_TOKEN, se exige.
 */
const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');

const router = Router();

const TYPES = {
  restaurant: { label: 'Restaurante (mesas, para llevar, domicilios y cocina)', modules: { tables: true, counter: true, delivery: true, kitchen: true } },
  fastfood: { label: 'Comidas rápidas (mostrador, domicilios y cocina)', modules: { tables: false, counter: true, delivery: true, kitchen: true } },
  icecream: { label: 'Heladería / cafetería (mostrador y domicilios)', modules: { tables: false, counter: true, delivery: true, kitchen: false } },
  bar: { label: 'Bar / café con mesas', modules: { tables: true, counter: true, delivery: false, kitchen: true } },
};

// Menús de ejemplo por tipo de negocio (el de heladería es la semilla original)
const SAMPLE_MENUS = {
  restaurant: [
    ['Hamburguesas', '🍔', [['Hamburguesa clásica', 22000], ['Hamburguesa doble carne', 28000], ['Hamburguesa de pollo', 24000]]],
    ['Platos fuertes', '🍽️', [['Churrasco', 38000], ['Pechuga a la plancha', 30000], ['Costillas BBQ', 36000]]],
    ['Acompañamientos', '🍟', [['Papas a la francesa', 8000], ['Aros de cebolla', 9000], ['Ensalada de la casa', 7000]]],
    ['Bebidas', '🥤', [['Gaseosa personal', 5000], ['Limonada natural', 7000], ['Agua', 4000]]],
  ],
  fastfood: [
    ['Hamburguesas', '🍔', [['Hamburguesa clásica', 18000], ['Hamburguesa especial', 24000]]],
    ['Perros y salchipapas', '🌭', [['Perro caliente', 14000], ['Salchipapa', 16000]]],
    ['Combos', '🍱', [['Combo hamburguesa + papas + gaseosa', 26000]]],
    ['Bebidas', '🥤', [['Gaseosa personal', 5000], ['Jugo natural', 7000]]],
  ],
  bar: [
    ['Cafés', '☕', [['Espresso', 4000], ['Capuchino', 7000], ['Latte', 8000]]],
    ['Para picar', '🧀', [['Tabla de quesos', 28000], ['Nachos', 18000]]],
    ['Bebidas', '🍹', [['Limonada de coco', 12000], ['Cerveza nacional', 7000], ['Coctel de la casa', 25000]]],
  ],
};

// Estilo inicial según el tipo de negocio (se cambia en Configuración → Marca)
const THEME_RESTAURANT = { primary: '#111111', accent: '#F7C600', background: '#FFFBEA', dark: '#0B0B0B', card: '#FFF3C4', muted: '#6E6A5A', wine: '#D99A00', fontHeading: 'Inter', fontBody: 'Inter', fontScript: 'Lobster', mode: 'light' };
const THEME_ICECREAM = { primary: '#7A4E86', accent: '#C49CC6', background: '#FFFDF0', dark: '#4A2D55', card: '#FBF5BE', muted: '#8A7391', wine: '#EF6A5C', fontHeading: 'Inter', fontBody: 'Fredoka', fontScript: 'Pacifico', mode: 'light' };

const readSetting = (db, k) => (db.prepare('SELECT value FROM settings WHERE key = ?').get(k) || {}).value;
const setSetting = (db, k, v) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(v));
const isPending = db => readSetting(db, 'setupPending') === '1';

router.get('/status', (req, res) => {
  const db = getDb();
  res.json({ pending: isPending(db), tokenRequired: Boolean(process.env.SETUP_TOKEN), types: Object.entries(TYPES).map(([id, t]) => ({ id, label: t.label })) });
});

router.post('/', (req, res) => {
  const db = getDb();
  if (!isPending(db)) return res.status(409).json({ error: 'Esta instalación ya está configurada' });
  const b = req.body || {};
  if (process.env.SETUP_TOKEN && String(b.token || '') !== process.env.SETUP_TOKEN) return res.status(403).json({ error: 'Código de instalación incorrecto (está en el mensaje que dejó el instalador)' });
  const str = (v, max) => String(v ?? '').trim().slice(0, max);
  const businessName = str(b.businessName, 80);
  const adminName = str(b.adminName, 80) || 'Administrador';
  const adminUsername = str(b.adminUsername, 40).toLowerCase() || 'admin';
  const adminPassword = String(b.adminPassword || '');
  const type = TYPES[b.businessType] ? b.businessType : 'restaurant';
  const catalog = b.catalog === 'sample' ? 'sample' : 'empty';
  if (businessName.length < 2) return res.status(400).json({ error: 'Escribe el nombre del negocio' });
  if (!/^[a-z0-9._-]{3,40}$/.test(adminUsername)) return res.status(400).json({ error: 'El usuario debe tener entre 3 y 40 letras o números (sin espacios)' });
  if (adminPassword.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });

  db.transaction(() => {
    // Administrador: el de la semilla pasa a ser el del cliente; los usuarios de demostración se eliminan
    const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get();
    db.prepare('UPDATE users SET username = ?, name = ?, password = ? WHERE id = ?').run(adminUsername, adminName, bcrypt.hashSync(adminPassword, 10), admin.id);

    // Datos del negocio
    setSetting(db, 'businessName', businessName);
    setSetting(db, 'businessNit', str(b.nit, 30));
    setSetting(db, 'businessAddress', str(b.address, 160));
    setSetting(db, 'businessPhone', str(b.phone, 40));
    setSetting(db, 'businessSlogan', str(b.slogan, 120));
    const prefix = businessName.normalize('NFKD').replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 3) || 'POS';
    setSetting(db, 'invoicePrefix', prefix.length >= 2 ? prefix : businessName.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'POS');
    setSetting(db, 'restaurantModules', JSON.stringify(TYPES[type].modules));
    setSetting(db, 'businessType', type);
    setSetting(db, 'theme', JSON.stringify(type === 'icecream' ? THEME_ICECREAM : THEME_RESTAURANT));
    setSetting(db, 'mobileNav', 'top');

    // Arranque limpio: sin ventas, turnos ni clientes de ejemplo (queda Consumidor Final)
    db.prepare('DELETE FROM order_items').run();
    db.prepare('DELETE FROM orders').run();
    for (const t of ['cash_movements', 'cash_shifts', 'drivers']) { try { db.prepare(`DELETE FROM ${t}`).run(); } catch { /* tabla opcional */ } }
    db.prepare("DELETE FROM customers WHERE document_id != '222222222222'").run();
    try { db.prepare('DELETE FROM journal_lines').run(); db.prepare('DELETE FROM journal_entries').run(); } catch { /* contabilidad aún sin asientos */ }
    // Los usuarios de demostración se eliminan después de sus turnos de caja (los referencian)
    db.prepare("DELETE FROM users WHERE id != ? AND username IN ('cajero', 'cocina', 'mesero')").run(admin.id);

    // Catálogo: vacío, o de ejemplo según el tipo (la heladería conserva el de la semilla)
    if (catalog === 'empty' || (type !== 'icecream' && SAMPLE_MENUS[type])) {
      db.prepare('DELETE FROM products').run();
      db.prepare('DELETE FROM categories').run();
    }
    if (catalog === 'sample' && SAMPLE_MENUS[type]) {
      const insCat = db.prepare('INSERT INTO categories (name, emoji, color) VALUES (?, ?, ?)');
      const insProd = db.prepare('INSERT INTO products (name, category_id, price, available, description, featured) VALUES (?, ?, ?, 1, ?, 0)');
      const colors = ['#C2410C', '#B45309', '#0F766E', '#1D4ED8', '#7C3AED'];
      SAMPLE_MENUS[type].forEach(([cat, emoji, prods], i) => {
        const catId = Number(insCat.run(cat, emoji, colors[i % colors.length]).lastInsertRowid);
        for (const [name, price] of prods) insProd.run(name, catId, price, 'Producto de ejemplo: edítalo o bórralo en Menú');
      });
    }
    // Las fotos de ejemplo de la heladería llevan la marca de otro cliente (GIA): el menú de ejemplo queda sin fotos
    if (type === 'icecream') db.prepare('UPDATE products SET image = NULL').run();
    db.prepare("DELETE FROM settings WHERE key = 'setupPending'").run();
  })();
  res.json({ ok: true, username: adminUsername });
});

module.exports = router;
module.exports.isSetupPending = isPending;
