/**
 * Teléfonos de clientes: se comparan solo por los dígitos (los últimos 10), así "+57 310 606 9248",
 * "3106069248" y "310-606-9248" son el mismo cliente y no se duplica en el directorio.
 */
const phoneKey = p => String(p || '').replace(/\D/g, '').slice(-10);

/** Cliente existente con ese teléfono (o null). Solo cuenta si el número tiene al menos 7 dígitos. */
function findCustomerByPhone(db, phone) {
  const key = phoneKey(phone);
  if (key.length < 7) return null;
  const tail = key.slice(-7);
  const rows = db.prepare("SELECT * FROM customers WHERE REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''), '.', '') LIKE ? ORDER BY id").all('%' + tail);
  return rows.find(r => phoneKey(r.phone) === key) || null;
}

module.exports = { phoneKey, findCustomerByPhone };
