const { electronicInvoiceOf } = require('./einvoice');

/** Pedido tal como lo consume el frontend (usado por /orders y /restaurant). */
function formatOrder(db, order) {
  const items = db.prepare(`
    SELECT oi.id, oi.product_id AS productId, oi.name, oi.size, oi.flavors, oi.quantity, oi.price, oi.notes,
           oi.batch, oi.sent_at AS sentAt, COALESCE(oi.kitchen_status, 'pending') AS kitchenStatus, oi.kitchen_ready_at AS kitchenReadyAt,
           COALESCE(p.station, 'cocina') AS station
    FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = ? ORDER BY oi.id
  `).all(order.id).map(i => ({ ...i, batch: i.batch || undefined, sentAt: i.sentAt || undefined, kitchenReadyAt: i.kitchenReadyAt || undefined }));
  const tip = order.tip || 0;

  return {
    id: order.id,
    type: order.type,
    status: order.status,
    channel: order.channel || 'local',
    label: order.sale_label || undefined,
    customer: {
      name: order.customer_name || 'Consumidor Final',
      doc: order.customer_doc || '222222222222',
      email: order.customer_email || undefined,
      phone: order.customer_phone || undefined,
      address: order.customer_address || undefined,
      address2: order.customer_address2 || undefined,
      neighborhood: order.customer_neighborhood || undefined,
      isElectronicInvoice: Boolean(order.is_electronic_invoice),
    },
    customerId: order.customer_id || undefined,
    tableId: order.table_id || undefined,
    tableLabel: order.table_label || (order.table_number ? String(order.table_number) : undefined),
    tableNumber: order.table_number || undefined,
    people: order.people || 0,
    waiterId: order.waiter_id || undefined,
    waiterName: order.waiter_name || undefined,
    items,
    unsentCount: items.filter(i => !i.batch).length,
    subtotal: order.subtotal,
    deliveryFee: order.delivery_fee || 0,
    discount: order.discount || 0,
    discountReason: order.discount_reason || undefined,
    tip,
    tipTo: order.tip_to || undefined,
    total: order.total,
    amountDue: (order.total || 0) + tip,
    paymentMethod: order.payment_method,
    paymentStatus: order.payment_status,
    cashReceived: order.cash_received || 0,
    cashChange: order.cash_change || 0,
    paymentSplit: order.payment_split ? (typeof order.payment_split === 'string' ? JSON.parse(order.payment_split) : order.payment_split) : undefined,
    createdAt: order.created_at,
    readyAt: order.ready_at || undefined,
    shippedAt: order.shipped_at || undefined,
    deliveredAt: order.delivered_at || undefined,
    closedAt: order.closed_at || undefined,
    closedBy: order.closed_by || undefined,
    estimatedMinutes: order.estimated_minutes || undefined,
    driverId: order.driver_id || undefined,
    driverName: order.driver_name || undefined,
    receiptImage: order.receipt_image || undefined,
    notes: order.notes || '',
    shiftId: order.shift_id || undefined,
    cashierName: order.cashier_name || undefined,
    electronicInvoice: electronicInvoiceOf(order),
  };
}

module.exports = { formatOrder };
