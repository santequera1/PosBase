/** Tipos, etiquetas y utilidades del módulo Restaurante (mesas, para llevar, domicilios, cocina). */
import type { Order, OrderStatus, OrderType } from '@/store/useStore';

export type Channel = 'local' | 'phone' | 'whatsapp' | 'rappi' | 'didi' | 'other';
export type TableShape = 'square' | 'round' | 'rect';
export type TableState = 'free' | 'occupied' | 'billing';

export interface RestaurantModules { tables: boolean; counter: boolean; delivery: boolean; kitchen: boolean }
export interface RestaurantConfig {
  modules: RestaurantModules;
  tipPercent: number;
  tipDineIn: boolean;
  tipCounter: boolean;
  tipDelivery: boolean;
  deliveryFee: number;
  deliveryTimes: number[];
  requireOpenShift: boolean;
  autoPrintKitchen: boolean;
  channels: Array<{ id: Channel; label: string }>;
  stations: string[];
  staff: { waiters: StaffMember[]; couriers: StaffMember[] };
}
export interface StaffMember { id: number; name: string; position: string }
export interface RestaurantTable {
  id: number; roomId: number; label: string; shape: TableShape; seats: number; x: number; y: number; w: number; h: number;
  state?: TableState;
  order?: { id: number; status: OrderStatus; people: number; waiterName: string; total: number; since: string; items: number; unsent: number; label?: string } | null;
}
export interface Room { id: number; name: string; sortOrder: number; tables: RestaurantTable[] }
export interface KitchenTicket {
  key: string; orderId: number; batch: number; type: OrderType; status: OrderStatus; label?: string; customerName: string; tableLabel?: string; people: number;
  waiterName?: string; orderNotes?: string; channel: Channel; sentAt: string; kitchenStatus: 'new' | 'preparing' | 'ready';
  items: Array<{ id: number; name: string; size?: string; flavors?: string; quantity: number; notes?: string; station: string; kitchenStatus: string; readyAt?: string }>;
}

export const TYPE_LABEL: Record<OrderType, string> = { 'dine-in': 'Mesa', pickup: 'Para llevar', delivery: 'Domicilio' };
export const TYPE_EMOJI: Record<OrderType, string> = { 'dine-in': '🍽️', pickup: '🛍️', delivery: '🛵' };
export const CHANNEL_LABEL: Record<Channel, string> = { local: 'En el local', phone: 'Teléfono', whatsapp: 'WhatsApp', rappi: 'Rappi', didi: 'DiDi Food', other: 'Otro' };
export const STATION_LABEL: Record<string, string> = { cocina: 'Cocina', barra: 'Barra', none: 'No se prepara' };

export const STATUS_LABEL: Record<string, string> = {
  open: 'Cuenta abierta', pending: 'Pendiente', preparing: 'En preparación', ready: 'Listo', shipped: 'Enviado', delivered: 'Entregado', billing: 'Pidiendo la cuenta', cancelled: 'Anulado',
};
export function statusLabel(o: Pick<Order, 'type' | 'status'>): string {
  if (o.status === 'ready') return o.type === 'delivery' ? 'Listo para enviar' : o.type === 'pickup' ? 'Listo para recoger' : 'Listo para servir';
  if (o.status === 'delivered') return o.type === 'delivery' ? 'Entregado' : o.type === 'pickup' ? 'Recogido' : 'Cerrada';
  return STATUS_LABEL[o.status] || o.status;
}
export const STATUS_CLASS: Record<string, string> = {
  open: 'bg-sky-100 text-sky-800', pending: 'bg-amber-100 text-amber-800', preparing: 'bg-orange-100 text-orange-800', ready: 'bg-emerald-100 text-emerald-800',
  shipped: 'bg-violet-100 text-violet-800', delivered: 'bg-gray-100 text-gray-700', billing: 'bg-rose-100 text-rose-800', cancelled: 'bg-red-100 text-red-700',
};
export const ACTIVE_STATUSES: OrderStatus[] = ['open', 'pending', 'preparing', 'ready', 'shipped', 'billing'];
export const isActive = (o: Pick<Order, 'status'>) => (ACTIVE_STATUSES as string[]).includes(o.status);

/** Nombre corto para tableros y cocina: "Mesa 4", "Brayan", "rappi#123"... */
export function orderTitle(o: Order): string {
  if (o.type === 'dine-in') return `Mesa ${o.tableLabel || o.tableNumber || '?'}`;
  return o.label || (o.customer?.name && o.customer.name !== 'Consumidor Final' ? o.customer.name : `Pedido #${o.id}`);
}

/** Minutos transcurridos desde una marca de tiempo del servidor (hora de Colombia, sin zona). */
export function minutesSince(ts?: string): number {
  if (!ts) return 0;
  const t = new Date(ts.replace(' ', 'T'));
  const nowCo = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  return Math.max(0, Math.floor((nowCo.getTime() - t.getTime()) / 60000));
}
export function elapsedLabel(ts?: string): string {
  const m = minutesSince(ts);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}
export function elapsedClass(ts: string | undefined, warn = 20, danger = 40): string {
  const m = minutesSince(ts);
  return m >= danger ? 'text-red-600' : m >= warn ? 'text-amber-700' : 'text-emerald-700';
}

export const PAYMENT_LABEL: Record<string, string> = {
  cash: 'Efectivo', card_debit: 'T. Débito', card_credit: 'T. Crédito', card: 'Tarjeta', transfer: 'Transferencia / QR', platform: 'Plataforma (Rappi/DiDi)', credit: 'A crédito', mixed: 'Mixto',
};
export const PAYMENT_METHODS: Array<{ id: string; label: string; short: string }> = [
  { id: 'cash', label: 'Efectivo', short: 'Efectivo' },
  { id: 'card_debit', label: 'Tarjeta débito', short: 'T. Débito' },
  { id: 'card_credit', label: 'Tarjeta crédito', short: 'T. Crédito' },
  { id: 'transfer', label: 'Transferencia / QR / Nequi', short: 'QR / Nequi' },
  { id: 'platform', label: 'Plataforma (Rappi, DiDi: paga la app)', short: 'Plataforma' },
  { id: 'credit', label: 'A crédito (queda por cobrar)', short: 'A crédito' },
];
