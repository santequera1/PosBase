/** /api/inventory — ingredientes, recetas, compras, ajustes, conteos y rentabilidad por producto. */
const { Router } = require('express');
const { getDb } = require('../db');
const { requirePerm } = require('../auth');
const { branchWhere } = require('../branches');
const INV = require('../inventory');

const router = Router();
const READ = requirePerm('menu');
const EDIT = requirePerm('edit_menu');
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const num = (v, d = 0) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : d; };
const today = db => db.prepare("SELECT date('now', '-5 hours') AS d").get().d;

function ingredientPayload(b, cur = {}) {
  const pick = (k, d) => (b[k] !== undefined ? b[k] : (cur[k] !== undefined ? cur[k] : d));
  const unit = String(pick('unit', 'unid')).toLowerCase().replace('.', '').replace('unidad', 'unid').replace('und', 'unid');
  return {
    name: String(pick('name', '')).trim().slice(0, 80),
    category: String(pick('category', 'Varios')).trim().slice(0, 50) || 'Varios',
    unit: INV.UNITS.includes(unit) ? unit : 'unid',
    cost: Math.max(0, num(pick('cost', 0))),
    wastePct: Math.min(90, Math.max(0, num(pick('wastePct', 0)))),
    minStock: Math.max(0, num(pick('minStock', 0))),
    trackStock: (v => (typeof v === 'string' ? !/^(no|n|false|0)$/i.test(v.trim()) : Boolean(v)))(pick('trackStock', true)),
    supplierId: Number(pick('supplierId', 0)) || null,
    notes: String(pick('notes', '')).slice(0, 200),
    active: pick('active', true) !== false,
  };
}

/* ---------------- Ingredientes ---------------- */
router.get('/ingredients', READ, (req, res) => {
  const db = getDb();
  const all = req.query.all === '1';
  res.json(db.prepare(`${INV.ING_SELECT} ${all ? '' : 'WHERE i.active = 1'} ORDER BY i.category, i.name`).all().map(INV.mapIng));
});

router.get('/ingredients/:id', READ, (req, res) => {
  const db = getDb();
  const ing = INV.mapIng(db.prepare(`${INV.ING_SELECT} WHERE i.id = ?`).get(Number(req.params.id)));
  if (!ing) return res.status(404).json({ error: 'Ingrediente no encontrado' });
  const products = db.prepare(`SELECT p.id, p.name, p.price, COALESCE(p.cost, 0) AS cost, r.quantity FROM recipe_items r JOIN products p ON p.id = r.product_id WHERE r.ingredient_id = ? ORDER BY p.name`).all(ing.id);
  const movements = db.prepare(`SELECT m.id, m.date, m.kind, m.quantity, m.stock_after AS stockAfter, m.unit_cost AS unitCost, m.total_cost AS totalCost, m.order_id AS orderId, m.notes, m.user_name AS userName, s.name AS supplierName
    FROM ingredient_movements m LEFT JOIN suppliers s ON s.id = m.supplier_id WHERE m.ingredient_id = ? ORDER BY m.id DESC LIMIT 60`).all(ing.id);
  const usedInIngredients = db.prepare('SELECT i.id, i.name, c.quantity FROM ingredient_components c JOIN ingredients i ON i.id = c.ingredient_id WHERE c.component_id = ? ORDER BY i.name').all(ing.id);
  res.json({ ingredient: ing, products, movements, components: INV.componentsOf(db, ing.id), usedInIngredients });
});

router.post('/ingredients', EDIT, (req, res) => {
  const db = getDb();
  const p = ingredientPayload(req.body || {});
  if (p.name.length < 2) return res.status(400).json({ error: 'Ponle un nombre al ingrediente' });
  if (db.prepare('SELECT id FROM ingredients WHERE LOWER(name) = LOWER(?) AND active = 1').get(p.name)) return res.status(409).json({ error: 'Ya existe un ingrediente con ese nombre' });
  const info = db.prepare('INSERT INTO ingredients (name, category, unit, cost, waste_pct, min_stock, track_stock, supplier_id, notes, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)')
    .run(p.name, p.category, p.unit, p.cost, p.wastePct, p.minStock, p.trackStock ? 1 : 0, p.supplierId, p.notes);
  const id = Number(info.lastInsertRowid);
  const initial = num(req.body.stock, 0);
  if (initial > 0) INV.move(db, id, initial, 'inicial', { unitCost: p.cost, totalCost: Math.round(initial * p.cost), user: req.user?.name });
  res.status(201).json(INV.mapIng(db.prepare(`${INV.ING_SELECT} WHERE i.id = ?`).get(id)));
});

