/**
 * Ingredientes, recetas e inventario de insumos (al estilo de Fudo).
 *
 *  - Ingrediente: nombre, categoría, unidad (unid, kg, g, l, ml, lb), costo por unidad, merma % y stock.
 *  - Receta: cada producto puede llevar ingredientes con su cantidad (en la unidad del ingrediente).
 *    Costo del producto = Σ cantidad × costo × (1 + merma). Ese costo se guarda en products.cost, que ya usan
 *    la contabilidad (costo de ventas con inventario permanente) y los informes.
 *  - Al vender (cuando el producto sale a cocina o se cobra en el POS) se descuentan los ingredientes del stock;
 *    al anular la venta se devuelven. Compras, mermas, ajustes y conteos quedan en ingredient_movements.
 */
const UNITS = ['unid', 'kg', 'g', 'l', 'ml', 'lb', 'oz'];
const KINDS = { compra: 'Compra', venta: 'Venta', devolucion: 'Devolución por anulación', ajuste: 'Ajuste', merma: 'Merma / pérdida', conteo: 'Conteo de inventario', inicial: 'Stock inicial' };

function initInventory(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Varios',
      unit TEXT NOT NULL DEFAULT 'unid',
      cost REAL NOT NULL DEFAULT 0,
      waste_pct REAL NOT NULL DEFAULT 0,
      stock REAL NOT NULL DEFAULT 0,
      min_stock REAL NOT NULL DEFAULT 0,
      track_stock INTEGER NOT NULL DEFAULT 1,
      supplier_id INTEGER,
      notes TEXT DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-5 hours'))
    );
    CREATE TABLE IF NOT EXISTS recipe_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
      quantity REAL NOT NULL,
      UNIQUE(product_id, ingredient_id)
    );
    CREATE TABLE IF NOT EXISTS ingredient_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
      date TEXT NOT NULL,
      kind TEXT NOT NULL,
      quantity REAL NOT NULL,
      stock_after REAL,
      unit_cost REAL,
      total_cost REAL,
      order_id INTEGER,
      supplier_id INTEGER,
      notes TEXT DEFAULT '',
      user_name TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-5 hours'))
    );
    CREATE INDEX IF NOT EXISTS idx_recipe_product ON recipe_items(product_id);
    CREATE INDEX IF NOT EXISTS idx_ingmov_ing ON ingredient_movements(ingredient_id, date);
    CREATE INDEX IF NOT EXISTS idx_ingmov_order ON ingredient_movements(order_id);
  `);
  // Costo unitario del producto al momento de la venta (para que la ganancia histórica no cambie con los precios nuevos)
  if (!db.prepare('PRAGMA table_info(order_items)').all().some(c => c.name === 'unit_cost')) db.exec('ALTER TABLE order_items ADD COLUMN unit_cost REAL');
}

const round2 = n => Math.round(n * 1000) / 1000;
const today = db => db.prepare("SELECT date('now', '-5 hours') AS d").get().d;

const ING_SELECT = `SELECT i.id, i.name, i.category, i.unit, i.cost, i.waste_pct AS wastePct, i.stock, i.min_stock AS minStock, i.track_stock AS trackStock,
  i.supplier_id AS supplierId, s.name AS supplierName, i.notes, i.active, i.created_at AS createdAt,
  (SELECT COUNT(*) FROM recipe_items r WHERE r.ingredient_id = i.id) AS usedIn
  FROM ingredients i LEFT JOIN suppliers s ON s.id = i.supplier_id`;
const mapIng = r => r && ({ ...r, trackStock: Boolean(r.trackStock), active: Boolean(r.active), low: Boolean(r.trackStock) && r.stock <= (r.minStock || 0) });

/** Costo efectivo por unidad del ingrediente incluyendo la merma. */
const effCost = i => (i.cost || 0) * (1 + (i.waste_pct ?? i.wastePct ?? 0) / 100);

function recipeOf(db, productId) {
  return db.prepare(`SELECT r.id, r.ingredient_id AS ingredientId, r.quantity, i.name, i.unit, i.cost, i.waste_pct AS wastePct, i.stock, i.track_stock AS trackStock
    FROM recipe_items r JOIN ingredients i ON i.id = r.ingredient_id WHERE r.product_id = ? ORDER BY i.name`).all(productId)
    .map(r => ({ ...r, trackStock: Boolean(r.trackStock), lineCost: Math.round(r.quantity * effCost(r)) }));
}
const recipeCost = (db, productId) => recipeOf(db, productId).reduce((a, r) => a + r.quantity * effCost(r), 0);

/** Guarda en products.cost el costo de la receta (si el producto tiene receta). */
function syncProductCost(db, productId) {
  const has = db.prepare('SELECT COUNT(*) AS c FROM recipe_items WHERE product_id = ?').get(productId).c;
  if (has) db.prepare('UPDATE products SET cost = ? WHERE id = ?').run(Math.round(recipeCost(db, productId)), productId);
}
function syncCostsForIngredient(db, ingredientId) {
  for (const r of db.prepare('SELECT DISTINCT product_id AS id FROM recipe_items WHERE ingredient_id = ?').all(ingredientId)) syncProductCost(db, r.id);
}

/** Movimiento de inventario: cambia el stock (si se controla) y deja el registro. */
function move(db, ingredientId, quantity, kind, { orderId = null, unitCost = null, totalCost = null, supplierId = null, notes = '', user = '', date = null } = {}) {
  const ing = db.prepare('SELECT id, stock, track_stock FROM ingredients WHERE id = ?').get(ingredientId);
  if (!ing) return null;
  const after = ing.track_stock ? round2(ing.stock + quantity) : ing.stock;
  if (ing.track_stock) db.prepare('UPDATE ingredients SET stock = ? WHERE id = ?').run(after, ingredientId);
  db.prepare(`INSERT INTO ingredient_movements (ingredient_id, date, kind, quantity, stock_after, unit_cost, total_cost, order_id, supplier_id, notes, user_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(ingredientId, date || today(db), kind, round2(quantity), after, unitCost, totalCost, orderId, supplierId, notes || '', user || '');
  return after;
}

