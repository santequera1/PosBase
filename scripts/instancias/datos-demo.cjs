/**
 * Llena una instalación con datos de demostración (para mostrar el sistema a prospectos).
 * Requiere que la instalación ya tenga hecha la configuración inicial (tipo Restaurante con menú de ejemplo).
 *
 * Uso (en el servidor, desde la carpeta server de la instalación):
 *   node ../scripts/instancias/datos-demo.cjs http://127.0.0.1:<puerto> <usuario-admin> <clave-admin>
 *
 * Crea: usuarios de prueba por rol (clave Demo2026*), colaboradores, domiciliarios, una semana de ventas
 * (mesas, para llevar y domicilios con distintos medios de pago y propinas), un gasto y una novedad de nómina.
 */
const path = require('path');
const BASE = (process.argv[2] || 'http://127.0.0.1:3100').replace(/\/$/, '') + '/api';
const ADMIN_USER = process.argv[3] || 'admin';
const ADMIN_PASS = process.argv[4];
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data.db');
if (!ADMIN_PASS) { console.log('Uso: node datos-demo.cjs <url> <usuario-admin> <clave-admin>'); process.exit(1); }

async function call(method, url, token, body) {
  const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${url}: ${j.error || r.status}`);
  return j;
}
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

(async () => {
  const admin = (await call('POST', '/auth/login', null, { username: ADMIN_USER, password: ADMIN_PASS })).token;
  const PASS = 'Demo2026*';
  // Usuarios por rol (para que el prospecto vea cada pantalla)
  const people = [
    ['caja', 'Laura Caja', 'cashier', 'Cajera'],
    ['mesero1', 'Andrés Mesero', 'waiter', 'Mesero'],
    ['mesero2', 'Camila Mesera', 'waiter', 'Mesera'],
    ['cocina', 'Pedro Cocina', 'kitchen', 'Cocinero'],
    ['domi1', 'Jhon Domiciliario', 'courier', 'Domiciliario'],
    ['domi2', 'Sergio Domiciliario', 'courier', 'Domiciliario'],
  ];
  const existing = await call('GET', '/users', admin);
  for (const [username, name, profile] of people) {
    if (!existing.some(u => u.username === username)) await call('POST', '/users', admin, { username, name, password: PASS, profile });
  }
  const users = await call('GET', '/users', admin);
  const emps = await call('GET', '/staff/employees', admin);
  for (const [username, name, , position] of people) {
    const u = users.find(x => x.username === username);
    if (u && !emps.some(e => e.userId === u.id)) await call('POST', '/staff/employees', admin, { name, position, payMode: 'per_shift', baseAmount: position === 'Domiciliario' ? 40000 : 55000, userId: u.id, document: String(rnd(1000000000, 1099999999)) });
  }
  console.log('✓ usuarios y colaboradores');

  // Caja abierta
  try { await call('POST', '/shifts/open', admin, { initialCash: 200000, cashierName: 'Laura Caja' }); } catch { /* ya abierta */ }
  const cfg = await call('GET', '/restaurant/config', admin);
  const waiters = cfg.staff.waiters || [];
  const couriers = cfg.staff.couriers || [];
  const products = (await call('GET', '/products', admin)).filter(p => p.available && !(p.sizes && p.sizes.length));
  const tables = (await call('GET', '/restaurant/tables/state', admin)).flatMap(r => r.tables);
  const names = ['María Gómez', 'Carlos Pérez', 'Ana Torres', 'Luis Ramírez', 'Sofía Herrera', 'Jorge Díaz', 'Valentina Ruiz', 'Andrés Castro'];
  const methods = ['cash', 'cash', 'card', 'transfer', 'transfer', 'mixed'];
  const created = [];

  const items = () => Array.from({ length: rnd(1, 4) }, () => { const p = pick(products); return { productId: p.id, name: p.name, quantity: rnd(1, 2), price: p.price }; });
  const closeBody = (due, tip) => {
    const m = pick(methods);
    if (m === 'mixed') { const cash = Math.round(due / 2 / 1000) * 1000; return { paymentMethod: 'mixed', paymentSplit: { parts: [{ method: 'cash', amount: cash }, { method: 'transfer', amount: due + tip - cash }] }, tip }; }
    return { paymentMethod: m, tip, cashReceived: m === 'cash' ? Math.ceil((due + tip) / 10000) * 10000 : undefined };
  };

  for (let i = 0; i < 70; i++) {
    const kind = pick(['dine-in', 'dine-in', 'pickup', 'delivery']);
    let o;
    if (kind === 'dine-in') {
      const free = (await call('GET', '/restaurant/tables/state', admin)).flatMap(r => r.tables).filter(t => !t.order);
      if (!free.length) continue;
      o = await call('POST', '/restaurant/orders', admin, { type: 'dine-in', tableId: pick(free).id, people: rnd(1, 5), waiterId: waiters.length ? pick(waiters).id : undefined });
    } else if (kind === 'pickup') {
      o = await call('POST', '/restaurant/orders', admin, { type: 'pickup', label: pick(names).split(' ')[0], customer: { name: pick(names) } });
    } else {
      const n = pick(names);
      o = await call('POST', '/restaurant/orders', admin, { type: 'delivery', customer: { name: n, phone: '300' + rnd(1000000, 9999999), address: `Calle ${rnd(1, 80)} # ${rnd(1, 50)}-${rnd(1, 99)}`, neighborhood: pick(['Centro', 'Manga', 'Bocagrande', 'El Prado']), saveCustomer: true }, deliveryFee: pick([4000, 5000, 6000]), driverId: couriers.length ? pick(couriers).id : undefined, paymentMethod: 'cash' });
    }
    const full = await call('PUT', `/restaurant/orders/${o.id}/items`, admin, { items: items() });
    await call('POST', `/restaurant/orders/${o.id}/send`, admin);
    const total = (full.total ?? full.subtotal ?? 0) || (await call('GET', `/orders/${o.id}`, admin)).total;
    const tip = kind === 'dine-in' && Math.random() < 0.6 ? Math.round(total * 0.1) : 0;
    await call('POST', `/restaurant/orders/${o.id}/close`, admin, { ...closeBody(total, tip), markDelivered: true });
    created.push(o.id);
  }
  console.log(`✓ ${created.length} ventas`);

  // Algunas cuentas abiertas para mostrar el plano de mesas en uso
  const free = (await call('GET', '/restaurant/tables/state', admin)).flatMap(r => r.tables).filter(t => !t.order).slice(0, 3);
  for (const t of free) {
    const o = await call('POST', '/restaurant/orders', admin, { type: 'dine-in', tableId: t.id, people: rnd(2, 4), waiterId: waiters.length ? pick(waiters).id : undefined });
    await call('PUT', `/restaurant/orders/${o.id}/items`, admin, { items: items() });
    await call('POST', `/restaurant/orders/${o.id}/send`, admin);
  }
  console.log('✓ mesas abiertas');

  // Gasto y novedad de nómina de ejemplo
  try {
    const cats = await call('GET', '/finance/categories', admin);
    const today = (await call('GET', '/finance/summary?period=today', admin)).period.from;
    await call('POST', '/finance/expenses', admin, { date: today, categoryId: cats[0].id, description: 'Compra de carne y pan (ejemplo)', amount: 380000, paymentMethod: 'transfer' });
    const e = (await call('GET', '/staff/employees', admin)).find(x => /Domiciliario/.test(x.position || ''));
    if (e) await call('POST', '/staff/novelties', admin, { employeeId: e.id, type: 'operational', amount: 5000, date: today, notes: 'domicilio repetido: pedido incompleto (ejemplo)' });
  } catch (err) { console.log('  (gasto/novedad):', err.message); }

  // Repartir las ventas en los últimos 7 días (para que reportes y gráficas tengan historia)
  try {
    const Database = require(path.join(process.cwd(), 'node_modules', 'better-sqlite3'));
    const db = new Database(DB_PATH);
    const upd = db.prepare("UPDATE orders SET created_at = datetime(created_at, ?), closed_at = datetime(COALESCE(closed_at, created_at), ?), delivered_at = CASE WHEN delivered_at IS NULL THEN NULL ELSE datetime(delivered_at, ?) END WHERE id = ?");
    const updTip = db.prepare("UPDATE tips SET date = date(date, ?) WHERE notes = ?");
    created.forEach((id, k) => { const days = -(k % 7); const mod = `${days} days`; upd.run(mod, mod, mod, id); updTip.run(mod, `Propina pedido #${id}`); });
    db.close();
    console.log('✓ ventas repartidas en 7 días');
  } catch (err) { console.log('  (no se repartieron fechas):', err.message); }

  console.log(`\nUsuarios de prueba (clave ${PASS}): ${people.map(p => p[0]).join(', ')}`);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
