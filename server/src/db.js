const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const { initModulesSchema } = require('./modules');

const DB_PATH = path.join(__dirname, '..', 'data.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
    migrateSchema();
    initModulesSchema(db);
    seedIfEmpty();
    syncSpecialProducts();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'cashier', 'kitchen'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL,
      color TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category_id INTEGER NOT NULL REFERENCES categories(id),
      price INTEGER NOT NULL,
      available INTEGER NOT NULL DEFAULT 1,
      image TEXT,
      description TEXT,
      sizes TEXT,
      color_bg TEXT,
      color_accent TEXT,
      featured INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      document_id TEXT DEFAULT '222222222222',
      email TEXT DEFAULT '',
      phone TEXT UNIQUE NOT NULL,
      address TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      is_company INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('dine-in', 'pickup', 'delivery')),
      status TEXT NOT NULL DEFAULT 'delivered' CHECK(status IN ('pending', 'preparing', 'ready', 'shipped', 'delivered', 'cancelled')),
      customer_name TEXT NOT NULL DEFAULT 'Consumidor Final',
      customer_doc TEXT DEFAULT '222222222222',
      customer_email TEXT DEFAULT '',
      customer_phone TEXT DEFAULT '',
      customer_address TEXT DEFAULT '',
      customer_id INTEGER REFERENCES customers(id),
      is_electronic_invoice INTEGER DEFAULT 0,
      table_number INTEGER,
      subtotal INTEGER NOT NULL,
      delivery_fee INTEGER NOT NULL DEFAULT 0,
      discount INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL,
      payment_method TEXT NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'paid',
      cash_received INTEGER DEFAULT 0,
      cash_change INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-5 hours')),
      driver_id INTEGER REFERENCES drivers(id),
      receipt_image TEXT,
      notes TEXT DEFAULT '',
      shift_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      size TEXT,
      flavors TEXT,
      quantity INTEGER NOT NULL,
      price INTEGER NOT NULL,
      notes TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS cash_shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      cashier_name TEXT NOT NULL,
      opened_at TEXT NOT NULL DEFAULT (datetime('now', '-5 hours')),
      closed_at TEXT,
      initial_cash INTEGER NOT NULL DEFAULT 0,
      expected_cash INTEGER DEFAULT 0,
      actual_cash INTEGER DEFAULT 0,
      difference INTEGER DEFAULT 0,
      total_cash_sales INTEGER DEFAULT 0,
      total_card_debit INTEGER DEFAULT 0,
      total_card_credit INTEGER DEFAULT 0,
      total_transfer INTEGER DEFAULT 0,
      total_sales INTEGER DEFAULT 0,
      total_orders INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed')),
      notes TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS cash_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER NOT NULL REFERENCES cash_shifts(id),
      type TEXT NOT NULL CHECK(type IN ('withdrawal', 'deposit')),
      amount INTEGER NOT NULL,
      reason TEXT NOT NULL,
      cashier_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-5 hours'))
    );

    CREATE TABLE IF NOT EXISTS drivers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      available INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

