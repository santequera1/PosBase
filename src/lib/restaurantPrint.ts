/** Tickets del módulo Restaurante: comanda de cocina y precuenta (control de mesa). Se imprimen con printThermal(). */
import type { Order, OrderItem } from '@/store/useStore';
import { useStore } from '@/store/useStore';
import { formatPrice } from '@/lib/format';
import { orderTitle, TYPE_LABEL, CHANNEL_LABEL, STATION_LABEL, PRINT_STATIONS, type Channel, type KitchenTicket, type StationPrinter } from '@/lib/restaurant';
import { printThermal } from '@/lib/thermalPrint';

const esc = (s: any) => String(s ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string));
const nowLabel = () => new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Comanda: solo lo que cocina necesita, en letra grande. Con `station` se imprime solo esa estación (cocina o barra) con su título. */
export function generateKitchenTicketHtml(order: Order, items: OrderItem[], batch?: number, station?: string): string {
  const title = orderTitle(order);
  const extra = order.type === 'dine-in' ? `${order.people || 0} personas${order.waiterName ? ` · ${order.waiterName}` : ''}` : order.type === 'delivery' ? 'DOMICILIO' : 'PARA LLEVAR';
  const stationTitle = station && STATION_LABEL[station] ? ` ${STATION_LABEL[station].toUpperCase()}` : '';
  return `
    <div class="ticket" style="width: 50mm; max-width: 50mm;">
      <div class="text-center">
        <p class="font-bold" style="font-size: 12px;">COMANDA${stationTitle}${batch ? ` #${batch}` : ''}</p>
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

type PrintCfg = { kitchenPrintMode?: 'single' | 'station'; stationPrinters?: Record<string, StationPrinter> } | null | undefined;

/**
 * Imprime la comanda según la configuración: una sola con todo, o una por estación (cocina y barra) con sus copias.
 * Cada trabajo se envía por separado para que, en el diálogo de impresión, se pueda elegir la impresora de cada estación
 * (o salga sola en la impresora predeterminada del equipo si el navegador imprime sin diálogo). Devuelve cuántas se imprimieron.
 */
export async function printKitchenTickets(order: Order, items: OrderItem[], batch: number | undefined, cfg: PrintCfg): Promise<number> {
  const printable = items.filter(i => (i.station || 'cocina') !== 'none');
  if (!printable.length) return 0;
  if (!cfg || cfg.kitchenPrintMode !== 'station') {
    await printThermal(generateKitchenTicketHtml(order, printable, batch), `Comanda-${order.id}-${batch || ''}`);
    return 1;
  }
  let jobs = 0;
  for (const st of PRINT_STATIONS) {
    const p = cfg.stationPrinters?.[st];
    if (p && p.enabled === false) continue;
    const list = printable.filter(i => (i.station || 'cocina') === st);
    if (!list.length) continue;
    const copies = Math.min(3, Math.max(1, p?.copies || 1));
    for (let c = 0; c < copies; c++) { await printThermal(generateKitchenTicketHtml(order, list, batch, st), `Comanda-${st}-${order.id}-${batch || ''}`); jobs++; }
  }
  return jobs;
}

/** Comanda desde el monitor de cocina: el ticket ya trae solo los productos de la estación que se está viendo. */
export function kitchenTicketFromKds(t: KitchenTicket, station?: string): string {
  const order = { id: t.orderId, type: t.type, status: t.status, tableLabel: t.tableLabel, label: t.label, people: t.people, waiterName: t.waiterName, notes: t.orderNotes || '', customer: { name: t.customerName }, items: [] } as unknown as Order;
  const items = t.items.map(i => ({ id: i.id, productId: 0, name: i.name, size: i.size, flavors: i.flavors, quantity: i.quantity, price: 0, notes: i.notes, station: i.station })) as unknown as OrderItem[];
  return generateKitchenTicketHtml(order, items, t.batch, station || undefined);
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
