/**
 * Filtros y agregados de Ventas e ingresos (estilo Fudo): período, franja horaria, días de la semana, tipo de venta,
 * medio de pago, mesero, cajero, repartidor, mesa, canal, categoría, producto, estado y marcas (propina, descuento,
 * descuento de trabajador, factura electrónica), monto mínimo y máximo.
 */
import type { Order } from '@/store/useStore';

export type PeriodKey = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'last7' | 'last30' | 'this_year' | 'custom';
export const PERIOD_LABEL: Record<PeriodKey, string> = {
  today: 'Hoy', yesterday: 'Ayer', this_week: 'Esta semana', last_week: 'Semana pasada', this_month: 'Este mes', last_month: 'Mes pasado',
  last7: 'Últimos 7 días', last30: 'Últimos 30 días', this_year: 'Este año', custom: 'Rango personalizado',
};

export type SaleKind = 'mesa' | 'llevar' | 'mostrador' | 'domicilio';
export const SALE_KIND_LABEL: Record<SaleKind, string> = { mesa: 'Mesa (en el local)', llevar: 'Para llevar', mostrador: 'Mostrador (punto de venta)', domicilio: 'Domicilio' };
export const STATUS_FILTER_LABEL: Record<string, string> = { closed: 'Cerradas', open: 'Abiertas (en curso)', cancelled: 'Anuladas', all: 'Todas' };
export const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const PAY_LABEL: Record<string, string> = { cash: 'Efectivo', card_debit: 'Tarjeta débito', card_credit: 'Tarjeta crédito', card: 'Tarjeta', transfer: 'Transferencia / QR', platform: 'Plataforma (Rappi/DiDi)', credit: 'A crédito', mixed: 'Mixto' };
export const FLAG_LABEL: Record<string, string> = { tip: 'Con propina', discount: 'Con descuento', staff: 'Descuento de trabajador', einvoice: 'Factura electrónica', pending: 'Por cobrar' };

export interface SalesFilters {
  period: PeriodKey;
  from: string;
  to: string;
  hourFrom: string; // '' o '00'..'23'
  hourTo: string;
  weekdays: number[];
  kinds: SaleKind[];
  payments: string[];
  waiters: string[];
  cashiers: string[];
  couriers: string[];
  tables: string[];
  channels: string[];
  categories: string[]; // ids como texto
  products: string[];   // ids como texto
  status: 'closed' | 'open' | 'cancelled' | 'all';
  flags: string[];
  minTotal: string;
  maxTotal: string;
  search: string;
}

export const DEFAULT_FILTERS: SalesFilters = {
  period: 'today', from: '', to: '', hourFrom: '', hourTo: '', weekdays: [], kinds: [], payments: [], waiters: [], cashiers: [], couriers: [], tables: [],
  channels: [], categories: [], products: [], status: 'closed', flags: [], minTotal: '', maxTotal: '', search: '',
};

/* ---------------- fechas ---------------- */
const d0 = (s: string) => new Date(s + 'T00:00:00Z');
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(new Date(d0(s).getTime() + n * 86400000));

export function periodRange(f: Pick<SalesFilters, 'period' | 'from' | 'to'>, today: string): { from: string; to: string } {
  const dow = d0(today).getUTCDay(); // 0 = domingo
  const monday = addDays(today, -((dow + 6) % 7));
  const [y, m] = today.split('-').map(Number);
  switch (f.period) {
    case 'today': return { from: today, to: today };
    case 'yesterday': { const y1 = addDays(today, -1); return { from: y1, to: y1 }; }
    case 'this_week': return { from: monday, to: today };
    case 'last_week': return { from: addDays(monday, -7), to: addDays(monday, -1) };
    case 'this_month': return { from: `${today.slice(0, 7)}-01`, to: today };
    case 'last_month': { const first = `${today.slice(0, 7)}-01`; const lastDay = addDays(first, -1); return { from: `${lastDay.slice(0, 7)}-01`, to: lastDay }; }
    case 'last7': return { from: addDays(today, -6), to: today };
    case 'last30': return { from: addDays(today, -29), to: today };
    case 'this_year': return { from: `${y}-01-01`, to: today };
    case 'custom': return { from: f.from || '2000-01-01', to: f.to || today };
    default: return { from: today, to: today };
  }
  void m;
}

