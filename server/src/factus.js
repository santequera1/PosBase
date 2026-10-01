/**
 * Factus (proveedor tecnológico de facturación electrónica, Colombia).
 * Autenticación OAuth2 (password grant), emisión y validación de facturas ante la DIAN a través de la API de Factus,
 * descarga de PDF/XML y consulta de rangos de numeración y municipios.
 *
 * La configuración vive en settings (feProvider, factusEnv, factusClientId, factusClientSecret, factusEmail,
 * factusPassword, factusNumberingRangeId, factusMunicipalityId, factusCodes). Mientras feProvider = 'test', las ventas
 * marcadas como F.E. generan el documento simulado (einvoice.js). Con 'factus', se emite la factura real.
 */
const BASES = { sandbox: 'https://api-sandbox.factus.com.co', production: 'https://api.factus.com.co' };
const KEYS = ['feProvider', 'factusEnv', 'factusClientId', 'factusClientSecret', 'factusEmail', 'factusPassword', 'factusNumberingRangeId', 'factusMunicipalityId', 'factusCodes'];
// Códigos de la API de Factus que se pueden ajustar sin tocar el código
const DEFAULT_CODES = {
  paymentMethods: { cash: '10', transfer: '47', card_credit: '48', card_debit: '49', card: '48', platform: '47', credit: '10', mixed: '10' },
  documentIds: { CC: '3', NIT: '6', CE: '5', TI: '2', PAS: '7', PEP: '9', NUIP: '11' },
  tributeIVA: '01', tributeINC: '04', unitMeasureId: 70, standardCodeId: 1,
  customerTributeResponsible: '18', customerTributeNone: '21',
};

function get(db, key) { const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key); return r ? r.value : ''; }
function readFeConfig(db, { masked = true } = {}) {
  const cfg = {};
  for (const k of KEYS) cfg[k] = get(db, k) || '';
  let codes = { ...DEFAULT_CODES };
  try { if (cfg.factusCodes) codes = { ...codes, ...JSON.parse(cfg.factusCodes) }; } catch { /* valores por defecto */ }
  return {
    provider: cfg.feProvider === 'factus' ? 'factus' : 'test',
    env: cfg.factusEnv === 'production' ? 'production' : 'sandbox',
    clientId: cfg.factusClientId, clientSecret: masked ? (cfg.factusClientSecret ? '••••••••' : '') : cfg.factusClientSecret,
    email: cfg.factusEmail, password: masked ? (cfg.factusPassword ? '••••••••' : '') : cfg.factusPassword,
    numberingRangeId: cfg.factusNumberingRangeId ? Number(cfg.factusNumberingRangeId) : null,
    municipalityId: cfg.factusMunicipalityId ? Number(cfg.factusMunicipalityId) : null,
    codes, baseUrl: BASES[cfg.factusEnv === 'production' ? 'production' : 'sandbox'],
    configured: Boolean(cfg.factusClientId && cfg.factusClientSecret && cfg.factusEmail && cfg.factusPassword),
  };
}
function saveFeConfig(db, body) {
  const up = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  if (body.provider !== undefined) up.run('feProvider', body.provider === 'factus' ? 'factus' : 'test');
  if (body.env !== undefined) up.run('factusEnv', body.env === 'production' ? 'production' : 'sandbox');
  if (body.clientId !== undefined) up.run('factusClientId', String(body.clientId).trim());
  if (body.clientSecret !== undefined && !String(body.clientSecret).includes('••')) up.run('factusClientSecret', String(body.clientSecret).trim());
  if (body.email !== undefined) up.run('factusEmail', String(body.email).trim());
  if (body.password !== undefined && !String(body.password).includes('••')) up.run('factusPassword', String(body.password));
  if (body.numberingRangeId !== undefined) up.run('factusNumberingRangeId', body.numberingRangeId ? String(Math.round(Number(body.numberingRangeId))) : '');
  if (body.municipalityId !== undefined) up.run('factusMunicipalityId', body.municipalityId ? String(Math.round(Number(body.municipalityId))) : '');
  if (body.codes !== undefined && typeof body.codes === 'object') up.run('factusCodes', JSON.stringify(body.codes));
  db.prepare("DELETE FROM settings WHERE key = 'factusToken'").run();
  return readFeConfig(db);
}

