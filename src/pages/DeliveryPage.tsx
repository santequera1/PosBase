import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Eye, CheckCircle2, Wallet, Bike, PackageCheck, Printer, Users, Banknote, ChefHat } from 'lucide-react';
import { toast } from 'sonner';
import { useStore, type Order } from '@/store/useStore';
import { api } from '@/lib/api';
import { formatPrice, getColombiaTodayStr } from '@/lib/format';
import { cn } from '@/lib/utils';
import { INPUT, Chip, KpiCard, fmtDate } from '@/components/common/Primitives';
import { NewOrderModal } from '@/components/restaurant/NewOrderModal';
import { CloseOrderModal } from '@/components/restaurant/CloseOrderModal';
import { OrderCard, type CardAction } from '@/components/restaurant/OrderCard';
import { isActive, orderTitle, PAYMENT_LABEL } from '@/lib/restaurant';
import { printReceipt } from '@/lib/netPrint';
import { NiceSelect } from '@/components/ui/nice-select';

const COLUMNS: Array<{ key: string; title: string; match: (s: string) => boolean; cls: string }> = [
  { key: 'pending', title: 'Pendientes', match: s => s === 'open' || s === 'pending', cls: 'border-amber-200 bg-amber-50/50' },
  { key: 'preparing', title: 'En preparación', match: s => s === 'preparing', cls: 'border-orange-200 bg-orange-50/50' },
  { key: 'ready', title: 'Listos para enviar', match: s => s === 'ready', cls: 'border-emerald-200 bg-emerald-50/50' },
  { key: 'shipped', title: 'En camino', match: s => s === 'shipped', cls: 'border-violet-200 bg-violet-50/50' },
];
const shiftDate = (d: string, days: number) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + days); return x.toISOString().slice(0, 10); };