function migrateSchema() {
  const addCol = (table, col, def) => {
    try {
      db.prepare(`SELECT ${col} FROM ${table} LIMIT 1`).get();
    } catch {
      try {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
        console.log(`✅ Added ${col} to ${table}`);
      } catch (e) {
        // column may already exist
      }
    }
  };

  db.exec(`
    CREATE TABLE IF NOT EXISTS cash_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER NOT NULL REFERENCES cash_shifts(id),
      type TEXT NOT NULL CHECK(type IN ('withdrawal', 'deposit')),
      amount INTEGER NOT NULL,
      reason TEXT NOT NULL,
      cashier_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-5 hours'))
    );
  `);

  addCol('orders', 'customer_doc', "TEXT DEFAULT '222222222222'");
  addCol('orders', 'customer_email', "TEXT DEFAULT ''");
  addCol('orders', 'is_electronic_invoice', "INTEGER DEFAULT 0");
  addCol('orders', 'cash_received', "INTEGER DEFAULT 0");
  addCol('orders', 'cash_change', "INTEGER DEFAULT 0");
  addCol('orders', 'discount', "INTEGER DEFAULT 0");
  addCol('orders', 'shift_id', "INTEGER");
  addCol('orders', 'notes', "TEXT DEFAULT ''");
  addCol('orders', 'receipt_image', "TEXT");
  addCol('orders', 'payment_split', "TEXT");

  // Migration: Ensure orders table has no restrictive CHECK constraint on payment_method
  try {
    const ordersTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='orders'").get();
    if (ordersTableSql && ordersTableSql.sql && ordersTableSql.sql.includes("CHECK(payment_method IN") && !ordersTableSql.sql.includes("'mixed'")) {
      console.log('🔄 Migrating orders table to support mixed payments...');
      db.exec(`
        PRAGMA foreign_keys=off;
        BEGIN TRANSACTION;
        CREATE TABLE orders_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL DEFAULT 'pickup',
          status TEXT NOT NULL DEFAULT 'delivered',
          customer_name TEXT NOT NULL DEFAULT 'Consumidor Final',
          customer_doc TEXT DEFAULT '222222222222',
          customer_email TEXT DEFAULT '',
          customer_phone TEXT DEFAULT '',
          customer_address TEXT DEFAULT '',
          customer_id INTEGER,
          is_electronic_invoice INTEGER DEFAULT 0,
          table_number INTEGER,
          subtotal INTEGER NOT NULL,
          delivery_fee INTEGER NOT NULL DEFAULT 0,
          discount INTEGER NOT NULL DEFAULT 0,
          total INTEGER NOT NULL,
          payment_method TEXT NOT NULL,
          payment_status TEXT NOT NULL DEFAULT 'paid',
          cash_received INTEGER DEFAULT 0,
          cash_change INTEGER DEFAULT 0,
          payment_split TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now', '-5 hours')),
          driver_id INTEGER,
          receipt_image TEXT,
          notes TEXT DEFAULT '',
          shift_id INTEGER
        );
        INSERT INTO orders_new (
          id, type, status, customer_name, customer_doc, customer_email, customer_phone, customer_address,
          customer_id, is_electronic_invoice, table_number, subtotal, delivery_fee, discount, total,
          payment_method, payment_status, cash_received, cash_change, payment_split, created_at,
          driver_id, receipt_image, notes, shift_id
        ) SELECT 
          id, type, status, customer_name,
          COALESCE(customer_doc, '222222222222'),
          COALESCE(customer_email, ''),
          COALESCE(customer_phone, ''),
          COALESCE(customer_address, ''),
          customer_id,
          COALESCE(is_electronic_invoice, 0),
          table_number, subtotal,
          COALESCE(delivery_fee, 0),
          COALESCE(discount, 0),
          total, payment_method,
          COALESCE(payment_status, 'paid'),
          COALESCE(cash_received, 0),
          COALESCE(cash_change, 0),
          payment_split, created_at, driver_id, receipt_image,
          COALESCE(notes, ''),
          shift_id
        FROM orders;
        DROP TABLE orders;
        ALTER TABLE orders_new RENAME TO orders;
        COMMIT;
        PRAGMA foreign_keys=on;
      `);
      console.log('✅ orders table migrated successfully for mixed payments!');
    }
  } catch (migErr) {
    console.error('Error migrating orders table for mixed payment:', migErr);
  }

  addCol('order_items', 'size', "TEXT");
  addCol('order_items', 'flavors', "TEXT");

  addCol('products', 'color_bg', "TEXT");
  addCol('products', 'color_accent', "TEXT");
  addCol('products', 'featured', "INTEGER DEFAULT 0");
  addCol('products', 'sizes', "TEXT");

  addCol('customers', 'document_id', "TEXT DEFAULT '222222222222'");
  addCol('customers', 'email', "TEXT DEFAULT ''");
  addCol('customers', 'is_company', "INTEGER DEFAULT 0");
  addCol('users', 'active', "INTEGER DEFAULT 1");

}

