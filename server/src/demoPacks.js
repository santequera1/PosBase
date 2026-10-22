/**
 * Paquetes de demostración: cada uno es un negocio ficticio completo (marca, estilo, menú, mesas y una semana de
 * ventas) para mostrar el sistema "con cara del negocio" del prospecto. SOLO se pueden aplicar en instalaciones de
 * demostración (DEMO_MODE=1 en server/.env): aplicar un paquete borra el menú y las ventas.
 *
 * Logos y fotos: cuando el diseñador entregue cada marca, van en public/demo-packs/<id>/ (logo.png, logo-login.png,
 * y fotos con el nombre del producto en minúsculas y guiones, p. ej. pizza-margarita.webp) y se enlazan solos.
 */
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

const T = (primary, accent, background, card, dark, muted, wine, fontHeading, fontScript) => ({ primary, accent, background, card, dark, muted, wine, fontHeading, fontBody: 'Inter', fontScript, mode: 'light' });
const MOD = {
  restaurant: { tables: true, counter: true, delivery: true, kitchen: true },
  fastfood: { tables: false, counter: true, delivery: true, kitchen: true },
  icecream: { tables: false, counter: true, delivery: true, kitchen: false },
  cafe: { tables: true, counter: true, delivery: false, kitchen: true },
};
const GELATO_SIZES = JSON.stringify([{ name: 'Pequeño (1 sabor)', price: 15000 }, { name: 'Grande (2 sabores)', price: 21000 }, { name: 'Litro (2 sabores)', price: 70000 }]);

