/**
 * Factura electrónica en MODO PRUEBAS.
 *
 * Todavía no hay integración con un proveedor tecnológico autorizado (la
 * integración prevista es Factus). Mientras tanto, el sistema emite un
 * documento SIMULADO, numerado con prefijo FEP (Factura Electrónica de Pruebas)
 * y un CUFE calculado localmente (SHA-384, mismo largo que el real) para poder
 * mostrar el flujo completo en demostraciones. Todo documento queda marcado
 * como "DOCUMENTO DE PRUEBA · SIN VALIDEZ FISCAL".
 */
const crypto = require('crypto');

function issueTestInvoice(db, orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return null;
  if (order.fe_number) return order;
  const seq = db.prepare('SELECT COUNT(*) AS c FROM orders WHERE fe_number IS NOT NULL').get().c + 1;
  const feNumber = `FEP-${String(seq).padStart(6, '0')}`;
  const cufe = crypto.createHash('sha384')
    .update(`${feNumber}|${order.id}|${order.created_at}|${order.total}|${order.customer_doc || ''}|AMBIENTE-PRUEBAS`)
    .digest('hex');
  db.prepare("UPDATE orders SET is_electronic_invoice = 1, fe_number = ?, fe_cufe = ?, fe_status = 'test', fe_issued_at = datetime('now', '-5 hours') WHERE id = ?")
    .run(feNumber, cufe, orderId);
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
}

function electronicInvoiceOf(order) {
  if (!order || !order.fe_number) return undefined;
  return { number: order.fe_number, cufe: order.fe_cufe, status: order.fe_status || 'test', issuedAt: order.fe_issued_at, test: order.fe_status !== 'accepted' };
}

module.exports = { issueTestInvoice, electronicInvoiceOf };
