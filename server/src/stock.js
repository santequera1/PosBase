/**
 * Inventario de productos.
 * - track_stock = 0 → "siempre disponible": no se controlan cantidades.
 * - track_stock = 1 → cada venta descuenta unidades; en 0 el producto pasa a
 *   no disponible y vuelve a estar disponible al reponer. Todo movimiento queda
 *   en stock_movements (venta, devolucion, ajuste, compra, merma, inventario).
 */
const PRODUCT_SELECT = `SELECT id, name, category_id AS categoryId, price, available, image, description, sizes, color_bg, color_accent, featured,
  COALESCE(track_stock, 0) AS trackStock, COALESCE(stock, 0) AS stock, COALESCE(min_stock, 0) AS minStock, COALESCE(station, 'cocina') AS station FROM products`;

function mapProduct(r) {
  if (!r) return null;
  return { ...r, available: !!r.available, trackStock: !!r.trackStock, featured: !!r.featured, sizes: r.sizes ? JSON.parse(r.sizes) : null };
}

function getProduct(db, id) {
  return mapProduct(db.prepare(`${PRODUCT_SELECT} WHERE id = ?`).get(id));
}

function emitProduct(io, product) {
  if (io && product) io.emit('product:updated', product);
}

function recordMovement(db, productId, delta, stockAfter, reason, orderId, userName) {
  db.prepare('INSERT INTO stock_movements (product_id, delta, stock_after, reason, order_id, user_name) VALUES (?, ?, ?, ?, ?, ?)')
    .run(productId, delta, stockAfter, reason || 'ajuste', orderId || null, userName || '');
}

/** Con control de stock: 0 unidades → no disponible; al volver a tener unidades → disponible. */
function syncAvailability(db, productId, prevStock, newStock) {
  const p = db.prepare('SELECT track_stock AS ts FROM products WHERE id = ?').get(productId);
  if (!p || !p.ts) return;
  if (newStock <= 0) db.prepare('UPDATE products SET available = 0 WHERE id = ?').run(productId);
  else if (prevStock <= 0) db.prepare('UPDATE products SET available = 1 WHERE id = ?').run(productId);
}

/** Ajuste manual: { delta } suma/resta, o { set } fija la cantidad exacta. Activa el control de stock. */
function adjustStock(db, io, productId, { delta, set }, reason, userName) {
  const cur = db.prepare('SELECT id, COALESCE(track_stock, 0) AS ts, COALESCE(stock, 0) AS stock FROM products WHERE id = ?').get(productId);
  if (!cur) return { error: 'Producto no encontrado', status: 404 };
  let newStock;
  if (set !== undefined && set !== null && set !== '') newStock = Math.max(0, Math.round(Number(set) || 0));
  else if (delta !== undefined && delta !== null && delta !== '') newStock = Math.max(0, cur.stock + Math.round(Number(delta) || 0));
  else return { error: 'Indica las unidades a sumar o restar, o el stock exacto', status: 400 };
  const change = newStock - cur.stock;
  db.prepare('UPDATE products SET stock = ?, track_stock = 1 WHERE id = ?').run(newStock, productId);
  syncAvailability(db, productId, cur.ts ? cur.stock : 0, newStock);
  recordMovement(db, productId, change, newStock, reason, null, userName);
  const product = getProduct(db, productId);
  emitProduct(io, product);
  return { product, change };
}

/** Venta: descuenta las unidades de los ítems cuyo producto controla stock. */
function applySaleStock(db, io, orderId, items, userName) {
  const touched = new Set();
  for (const item of items || []) {
    const pid = Number(item.productId);
    if (!pid) continue;
    const cur = db.prepare('SELECT COALESCE(track_stock, 0) AS ts, COALESCE(stock, 0) AS stock FROM products WHERE id = ?').get(pid);
    if (!cur || !cur.ts) continue;
    const qty = Math.max(1, Math.round(Number(item.quantity) || 1));
    const newStock = Math.max(0, cur.stock - qty);
    db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(newStock, pid);
    syncAvailability(db, pid, cur.stock, newStock);
    recordMovement(db, pid, -qty, newStock, 'venta', orderId, userName);
    touched.add(pid);
  }
  for (const pid of touched) emitProduct(io, getProduct(db, pid));
}

/** Anulación o eliminación de un pedido: devuelve al stock lo descontado (una sola vez por pedido). */
function restoreOrderStock(db, io, orderId, userName) {
  const already = db.prepare("SELECT COUNT(*) AS c FROM stock_movements WHERE order_id = ? AND reason = 'devolucion'").get(orderId).c;
  if (already) return;
  const rows = db.prepare("SELECT product_id AS pid, SUM(delta) AS delta FROM stock_movements WHERE order_id = ? AND reason = 'venta' GROUP BY product_id").all(orderId);
  for (const r of rows) {
    const qty = -r.delta;
    if (qty <= 0) continue;
    const cur = db.prepare('SELECT COALESCE(stock, 0) AS stock FROM products WHERE id = ?').get(r.pid);
    if (!cur) continue;
    const newStock = cur.stock + qty;
    db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(newStock, r.pid);
    syncAvailability(db, r.pid, cur.stock, newStock);
    recordMovement(db, r.pid, qty, newStock, 'devolucion', orderId, userName);
    emitProduct(io, getProduct(db, r.pid));
  }
}

module.exports = { PRODUCT_SELECT, mapProduct, getProduct, emitProduct, adjustStock, applySaleStock, restoreOrderStock, recordMovement, syncAvailability };
