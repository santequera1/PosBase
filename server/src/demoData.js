/**
 * Datos de demostración: seis meses de operación de un negocio ficticio, con fechas relativas a hoy.
 * Clientes, ventas (consumidor final, con factura, a crédito, plataformas, consumos de empleados, anuladas), cajas y arqueos,
 * proveedores, compras pagadas y por pagar con abonos, retención y documento soporte, inventario y recetas, personal con
 * asistencia, novedades, anticipos, préstamos, propinas y liquidaciones, y contabilidad completa.
 *
 * SOLO se usa desde demoPacks.js (DEMO_MODE=1): borra toda la operación. Nombres, documentos y valores son inventados.
 * Las cifras salen de las mismas reglas del sistema: la liquidación de computeSettlement, el cierre de caja de
 * getShiftLiveStats, los reportes contables de syncLedger y los costos de las recetas.
 * El sistema no emite notas crédito ni débito: aquí quedan como comprobantes de contabilidad manuales, y así se llaman.
 */
const payroll = require('./payroll');
const PX = require('./payrollExtras');
const INV = require('./inventory');
const L = require('./ledger');
const { issueTestInvoice } = require('./einvoice');
const D = require('./discounts');

const HISTORY_MONTHS = 6; // este mes y los cinco anteriores, completos: así el resumen mes a mes no tiene huecos
const DEMO_EMAIL = 'example.com';

/* ======================= utilidades ======================= */
const addDays = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const dowOf = d => new Date(`${d}T00:00:00Z`).getUTCDay();
const pad = n => String(n).padStart(2, '0');
const hundred = n => Math.round(n / 100) * 100;
const round3 = n => Math.round(n * 1000) / 1000;
const plain = s => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const nowLocal = db => db.prepare("SELECT datetime('now', '-5 hours') AS d").get().d;

function makeRng(seed) {
  let a = seed >>> 0;
  const r = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.int = (x, y) => x + Math.floor(r() * (y - x + 1));
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  r.chance = p => r() < p;
  return r;
}
const seedOf = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

/** Dígito de verificación del NIT (algoritmo de la DIAN). */
function nitDv(nit) {
  const w = [71, 67, 59, 53, 47, 43, 41, 37, 29, 23, 19, 17, 13, 7, 3];
  const s = String(nit).padStart(15, '0');
  let t = 0;
  for (let i = 0; i < 15; i++) t += Number(s[i]) * w[i];
  const m = t % 11;
  return String(m > 1 ? 11 - m : m);
}

/* ======================= catálogos ficticios ======================= */
const ROSTER = [
  { name: 'Marcela Ortiz Vega', position: 'Administradora', payMode: 'monthly', base: 3200000, legal: 1, transport: 1, overtime: 0, points: 0, turn: 'dia', rest: 0 },
  { user: 'caja', name: 'Laura Martínez Polo', position: 'Cajera', payMode: 'monthly', base: 1950000, legal: 1, transport: 1, overtime: 1, points: 1, turn: 'tarde', rest: 1 },
  { name: 'Daniel Arrieta Rojas', position: 'Cajero', payMode: 'biweekly', base: 925000, legal: 1, transport: 1, overtime: 1, points: 1, turn: 'dia', rest: 2 },
  { user: 'mesero1', name: 'Andrés Cabarcas Díaz', position: 'Mesero', payMode: 'per_shift', base: 68000, legal: 0, transport: 0, overtime: 0, points: 2, turn: 'tarde', rest: 2 },
  { user: 'mesero2', name: 'Camila Herrera Luna', position: 'Mesera', payMode: 'per_shift', base: 68000, legal: 0, transport: 0, overtime: 0, points: 2, turn: 'dia', rest: 3 },
  { name: 'Yuliana Pérez Castro', position: 'Mesera', payMode: 'per_day', base: 65000, legal: 0, transport: 0, overtime: 0, points: 2, turn: 'tarde', rest: 1 },
  { user: 'cocina', name: 'Pedro Julio Salas', position: 'Cocinero', payMode: 'monthly', base: 2400000, legal: 1, transport: 1, overtime: 1, points: 1, turn: 'tarde', rest: 1 },
  { name: 'Wilmer Gutiérrez Mora', position: 'Planchero', payMode: 'biweekly', base: 1050000, legal: 1, transport: 1, overtime: 1, points: 1, turn: 'dia', rest: 4 },
  { name: 'Rosa Elena Caraballo', position: 'Auxiliar de cocina', payMode: 'hourly', base: 10500, legal: 0, transport: 1, overtime: 1, points: 1, turn: 'dia', rest: 2 },
  { name: 'Kevin Barrios Ahumada', position: 'Auxiliar de cocina', payMode: 'per_day', base: 62000, legal: 0, transport: 0, overtime: 1, points: 1, turn: 'tarde', rest: 3 },
  { name: 'Luz Marina Tovar', position: 'Oficios varios', payMode: 'per_shift', base: 58000, legal: 0, transport: 0, overtime: 0, points: 0.5, turn: 'dia', rest: 0 },
  { user: 'domi1', name: 'Jhon Fredy Mendoza', position: 'Domiciliario', payMode: 'per_shift', base: 45000, legal: 0, transport: 0, overtime: 0, points: 0, turn: 'noche', rest: 1 },
  { user: 'domi2', name: 'Sergio Luis Pacheco', position: 'Domiciliario', payMode: 'per_shift', base: 45000, legal: 0, transport: 0, overtime: 0, points: 0, turn: 'noche', rest: 2 },
  { name: 'Esneider Cassiani Julio', position: 'Auxiliar de cocina', payMode: 'per_day', base: 60000, legal: 0, transport: 0, overtime: 0, points: 1, turn: 'dia', rest: 4, retiredDaysAgo: 40 },
];
const TURNS = { dia: [9, 17], tarde: [15, 23], noche: [17, 23] };

