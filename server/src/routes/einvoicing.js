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
    res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="Factura-${req.params.number}.pdf"`);
    res.send(pdf);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
router.get('/invoices/:number/xml', async (req, res) => {
  try {
    const xml = await factus.downloadXml(getDb(), req.params.number);
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="Factura-${req.params.number}.xml"`);
    res.send(xml);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

/** Facturas electrónicas emitidas, con datos del cliente para enviarlas por WhatsApp o correo. */
router.get('/invoices', (req, res) => {
  const db = getDb();
  const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
  let sql = `SELECT o.id, o.fe_number AS number, o.fe_cufe AS cufe, o.fe_status AS status, o.fe_provider AS provider, o.fe_issued_at AS issuedAt, o.fe_public_url AS publicUrl, o.fe_qr AS qr,
      o.customer_name AS customerName, o.customer_doc AS customerDoc, o.customer_email AS customerEmail, o.customer_phone AS customerPhone, o.total, o.type, o.created_at AS createdAt,
      COALESCE(c.phone, '') AS customerPhone2, COALESCE(c.email, '') AS customerEmail2
    FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.fe_number IS NOT NULL AND o.fe_number != ''`;
  const params = [];
  if (isDate(req.query.from)) { sql += ' AND date(COALESCE(o.fe_issued_at, o.created_at)) >= ?'; params.push(req.query.from); }
  if (isDate(req.query.to)) { sql += ' AND date(COALESCE(o.fe_issued_at, o.created_at)) <= ?'; params.push(req.query.to); }
  if (req.query.q) { sql += ' AND (o.fe_number LIKE ? OR o.customer_name LIKE ? OR o.customer_doc LIKE ? OR CAST(o.id AS TEXT) = ?)'; const q = `%${String(req.query.q).trim()}%`; params.push(q, q, q, String(req.query.q).trim()); }
  sql += ' ORDER BY COALESCE(o.fe_issued_at, o.created_at) DESC, o.id DESC LIMIT 300';
  const rows = db.prepare(sql).all(...params).map(r => ({
    ...r, phone: r.customerPhone || r.customerPhone2 || '', email: r.customerEmail || r.customerEmail2 || '',
    real: r.provider === 'factus' && r.status === 'accepted',
    pdfSaved: Boolean(factus.readArchived(r.number, 'pdf')), xmlSaved: Boolean(factus.readArchived(r.number, 'xml')),
  }));
  res.json({ invoices: rows, total: rows.reduce((a, r) => a + (r.total || 0), 0) });
});

module.exports = router;