/* ---------- autenticación ---------- */
async function getToken(db, cfg, force = false) {
  if (!force) {
    try { const saved = JSON.parse(get(db, 'factusToken') || 'null'); if (saved && saved.access_token && saved.expires_at > Date.now() + 60000 && saved.env === cfg.env) return saved.access_token; } catch { /* sin token guardado */ }
  }
  const body = new URLSearchParams({ grant_type: 'password', client_id: cfg.clientId, client_secret: cfg.clientSecret, username: cfg.email, password: cfg.password });
  const r = await fetch(`${cfg.baseUrl}/oauth/token`, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Factus no aceptó las credenciales (${r.status}): ${j.error_description || j.message || j.error || 'sin detalle'}`);
  db.prepare("INSERT INTO settings (key, value) VALUES ('factusToken', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (Number(j.expires_in) || 3600) * 1000, env: cfg.env }));
  return j.access_token;
}
async function call(db, cfg, method, path, body, retry = true) {
  const token = await getToken(db, cfg);
  const r = await fetch(`${cfg.baseUrl}${path}`, { method, headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401 && retry) { await getToken(db, cfg, true); return call(db, cfg, method, path, body, false); }
  const text = await r.text();
  let j = {}; try { j = text ? JSON.parse(text) : {}; } catch { j = { raw: text.slice(0, 500) }; }
  if (!r.ok) {
    const detail = j.message || j.error || (j.errors ? JSON.stringify(j.errors).slice(0, 400) : '') || j.raw || `HTTP ${r.status}`;
    const err = new Error(`Factus (${r.status}): ${detail}`); err.status = r.status; err.payload = j; throw err;
  }
  return j;
}

/* ---------- armado de la factura ---------- */
const round2 = n => Math.round(n * 100) / 100;
function readBiz(db) {
  const k = key => get(db, key);
  return { prefix: k('invoicePrefix') || 'POS', taxType: k('taxType') || 'none', taxRate: Number(k('taxRate')) || 0 };
}
function buildBill(db, order, items, cfg) {
  const biz = readBiz(db);
  const codes = cfg.codes;
  const rate = biz.taxRate;
  const taxed = biz.taxType !== 'none' && rate > 0;
  const docType = (order.customer_doc && order.customer_doc !== '222222222222') ? (order.customer_doc.length >= 9 && order.is_company ? 'NIT' : 'CC') : 'CC';
  const isCompany = docType === 'NIT';
  const customer = {
    identification: order.customer_doc && order.customer_doc !== '222222222222' ? String(order.customer_doc).replace(/\D/g, '') : '222222222222',
    dv: isCompany && order.customer_dv ? String(order.customer_dv) : undefined,
    company: isCompany ? order.customer_name : '',
    trade_name: isCompany ? order.customer_name : '',
    names: isCompany ? '' : (order.customer_name || 'CONSUMIDOR FINAL'),
    address: order.customer_address || 'Sin dirección',
    email: order.customer_email || '',
    phone: order.customer_phone || '',
    legal_organization_id: isCompany ? '1' : '2',
    tribute_id: order.customer_iva_responsible ? codes.customerTributeResponsible : codes.customerTributeNone,
    identification_document_id: codes.documentIds[docType] || '3',
    municipality_id: cfg.municipalityId || undefined,
  };
  Object.keys(customer).forEach(k => customer[k] === undefined && delete customer[k]);
  const lineItems = items.map(i => {
    const unitWithTax = Number(i.price) || 0;
    const unit = taxed ? round2(unitWithTax / (1 + rate / 100)) : unitWithTax;
    return {
      code_reference: String(i.product_id || i.name).slice(0, 40), name: String(i.name).slice(0, 100), quantity: Number(i.quantity) || 1, discount_rate: 0, price: unit,
      tax_rate: taxed ? rate.toFixed(2) : '0.00', unit_measure_id: codes.unitMeasureId, standard_code_id: codes.standardCodeId,
      is_excluded: taxed ? 0 : 1, tribute_id: taxed ? (biz.taxType === 'inc' ? codes.tributeINC : codes.tributeIVA) : codes.tributeIVA, withholding_taxes: [],
    };
  });
  if ((order.delivery_fee || 0) > 0) {
    const fee = order.delivery_fee;
    lineItems.push({ code_reference: 'ENVIO', name: 'Costo de envío', quantity: 1, discount_rate: 0, price: taxed ? round2(fee / (1 + rate / 100)) : fee, tax_rate: taxed ? rate.toFixed(2) : '0.00', unit_measure_id: codes.unitMeasureId, standard_code_id: codes.standardCodeId, is_excluded: taxed ? 0 : 1, tribute_id: taxed ? (biz.taxType === 'inc' ? codes.tributeINC : codes.tributeIVA) : codes.tributeIVA, withholding_taxes: [] });
  }
  if ((order.discount || 0) > 0 && lineItems.length) {
    // El descuento del pedido se reparte como porcentaje sobre todos los ítems
    const gross = lineItems.reduce((a, l) => a + l.price * l.quantity, 0);
    const pct = gross > 0 ? round2(Math.min(100, ((taxed ? order.discount / (1 + rate / 100) : order.discount) / gross) * 100)) : 0;
    for (const l of lineItems) l.discount_rate = pct;
  }
  const credit = order.payment_status !== 'paid' || order.payment_method === 'credit';
  const bill = {
    numbering_range_id: cfg.numberingRangeId,
    reference_code: `${biz.prefix}-${order.id}`,
    observation: order.notes ? String(order.notes).slice(0, 250) : '',
    payment_form: credit ? '2' : '1',
    payment_method_code: codes.paymentMethods[order.payment_method] || '10',
    customer, items: lineItems,
  };
  if (credit) bill.payment_due_date = (order.created_at || '').slice(0, 10);
  return bill;
}

/** Emite la factura electrónica real del pedido y guarda número, CUFE, QR y enlace público. */
async function issueInvoice(db, orderId, userName) {
  const cfg = readFeConfig(db, { masked: false });
  if (cfg.provider !== 'factus') throw new Error('El proveedor de facturación electrónica no es Factus');
  if (!cfg.configured) throw new Error('Faltan las credenciales de Factus (Ajustes → Facturación electrónica)');
  if (!cfg.numberingRangeId) throw new Error('Selecciona el rango de numeración de Factus en Ajustes → Facturación electrónica');
  const order = db.prepare('SELECT o.*, c.dv AS customer_dv, c.iva_responsible AS customer_iva_responsible, c.is_company FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.id = ?').get(orderId);
  if (!order) throw new Error('Pedido no encontrado');
  if (order.fe_provider === 'factus' && order.fe_cufe) return order;
  const items = db.prepare('SELECT product_id, name, quantity, price FROM order_items WHERE order_id = ?').all(orderId);
  if (!items.length) throw new Error('El pedido no tiene productos');
  const bill = buildBill(db, order, items, cfg);
  let resp;
  try {
    resp = await call(db, cfg, 'POST', '/v1/bills/validate', bill);
  } catch (e) {
    db.prepare("UPDATE orders SET fe_error = ?, fe_status = CASE WHEN fe_status = 'accepted' THEN fe_status ELSE 'error' END WHERE id = ?").run(String(e.message).slice(0, 500), orderId);
    throw e;
  }
  const b = (resp && resp.data && resp.data.bill) || {};
  db.prepare(`UPDATE orders SET is_electronic_invoice = 1, fe_provider = 'factus', fe_number = ?, fe_cufe = ?, fe_qr = ?, fe_public_url = ?, fe_status = 'accepted', fe_error = NULL, fe_issued_at = datetime('now', '-5 hours') WHERE id = ?`)
    .run(String(b.number || b.id || ''), String(b.cufe || ''), String(b.qr || ''), String(b.public_url || ''), orderId);
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
}

async function testConnection(db) {
  const cfg = readFeConfig(db, { masked: false });
  if (!cfg.configured) throw new Error('Faltan credenciales');
  await getToken(db, cfg, true);
  const ranges = await call(db, cfg, 'GET', '/v1/numbering-ranges');
  return { ok: true, env: cfg.env, ranges: (ranges.data || []).map(r => ({ id: r.id, document: r.document, prefix: r.prefix, from: r.from, to: r.to, current: r.current, resolution: r.resolution_number, start: r.start_date, end: r.end_date, isActive: r.is_active })) };
}
async function searchMunicipalities(db, q) {
  const cfg = readFeConfig(db, { masked: false });
  const r = await call(db, cfg, 'GET', `/v1/municipalities${q ? '?name=' + encodeURIComponent(q) : ''}`);
  return (r.data || []).slice(0, 50).map(m => ({ id: m.id, code: m.code, name: m.name, department: m.department }));
}
async function downloadPdf(db, number) {
  const cfg = readFeConfig(db, { masked: false });
  const r = await call(db, cfg, 'GET', `/v1/bills/download-pdf/${encodeURIComponent(number)}`);
  const b64 = r.data && (r.data.pdf_base_64_encoded || r.data.pdf);
  if (!b64) throw new Error('Factus no devolvió el PDF');
  return Buffer.from(b64, 'base64');
}

module.exports = { readFeConfig, saveFeConfig, issueInvoice, testConnection, searchMunicipalities, downloadPdf, buildBill, DEFAULT_CODES };
