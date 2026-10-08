/** Facturación electrónica: configuración del proveedor (Factus), prueba de conexión, rangos, municipios y PDF. */
const { Router } = require('express');
const { getDb } = require('../db');
const { requireRole } = require('../auth');
const factus = require('../factus');

const router = Router();
const ADMIN = requireRole('admin');

router.get('/config', ADMIN, (req, res) => res.json(factus.readFeConfig(getDb())));
router.put('/config', ADMIN, (req, res) => {
  try { res.json(factus.saveFeConfig(getDb(), req.body || {})); } catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/test', ADMIN, async (req, res) => {
  try { res.json(await factus.testConnection(getDb())); } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});
router.get('/municipalities', ADMIN, async (req, res) => {
  try { res.json(await factus.searchMunicipalities(getDb(), String(req.query.q || ''))); } catch (e) { res.status(400).json({ error: e.message }); }
});
router.get('/preview/:orderId', ADMIN, (req, res) => {
  // Muestra el JSON que se enviaría a Factus (útil para revisar con el contador antes de emitir)
  const db = getDb();
  const cfg = factus.readFeConfig(db, { masked: false });
  const order = db.prepare('SELECT o.*, c.dv AS customer_dv, c.iva_responsible AS customer_iva_responsible, c.is_company FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.id = ?').get(Number(req.params.orderId));
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
  const items = db.prepare('SELECT product_id, name, quantity, price FROM order_items WHERE order_id = ?').all(order.id);
  res.json(cfg.apiVersion === 'v2' ? factus.buildBillV2(db, order, items, cfg) : factus.buildBill(db, order, items, cfg));
});
router.get('/invoices/:number/pdf', async (req, res) => {
  try {
    const pdf = await factus.downloadPdf(getDb(), req.params.number);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${req.params.number}.pdf"`);
    res.send(pdf);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