/* ---------------- clasificación ---------------- */
export function saleKind(o: Order): SaleKind {
  if (o.type === 'dine-in') return 'mesa';
  if (o.type === 'delivery') return 'domicilio';
  return o.label ? 'llevar' : 'mostrador';
}
export const isOpenOrder = (o: Order) => ['open', 'pending', 'preparing', 'ready', 'shipped', 'billing'].includes(o.status);
export const cashierOf = (o: Order) => o.closedBy || o.cashierName || '';

/** Lo que entró por cada medio. En pagos mixtos se reparte según los dos valores (ajustado al total de la venta). */
export function paymentParts(o: Order): Record<string, number> {
  const parts: Record<string, number> = {};
  const s = o.paymentSplit;
  if (o.paymentMethod === 'mixed' && s && s.method1) {
    const a1 = Number(s.amount1) || 0, a2 = Number(s.amount2) || 0, sum = a1 + a2;
    if (sum > 0) {
      const p1 = Math.round((o.total * a1) / sum);
      parts[s.method1] = (parts[s.method1] || 0) + p1;
      if (s.method2) parts[s.method2] = (parts[s.method2] || 0) + (o.total - p1);
      return parts;
    }
  }
  parts[o.paymentMethod] = o.total;
  return parts;
}
export const usesMethod = (o: Order, m: string) => o.paymentMethod === m || (o.paymentMethod === 'mixed' && (o.paymentSplit?.method1 === m || o.paymentSplit?.method2 === m));

/* ---------------- aplicar filtros ---------------- */
export interface FilterContext { today: string; categoryOf: Map<number, number> }

/** ¿El producto de la línea cumple los filtros de categoría y producto? */
export function itemMatches(f: SalesFilters, productId: number, ctx: FilterContext): boolean {
  if (f.products.length && !f.products.includes(String(productId))) return false;
  if (f.categories.length && !f.categories.includes(String(ctx.categoryOf.get(productId) ?? 0))) return false;
  return true;
}
export const hasItemFilter = (f: SalesFilters) => f.products.length > 0 || f.categories.length > 0;

/** Filtros que no dependen de la fecha (para armar las opciones de los desplegables en el período). */
export function inPeriod(o: Order, range: { from: string; to: string }) {
  const d = (o.createdAt || '').slice(0, 10);
  return d >= range.from && d <= range.to;
}