/** Venta: descuenta los ingredientes de la receta de cada producto vendido. items = [{ productId, quantity }]. */
function consumeForSale(db, orderId, items, user) {
  db.prepare('UPDATE order_items SET unit_cost = (SELECT COALESCE(p.cost, 0) FROM products p WHERE p.id = order_items.product_id) WHERE order_id = ? AND unit_cost IS NULL').run(orderId);
  for (const it of items || []) {
    const pid = Number(it.productId); if (!pid) continue;
    const qty = Math.max(0, Number(it.quantity) || 0); if (!qty) continue;
    for (const r of db.prepare('SELECT r.ingredient_id AS id, r.quantity, i.waste_pct AS w FROM recipe_items r JOIN ingredients i ON i.id = r.ingredient_id WHERE r.product_id = ?').all(pid)) {
      move(db, r.id, -(r.quantity * qty * (1 + (r.w || 0) / 100)), 'venta', { orderId, user });
    }
  }
}
/** Anulación: devuelve lo descontado por esa venta (una sola vez). */
function restoreForOrder(db, orderId, user) {
  if (db.prepare("SELECT COUNT(*) AS c FROM ingredient_movements WHERE order_id = ? AND kind = 'devolucion'").get(orderId).c) return;
  for (const r of db.prepare("SELECT ingredient_id AS id, SUM(quantity) AS q FROM ingredient_movements WHERE order_id = ? AND kind = 'venta' GROUP BY ingredient_id").all(orderId)) {
    if (r.q < 0) move(db, r.id, -r.q, 'devolucion', { orderId, user });
  }
}

/**
 * Rentabilidad por producto en un período: unidades, venta, costo (costo actual del producto) y ganancia.
 * La venta es el precio de cada línea (antes de descuentos de la cuenta); el total de descuentos se informa aparte.
 */
function profitability(db, { from, to, branchSql = '', branchParams = [] }) {
  const rows = db.prepare(`SELECT oi.product_id AS productId, MAX(oi.name) AS name, p.category_id AS categoryId, c.name AS category,
      SUM(oi.quantity) AS units, SUM(oi.quantity * oi.price) AS revenue, COALESCE(p.cost, 0) AS unitCost,
      SUM(oi.quantity * COALESCE(oi.unit_cost, p.cost, 0)) AS soldCost,
      (SELECT COUNT(*) FROM recipe_items r WHERE r.product_id = oi.product_id) AS recipeItems
    FROM order_items oi JOIN orders o ON o.id = oi.order_id LEFT JOIN products p ON p.id = oi.product_id LEFT JOIN categories c ON c.id = p.category_id
    WHERE o.status = 'delivered' AND date(o.created_at) BETWEEN ? AND ? ${branchSql}
    GROUP BY oi.product_id ORDER BY revenue DESC`).all(from, to, ...branchParams);
  const products = rows.map(r => {
    const cost = Math.round(r.soldCost || 0);
    const profit = r.revenue - cost;
    return { ...r, hasRecipe: r.recipeItems > 0, hasCost: r.unitCost > 0, cost, profit, margin: r.revenue ? Math.round((profit / r.revenue) * 1000) / 10 : 0, foodCost: r.revenue ? Math.round((cost / r.revenue) * 1000) / 10 : 0 };
  });
  const disc = db.prepare(`SELECT COALESCE(SUM(o.discount), 0) AS d FROM orders o WHERE o.status = 'delivered' AND date(o.created_at) BETWEEN ? AND ? ${branchSql}`).get(from, to, ...branchParams).d;
  const revenue = products.reduce((a, p) => a + p.revenue, 0);
  const cost = products.reduce((a, p) => a + p.cost, 0);
  const withoutCost = products.filter(p => !p.hasCost);
  const byCategory = {};
  for (const p of products) {
    const k = p.category || 'Sin categoría';
    byCategory[k] = byCategory[k] || { category: k, units: 0, revenue: 0, cost: 0, profit: 0 };
    byCategory[k].units += p.units; byCategory[k].revenue += p.revenue; byCategory[k].cost += p.cost; byCategory[k].profit += p.profit;
  }
  return {
    from, to, products,
    categories: Object.values(byCategory).map(c => ({ ...c, margin: c.revenue ? Math.round((c.profit / c.revenue) * 1000) / 10 : 0 })).sort((a, b) => b.profit - a.profit),
    totals: { revenue, cost, profit: revenue - cost, discounts: disc, profitAfterDiscounts: revenue - cost - disc, margin: revenue ? Math.round(((revenue - cost) / revenue) * 1000) / 10 : 0, foodCost: revenue ? Math.round((cost / revenue) * 1000) / 10 : 0 },
    withoutCost: { count: withoutCost.length, revenue: withoutCost.reduce((a, p) => a + p.revenue, 0) },
  };
}

module.exports = { UNITS, KINDS, initInventory, ING_SELECT, mapIng, effCost, recipeOf, recipeCost, syncProductCost, syncCostsForIngredient, move, consumeForSale, restoreForOrder, profitability };
