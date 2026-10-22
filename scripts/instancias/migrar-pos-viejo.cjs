/**
 * Migra los datos de la versión vieja del POS (la primitiva que usaba Fritop) a una instalación nueva.
 * Lee la base vieja SOLO LECTURA (hace una copia consistente primero) y escribe en la base nueva:
 * usuarios (con sus mismas contraseñas), categorías, productos, mesas, ventas cerradas con sus productos y el nombre
 * del negocio. Las cuentas que quedaron abiertas o a medias en la versión vieja no se pasan (se informan).
 *
 * Uso (con el proceso de la instalación nueva DETENIDO):
 *   pm2 stop pos-<slug>
 *   cd /home/ubuntu/apps/pos-<slug>/server && node ../scripts/instancias/migrar-pos-viejo.cjs <base-vieja.db> [data.db]
 *   pm2 start pos-<slug>
 */
const path = require('path');
const fs = require('fs');
const Database = require(path.join(process.cwd(), 'node_modules', 'better-sqlite3'));

const OLD = process.argv[2];
const NEW = process.argv[3] || path.join(process.cwd(), 'data.db');
if (!OLD || !fs.existsSync(OLD)) { console.log('Uso: node migrar-pos-viejo.cjs <base-vieja.db> [data.db nueva]'); process.exit(1); }

