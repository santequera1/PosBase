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
const KEYS = ['feProvider', 'factusEnv', 'factusClientId', 'factusClientSecret', 'factusEmail', 'factusPassword', 'factusNumberingRangeId', 'factusMunicipalityId', 'factusCodes', 'factusApiVersion', 'factusMunicipalityCode'];
// API v2 de Factus: usa códigos DIAN en lugar de ids. Tipos de documento del cliente (tabla DIAN)
const V2_DOC = { CC: '13', NIT: '31', CE: '22', TI: '12', PAS: '41', PEP: '47', NUIP: '91', RC: '11', TE: '21' };
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
    apiVersion: cfg.factusApiVersion === 'v2' ? 'v2' : cfg.factusApiVersion === 'v1' ? 'v1' : '',
    municipalityCode: cfg.factusMunicipalityCode || '',
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
  if (body.municipalityCode !== undefined) up.run('factusMunicipalityCode', String(body.municipalityCode || '').replace(/\D/g, '').slice(0, 5));
  // Credenciales o ambiente nuevos: se vuelve a detectar la versión de la API
  if (body.clientId !== undefined || body.env !== undefined || body.email !== undefined) db.prepare("DELETE FROM settings WHERE key = 'factusApiVersion'").run();
  db.prepare("DELETE FROM settings WHERE key = 'factusToken'").run();
  return readFeConfig(db);
}

/* ---------- archivo local de facturas (PDF y XML) ---------- */
const fsx = require('fs');
const pathx = require('path');
/** Carpeta junto a la base de datos: einvoices/ (no se sube al repositorio). */
function archiveDir() {
  const dbPath = process.env.DB_PATH || pathx.join(__dirname, '..', 'data.db');
  const dir = pathx.join(pathx.dirname(dbPath), 'einvoices');
  if (!fsx.existsSync(dir)) fsx.mkdirSync(dir, { recursive: true });
  return dir;
}
const safeName = n => String(n || '').replace(/[^A-Za-z0-9_-]/g, '');
const archivePath = (number, ext) => pathx.join(archiveDir(), `${safeName(number)}.${ext}`);
function readArchived(number, ext) { const p = archivePath(number, ext); return fsx.existsSync(p) ? fsx.readFileSync(p) : null; }

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

/**
 * Versión de la API habilitada para la cuenta: las cuentas nuevas de Factus solo aceptan v2 (con v1 responden 403
 * "Version de API no disponible para esta empresa"). Se detecta una vez y se guarda.
 */