const PACKS = [
  {
    id: 'hamburgueseria', label: 'Hamburguesería / comida rápida', type: 'fastfood', modules: { ...MOD.restaurant, tables: true }, tables: 8, deliveryFee: 5000,
    brand: { businessName: 'Bruto Burger', slogan: 'Hamburguesas a la parrilla', receiptFooter: '¡Gracias por elegir Bruto Burger! Pide a domicilio por WhatsApp' },
    theme: T('#161616', '#FF6B1A', '#FFF8F1', '#FFE6D1', '#0B0B0B', '#6B5E55', '#E0461B', 'Oswald', 'Lobster'),
    sales: { perDay: [14, 22], dineIn: 0.45, delivery: 0.35 },
    menu: [
      ['Hamburguesas', '🍔', '#E0461B', [['Bruta clásica', 24000, 'Carne de res 150 g, queso, tocineta y salsa de la casa'], ['Doble Bruta', 32000, 'Doble carne, doble queso cheddar'], ['Burger BBQ', 29000, 'Aros de cebolla y salsa BBQ ahumada'], ['Burger de pollo crispy', 26000, 'Pechuga apanada y salsa miel mostaza'], ['Burger vegetariana', 25000, 'Medallón de garbanzo y vegetales']]],
      ['Perros y salchipapas', '🌭', '#F59E0B', [['Perro sencillo', 15000], ['Perro especial', 19000, 'Tocineta, queso y papita ripio'], ['Salchipapa personal', 18000], ['Salchipapa para compartir', 32000]]],
      ['Combos', '🍱', '#B45309', [['Combo Bruta + papas + gaseosa', 33000], ['Combo pareja (2 burgers + papas + 2 gaseosas)', 62000], ['Combo familiar (4 burgers + papas grandes)', 115000]]],
      ['Acompañamientos', '🍟', '#CA8A04', [['Papas a la francesa', 8000], ['Papas con queso y tocineta', 14000], ['Aros de cebolla', 10000], ['Alitas BBQ x6', 22000]]],
      ['Bebidas', '🥤', '#0E7490', [['Gaseosa personal', 5000], ['Limonada natural', 7000], ['Limonada de coco', 11000], ['Malteada de vainilla', 13000], ['Cerveza nacional', 7000]]],
    ],
  },
  {
    id: 'heladeria', label: 'Heladería y postres', type: 'icecream', modules: MOD.icecream, tables: 0, deliveryFee: 4000, gelato: true,
    brand: { businessName: 'Nube Polar', slogan: 'Helado artesanal', receiptFooter: '¡Gracias por endulzar tu día con Nube Polar!' },
    theme: T('#1F5E5B', '#7FD1C3', '#F4FBF9', '#FDE2E8', '#163F3D', '#5F7F7C', '#F28CA8', 'Fredoka', 'Pacifico'),
    sales: { perDay: [18, 30], dineIn: 0, delivery: 0.25 },
    menu: [
      // Las categorías 1, 2 y 3 son los sabores (pantalla de vasos, conos y litro)
      ['Clásicos', '🍨', '#7FD1C3', [['Vainilla', 15000, 'Vainilla natural'], ['Chocolate', 15000, 'Cacao intenso'], ['Fresa', 15000, 'Fresas frescas'], ['Arequipe', 15000, 'Dulce de leche casero']], GELATO_SIZES],
      ['Frutales', '🍓', '#F28CA8', [['Maracuyá', 15000, 'Ácido y tropical'], ['Mango biche', 15000, 'Con un toque de sal'], ['Corozo', 15000, 'Fruta del Caribe'], ['Limón', 15000, 'Refrescante (sin lácteos)']], GELATO_SIZES],
      ['Especiales', '✨', '#1F5E5B', [['Cookies & cream', 15000], ['Pistacho', 17000, 'Pasta de pistacho'], ['Queso con bocadillo', 15000], ['Coco', 15000]], GELATO_SIZES],
      ['Malteadas', '🥤', '#F59E0B', [['Malteada de vainilla', 14000], ['Malteada de chocolate', 14000], ['Malteada de fresa', 14000], ['Malteada de oreo', 16000]]],
      ['Postres', '🍰', '#B45309', [['Brownie con helado', 15000], ['Waffle con helado y frutas', 18000], ['Banana split', 19000]]],
      ['Bebidas y toppings', '☕', '#5F7F7C', [['Café americano', 5000], ['Agua', 4000], ['Topping extra', 2500], ['Cono adicional', 2500]]],
    ],
  },
  {
    id: 'italiana', label: 'Pizzería / comida italiana', type: 'restaurant', modules: MOD.restaurant, tables: 10, deliveryFee: 6000,
    brand: { businessName: 'Nonna Lucia', slogan: 'Cucina italiana', receiptFooter: 'Grazie mille! Te esperamos de nuevo en Nonna Lucia' },
    theme: T('#24452F', '#D7263D', '#FFF9EF', '#F4E7CF', '#1A3323', '#6B6151', '#B91C1C', 'Playfair Display', 'Great Vibes'),
    sales: { perDay: [12, 20], dineIn: 0.65, delivery: 0.25 },
    menu: [
      ['Pizzas', '🍕', '#D7263D', [['Pizza margarita', 32000, 'Tomate, mozzarella fresca y albahaca', [{ name: 'Personal', price: 22000 }, { name: 'Mediana', price: 32000 }, { name: 'Familiar', price: 46000 }]], ['Pizza pepperoni', 36000, 'Pepperoni y mozzarella', [{ name: 'Personal', price: 25000 }, { name: 'Mediana', price: 36000 }, { name: 'Familiar', price: 52000 }]], ['Pizza cuatro quesos', 38000, 'Mozzarella, parmesano, gorgonzola y provolone', [{ name: 'Personal', price: 26000 }, { name: 'Mediana', price: 38000 }, { name: 'Familiar', price: 55000 }]], ['Pizza prosciutto e funghi', 39000, 'Jamón serrano y champiñones', [{ name: 'Personal', price: 27000 }, { name: 'Mediana', price: 39000 }, { name: 'Familiar', price: 56000 }]]]],
      ['Pastas', '🍝', '#B45309', [['Spaghetti carbonara', 34000, 'Tocineta, huevo y parmesano'], ['Fettuccine Alfredo', 33000, 'Crema y parmesano'], ['Lasagna boloñesa', 36000, 'Receta de la nonna'], ['Ravioli de ricotta y espinaca', 35000], ['Penne all\'arrabbiata', 29000, 'Picante']]],
      ['Entradas', '🥖', '#CA8A04', [['Pan de ajo con queso', 14000], ['Bruschettas x4', 16000], ['Ensalada caprese', 19000], ['Carpaccio de res', 26000]]],
      ['Postres', '🍮', '#7C2D12', [['Tiramisú', 15000], ['Panna cotta', 13000], ['Affogato', 12000]]],
      ['Bebidas', '🍷', '#24452F', [['Copa de vino tinto', 18000], ['Botella de vino de la casa', 85000], ['Limonada de hierbabuena', 8000], ['Agua con gas', 6000], ['Café espresso', 5000]]],
    ],
  },
  {
    id: 'cafe', label: 'Café y panadería', type: 'restaurant', modules: MOD.cafe, tables: 6, deliveryFee: 4000,
    brand: { businessName: 'Grano & Miga', slogan: 'Café de origen y pan del día', receiptFooter: 'Gracias por tu visita · Pan recién horneado todos los días' },
    theme: T('#4A2C1A', '#D9A05B', '#FBF5EC', '#F1E2CC', '#2E1B10', '#7A6552', '#A16207', 'Fraunces', 'Caveat'),
    sales: { perDay: [25, 40], dineIn: 0.5, delivery: 0 },
    menu: [
      ['Cafés', '☕', '#4A2C1A', [['Espresso', 4500], ['Americano', 5000], ['Capuchino', 7500], ['Latte', 8000], ['Mocaccino', 9000], ['Café frío', 9500]]],
      ['Panadería', '🥐', '#D9A05B', [['Croissant de mantequilla', 6000], ['Pan de bono', 3000], ['Almojábana', 3000], ['Pandebono relleno', 4500], ['Pan integral (bolsa)', 9000]]],
      ['Desayunos', '🍳', '#A16207', [['Desayuno tradicional', 16000, 'Huevos, arepa, queso y café'], ['Calentado', 18000], ['Tostada francesa', 15000], ['Bowl de frutas y granola', 14000]]],
      ['Postres', '🍰', '#7A6552', [['Torta de chocolate (porción)', 9000], ['Cheesecake de frutos rojos', 11000], ['Galleta de avena', 4000]]],
      ['Bebidas', '🧃', '#166534', [['Jugo natural en agua', 6000], ['Jugo natural en leche', 7500], ['Chocolate caliente', 6500], ['Aromática', 3500]]],
    ],
  },
  {
    id: 'tipica', label: 'Comida típica / almuerzos', type: 'restaurant', modules: MOD.restaurant, tables: 12, deliveryFee: 4000,
    brand: { businessName: 'Fogón Criollo', slogan: 'Sazón de casa', receiptFooter: 'Gracias por almorzar con nosotros · Menú del día de lunes a sábado' },
    theme: T('#8C2F14', '#F2B134', '#FFF7EC', '#FBE4C4', '#5A1D0C', '#7A5A45', '#C2410C', 'Bitter', 'Satisfy'),
    sales: { perDay: [30, 50], dineIn: 0.7, delivery: 0.2 },
    menu: [
      ['Almuerzo del día', '🍛', '#8C2F14', [['Almuerzo ejecutivo', 16000, 'Sopa, seco, jugo y postre'], ['Almuerzo especial', 22000, 'Con proteína a elección'], ['Sopa del día', 7000]]],
      ['Platos típicos', '🍲', '#C2410C', [['Bandeja paisa', 32000], ['Sancocho de gallina', 26000], ['Mojarra frita con patacón', 34000], ['Pollo sudado', 22000], ['Arroz con pollo', 21000], ['Carne asada', 28000]]],
      ['Fritos', '🥟', '#F2B134', [['Empanada de carne', 3000], ['Arepa de huevo', 5000], ['Carimañola', 3500], ['Patacón con hogao', 9000]]],
      ['Bebidas', '🥤', '#166534', [['Jugo natural', 5000], ['Limonada', 5000], ['Gaseosa', 4000], ['Avena', 4500]]],
      ['Postres', '🍮', '#7A5A45', [['Arroz con leche', 5000], ['Dulce de papaya', 5000], ['Flan de caramelo', 6000]]],
    ],
  },
  {
    id: 'mariscos', label: 'Mariscos / restaurante costeño', type: 'restaurant', modules: MOD.restaurant, tables: 14, deliveryFee: 8000,
    brand: { businessName: 'Brisa Caribe', slogan: 'Marisquería', receiptFooter: '¡Gracias por visitarnos! Reserva para grupos por WhatsApp' },
    theme: T('#0E4D64', '#FF7F50', '#F2FAFB', '#D7EEF2', '#0A3546', '#4F6B75', '#E2553A', 'DM Serif Display', 'Dancing Script'),
    sales: { perDay: [12, 22], dineIn: 0.8, delivery: 0.15 },
    menu: [
      ['Entradas', '🦐', '#FF7F50', [['Ceviche de camarón', 32000], ['Coctel de camarón', 34000], ['Patacones con hogao', 14000], ['Deditos de pescado', 22000]]],
      ['Pescados', '🐟', '#0E4D64', [['Mojarra frita', 42000, 'Con arroz con coco, patacón y ensalada'], ['Pargo rojo frito', 58000], ['Filete de róbalo en salsa de camarón', 54000], ['Posta de sierra', 39000]]],
      ['Mariscos', '🦞', '#E2553A', [['Cazuela de mariscos', 52000], ['Arroz marinero', 48000], ['Langostinos al ajillo', 62000], ['Arroz con camarón', 44000]]],
      ['Para compartir', '🍽️', '#0A3546', [['Picada de mar para 2', 95000], ['Bandeja costeña para 4', 165000]]],
      ['Bebidas', '🍹', '#4F6B75', [['Limonada de coco', 12000], ['Jugo de corozo', 7000], ['Cerveza nacional', 7000], ['Coctel de la casa', 26000], ['Agua', 4000]]],
    ],
  },
];

