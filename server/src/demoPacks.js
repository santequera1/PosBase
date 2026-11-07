/**
 * Paquetes de demostración: cada uno es un negocio ficticio completo (marca, estilo, menú, mesas y seis meses de
 * operación, ver demoData.js) para mostrar el sistema "con cara del negocio" del prospecto. SOLO se pueden aplicar en
 * instalaciones de demostración (DEMO_MODE=1 en server/.env): aplicar un paquete borra el menú y toda la operación.
 *
 * Logos y fotos: cuando el diseñador entregue cada marca, van en public/demo-packs/<id>/ y se enlazan solos:
 *   logo (barra lateral), logo-oscuro (barra en modo oscuro), logo-pequeno (menú recogido), logo-login (formulario de
 *   acceso y fondos claros), favicon y apple-icon (ícono de la pestaña y del celular), portada-login (foto al lado del
 *   formulario), sin-foto (imagen de relleno para los productos que aún no tienen foto) y una foto por producto con el
 *   nombre en minúsculas y guiones (p. ej. pizza-margarita.webp). Las fotos van en lienzo cuadrado (900x900, el
 *   sujeto ocupa ~90 %) para que en las tarjetas del POS todas se vean del mismo tamaño.
 * Hecho: hamburgueseria (Mr. Franky's). Los demás paquetes siguen sin logos ni fotos.
 */
const fs = require('fs');
const path = require('path');

const DD = require('./demoData');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

const T = (primary, accent, background, card, dark, muted, wine, fontHeading, fontScript, fontBody = 'Inter') => ({ primary, accent, background, card, dark, muted, wine, fontHeading, fontBody, fontScript, mode: 'light' });
const MOD = {
  restaurant: { tables: true, counter: true, delivery: true, kitchen: true },
  fastfood: { tables: false, counter: true, delivery: true, kitchen: true },
  icecream: { tables: false, counter: true, delivery: true, kitchen: false },
  cafe: { tables: true, counter: true, delivery: false, kitchen: true },
};
const GELATO_SIZES = JSON.stringify([{ name: 'Pequeño (1 sabor)', price: 15000 }, { name: 'Grande (2 sabores)', price: 21000 }, { name: 'Litro (2 sabores)', price: 70000 }]);

const PACKS = [
  {
    // Marca Mr. Franky's (identidad de docs/clientes/mrfrankys/): rojo #F9002B, beige #F8EFDC y negro; barra lateral negra con el
    // logotipo rojo, fondo beige, botones rojos. Las fotos de los productos y los logos están en public/demo-packs/hamburgueseria/.
    id: 'hamburgueseria', label: 'Hamburguesería / comida rápida', type: 'fastfood', modules: { ...MOD.restaurant, tables: true }, tables: 8, deliveryFee: 5000,
    brand: { businessName: "Mr. Franky's", slogan: 'Muerde, disfruta y repite', receiptFooter: "¡Gracias por elegir Mr. Franky's! Pide a domicilio por WhatsApp", loginBg: '#F8EFDC', loginImageFit: 'cover', loginImageFocus: 'center', loginShowTitle: false },
    theme: T('#CC0023', '#F9002B', '#F8EFDC', '#FFF9EE', '#000000', '#6B5B52', '#F9002B', 'Poppins', 'Lobster'),
    sales: { perDay: [14, 22], dineIn: 0.45, delivery: 0.35 },
    menu: [
      ['Hamburguesas', '🍔', '#F9002B', [['Franky clásica', 22000, 'Carne de res 150 g, cheddar, tomate, cebolla, pepinillos y salsa Franky'], ['Franky tocineta', 26000, 'Carne, doble cheddar, tocineta crocante, lechuga y tomate'], ['Franky BBQ bacon', 27000, 'Carne a la parrilla, tocineta, cheddar fundido y salsa BBQ ahumada'], ['Doble Franky', 32000, 'Doble carne, doble cheddar, tocineta, tomate y lechuga'], ['Franky de pollo crispy', 24000, 'Pechuga apanada, queso, lechuga y mayonesa de ajo'], ['Franky veggie', 23000, 'Medallón de garbanzo, aguacate y vegetales']]],
      ['Pollo', '🍗', '#F59E0B', [['Presas de pollo x2', 16000, 'Dos presas apanadas con papas'], ['Nuggets x8', 15000, 'Con salsa a elección'], ['Alitas BBQ x6', 22000, 'Bañadas en salsa BBQ de la casa'], ['Pollo crispy en caja', 19000, 'Trocitos de pechuga apanada con papas']]],
      ['Combos', '🍱', '#B45309', [['Combo Franky clásica + papas + gaseosa', 30000], ['Combo pollo crispy + papas + gaseosa', 28000, 'Caja de pollo crispy, papas y gaseosa'], ['Combo Franky + nuggets', 31000, 'Hamburguesa clásica, 4 nuggets y gaseosa'], ['Combo pareja (2 burgers + papas + 2 gaseosas)', 58000], ['Combo familiar (4 burgers + papas grandes + 4 gaseosas)', 110000]]],
      ['Acompañamientos', '🍟', '#CA8A04', [['Papas a la francesa', 8000], ['Papas con queso y tocineta', 14000], ['Aros de cebolla', 10000], ['Salsas de la casa x3', 3000, 'Cheddar, ranch y ketchup']]],
      ['Bebidas', '🥤', '#0E7490', [['Gaseosa personal', 5000], ['Limonada natural', 7000], ['Limonada de coco', 11000], ['Café americano', 4500], ['Cerveza nacional', 7000]]],
      ['Malteadas y postres', '🍦', '#DB2777', [['Malteada de fresa', 13000, 'Con crema batida y cereza'], ['Malteada de vainilla', 13000], ['Malteada de chocolate', 13000], ['Brownie con helado', 12000]]],
    ],
  },
  {
    id: 'heladeria', label: 'Heladería y postres', type: 'icecream', modules: MOD.icecream, tables: 0, deliveryFee: 4000, gelato: true,
    brand: { businessName: 'Nube Polar', slogan: 'Helado artesanal', receiptFooter: '¡Gracias por endulzar tu día con Nube Polar!' },
    theme: T('#1F5E5B', '#7FD1C3', '#F4FBF9', '#FDE2E8', '#163F3D', '#5F7F7C', '#F28CA8', 'Inter', 'Pacifico', 'Fredoka'),
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
    // Para la tarjeta del paquete (fondo claro) sirve el logo del inicio de sesión; el de la barra lateral suele ser claro
    logo: asset(p.id, 'logo-login') || asset(p.id, 'logo'), current: current === p.id,
  }));
}

