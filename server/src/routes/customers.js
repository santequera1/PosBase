const { Router } = require('express');
const { getDb } = require('../db');

const router = Router();

// Helper to build customer with computed fields
function enrichCustomer(db, customer) {
  const stats = db.prepare(`
    SELECT COUNT(*) as totalOrders, COALESCE(SUM(total), 0) as totalSpent, MAX(created_at) as lastOrder
    FROM orders WHERE customer_phone = ? OR customer_doc = ?
  `).get(customer.phone, customer.document_id || '');

  const totalOrders = stats?.totalOrders || 0;
  let tag = 'new';
  if (totalOrders > 5) tag = 'frequent';
  else if (totalOrders > 0) tag = 'regular';

  return {
    id: customer.id,
    name: customer.name,
    documentId: customer.document_id || '222222222222',
    email: customer.email || '',
    phone: customer.phone,
    address: customer.address || '',
    notes: customer.notes || '',
    isCompany: Boolean(customer.is_company),
    totalOrders,
    totalSpent: stats?.totalSpent || 0,
    lastOrder: stats?.lastOrder || '',
    tag,
  };
}

router.get('/', (req, res) => {
  const { search } = req.query;
  const db = getDb();
  let sql = 'SELECT * FROM customers';
  const params = [];

  if (search) {
    sql += ' WHERE name LIKE ? OR phone LIKE ? OR document_id LIKE ? OR email LIKE ?';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  sql += ' ORDER BY name';

  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(c => enrichCustomer(db, c)));
});

router.get('/phone/:phone', (req, res) => {
  const db = getDb();
  const customer = db.prepare('SELECT * FROM customers WHERE phone = ? OR document_id = ?').get(req.params.phone, req.params.phone);
  if (!customer) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json(enrichCustomer(db, customer));
});

router.get('/doc/:doc', (req, res) => {
  const db = getDb();
  const customer = db.prepare('SELECT * FROM customers WHERE document_id = ?').get(req.params.doc);
  if (!customer) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json(enrichCustomer(db, customer));
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json(enrichCustomer(db, customer));
});

router.post('/', (req, res) => {
  const { name, documentId = '222222222222', email = '', phone = '', address = '', notes = '', isCompany = false } = req.body;
  if (!name) return res.status(400).json({ error: 'El nombre es requerido' });

  const db = getDb();
  const cleanPhone = phone?.trim() || `300${Math.floor(1000000 + Math.random() * 9000000)}`;

  const existing = db.prepare('SELECT * FROM customers WHERE (phone = ? AND phone != "") OR (document_id = ? AND document_id != "222222222222")')
    .get(cleanPhone, documentId);

  if (existing) {
    // Update existing customer seamlessly
    db.prepare(`
      UPDATE customers SET
        name = COALESCE(?, name),
        document_id = COALESCE(?, document_id),
        email = COALESCE(?, email),
        address = COALESCE(?, address),
        notes = COALESCE(?, notes)
      WHERE id = ?
    `).run(name, documentId, email, address, notes, existing.id);

    const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(existing.id);
    return res.json(enrichCustomer(db, updated));
  }

  const result = db.prepare(`
    INSERT INTO customers (name, document_id, email, phone, address, notes, is_company)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(name, documentId, email, cleanPhone, address, notes, isCompany ? 1 : 0);

  const created = db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(enrichCustomer(db, created));
});

router.put('/:id', (req, res) => {
  const { name, documentId, email, phone, address, notes, isCompany } = req.body;
  const db = getDb();
  const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Cliente no encontrado' });

  db.prepare(`
    UPDATE customers SET
      name = COALESCE(?, name),
      document_id = COALESCE(?, document_id),
      email = COALESCE(?, email),
      phone = COALESCE(?, phone),
      address = COALESCE(?, address),
      notes = COALESCE(?, notes),
      is_company = COALESCE(?, is_company)
    WHERE id = ?
  `).run(name, documentId, email, phone, address, notes, isCompany !== undefined ? (isCompany ? 1 : 0) : existing.is_company, req.params.id);

  const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  res.json(enrichCustomer(db, updated));
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