const slug = s => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
/** Archivo de la marca/foto del paquete si el diseñador ya lo entregó (public/demo-packs/<id>/...). */
const asset = (packId, file) => {
  for (const ext of ['', '.webp', '.png', '.jpg', '.svg']) {
    const f = path.join(PUBLIC_DIR, 'demo-packs', packId, file + ext);
    if (fs.existsSync(f)) return `/demo-packs/${packId}/${file + ext}`;
  }
  return null;
};

/** Posición de la mesa n (1..total) en el plano: cuadrícula en porcentaje (x, y, ancho, alto de 0 a 100). */
const tableSpot = (n, total) => { const cols = total <= 8 ? 4 : total <= 15 ? 5 : 6; const rows = Math.ceil(total / cols); const colW = 90 / cols, rowH = 88 / rows; const i = n - 1; return { x: Math.round(5 + (i % cols) * colW), y: Math.round(6 + Math.floor(i / cols) * rowH), w: Math.round(colW * 0.55), h: Math.round(Math.min(16, rowH * 0.65)) }; };

const demoEnabled = () => process.env.DEMO_MODE === '1';
const readSetting = (db, k) => (db.prepare('SELECT value FROM settings WHERE key = ?').get(k) || {}).value;
const setSetting = (db, k, v) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(v));

