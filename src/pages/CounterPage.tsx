import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Eye, CheckCircle2, Wallet, PackageCheck, Printer, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { useStore, type Order } from '@/store/useStore';
import { api } from '@/lib/api';
import { formatPrice, getColombiaTodayStr } from '@/lib/format';
import { cn } from '@/lib/utils';
import { INPUT } from '@/components/common/Primitives';
import { NewOrderModal } from '@/components/restaurant/NewOrderModal';
import { CloseOrderModal } from '@/components/restaurant/CloseOrderModal';
import { OrderCard, type CardAction } from '@/components/restaurant/OrderCard';
import { isActive, orderTitle } from '@/lib/restaurant';
import { printThermal, generateSalesTicketHtml } from '@/lib/thermalPrint';

const COLUMNS: Array<{ key: string; title: string; match: (s: string) => boolean; cls: string }> = [
  { key: 'pending', title: 'Pendientes', match: s => s === 'open' || s === 'pending', cls: 'border-amber-200 bg-amber-50/50' },
  { key: 'preparing', title: 'En preparación', match: s => s === 'preparing', cls: 'border-orange-200 bg-orange-50/50' },
  { key: 'ready', title: 'Listos para recoger', match: s => s === 'ready', cls: 'border-emerald-200 bg-emerald-50/50' },
];

/** Para llevar: pedidos a nombre de alguien que quedan abiertos hasta que pasan a recogerlos. */
const CounterPage = () => {
  const navigate = useNavigate();
  const { orders, handleOrderEvent } = useStore();
  const [showNew, setShowNew] = useState(false);
  const [closing, setClosing] = useState<Order | null>(null);
  const [search, setSearch] = useState('');
  const today = getColombiaTodayStr();

  const pickups = useMemo(() => orders.filter(o => o.type === 'pickup'), [orders]);
  const q = search.trim().toLowerCase();
  const matches = (o: Order) => !q || String(o.id).includes(q) || (o.label || '').toLowerCase().includes(q) || o.customer.name.toLowerCase().includes(q) || (o.customer.phone || '').includes(q);
  const active = pickups.filter(o => isActive(o) && matches(o));
  const doneToday = pickups.filter(o => o.status === 'delivered' && (o.deliveredAt || o.closedAt || o.createdAt).slice(0, 10) === today && matches(o)).sort((a, b) => (b.deliveredAt || b.createdAt).localeCompare(a.deliveredAt || a.createdAt)).slice(0, 12);

  const setStatus = async (o: Order, status: string) => { try { handleOrderEvent(await api.setRestaurantStatus(o.id, status)); } catch (e: any) { toast.error(e.message); } };
  const deliver = (o: Order) => { if (o.paymentStatus === 'paid') setStatus(o, 'delivered'); else setClosing(o); };
  const actionsFor = (o: Order): CardAction[] => {
    const view: CardAction = { label: o.status === 'open' ? 'Agregar productos' : 'Ver / editar', icon: Eye, onClick: () => navigate(`/cuenta/${o.id}`) };
    if (o.status === 'open') return [view];
    const pay: CardAction = { label: 'Cobrar', icon: Wallet, onClick: () => setClosing(o), disabled: o.paymentStatus === 'paid' };
    if (o.status === 'ready') return [{ label: 'Entregar', icon: PackageCheck, onClick: () => deliver(o), primary: true }, pay, view];
    return [{ label: 'Listo', icon: CheckCircle2, onClick: () => setStatus(o, 'ready'), primary: true }, pay, view];
  };

  return (
    <div className="space-y-4 font-sans">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-lg text-brand-dark">Para llevar</h2>
          <p className="text-xs text-muted-foreground">Pedidos a nombre del cliente: se preparan, quedan listos y se entregan cuando pasan por ellos. Cobro por adelantado o al recoger.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, etiqueta o #" className={cn(INPUT, 'pl-8 w-56')} /></div>
          <button onClick={() => setShowNew(true)} className="px-4 py-2 rounded-xl gradient-primary text-primary-foreground text-xs font-bold flex items-center gap-1.5 shadow-fab"><Plus size={15} /> Nuevo pedido</button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        {COLUMNS.map(col => {
          const list = active.filter(o => col.match(o.status));
          return (
            <div key={col.key} className={cn('rounded-2xl border p-2.5 min-h-[220px] space-y-2', col.cls)}>
              <div className="flex items-center justify-between px-1"><p className="text-xs font-bold text-brand-dark uppercase tracking-wide">{col.title}</p><span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white border border-border">{list.length}</span></div>
              {list.length === 0 && <p className="text-[11px] text-muted-foreground text-center py-6">Nada por aquí</p>}
              {list.map(o => <OrderCard key={o.id} order={o} actions={actionsFor(o)} />)}
            </div>
          );
        })}
      </div>

      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-brand-card flex items-center justify-between"><p className="text-xs font-bold text-brand-dark flex items-center gap-1.5"><ShoppingBag size={13} /> Entregados hoy</p><span className="text-[11px] text-muted-foreground">{doneToday.length} pedido(s)</span></div>
        {doneToday.length === 0 ? <p className="p-4 text-xs text-muted-foreground">Aún no hay entregas hoy.</p> : (
          <table className="w-full text-xs">
            <thead><tr className="text-muted-foreground bg-muted/30"><th className="text-left px-3 py-1.5">Pedido</th><th className="text-left px-3 py-1.5">Hora</th><th className="text-left px-3 py-1.5">Productos</th><th className="text-right px-3 py-1.5">Total</th><th className="px-3 py-1.5" /></tr></thead>
            <tbody>
              {doneToday.map(o => (
                <tr key={o.id} className="border-t border-border">
                  <td className="px-3 py-1.5 font-semibold text-brand-dark">{orderTitle(o)} <span className="text-muted-foreground font-normal">#{o.id}</span></td>
                  <td className="px-3 py-1.5">{(o.deliveredAt || o.createdAt).slice(11, 16)}</td>
                  <td className="px-3 py-1.5 truncate max-w-[280px]">{o.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}</td>
                  <td className="px-3 py-1.5 text-right font-semibold">{formatPrice(o.total)}</td>
                  <td className="px-3 py-1.5 text-right"><button onClick={() => printThermal(generateSalesTicketHtml(o), `Factura-${o.id}`)} className="text-brand-primary hover:underline flex items-center gap-1 ml-auto"><Printer size={12} /> Ticket</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNew && <NewOrderModal type="pickup" onClose={() => setShowNew(false)} onCreated={o => { setShowNew(false); handleOrderEvent(o); navigate(`/cuenta/${o.id}`); }} />}
      {closing && <CloseOrderModal order={closing} onClose={() => setClosing(null)} onClosed={o => handleOrderEvent(o)} />}
    </div>
  );
};

export default CounterPage;
