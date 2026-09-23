import { formatPrice, formatFullDate } from './format';
import { getBusinessInfo, orderNumber } from './orderNumber';

export interface PrintOptions {
  paperSize?: '80mm' | '58mm';
  autoPrint?: boolean;
}

export function printThermal(htmlInnerContent: string, title = 'Impresión POS'): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      let printContainer = document.getElementById('pos-thermal-print-area');
      if (!printContainer) {
        printContainer = document.createElement('div');
        printContainer.id = 'pos-thermal-print-area';
        document.body.appendChild(printContainer);
      }

      printContainer.innerHTML = htmlInnerContent;

      const triggerPrint = () => {
        try {
          window.focus();
          window.print();
        } catch (e) {
          console.error('window.print error:', e);
        } finally {
          setTimeout(() => {
            if (printContainer) printContainer.innerHTML = '';
            resolve(true);
          }, 1000);
        }
      };

      setTimeout(triggerPrint, 80);
    } catch (err) {
      console.error('printThermal error:', err);
      resolve(false);
    }
  });
}

export function generateSalesTicketHtml(order: any, options: PrintOptions = {}): string {
  const biz = getBusinessInfo();
  const paperSize = options.paperSize || '80mm';
  const widthCss = '50mm';
  const fontSize = '8.5px';

  const items = order.items || [];
  const subtotal = order.subtotal || items.reduce((a: number, i: any) => a + (i.price || 0) * (i.quantity || 1), 0);
  const discount = order.discount || 0;
  const total = order.total !== undefined ? order.total : Math.max(0, subtotal - discount);
  const docNumber = orderNumber(order.id || 1001);
  const taxBase = biz.taxRate > 0 ? Math.round(total / (1 + biz.taxRate / 100)) : total;
  const taxAmount = total - taxBase;

  const orderDate = order.createdAt ? new Date(order.createdAt) : new Date();
  const formattedDate = orderDate.toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const formattedTime = orderDate.toLocaleTimeString('es-CO', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
  });

  const customerName = order.customerName || order.customer?.name || 'Consumidor Final';
  const customerDoc = order.customerDoc || order.customer?.documentId || order.customer?.doc || '222222222222';

  let paymentMethodLabel = 'Efectivo';
  if (order.paymentMethod === 'mixed' || order.paymentSplit) paymentMethodLabel = 'Mixto / Combinado';
  else if (order.paymentMethod === 'card_debit') paymentMethodLabel = 'T. Débito';
  else if (order.paymentMethod === 'card_credit') paymentMethodLabel = 'T. Crédito';
  else if (order.paymentMethod === 'transfer') paymentMethodLabel = 'QR / Nequi';
  else if (order.paymentMethod === 'card') paymentMethodLabel = 'Tarjeta';

  return `
    <div class="ticket" style="width: ${widthCss}; max-width: ${widthCss};">
      <div class="text-center">
        <p class="font-bold" style="font-size: 10px; letter-spacing: 0.2px;">${biz.name}</p>
        <p class="font-bold" style="font-size: 9.5px;">${biz.slogan.toUpperCase()}</p>
        <p style="font-size: 7.5px;">NIT: ${biz.nit} • ${biz.address}</p>
        <p style="font-size: 7.5px;">Tel: ${biz.phone}</p>
      </div>

      <div class="divider"></div>

      <div class="text-center" style="font-size: 8px;">
        <p class="font-bold">DOC. INGRESO No. ${docNumber}</p>
        <p style="font-size: 7.5px;">${formattedDate} • ${formattedTime}</p>
      </div>

      <div class="dashed"></div>

      <div style="font-size: 8px; margin-bottom: 2px;">
        <div class="row"><span><strong>Cliente:</strong> ${customerName}</span></div>
        <div class="row"><span><strong>C.C / NIT:</strong> ${customerDoc}</span></div>
      </div>

      <div class="divider"></div>

      <div style="margin-bottom: 2px;">
        <div class="row font-bold" style="font-size: 8px; border-bottom: 1px dashed #666; padding-bottom: 2px;">
          <span style="width: 18px;">Cant</span>
          <span style="flex: 1; text-align: left; padding-left: 2px;">Producto</span>
          <span style="width: 50px; text-align: right; white-space: nowrap;">Total</span>
        </div>
        ${items.map((item: any) => `
          <div style="margin: 2px 0;">
            <div class="row" style="font-size: ${fontSize};">
              <span style="width: 18px; font-weight: bold;">${item.quantity || 1}x</span>
              <span style="flex: 1; text-align: left; padding-left: 2px;" class="item-desc">${item.name}</span>
              <span style="width: 50px; text-align: right; font-weight: bold; white-space: nowrap;">${formatPrice((item.price || 0) * (item.quantity || 1))}</span>
            </div>
            ${item.flavors ? `<div class="item-flavors">• ${item.flavors}</div>` : ''}
          </div>
        `).join('')}
      </div>

      <div class="divider"></div>

      <div style="font-size: 8.5px;">
        <div class="row"><span>Subtotal:</span><span style="white-space: nowrap;">${formatPrice(subtotal)}</span></div>
        ${discount > 0 ? `<div class="row font-bold" style="color: #000;"><span>Descuento:</span><span style="white-space: nowrap;">-${formatPrice(discount)}</span></div>` : ''}
        ${biz.taxRate > 0 ? `<div class="row" style="font-size: 7.5px;"><span>Base gravable:</span><span style="white-space: nowrap;">${formatPrice(taxBase)}</span></div><div class="row" style="font-size: 7.5px;"><span>${biz.taxLabel} ${biz.taxRate}% (incluido):</span><span style="white-space: nowrap;">${formatPrice(taxAmount)}</span></div>` : ''}
        <div class="row font-bold" style="font-size: 10px; margin-top: 3px; border-top: 1px solid #000; padding-top: 2px;">
          <span>TOTAL A PAGAR:</span>
          <span style="white-space: nowrap;">${formatPrice(total)}</span>
        </div>
        <div class="row" style="font-size: 8px; margin-top: 2px;">
          <span>Forma de Pago:</span>
          <span class="font-bold">${paymentMethodLabel}</span>
        </div>
        ${order.paymentSplit ? `
          <div style="font-size: 7.5px; padding-left: 3px;">
            <div>• ${order.paymentSplit.method1 === 'cash' ? 'Efectivo' : order.paymentSplit.method1 === 'card_debit' ? 'T. Débito' : order.paymentSplit.method1 === 'card_credit' ? 'T. Crédito' : 'Transferencia'}: ${formatPrice(order.paymentSplit.amount1)}</div>
            <div>• ${order.paymentSplit.method2 === 'cash' ? 'Efectivo' : order.paymentSplit.method2 === 'card_debit' ? 'T. Débito' : order.paymentSplit.method2 === 'card_credit' ? 'T. Crédito' : 'Transferencia'}: ${formatPrice(order.paymentSplit.amount2)}</div>
          </div>
        ` : ''}
        ${order.paymentMethod === 'cash' && order.cashReceived > 0 ? `
          <div class="row" style="font-size: 7.5px;"><span>Recibido:</span><span style="white-space: nowrap;">${formatPrice(order.cashReceived)}</span></div>
          <div class="row" style="font-size: 7.5px;"><span>Cambio / Vueltas:</span><span style="white-space: nowrap;">${formatPrice(order.cashChange || (order.cashReceived - total))}</span></div>
        ` : ''}
      </div>

      <div class="dashed" style="margin-top: 5px;"></div>

      <div class="text-center" style="font-size: 7.5px; margin-top: 3px; line-height: 1.3;">
        <p class="font-bold">¡Gracias por su visita a ${biz.name}!</p>
        <p>${biz.slogan}</p>
        ${biz.dianResolution ? `<p style="font-size: 6.5px; margin-top: 2px;">${biz.dianResolution}</p>` : ''}
      </div>
    </div>
  `;
}

