import { Clock, MapPin, Phone, Bike, User, UserCheck, Banknote } from 'lucide-react';
import { PROFILE_LABEL } from '@/lib/permissions';
import type { Order } from '@/store/useStore';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import { orderTitle, statusLabel, STATUS_CLASS, elapsedLabel, elapsedClass, minutesSince, CHANNEL_LABEL, PAYMENT_LABEL, type Channel } from '@/lib/restaurant';

export interface CardAction { label: string; icon?: any; onClick: () => void; primary?: boolean; danger?: boolean; disabled?: boolean; title?: string }

/** Tarjeta de pedido para los tableros de "Para llevar" y "Domicilios". */
export const OrderCard = ({ order, actions, children }: { order: Order; actions: CardAction[]; children?: any }) => {
  const late = order.type === 'delivery' && order.estimatedMinutes && order.status !== 'delivered' && minutesSince(order.createdAt) > order.estimatedMinutes;
  // Abono (p. ej. la transferencia que confirmó el bot): solo falta el saldo
  const deposit = order.deposit?.amount || 0;
  const unpaid = order.paymentStatus !== 'paid' && order.paymentMethod !== 'platform';
  const pending = unpaid ? Math.max(0, (order.amountDue ?? order.total) - deposit) : 0;
  const coveredByDeposit = unpaid && deposit > 0 && pending === 0;
  // Efectivo que el domiciliario cobra en la puerta (aunque la caja ya lo haya registrado) y con cuánto paga el cliente
  const cashAtDoor = order.type !== 'delivery' ? 0 : unpaid ? (order.paymentMethod === 'cash' ? pending : 0) : order.paymentMethod === 'cash' ? order.total + (order.tip || 0) : 0;
  const payWith = cashAtDoor > 0 && (order.cashReceived || 0) > cashAtDoor ? order.cashReceived! : 0;
  const changeDue = order.changeDue || 0;
  const itemsText = order.items.slice(0, 3).map(i => `${i.quantity}x ${i.name}`).join(' · ') + (order.items.length > 3 ? ` · +${order.items.length - 3}` : '');
  return (
    <div className={cn('bg-card rounded-xl border shadow-card p-3 space-y-2 min-w-0 max-w-full overflow-hidden', late ? 'border-red-300' : 'border-border')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-sm text-brand-dark truncate">{orderTitle(order)} <span className="text-[11px] font-normal text-muted-foreground">#{order.id}</span></p>
          <div className="flex flex-wrap items-center gap-1 mt-0.5">
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-semibold', STATUS_CLASS[order.status])}>{statusLabel(order)}</span>
            {order.channel && order.channel !== 'local' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-card text-brand-primary font-semibold border border-brand-accent/40">{CHANNEL_LABEL[order.channel as Channel]}</span>}
            <span className={cn('text-[10px] font-semibold flex items-center gap-0.5', elapsedClass(order.createdAt, order.estimatedMinutes ? order.estimatedMinutes * 0.7 : 15, order.estimatedMinutes || 30))}><Clock size={10} /> {elapsedLabel(order.createdAt)}{order.estimatedMinutes ? ` / ${order.estimatedMinutes} min` : ''}</span>
            {late && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">Va tarde</span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-brand-primary">{formatPrice(order.amountDue ?? order.total)}</p>
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-semibold', order.paymentStatus === 'paid' || coveredByDeposit ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800')}>{order.paymentStatus === 'paid' ? `Pagado · ${PAYMENT_LABEL[order.paymentMethod] || order.paymentMethod}` : order.paymentMethod === 'platform' ? 'Paga la app' : coveredByDeposit ? 'Pagado con abono' : deposit > 0 ? `Falta ${formatPrice(pending)}` : 'Por cobrar'}</span>
        </div>
      </div>
      {order.type === 'delivery' && (
        <div className="text-[11px] text-muted-foreground space-y-0.5">
          {/* El barrio va primero y no se corta (lo pidió la caja de Wonka's para ver a dónde va sin abrir el pedido) */}
          <p className="flex items-center gap-1 text-brand-dark min-w-0" title={[order.customer.neighborhood, order.customer.address, order.customer.address2].filter(Boolean).join(' · ')}>
            <MapPin size={11} className="shrink-0" />
            {order.customer.neighborhood && <b className="font-bold shrink-0 max-w-[60%] truncate" data-order-neighborhood>{order.customer.neighborhood}</b>}
            {order.customer.neighborhood && order.customer.address && <span className="shrink-0 text-muted-foreground">·</span>}
            <span className="truncate">{order.customer.address}{order.customer.address2 ? `, ${order.customer.address2}` : ''}</span>
          </p>
          <p className="flex items-center gap-3"><span className="flex items-center gap-1"><User size={11} /> {order.customer.name}</span>{order.customer.phone && <span className="flex items-center gap-1"><Phone size={11} /> {order.customer.phone}</span>}</p>
          {order.driverName && <p className="flex items-center gap-1 font-semibold text-brand-primary"><Bike size={11} /> {order.driverName}</p>}
        </div>
      )}
      {changeDue > 0 && (
        <div className="rounded-lg bg-emerald-600 text-white px-2 py-1.5 flex items-center justify-between gap-2" data-order-change={order.id}>
          <span className="text-[11px] font-bold flex items-center gap-1 min-w-0"><Banknote size={13} className="shrink-0" /> <span className="truncate">{order.changeMethod === 'transfer' ? 'Devolver por transferencia' : order.type === 'delivery' ? 'Enviar de vuelto' : 'Dar de vuelto'}</span></span>
          <span className="text-sm font-bold shrink-0">{formatPrice(changeDue)}</span>
        </div>
      )}
      {changeDue > 0 && <p className="text-[10px] text-muted-foreground -mt-1">Transfirió {formatPrice((order.amountDue ?? order.total) + changeDue)} y el pedido vale {formatPrice(order.amountDue ?? order.total)}</p>}
      {payWith > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-2 py-1 flex items-center justify-between gap-2 text-[11px] text-amber-900" data-order-paywith={order.id}>
          <span>Paga con <b>{formatPrice(payWith)}</b></span><span className="font-bold">Vuelto {formatPrice(payWith - cashAtDoor)}</span>
        </div>
      )}
      {order.type === 'pickup' && order.customer.phone && <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Phone size={11} /> {order.customer.phone}</p>}
      {order.createdBy && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1" data-order-taken-by>
          <UserCheck size={11} className="shrink-0" /> <span className="truncate">Tomó el pedido: <b className="text-brand-dark font-semibold">{order.createdBy}</b>{order.createdByProfile && PROFILE_LABEL[order.createdByProfile] ? ` · ${PROFILE_LABEL[order.createdByProfile]}` : ''}</span>
        </p>
      )}
      <p className="text-[11px] text-brand-dark/80 truncate" title={order.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}>{order.items.length ? itemsText : 'Sin productos todavía'}</p>
      {order.notes && <p className="text-[11px] text-amber-800 bg-amber-50 rounded-lg px-2 py-1">📝 {order.notes}</p>}
      {children}
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {actions.map(a => (
            <button key={a.label} onClick={a.onClick} disabled={a.disabled} title={a.title || a.label}
              className={cn('px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 disabled:opacity-40', a.primary ? 'bg-brand-button text-brand-on-button' : a.danger ? 'border border-red-200 text-red-600 bg-white' : 'border border-border bg-white text-brand-dark hover:bg-brand-card')}>
              {a.icon && <a.icon size={12} />}{a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default OrderCard;