(async () => {
  // Copia consistente de la base vieja (incluye lo que esté en su WAL) para leerla sin tocar el sistema en uso
  const snap = path.join(path.dirname(NEW), `vieja-${Date.now()}.db`);
  const src = new Database(OLD, { readonly: true, fileMustExist: true });
  await src.backup(snap); src.close();
  const old = new Database(snap, { readonly: true });
  const db = new Database(NEW);
  db.pragma('foreign_keys = OFF');
  const has = (t, c) => old.prepare(`PRAGMA table_info(${t})`).all().some(x => x.name === c);
  const report = {};

  db.transaction(() => {
    // Usuarios: mismas contraseñas (bcrypt) para que entren igual que antes
    const profileOf = r => (r === 'admin' ? 'admin' : r === 'kitchen' ? 'kitchen' : 'cashier');
    for (const u of old.prepare('SELECT * FROM users').all()) {
      const cur = db.prepare('SELECT id FROM users WHERE username = ?').get(u.username);
      if (cur) db.prepare('UPDATE users SET password = ?, name = ?, role = ?, profile = ?, active = 1 WHERE id = ?').run(u.password, u.name, u.role, profileOf(u.role), cur.id);
      else db.prepare('INSERT INTO users (username, password, name, role, active, profile) VALUES (?, ?, ?, ?, 1, ?)').run(u.username, u.password, u.name, u.role, profileOf(u.role));
    }
    report.usuarios = old.prepare('SELECT COUNT(*) c FROM users').get().c;

    // Menú (mismos id para que el historial quede enlazado)
    db.prepare('DELETE FROM products').run();
    db.prepare('DELETE FROM categories').run();
    const insCat = db.prepare('INSERT INTO categories (id, name, emoji, color) VALUES (?, ?, ?, ?)');
    for (const c of old.prepare('SELECT * FROM categories').all()) insCat.run(c.id, c.name, c.emoji || '🍽️', c.color || '#C2410C');
    const insProd = db.prepare('INSERT INTO products (id, name, category_id, price, available, image, description, sizes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const p of old.prepare('SELECT * FROM products').all()) {
      const img = p.image && !/default\.(jpg|png|webp)$/i.test(p.image) ? p.image : null;
      const sizes = p.sizes && p.sizes !== 'null' && p.sizes !== '[]' ? p.sizes : null;
      insProd.run(p.id, String(p.name).trim(), p.category_id, p.price, p.available ? 1 : 0, img, p.description || null, sizes);
    }
    report.categorias = old.prepare('SELECT COUNT(*) c FROM categories').get().c;
    report.productos = old.prepare('SELECT COUNT(*) c FROM products').get().c;

    // Mesas: las que tenía la versión vieja (tableCount); las demás de la semilla se quitan si no se usan
    const tableCount = Number((old.prepare("SELECT value FROM settings WHERE key = 'tableCount'").get() || {}).value) || 0;
    if (tableCount > 0) {
      const room = db.prepare('SELECT id FROM rooms ORDER BY id LIMIT 1').get();
      const existing = db.prepare('SELECT id, label FROM tables').all();
      for (let n = 1; n <= tableCount; n++) if (!existing.some(t => t.label === String(n)) && room) db.prepare('INSERT INTO tables (room_id, label, shape, seats, x, y, w, h, sort_order) VALUES (?, ?, \'square\', 4, ?, ?, 1, 1, ?)').run(room.id, String(n), (n - 1) % 4, Math.floor((n - 1) / 4), n);
      for (const t of existing) if (Number(t.label) > tableCount) db.prepare('DELETE FROM tables WHERE id = ?').run(t.id);
    }
    const tableId = new Map(db.prepare('SELECT id, label FROM tables').all().map(t => [t.label, t.id]));

    // Ventas cerradas con sus productos (mismos números de pedido)
    db.prepare('DELETE FROM order_items').run();
    db.prepare('DELETE FROM orders').run();
    const insOrder = db.prepare(`INSERT INTO orders (id, type, status, customer_name, customer_phone, customer_address, table_number, table_id, table_label, subtotal, delivery_fee, discount, total,
      payment_method, payment_status, created_at, closed_at, delivered_at, notes, cashier_name, created_by, channel, branch_id)
      VALUES (?, ?, 'delivered', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, 'Versión anterior', 'Versión anterior', 'local', 1)`);
    const insItem = db.prepare(`INSERT INTO order_items (order_id, product_id, name, quantity, price, notes, batch, sent_at, kitchen_status)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, 'ready')`);
    const delivered = old.prepare("SELECT * FROM orders WHERE status = 'delivered' ORDER BY id").all();
    const itemsOf = old.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id');
    let items = 0;
    for (const o of delivered) {
      const label = o.table_number ? String(o.table_number) : null;
      const pm = ['cash', 'card', 'transfer', 'card_debit', 'card_credit'].includes(o.payment_method) ? o.payment_method : 'cash';
      insOrder.run(o.id, o.type, o.customer_name || 'Consumidor Final', o.customer_phone || null, o.customer_address || null, o.table_number || null, label ? tableId.get(label) || null : null, label,
        o.subtotal || o.total, o.delivery_fee || 0, o.total, pm, o.payment_status === 'paid' ? 'paid' : 'pending', o.created_at, o.created_at, o.created_at, has('orders', 'notes') ? (o.notes || '') : '');
      for (const it of itemsOf.all(o.id)) { insItem.run(o.id, it.product_id || 0, it.name, it.quantity, it.price, it.notes || '', o.created_at); items++; }
    }
    report.ventas = delivered.length;
    report.productos_vendidos = items;
    report.no_migradas_abiertas = old.prepare("SELECT COUNT(*) c FROM orders WHERE status != 'delivered'").get().c;
    const maxId = db.prepare('SELECT MAX(id) m FROM orders').get().m || 0;
    db.prepare("INSERT INTO sqlite_sequence (name, seq) SELECT 'orders', ? WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'orders')").run(maxId);
    db.prepare("UPDATE sqlite_sequence SET seq = MAX(seq, ?) WHERE name = 'orders'").run(maxId);

    // Nombre del negocio
    const name = (old.prepare("SELECT value FROM settings WHERE key = 'businessName'").get() || {}).value;
    if (name) db.prepare("INSERT INTO settings (key, value) VALUES ('businessName', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(name);
  })();

  old.close(); db.close(); fs.unlinkSync(snap);
  console.log('Migración terminada:', JSON.stringify(report));
})().catch(e => { console.error('✗', e.message); process.exit(1); });