function listPacks(db) {
  const current = readSetting(db, 'demoPack') || null;
  return PACKS.map(p => ({
    id: p.id, label: p.label, businessName: p.brand.businessName, slogan: p.brand.slogan, theme: p.theme, modules: p.modules,
    products: p.menu.reduce((a, c) => a + c[3].length, 0), sample: p.menu.flatMap(c => c[3].slice(0, 2).map(x => x[0])).slice(0, 5),
    logo: asset(p.id, 'logo'), current: current === p.id,
  }));
}

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const NAMES = ['María Gómez', 'Carlos Pérez', 'Ana Torres', 'Luis Ramírez', 'Sofía Herrera', 'Jorge Díaz', 'Valentina Ruiz', 'Andrés Castro', 'Laura Méndez', 'Felipe Rojas'];
const HOODS = ['Centro', 'Manga', 'Bocagrande', 'El Prado', 'Crespo', 'Pie de la Popa'];

/** Aplica un paquete: borra menú, ventas, cajas, clientes y asientos, y deja el negocio ficticio listo con una semana de ventas. */
function applyPack(db, packId, userName = 'Demo') {
  const p = PACKS.find(x => x.id === packId);
  if (!p) throw new Error('Paquete no encontrado');
  db.pragma('foreign_keys = OFF');
  const tx = db.transaction(() => {
    // 1) Limpiar lo transaccional (los usuarios y colaboradores de la demo se conservan)
    for (const t of ['order_item_cancellations', 'order_payments', 'order_items', 'stock_movements', 'ingredient_movements', 'print_jobs', 'tips', 'tip_payouts', 'cash_movements', 'cash_shifts', 'journal_lines', 'journal_entries', 'recipe_items', 'expense_payments', 'expenses', 'payroll_novelties', 'advances', 'loan_payments', 'employee_loans', 'attendance']) {
      try { db.prepare(`DELETE FROM ${t}`).run(); } catch { /* tabla opcional */ }
    }
    db.prepare('DELETE FROM orders').run();
    db.prepare("DELETE FROM customers WHERE document_id != '222222222222'").run();
    db.prepare('DELETE FROM products').run();
    db.prepare('DELETE FROM categories').run();

    // 2) Marca y estilo
    setSetting(db, 'businessName', p.brand.businessName);
    setSetting(db, 'businessSlogan', p.brand.slogan);
    setSetting(db, 'receiptFooter', p.brand.receiptFooter);
    setSetting(db, 'theme', JSON.stringify(p.theme));
    setSetting(db, 'restaurantModules', JSON.stringify(p.modules));
    setSetting(db, 'businessType', p.type);
    setSetting(db, 'deliveryFee', p.deliveryFee);
    setSetting(db, 'mobileNav', 'top');
    setSetting(db, 'logoUrl', asset(p.id, 'logo') || '');
    setSetting(db, 'logoLoginUrl', asset(p.id, 'logo-login') || asset(p.id, 'logo') || '');
    setSetting(db, 'demoPack', p.id);
    setSetting(db, 'invoicePrefix', p.brand.businessName.normalize('NFKD').replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 3) || 'POS');

    // 3) Menú (heladería: los sabores van en las categorías 1-3; los demás empiezan en 101 para no activar el modo helado)
    const insCat = db.prepare('INSERT INTO categories (id, name, emoji, color) VALUES (?, ?, ?, ?)');
    const insProd = db.prepare('INSERT INTO products (name, category_id, price, available, image, description, sizes, featured, station) VALUES (?, ?, ?, 1, ?, ?, ?, 0, ?)');
    let catId = p.gelato ? 1 : 101;
    for (const [cat, emoji, color, prods, catSizes] of p.menu) {
      insCat.run(catId, cat, emoji, color);
      const station = /bebida|caf|malteada/i.test(cat) ? 'barra' : 'cocina';
      for (const [name, price, desc, sizes] of prods) insProd.run(name, catId, price, asset(p.id, slug(name)), desc || null, sizes ? JSON.stringify(sizes) : (catSizes || null), station);
      catId++;
    }

    // 4) Mesas
    db.prepare('DELETE FROM tables').run();
    db.prepare('DELETE FROM rooms').run();
    if (p.tables > 0) {
      const room = Number(db.prepare("INSERT INTO rooms (name, sort_order) VALUES ('Salón', 1)").run().lastInsertRowid);
      for (let n = 1; n <= p.tables; n++) { const s = tableSpot(n, p.tables); db.prepare("INSERT INTO tables (room_id, label, shape, seats, x, y, w, h, sort_order) VALUES (?, ?, ?, 4, ?, ?, ?, ?, ?)").run(room, String(n), n % 3 === 0 ? 'round' : 'square', s.x, s.y, s.w, s.h, n); }
    }

    // 5) Caja abierta y una semana de ventas
    const cashier = db.prepare("SELECT id, name FROM users WHERE role != 'kitchen' ORDER BY (role = 'admin'), id LIMIT 1").get() || { id: 1, name: userName };
    const now = db.prepare("SELECT datetime('now', '-5 hours') AS d").get().d;
    const shiftId = Number(db.prepare("INSERT INTO cash_shifts (user_id, cashier_name, opened_at, initial_cash, status, notes, branch_id) VALUES (?, ?, ?, 200000, 'open', 'Caja de la demo', 1)").run(cashier.id, cashier.name, now).lastInsertRowid);
    const products = db.prepare('SELECT id, name, price, sizes FROM products').all();
    const tableRows = db.prepare('SELECT id, label FROM tables').all();
    const staff = db.prepare("SELECT e.id, e.name, u.profile FROM employees e LEFT JOIN users u ON u.id = e.user_id WHERE e.active = 1").all();
    const waiters = staff.filter(s => s.profile === 'waiter');
    const couriers = staff.filter(s => s.profile === 'courier');
    const insOrder = db.prepare(`INSERT INTO orders (type, status, customer_name, customer_phone, customer_address, customer_neighborhood, table_id, table_label, table_number, people, waiter_id, waiter_name, driver_id, driver_name,
      subtotal, delivery_fee, discount, total, tip, tip_to, payment_method, payment_status, payment_split, cash_received, created_at, closed_at, delivered_at, shift_id, cashier_name, created_by, channel, branch_id)
      VALUES (?, 'delivered', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'paid', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`);
    const insItem = db.prepare("INSERT INTO order_items (order_id, product_id, name, size, quantity, price, batch, sent_at, kitchen_status) VALUES (?, ?, ?, ?, ?, ?, 1, ?, 'ready')");
    const insTip = db.prepare('INSERT INTO tips (date, employee_id, amount, method, shift_id, notes) VALUES (?, NULL, ?, ?, ?, ?)');
    for (let day = 6; day >= 0; day--) {
      const n = rnd(p.sales.perDay[0], p.sales.perDay[1]);
      for (let i = 0; i < n; i++) {
        const r = Math.random();
        const type = r < p.sales.dineIn && tableRows.length ? 'dine-in' : r < p.sales.dineIn + p.sales.delivery ? 'delivery' : 'pickup';
        const hour = rnd(11, 21), min = rnd(0, 59);
        const at = db.prepare('SELECT datetime(date(?, ?), ?, ?) AS d').get(now, `-${day} days`, `+${hour} hours`, `+${min} minutes`).d;
        if (day === 0 && at > now) continue;
        const items = Array.from({ length: rnd(1, type === 'dine-in' ? 5 : 3) }, () => {
          const pr = pick(products);
          let size = null, price = pr.price;
          try { const s = pr.sizes ? JSON.parse(pr.sizes) : null; if (Array.isArray(s) && s.length) { const z = pick(s); size = z.name; price = z.price; } } catch { /* sin tamaños */ }
          return { pr, size, price, qty: rnd(1, 2) };
        });
        const subtotal = items.reduce((a, x) => a + x.price * x.qty, 0);
        const fee = type === 'delivery' ? p.deliveryFee : 0;
        const total = subtotal + fee;
        const tip = type === 'dine-in' && Math.random() < 0.6 ? Math.round(total * 0.1 / 100) * 100 : 0;
        const m = pick(['cash', 'cash', 'transfer', 'transfer', 'card', 'mixed']);
        const split = m === 'mixed' ? JSON.stringify({ parts: [{ method: 'cash', amount: Math.round((total + tip) / 2) }, { method: 'transfer', amount: total + tip - Math.round((total + tip) / 2) }] }) : null;
        const t = type === 'dine-in' ? pick(tableRows) : null;
        const w = type === 'dine-in' && waiters.length ? pick(waiters) : null;
        const c = type === 'delivery' && couriers.length ? pick(couriers) : null;
        const name = type === 'dine-in' ? 'Consumidor Final' : pick(NAMES);
        const info = insOrder.run(type, name, type === 'delivery' ? '300' + rnd(1000000, 9999999) : null, type === 'delivery' ? `Calle ${rnd(1, 80)} # ${rnd(1, 50)}-${rnd(1, 99)}` : null, type === 'delivery' ? pick(HOODS) : null,
          t ? t.id : null, t ? t.label : null, t ? Number(t.label) : null, type === 'dine-in' ? rnd(1, 6) : 0, w ? w.id : null, w ? w.name : null, c ? c.id : null, c ? c.name : null,
          subtotal, fee, total, tip, tip ? 'common' : null, m, split, m === 'cash' ? Math.ceil((total + tip) / 10000) * 10000 : 0, at, at, at, day === 0 ? shiftId : null, cashier.name, cashier.name, type === 'delivery' ? pick(['whatsapp', 'phone']) : 'local');
        const oid = Number(info.lastInsertRowid);
        for (const x of items) insItem.run(oid, x.pr.id, x.pr.name, x.size, x.qty, x.price, at);
        if (tip) insTip.run(at.slice(0, 10), tip, m === 'transfer' ? 'transfer' : m === 'card' ? 'card' : 'cash', day === 0 ? shiftId : null, `Propina pedido #${oid}`);
      }
    }
    // 6) Algunas mesas ocupadas ahora mismo (para que el plano no se vea vacío)
    if (tableRows.length) {
      const busy = [...tableRows].sort(() => Math.random() - 0.5).slice(0, Math.min(3, tableRows.length));
      for (const t of busy) {
        const items = Array.from({ length: rnd(2, 4) }, () => { const pr = pick(products); return { pr, qty: rnd(1, 2) }; });
        const subtotal = items.reduce((a, x) => a + x.pr.price * x.qty, 0);
        const w = waiters.length ? pick(waiters) : null;
        const at = db.prepare('SELECT datetime(?, ?) AS d').get(now, `-${rnd(5, 50)} minutes`).d;
        const oid = Number(db.prepare(`INSERT INTO orders (type, status, customer_name, table_id, table_label, table_number, people, waiter_id, waiter_name, subtotal, delivery_fee, discount, total,
          payment_method, payment_status, created_at, shift_id, cashier_name, created_by, channel, branch_id) VALUES ('dine-in', 'open', 'Consumidor Final', ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 'cash', 'pending', ?, ?, ?, ?, 'local', 1)`)
          .run(t.id, t.label, Number(t.label), rnd(2, 5), w ? w.id : null, w ? w.name : null, subtotal, subtotal, at, shiftId, cashier.name, w ? w.name : cashier.name).lastInsertRowid);
        for (const x of items) db.prepare("INSERT INTO order_items (order_id, product_id, name, quantity, price, batch, sent_at, kitchen_status) VALUES (?, ?, ?, ?, ?, 1, ?, 'pending')").run(oid, x.pr.id, x.pr.name, x.qty, x.pr.price, at);
      }
    }
  });
  tx();
  db.pragma('foreign_keys = ON');
  try { require('./ledger').syncLedger(db); } catch (e) { console.warn('Contabilidad de la demo:', e.message); }
  return { pack: p.id, businessName: p.brand.businessName, orders: db.prepare('SELECT COUNT(*) AS c FROM orders').get().c };
}

module.exports = { PACKS, listPacks, applyPack, demoEnabled };