router.put('/ingredients/:id', EDIT, (req, res) => {
  const db = getDb();
  const cur = db.prepare(`${INV.ING_SELECT} WHERE i.id = ?`).get(Number(req.params.id));
  if (!cur) return res.status(404).json({ error: 'Ingrediente no encontrado' });
  const p = ingredientPayload(req.body || {}, INV.mapIng(cur));
  if (p.name.length < 2) return res.status(400).json({ error: 'Ponle un nombre al ingrediente' });
  db.prepare('UPDATE ingredients SET name = ?, category = ?, unit = ?, cost = ?, waste_pct = ?, min_stock = ?, track_stock = ?, supplier_id = ?, notes = ?, active = ? WHERE id = ?')
    .run(p.name, p.category, p.unit, p.cost, p.wastePct, p.minStock, p.trackStock ? 1 : 0, p.supplierId, p.notes, p.active ? 1 : 0, cur.id);
  // El costo o la merma cambian el costo de todos los productos que lo usan
  INV.syncCostsForIngredient(db, cur.id);
  res.json(INV.mapIng(db.prepare(`${INV.ING_SELECT} WHERE i.id = ?`).get(cur.id)));
});

router.delete('/ingredients/:id', EDIT, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const used = db.prepare('SELECT COUNT(*) AS c FROM recipe_items WHERE ingredient_id = ?').get(id).c;
  if (used) return res.status(400).json({ error: `Lo usan ${used} producto(s): quítalo de sus recetas antes de eliminarlo` });
  const moves = db.prepare('SELECT COUNT(*) AS c FROM ingredient_movements WHERE ingredient_id = ?').get(id).c;
  if (moves) db.prepare('UPDATE ingredients SET active = 0 WHERE id = ?').run(id); // conserva el historial
  else db.prepare('DELETE FROM ingredients WHERE id = ?').run(id);
  res.json({ success: true });
});

// Importar desde Excel (por ejemplo, la exportación de ingredientes de Fudo). rows = [{ name, category, unit, cost, wastePct, stock }]
router.post('/ingredients/import', EDIT, (req, res) => {
  const db = getDb();
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  const dry = Boolean(req.body.dryRun);
  const components = Array.isArray(req.body.components) ? req.body.components : [];
  const result = { created: 0, updated: 0, skipped: [], preview: [], ignoredStock: [], components: 0, componentErrors: [] };
  const tx = db.transaction(() => {
    rows.forEach((r, i) => {
      const p = ingredientPayload(r || {});
      if (p.name.length < 2) { result.skipped.push({ row: i + 2, reason: 'sin nombre' }); return; }
      const cur = db.prepare('SELECT id FROM ingredients WHERE LOWER(name) = LOWER(?)').get(p.name);
      // El stock que viene de otro sistema se toma solo si es razonable (positivo y menor a 10.000); si no, queda en 0 para hacer conteo
      const rawStock = num(r.stock, 0);
      const stock = p.trackStock && rawStock > 0 && rawStock < 10000 ? rawStock : 0;
      if (rawStock && !stock) result.ignoredStock.push({ name: p.name, stock: rawStock });
      result.preview.push({ ...p, action: cur ? 'actualizar' : 'crear', stock });
      if (dry) return;
      if (cur) {
        db.prepare('UPDATE ingredients SET category = ?, unit = ?, cost = ?, waste_pct = ?, track_stock = ?, active = 1 WHERE id = ?').run(p.category, p.unit, p.cost, p.wastePct, p.trackStock ? 1 : 0, cur.id);
        INV.syncCostsForIngredient(db, cur.id); result.updated++;
      } else {
        const id = Number(db.prepare('INSERT INTO ingredients (name, category, unit, cost, waste_pct, min_stock, track_stock) VALUES (?, ?, ?, ?, ?, ?, ?)').run(p.name, p.category, p.unit, p.cost, p.wastePct, p.minStock, p.trackStock ? 1 : 0).lastInsertRowid);
        if (stock > 0) INV.move(db, id, stock, 'inicial', { unitCost: p.cost, notes: 'Importado', user: req.user?.name });
        result.created++;
      }
    });
    // Sub-recetas: [{ ingredient, component, quantity }] por nombre
    const byName = n => db.prepare('SELECT id FROM ingredients WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))').get(String(n || ''));
    for (const c of components) {
      // En la vista previa los ingredientes nuevos aún no existen: cuentan si vienen en el mismo archivo
      const inFile = n => (dry && rows.some(r => String(r && r.name || '').trim().toLowerCase() === String(n || '').trim().toLowerCase()) ? { id: -1 } : null);
      const a = byName(c.ingredient) || inFile(c.ingredient), b = byName(c.component) || inFile(c.component), q = num(c.quantity);
      if (!a || !b || !(q > 0)) { result.componentErrors.push(`${c.ingredient} → ${c.component}`); continue; }
      result.components++;
      if (!dry) db.prepare('INSERT INTO ingredient_components (ingredient_id, component_id, quantity) VALUES (?, ?, ?) ON CONFLICT(ingredient_id, component_id) DO UPDATE SET quantity = excluded.quantity').run(a.id, b.id, q);
    }
  });
  tx();
  res.json(result);
});