async function apiVersion(db, cfg, force = false) {
  if (cfg.apiVersion && !force) return cfg.apiVersion;
  let v = 'v1';
  try { await call(db, cfg, 'GET', '/v2/numbering-ranges'); v = 'v2'; }
  catch (e) { if (e.status !== 403 && e.status !== 404) throw e; }
  db.prepare("INSERT INTO settings (key, value) VALUES ('factusApiVersion', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(v);
  cfg.apiVersion = v;
  return v;
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

/**
 * Factura en formato v2 (códigos DIAN). Los precios del POS incluyen el impuesto: el precio de cada ítem va sin impuesto
 * y Factus calcula el total; la diferencia de redondeo frente al total cobrado se informa en cash_rounding_amount.
 */
function buildBillV2(db, order, items, cfg) {
  const v1 = buildBill(db, order, items, cfg);
  const biz = readBiz(db);
  const codes = cfg.codes;
  const rate = biz.taxRate;
  const taxed = biz.taxType !== 'none' && rate > 0;
  const taxCode = biz.taxType === 'inc' ? '04' : '01';
  const c = v1.customer;
  const isCompany = c.legal_organization_id === '1';
  const docKey = Object.keys(codes.documentIds).find(k => codes.documentIds[k] === c.identification_document_id) || 'CC';
  const customer = {
    identification_document_code: V2_DOC[docKey] || '13',
    identification: c.identification,
    ...(isCompany ? { company: c.company, trade_name: c.trade_name || c.company } : { names: c.names || 'CONSUMIDOR FINAL' }),
    ...(isCompany && c.dv ? { dv: c.dv } : {}),
    legal_organization_code: isCompany ? '1' : '2',
    tribute_code: c.tribute_id === codes.customerTributeResponsible ? '01' : 'ZZ',
    responsibilities: ['R-99-PN'],
    country_code: 'CO',
    ...(cfg.municipalityCode ? { municipality_code: cfg.municipalityCode } : {}),
    ...(c.address ? { address: c.address } : {}),
    ...(c.email ? { email: c.email } : {}),
    ...(c.phone ? { phone: String(c.phone).replace(/\D/g, '').slice(0, 15) } : {}),
  };
  const lines = v1.items.map(l => ({
    code_reference: l.code_reference, name: l.name, quantity: Number(l.quantity).toFixed(2), discount_rate: Number(l.discount_rate || 0).toFixed(2),
    price: Number(l.price).toFixed(2), unit_measure_code: '94', standard_code: '999',
    taxes: [taxed ? { code: taxCode, rate: rate.toFixed(2) } : { code: '01', rate: '0.00', is_excluded: true }],
  }));
  // Total como lo calcula Factus (por línea, a 2 decimales)
  const computed = lines.reduce((a, l) => { const base = round2(Number(l.price) * Number(l.quantity) * (1 - Number(l.discount_rate) / 100)); return a + base + round2(base * Number(l.taxes[0].rate) / 100); }, 0);
  const charged = Math.max(0, (order.total || 0));
  const diff = round2(charged - computed);
  const total = Math.abs(diff) <= 500 ? charged : round2(computed);
  const credit = order.payment_status !== 'paid' || order.payment_method === 'credit';
  const methodCode = m => codes.paymentMethods[m] || '10';
  let payments;
  const sps = require('./paymentSplit').splitParts(order.payment_split);
  if (credit) payments = [{ payment_form: '2', payment_method_code: methodCode(order.payment_method === 'credit' ? 'cash' : order.payment_method), amount: total.toFixed(2), due_date: String(order.created_at || '').slice(0, 10) }];
  else if (order.payment_method === 'mixed' && sps.length) {
    // La factura no incluye la propina: el primer medio absorbe la diferencia para que sumen el total facturado
    const others = sps.slice(1).map(p => ({ ...p }));
    let restOthers = others.reduce((a, p) => a + p.amount, 0);
    while (restOthers > total && others.length) { const p = others.pop(); restOthers -= p.amount; }
    payments = [{ payment_form: '1', payment_method_code: methodCode(sps[0].method), amount: (total - restOthers).toFixed(2) }, ...others.map(p => ({ payment_form: '1', payment_method_code: methodCode(p.method), amount: p.amount.toFixed(2) }))];
  } else payments = [{ payment_form: '1', payment_method_code: methodCode(order.payment_method), amount: total.toFixed(2) }];
  const bill = {
    reference_code: v1.reference_code, document: '01', operation_type: '10', send_email: Boolean(customer.email),
    ...(cfg.numberingRangeId ? { numbering_range_id: cfg.numberingRangeId } : {}),
    ...(v1.observation ? { observation: v1.observation } : {}),
    payment_details: payments, customer, items: lines,
  };
  if (Math.abs(diff) <= 500 && diff !== 0) bill.cash_rounding_amount = diff.toFixed(2);
  return bill;
}

/** Emite la factura electrónica real del pedido y guarda número, CUFE, QR y enlace público. */
async function issueInvoice(db, orderId, userName) {
  const cfg = readFeConfig(db, { masked: false });
  if (cfg.provider !== 'factus') throw new Error('El proveedor de facturación electrónica no es Factus');
  if (!cfg.configured) throw new Error('Faltan las credenciales de Factus (Ajustes → Facturación electrónica)');
  // Sin rango elegido: se toma solo el rango de facturas activo (por ejemplo, apenas lo asocian en Factus)
  if (!cfg.numberingRangeId) {
    const version = await apiVersion(db, cfg);
    const r = await call(db, cfg, 'GET', '/' + version + '/numbering-ranges');
    const list = Array.isArray(r.data) ? r.data : (r.data && r.data.data) || [];
    const inv = list.find(x => /factura/i.test(x.document || '') && x.is_active !== false && !x.is_expired);
    if (!inv) throw new Error(cfg.env === 'production'
      ? 'Factus todavía no tiene el rango de numeración de facturas: hay que asociarlo en app.factus.com.co (Rangos de numeración). Mientras tanto no se puede emitir la factura electrónica.'
      : 'Factus no tiene un rango de numeración de facturas activo.');
    db.prepare("INSERT INTO settings (key, value) VALUES ('factusNumberingRangeId', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(inv.id));
    cfg.numberingRangeId = inv.id;
  }
  const order = db.prepare('SELECT o.*, c.dv AS customer_dv, c.iva_responsible AS customer_iva_responsible, c.is_company FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.id = ?').get(orderId);
  if (!order) throw new Error('Pedido no encontrado');
  if (order.fe_provider === 'factus' && order.fe_cufe) return order;
  const items = db.prepare('SELECT product_id, name, quantity, price FROM order_items WHERE order_id = ?').all(orderId);
  if (!items.length) throw new Error('El pedido no tiene productos');
  const version = await apiVersion(db, cfg);
  const bill = version === 'v2' ? buildBillV2(db, order, items, cfg) : buildBill(db, order, items, cfg);
  let resp;
  try {
    resp = await call(db, cfg, 'POST', `/${version}/bills/validate`, bill);
  } catch (e) {
    db.prepare("UPDATE orders SET fe_error = ?, fe_status = CASE WHEN fe_status = 'accepted' THEN fe_status ELSE 'error' END WHERE id = ?").run(String(e.message).slice(0, 500), orderId);
    throw e;
  }
  // v1 responde data.bill; v2 responde data con cufe y links { qr, public_url }
  const d = (resp && resp.data) || {};
  const b = d.bill || { number: d.number, cufe: d.cufe, qr: d.links && d.links.qr, public_url: d.links && d.links.public_url };
  db.prepare(`UPDATE orders SET is_electronic_invoice = 1, fe_provider = 'factus', fe_number = ?, fe_cufe = ?, fe_qr = ?, fe_public_url = ?, fe_status = 'accepted', fe_error = NULL, fe_issued_at = datetime('now', '-5 hours') WHERE id = ?`)
    .run(String(b.number || b.id || ''), String(b.cufe || ''), String(b.qr || ''), String(b.public_url || ''), orderId);
  if (b.number) await archiveInvoice(db, String(b.number));
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
}

async function testConnection(db) {
  const cfg = readFeConfig(db, { masked: false });
  if (!cfg.configured) throw new Error('Faltan credenciales');
  await getToken(db, cfg, true);
  const version = await apiVersion(db, cfg, true);
  const ranges = await call(db, cfg, 'GET', `/${version}/numbering-ranges`);
  const list = Array.isArray(ranges.data) ? ranges.data : (ranges.data && ranges.data.data) || [];
  return { ok: true, env: cfg.env, apiVersion: version, ranges: list.map(r => ({ id: r.id, document: r.document, prefix: r.prefix, from: r.from, to: r.to, current: r.current, resolution: r.resolution_number, start: r.start_date, end: r.end_date, isActive: r.is_active })) };
}
async function searchMunicipalities(db, q) {
  const cfg = readFeConfig(db, { masked: false });
  if (await apiVersion(db, cfg) === 'v2') throw new Error('Con la API v2 escribe el código DIVIPOLA del municipio (ej. Cartagena 13001)');
  const r = await call(db, cfg, 'GET', `/v1/municipalities${q ? '?name=' + encodeURIComponent(q) : ''}`);
  return (r.data || []).slice(0, 50).map(m => ({ id: m.id, code: m.code, name: m.name, department: m.department }));
}
/** PDF de la factura: la copia guardada; si no existe, se descarga de Factus y se guarda. */
async function downloadPdf(db, number) {
  const saved = readArchived(number, 'pdf');
  if (saved) return saved;
  const cfg = readFeConfig(db, { masked: false });
  const v2 = (await apiVersion(db, cfg)) === 'v2';
  const r = await call(db, cfg, 'GET', v2 ? `/v2/bills/${encodeURIComponent(number)}/download-pdf` : `/v1/bills/download-pdf/${encodeURIComponent(number)}`);
  const b64 = r.data && (r.data.pdf_base_64_encoded || r.data.pdf);
  if (!b64) throw new Error('Factus no devolvió el PDF');
  const buf = Buffer.from(b64, 'base64');
  try { fsx.writeFileSync(archivePath(number, 'pdf'), buf); } catch (e) { console.warn('No se pudo guardar el PDF:', e.message); }
  return buf;
}
/** XML (documento oficial para el contador): copia guardada o descarga de Factus. */
async function downloadXml(db, number) {
  const saved = readArchived(number, 'xml');
  if (saved) return saved;
  const cfg = readFeConfig(db, { masked: false });
  const v2 = (await apiVersion(db, cfg)) === 'v2';
  const r = await call(db, cfg, 'GET', v2 ? `/v2/bills/${encodeURIComponent(number)}/download-xml` : `/v1/bills/download-xml/${encodeURIComponent(number)}`);
  const b64 = r.data && (r.data.xml_base_64_encoded || r.data.xml);
  if (!b64) throw new Error('Factus no devolvió el XML');
  const buf = Buffer.from(b64, 'base64');
  try { fsx.writeFileSync(archivePath(number, 'xml'), buf); } catch (e) { console.warn('No se pudo guardar el XML:', e.message); }
  return buf;
}
/** Guarda PDF y XML apenas se emite la factura (si falla, se reintenta al descargarla). */
async function archiveInvoice(db, number) {
  for (const fn of [downloadPdf, downloadXml]) { try { await fn(db, number); } catch (e) { console.warn(`Archivo de la factura ${number}:`, e.message); } }
}

module.exports = { readFeConfig, saveFeConfig, issueInvoice, testConnection, searchMunicipalities, downloadPdf, downloadXml, archiveInvoice, readArchived, buildBill, buildBillV2, apiVersion, DEFAULT_CODES };