// Sincroniza categorías y productos especiales del catálogo base.
// Se ejecuta DESPUÉS de seedIfEmpty(): en una base de datos nueva las tablas están vacías
// y este bloque fallaría por claves foráneas, dejando la base sin usuarios ni productos.
function syncSpecialProducts() {
  try {
    const existingCat = db.prepare('SELECT id FROM categories WHERE id = 6').get();
    if (!existingCat) {
      db.prepare("INSERT OR REPLACE INTO categories (id, name, emoji, color) VALUES (6, 'Affogatos', '☕', '#7C8455')").run();
    }
    db.prepare("INSERT OR REPLACE INTO categories (id, name, emoji, color) VALUES (4, 'Bebidas', '🥤', '#364266')").run();
    db.prepare("INSERT OR REPLACE INTO categories (id, name, emoji, color) VALUES (5, 'Toppings', '🧇', '#897863')").run();

    // 1. Remove unwanted products across categories
    db.prepare("DELETE FROM products WHERE name LIKE '%Arroz con Leche%'").run();
    db.prepare("DELETE FROM products WHERE category_id = 4 AND (name LIKE '%Americano%' OR name LIKE '%Gas%' OR name LIKE '%Capuchino%')").run();
    db.prepare("DELETE FROM products WHERE category_id = 5 AND name LIKE '%Topping%'").run();

    const gelatoSizesStd = JSON.stringify([
      { name: 'Pequeño (1 sabor)', price: 15000 },
      { name: 'Grande (2 sabores)', price: 21000 },
      { name: 'Litro (2 sabores)', price: 70000 },
    ]);

    const gelatoSizesSA = JSON.stringify([
      { name: 'Pequeño (1 sabor)', price: 17000 },
      { name: 'Grande (2 sabores)', price: 23000 },
      { name: 'Litro (2 sabores)', price: 75000 },
    ]);

    // Update standard gelato prices ($15.000 / $21.000)
    db.prepare("UPDATE products SET price = 15000, sizes = ? WHERE category_id IN (1, 2, 3) AND name NOT LIKE '%Sin Azúcar%'").run(gelatoSizesStd);

    // 2. Ensure Queso y Bocadillo with distinct Guayaba/Bocadillo styling
    const quesoBocadillo = db.prepare("SELECT id FROM products WHERE name LIKE '%Queso%Bocadillo%' OR name LIKE '%Bocadillo%Queso%'").get();
    if (!quesoBocadillo) {
      db.prepare(`
        INSERT INTO products (name, category_id, price, available, image, description, sizes, color_bg, color_accent, featured)
        VALUES ('Queso y Bocadillo', 1, 15000, 1, '/images/products/queso-bocadillo.webp', 'Gelato de queso campesino artesanal con dulce de bocadillo veleño', ?, '#FFF0EB', '#B9382F', 1)
      `).run(gelatoSizesStd);
    } else {
      db.prepare("UPDATE products SET name = 'Queso y Bocadillo', price = 15000, sizes = ?, color_bg = '#FFF0EB', color_accent = '#B9382F', available = 1 WHERE id = ?").run(gelatoSizesStd, quesoBocadillo.id);
    }

    // 3. Ensure Pistacho Sin Azúcar (SA) - $17.000 / $23.000 / $75.000
    const pistachoSA = db.prepare("SELECT id FROM products WHERE name LIKE '%Pistacho%Sin Az%' OR name LIKE '%SA Pistacho%' OR name LIKE '%Pistacho SA%'").get();
    if (!pistachoSA) {
      db.prepare(`
        INSERT INTO products (name, category_id, price, available, image, description, sizes, color_bg, color_accent, featured)
        VALUES ('Pistacho Sin Azúcar', 3, 17000, 1, '/images/products/pistacho-sin-azucar.webp', 'Auténtico pistacho italiano 100% puro sin azúcar añadida (SA)', ?, '#EAF2E8', '#4E7A4A', 1)
      `).run(gelatoSizesSA);
    } else {
      db.prepare("UPDATE products SET name = 'Pistacho Sin Azúcar', price = 17000, sizes = ?, image = '/images/products/pistacho-sin-azucar.webp', available = 1 WHERE id = ?").run(gelatoSizesSA, pistachoSA.id);
    }

    // 4. Ensure Affogatos (Cat 6)
    const affogato = db.prepare("SELECT id FROM products WHERE name = 'Affogato Clásico' OR name = 'Affogato'").get();
    if (!affogato) {
      db.prepare(`
        INSERT INTO products (name, category_id, price, available, image, description)
        VALUES ('Affogato Clásico', 6, 21000, 1, '/images/products/affogato.webp', 'Gelato artesanal al gusto con shot de espresso caliente italiano')
      `).run();
    } else {
      db.prepare("UPDATE products SET name = 'Affogato Clásico', price = 21000, image = '/images/products/affogato.webp', available = 1 WHERE id = ?").run(affogato.id);
    }

    const affogatoPistachoSA = db.prepare("SELECT id FROM products WHERE name LIKE '%Affogato%Pistacho%'").get();
    if (!affogatoPistachoSA) {
      db.prepare(`
        INSERT INTO products (name, category_id, price, available, image, description)
        VALUES ('Affogato Pistacho Sin Azúcar', 6, 22000, 1, '/images/products/affogato.webp', 'Gelato de Pistacho Sin Azúcar 100% puro con shot de espresso caliente italiano')
      `).run();
    } else {
      db.prepare("UPDATE products SET name = 'Affogato Pistacho Sin Azúcar', price = 22000, image = '/images/products/affogato.webp', available = 1 WHERE id = ?").run(affogatoPistachoSA.id);
    }

    // 5. Ensure EXACT Toppings & Adicionales (Cat 5): Conos, Salsa de Chocolate, Salsa de Pistacho, Tote Bag
    const conoProd = db.prepare("SELECT id FROM products WHERE category_id = 5 AND name LIKE '%Cono%'").get();
    if (!conoProd) {
      db.prepare("INSERT INTO products (name, category_id, price, available, image, description) VALUES ('Conos', 5, 2500, 1, '/images/products/cono.webp', 'Cono waffle crocante adicional')").run();
    } else {
      db.prepare("UPDATE products SET name = 'Conos', price = 2500, available = 1 WHERE id = ?").run(conoProd.id);
    }

    const salsaChoco = db.prepare("SELECT id FROM products WHERE category_id = 5 AND name LIKE '%Chocolate%'").get();
    if (!salsaChoco) {
      db.prepare("INSERT INTO products (name, category_id, price, available, image, description) VALUES ('Salsa de Chocolate', 5, 4000, 1, '/images/products/salsa-chocolate.webp', 'Salsa tibia de cacao artesanal')").run();
    } else {
      db.prepare("UPDATE products SET name = 'Salsa de Chocolate', price = 4000, available = 1 WHERE id = ?").run(salsaChoco.id);
    }

    const salsaPistacho = db.prepare("SELECT id FROM products WHERE category_id = 5 AND name LIKE '%Pistacho%' AND name LIKE '%Salsa%'").get();
    if (!salsaPistacho) {
      db.prepare("INSERT INTO products (name, category_id, price, available, image, description) VALUES ('Salsa de Pistacho', 5, 6000, 1, '/images/products/salsa-pistacho.webp', 'Cremosa salsa de pistacho italiano')").run();
    } else {
      db.prepare("UPDATE products SET name = 'Salsa de Pistacho', price = 6000, available = 1 WHERE id = ?").run(salsaPistacho.id);
    }

    const toteBag = db.prepare("SELECT id FROM products WHERE category_id = 5 AND name LIKE '%Tote Bag%'").get();
    if (!toteBag) {
      db.prepare("INSERT INTO products (name, category_id, price, available, image, description) VALUES ('Tote Bag', 5, 25000, 1, '/images/products/tote-bag.webp', 'Bolsa ecológica de la marca')").run();
    } else {
      db.prepare("UPDATE products SET name = 'Tote Bag', price = 25000, available = 1 WHERE id = ?").run(toteBag.id);
    }

    // 6. Ensure EXACT Bebidas (Cat 4): Agua Cristal, Café
    const aguaProd = db.prepare("SELECT id FROM products WHERE category_id = 4 AND (name LIKE '%Agua%' OR name LIKE '%Cristal%' OR name LIKE '%Hatsu%')").get();
    if (!aguaProd) {
      db.prepare("INSERT INTO products (name, category_id, price, available, image, description) VALUES ('Agua Cristal', 4, 6000, 1, '/images/products/agua.webp', 'Botella de agua purificada Cristal')").run();
    } else {
      db.prepare("UPDATE products SET name = 'Agua Cristal', price = 6000, image = '/images/products/agua.webp', available = 1 WHERE id = ?").run(aguaProd.id);
    }

    const cafeProd = db.prepare("SELECT id FROM products WHERE category_id = 4 AND name LIKE '%Café%'").get();
    if (!cafeProd) {
      db.prepare("INSERT INTO products (name, category_id, price, available, image, description) VALUES ('Café', 4, 5000, 1, '/images/products/vaso-pequeno.webp', 'Café colombiano de especialidad')").run();
    } else {
      db.prepare("UPDATE products SET name = 'Café', price = 5000, image = '/images/products/vaso-pequeno.webp', available = 1 WHERE id = ?").run(cafeProd.id);
    }

    // Auto-migrate any legacy .png product image paths to .webp
    db.prepare("UPDATE products SET image = REPLACE(image, '.png', '.webp') WHERE image LIKE '%.png'").run();
  } catch (err) {
    console.error('Error syncing special products:', err);
  }
}