/* ---------------- Recetas ---------------- */
router.get('/recipes', READ, (req, res) => {
  const db = getDb();
  const products = db.prepare(`SELECT p.id, p.name, p.price, COALESCE(p.cost, 0) AS cost, p.category_id AS categoryId, c.name AS category, p.available,
      (SELECT COUNT(*) FROM recipe_items r WHERE r.product_id = p.id) AS recipeItems
    FROM products p LEFT JOIN categories c ON c.id = p.category_id ORDER BY c.id, p.name`).all();
  res.json(products.map(p => ({ ...p, available: Boolean(p.available), hasRecipe: p.recipeItems > 0, profit: p.price - p.cost, margin: p.price ? Math.round(((p.price - p.cost) / p.price) * 1000) / 10 : 0 })));
});

router.get('/recipes/:productId', READ, (req, res) => {
  const db = getDb();
  const p = db.prepare('SELECT id, name, price, COALESCE(cost, 0) AS cost FROM products WHERE id = ?').get(Number(req.params.productId));
  if (!p) return res.status(404).json({ error: 'Producto no encontrado' });
  const items = INV.recipeOf(db, p.id);
  res.json({ product: p, items, recipeCost: Math.round(items.reduce((a, r) => a + r.quantity * INV.effCost(r), 0)) });
});

router.put('/recipes/:productId', EDIT, (req, res) => {
  const db = getDb();
  const p = db.prepare('SELECT id FROM products WHERE id = ?').get(Number(req.params.productId));
  if (!p) return res.status(404).json({ error: 'Producto no encontrado' });
  const items = (Array.isArray(req.body.items) ? req.body.items : []).map(i => ({ ingredientId: Number(i.ingredientId), quantity: num(i.quantity) })).filter(i => i.ingredientId && i.quantity > 0);
  for (const i of items) if (!db.prepare('SELECT id FROM ingredients WHERE id = ?').get(i.ingredientId)) return res.status(400).json({ error: 'Un ingrediente de la receta no existe' });
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM recipe_items WHERE product_id = ?').run(p.id);
    const ins = db.prepare('INSERT INTO recipe_items (product_id, ingredient_id, quantity) VALUES (?, ?, ?) ON CONFLICT(product_id, ingredient_id) DO UPDATE SET quantity = quantity + excluded.quantity');
    for (const i of items) ins.run(p.id, i.ingredientId, i.quantity);
    if (items.length) INV.syncProductCost(db, p.id);
  });
  tx();
  const out = INV.recipeOf(db, p.id);
  res.json({ product: db.prepare('SELECT id, name, price, COALESCE(cost, 0) AS cost FROM products WHERE id = ?').get(p.id), items: out, recipeCost: Math.round(out.reduce((a, r) => a + r.quantity * INV.effCost(r), 0)) });
});

/* ---------------- Movimientos: compras, mermas, ajustes y conteos ---------------- */
// Compra (entrada de mercancía): lines = [{ ingredientId, quantity, totalCost? | unitCost? }], updateCost: actualiza el costo con el de esta compra
router.post('/purchases', EDIT, (req, res) => {
  const db = getDb();
  const b = req.body || {};
  const lines = (Array.isArray(b.lines) ? b.lines : []).map(l => ({ ingredientId: Number(l.ingredientId), quantity: num(l.quantity), totalCost: l.totalCost !== undefined && l.totalCost !== '' ? num(l.totalCost) : null, unitCost: l.unitCost !== undefined && l.unitCost !== '' ? num(l.unitCost) : null })).filter(l => l.ingredientId && l.quantity > 0);
  if (!lines.length) return res.status(400).json({ error: 'Agrega al menos un ingrediente con su cantidad' });
  const date = isDate(b.date) ? b.date : today(db);
  const supplierId = Number(b.supplierId) || null;
  const updateCost = b.updateCost !== false;
  const out = [];
  const tx = db.transaction(() => {
    for (const l of lines) {
      const ing = db.prepare('SELECT id, name, cost FROM ingredients WHERE id = ?').get(l.ingredientId);
      if (!ing) continue;
      const unitCost = l.unitCost !== null ? l.unitCost : l.totalCost !== null ? l.totalCost / l.quantity : ing.cost;
      const total = l.totalCost !== null ? l.totalCost : Math.round(unitCost * l.quantity);
      const after = INV.move(db, ing.id, l.quantity, 'compra', { unitCost: Math.round(unitCost * 100) / 100, totalCost: Math.round(total), supplierId, notes: String(b.notes || '').slice(0, 160), user: req.user?.name, date });
      if (updateCost && unitCost > 0 && Math.abs(unitCost - ing.cost) > 0.001) { db.prepare('UPDATE ingredients SET cost = ? WHERE id = ?').run(Math.round(unitCost * 100) / 100, ing.id); INV.syncCostsForIngredient(db, ing.id); }
      out.push({ ingredientId: ing.id, name: ing.name, quantity: l.quantity, unitCost, total: Math.round(total), stock: after });
    }
  });
  tx();
  res.status(201).json({ lines: out, total: out.reduce((a, l) => a + l.total, 0) });
});