export function applyFilters(orders: Order[], f: SalesFilters, ctx: FilterContext): Order[] {
  const range = periodRange(f, ctx.today);
  const q = f.search.trim().toLowerCase();
  const min = f.minTotal !== '' ? Number(f.minTotal) : null;
  const max = f.maxTotal !== '' ? Number(f.maxTotal) : null;
  return orders.filter(o => {
    if (!inPeriod(o, range)) return false;
    const hour = (o.createdAt || '').slice(11, 13);
    if (f.hourFrom && hour < f.hourFrom) return false;
    if (f.hourTo && hour > f.hourTo) return false;
    if (f.weekdays.length && !f.weekdays.includes(d0((o.createdAt || '').slice(0, 10)).getUTCDay())) return false;
    if (f.status === 'closed' && (o.status === 'cancelled' || isOpenOrder(o))) return false;
    if (f.status === 'open' && !isOpenOrder(o)) return false;
    if (f.status === 'cancelled' && o.status !== 'cancelled') return false;
    if (f.kinds.length && !f.kinds.includes(saleKind(o))) return false;
    if (f.payments.length && !f.payments.some(m => usesMethod(o, m))) return false;
    if (f.waiters.length && !f.waiters.includes(o.waiterName || '—')) return false;
    if (f.cashiers.length && !f.cashiers.includes(cashierOf(o) || '—')) return false;
    if (f.couriers.length && !f.couriers.includes(o.driverName || '—')) return false;
    if (f.tables.length && !f.tables.includes(o.tableLabel || '')) return false;
    if (f.channels.length && !f.channels.includes(o.channel || 'local')) return false;
    if (hasItemFilter(f) && !o.items.some(i => itemMatches(f, i.productId, ctx))) return false;
    for (const flag of f.flags) {
      if (flag === 'tip' && !(o.tip && o.tip > 0)) return false;
      if (flag === 'discount' && !(o.discount && o.discount > 0)) return false;
      if (flag === 'staff' && o.discountKind !== 'staff') return false;
      if (flag === 'einvoice' && !(o.customer?.isElectronicInvoice || o.electronicInvoice)) return false;
      if (flag === 'pending' && o.paymentStatus !== 'pending') return false;
    }
    if (min !== null && o.total < min) return false;
    if (max !== null && o.total > max) return false;
    if (q) {
      const hay = [String(o.id), o.customer?.name, o.customer?.doc, o.customer?.phone, o.cashierName, o.closedBy, o.waiterName, o.driverName, o.tableLabel, o.label, o.notes, o.discountReason, ...o.items.map(i => i.name)]
        .filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** Cuántos filtros (además del período) están activos. */
export function activeCount(f: SalesFilters): number {
  return [f.kinds, f.payments, f.waiters, f.cashiers, f.couriers, f.tables, f.channels, f.categories, f.products, f.flags, f.weekdays].filter(a => a.length).length
    + (f.hourFrom || f.hourTo ? 1 : 0) + (f.minTotal || f.maxTotal ? 1 : 0) + (f.status !== 'closed' ? 1 : 0) + (f.search.trim() ? 1 : 0);
}

/* ---------------- agregados ---------------- */
export function summarize(list: Order[]) {
  const valid = list.filter(o => o.status !== 'cancelled');
  const methods: Record<string, number> = {};
  let sales = 0, tips = 0, discounts = 0, staffDiscounts = 0, deliveryFees = 0, people = 0, dineInTotal = 0, pending = 0, subtotal = 0;
  for (const o of valid) {
    sales += o.total; tips += o.tip || 0; discounts += o.discount || 0; deliveryFees += o.deliveryFee || 0; subtotal += o.subtotal || 0;
    if (o.discountKind === 'staff') staffDiscounts += o.discount || 0;
    if (o.type === 'dine-in') { people += o.people || 0; dineInTotal += o.total; }
    if (o.paymentStatus === 'pending') pending += o.total;
    for (const [m, v] of Object.entries(paymentParts(o))) methods[m] = (methods[m] || 0) + v;
  }
  const cancelled = list.filter(o => o.status === 'cancelled');
  return {
    sales, count: valid.length, avgTicket: valid.length ? Math.round(sales / valid.length) : 0, tips, discounts, staffDiscounts, deliveryFees, people,
    avgPerPerson: people ? Math.round(dineInTotal / people) : 0, pending, subtotal, methods,
    cancelledCount: cancelled.length, cancelledTotal: cancelled.reduce((a, o) => a + o.total, 0),
  };
}

export interface ProductRow { productId: number; name: string; categoryId: number; qty: number; total: number }
/** Ventas por producto (solo las líneas que cumplen el filtro de categoría/producto). */
export function byProduct(list: Order[], f: SalesFilters, ctx: FilterContext): ProductRow[] {
  const map = new Map<string, ProductRow>();
  for (const o of list) {
    if (o.status === 'cancelled') continue;
    for (const i of o.items) {
      if (!itemMatches(f, i.productId, ctx)) continue;
      const name = i.size ? `${i.name} (${i.size})` : i.name;
      const key = `${i.productId}|${name}`;
      const r = map.get(key) || { productId: i.productId, name, categoryId: ctx.categoryOf.get(i.productId) ?? 0, qty: 0, total: 0 };
      r.qty += i.quantity; r.total += Math.round(i.price * i.quantity);
      map.set(key, r);
    }
  }
  return [...map.values()];
}

export function groupBy<T>(list: T[], key: (x: T) => string) {
  const m = new Map<string, T[]>();
  for (const x of list) { const k = key(x); const arr = m.get(k); if (arr) arr.push(x); else m.set(k, [x]); }
  return m;
}