/** Aplica un paquete: borra menú y operación, y deja el negocio ficticio listo con seis meses de datos. */
function applyPack(db, packId) {
  const p = PACKS.find(x => x.id === packId);
  if (!p) throw new Error('Paquete no encontrado');
  db.pragma('foreign_keys = OFF');
  let seed;
  const tx = db.transaction(() => {
    // 1) Limpiar la operación completa (los usuarios se conservan)
    DD.wipeOperation(db);
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
    setSetting(db, 'logoDarkUrl', asset(p.id, 'logo-oscuro') || '');
    setSetting(db, 'logoSmallUrl', asset(p.id, 'logo-pequeno') || '');
    setSetting(db, 'logoLoginUrl', asset(p.id, 'logo-login') || asset(p.id, 'logo') || '');
    setSetting(db, 'logoSmallRound', '0');
    // Ícono de la pestaña y del celular, foto y color de fondo de la pantalla de acceso (si el paquete los trae)
    setSetting(db, 'faviconUrl', asset(p.id, 'favicon') || '');
    setSetting(db, 'appleIconUrl', asset(p.id, 'apple-icon') || '');
    setSetting(db, 'loginImageUrl', asset(p.id, 'portada-login') || '');
    setSetting(db, 'loginImageFit', p.brand.loginImageFit || 'cover');
    setSetting(db, 'loginImageFocus', p.brand.loginImageFocus || 'center');
    setSetting(db, 'loginBg', p.brand.loginBg || '');
    setSetting(db, 'loginTitle', '');
    // Si el logo ya trae el nombre del negocio, no se repite como título encima de "Iniciar sesión"
    setSetting(db, 'loginShowTitle', p.brand.loginShowTitle === false ? '0' : '1');
    // Logo del recibo térmico (mapa de bits ya preparado) si el paquete lo trae; si no, el automático a partir del logo
    const receiptLogo = (() => { try { const f = path.join(PUBLIC_DIR, 'demo-packs', p.id, 'recibo-logo.json'); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''; } catch { return ''; } })();
    setSetting(db, 'receiptLogo', receiptLogo);
    setSetting(db, 'receiptLogoAuto', receiptLogo ? '0' : '1');
    setSetting(db, 'loginSubtitle', '');
    setSetting(db, 'demoPack', p.id);
    setSetting(db, 'invoicePrefix', p.brand.businessName.normalize('NFKD').replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 3) || 'POS');

    // 3) Menú (heladería: los sabores van en las categorías 1-3; los demás empiezan en 101 para no activar el modo helado)
    const insCat = db.prepare('INSERT INTO categories (id, name, emoji, color) VALUES (?, ?, ?, ?)');
    const insProd = db.prepare('INSERT INTO products (name, category_id, price, available, image, description, sizes, featured, station) VALUES (?, ?, ?, 1, ?, ?, ?, 0, ?)');
    let catId = p.gelato ? 1 : 101;
    // Productos sin foto propia: la imagen de relleno del paquete (p. ej. el logotipo), mientras llegan las fotos
    const sinFoto = asset(p.id, 'sin-foto');
    for (const [cat, emoji, color, prods, catSizes] of p.menu) {
      insCat.run(catId, cat, emoji, color);
      const station = /bebida|caf|malteada/i.test(cat) ? 'barra' : 'cocina';
      for (const [name, price, desc, sizes] of prods) insProd.run(name, catId, price, asset(p.id, slug(name)) || sinFoto, desc || null, sizes ? JSON.stringify(sizes) : (catSizes || null), station);
      catId++;
    }

    // 4) Mesas
    db.prepare('DELETE FROM tables').run();
    db.prepare('DELETE FROM rooms').run();
    if (p.tables > 0) {
      const room = Number(db.prepare("INSERT INTO rooms (name, sort_order) VALUES ('Salón', 1)").run().lastInsertRowid);
      for (let n = 1; n <= p.tables; n++) { const s = tableSpot(n, p.tables); db.prepare("INSERT INTO tables (room_id, label, shape, seats, x, y, w, h, sort_order) VALUES (?, ?, ?, 4, ?, ?, ?, ?, ?)").run(room, String(n), n % 3 === 0 ? 'round' : 'square', s.x, s.y, s.w, s.h, n); }
    }

    // 5) Seis meses de operación con fechas de hoy
    seed = DD.seedBusiness(db, p);
  });
  tx();
  db.pragma('foreign_keys = ON');
  return { pack: p.id, businessName: p.brand.businessName, ...finishSeed(db, seed) };
}