// Merma o ajuste: { ingredientId, kind: 'merma' | 'ajuste', quantity (negativo resta), notes }
router.post('/adjust', EDIT, (req, res) => {
  const db = getDb();
  const kind = ['merma', 'ajuste'].includes(req.body.kind) ? req.body.kind : 'ajuste';
  const ing = db.prepare('SELECT id, cost FROM ingredients WHERE id = ?').get(Number(req.body.ingredientId));
  if (!ing) return res.status(404).json({ error: 'Ingrediente no encontrado' });
  let q = num(req.body.quantity);
  if (!q) return res.status(400).json({ error: 'Indica la cantidad' });
  if (kind === 'merma') q = -Math.abs(q);
  const after = INV.move(db, ing.id, q, kind, { unitCost: ing.cost, totalCost: Math.round(Math.abs(q) * ing.cost), notes: String(req.body.notes || '').slice(0, 160), user: req.user?.name });
  res.json({ stock: after });
});

// Conteo de inventario: counts = [{ ingredientId, counted }] → ajusta cada uno a lo contado
router.post('/count', EDIT, (req, res) => {
  const db = getDb();
  const counts = (Array.isArray(req.body.counts) ? req.body.counts : []).filter(c => c && c.counted !== '' && c.counted !== null && c.counted !== undefined);
  if (!counts.length) return res.status(400).json({ error: 'Escribe lo contado en al menos un ingrediente' });
  const out = [];
  const tx = db.transaction(() => {
    for (const c of counts) {
      const ing = db.prepare('SELECT id, name, stock, cost FROM ingredients WHERE id = ?').get(Number(c.ingredientId));
      if (!ing) continue;
      const counted = Math.max(0, num(c.counted));
      const diff = Math.round((counted - ing.stock) * 1000) / 1000;
      if (diff === 0) { out.push({ name: ing.name, diff: 0 }); continue; }
      INV.move(db, ing.id, diff, 'conteo', { unitCost: ing.cost, totalCost: Math.round(diff * ing.cost), notes: String(req.body.notes || 'Conteo de inventario').slice(0, 160), user: req.user?.name });
      out.push({ name: ing.name, diff, value: Math.round(diff * ing.cost) });
    }
  });
  tx();
  res.json({ adjusted: out.filter(o => o.diff !== 0).length, lines: out, value: out.reduce((a, o) => a + (o.value || 0), 0) });
});

router.get('/movements', READ, (req, res) => {
  const db = getDb();
  let sql = `SELECT m.id, m.date, m.kind, m.quantity, m.stock_after AS stockAfter, m.unit_cost AS unitCost, m.total_cost AS totalCost, m.order_id AS orderId, m.notes, m.user_name AS userName,
    i.id AS ingredientId, i.name AS ingredient, i.unit, s.name AS supplierName FROM ingredient_movements m JOIN ingredients i ON i.id = m.ingredient_id LEFT JOIN suppliers s ON s.id = m.supplier_id WHERE 1=1`;
  const params = [];
  if (req.query.ingredientId) { sql += ' AND m.ingredient_id = ?'; params.push(Number(req.query.ingredientId)); }
  if (req.query.kind && INV.KINDS[req.query.kind]) { sql += ' AND m.kind = ?'; params.push(req.query.kind); }
  if (isDate(req.query.from)) { sql += ' AND m.date >= ?'; params.push(req.query.from); }
  if (isDate(req.query.to)) { sql += ' AND m.date <= ?'; params.push(req.query.to); }
  sql += ' ORDER BY m.id DESC LIMIT 400';
  res.json({ movements: db.prepare(sql).all(...params), kinds: INV.KINDS });
});

/* ---------------- Rentabilidad ---------------- */
router.get('/profitability', READ, (req, res) => {
  const db = getDb();
  const to = isDate(req.query.to) ? req.query.to : today(db);
  const from = isDate(req.query.from) ? req.query.from : `${to.slice(0, 7)}-01`;
  const bw = branchWhere('o', req.query);
  res.json(INV.profitability(db, { from, to, branchSql: bw.sql, branchParams: bw.params }));
});

module.exports = router;