/** Domicilios: tablero por estado con tiempos, repartidor, cobro contra entrega y cuadre por repartidor. */
const DeliveryPage = () => {
  const navigate = useNavigate();
  const { orders, handleOrderEvent, restaurant } = useStore();
  const [tab, setTab] = useState<'board' | 'couriers'>('board');
  const [showNew, setShowNew] = useState(false);
  const [closing, setClosing] = useState<Order | null>(null);
  const [search, setSearch] = useState('');
  const today = getColombiaTodayStr();
  const couriers = restaurant?.staff.couriers || [];

  const deliveries = useMemo(() => orders.filter(o => o.type === 'delivery'), [orders]);
  const q = search.trim().toLowerCase();
  const matches = (o: Order) => !q || String(o.id).includes(q) || o.customer.name.toLowerCase().includes(q) || (o.customer.phone || '').includes(q) || (o.customer.address || '').toLowerCase().includes(q) || (o.label || '').toLowerCase().includes(q);
  const active = deliveries.filter(o => isActive(o) && matches(o));
  // Vista del tablero: columnas (tarjetas) o lista (tabla, se ven más pedidos a la vez). Se recuerda en este equipo.
  const [view, setViewState] = useState<'board' | 'list'>(() => { try { return localStorage.getItem('delivery-view') === 'list' ? 'list' : 'board'; } catch { return 'board'; } });
  const setView = (v: 'board' | 'list') => { setViewState(v); try { localStorage.setItem('delivery-view', v); } catch { /* sin almacenamiento */ } };
  const doneToday = deliveries.filter(o => o.status === 'delivered' && (o.deliveredAt || o.closedAt || o.createdAt).slice(0, 10) === today && matches(o)).sort((a, b) => (b.deliveredAt || b.createdAt).localeCompare(a.deliveredAt || a.createdAt));

  const setStatus = async (o: Order, status: string, driverId?: number) => { try { handleOrderEvent(await api.setRestaurantStatus(o.id, status, driverId)); } catch (e: any) { toast.error(e.message); } };
  // Pedido ya entregado: el repartidor se corrige como dato de la venta
  const assignDone = async (o: Order, driverId: number) => { try { handleOrderEvent(await api.editSaleDetails(o.id, { driverId: driverId || 0 })); toast.success(driverId ? 'Domiciliario asignado' : 'Domiciliario quitado'); } catch (e: any) { toast.error(e.message); } };
  const assign = async (o: Order, driverId: number) => { try { handleOrderEvent(await api.updateOrderHeader(o.id, { driverId: driverId || null })); } catch (e: any) { toast.error(e.message); } };
  const deliver = (o: Order) => { if (o.paymentStatus === 'paid') setStatus(o, 'delivered'); else setClosing(o); };
  const actionsFor = (o: Order): CardAction[] => {
    const view: CardAction = { label: o.status === 'open' ? 'Agregar productos' : 'Ver / editar', icon: Eye, onClick: () => navigate(`/cuenta/${o.id}`) };
    const print: CardAction = { label: 'Ticket', icon: Printer, onClick: () => printReceipt(o) };
    if (o.status === 'open') return [view];
    const pay: CardAction = { label: 'Cobrar', icon: Wallet, onClick: () => setClosing(o), disabled: o.paymentStatus === 'paid' };
    if (o.status === 'shipped') return [{ label: 'Entregado', icon: PackageCheck, onClick: () => deliver(o), primary: true }, pay, view, print];
    // El repartidor se elige en la lista de la tarjeta; sin él no se puede despachar (se avisa en vez de dejar el botón apagado)
    if (o.status === 'ready') return [{ label: o.driverId ? 'Enviar' : 'Enviar (elige repartidor)', icon: Bike, onClick: () => (o.driverId ? setStatus(o, 'shipped') : toast.error('Elige el repartidor en la lista "Sin repartidor" de esta tarjeta y luego toca Enviar')), primary: true }, pay, view, print];
    if (o.status === 'preparing') return [{ label: 'Listo para enviar', icon: CheckCircle2, onClick: () => setStatus(o, 'ready'), primary: true }, pay, view, print];
    return [{ label: 'A preparación', icon: ChefHat, onClick: () => setStatus(o, 'preparing'), primary: true }, pay, view, print];
  };

  return (
    <div className="space-y-4 font-sans">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-lg text-brand-dark">Domicilios</h2>
          <p className="text-xs text-muted-foreground">Clientes por teléfono con su dirección, repartidor, tiempo estimado, costo de envío y cobro contra entrega o por plataforma.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1"><Chip active={tab === 'board'} onClick={() => setTab('board')}>Tablero</Chip><Chip active={tab === 'couriers'} onClick={() => setTab('couriers')}>Repartidores</Chip></div>
          {tab === 'board' && <div className="relative"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nombre, teléfono, dirección o #" className={cn(INPUT, 'pl-8 w-60')} /></div>}
          <button onClick={() => setShowNew(true)} className="px-4 py-2 rounded-xl gradient-primary text-primary-foreground text-xs font-bold flex items-center gap-1.5 shadow-fab"><Plus size={15} /> Nuevo domicilio</button>
        </div>
      </div>

      {tab === 'board' && (
        <>
          <div className="flex justify-end"><div className="inline-flex rounded-xl border border-border bg-white p-0.5 text-xs font-semibold" data-delivery-view>
            <button onClick={() => setView('board')} className={cn('px-3 py-1.5 rounded-lg', view === 'board' ? 'bg-brand-button text-brand-on-button' : 'text-brand-dark')}>Tablero</button>
            <button onClick={() => setView('list')} className={cn('px-3 py-1.5 rounded-lg', view === 'list' ? 'bg-brand-button text-brand-on-button' : 'text-brand-dark')} data-delivery-list>Lista</button>
          </div></div>
          {view === 'list' && (
            <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden" data-delivery-table>
              <div className="px-4 py-2.5 border-b border-border bg-brand-card flex items-center justify-between"><p className="text-xs font-bold text-brand-dark">Domicilios en curso</p><span className="text-[11px] text-muted-foreground">{active.length} · {formatPrice(active.reduce((a, o) => a + o.total, 0))}</span></div>
              {active.length === 0 ? <p className="p-4 text-xs text-muted-foreground">No hay domicilios en curso.</p> : (
                <div className="overflow-x-auto"><table className="w-full text-xs">
                  <thead><tr className="text-muted-foreground bg-muted/30"><th className="text-left px-3 py-1.5">Pedido</th><th className="text-left px-3 py-1.5">Estado</th><th className="text-left px-3 py-1.5">Hora</th><th className="text-left px-3 py-1.5">Dirección</th><th className="text-left px-3 py-1.5">Repartidor</th><th className="text-left px-3 py-1.5">Pago</th><th className="text-right px-3 py-1.5">Total</th><th className="px-3 py-1.5" /></tr></thead>
                  <tbody>
                    {[...active].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(o => {
                      const acts = actionsFor(o);
                      const main = acts[0];
                      const col = COLUMNS.find(c => c.match(o.status));
                      return (
                        <tr key={o.id} className="border-t border-border" data-delivery-row={o.id}>
                          <td className="px-3 py-1.5 font-semibold text-brand-dark whitespace-nowrap">{orderTitle(o)} <span className="text-muted-foreground font-normal">#{o.id}</span></td>
                          <td className="px-3 py-1.5 whitespace-nowrap"><span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold border', col?.cls)}>{col?.title || o.status}</span></td>
                          <td className="px-3 py-1.5">{o.createdAt.slice(11, 16)}</td>
                          <td className="px-3 py-1.5 truncate max-w-[220px]">{o.customer.address}{o.customer.neighborhood ? ` · ${o.customer.neighborhood}` : ''}</td>
                          <td className="px-2 py-1"><NiceSelect value={o.driverId || 0} onChange={e => assign(o, Number(e.target.value))} className="px-2 py-1 rounded-lg border border-border bg-white text-[11px] min-w-[8rem]" title="Repartidor"><option value={0}>Sin repartidor</option>{couriers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</NiceSelect></td>
                          <td className="px-3 py-1.5 whitespace-nowrap">{o.paymentStatus === 'paid' ? PAYMENT_LABEL[o.paymentMethod] || o.paymentMethod : <span className="text-amber-700 font-semibold">Por cobrar{o.paymentMethod === 'cash' && o.cashReceived && o.cashReceived > o.total ? <span className="block text-[10px] font-normal">paga con {formatPrice(o.cashReceived)} · vuelto {formatPrice(o.cashReceived - o.total)}</span> : null}</span>}</td>
                          <td className="px-3 py-1.5 text-right font-semibold">{formatPrice(o.total)}</td>
                          <td className="px-2 py-1"><div className="flex gap-1 justify-end">
                            {main && <button onClick={main.onClick} disabled={main.disabled} className="px-2.5 py-1 rounded-lg bg-brand-button text-brand-on-button text-[11px] font-bold whitespace-nowrap disabled:opacity-40" data-delivery-next={o.id}>{main.label}</button>}
                            {acts.slice(1).map(a => <button key={a.label} onClick={a.onClick} disabled={a.disabled} className="px-2 py-1 rounded-lg border border-border bg-white text-[11px] font-semibold whitespace-nowrap disabled:opacity-40">{a.label}</button>)}
                          </div></td>
                        </tr>
                      );
                    })}
                  </tbody></table></div>
              )}
            </div>
          )}
          <div className={cn('grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3', view === 'list' && 'hidden')}>
            {COLUMNS.map(col => {
              const list = active.filter(o => col.match(o.status));
              return (
                <div key={col.key} className={cn('rounded-2xl border p-2.5 min-h-[220px] space-y-2 min-w-0', col.cls)}>
                  <div className="flex items-center justify-between px-1"><p className="text-xs font-bold text-brand-dark uppercase tracking-wide">{col.title}</p><span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white border border-border">{list.length}</span></div>
                  {list.length === 0 && <p className="text-[11px] text-muted-foreground text-center py-6">Nada por aquí</p>}
                  {list.map(o => (
                    <OrderCard key={o.id} order={o} actions={actionsFor(o)}>
                      {o.status !== 'delivered' && (
                        <label className="flex items-center gap-1.5 text-[11px]"><Bike size={11} className="text-brand-muted" />
                          <NiceSelect value={o.driverId || 0} onChange={e => assign(o, Number(e.target.value))} className="flex-1 px-2 py-1 rounded-lg border border-border bg-white text-[11px]" title="Repartidor">
                            <option value={0}>Sin repartidor</option>{couriers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </NiceSelect></label>
                      )}
                    </OrderCard>
                  ))}
                </div>
              );
            })}
          </div>

          <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border bg-brand-card flex items-center justify-between"><p className="text-xs font-bold text-brand-dark">Entregados hoy</p><span className="text-[11px] text-muted-foreground">{doneToday.length} · {formatPrice(doneToday.reduce((a, o) => a + o.total, 0))}</span></div>
            {doneToday.length === 0 ? <p className="p-4 text-xs text-muted-foreground">Aún no hay entregas hoy.</p> : (
              <div className="overflow-x-auto"><table className="w-full text-xs">
                <thead><tr className="text-muted-foreground bg-muted/30"><th className="text-left px-3 py-1.5">Pedido</th><th className="text-left px-3 py-1.5">Hora</th><th className="text-left px-3 py-1.5">Dirección</th><th className="text-left px-3 py-1.5">Repartidor</th><th className="text-left px-3 py-1.5">Pago</th><th className="text-right px-3 py-1.5">Envío</th><th className="text-right px-3 py-1.5">Total</th><th className="px-3 py-1.5" /></tr></thead>
                <tbody>
                  {doneToday.map(o => (
                    <tr key={o.id} className="border-t border-border">
                      <td className="px-3 py-1.5 font-semibold text-brand-dark">{orderTitle(o)} <span className="text-muted-foreground font-normal">#{o.id}</span></td>
                      <td className="px-3 py-1.5">{(o.deliveredAt || o.createdAt).slice(11, 16)}</td>
                      <td className="px-3 py-1.5 truncate max-w-[240px]">{o.customer.address}{o.customer.neighborhood ? ` · ${o.customer.neighborhood}` : ''}</td>
                      <td className="px-2 py-1"><NiceSelect value={o.driverId || 0} onChange={e => assignDone(o, Number(e.target.value))} className="px-2 py-1 rounded-lg border border-border bg-white text-[11px] min-w-[8rem]" title="Domiciliario" data-done-driver={o.id}><option value={0}>— Sin asignar</option>{couriers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</NiceSelect></td>
                      <td className="px-3 py-1.5">{o.paymentStatus === 'paid' ? PAYMENT_LABEL[o.paymentMethod] || o.paymentMethod : <span className="text-amber-700 font-semibold">Por cobrar</span>}</td>
                      <td className="px-3 py-1.5 text-right">{formatPrice(o.deliveryFee || 0)}</td>
                      <td className="px-3 py-1.5 text-right font-semibold">{formatPrice(o.total)}</td>
                      <td className="px-3 py-1.5 text-right">{o.paymentStatus !== 'paid' ? <button onClick={() => setClosing(o)} className="text-brand-primary font-semibold hover:underline">Cobrar</button> : <button onClick={() => printReceipt(o)} className="text-brand-primary hover:underline flex items-center gap-1 ml-auto"><Printer size={12} /> Ticket</button>}</td>
                    </tr>
                  ))}
                </tbody></table></div>
            )}
          </div>
        </>
      )}

      {tab === 'couriers' && <CouriersReport today={today} />}

      {showNew && <NewOrderModal type="delivery" onClose={() => setShowNew(false)} onCreated={o => { setShowNew(false); handleOrderEvent(o); navigate(`/cuenta/${o.id}`); }} />}
      {closing && <CloseOrderModal order={closing} onClose={() => setClosing(null)} onClosed={o => handleOrderEvent(o)} />}
    </div>
  );
};

/* ---------- Cuadre por repartidor ---------- */
const CouriersReport = ({ today }: { today: string }) => {
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [stats, setStats] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => { setLoading(true); api.getRestaurantStats(from, to).then(setStats).catch(() => {}).finally(() => setLoading(false)); setDetail(null); }, [from, to]);
  const openDetail = async (driverId: number | null) => { if (!driverId) return; try { setDetail(await api.getCourierReport(driverId, from, to)); } catch (e: any) { toast.error(e.message); } };
  const presets = [['Hoy', today, today], ['Ayer', shiftDate(today, -1), shiftDate(today, -1)], ['7 días', shiftDate(today, -6), today], ['Este mes', today.slice(0, 7) + '-01', today]];
  const dl = stats?.byType?.find((t: any) => t.type === 'delivery');
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {presets.map(([l, f, t]) => <Chip key={l} active={from === f && to === t} onClick={() => { setFrom(f); setTo(t); }}>{l}</Chip>)}
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={cn(INPUT, 'w-auto py-1.5 text-xs')} /><span className="text-xs text-muted-foreground">a</span><input type="date" value={to} onChange={e => setTo(e.target.value)} className={cn(INPUT, 'w-auto py-1.5 text-xs')} />
      </div>
      {dl && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="Domicilios" value={String(dl.count)} sub={`${fmtDate(from)} – ${fmtDate(to)}`} />
          <KpiCard label="Ventas por domicilio" value={formatPrice(dl.total)} />
          <KpiCard label="Costos de envío cobrados" value={formatPrice(dl.deliveryFees)} />
          <KpiCard label="Por cobrar" value={formatPrice(dl.pending)} className={dl.pending > 0 ? 'bg-amber-50 border-amber-200' : ''} />
        </div>
      )}
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-brand-card"><p className="text-xs font-bold text-brand-dark flex items-center gap-1.5"><Users size={13} /> Por repartidor · toca uno para ver el detalle y cuadrarle la caja</p></div>
        {loading ? <p className="p-4 text-xs text-muted-foreground">Cargando...</p> : !stats?.byCourier?.length ? <p className="p-4 text-xs text-muted-foreground">Sin domicilios en el período.</p> : (
          <table className="w-full text-xs">
            <thead><tr className="text-muted-foreground bg-muted/30"><th className="text-left px-3 py-1.5">Repartidor</th><th className="text-right px-3 py-1.5">Pedidos</th><th className="text-right px-3 py-1.5">Entregados</th><th className="text-right px-3 py-1.5">Ventas</th><th className="text-right px-3 py-1.5">Envíos</th><th className="text-right px-3 py-1.5">Efectivo que entrega</th><th className="text-right px-3 py-1.5">Plataforma</th><th className="text-right px-3 py-1.5">Por cobrar</th></tr></thead>
            <tbody>
              {stats.byCourier.map((c: any) => (
                <tr key={c.courier} onClick={() => openDetail(c.driverId)} className={cn('border-t border-border', c.driverId && 'cursor-pointer hover:bg-brand-button/5')}>
                  <td className="px-3 py-1.5 font-semibold text-brand-dark">{c.courier}</td><td className="px-3 py-1.5 text-right">{c.orders}</td><td className="px-3 py-1.5 text-right">{c.delivered}</td><td className="px-3 py-1.5 text-right">{formatPrice(c.total)}</td><td className="px-3 py-1.5 text-right">{formatPrice(c.deliveryFees)}</td><td className="px-3 py-1.5 text-right font-bold text-emerald-700">{formatPrice(c.cashCollected)}</td><td className="px-3 py-1.5 text-right">{formatPrice(c.platform)}</td><td className="px-3 py-1.5 text-right text-amber-700">{formatPrice(c.pending)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {detail && (
        <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-brand-card flex items-center justify-between"><p className="text-xs font-bold text-brand-dark flex items-center gap-1.5"><Banknote size={13} /> {detail.driver?.name}: {detail.totals.orders} pedidos · entrega en efectivo {formatPrice(detail.totals.cash)} · envíos {formatPrice(detail.totals.deliveryFees)}</p><button onClick={() => setDetail(null)} className="text-[11px] text-brand-primary">Cerrar</button></div>
          <table className="w-full text-xs">
            <thead><tr className="text-muted-foreground bg-muted/30"><th className="text-left px-3 py-1.5">Pedido</th><th className="text-left px-3 py-1.5">Fecha</th><th className="text-left px-3 py-1.5">Cliente / dirección</th><th className="text-left px-3 py-1.5">Pago</th><th className="text-right px-3 py-1.5">Envío</th><th className="text-right px-3 py-1.5">Total</th><th className="text-right px-3 py-1.5">Efectivo</th></tr></thead>
            <tbody>{detail.orders.map((o: any) => (
              <tr key={o.id} className="border-t border-border"><td className="px-3 py-1.5 font-mono">#{o.id}</td><td className="px-3 py-1.5">{fmtDate(o.createdAt)} {o.createdAt.slice(11, 16)}</td><td className="px-3 py-1.5 truncate max-w-[260px]">{o.customer} · {o.address}{o.neighborhood ? ` (${o.neighborhood})` : ''}</td><td className="px-3 py-1.5">{o.paymentStatus === 'paid' ? PAYMENT_LABEL[o.paymentMethod] || o.paymentMethod : 'Por cobrar'}</td><td className="px-3 py-1.5 text-right">{formatPrice(o.deliveryFee)}</td><td className="px-3 py-1.5 text-right">{formatPrice(o.total)}</td><td className="px-3 py-1.5 text-right font-semibold">{formatPrice(o.cash)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default DeliveryPage;
