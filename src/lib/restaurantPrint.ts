/** Tickets del módulo Restaurante: comanda de cocina y precuenta (control de mesa). Se imprimen con printThermal(). */
import type { Order, OrderItem } from '@/store/useStore';
import { useStore } from '@/store/useStore';
import { formatPrice } from '@/lib/format';
import { orderTitle, TYPE_LABEL, CHANNEL_LABEL, type Channel } from '@/lib/restaurant';

const esc = (s: any) => String(s ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string));
const nowLabel = () => new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Comanda: solo lo que cocina necesita, en letra grande. */
export function generateKitchenTicketHtml(order: Order, items: OrderItem[], batch?: number): string {
  const title = orderTitle(order);
  const extra = order.type === 'dine-in' ? `${order.people || 0} personas${order.waiterName ? ` · ${order.waiterName}` : ''}` : order.type === 'delivery' ? 'DOMICILIO' : 'PARA LLEVAR';
  return `
    <div class="ticket" style="width: 50mm; max-width: 50mm;">
      <div class="text-center">
        <p class="font-bold" style="font-size: 12px;">COMANDA${batch ? ` #${batch}` : ''}</p>
        <p class="font-bold" style="font-size: 13px;">${esc(title)}</p>
        <p style="font-size: 8px;">${esc(extra)} · Pedido #${order.id}</p>
        <p style="font-size: 8px;">${nowLabel()}</p>
      </div>
      <div class="divider"></div>
      ${items.map(i => `
        <div style="margin: 4px 0;">
          <div class="row" style="font-size: 11px; font-weight: bold;"><span style="width: 22px;">${i.quantity}x</span><span style="flex: 1; text-align: left;">${esc(i.name)}</span></div>
          ${i.flavors ? `<div style="font-size: 9px; padding-left: 22px;">• ${esc(i.flavors)}</div>` : ''}
          ${i.notes ? `<div style="font-size: 9.5px; padding-left: 22px; font-weight: bold;">➜ ${esc(i.notes)}</div>` : ''}
        </div>`).join('')}
      ${order.notes ? `<div class="divider"></div><div style="font-size: 9px; font-weight: bold;">NOTA: ${esc(order.notes)}</div>` : ''}
      <div class="divider"></div>
    </div>`;
}

/** Precuenta / control de mesa: detalle de consumo con propina sugerida, sin valor fiscal. */
export function generatePreBillHtml(order: Order, tipPercent = 0): string {
  const s = useStore.getState();
  const total = order.total;
  const tip = tipPercent > 0 ? Math.round((total * tipPercent) / 100) : 0;
  const people = order.people || 0;
  return `
    <div class="ticket" style="width: 50mm; max-width: 50mm;">
      <div class="text-center">
        <p class="font-bold" style="font-size: 10px;">${esc(s.businessName)}</p>
        <p style="font-size: 7.5px;">${esc(s.businessAddress)}${s.businessPhone ? ` · Tel: ${esc(s.businessPhone)}` : ''}</p>
        <p class="font-bold" style="font-size: 9px; margin-top: 3px; border: 1px solid #000; display: inline-block; padding: 1px 6px;">PRECUENTA · ${esc(TYPE_LABEL[order.type].toUpperCase())}</p>
        <p style="font-size: 8px; margin-top: 2px;">${esc(orderTitle(order))} · Pedido #${order.id}</p>
        <p style="font-size: 7.5px;">${nowLabel()}${people ? ` · ${people} personas` : ''}${order.waiterName ? ` · Atiende: ${esc(order.waiterName)}` : ''}</p>
      </div>
      <div class="divider"></div>
      ${order.items.map(i => `
        <div class="row" style="font-size: 8.5px; margin: 2px 0;">
          <span style="width: 18px; font-weight: bold;">${i.quantity}x</span>
          <span style="flex: 1; text-align: left; padding-left: 2px;">${esc(i.name)}</span>
          <span style="width: 50px; text-align: right; font-weight: bold; white-space: nowrap;">${formatPrice(i.price * i.quantity)}</span>
        </div>`).join('')}
      <div class="divider"></div>
      <div style="font-size: 8.5px;">
        <div class="row"><span>Subtotal:</span><span>${formatPrice(order.subtotal)}</span></div>
        ${order.deliveryFee ? `<div class="row"><span>Envío:</span><span>${formatPrice(order.deliveryFee)}</span></div>` : ''}
        ${order.discount ? `<div class="row"><span>Descuento:</span><span>-${formatPrice(order.discount)}</span></div>` : ''}
        <div class="row font-bold" style="font-size: 10px; border-top: 1px solid #000; padding-top: 2px; margin-top: 2px;"><span>TOTAL:</span><span>${formatPrice(total)}</span></div>
        ${tip > 0 ? `<div class="row" style="font-size: 8px; margin-top: 2px;"><span>Propina sugerida (${tipPercent}%):</span><span>${formatPrice(tip)}</span></div><div class="row font-bold" style="font-size: 9px;"><span>Total con propina:</span><span>${formatPrice(total + tip)}</span></div><p style="font-size: 6.5px; text-align: center; margin-top: 2px;">La propina es voluntaria (Ley 1935 de 2018).</p>` : ''}
        ${people > 1 ? `<div class="row" style="font-size: 7.5px; margin-top: 2px;"><span>Por persona (${people}):</span><span>${formatPrice(Math.ceil((total + tip) / people))}</span></div>` : ''}
      </div>
      <div class="dashed" style="margin-top: 5px;"></div>
      <p class="text-center" style="font-size: 7px; margin-top: 3px;">Documento informativo · no es factura de venta</p>
    </div>`;
}

export const channelLabel = (c?: string) => CHANNEL_LABEL[(c || 'local') as Channel] || c || '';