const FIRST = ['María José', 'Carlos Andrés', 'Ana Lucía', 'Luis Fernando', 'Sofía', 'Julián', 'Valentina', 'Mateo', 'Laura Sofía', 'Felipe', 'Natalia', 'Santiago', 'Paola', 'Nicolás', 'Diana', 'Óscar', 'Mariana', 'Hernán', 'Isabela', 'Ricardo'];
const LAST = ['Gómez', 'Pérez', 'Torres', 'Ramírez', 'Herrera', 'Castro', 'Ruiz', 'Méndez', 'Rojas', 'Vargas', 'Blanco', 'Fuentes', 'Navarro', 'Acosta', 'Suárez', 'Peña', 'Lozano', 'Marrugo', 'Puello', 'Zúñiga'];
const HOODS = ['Centro', 'Manga', 'Bocagrande', 'El Prado', 'Crespo', 'Pie de la Popa', 'Getsemaní', 'Castillogrande', 'La Matuna', 'Los Alpes'];
const COMPANIES = [
  ['Hotel Brisas del Puerto S.A.S.', 30, '5511'], ['Constructora Altos del Cabrero S.A.S.', 45, '4111'], ['Inversiones Bahía Azul S.A.S.', 30, '6810'], ['Logística Puerto Claro S.A.S.', 30, '5229'],
  ['Eventos La Terraza S.A.S.', 15, '8230'], ['Agencia de Viajes Sol Caribe S.A.S.', 30, '7911'], ['Colegio Nuevo Horizonte Ltda.', 60, '8521'], ['Oficina Jurídica Arrieta & Cía.', 30, '6910'],
];
const SUPPLIERS = {
  carnes: { name: 'Carnes La Serranía S.A.S.', category: 'Carnes', credit: 30, retention: 2.5, ciiu: '4723', company: true },
  pan: { name: 'Panadería Industrial El Trigal S.A.S.', category: 'Panadería', credit: 15, retention: 0, ciiu: '1081', company: true },
  lacteos: { name: 'Lácteos Costa Fresca S.A.S.', category: 'Lácteos', credit: 15, retention: 2.5, ciiu: '1040', company: true },
  fruver: { name: 'Ramiro Pájaro Gómez', category: 'Frutas y verduras', credit: 0, retention: 0, ciiu: '4721', company: false, supportDoc: true },
  bebidas: { name: 'Distribuidora Refrescos del Litoral S.A.S.', category: 'Bebidas', credit: 30, retention: 2.5, ciiu: '4631', company: true },
  abarrotes: { name: 'Abarrotes La Bodega Mayorista S.A.S.', category: 'Abarrotes', credit: 30, retention: 2.5, ciiu: '4631', company: true },
  mar: { name: 'Pescadería Bahía Honda S.A.S.', category: 'Pescados y mariscos', credit: 15, retention: 2.5, ciiu: '4723', company: true },
  empaques: { name: 'Empaques y Desechables del Norte S.A.S.', category: 'Empaques', credit: 30, retention: 0, ciiu: '4690', company: true, iva: true },
  arriendo: { name: 'Inmobiliaria Puerto Viejo S.A.S.', category: 'Arriendo', credit: 0, retention: 3.5, ciiu: '6820', company: true },
  energia: { name: 'Energía del Litoral S.A. E.S.P.', category: 'Servicios públicos', credit: 0, retention: 0, ciiu: '3514', company: true },
  acueducto: { name: 'Acueducto Bahía S.A. E.S.P.', category: 'Servicios públicos', credit: 0, retention: 0, ciiu: '3600', company: true },
  gas: { name: 'Gases del Litoral S.A. E.S.P.', category: 'Servicios públicos', credit: 0, retention: 0, ciiu: '3520', company: true },
  internet: { name: 'Conecta Fibra S.A.S.', category: 'Telecomunicaciones', credit: 0, retention: 0, ciiu: '6110', company: true, iva: true },
  contador: { name: 'Contadores Arrieta & Asociados Ltda.', category: 'Honorarios', credit: 0, retention: 10, ciiu: '6920', company: true },
  publicidad: { name: 'Agencia Pixel Caribe S.A.S.', category: 'Publicidad', credit: 15, retention: 0, ciiu: '7310', company: true, iva: true },
  tecnico: { name: 'Julio Ramos Cantillo', category: 'Mantenimiento', credit: 0, retention: 0, ciiu: '3312', company: false, supportDoc: true, incomplete: true },
};
// clave: [nombre, categoría, unidad, costo, merma %, proveedor]
const INGREDIENTS = {
  carne: ['Carne de res molida', 'Carnes', 'kg', 28000, 3, 'carnes'], tocineta: ['Tocineta', 'Carnes', 'kg', 38000, 2, 'carnes'], pollo: ['Pechuga de pollo', 'Carnes', 'kg', 19000, 4, 'carnes'],
  pan: ['Pan de hamburguesa', 'Panadería', 'unid', 1300, 0, 'pan'], harina: ['Harina de trigo', 'Abarrotes', 'kg', 3500, 1, 'abarrotes'],
  queso: ['Queso cheddar', 'Lácteos', 'kg', 36000, 1, 'lacteos'], mozzarella: ['Queso mozzarella', 'Lácteos', 'kg', 32000, 1, 'lacteos'], leche: ['Leche entera', 'Lácteos', 'l', 4200, 0, 'lacteos'], mantequilla: ['Mantequilla', 'Lácteos', 'kg', 26000, 0, 'lacteos'], helado: ['Base de helado', 'Lácteos', 'l', 16000, 2, 'lacteos'], huevo: ['Huevo', 'Lácteos', 'unid', 550, 2, 'lacteos'],
  lechuga: ['Lechuga', 'Frutas y verduras', 'kg', 6000, 15, 'fruver'], tomate: ['Tomate', 'Frutas y verduras', 'kg', 5000, 8, 'fruver'], cebolla: ['Cebolla', 'Frutas y verduras', 'kg', 3500, 8, 'fruver'], papa: ['Papa', 'Frutas y verduras', 'kg', 3200, 6, 'fruver'], limon: ['Limón', 'Frutas y verduras', 'kg', 5200, 5, 'fruver'], platano: ['Plátano', 'Frutas y verduras', 'kg', 3000, 5, 'fruver'], fruta: ['Pulpa de fruta', 'Frutas y verduras', 'kg', 11000, 2, 'fruver'],
  aceite: ['Aceite de cocina', 'Abarrotes', 'l', 9000, 0, 'abarrotes'], salsa: ['Salsas de la casa', 'Abarrotes', 'kg', 14000, 0, 'abarrotes'], azucar: ['Azúcar', 'Abarrotes', 'kg', 3800, 0, 'abarrotes'], arroz: ['Arroz', 'Abarrotes', 'kg', 4200, 0, 'abarrotes'], pasta: ['Pasta seca', 'Abarrotes', 'kg', 9500, 0, 'abarrotes'], cafe: ['Café en grano', 'Abarrotes', 'kg', 42000, 1, 'abarrotes'], chocolate: ['Chocolate de mesa', 'Abarrotes', 'kg', 24000, 0, 'abarrotes'], coco: ['Crema de coco', 'Abarrotes', 'l', 18000, 0, 'abarrotes'], varios: ['Insumos varios', 'Abarrotes', 'kg', 8000, 0, 'abarrotes'],
  gaseosa: ['Gaseosa 350 ml', 'Bebidas', 'unid', 2500, 0, 'bebidas'], cerveza: ['Cerveza nacional', 'Bebidas', 'unid', 3200, 0, 'bebidas'], agua: ['Agua en botella', 'Bebidas', 'unid', 1400, 0, 'bebidas'], vino: ['Vino de la casa', 'Bebidas', 'l', 32000, 0, 'bebidas'],
  pescado: ['Pescado fresco', 'Pescados y mariscos', 'kg', 26000, 8, 'mar'], camaron: ['Camarón', 'Pescados y mariscos', 'kg', 48000, 5, 'mar'],
  empaque: ['Empaque para llevar', 'Empaques', 'unid', 650, 0, 'empaques'],
};
// La primera regla que coincide con el nombre del producto define su receta
const RECIPES = [
  [/combo familiar/, { carne: 0.6, pan: 4, queso: 0.12, papa: 0.8, aceite: 0.12, gaseosa: 4, empaque: 2 }], [/combo pareja/, { carne: 0.3, pan: 2, queso: 0.06, papa: 0.4, aceite: 0.06, gaseosa: 2, empaque: 1 }],
  [/combo pollo/, { pollo: 0.25, papa: 0.2, aceite: 0.05, gaseosa: 1, empaque: 1 }], [/combo/, { carne: 0.15, pan: 1, queso: 0.03, papa: 0.2, aceite: 0.04, gaseosa: 1, empaque: 1 }],
  [/franky de pollo/, { pollo: 0.18, pan: 1, queso: 0.03, lechuga: 0.02, salsa: 0.02, aceite: 0.03 }], [/veggie/, { varios: 0.15, pan: 1, lechuga: 0.03, tomate: 0.03 }], [/doble/, { carne: 0.3, pan: 1, queso: 0.06, tocineta: 0.03, lechuga: 0.02, tomate: 0.03 }],
  [/tocineta|bacon/, { carne: 0.15, pan: 1, queso: 0.05, tocineta: 0.04, lechuga: 0.02, salsa: 0.02 }], [/franky|hamburg|burger/, { carne: 0.15, pan: 1, queso: 0.03, lechuga: 0.02, tomate: 0.03, cebolla: 0.02, salsa: 0.02 }],
  [/papas con queso/, { papa: 0.3, queso: 0.05, tocineta: 0.02, aceite: 0.04 }], [/papas|francesa/, { papa: 0.25, aceite: 0.04 }], [/aros/, { cebolla: 0.15, harina: 0.05, aceite: 0.05 }], [/salsas/, { salsa: 0.06 }],
  [/alitas|nuggets|presas|pollo crispy|pollo sudado|arroz con pollo/, { pollo: 0.25, arroz: 0.08, aceite: 0.05 }],
  [/gaseosa/, { gaseosa: 1 }], [/cerveza/, { cerveza: 1 }], [/limonada de coco/, { limon: 0.08, coco: 0.06, azucar: 0.02 }], [/limonada/, { limon: 0.1, azucar: 0.03 }], [/jugo|coctel de la casa/, { fruta: 0.15, azucar: 0.02 }], [/avena/, { leche: 0.2, azucar: 0.02 }], [/^agua|agua con gas/, { agua: 1 }], [/aromatica/, { azucar: 0.01 }], [/botella de vino/, { vino: 0.75 }], [/vino/, { vino: 0.15 }],
  [/capuchino|latte|mocaccino|cafe frio/, { cafe: 0.018, leche: 0.18, azucar: 0.005 }], [/chocolate caliente/, { chocolate: 0.04, leche: 0.2 }], [/cafe|espresso|americano/, { cafe: 0.018, azucar: 0.005 }],
  [/malteada/, { helado: 0.2, leche: 0.15 }], [/brownie|banana|waffle|affogato/, { helado: 0.12, chocolate: 0.03, harina: 0.05 }], [/tiramis|panna|flan|arroz con leche|dulce|cheesecake|torta/, { leche: 0.12, azucar: 0.04, huevo: 1, harina: 0.03 }],
  [/pizza/, { harina: 0.22, mozzarella: 0.15, tomate: 0.1, aceite: 0.01 }], [/spaghetti|fettuccine|lasagna|ravioli|penne/, { pasta: 0.14, tomate: 0.06, mozzarella: 0.03, aceite: 0.01 }], [/pan de ajo|bruschett/, { harina: 0.12, mantequilla: 0.02, tomate: 0.03 }], [/caprese/, { tomate: 0.15, mozzarella: 0.1 }], [/carpaccio/, { carne: 0.1, limon: 0.02 }],
  [/croissant|pan |almoj|bono|tostada|galleta/, { harina: 0.07, mantequilla: 0.015, huevo: 0.2 }], [/desayuno|calentado/, { huevo: 2, arroz: 0.1, cafe: 0.01 }], [/bowl/, { fruta: 0.2, azucar: 0.01 }],
  [/cevic|camar|langost|marisc|marinero|picada|costena/, { camaron: 0.18, limon: 0.03, arroz: 0.1, platano: 0.08 }], [/mojarra|pargo|robalo|sierra|deditos/, { pescado: 0.35, platano: 0.1, aceite: 0.05 }],
  [/almuerzo|bandeja|sancocho|carne asada|sopa/, { arroz: 0.12, carne: 0.14, platano: 0.1, aceite: 0.02 }], [/empanada|arepa|carima|patac/, { harina: 0.06, carne: 0.02, aceite: 0.03, platano: 0.05 }],
  [/topping|cono/, { azucar: 0.02, harina: 0.02 }],
];
const HOUR_WEIGHTS = { default: [1, 1, 2, 3, 7, 9, 6, 3, 2, 3, 5, 8, 9, 7, 3], cafe: [8, 10, 9, 6, 4, 4, 3, 3, 4, 6, 7, 5, 3, 1, 1] };
const DAY_FACTOR = [1.1, 0.75, 0.8, 0.85, 0.95, 1.25, 1.35]; // domingo a sábado
const FIRST_HOUR = 8;

/* ======================= limpieza ======================= */
const WIPE = ['order_item_cancellations', 'order_payments', 'order_items', 'stock_movements', 'ingredient_movements', 'ingredient_components', 'recipe_items', 'ingredients', 'print_jobs', 'tips', 'tip_payouts', 'cash_movements', 'cash_shifts', 'journal_lines', 'journal_entries', 'expense_payments', 'expenses', 'suppliers', 'payroll_novelties', 'advances', 'loan_payments', 'employee_loans', 'payroll_settlements', 'attendance', 'employees', 'orders'];
function wipeOperation(db) {
  for (const t of WIPE) { try { db.prepare(`DELETE FROM ${t}`).run(); } catch { /* tabla opcional */ } }
  db.prepare("DELETE FROM customers WHERE NOT (document_id = '222222222222' AND LOWER(name) LIKE 'consumidor%')").run();
  try { db.prepare(`DELETE FROM sqlite_sequence WHERE name IN (${[...WIPE, 'customers'].map(() => '?').join(',')})`).run(...WIPE, 'customers'); } catch { /* sin secuencias */ }
}