export function generateZReportHtml(shiftData: any, options: PrintOptions & { isReportX?: boolean } = {}): string {
  const biz = getBusinessInfo();
  const paperSize = options.paperSize || '80mm';
  const widthCss = '50mm';
  const fontSize = '8px';

  const shiftId = shiftData.id || 1;
  const cashier = shiftData.cashierName || shiftData.cashier_name || 'Cajero Gia';
  const initial = shiftData.initialCash !== undefined ? shiftData.initialCash : shiftData.initial_cash || 0;
  const cash = shiftData.cashSales !== undefined ? shiftData.cashSales : shiftData.cash_sales || 0;
  const withdrawals = shiftData.totalWithdrawals !== undefined ? shiftData.totalWithdrawals : shiftData.total_withdrawals || 0;
  const debit = shiftData.debitSales !== undefined ? shiftData.debitSales : shiftData.debit_sales || 0;
  const credit = shiftData.creditSales !== undefined ? shiftData.creditSales : shiftData.credit_sales || 0;
  const transfer = shiftData.transferSales !== undefined ? shiftData.transferSales : shiftData.transfer_sales || 0;
  const totalSales = shiftData.totalSales !== undefined ? shiftData.totalSales : shiftData.total_sales || 0;
  const totalOrders = shiftData.totalOrders !== undefined ? shiftData.totalOrders : shiftData.total_orders || 0;
  const expected = shiftData.expectedCash !== undefined ? shiftData.expectedCash : (initial + cash - withdrawals);
  const actual = shiftData.actualCash !== undefined ? shiftData.actualCash : shiftData.actual_cash || 0;
  const diff = shiftData.difference !== undefined ? shiftData.difference : (actual - expected);

  const dateStr = formatFullDate(shiftData.closedAt || shiftData.closed_at || shiftData.openedAt || shiftData.opened_at || new Date().toISOString());
  const reportTitle = options.isReportX ? 'CORTE PARCIAL (REPORTE X)' : 'CIERRE DE CAJA (REPORTE Z)';

  return `
    <div class="ticket" style="width: ${widthCss}; max-width: ${widthCss};">
      <div class="text-center">
        <p class="font-bold" style="font-size: 10px; letter-spacing: 0.2px;">${biz.name}</p>
        <p class="font-bold" style="font-size: 9.5px;">${biz.slogan.toUpperCase()}</p>
        <p style="font-size: 7.5px;">NIT: ${biz.nit} • ${biz.address}</p>
        <p class="font-bold" style="font-size: 8.5px; margin-top: 2px; border: 1px solid #000; padding: 1px 3px; display: inline-block;">
          ${reportTitle}
        </p>
      </div>

      <div class="divider"></div>

      <div style="font-size: 8px;">
        <div class="row"><span><strong>Turno ID:</strong> #${shiftId}</span><span style="white-space: nowrap;">${dateStr}</span></div>
        <div class="row"><span><strong>Cajero:</strong> ${cashier}</span><span><strong>Pedidos:</strong> ${totalOrders}</span></div>
      </div>

      <div class="divider"></div>

      <div style="font-size: 8.5px;">
        <p class="font-bold" style="font-size: 8px; text-decoration: underline; margin-bottom: 2px;">VENTAS POR MEDIO DE PAGO:</p>
        <div class="row"><span>Ventas Efectivo:</span><span class="font-bold" style="white-space: nowrap;">+${formatPrice(cash)}</span></div>
        <div class="row font-bold"><span>Total Datáfono (Tarjetas):</span><span style="white-space: nowrap;">${formatPrice(debit + credit)}</span></div>
        <div class="row" style="font-size: 7.5px; color: #333; padding-left: 6px;"><span>↳ Débito: ${formatPrice(debit)} | Crédito: ${formatPrice(credit)}</span></div>
        <div class="row"><span>Ventas QR / Nequi:</span><span style="white-space: nowrap;">${formatPrice(transfer)}</span></div>
        <div class="row font-bold" style="font-size: 9.5px; margin-top: 3px; border-top: 1px solid #000; padding-top: 2px;">
          <span>TOTAL VENTAS:</span>
          <span style="white-space: nowrap;">${formatPrice(totalSales)}</span>
        </div>
      </div>

      <div class="dashed"></div>

      <div style="font-size: 8.5px;">
        <p class="font-bold" style="font-size: 8px; text-decoration: underline; margin-bottom: 2px;">ARQUEO Y CUADRE DE GAVETA:</p>
        <div class="row"><span>Base Inicial en Caja:</span><span style="white-space: nowrap;">${formatPrice(initial)}</span></div>
        <div class="row"><span>+ Efectivo por Ventas:</span><span style="white-space: nowrap;">${formatPrice(cash)}</span></div>
        ${withdrawals > 0 ? `<div class="row font-bold" style="color: #000;"><span>- Retiros / Gastos:</span><span style="white-space: nowrap;">-${formatPrice(withdrawals)}</span></div>` : ''}
        <div class="row font-bold" style="font-size: 8.5px; border-top: 1px dashed #666; padding-top: 2px;">
          <span>= Efectivo Esperado:</span>
          <span style="white-space: nowrap;">${formatPrice(expected)}</span>
        </div>
        <div class="row font-bold" style="font-size: 8.5px;">
          <span>= Efectivo Contado:</span>
          <span style="white-space: nowrap;">${formatPrice(actual)}</span>
        </div>
        <div class="row font-bold" style="font-size: 9px; margin-top: 2px; border-top: 1px solid #000; padding-top: 2px;">
          <span>DIFERENCIA CAJA:</span>
          <span style="white-space: nowrap;">${diff === 0 ? 'Exacto ($0)' : diff > 0 ? '+' + formatPrice(diff) + ' (Sobrante)' : formatPrice(diff) + ' (Faltante)'}</span>
        </div>
      </div>

      <div class="divider"></div>

      <div style="margin-top: 6px; padding-top: 2px; text-align: center; font-size: 7.5px;">
        <div style="border-bottom: 1px solid #000; width: 60%; margin: 12px auto 3px auto;"></div>
        <p>Firma Cajero / Responsable</p>
        <p style="margin-top: 2px; font-size: 7px; color: #444;">${biz.name} POS • Sistema de Facturación</p>
      </div>
    </div>
  `;
}
