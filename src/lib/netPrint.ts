/**
 * Impresión "inteligente": si en Configuración → Impresoras está activa la impresión en red, el documento lo arma el
 * servidor y lo imprime el agente del restaurante en la impresora por IP (sirve desde celulares y tablets).
 * Si no, o si falla, se usa la impresión del navegador de siempre.
 */
import { toast } from 'sonner';
import { useStore, type Order, type OrderItem } from '@/store/useStore';
import { api } from '@/lib/api';
import { printThermal, generateSalesTicketHtml } from '@/lib/thermalPrint';
import { generatePreBillHtml, printKitchenTickets } from '@/lib/restaurantPrint';

export const netPrintOn = () => useStore.getState().restaurant?.printMode === 'agent';

async function viaNet(send: () => Promise<any>, fallback: () => any, what: string) {
  if (!netPrintOn()) return fallback();
  try {
    await send();
    toast.success(`${what} enviada a la impresora`);
  } catch (e: any) {
    // Con impresión en red no se abre el diálogo del navegador (en un celular no hay impresora): se avisa qué falta
    toast.error(e.message || 'No se pudo enviar a la impresora', { duration: 7000 });
  }
}

export const printReceipt = (order: Order) =>
  viaNet(() => api.netPrint('receipt', { orderId: order.id }), () => printThermal(generateSalesTicketHtml(order), `Factura-${order.id}`), 'Factura');

export const printPreBill = (order: Order, tipPct = 0) =>
  viaNet(() => api.netPrint('prebill', { orderId: order.id, tipPct }), () => printThermal(generatePreBillHtml(order, tipPct), `Precuenta-${order.id}`), 'Precuenta');

export const printKitchen = (order: Order, items: OrderItem[], batch: number | undefined, cfg: any) =>
  viaNet(() => api.netPrint('kitchen', { orderId: order.id, batch }), () => printKitchenTickets(order, items, batch, cfg), 'Comanda');

export const printKitchenBatch = (orderId: number, batch: number, fallback: () => any) =>
  viaNet(() => api.netPrint('kitchen', { orderId, batch }), fallback, 'Comanda');

export const printShiftReport = (shiftId: number | undefined, type: 'X' | 'Z', fallback: () => any) =>
  viaNet(() => api.netPrint('shift-report', { shiftId, type }), fallback, type === 'Z' ? 'El cierre' : 'El corte');