/* ======================= contexto ======================= */
function loadCtx(db, pack, rng) {
  const products = db.prepare('SELECT id, name, price, sizes, cost, category_id AS categoryId FROM products WHERE available = 1').all();
  const shuffled = [...products];
  // Orden fijo por paquete para que siempre haya "los más vendidos"
  const order = makeRng(seedOf(pack.id));
  for (let i = shuffled.length - 1; i > 0; i--) { const j = order.int(0, i); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  const employees = db.prepare('SELECT id, user_id AS userId, name, position, active FROM employees').all().filter(e => e.active);
  const customers = db.prepare("SELECT id, name, document_id AS doc, email, phone, address, COALESCE(neighborhood, '') AS neighborhood, is_company AS isCompany, COALESCE(credit_days, 0) AS creditDays FROM customers WHERE document_id != '222222222222'").all();
  const recipe = new Map();
  for (const r of db.prepare('SELECT r.product_id AS pid, r.ingredient_id AS id, r.quantity AS q, i.waste_pct AS w FROM recipe_items r JOIN ingredients i ON i.id = r.ingredient_id').all()) {
    if (!recipe.has(r.pid)) recipe.set(r.pid, []);
    recipe.get(r.pid).push({ id: r.id, qty: r.q * (1 + (r.w || 0) / 100) });
  }
  const drinkCats = new Set(db.prepare('SELECT id, name FROM categories').all().filter(c => /bebida|caf|malteada/i.test(c.name)).map(c => c.id));
  const priceOf = p => { try { const z = p.sizes ? JSON.parse(p.sizes) : null; if (Array.isArray(z) && z.length) return z.reduce((a, x) => a + x.price, 0) / z.length; } catch { /* sin tamaños */ } return p.price; };
  const avgPrice = products.length ? products.reduce((a, p) => a + priceOf(p), 0) / products.length : 20000;
  return {
    db, pack, rng, products: shuffled, employees, customers, recipe, drinkCats,
    tables: db.prepare('SELECT id, label FROM tables WHERE active = 1').all(),
    waiters: employees.filter(e => /meser/i.test(e.position)),
    couriers: employees.filter(e => /domicil/i.test(e.position)),
    cashiers: employees.filter(e => /cajer/i.test(e.position)),
    naturals: customers.filter(c => !c.isCompany),
    companies: customers.filter(c => c.isCompany),
    staffDiscount: D.staffDiscountId(db),
    baseOrders: Math.max(25, Math.min(70, Math.round(2600000 / (avgPrice * 3.4)))),
    weights: HOUR_WEIGHTS[pack.id] || HOUR_WEIGHTS.default,
    insOrder: db.prepare(`INSERT INTO orders (type, status, customer_name, customer_doc, customer_email, customer_phone, customer_address, customer_neighborhood, customer_id, table_id, table_label, table_number, people, waiter_id, waiter_name, driver_id, driver_name,
      subtotal, delivery_fee, discount, discount_reason, discount_kind, discount_id, discount_name, discount_employee_id, discount_employee_name, total, tip, tip_to, payment_method, payment_status, payment_split, payroll_employee_id, cash_received, cash_change, cancel_reason,
      created_at, closed_at, closed_by, ready_at, shipped_at, delivered_at, shift_id, cashier_name, created_by, channel, branch_id, sale_label, estimated_minutes, notes)
      VALUES (@type, @status, @customer_name, @customer_doc, @customer_email, @customer_phone, @customer_address, @customer_neighborhood, @customer_id, @table_id, @table_label, @table_number, @people, @waiter_id, @waiter_name, @driver_id, @driver_name,
      @subtotal, @delivery_fee, @discount, @discount_reason, @discount_kind, @discount_id, @discount_name, @discount_employee_id, @discount_employee_name, @total, @tip, @tip_to, @payment_method, @payment_status, @payment_split, @payroll_employee_id, @cash_received, @cash_change, @cancel_reason,
      @created_at, @closed_at, @closed_by, @ready_at, @shipped_at, @delivered_at, @shift_id, @cashier_name, @created_by, @channel, 1, @sale_label, @estimated_minutes, @notes)`),
    insItem: db.prepare("INSERT INTO order_items (order_id, product_id, name, size, quantity, price, batch, sent_at, kitchen_status, kitchen_ready_at, unit_cost, notes) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)"),
    insTip: db.prepare('INSERT INTO tips (date, employee_id, amount, method, shift_id, notes) VALUES (?, ?, ?, ?, ?, ?)'),
    insLoan: db.prepare("INSERT INTO employee_loans (employee_id, date, amount, installments, installment_amount, from_cash_register, notes, created_by, kind, order_id, frequency) VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'consumo', ?, 'biweekly')"),
    insCancel: db.prepare('INSERT INTO order_item_cancellations (order_id, product_id, name, quantity, price, was_sent, reason, cancelled_by, cancelled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    onConsume: null,
  };
}

/** Cuántos pedidos tiene un día: más los fines de semana, con algo de azar y una tendencia suave al alza (siempre igual para ese día). */
function dayOrders(ctx, date, trend = 1) {
  const r = makeRng(seedOf(`${ctx.pack.id}|${date}`));
  return Math.round(ctx.baseOrders * DAY_FACTOR[dowOf(date)] * (0.87 + r() * 0.26) * trend);
}
function pickHourMinute(ctx) {
  const total = ctx.weights.reduce((a, w) => a + w, 0);
  let x = ctx.rng() * total;
  for (let i = 0; i < ctx.weights.length; i++) { x -= ctx.weights[i]; if (x <= 0) return [FIRST_HOUR + i, ctx.rng.int(0, 59)]; }
  return [FIRST_HOUR, 0];
}
/** Parte de las ventas del día que ya debió ocurrir a esa hora (0 a 1). */
function dayFraction(ctx, hour, minute) {
  const total = ctx.weights.reduce((a, w) => a + w, 0);
  let done = 0;
  for (let i = 0; i < ctx.weights.length; i++) {
    const h = FIRST_HOUR + i;
    if (h < hour) done += ctx.weights[i];
    else if (h === hour) done += ctx.weights[i] * (minute / 60);
  }
  return done / total;
}

/* ======================= venta ======================= */
const shiftTime = (at, min) => { const d = new Date(`${at.replace(' ', 'T')}Z`); d.setUTCMinutes(d.getUTCMinutes() + min); return d.toISOString().slice(0, 19).replace('T', ' '); };

function pickItems(ctx, count) {
  const { rng, products } = ctx;
  return Array.from({ length: count }, () => {
    const pr = products[Math.floor(Math.pow(rng(), 1.7) * products.length)];
    let size = null, price = pr.price;
    try { const s = pr.sizes ? JSON.parse(pr.sizes) : null; if (Array.isArray(s) && s.length) { const z = rng.pick(s); size = z.name; price = z.price; } } catch { /* sin tamaños */ }
    return { pr, size, price, qty: rng.chance(0.3) ? 2 : 1 };
  });
}

function insertSale(ctx, at, shift, opts = {}) {
  const { db, rng, pack, tables, waiters, couriers, naturals, companies, employees } = ctx;
  const date = at.slice(0, 10);
  const roll = rng();
  let type = roll < pack.sales.dineIn && tables.length ? 'dine-in' : roll < pack.sales.dineIn + pack.sales.delivery ? 'delivery' : 'pickup';
  let method;
  const m = rng();
  if (m < 0.38) method = 'cash'; else if (m < 0.62) method = 'transfer'; else if (m < 0.77) method = 'card_debit'; else if (m < 0.88) method = 'card_credit'; else if (m < 0.95) method = 'mixed'; else method = 'cash';
  let channel = 'local';
  if (type === 'delivery') {
    const c = rng();
    channel = c < 0.45 ? 'whatsapp' : c < 0.7 ? 'phone' : c < 0.88 ? 'rappi' : 'didi';
    if (channel === 'rappi' || channel === 'didi') method = 'platform';
  }
  // Consumo de un empleado: va a su nómina con el descuento de trabajador
  const staffEmp = employees.length && rng.chance(0.012) ? rng.pick(employees) : null;
  // Pedido de empresa a crédito (reuniones, eventos): más grande y siempre con factura
  const company = !staffEmp && companies.length && rng.chance(0.03) ? rng.pick(companies) : null;
  if (staffEmp) { type = 'pickup'; channel = 'local'; method = 'payroll'; }
  if (company) { type = 'delivery'; channel = 'phone'; method = 'credit'; }

  let customer = null;
  if (company) customer = company;
  else if (!staffEmp && naturals.length && (type === 'delivery' || rng.chance(type === 'pickup' ? 0.3 : 0.06))) customer = rng.pick(naturals);

  const items = pickItems(ctx, company ? rng.int(5, 12) : rng.int(1, type === 'dine-in' ? 5 : 3));
  if (company) for (const x of items) x.qty = rng.int(2, 5);
  const subtotal = items.reduce((a, x) => a + x.price * x.qty, 0);
  const fee = type === 'delivery' && channel !== 'rappi' && channel !== 'didi' ? pack.deliveryFee : 0;

  let discount = 0, reason = null, kind = null, dId = null, dName = null, dEmpId = null, dEmpName = null;
  if (staffEmp && ctx.staffDiscount) {
    const r = D.computeDiscount(db, ctx.staffDiscount, items.map(x => ({ productId: x.pr.id, price: x.price, quantity: x.qty })), { employeeId: staffEmp.id });
    if (!r.error) { discount = r.amount; reason = r.reason; kind = r.kind; dId = r.discount.id; dName = r.discount.name; dEmpId = staffEmp.id; dEmpName = staffEmp.name; }
  } else if (!company && rng.chance(0.06)) {
    discount = hundred(subtotal * rng.pick([0.05, 0.1, 0.15]));
    reason = rng.pick(['Cliente frecuente', 'Cumpleaños', 'Demora en el pedido', 'Cortesía de la casa', 'Compensación por error en el pedido']);
    kind = 'manual';
  }
  const total = subtotal + fee - discount;
  const tip = (type === 'dine-in' && rng.chance(0.55)) || (!tables.length && type === 'pickup' && !staffEmp && rng.chance(0.2)) ? hundred(total * 0.1) : 0;
  const tipToWaiter = tip > 0 && rng.chance(0.35);
  const cancelled = !staffEmp && !company && !opts.noCancel && rng.chance(0.015);

  const due = total + tip;
  let split = null, received = 0, change = 0;
  if (method === 'mixed') {
    const cash = hundred(due * rng.pick([0.3, 0.5, 0.6]));
    split = JSON.stringify({ parts: [{ method: 'cash', amount: cash }, { method: rng.pick(['transfer', 'card_debit']), amount: due - cash }] });
    received = cash;
  } else if (method === 'cash') {
    received = Math.ceil(due / 10000) * 10000;
    change = received - due;
  }
  const paymentStatus = cancelled ? 'pending' : method === 'credit' ? 'pending' : 'paid';
  const table = type === 'dine-in' ? rng.pick(tables) : null;
  const waiter = type === 'dine-in' && waiters.length ? rng.pick(waiters) : null;
  const courier = type === 'delivery' && couriers.length ? rng.pick(couriers) : null;
  const cashierName = shift ? shift.cashier_name : (ctx.cashiers[0] ? ctx.cashiers[0].name : 'Caja');
  const prep = rng.int(8, 25);
  const closeAt = shiftTime(at, type === 'dine-in' ? rng.int(25, 70) : type === 'delivery' ? rng.int(25, 55) : prep);
  const info = ctx.insOrder.run({
    type, status: cancelled ? 'cancelled' : 'delivered',
    customer_name: staffEmp ? staffEmp.name : customer ? customer.name : 'Consumidor Final',
    customer_doc: customer ? customer.doc : '222222222222', customer_email: customer ? customer.email : '', customer_phone: customer ? customer.phone : '', customer_address: type === 'delivery' && customer ? customer.address : '', customer_neighborhood: type === 'delivery' && customer ? customer.neighborhood : null, customer_id: customer ? customer.id : null,
    table_id: table ? table.id : null, table_label: table ? table.label : null, table_number: table ? (parseInt(table.label, 10) || null) : null, people: type === 'dine-in' ? rng.int(1, 6) : 0,
    waiter_id: waiter ? waiter.id : null, waiter_name: waiter ? waiter.name : null, driver_id: courier ? courier.id : null, driver_name: courier ? courier.name : null,
    subtotal, delivery_fee: fee, discount, discount_reason: reason, discount_kind: kind, discount_id: dId, discount_name: dName, discount_employee_id: dEmpId, discount_employee_name: dEmpName,
    total, tip: cancelled ? 0 : tip, tip_to: !cancelled && tip ? (tipToWaiter && waiter ? 'waiter' : 'common') : null,
    payment_method: method, payment_status: paymentStatus, payment_split: split, payroll_employee_id: staffEmp ? staffEmp.id : null, cash_received: received, cash_change: change,
    cancel_reason: cancelled ? rng.pick(['El cliente se arrepintió', 'Error al tomar el pedido', 'Producto agotado', 'Pedido duplicado', 'El cliente no respondió la llamada']) : null,
    created_at: at, closed_at: closeAt, closed_by: cashierName, ready_at: shiftTime(at, prep), shipped_at: type === 'delivery' ? shiftTime(at, prep + 2) : null, delivered_at: closeAt,
    shift_id: shift ? shift.id : null, cashier_name: cashierName, created_by: waiter ? waiter.name : cashierName, channel, sale_label: type === 'pickup' && customer ? customer.name.split(' ')[0] : null,
    estimated_minutes: type === 'delivery' ? rng.pick([30, 45, 60]) : null, notes: rng.chance(0.05) ? rng.pick(['Sin cebolla', 'Salsas aparte', 'Sin hielo', 'Bien cocida', 'Empacar por separado']) : '',
  });
  const oid = Number(info.lastInsertRowid);
  for (const x of items) {
    ctx.insItem.run(oid, x.pr.id, x.pr.name, x.size, x.qty, x.price, at, 'ready', shiftTime(at, prep), x.pr.cost || 0, '');
    if (!cancelled && ctx.onConsume) for (const r of ctx.recipe.get(x.pr.id) || []) ctx.onConsume(date, oid, r.id, r.qty * x.qty);
  }
  if (!cancelled && tip) {
    const tm = method === 'cash' || method === 'mixed' ? 'cash' : method === 'transfer' ? 'transfer' : 'card';
    ctx.insTip.run(date, tipToWaiter && waiter ? waiter.id : null, tip, tm, shift ? shift.id : null, `Propina pedido #${oid}`);
  }
  if (staffEmp && total > 0) {
    const inst = rng.chance(0.25) ? 2 : 1;
    ctx.insLoan.run(staffEmp.id, date, total, inst, Math.ceil(total / inst), `Consumo venta #${oid}`, cashierName, oid);
  }
  // Producto quitado de una mesa después de pedido (queda el registro de quién y por qué)
  if ((type === 'dine-in' || !tables.length) && !cancelled && rng.chance(0.04)) {
    const pr = rng.pick(ctx.products);
    ctx.insCancel.run(oid, pr.id, pr.name, 1, pr.price, rng.chance(0.6) ? 1 : 0, rng.pick(['El cliente cambió de opinión', 'Error del mesero', 'Producto agotado']), waiter ? waiter.name : cashierName, shiftTime(at, 10));
  }
  // Factura electrónica de PRUEBA (documento simulado: nunca sale a la DIAN)
  if (!cancelled && !staffEmp && (company || (customer && rng.chance(0.25)) || (!customer && rng.chance(0.02)))) {
    issueTestInvoice(db, oid);
    db.prepare('UPDATE orders SET fe_issued_at = ? WHERE id = ?').run(closeAt, oid);
  }
  return { id: oid, method, total: due, company, customer, date, cancelled };
}

/* ======================= maestros ======================= */
function seedSuppliers(ctx, needed) {
  const { db, rng } = ctx;
  const ins = db.prepare(`INSERT INTO suppliers (name, nit, phone, email, address, category, notes, active, doc_type, dv, legal_name, first_name, last_name, person_type, city, state, country, postal_code, ciiu, iva_responsible, regime, credit_days, retention_pct)
    VALUES (?, ?, ?, ?, ?, ?, '', 1, ?, ?, ?, ?, ?, ?, ?, 'Bolívar', 'Colombia', '130001', ?, ?, ?, ?, ?)`);
  const out = {};
  let i = 0;
  for (const [key, s] of Object.entries(SUPPLIERS)) {
    if (!needed.has(key)) continue;
    i++;
    const nit = s.company ? String(900100000 + i * 3571) : String(73100000 + i * 4231);
    const parts = s.name.split(' ');
    const id = Number(ins.run(s.name, nit, `605${String(6500000 + i * 137)}`, s.incomplete ? '' : `facturacion${i}@${DEMO_EMAIL}`, s.incomplete ? '' : `Zona Industrial Mamonal, bodega ${i}`, s.category,
      s.company ? 'NIT' : 'CC', s.company ? nitDv(nit) : '', s.company ? s.name : '', s.company ? '' : parts[0], s.company ? '' : parts.slice(1).join(' '), s.company ? 'juridica' : 'natural', 'Cartagena de Indias', s.incomplete ? '' : s.ciiu, s.iva ? 1 : 0, s.iva ? 'ordinario' : s.company ? 'ordinario' : 'no_responsable', s.credit, s.retention).lastInsertRowid);
    out[key] = { ...s, id, key, seq: rng.int(1200, 8800) };
  }
  return out;
}

function seedRecipes(ctx, suppliers) {
  const { db, products } = ctx;
  const used = new Map();
  const insIng = db.prepare("INSERT INTO ingredients (name, category, unit, cost, waste_pct, stock, min_stock, track_stock, supplier_id, active) VALUES (?, ?, ?, ?, ?, 0, 0, 1, ?, 1)");
  const insRec = db.prepare('INSERT INTO recipe_items (product_id, ingredient_id, quantity) VALUES (?, ?, ?)');
  for (const p of products) {
    const n = plain(p.name);
    const rule = RECIPES.find(([re]) => re.test(n));
    const parts = rule ? rule[1] : (ctx.pack.gelato ? { helado: 0.55, azucar: 0.03, empaque: 1 } : { varios: 0.2 });
    for (const [k, q] of Object.entries(parts)) {
      if (!used.has(k)) {
        const [name, category, unit, cost, waste, supplier] = INGREDIENTS[k];
        const sup = suppliers[supplier];
        used.set(k, { id: Number(insIng.run(name, category, unit, cost, waste, sup ? sup.id : null).lastInsertRowid), key: k, cost, unit, name, supplier });
      }
      insRec.run(p.id, used.get(k).id, q);
    }
    INV.syncProductCost(db, p.id);
    p.cost = db.prepare('SELECT cost FROM products WHERE id = ?').get(p.id).cost;
  }
  // Una sub-receta para mostrar insumos elaborados
  if (used.has('salsa') && used.has('tomate')) db.prepare('INSERT INTO ingredient_components (ingredient_id, component_id, quantity) VALUES (?, ?, 0.4)').run(used.get('salsa').id, used.get('tomate').id);
  return [...used.values()];
}

function seedCustomers(ctx) {
  const { db, rng } = ctx;
  const ins = db.prepare(`INSERT INTO customers (name, document_id, email, phone, address, notes, is_company, address2, neighborhood, doc_type, dv, legal_name, first_name, last_name, person_type, city, state, country, postal_code, ciiu, iva_responsible, regime, credit_days)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Cartagena de Indias', 'Bolívar', 'Colombia', '130001', ?, ?, ?, ?)`);
  const seen = new Set();
  let n = 0;
  for (let i = 0; i < 44; i++) {
    const first = FIRST[i % FIRST.length], last = `${rng.pick(LAST)} ${rng.pick(LAST)}`;
    const name = `${first} ${last}`;
    if (seen.has(name)) continue;
    seen.add(name);
    n++;
    const hood = rng.pick(HOODS);
    ins.run(name, String(1040100000 + n * 7919), `${plain(first).split(' ')[0]}${n}@${DEMO_EMAIL}`, `30010${String(10000 + n)}`, `Calle ${rng.int(1, 80)} # ${rng.int(1, 50)}-${rng.int(1, 99)}`, rng.chance(0.15) ? rng.pick(['Cliente frecuente', 'Prefiere domicilio por WhatsApp', 'Alérgica al maní']) : '', 0, rng.chance(0.4) ? `Apto ${rng.int(101, 904)}` : '', hood, 'CC', '', '', first, last, 'natural', '', 0, 'no_responsable', 0);
  }
  COMPANIES.forEach(([name, credit, ciiu], i) => {
    const nit = String(900500000 + i * 4817);
    ins.run(name, nit, `compras${i + 1}@${DEMO_EMAIL}`, `30020${String(10000 + i)}`, `Avenida ${rng.int(1, 30)} # ${rng.int(1, 60)}-${rng.int(1, 99)}`, 'Cliente corporativo a crédito', 1, '', rng.pick(HOODS), 'NIT', nitDv(nit), name, '', '', 'juridica', ciiu, 1, 'ordinario', credit);
  });
}

function seedEmployees(ctx, start) {
  const { db, rng } = ctx;
  const ins = db.prepare(`INSERT INTO employees (user_id, name, document, phone, email, position, pay_mode, base_amount, start_date, active, notes, hours_per_day, overtime, legal_deductions, transport_allowance, tip_points, bank_account)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 8, ?, ?, ?, ?, ?)`);
  const out = [];
  ROSTER.forEach((r, i) => {
    const user = r.user ? db.prepare('SELECT id FROM users WHERE username = ?').get(r.user) : null;
    if (user) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(r.name, user.id);
    const id = Number(ins.run(user ? user.id : null, r.name, String(1047300000 + i * 6131), `30030${String(10000 + i)}`, `${plain(r.name).split(' ')[0]}.${i + 1}@${DEMO_EMAIL}`, r.position, r.payMode, r.base, addDays(start, -rng.int(30, 720)), r.retiredDaysAgo ? 0 : 1, r.retiredDaysAgo ? 'Retirado: terminó contrato' : '', r.overtime, r.legal, r.transport, r.points, `0${String(240000000 + i * 913577)}`).lastInsertRowid);
    out.push({ ...r, id });
  });
  return out;
}

/* ======================= gastos y compras ======================= */
function makeExpenseWriter(ctx, today, shiftByDate) {
  const { db, rng } = ctx;
  const cat = name => { const c = db.prepare('SELECT id FROM expense_categories WHERE name = ?').get(name) || db.prepare("SELECT id FROM expense_categories WHERE name = 'Otros'").get() || db.prepare('SELECT id FROM expense_categories LIMIT 1').get(); return c.id; };
  const insExp = db.prepare(`INSERT INTO expenses (date, category_id, supplier_id, description, amount, tax_amount, payment_method, status, due_date, paid_at, invoice_number, notes, from_cash_register, cash_movement_id, source, created_by, retention, retention_pct, invoice_date, support_doc, support_doc_number, support_doc_status, support_doc_issued_at, paid_amount, branch_id, created_at)
    VALUES (@date, @category_id, @supplier_id, @description, @amount, @tax_amount, @payment_method, @status, @due_date, @paid_at, @invoice_number, @notes, @from_cash_register, @cash_movement_id, 'manual', @created_by, @retention, @retention_pct, @invoice_date, @support_doc, @support_doc_number, @support_doc_status, @support_doc_issued_at, @paid_amount, 1, @created_at)`);
  const insPay = db.prepare('INSERT INTO expense_payments (expense_id, date, amount, method, notes, cash_movement_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const insMov = db.prepare("INSERT INTO cash_movements (shift_id, type, amount, reason, cashier_name, created_at) VALUES (?, ?, ?, ?, ?, ?)");
  let supportSeq = 0;
  const { getShiftLiveStats } = require('./routes/shifts');
  const cashOut = (date, amount, reason) => {
    const s = shiftByDate.get(date);
    if (!s || date >= today) return null;
    if (getShiftLiveStats(db, db.prepare('SELECT * FROM cash_shifts WHERE id = ?').get(s.id)).expectedCash < amount + 50000) return null;
    return Number(insMov.run(s.id, 'withdrawal', amount, String(reason).slice(0, 120), s.cashier_name, `${date} ${pad(rng.int(10, 21))}:${pad(rng.int(0, 59))}:00`).lastInsertRowid);
  };
  /** Registra un gasto. pay: { when: [{date, amount?, method}], fromCash } o nada si queda por pagar. */
  const add = ({ date, category, sup, description, amount, tax = 0, due = null, invoice = '', notes = '', pay = [], fromCash = false, retention = null }) => {
    const retPct = sup && sup.retention && (retention !== 0) ? sup.retention : 0;
    const ret = retention === 0 ? 0 : Math.round((amount - tax) * retPct / 100);
    const payable = amount - ret;
    const payments = pay.filter(p => p.date <= today);
    let remaining = payable, paid = 0;
    const rows = payments.map((p, i) => { const a = p.amount && i < payments.length - 1 ? Math.min(p.amount, remaining) : (p.amount || remaining); remaining -= a; paid += a; return { ...p, amount: a }; });
    const full = paid >= payable;
    let movementId = null;
    if (fromCash && full && rows.length === 1) movementId = cashOut(rows[0].date, payable, `Gasto: ${description}`);
    const isDoc = sup && sup.supportDoc;
    const docNo = isDoc ? `DSP-${String(++supportSeq).padStart(6, '0')}` : null;
    const method = full ? rows[rows.length - 1].method : (rows.length ? rows[rows.length - 1].method : 'credit');
    const id = Number(insExp.run({
      date, category_id: cat(category), supplier_id: sup ? sup.id : null, description, amount, tax_amount: tax, payment_method: method, status: full ? 'paid' : 'pending', due_date: due, paid_at: full ? `${rows[rows.length - 1].date} 12:00:00` : null,
      invoice_number: invoice, notes, from_cash_register: movementId ? 1 : 0, cash_movement_id: movementId, created_by: 'Marcela Ortiz Vega', retention: ret, retention_pct: ret ? retPct : 0, invoice_date: invoice ? date : null,
      support_doc: isDoc ? 1 : 0, support_doc_number: docNo, support_doc_status: isDoc ? 'test' : null, support_doc_issued_at: isDoc ? `${date} 12:00:00` : null, paid_amount: paid, created_at: `${date} 12:00:00`,
    }).lastInsertRowid);
    rows.forEach((p, i) => insPay.run(id, p.date, p.amount, p.method, rows.length > 1 ? (i === rows.length - 1 ? 'Pago del saldo' : `Abono ${i + 1}`) : 'Pago registrado con el gasto', movementId, 'Marcela Ortiz Vega', `${p.date} 12:00:00`));
    return id;
  };
  return { add, cashOut, cat };
}

/** Plazo y pagos de una factura de proveedor: lo viejo casi todo pagado, lo reciente por pagar y algo vencido. */
function creditPlan(ctx, date, sup, today) {
  const { rng } = ctx;
  const due = addDays(date, sup.credit || 15);
  const age = (new Date(`${today}T00:00:00Z`) - new Date(`${due}T00:00:00Z`)) / 86400000;
  // Siempre queda una factura sin pagar en cada edad de cartera: los datos cambian cada día, pero la demostración no
  const edad = age >= 65 && age <= 85 ? '61-90' : age >= 35 && age <= 55 ? '31-60' : age >= 3 && age <= 20 ? '1-30' : null;
  ctx.payablesAging = ctx.payablesAging || new Set();
  if (edad && !ctx.payablesAging.has(edad)) { ctx.payablesAging.add(edad); return { due, pay: [] }; }
  if (age < -3 || (age < 25 && rng.chance(0.15)) || (age >= 25 && age < 100 && rng.chance(0.05))) {
    if (rng.chance(0.3)) { const d = addDays(date, rng.int(5, 12)); if (d < today) return { due, pay: [{ date: d, amount: 0.4, method: 'transfer' }] }; }
    return { due, pay: [] };
  }
  const payDate = addDays(due, rng.int(-3, 6));
  if (rng.chance(0.25)) return { due, pay: [{ date: addDays(payDate, -rng.int(6, 10)), amount: 0.5, method: 'transfer' }, { date: payDate, method: 'transfer' }] };
  return { due, pay: [{ date: payDate, method: 'transfer' }] };
}

function seedPurchasesAndStock(ctx, ingredients, suppliers, moves, days, today, writer) {
  const { db, rng } = ctx;
  const stock = new Map(ingredients.map(i => [i.id, 0]));
  const demand = new Map();
  for (const m of moves) { const k = `${m.date}|${m.ing}`; demand.set(k, (demand.get(k) || 0) + m.qty); }
  const recentAvg = new Map();
  for (const ing of ingredients) { let t = 0; for (let i = 1; i <= 14; i++) t += demand.get(`${addDays(today, -i)}|${ing.id}`) || 0; recentAvg.set(ing.id, t / 14); }
  // Lo que falta de hoy y los días que vienen se estima con el promedio reciente: el stock debe aguantar las ventas del día
  const need = (id, from, n) => { let t = 0; for (let i = 0; i < n; i++) { const d = addDays(from, i); t += d >= today ? recentAvg.get(id) : (demand.get(`${d}|${id}`) || 0); } return t; };
  const insMove = db.prepare(`INSERT INTO ingredient_movements (ingredient_id, date, kind, quantity, stock_after, unit_cost, total_cost, order_id, supplier_id, notes, user_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const byDate = new Map();
  for (const m of moves) { if (!byDate.has(m.date)) byDate.set(m.date, []); byDate.get(m.date).push(m); }
  const write = (ing, date, kind, qty, extra = {}) => {
    const after = round3((stock.get(ing.id) || 0) + qty);
    stock.set(ing.id, after);
    insMove.run(ing.id, date, kind, round3(qty), after, extra.unitCost ?? null, extra.totalCost ?? null, extra.orderId ?? null, extra.supplierId ?? null, extra.notes || '', extra.user || '', `${date} 09:00:00`);
  };
  // Stock inicial
  let openingValue = 0;
  for (const ing of ingredients) {
    const qty = Math.ceil(need(ing.id, days[0], 9) * 1.2) + 1; // hasta la primera compra pueden pasar varios días
    write(ing, days[0], 'inicial', qty, { unitCost: ing.cost, totalCost: Math.round(qty * ing.cost), notes: 'Inventario de apertura' });
    openingValue += qty * ing.cost;
  }
  const holdBack = new Set(ingredients.slice(0, 2).map(i => i.id)); // dos insumos quedan bajos para que se vea la alerta
  const bySupplier = new Map();
  for (const ing of ingredients) { if (!bySupplier.has(ing.supplier)) bySupplier.set(ing.supplier, []); bySupplier.get(ing.supplier).push(ing); }
  const lastDays = addDays(today, -5);
  const ingById = new Map(ingredients.map(i => [i.id, i]));
  days.forEach((date, idx) => {
    const dow = dowOf(date);
    if (idx > 0) {
      for (const [supKey, list] of bySupplier) {
        const sup = suppliers[supKey];
        if (!sup) continue;
        // Verduras y pan dos veces por semana; lo demás cada semana
        const buyToday = ['fruver', 'pan', 'mar'].includes(supKey) ? (dow === 1 || dow === 4) : dow === 1;
        if (!buyToday) continue;
        const horizon = ['fruver', 'pan', 'mar'].includes(supKey) ? 4 : 8;
        const lines = [];
        for (const ing of list) {
          // Los dos insumos que quedan bajos solo compran lo justo para terminar el día de hoy
          const short = date >= lastDays && holdBack.has(ing.id);
          const span = short ? Math.round((new Date(`${today}T00:00:00Z`) - new Date(`${date}T00:00:00Z`)) / 86400000) + 3 : horizon;
          const want = need(ing.id, date, span) * 1.15 - (stock.get(ing.id) || 0);
          if (want <= 0) continue;
          const qty = ing.unit === 'unid' ? Math.ceil(want) : Math.ceil(want * 2) / 2;
          lines.push({ ing, qty, total: Math.round(qty * ing.cost) });
        }
        if (!lines.length) continue;
        const amount = lines.reduce((a, l) => a + l.total, 0);
        sup.seq++;
        const invoice = sup.company ? `FV-${sup.seq}` : '';
        const tax = sup.iva ? Math.round(amount * 19 / 119) : 0;
        const description = `Compra de insumos: ${lines.slice(0, 3).map(l => l.ing.name).join(', ')}${lines.length > 3 ? ' y otros' : ''}`;
        const category = supKey === 'empaques' ? 'Empaques y vasos' : 'Materia prima';
        const plan = sup.credit ? creditPlan(ctx, date, sup, today) : { due: null, pay: [{ date, method: 'cash' }] };
        const pay = plan.pay.map(p => (p.amount && p.amount < 1 ? { ...p, amount: hundred((amount - 0) * p.amount) } : p));
        writer.add({ date, category, sup, description, amount, tax, due: plan.due, invoice, pay, fromCash: !sup.credit && amount < 500000, retention: amount >= 1200000 ? undefined : 0 });
        for (const l of lines) write(l.ing, date, 'compra', l.qty, { unitCost: l.ing.cost, totalCost: l.total, supplierId: sup.id, notes: invoice ? `Factura ${invoice}` : 'Documento soporte', user: 'Marcela Ortiz Vega' });
      }
    }
    for (const m of byDate.get(date) || []) {
      write(ingById.get(m.ing), date, 'venta', -m.qty, { orderId: m.order });
    }
    // Merma de vez en cuando y un conteo físico al mes
    if (dow === 6 && rng.chance(0.6)) {
      const ing = rng.pick(ingredients.filter(i => (stock.get(i.id) || 0) > 1));
      if (ing) write(ing, date, 'merma', -round3((stock.get(ing.id) || 0) * rng.int(1, 3) / 100), { notes: rng.pick(['Producto vencido', 'Se dañó en la nevera', 'Se cayó en cocina']), user: 'Pedro Julio Salas' });
    }
    if (date.endsWith('-28')) {
      const ing = rng.pick(ingredients.filter(i => (stock.get(i.id) || 0) > 2));
      if (ing) write(ing, date, 'conteo', -round3((stock.get(ing.id) || 0) * 0.01), { notes: 'Diferencia en el conteo físico de fin de mes', user: 'Marcela Ortiz Vega' });
    }
  });
  const upStock = db.prepare('UPDATE ingredients SET stock = ?, min_stock = ? WHERE id = ?');
  for (const ing of ingredients) {
    const perDay = recentAvg.get(ing.id);
    const left = stock.get(ing.id) || 0;
    const min = holdBack.has(ing.id) ? Math.max(Math.ceil(left) + 1, Math.ceil(perDay * 6)) : Math.min(Math.floor(left * 0.5), Math.ceil(perDay * 2));
    upStock.run(left, Math.max(0, min), ing.id);
  }
  return openingValue;
}

function seedOtherExpenses(ctx, suppliers, days, today, writer) {
  const { rng } = ctx;
  const { add } = writer;
  const inMonth = (date, day) => date.endsWith(`-${pad(day)}`);
  const seq = { n: rng.int(300, 700) };
  const inv = p => `${p}-${++seq.n}`;
  const monthName = d => ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][Number(d.slice(5, 7)) - 1];
  for (const date of days) {
    const pending = date >= addDays(today, -3);
    const bill = (day, category, sup, text, base, spread, prefix, payAfter = 8) => {
      if (!sup || !inMonth(date, day)) return;
      const amount = hundred(base * (1 - spread + rng() * spread * 2));
      const tax = sup.iva ? Math.round(amount * 19 / 119) : 0;
      add({ date, category, sup, description: `${text} ${monthName(date)}`, amount, tax, due: addDays(date, payAfter), invoice: inv(prefix), pay: pending ? [] : [{ date: addDays(date, rng.int(1, payAfter)), method: 'transfer' }] });
    };
    bill(1, 'Arriendo', suppliers.arriendo, 'Arriendo del local', 6500000, 0, 'AR', 5);
    bill(12, 'Servicios públicos', suppliers.energia, 'Energía eléctrica', 2150000, 0.12, 'EE');
    bill(15, 'Servicios públicos', suppliers.acueducto, 'Acueducto y alcantarillado', 520000, 0.1, 'AC');
    bill(18, 'Servicios públicos', suppliers.gas, 'Gas natural', 640000, 0.1, 'GN');
    bill(20, 'Servicios públicos', suppliers.internet, 'Internet y telefonía', 189900, 0, 'IN');
    bill(5, 'Otros', suppliers.contador, 'Honorarios de contabilidad', 850000, 0, 'HC');
    bill(8, 'Marketing y publicidad', suppliers.publicidad, 'Pauta en redes sociales', 900000, 0.2, 'PB');
    if (inMonth(date, 28)) add({ date, category: 'Impuestos y bancos', description: `Comisiones bancarias y 4 x 1000 de ${monthName(date)}`, amount: hundred(180000 + rng() * 170000), pay: [{ date, method: 'transfer' }] });
    // Gastos menores que salen de la caja
    if (date < today && rng.chance(0.4)) {
      const [text, category] = rng.pick([['Hielo', 'Materia prima'], ['Mensajería a bancos', 'Transporte y domicilios'], ['Implementos de aseo', 'Otros'], ['Gasolina de domicilios', 'Transporte y domicilios'], ['Papel para impresora térmica', 'Otros'], ['Bombillos para el salón', 'Mantenimiento']]);
      add({ date, category, description: text, amount: hundred(15000 + rng() * 75000), pay: [{ date, method: 'cash' }], fromCash: true });
    }
    // Mantenimiento con documento soporte (persona no obligada a facturar)
    if (suppliers.tecnico && date < today && rng.chance(0.07)) {
      add({ date, category: 'Mantenimiento', sup: suppliers.tecnico, description: rng.pick(['Mantenimiento de la nevera', 'Reparación de la freidora', 'Limpieza de la campana extractora', 'Revisión del aire acondicionado']), amount: hundred(180000 + rng() * 620000), pay: [{ date: addDays(date, rng.int(0, 3)), method: 'transfer' }] });
    }
  }
  // Gastos anulados: conservan su consecutivo y salen de los informes (no son compras: su mercancía seguiría en el inventario)
  const { db } = ctx;
  const voided = [[addDays(today, -41), 'Honorarios de contabilidad', suppliers.contador, 'Factura registrada dos veces'], [addDays(today, -17), 'Pauta en redes sociales', suppliers.publicidad, 'El proveedor la reemplazó por otra']];
  for (const [date, description, sup, reason] of voided) {
    if (!sup) continue;
    const id = add({ date, category: description.startsWith('Pauta') ? 'Marketing y publicidad' : 'Otros', sup, description, amount: hundred(300000 + rng() * 500000), invoice: inv('AN'), due: addDays(date, 15) });
    db.prepare("UPDATE expenses SET voided_at = ?, void_reason = ?, voided_by = 'Marcela Ortiz Vega' WHERE id = ?").run(`${addDays(date, 2)} 09:00:00`, reason, id);
  }
}

/* ======================= personal ======================= */
function fortnights(from, today) {
  const out = [];
  let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7));
  for (let i = 0; i < HISTORY_MONTHS + 1; i++) {
    const ym = `${y}-${pad(m)}`;
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (const [a, b] of [[`${ym}-01`, `${ym}-15`], [`${ym}-16`, `${ym}-${pad(last)}`]]) if (a >= from && b < today) out.push({ from: a, to: b });
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

function seedStaffActivity(ctx, staff, days, today, shiftByDate, writer) {
  const { db, rng } = ctx;
  const cfg = payroll.readConfig(db);
  const staffRoutes = require('./routes/staff');
  const { computeSettlement, EMP_SELECT } = staffRoutes;
  PX.saveTasks(db, [{ id: 'armado_carne', name: 'Armado de carne', amount: 15000 }, { id: 'lavado_campana', name: 'Lavado de campana', amount: 35000 }, { id: 'inventario', name: 'Apoyo en conteo de inventario', amount: 25000 }]);
  PX.saveTipsConfig(db, { payout: 'separate', commonSplit: 'hours', period: 'biweekly', allCommon: false, hideFromStaff: false });
  const empRow = id => db.prepare(`${EMP_SELECT} WHERE id = ?`).get(id);
  const active = staff.filter(s => !s.retiredDaysAgo);
  const periods = fortnights(days[0], today);
  const current = today.slice(8, 10) <= '15' ? { from: `${today.slice(0, 7)}-01`, to: today } : { from: `${today.slice(0, 7)}-16`, to: today };
  const absent = new Map();
  const markAbsent = (id, date, n) => { if (!absent.has(id)) absent.set(id, new Set()); for (let i = 0; i < n; i++) absent.get(id).add(addDays(date, i)); };

  /* ---------- novedades ---------- */
  const insNov = db.prepare('INSERT INTO payroll_novelties (employee_id, date, type, quantity, amount, pct, notes, created_by, label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const tasks = PX.readTasks(db);
  const novelty = (s, date, type, { quantity = 0, amount = null, notes = '', label = null } = {}) => {
    const auto = PX.noveltyAmount(empRow(s.id), type, quantity, date, cfg);
    const value = amount !== null ? amount : auto.amount;
    if (!value || value <= 0) return;
    insNov.run(s.id, date, type, quantity, value, amount === null ? auto.pct : null, notes, 'Marcela Ortiz Vega', label);
  };
  const noOvertime = active.filter(s => !s.overtime);
  const conSueldo = active.filter(s => s.payMode === 'monthly' || s.payMode === 'biweekly');
  const domis = active.filter(s => /domicil/i.test(s.position));
  for (const p of [...periods, current]) {
    const rand = () => { const d = addDays(p.from, rng.int(0, 13)); return d > today ? today : d; };
    novelty(rng.pick(active), rand(), 'bonus', { amount: hundred(50000 + rng() * 150000), notes: rng.pick(['Mejor servicio de la quincena', 'Cumplimiento de meta de ventas', 'Apoyo en evento']) });
    novelty(rng.pick(active.filter(s => /meser|cajer/i.test(s.position))), rand(), 'commission', { amount: hundred(40000 + rng() * 120000), notes: 'Comisión por ventas de combos' });
    const t = rng.pick(tasks);
    novelty(rng.pick(active.filter(s => /cocin|planch|auxiliar|oficios/i.test(s.position))), rand(), 'task', { quantity: rng.int(1, 4), amount: t.amount * rng.int(1, 4), label: t.name });
    if (domis.length) novelty(rng.pick(domis), rand(), 'operational', { amount: hundred(5000 + rng() * 8000), notes: `Domicilio repetido: pedido incompleto #${rng.int(100, 900)}` });
    novelty(rng.pick(active), rand(), 'damage', { amount: hundred(10000 + rng() * 30000), notes: rng.pick(['Vajilla quebrada', 'Faltante en caja asumido', 'Pérdida de uniforme']) });
    novelty(rng.pick(noOvertime), rand(), rng.pick(['extra_day', 'night_surcharge']), { quantity: rng.int(2, 6), notes: 'Cierre de inventario' });
    if (rng.chance(0.7)) { const s = rng.pick(active), d = rand(); novelty(s, d, 'absence', { quantity: 1, notes: 'No se presentó y no avisó' }); markAbsent(s.id, d, 1); }
    if (rng.chance(0.6)) { const s = rng.pick(conSueldo), d = rand(), q = rng.int(1, 3); novelty(s, d, 'incapacity', { quantity: q, notes: 'Incapacidad médica por gripa' }); markAbsent(s.id, d, q); }
    if (rng.chance(0.3)) { const s = rng.pick(active), d = rand(); novelty(s, d, 'unpaid_leave', { quantity: 1, notes: 'Permiso por diligencia personal' }); markAbsent(s.id, d, 1); }
    if (rng.chance(0.3)) novelty(rng.pick(active), rand(), 'other_deduction', { amount: 35000, notes: 'Dotación adicional' });
    if (rng.chance(0.3)) novelty(rng.pick(active), rand(), 'other_income', { amount: hundred(30000 + rng() * 50000), notes: 'Reembolso de transporte a evento' });
  }
  if (conSueldo.length && periods.length > 2) { const s = conSueldo[conSueldo.length - 1], d = addDays(periods[1].from, 2); novelty(s, d, 'vacation', { quantity: 5, notes: 'Vacaciones programadas' }); markAbsent(s.id, d, 5); }

  /* ---------- asistencia ---------- */
  const insAtt = db.prepare("INSERT INTO attendance (employee_id, date, check_in, check_out, hours, shift_id, source, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  for (const date of days) {
    const shift = shiftByDate.get(date);
    for (const s of staff) {
      if (s.retiredDaysAgo && date > addDays(today, -s.retiredDaysAgo)) continue;
      if (dowOf(date) === s.rest || (absent.get(s.id) && absent.get(s.id).has(date))) continue;
      const [a, b] = TURNS[s.turn];
      const inMin = a * 60 + rng.int(-10, 12);
      const stay = rng.chance(0.07) ? rng.int(45, 120) : rng.int(-5, 10);
      const outMin = b * 60 + stay;
      const fmt = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}:00`;
      if (date === today) insAtt.run(s.id, date, `${date} ${fmt(inMin)}`, null, 0, shift ? shift.id : null, 'auto', '');
      else insAtt.run(s.id, date, `${date} ${fmt(inMin)}`, `${date} ${fmt(Math.min(outMin, 23 * 60 + 59))}`, Math.round((Math.min(outMin, 23 * 60 + 59) - inMin) / 60 * 100) / 100, shift ? shift.id : null, /cajer/i.test(s.position) ? 'auto' : 'manual', '');
    }
  }

  /* ---------- anticipos y préstamos ---------- */
  const insAdv = db.prepare('INSERT INTO advances (employee_id, date, amount, from_cash_register, cash_movement_id, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const p of [...periods, current]) {
    for (let i = 0, n = rng.int(2, 4); i < n; i++) {
      const s = rng.pick(active);
      let d = addDays(p.from, rng.int(2, 11));
      if (d > today) d = today;
      if (d < days[0]) continue;
      const amount = hundred(rng.pick([50000, 80000, 100000, 150000, 200000]));
      const fromCash = rng.chance(0.6);
      const mov = fromCash ? writer.cashOut(d, amount, `Anticipo de sueldo: ${s.name}`) : null;
      insAdv.run(s.id, d, amount, mov ? 1 : 0, mov, rng.pick(['Calamidad doméstica', 'Solicitud personal', 'Pago de arriendo', '']), `${d} 12:00:00`);
    }
  }
  const insLoan = db.prepare("INSERT INTO employee_loans (employee_id, date, amount, installments, installment_amount, paid_total, status, from_cash_register, cash_movement_id, notes, created_by, frequency, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, 'Marcela Ortiz Vega', ?, 'loan', ?)");
  const byPos = re => active.find(s => re.test(s.position));
  const loan = (s, daysAgo, amount, installments, frequency, notes, paidBefore = 0) => {
    if (!s) return;
    const d = addDays(today, -daysAgo);
    const installment = Math.ceil(amount / installments);
    const id = Number(insLoan.run(s.id, d, amount, installments, installment, paidBefore * installment, 0, null, notes, frequency, `${d} 12:00:00`).lastInsertRowid);
    for (let i = 0; i < paidBefore; i++) db.prepare("INSERT INTO loan_payments (loan_id, employee_id, date, amount, settlement_id, notes) VALUES (?, ?, ?, ?, NULL, 'Descontada antes de registrar el préstamo en el sistema')").run(id, s.id, d, installment);
  };
  loan(byPos(/cociner/i), 80, 1200000, 6, 'biweekly', 'Arreglo de vivienda');
  loan(byPos(/meser/i), 85, 600000, 3, 'monthly', 'Compra de electrodoméstico');
  loan(byPos(/domicil/i), 70, 400000, 2, 'biweekly', 'Reparación de la moto');
  loan(byPos(/cajer/i), 18, 900000, 9, 'biweekly', 'Estudio de su hijo');
  loan(byPos(/planch/i), 60, 1000000, 5, 'biweekly', 'Préstamo que venía de antes del sistema', 2);

  /* ---------- liquidaciones ---------- */
  const insSet = db.prepare(`INSERT INTO payroll_settlements (employee_id, period_start, period_end, pay_mode, units, unit_amount, base_total, tips_total, advances_total, bonuses, deductions, total, status, notes,
    extras_total, allowance_total, legal_deductions_total, details, novelties_extras, novelties_bonus, novelties_absence, novelties_deductions, loans_total, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 'pending', '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const payrollCat = db.prepare("SELECT id FROM expense_categories WHERE kind = 'payroll' ORDER BY id LIMIT 1").get();
  const insPayExp = db.prepare(`INSERT INTO expenses (date, category_id, description, amount, payment_method, status, paid_at, from_cash_register, source, reference_id, created_by, notes, branch_id, created_at) VALUES (?, ?, ?, ?, ?, 'paid', ?, 0, 'payroll', ?, 'Marcela Ortiz Vega', '', 1, ?)`);
  periods.forEach((p, idx) => {
    const lastPeriod = idx === periods.length - 1;
    const payDate = addDays(p.to, rng.int(1, 2));
    for (const s of staff) {
      if (s.retiredDaysAgo && p.from > addDays(today, -s.retiredDaysAgo)) continue;
      const emp = empRow(s.id);
      const loanOpts = s.retiredDaysAgo && p.to >= addDays(today, -s.retiredDaysAgo) ? { payoff: db.prepare("SELECT id FROM employee_loans WHERE employee_id = ? AND status = 'active'").all(s.id).map(l => l.id) } : {};
      const c = computeSettlement(db, emp, p.from, p.to, loanOpts, {});
      if (!c.units && !c.baseTotal) continue;
      const total = c.baseTotal + c.extrasTotal + c.allowanceTotal + c.tipsTotal + c.noveltiesExtras + c.noveltiesBonus - c.noveltiesAbsence - c.noveltiesDeductions - c.advancesTotal - c.loansTotal - c.legalDeductionsTotal;
      const details = JSON.stringify({
        unitLabel: c.unitLabel, periodDays: c.periodDays, daysWorked: c.daysWorked, dayValue: c.dayValue,
        extras: c.extras.lines, hours: c.extras.hoursSummary, hourlyValue: c.extras.hourlyValue, hoursPerDay: c.extras.hoursPerDay, sundayPct: c.extras.sundayPct,
        allowance: c.allowance, legalDeductions: c.legalDeductions.lines, salaryBase: c.salaryBase, tipsDirect: c.tipsDirect, tipsShared: c.tipsShared, tipsSeparate: c.tipsSeparate,
        novelties: c.novelties.map(n => ({ id: n.id, date: n.date, type: n.type, label: n.label, group: n.group, quantity: n.quantity, amount: n.amount, notes: n.notes })),
        loans: c.loans.filter(l => !l.skipped).map(l => ({ id: l.id, number: l.number, installments: l.installments, frequency: l.frequency, amount: l.amount, balance: l.balance - l.amount, payoff: l.payoff, notes: l.notes })),
      });
      const id = Number(insSet.run(emp.id, p.from, p.to, emp.payMode, c.units, c.unitAmount, c.baseTotal, c.tipsTotal, c.advancesTotal, total, c.extrasTotal, c.allowanceTotal, c.legalDeductionsTotal, details, c.noveltiesExtras, c.noveltiesBonus, c.noveltiesAbsence, c.noveltiesDeductions, c.loansTotal, `${p.to} 20:00:00`).lastInsertRowid);
      PX.applyLoanPlan(db, emp.id, p.to, id, c.loanPlan);
      if (c.novelties.length) db.prepare(`UPDATE payroll_novelties SET settlement_id = ? WHERE id IN (${c.novelties.map(() => '?').join(',')})`).run(id, ...c.novelties.map(n => n.id));
      if (c.advances.length) db.prepare(`UPDATE advances SET settled = 1, settlement_id = ? WHERE id IN (${c.advances.map(() => '?').join(',')})`).run(id, ...c.advances.map(a => a.id));
      // La última quincena queda en parte por pagar, para que se vea el flujo completo
      const leavePending = payDate >= today || (lastPeriod && rng.chance(0.4));
      if (leavePending) continue;
      const method = total <= 900000 && rng.chance(0.2) ? 'cash' : 'transfer';
      let expenseId = null;
      if (total > 0 && payrollCat) expenseId = Number(insPayExp.run(payDate, payrollCat.id, `Nómina: ${emp.name} (${p.from} a ${p.to})`, total, method, `${payDate} 12:00:00`, id, `${payDate} 12:00:00`).lastInsertRowid);
      db.prepare("UPDATE payroll_settlements SET status = 'paid', paid_at = ?, payment_method = ?, expense_id = ? WHERE id = ?").run(`${payDate} 12:00:00`, method, expenseId, id);
    }
    // Propinas: se pagan aparte, cada quincena, por el saldo al corte
    if (lastPeriod) return;
    for (const s of staff) {
      const bal = PX.tipBalance(db, s.id, p.to).balance;
      if (bal <= 0) continue;
      const method = rng.chance(0.6) ? 'transfer' : 'cash';
      const mov = method === 'cash' ? writer.cashOut(payDate, bal, `Propinas: ${s.name}`) : null;
      db.prepare("INSERT INTO tip_payouts (employee_id, date, amount, method, kind, period_start, period_end, from_cash_register, cash_movement_id, notes, created_by, created_at) VALUES (?, ?, ?, ?, 'liquidacion', ?, ?, ?, ?, ?, 'Marcela Ortiz Vega', ?)")
        .run(s.id, payDate, bal, method, p.from, p.to, mov ? 1 : 0, mov, `Propinas ${p.from} a ${p.to}`, `${payDate} 12:00:00`);
    }
  });
  // Un abono de propinas en la quincena en curso
  const someone = active.find(s => s.points >= 2);
  if (someone && today > addDays(current.from, 1)) {
    const d = addDays(today, -1);
    const bal = PX.tipBalance(db, someone.id, d).balance;
    if (bal > 20000) db.prepare("INSERT INTO tip_payouts (employee_id, date, amount, method, kind, notes, created_by, created_at) VALUES (?, ?, ?, 'transfer', 'abono', 'Abono solicitado', 'Marcela Ortiz Vega', ?)").run(someone.id, d, hundred(bal / 2), `${d} 12:00:00`);
  }
}

/* ======================= cartera ======================= */
function seedReceivables(ctx, today) {
  const { db, rng } = ctx;
  const ins = db.prepare("INSERT INTO order_payments (order_id, date, amount, method, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?, 'Laura Martínez Polo', ?)");
  const days = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
  // Ventas a crédito: las viejas casi todas pagadas; quedan saldos vigentes y vencidos a 30, 60 y 90 días
  const agingDone = new Set();
  for (const o of db.prepare("SELECT o.id, o.total, COALESCE(o.tip, 0) AS tip, date(o.created_at) AS d, COALESCE(c.credit_days, 30) AS credit FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.payment_method = 'credit' AND o.status = 'delivered' ORDER BY o.id").all()) {
    const age = days(o.d, today);
    const total = o.total + o.tip;
    const overdue = age - o.credit;
    const edad = overdue >= 65 && overdue <= 85 ? '61-90' : overdue >= 35 && overdue <= 55 ? '31-60' : overdue >= 3 && overdue <= 25 ? '1-30' : null;
    if (edad && !agingDone.has(edad)) { agingDone.add(edad); continue; }
    const r = rng();
    const fullChance = age > o.credit + 20 ? 0.72 : age > o.credit ? 0.45 : 0.1;
    if (r < fullChance) {
      const payDate = addDays(o.d, Math.min(age - 1, o.credit + rng.int(-5, 15)));
      if (payDate >= today || age < 2) continue;
      if (rng.chance(0.3) && age > 12) {
        const first = hundred(total * 0.4);
        const firstDate = addDays(o.d, Math.max(1, Math.floor(days(o.d, payDate) / 2)));
        ins.run(o.id, firstDate, first, 'transfer', 'Abono', `${firstDate} 10:00:00`);
        ins.run(o.id, payDate, total - first, 'transfer', 'Pago del saldo', `${payDate} 10:00:00`);
      } else ins.run(o.id, payDate, total, 'transfer', 'Pago total', `${payDate} 10:00:00`);
      db.prepare("UPDATE orders SET payment_status = 'paid' WHERE id = ?").run(o.id);
    } else if (r < fullChance + 0.2 && age > 8) {
      const d = addDays(o.d, rng.int(3, Math.max(4, age - 1)));
      if (d < today) ins.run(o.id, d, hundred(total * rng.pick([0.3, 0.5])), rng.pick(['transfer', 'cash']), 'Abono parcial', `${d} 10:00:00`);
    }
  }
  // Las plataformas pagan después: lo de hace más de una semana ya entró por transferencia
  for (const o of db.prepare("SELECT id, total, COALESCE(tip, 0) AS tip, channel, date(created_at) AS d FROM orders WHERE payment_method = 'platform' AND status = 'delivered' AND date(created_at) <= ? ORDER BY id").all(addDays(today, -9))) {
    const dow = dowOf(o.d);
    const payDate = addDays(o.d, 8 + ((8 - dow) % 7));
    if (payDate >= today) continue;
    ins.run(o.id, payDate, o.total + o.tip, 'transfer', `Liquidación ${o.channel === 'rappi' ? 'Rappi' : 'DiDi Food'}`, `${payDate} 10:00:00`);
  }
}

/* ======================= cierre de cajas ======================= */
function closeShifts(ctx, shifts, today) {
  const { db, rng } = ctx;
  const { getShiftLiveStats } = require('./routes/shifts');
  const up = db.prepare(`UPDATE cash_shifts SET status = 'closed', closed_at = ?, expected_cash = ?, actual_cash = ?, difference = ?, total_cash_sales = ?, total_card_debit = ?, total_card_credit = ?, total_transfer = ?, total_sales = ?, total_orders = ?, notes = ?, counted_detail = ?, expected_detail = ?, total_tips = ?,
    reconciled_at = ?, reconciled_by = ?, reconciled_amount = ?, reconcile_reason = ?, reconcile_comment = ? WHERE id = ?`);
  for (const s of shifts) {
    if (s.date >= today) continue;
    const row = db.prepare('SELECT * FROM cash_shifts WHERE id = ?').get(s.id);
    const st = getShiftLiveStats(db, row);
    const r = rng();
    const diff = r < 0.82 ? 0 : hundred((r < 0.92 ? -1 : 1) * (1000 + rng() * 12000));
    const counted = st.expectedCash + diff;
    const detail = { cash: counted, transfer: st.expectedByMethod.transfer, card: st.expectedByMethod.card };
    const closedAt = `${s.date} 23:${pad(rng.int(5, 40))}:00`;
    const older = s.date < addDays(today, -4);
    const system = st.expectedByMethod.cash + st.expectedByMethod.transfer + st.expectedByMethod.card;
    up.run(closedAt, st.expectedCash, counted, diff, st.cashSales, st.debitSales, st.creditSales, st.transferSales, st.totalSales, st.totalOrders, diff ? (diff < 0 ? 'Faltante por vueltas mal entregadas' : 'Sobrante sin identificar') : '', JSON.stringify(detail), JSON.stringify(st.expectedByMethod), st.totalTips,
      older ? `${addDays(s.date, 1)} 09:30:00` : null, older ? 'Marcela Ortiz Vega' : null, older ? system + diff : null, older && diff ? 'Diferencia de caja revisada con el cajero' : null, older && diff ? 'Se deja constancia en el arqueo' : null, s.id);
  }
}

/* ======================= contabilidad manual ======================= */
const accBalance = (db, code, date) => db.prepare(`SELECT COALESCE(SUM(l.debit - l.credit), 0) AS s FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id WHERE e.status = 'posted' AND l.account_code = ? AND e.date <= ?`).get(code, date).s;

function postManualAccounting(ctx, days, today, openingValue) {
  const { db, rng } = ctx;
  const post = (date, description, lines) => L.postEntry(db, { date, source: 'manual', description, lines, createdBy: 'Contadores Arrieta & Asociados' });
  const CASH = '110505', BANK = '11100501', TRANSFER = '11100502', CARD = '11100503';
  const opening = addDays(days[0], -1);
  const assets = 22000000;
  post(opening, 'Saldos iniciales del período', [
    { account: CASH, debit: 1500000, description: 'Caja general' },
    { account: BANK, debit: 45000000, description: 'Banco principal' },
    { account: TRANSFER, debit: 8000000, description: 'Cuenta de transferencias' },
    { account: '143505', debit: Math.round(openingValue), description: 'Inventario de apertura' },
    { account: '152405', debit: assets, description: 'Muebles y equipos del local' },
    { account: '152805', debit: 4500000, description: 'Equipos de cómputo y caja' },
    { account: '313005', credit: 1500000 + 45000000 + 8000000 + Math.round(openingValue) + assets + 4500000, description: 'Capital del propietario' },
  ]);
  // Fin de mes: depreciación. Cada lunes: consignar el efectivo y mover lo del datáfono al banco, dejando saldo en la cuenta de transferencias
  for (const date of days) {
    const last = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)).getUTCDate();
    if (Number(date.slice(8, 10)) === last && date < today) post(date, `Depreciación mensual de ${date.slice(0, 7)}`, [{ account: '516015', debit: 360000, description: 'Depreciación de muebles y equipos' }, { account: '159215', credit: 360000, description: 'Depreciación acumulada' }]);
    if (dowOf(date) !== 1 || date >= today) continue;
    const cash = accBalance(db, CASH, date);
    const toDeposit = Math.floor((cash - 1500000) / 100000) * 100000;
    if (toDeposit >= 300000) post(date, 'Consignación del efectivo de la semana', [{ account: BANK, debit: toDeposit, description: 'Consignación' }, { account: CASH, credit: toDeposit, description: 'Consignación' }]);
    const card = accBalance(db, CARD, date);
    if (card > 0) post(date, 'Abono del datáfono al banco', [{ account: BANK, debit: card, description: 'Abono del datáfono' }, { account: CARD, credit: card, description: 'Abono del datáfono' }]);
    const horizon = accBalance(db, TRANSFER, addDays(date, 7));
    const now = accBalance(db, TRANSFER, date);
    const lowest = Math.min(horizon, now);
    if (lowest < 6000000) {
      const move = Math.ceil((9000000 - lowest) / 100000) * 100000;
      post(date, 'Traslado a la cuenta de transferencias para pagos', [{ account: TRANSFER, debit: move, description: 'Traslado entre cuentas' }, { account: BANK, credit: move, description: 'Traslado entre cuentas' }]);
    }
  }
  // Impuestos y aportes retenidos: se pagan por el saldo al corte
  const settle = (date, cutoff, description, codes) => {
    if (date >= today) return;
    const lines = [];
    let total = 0;
    for (const code of codes) { const owed = -accBalance(db, code, cutoff); if (owed > 0) { lines.push({ account: code, debit: owed, description }); total += owed; } }
    if (total > 0) { lines.push({ account: BANK, credit: total, description }); post(date, description, lines); }
  };
  const months = [...new Set(days.map(d => d.slice(0, 7)))];
  for (const m of months) {
    const next = addDays(`${m}-28`, 7).slice(0, 7);
    const end = addDays(`${next}-01`, -1);
    settle(`${next}-10`, end, `Pago de aportes de salud y pensión de ${m}`, ['237005', '238030']);
    settle(`${next}-12`, end, `Pago de retención en la fuente de ${m}`, ['236540']);
    if (Number(m.slice(5, 7)) % 2 === 0) settle(`${next}-20`, end, `Pago del INC del bimestre que termina en ${m}`, ['249505']);
  }
  /*
   * Notas crédito y débito: el sistema no emite estos documentos ante la DIAN. Se muestran como comprobantes de contabilidad,
   * porque así los registraría hoy un contador. Se pagan por banco para no alterar la cartera por documento.
   */
  const invoices = db.prepare("SELECT id, fe_number AS fe, customer_name AS name, customer_doc AS doc, customer_id AS cid, total, date(created_at) AS d FROM orders WHERE fe_number IS NOT NULL AND status = 'delivered' AND payment_status = 'paid' AND customer_doc != '222222222222' AND date(created_at) < ? ORDER BY id").all(addDays(today, -3));
  const third = o => ({ type: 'customer', id: o.cid, doc: o.doc, name: o.name });
  const notesFor = invoices.filter((_, i) => i % Math.max(1, Math.floor(invoices.length / 7)) === 0).slice(0, 7);
  notesFor.forEach((o, i) => {
    const date = addDays(o.d, rng.int(1, 3));
    if (date >= today) return;
    if (i % 3 === 2) {
      const amount = hundred(8000 + rng() * 25000);
      post(date, `Nota débito (registro contable): intereses de mora, factura ${o.fe} · ${o.name}`, [{ account: TRANSFER, debit: amount, third: third(o), description: 'Intereses cobrados', docRef: o.fe }, { account: '421005', credit: amount, third: third(o), description: 'Intereses de mora', docRef: o.fe }]);
      return;
    }
    const amount = Math.max(1000, hundred(o.total * rng.pick([0.1, 0.15, 0.25])));
    const base = Math.round(amount / 1.08);
    post(date, `Nota crédito (registro contable): devolución parcial, factura ${o.fe} · ${o.name}`, [
      { account: '417501', debit: base, third: third(o), description: 'Devolución en ventas', docRef: o.fe },
      { account: '249505', debit: amount - base, third: third(o), description: 'INC de la devolución', docRef: o.fe },
      { account: TRANSFER, credit: amount, third: third(o), description: 'Devolución al cliente', docRef: o.fe },
    ]);
  });
  const buys = db.prepare("SELECT e.id, e.invoice_number AS inv, e.amount, e.date, s.id AS sid, s.name, s.nit FROM expenses e JOIN suppliers s ON s.id = e.supplier_id WHERE e.invoice_number != '' AND e.status = 'paid' AND e.voided_at IS NULL AND e.source = 'manual' AND s.category IN ('Carnes', 'Lácteos', 'Abarrotes', 'Bebidas', 'Pescados y mariscos', 'Panadería', 'Empaques') ORDER BY e.id").all();
  buys.filter((_, i) => i % Math.max(1, Math.floor(buys.length / 5)) === 0).slice(0, 5).forEach((e, i) => {
    const date = addDays(e.date, rng.int(2, 6));
    if (date >= today) return;
    const t = { type: 'supplier', id: e.sid, doc: e.nit, name: e.name };
    if (i % 2 === 0) {
      const amount = Math.max(1000, hundred(e.amount * rng.pick([0.03, 0.05, 0.08])));
      post(date, `Nota crédito del proveedor (registro contable): devolución de mercancía, factura ${e.inv} · ${e.name}`, [{ account: BANK, debit: amount, third: t, description: 'Devolución del proveedor', docRef: e.inv }, { account: '622505', credit: amount, third: t, description: 'Devolución en compras', docRef: e.inv }]);
    } else {
      const amount = hundred(25000 + rng() * 60000);
      post(date, `Nota débito del proveedor (registro contable): flete no incluido, factura ${e.inv} · ${e.name}`, [{ account: '523550', debit: amount, third: t, description: 'Flete adicional', docRef: e.inv }, { account: BANK, credit: amount, third: t, description: 'Pago del flete', docRef: e.inv }]);
    }
  });
}

/* ======================= cuentas en curso ======================= */
function seedLiveOrders(ctx, shift, now) {
  const { db, rng, tables, waiters, couriers, naturals } = ctx;
  const ids = [];
  const open = (type, status, kitchen, extra = {}) => {
    const items = pickItems(ctx, rng.int(2, 4));
    const subtotal = items.reduce((a, x) => a + x.price * x.qty, 0);
    const at = shiftTime(now, -rng.int(5, 40));
    const info = db.prepare(`INSERT INTO orders (type, status, customer_name, customer_phone, customer_address, customer_neighborhood, customer_id, table_id, table_label, table_number, people, waiter_id, waiter_name, driver_id, driver_name, subtotal, delivery_fee, discount, total, payment_method, payment_status, created_at, shipped_at, shift_id, cashier_name, created_by, channel, branch_id, sale_label, estimated_minutes)
      VALUES (@type, @status, @name, @phone, @address, @hood, @cid, @tid, @tlabel, @tnum, @people, @wid, @wname, @did, @dname, @subtotal, @fee, 0, @total, 'cash', 'pending', @at, @shipped, @shift, @cashier, @by, @channel, 1, @label, @eta)`).run({
      type, status, name: extra.customer ? extra.customer.name : 'Consumidor Final', phone: extra.customer ? extra.customer.phone : '', address: extra.customer ? extra.customer.address : '', hood: extra.customer ? extra.customer.neighborhood : null, cid: extra.customer ? extra.customer.id : null,
      tid: extra.table ? extra.table.id : null, tlabel: extra.table ? extra.table.label : null, tnum: extra.table ? (parseInt(extra.table.label, 10) || null) : null, people: extra.table ? rng.int(2, 5) : 0, wid: extra.waiter ? extra.waiter.id : null, wname: extra.waiter ? extra.waiter.name : null, did: extra.driver ? extra.driver.id : null, dname: extra.driver ? extra.driver.name : null,
      subtotal, fee: extra.fee || 0, total: subtotal + (extra.fee || 0), at, shipped: status === 'shipped' ? shiftTime(at, 15) : null, shift: shift ? shift.id : null, cashier: shift ? shift.cashier_name : 'Caja', by: extra.waiter ? extra.waiter.name : (shift ? shift.cashier_name : 'Caja'), channel: type === 'delivery' ? 'whatsapp' : 'local', label: extra.label || null, eta: type === 'delivery' ? 45 : null,
    });
    const oid = Number(info.lastInsertRowid);
    for (const x of items) db.prepare('INSERT INTO order_items (order_id, product_id, name, size, quantity, price, batch, sent_at, kitchen_status, unit_cost) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)').run(oid, x.pr.id, x.pr.name, x.size, x.qty, x.price, at, kitchen, x.pr.cost || 0);
    ids.push(oid);
  };
  const free = [...tables].sort(() => rng() - 0.5).slice(0, Math.min(3, tables.length));
  free.forEach((t, i) => open('dine-in', 'open', i === 0 ? 'ready' : 'pending', { table: t, waiter: waiters.length ? rng.pick(waiters) : null }));
  open('pickup', 'preparing', 'pending', { label: 'Sofía' });
  open('pickup', 'ready', 'ready', { label: 'Mateo' });
  if (naturals.length && ctx.pack.sales.delivery > 0) {
    open('delivery', 'preparing', 'pending', { customer: rng.pick(naturals), fee: ctx.pack.deliveryFee });
    open('delivery', 'shipped', 'ready', { customer: rng.pick(naturals), fee: ctx.pack.deliveryFee, driver: couriers.length ? rng.pick(couriers) : null });
  }
  db.prepare("INSERT INTO settings (key, value) VALUES ('demoLiveOrders', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(ids));
}

/* ======================= generación completa ======================= */
function seedBusiness(db, pack, nowOverride = null) {
  const now = nowOverride || nowLocal(db);
  const today = now.slice(0, 10);
  const rng = makeRng(seedOf(`${pack.id}|${today}`));
  const set = (k, v) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(v));
  // Restaurante con impuesto al consumo e inventario permanente: así se ve completa la contabilidad
  set('taxType', 'inc'); set('taxRate', '8'); set('inventoryMethod', 'perpetual'); set('feProvider', 'test');
  for (const [k, v] of [['businessNit', '900000000-1'], ['businessAddress', 'Cartagena de Indias'], ['businessPhone', '300 000 0000']]) { const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(k); if (!r || !r.value) set(k, v); }

  const startMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - HISTORY_MONTHS, 1)).toISOString().slice(0, 10);
  const days = [];
  for (let d = startMonth; d <= today; d = addDays(d, 1)) days.push(d);
  let ctx = loadCtx(db, pack, rng);

  // Maestros: proveedores que el menú necesita, recetas y costos, clientes y personal
  const neededSup = new Set(['arriendo', 'energia', 'acueducto', 'gas', 'internet', 'contador', 'publicidad', 'tecnico']);
  for (const p of ctx.products) {
    const rule = RECIPES.find(([re]) => re.test(plain(p.name)));
    const parts = rule ? rule[1] : (pack.gelato ? { helado: 0.55, azucar: 0.03, empaque: 1 } : { varios: 0.2 });
    for (const k of Object.keys(parts)) neededSup.add(INGREDIENTS[k][5]);
  }
  const suppliers = seedSuppliers(ctx, neededSup);
  const ingredients = seedRecipes(ctx, suppliers);
  seedCustomers(ctx);
  const staff = seedEmployees(ctx, days[0]);
  const costs = new Map(ctx.products.map(p => [p.id, p.cost]));
  ctx = loadCtx(db, pack, rng);
  for (const p of ctx.products) p.cost = costs.get(p.id) || p.cost;

  // Una caja por día; la de hoy queda abierta
  const insShift = db.prepare("INSERT INTO cash_shifts (user_id, cashier_name, opened_at, initial_cash, status, notes, branch_id) VALUES (?, ?, ?, 200000, 'open', '', 1)");
  const shifts = [];
  const shiftByDate = new Map();
  days.forEach((date, i) => {
    const c = ctx.cashiers.length ? ctx.cashiers[Math.floor(i / 7) % ctx.cashiers.length] : { name: 'Caja', userId: null };
    const row = { id: Number(insShift.run(c.userId || null, c.name, `${date} 07:${pad(rng.int(30, 55))}:00`).lastInsertRowid), cashier_name: c.name, date };
    shifts.push(row); shiftByDate.set(date, row);
  });

  // Ventas, en orden de tiempo; lo que consumen las recetas se aplica después junto con las compras
  const moves = [];
  ctx.onConsume = (date, order, ing, qty) => moves.push({ date, order, ing, qty });
  days.forEach((date, i) => {
    const trend = 0.9 + 0.2 * (i / days.length);
    const times = Array.from({ length: dayOrders(ctx, date, trend) }, () => { const [h, m] = pickHourMinute(ctx); return `${date} ${pad(h)}:${pad(m)}:${pad(rng.int(0, 59))}`; }).sort();
    for (const at of times) if (at <= now) insertSale(ctx, at, shiftByDate.get(date));
  });
  ctx.onConsume = null;

  const writer = makeExpenseWriter(ctx, today, shiftByDate);
  const openingValue = seedPurchasesAndStock(ctx, ingredients, suppliers, moves, days, today, writer);
  seedOtherExpenses(ctx, suppliers, days, today, writer);
  seedReceivables(ctx, today);
  seedStaffActivity(ctx, staff, days, today, shiftByDate, writer);
  closeShifts(ctx, shifts, today);
  seedLiveOrders(ctx, shiftByDate.get(today), now);
  return { ctx, days, today, openingValue };
}

/* ======================= ventas durante el día ======================= */
/** Agrega las ventas que ya debieron ocurrir hoy y mantiene recientes las cuentas en curso. Solo con DEMO_MODE=1. */
function topUpToday(db, pack, nowOverride = null) {
  const now = nowOverride || nowLocal(db);
  const date = now.slice(0, 10);
  const hour = Number(now.slice(11, 13)), minute = Number(now.slice(14, 16));
  const ctx = loadCtx(db, pack, makeRng((Date.now() ^ seedOf(now)) >>> 0));
  // Cuentas en curso: si llevan mucho abiertas, se ven como recién tomadas
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'demoLiveOrders'").get();
    const ids = row && row.value ? JSON.parse(row.value) : [];
    for (const id of ids) {
      const o = db.prepare('SELECT id, status, created_at AS at FROM orders WHERE id = ?').get(id);
      if (!o || ['delivered', 'cancelled'].includes(o.status)) continue;
      const mins = db.prepare('SELECT (julianday(?) - julianday(?)) * 1440 AS m').get(now, o.at).m;
      if (mins > 120 || mins < 0) {
        const at = shiftTime(now, -ctx.rng.int(5, 40));
        db.prepare('UPDATE orders SET created_at = ?, shipped_at = CASE WHEN shipped_at IS NULL THEN NULL ELSE ? END WHERE id = ?').run(at, shiftTime(at, 15), id);
        db.prepare('UPDATE order_items SET sent_at = ? WHERE order_id = ?').run(at, id);
      }
    }
  } catch { /* sin cuentas en curso */ }
  const expected = Math.round(dayOrders(ctx, date) * dayFraction(ctx, hour, minute));
  const done = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE date(created_at) = ? AND status IN ('delivered', 'cancelled')").get(date).c;
  const missing = Math.min(expected - done, 15);
  if (missing <= 0) return 0;
  const last = db.prepare("SELECT MAX(created_at) AS m FROM orders WHERE date(created_at) = ? AND status IN ('delivered', 'cancelled')").get(date).m || `${date} ${pad(FIRST_HOUR)}:00:00`;
  const span = Math.max(1, Math.floor(db.prepare('SELECT (julianday(?) - julianday(?)) * 1440 AS m').get(now, last).m));
  const shift = require('./cashHelpers').getOpenShift(db, 1);
  const times = Array.from({ length: missing }, () => shiftTime(last, ctx.rng.int(0, span))).sort();
  db.transaction(() => {
    ctx.onConsume = (d, order, ing, qty) => INV.move(db, ing, -qty, 'venta', { orderId: order, date: d });
    for (const at of times) insertSale(ctx, at, shift || null);
  })();
  L.syncLedger(db);
  return missing;
}

module.exports = { wipeOperation, seedBusiness, postManualAccounting, topUpToday };