function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) as c FROM categories').get().c;
  if (count > 0) return;

  console.log('🌱 Seeding database with base demo catalog...');

  const hash = (pw) => bcrypt.hashSync(pw, 10);
  const insertUser = db.prepare('INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)');
  insertUser.run('admin', hash('Admin2026*'), 'Administrador', 'admin');
  insertUser.run('cajero', hash('Cajero2026*'), 'Caja Principal', 'cashier');
  insertUser.run('cocina', hash('Cocina2026*'), 'Despacho', 'kitchen');

  // Categories (ejemplo)
  const insertCat = db.prepare('INSERT INTO categories (id, name, emoji, color) VALUES (?, ?, ?, ?)');
  const cats = [
    [1, 'Clásicos',            '🍨', '#C6BF81'],
    [2, 'Frutales',            '🍓', '#E87A90'],
    [3, 'Especiales',          '✨', '#D4A373'],
    [4, 'Bebidas & Café',      '☕', '#364266'],
    [5, 'Acompañamientos',     '🧇', '#897863'],
  ];
  for (const c of cats) insertCat.run(...c);

  // Products & Gelatos
  const insertProd = db.prepare(`
    INSERT INTO products (id, name, category_id, price, available, image, description, sizes, color_bg, color_accent, featured)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
  `);

  const gelatoSizes = JSON.stringify([
    { name: 'Pequeño (1 sabor)', price: 15000 },
    { name: 'Grande (2 sabores)', price: 21000 },
    { name: 'Litro (2 sabores)', price: 70000 },
  ]);

  const prods = [
    // SABORES DE EJEMPLO (reemplazar por el catálogo del cliente)
    [1,  'Pistacho',            1, 15000, '/images/gelatos/pistacho.webp',        'Auténtica pasta de pistacho italiana',   gelatoSizes, '#E7EAD9', '#7C8455', 1],
    [2,  'Chocolate',           1, 15000, '/images/gelatos/chocolate.webp',       'Intenso, cremoso y clásico cacao',      gelatoSizes, '#EAD9CB', '#6B4226', 1],
    [3,  'Avellana',            1, 15000, '/images/gelatos/avellana.webp',        'Avellana tostada y cremosa piamontesa', gelatoSizes, '#EFE0D1', '#8B5E3C', 0],
    [4,  'Vainilla',            1, 15000, '/images/gelatos/vainilla.webp',        'Clásica, suave y aromática',            gelatoSizes, '#F7EED8', '#C9A24B', 0],
    [5,  'Stracciatella',       1, 15000, '/images/gelatos/stracciatella.webp',   'Fior di latte y chispas de chocolate',  gelatoSizes, '#F1EEE7', '#4A4A4A', 1],

    [6,  'Corozo',              2, 15000, '/images/gelatos/corozo.webp',          'Fruto auténtico y refrescante del Caribe', gelatoSizes, '#F7D9DE', '#B03A5B', 1],
    [7,  'Maracuyá',            2, 15000, '/images/gelatos/maracuya.webp',        'Cítrico, tropical y refrescante',       gelatoSizes, '#FBEFCF', '#D9A220', 1],
    [8,  'Maracuyá y Corozo',   2, 15000, '/images/gelatos/maracuya-corozo.webp', 'Dúo cítrico caribeño inolvidable',     gelatoSizes, '#FAE3D0', '#C75B3F', 0],
    [9,  'Yogurt con Amarenas', 2, 15000, '/images/gelatos/yogurt-amarenas.webp', 'Yogurt artesanal con cerezas amarena', gelatoSizes, '#F6DFE3', '#A03B52', 1],

    [10, 'Milo',                3, 15000, '/images/gelatos/milo.webp',            'El favorito crujiente de casa',         gelatoSizes, '#EDDECC', '#7A5230', 1],
    [11, 'Arroz con Leche',     3, 15000, '/images/gelatos/arroz-con-leche.webp', 'Sabor tradicional de la abuela con canela', gelatoSizes, '#F3EBDA', '#B99B62', 0],
    [12, 'Coco y Almendra',     3, 15000, '/images/gelatos/coco-almendra.webp',   'Cremoso con tropezones crocantes',      gelatoSizes, '#F4F0E6', '#A48B5F', 0],

    // BEBIDAS & CAFÉ (cat 4)
    [13, 'Café Espresso',       4,  4000, null, 'Espresso italiano clásico', null, null, null, 0],
    [14, 'Café Americano',      4,  5000, null, 'Café suave recién tostado', null, null, null, 0],
    [15, 'Capuchino Artesanal', 4,  7000, null, 'Espresso con leche texturizada', null, null, null, 0],
    [16, 'Agua Mineral / Gas',  4,  5000, null, 'Botella 500ml', null, null, null, 0],

    // ACOMPAÑAMIENTOS (cat 5)
    [17, 'Cono Waffle Crocante',5,  2500, null, 'Cono artesanal recién horneado', null, null, null, 0],
    [18, 'Topping de Pistacho', 5,  3000, null, 'Pistacho picado tostado', null, null, null, 0],
    [19, 'Salsa de Chocolate',  5,  2000, null, 'Salsa tibia de cacao artesanal', null, null, null, 0],
  ];

  for (const p of prods) insertProd.run(...p);

  // Default Generic Customer (Consumidor Final 222222222222)
  const insertCust = db.prepare(`
    INSERT INTO customers (id, name, document_id, email, phone, address, notes, is_company)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertCust.run(1, 'Consumidor Final', '222222222222', 'cliente@ejemplo.com', '3000000000', 'Punto de Venta', 'Cliente genérico mostrador', 0);
  insertCust.run(2, 'Empresa Ejemplo S.A.S', '901234567-8', 'contabilidad@ejemplo.com', '3109998877', 'Cra 5 #10-20', 'Factura Electrónica', 1);

  // Staff / Cajeros
  const insertDriver = db.prepare('INSERT INTO drivers (name, phone, available) VALUES (?, ?, 1)');
  insertDriver.run('cajero:Cajero 1 (Principal)', '3001112233');
  insertDriver.run('cajero:Cajero 2 (Apoyo)', '3002223344');

  // Settings
  const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
  insertSetting.run('businessName', 'Mi Heladería');
  insertSetting.run('businessSlogan', 'Helado artesanal');
  insertSetting.run('businessAddress', 'Calle 0 # 0-00, Ciudad');
  insertSetting.run('businessPhone', '300 000 0000');
  insertSetting.run('businessNit', '000.000.000-0');
  insertSetting.run('deliveryFee', '5000');
  insertSetting.run('tableCount', '8');
  insertSetting.run('invoicePrefix', 'POS');

  // Initial Open Cash Shift for the event
  const insertShift = db.prepare(`
    INSERT INTO cash_shifts (id, user_id, cashier_name, opened_at, initial_cash, status, notes)
    VALUES (1, 2, 'Caja Principal', datetime('now', '-5 hours'), 100000, 'open', 'Turno inicial de demostración')
  `);
  insertShift.run();

  // Seed sample initial convention orders
  const insertOrder = db.prepare(`
    INSERT INTO orders (
      id, type, status, customer_name, customer_doc, customer_email, customer_phone, customer_address,
      table_number, subtotal, delivery_fee, discount, total, payment_method, payment_status,
      cash_received, cash_change, created_at, shift_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  const insertItem = db.prepare(`
    INSERT INTO order_items (order_id, product_id, name, size, flavors, quantity, price, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date();
  const iso = (minAgo) => new Date(now.getTime() - minAgo * 60000).toISOString().replace('T', ' ').slice(0, 19);

  // Sample order 1 - Efectivo Pequeño
  insertOrder.run(1001, 'pickup', 'delivered', 'Consumidor Final', '222222222222', '', '3000000000', '', null, 15000, 0, 0, 15000, 'cash', 'paid', 20000, 5000, iso(45));
  insertItem.run(1001, 1, 'Gelato Pequeño - Pistacho', 'Pequeño (1 sabor)', 'Pistacho', 1, 15000, '');

  // Sample order 2 - Datáfono Débito Grande 2 sabores
  insertOrder.run(1002, 'dine-in', 'delivered', 'Consumidor Final', '222222222222', '', '', '', 2, 21000, 0, 0, 21000, 'card_debit', 'paid', 0, 0, iso(25));
  insertItem.run(1002, 10, 'Gelato Grande - Milo + Maracuyá', 'Grande (2 sabores)', 'Milo, Maracuyá', 1, 21000, '');

  // Sample order 3 - Transferencia Nequi
  insertOrder.run(1003, 'pickup', 'delivered', 'Carlos Mendoza', '1047456789', 'carlos@email.com', '3001234567', '', null, 36000, 0, 0, 36000, 'transfer', 'paid', 0, 0, iso(10));
  insertItem.run(1003, 6, 'Gelato Pequeño - Corozo', 'Pequeño (1 sabor)', 'Corozo', 1, 15000, '');
  insertItem.run(1003, 1, 'Gelato Grande - Pistacho + Stracciatella', 'Grande (2 sabores)', 'Pistacho, Stracciatella', 1, 21000, '');

  console.log('✅ Database seeded successfully');
}

module.exports = { getDb };