/** Contabiliza lo generado y agrega los comprobantes manuales. Devuelve conteos y los errores contables, si hubo. */
function finishSeed(db, seed) {
  const L = require('./ledger');
  const first = L.syncLedger(db);
  db.transaction(() => DD.postManualAccounting(seed.ctx, seed.days, seed.today, seed.openingValue))();
  const count = t => db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c;
  return { orders: count('orders'), customers: count('customers'), expenses: count('expenses'), employees: count('employees'), settlements: count('payroll_settlements'), entries: count('journal_entries'), ledgerErrors: first.errors || [] };
}

/**
 * Regenera la operación con fechas de hoy sin tocar marca, menú ni mesas: lo guardado en la foto de la demo se respeta.
 * Lo corre reiniciar-demo.sh cada madrugada.
 */
function refreshDemoData(db, nowOverride = null) {
  if (!demoEnabled()) throw new Error('Esta instalación no es de demostración');
  const p = PACKS.find(x => x.id === readSetting(db, 'demoPack'));
  if (!p) throw new Error('La demo no tiene un paquete aplicado');
  db.pragma('foreign_keys = OFF');
  let seed;
  db.transaction(() => { DD.wipeOperation(db); seed = DD.seedBusiness(db, p, nowOverride); })();
  db.pragma('foreign_keys = ON');
  return { pack: p.id, ...finishSeed(db, seed) };
}

/** Mientras la demo está encendida, las ventas de hoy van apareciendo: "hoy" nunca se ve vacío y las cuentas en curso siguen frescas. */
function startDemoTicker(getDb, everyMs = 10 * 60 * 1000) {
  if (!demoEnabled()) return null;
  const tick = () => {
    try {
      const db = getDb();
      const p = PACKS.find(x => x.id === readSetting(db, 'demoPack'));
      if (p) DD.topUpToday(db, p);
    } catch (e) { console.warn('Ventas de la demo:', e.message); }
  };
  setTimeout(tick, 5000).unref();
  const t = setInterval(tick, everyMs);
  t.unref();
  return t;
}

module.exports = { PACKS, listPacks, applyPack, refreshDemoData, startDemoTicker, demoEnabled };
