import { useCallback, useEffect, useState } from 'react';
import { Bike, Phone, MapPin, MessageCircle, Banknote, CheckCircle2, Navigation, RefreshCw, Clock, StickyNote, Smartphone, ArrowLeftRight, CreditCard, PackageCheck, Info } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useStore, type Order } from '@/store/useStore';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import { elapsedLabel, PAYMENT_LABEL } from '@/lib/restaurant';

const toDue = (o: Order) => (o.paymentStatus === 'paid' || o.paymentMethod === 'platform' ? 0 : (o.amountDue ?? o.total));
const waPhone = (p?: string) => { const d = String(p || '').replace(/\D/g, ''); return d.length === 10 ? '57' + d : d; };

/** Pantalla del repartidor (celular): sus pedidos asignados con datos del cliente y lo que debe cobrar. */
const CourierPage = () => {
  const user = useStore(s => s.user);
  const orders = useStore(s => s.orders);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [delivering, setDelivering] = useState<Order | null>(null);

  const load = useCallback(async () => {
    try { setData(await api.getMyDeliveries()); } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  // Se actualiza cuando llega un cambio de pedido por el socket y cada 20 segundos
  const sig = orders.filter(o => o.type === 'delivery').map(o => `${o.id}:${o.status}:${o.driverId || ''}:${o.paymentStatus}`).join('|');
  useEffect(() => { load(); }, [sig, load]);
  useEffect(() => { const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  const act = async (o: Order, action: 'shipped' | 'delivered', body?: any) => {
    try { await api.courierAction(o.id, action, body); toast.success(action === 'shipped' ? 'Pedido en camino' : 'Pedido entregado'); setDelivering(null); load(); } catch (e: any) { toast.error(e.message); }
  };

  if (loading && !data) return <p className="p-6 text-sm text-muted-foreground">Cargando tus domicilios...</p>;
  if (data && !data.linked) return (
    <div className="max-w-md mx-auto p-6 text-center space-y-2 font-sans">
      <Bike size={32} className="mx-auto text-brand-primary" />
      <h2 className="font-display font-bold text-lg text-brand-dark">Tu usuario no está vinculado como repartidor</h2>
      <p className="text-sm text-muted-foreground">Pídele al administrador que en Configuración → Usuarios te asigne el perfil <b>Domiciliario</b>.</p>
    </div>
  );

  const active: Order[] = data?.active || [];
  const delivered: Order[] = data?.delivered || [];
  return (
    <div className="max-w-xl mx-auto space-y-3 font-sans pb-6" data-testid="courier-page">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-display font-bold text-lg text-brand-dark flex items-center gap-2"><Bike size={20} /> Mis domicilios</h2>
          <p className="text-xs text-muted-foreground">{user?.name} · se actualiza solo</p>
        </div>
        <button onClick={() => { setLoading(true); load(); }} className="w-10 h-10 rounded-xl border border-border bg-white flex items-center justify-center" title="Actualizar"><RefreshCw size={16} className={cn(loading && 'animate-spin')} /></button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-card rounded-xl border border-border p-2.5 text-center"><p className="text-[10px] font-semibold uppercase text-muted-foreground">Por entregar</p><p className="font-display font-bold text-xl text-brand-dark">{active.length}</p></div>
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-2.5 text-center"><p className="text-[10px] font-semibold uppercase text-amber-800">Por cobrar</p><p className="font-display font-bold text-lg text-amber-800">{formatPrice(data?.cashToCollect || 0)}</p></div>
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-2.5 text-center"><p className="text-[10px] font-semibold uppercase text-emerald-800">Efectivo hoy</p><p className="font-display font-bold text-lg text-emerald-800">{formatPrice(data?.cashCollected || 0)}</p></div>
      </div>

      {active.length === 0 && <div className="bg-card rounded-2xl border border-border p-8 text-center text-muted-foreground"><PackageCheck size={30} className="mx-auto mb-2 text-emerald-500" /><p className="text-sm">No tienes pedidos asignados en este momento.</p></div>}

      {active.map(o => {
        const due = toDue(o);
        const addr = [o.customer.address, o.customer.address2, o.customer.neighborhood].filter(Boolean).join(', ');
        const changeFor = o.cashReceived && o.cashReceived > due ? o.cashReceived : 0;
        return (
          <div key={o.id} className="bg-card rounded-2xl border-2 border-brand-primary/15 shadow-card overflow-hidden" data-courier-order={o.id}>
            <div className="px-4 py-2.5 bg-brand-card flex items-center justify-between gap-2">
              <p className="font-bold text-brand-dark">Pedido #{o.id}</p>
              <span className="text-[11px] font-semibold flex items-center gap-1 text-brand-muted"><Clock size={12} /> {elapsedLabel(o.createdAt)}{o.estimatedMinutes ? ` / ${o.estimatedMinutes} min` : ''} · {o.status === 'shipped' ? 'En camino' : o.status === 'ready' ? 'Listo para salir' : 'En preparación'}</span>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <p className="text-lg font-bold text-brand-dark leading-tight">{o.customer.name || 'Cliente'}</p>
                {addr && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`} target="_blank" rel="noreferrer" className="mt-1 flex items-start gap-1.5 text-sm text-brand-dark underline decoration-dotted"><MapPin size={15} className="mt-0.5 shrink-0 text-brand-primary" /> {addr}</a>}
                {o.customer.phone && (
                  <div className="mt-2 flex gap-2">
                    <a href={`tel:${o.customer.phone}`} className="flex-1 py-2 rounded-xl border border-border bg-white text-sm font-semibold flex items-center justify-center gap-1.5"><Phone size={15} /> {o.customer.phone}</a>
                    <a href={`https://wa.me/${waPhone(o.customer.phone)}`} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold flex items-center gap-1.5"><MessageCircle size={15} /> WhatsApp</a>
                  </div>
                )}
              </div>

              {due > 0 ? (
                <div className="rounded-xl bg-amber-100 border-2 border-amber-300 px-3 py-2.5">
                  <p className="text-[11px] font-bold uppercase text-amber-900 flex items-center gap-1"><Banknote size={13} /> Cobrar al entregar</p>
                  <p className="font-display font-bold text-2xl text-amber-900">{formatPrice(due)}</p>
                  <p className="text-xs text-amber-900">{PAYMENT_LABEL[o.paymentMethod] || 'Efectivo'}{changeFor ? ` · paga con ${formatPrice(changeFor)}: lleva ${formatPrice(changeFor - due)} de cambio` : ''}</p>
                </div>
              ) : (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5">
                  <p className="text-sm font-bold text-emerald-800 flex items-center gap-1.5"><CheckCircle2 size={15} /> {o.paymentMethod === 'platform' ? 'Lo paga la plataforma: no cobrar' : `Ya pagado (${PAYMENT_LABEL[o.paymentMethod] || o.paymentMethod}): no cobrar`}</p>
                  <p className="text-xs text-emerald-800">Total del pedido {formatPrice(o.total)}</p>
                </div>
              )}

              <div className="text-xs text-brand-dark space-y-0.5">
                {o.items.map((i, k) => <p key={k}><b>{i.quantity}x</b> {i.name}{i.notes ? <span className="text-muted-foreground"> · {i.notes}</span> : ''}</p>)}
                {o.notes && <p className="mt-1 text-amber-800 bg-amber-50 rounded-lg px-2 py-1 flex items-start gap-1"><StickyNote size={12} className="mt-0.5 shrink-0" /> {o.notes}</p>}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => act(o, 'shipped')} disabled={o.status === 'shipped'} className="py-3 rounded-xl border border-brand-primary/30 bg-white text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-40"><Navigation size={16} /> {o.status === 'shipped' ? 'En camino' : 'Voy en camino'}</button>
                <button onClick={() => (due > 0 ? setDelivering(o) : act(o, 'delivered'))} className="py-3 rounded-xl gradient-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-1.5"><PackageCheck size={16} /> Entregado</button>
              </div>
            </div>
          </div>
        );
      })}

      {delivered.length > 0 && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <p className="px-4 py-2 text-xs font-bold text-brand-dark bg-brand-card">Entregados hoy ({delivered.length})</p>
          {delivered.map(o => (
            <div key={o.id} className="px-4 py-2 border-t border-border flex items-center justify-between text-xs">
              <span><b>#{o.id}</b> · {o.customer.name}</span>
              <span className="font-semibold">{formatPrice(o.total)} · {PAYMENT_LABEL[o.paymentMethod] || o.paymentMethod}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground flex items-start gap-1"><Info size={12} className="mt-0.5 shrink-0" /> Al marcar "Entregado" en un pedido contra entrega, queda cobrado con el medio que elijas y suma a tu cuadre de efectivo.</p>

      {delivering && <DeliverModal order={delivering} onClose={() => setDelivering(null)} onConfirm={body => act(delivering, 'delivered', body)} />}
    </div>
  );
};

const DeliverModal = ({ order, onClose, onConfirm }: { order: Order; onClose: () => void; onConfirm: (b: any) => void }) => {
  const due = toDue(order);
  const [method, setMethod] = useState<'cash' | 'transfer' | 'card'>('cash');
  const [received, setReceived] = useState(order.cashReceived && order.cashReceived > due ? String(order.cashReceived) : '');
  const r = Math.round(Number(received) || 0);
  const opts: Array<['cash' | 'transfer' | 'card', string, any]> = [['cash', 'Efectivo', Banknote], ['transfer', 'Transferencia / Nequi', ArrowLeftRight], ['card', 'Datáfono', CreditCard]];
  return (
    <div className="fixed inset-0 !m-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-sm p-5 space-y-3 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h4 className="font-bold text-brand-dark">Entregar pedido #{order.id}</h4>
        <p className="text-2xl font-display font-bold text-brand-dark">{formatPrice(due)}</p>
        <div className="grid gap-2">
          {opts.map(([k, l, Icon]) => <button key={k} onClick={() => setMethod(k)} className={cn('py-2.5 px-3 rounded-xl border text-sm font-semibold flex items-center gap-2', method === k ? 'border-brand-primary bg-brand-button text-brand-on-button' : 'border-border')}><Icon size={16} /> {l}</button>)}
        </div>
        {method === 'cash' && (
          <div>
            <label className="text-xs font-medium text-muted-foreground">¿Con cuánto pagó? (opcional)</label>
            <input type="number" inputMode="numeric" value={received} onChange={e => setReceived(e.target.value)} placeholder={String(due)} className="w-full mt-1 px-3 py-2.5 rounded-xl border border-input text-lg font-mono" />
            {r > due && <p className="text-sm font-bold text-emerald-700 mt-1 flex items-center gap-1"><Smartphone size={14} /> Cambio: {formatPrice(r - due)}</p>}
          </div>
        )}
        <button onClick={() => onConfirm({ method, cashReceived: method === 'cash' ? r : 0 })} disabled={method === 'cash' && r > 0 && r < due} className="w-full py-3 rounded-xl gradient-primary text-primary-foreground font-bold disabled:opacity-40">Confirmar entrega y cobro</button>
      </div>
    </div>
  );
};

export default CourierPage;
