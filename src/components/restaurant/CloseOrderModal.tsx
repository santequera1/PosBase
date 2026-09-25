import { useMemo, useState } from 'react';
import { Banknote, CreditCard, QrCode, Smartphone, Handshake, Split, Printer, CheckCircle2 } from 'lucide-react';
import type { Order } from '@/store/useStore';
import { useStore } from '@/store/useStore';
import { api } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Modal, Chip, INPUT, LABEL } from '@/components/common/Primitives';
import { PAYMENT_LABEL } from '@/lib/restaurant';
import { printThermal, generateSalesTicketHtml } from '@/lib/thermalPrint';

const METHODS = [
  { id: 'cash', label: 'Efectivo', icon: Banknote },
  { id: 'card_debit', label: 'T. Débito', icon: CreditCard },
  { id: 'card_credit', label: 'T. Crédito', icon: CreditCard },
  { id: 'transfer', label: 'QR / Nequi', icon: QrCode },
  { id: 'platform', label: 'Plataforma', icon: Smartphone },
  { id: 'credit', label: 'A crédito', icon: Handshake },
  { id: 'mixed', label: 'Mixto', icon: Split },
];

/** Cobro de una cuenta: descuento con motivo, propina, uno o dos medios de pago, vueltas. */
export const CloseOrderModal = ({ order, onClose, onClosed }: { order: Order; onClose: () => void; onClosed: (o: Order) => void }) => {
  const restaurant = useStore(s => s.restaurant);
  const tipEnabled = restaurant ? (order.type === 'dine-in' ? restaurant.tipDineIn : order.type === 'pickup' ? restaurant.tipCounter : restaurant.tipDelivery) : false;
  const tipPct = restaurant?.tipPercent ?? 10;
  const [discount, setDiscount] = useState(String(order.discount || ''));
  const [discountReason, setDiscountReason] = useState(order.discountReason || '');
  const [tipMode, setTipMode] = useState<'none' | 'suggested' | 'custom'>(order.tip ? 'custom' : tipEnabled ? 'suggested' : 'none');
  const [tipCustom, setTipCustom] = useState(String(order.tip || ''));
  const [tipTo, setTipTo] = useState<'common' | 'waiter'>(order.waiterId ? 'waiter' : 'common');
  const [method, setMethod] = useState<string>(order.paymentMethod && order.paymentMethod !== 'mixed' ? order.paymentMethod : 'cash');
  const [cashReceived, setCashReceived] = useState('');
  const [m1, setM1] = useState('cash'); const [a1, setA1] = useState('');
  const [m2, setM2] = useState('transfer'); const [a2, setA2] = useState('');
  const [markDelivered, setMarkDelivered] = useState(order.type !== 'delivery' || order.status === 'shipped');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<Order | null>(null);

  const base = order.subtotal + (order.deliveryFee || 0);
  const disc = Math.min(base, Math.max(0, Math.round(Number(discount) || 0)));
  const total = base - disc;
  const tip = tipMode === 'none' ? 0 : tipMode === 'suggested' ? Math.round((total * tipPct) / 100) : Math.max(0, Math.round(Number(tipCustom) || 0));
  const due = total + tip;
  const received = Math.round(Number(cashReceived) || 0);
  const change = method === 'cash' && received > due ? received - due : 0;
  const splitSum = (Math.round(Number(a1) || 0)) + (Math.round(Number(a2) || 0));
  const splitOk = method !== 'mixed' || (splitSum === due && Number(a1) > 0 && Number(a2) > 0 && m1 !== m2);
  const quick = useMemo(() => [due, Math.ceil(due / 5000) * 5000, Math.ceil(due / 10000) * 10000, Math.ceil(due / 50000) * 50000].filter((v, i, arr) => v >= due && arr.indexOf(v) === i).slice(0, 4), [due]);

  const submit = async () => {
    setSaving(true); setError('');
    try {
      const closed = await api.closeRestaurantOrder(order.id, {
        paymentMethod: method, discount: disc, discountReason, tip, tipTo, markDelivered,
        cashReceived: method === 'cash' ? (received || due) : undefined,
        paymentSplit: method === 'mixed' ? { method1: m1, amount1: Math.round(Number(a1) || 0), method2: m2, amount2: Math.round(Number(a2) || 0) } : undefined,
      });
      setDone(closed);
      onClosed(closed);
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };
  const print = () => { if (done) printThermal(generateSalesTicketHtml(done), `Factura-${done.id}`); };

  if (done) {
    return (
      <Modal title="Cobro registrado" onClose={onClose}>
        <div className="text-center space-y-2 py-2">
          <CheckCircle2 size={44} className="mx-auto text-emerald-600" />
          <p className="text-2xl font-bold text-brand-dark">{formatPrice(done.amountDue || done.total)}</p>
          <p className="text-xs text-muted-foreground">{PAYMENT_LABEL[done.paymentMethod] || done.paymentMethod}{done.paymentStatus === 'pending' ? ' · queda por cobrar' : ''}{done.cashChange ? ` · vueltas ${formatPrice(done.cashChange)}` : ''}</p>
          {done.tip ? <p className="text-xs text-muted-foreground">Propina {formatPrice(done.tip)} registrada en Personal.</p> : null}
        </div>
        <div className="flex gap-2">
          <button onClick={print} className="flex-1 py-2.5 rounded-xl border border-border bg-white text-sm font-semibold text-brand-dark flex items-center justify-center gap-1.5"><Printer size={15} /> Imprimir factura</button>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold">Listo</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Cobrar · ${order.type === 'dine-in' ? `Mesa ${order.tableLabel}` : order.label || order.customer.name}`} onClose={onClose} wide>
      <div className="grid sm:grid-cols-5 gap-4 text-sm">
        <div className="sm:col-span-2 space-y-3">
          <div className="rounded-xl bg-brand-card border border-brand-accent/40 p-3 space-y-1 text-xs">
            <div className="flex justify-between"><span>Productos</span><span>{formatPrice(order.subtotal)}</span></div>
            {order.deliveryFee ? <div className="flex justify-between"><span>Envío</span><span>{formatPrice(order.deliveryFee)}</span></div> : null}
            {disc > 0 && <div className="flex justify-between text-red-700"><span>Descuento</span><span>− {formatPrice(disc)}</span></div>}
            <div className="flex justify-between font-semibold border-t border-border pt-1"><span>Total</span><span>{formatPrice(total)}</span></div>
            {tip > 0 && <div className="flex justify-between"><span>Propina</span><span>+ {formatPrice(tip)}</span></div>}
            <div className="flex justify-between text-base font-bold text-brand-dark border-t border-border pt-1"><span>A pagar</span><span>{formatPrice(due)}</span></div>
          </div>
          <div>
            <label className={LABEL}>Descuento</label>
            <div className="flex gap-2">
              <input type="number" min={0} value={discount} onChange={e => setDiscount(e.target.value)} placeholder="0" className={cn(INPUT, 'font-mono w-28')} />
              <input value={discountReason} onChange={e => setDiscountReason(e.target.value)} placeholder="Motivo (obligatorio si hay descuento)" className={INPUT} />
            </div>
          </div>
          {tipEnabled && (
            <div>
              <label className={LABEL}>Propina</label>
              <div className="flex flex-wrap gap-1.5">
                <Chip active={tipMode === 'none'} onClick={() => setTipMode('none')}>Sin propina</Chip>
                <Chip active={tipMode === 'suggested'} onClick={() => setTipMode('suggested')}>{tipPct}% sugerida · {formatPrice(Math.round((total * tipPct) / 100))}</Chip>
                <Chip active={tipMode === 'custom'} onClick={() => setTipMode('custom')}>Otro valor</Chip>
              </div>
              {tipMode === 'custom' && <input type="number" min={0} value={tipCustom} onChange={e => setTipCustom(e.target.value)} className={cn(INPUT, 'font-mono mt-1.5 w-32')} placeholder="Valor" />}
              {tip > 0 && order.waiterId && (
                <div className="flex gap-1.5 mt-1.5"><Chip active={tipTo === 'waiter'} onClick={() => setTipTo('waiter')}>Para {order.waiterName}</Chip><Chip active={tipTo === 'common'} onClick={() => setTipTo('common')}>Propina común</Chip></div>
              )}
            </div>
          )}
        </div>
        <div className="sm:col-span-3 space-y-3">
          <div>
            <label className={LABEL}>Medio de pago</label>
            <div className="grid grid-cols-4 gap-1.5">
              {METHODS.map(m => (
                <button key={m.id} onClick={() => setMethod(m.id)} className={cn('py-2.5 px-1 rounded-xl text-[11px] font-bold flex flex-col items-center gap-1 border transition-all', method === m.id ? 'bg-brand-button text-brand-on-button border-brand-primary shadow-md' : 'bg-white text-brand-primary border-brand-primary/15 hover:bg-brand-card')}>
                  <m.icon size={17} />{m.label}
                </button>
              ))}
            </div>
          </div>
          {method === 'cash' && (
            <div>
              <label className={LABEL}>Recibido</label>
              <div className="flex flex-wrap gap-1.5 mb-1.5">{quick.map(v => <Chip key={v} active={received === v} onClick={() => setCashReceived(String(v))}>{formatPrice(v)}</Chip>)}</div>
              <input type="number" min={0} value={cashReceived} onChange={e => setCashReceived(e.target.value)} placeholder={String(due)} className={cn(INPUT, 'font-mono')} />
              {received > 0 && received < due && <p className="text-[11px] text-red-600 mt-1">Faltan {formatPrice(due - received)}</p>}
              {change > 0 && <p className="text-sm font-bold text-emerald-700 mt-1">Vueltas: {formatPrice(change)}</p>}
            </div>
          )}
          {method === 'mixed' && (
            <div className="grid grid-cols-2 gap-2">
              <div><label className={LABEL}>Medio 1</label><select value={m1} onChange={e => setM1(e.target.value)} className={INPUT}>{METHODS.filter(m => !['mixed', 'credit'].includes(m.id)).map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select><input type="number" min={0} value={a1} onChange={e => { setA1(e.target.value); setA2(String(Math.max(0, due - (Number(e.target.value) || 0)))); }} placeholder="Valor" className={cn(INPUT, 'font-mono mt-1')} /></div>
              <div><label className={LABEL}>Medio 2</label><select value={m2} onChange={e => setM2(e.target.value)} className={INPUT}>{METHODS.filter(m => !['mixed', 'credit'].includes(m.id)).map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select><input type="number" min={0} value={a2} onChange={e => setA2(e.target.value)} placeholder="Valor" className={cn(INPUT, 'font-mono mt-1')} /></div>
              <p className={cn('col-span-2 text-[11px]', splitOk ? 'text-emerald-700' : 'text-red-600')}>{splitOk ? 'Los dos medios suman el total.' : `Deben sumar ${formatPrice(due)} (van ${formatPrice(splitSum)}).`}</p>
            </div>
          )}
          {method === 'platform' && <p className="text-[11px] text-muted-foreground">La app (Rappi, DiDi) paga después; queda registrado como venta por plataforma, no entra a la caja en efectivo.</p>}
          {method === 'credit' && <p className="text-[11px] text-amber-700">Queda pendiente de pago. Aparecerá en Historial → Por cobrar hasta que se registre el pago.</p>}
          {order.type === 'delivery' && (
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={markDelivered} onChange={e => setMarkDelivered(e.target.checked)} /> Marcar también como entregado</label>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button onClick={submit} disabled={saving || !splitOk || (disc > 0 && !discountReason.trim()) || (method === 'cash' && received > 0 && received < due)} className="w-full py-3 rounded-xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-40">
            {saving ? 'Registrando...' : `Cobrar ${formatPrice(due)}`}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default CloseOrderModal;
