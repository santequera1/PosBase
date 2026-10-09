import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChefHat, Receipt, Wallet, MoreHorizontal, Minus, Plus, Trash2, StickyNote, ArrowLeftRight, Merge, Ban, Printer, Pencil, ShoppingBag, Utensils, Split } from 'lucide-react';
import { toast } from 'sonner';
import { useStore, type Order, type OrderItem } from '@/store/useStore';
import { api } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Modal, Chip, INPUT, LABEL } from '@/components/common/Primitives';
import { ProductPicker } from '@/components/restaurant/ProductPicker';
import { CloseOrderModal } from '@/components/restaurant/CloseOrderModal';
import { orderTitle, statusLabel, STATUS_CLASS, elapsedLabel, CHANNEL_LABEL, TYPE_LABEL, type Channel, isActive } from '@/lib/restaurant';
import { printKitchenTickets } from '@/lib/restaurantPrint';
import { printPreBill, printKitchen, netPrintOn } from '@/lib/netPrint';
import { canDo } from '@/lib/permissions';
import { NiceSelect } from '@/components/ui/nice-select';

const backPath = (o: Order) => (o.type === 'dine-in' ? '/tables' : o.type === 'pickup' ? '/counter' : '/delivery');
const sameLine = (a: OrderItem, b: OrderItem) => a.productId === b.productId && (a.size || '') === (b.size || '') && (a.notes || '') === (b.notes || '') && (a.seat || 0) === (b.seat || 0);
/** Insignia de la persona en cuentas separadas */
const SeatBadge = ({ seat, onClick, title }: { seat?: number | null; onClick?: () => void; title?: string }) => (
  <button type="button" onClick={onClick} disabled={!onClick} title={title} className={cn('shrink-0 min-w-[26px] h-6 px-1.5 rounded-md text-[10px] font-bold border', seat ? 'bg-sky-100 text-sky-800 border-sky-200' : 'bg-white text-brand-muted border-dashed border-border', !onClick && 'cursor-default')} data-seat-badge={seat || 0}>{seat ? `P${seat}` : '—'}</button>
);

/** Cuenta abierta: se agregan productos, se mandan comandas a cocina, precuenta y cobro. Sirve para mesas, para llevar y domicilios. */
const OpenOrderPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const orderId = Number(id);
  const { restaurant, orders, user } = useStore();
  const [order, setOrder] = useState<Order | null>(null);
  const [draft, setDraft] = useState<OrderItem[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mobileView, setMobileView] = useState<'catalog' | 'account'>('catalog');
  const [showClose, setShowClose] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showMove, setShowMove] = useState<'move' | 'merge' | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [noteEdit, setNoteEdit] = useState<number | null>(null);
  // Escribiendo una nota en el celular: se ocultan totales y botones para que el teclado no tape el campo
  const [typing, setTyping] = useState(false);
  // Cuentas separadas: elegir productos → cobrar esa parte aparte
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitChild, setSplitChild] = useState<Order | null>(null);
  const splitPaid = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef<OrderItem[]>([]);
  const lastBatch = useRef<{ batch: number; items: OrderItem[] } | null>(null);

  const load = useCallback(async () => {
    try {
      const o = await api.getOrder(orderId);
      setOrder(o);
      const unsent = o.items.filter((i: OrderItem) => !i.batch);
      setDraft(unsent); draftRef.current = unsent;
    } catch (e: any) { setError(e.message); }
  }, [orderId]);
  useEffect(() => { load(); }, [load]);

  // Cambios que llegan por socket (cocina marcó listo, otro cajero cobró...)
  const live = orders.find(o => o.id === orderId);
  useEffect(() => {
    if (!live || !order) return;
    if (live.status !== order.status || live.items.filter(i => i.batch).length !== order.items.filter(i => i.batch).length || live.paymentStatus !== order.paymentStatus) {
      setOrder(prev => (prev ? { ...live, items: [...live.items.filter(i => i.batch), ...draftRef.current] } : live));
    }
  }, [live]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = (items: OrderItem[]) => {
    setDraft(items); draftRef.current = items;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try { const o = await api.setOrderItems(orderId, items); setOrder(prev => (prev ? { ...o, items: [...o.items.filter((i: OrderItem) => i.batch), ...draftRef.current] } : o)); }
      catch (e: any) { toast.error(e.message); }
    }, 350);
  };
  // Cuentas separadas desde el principio: a quién va lo que se agrega (0 = para la mesa / sin separar)
  const [seat, setSeat] = useState(0);
  const [seatCount, setSeatCount] = useState(2);
  const canCancel = user?.role === 'admin' || canDo(user, 'cancel_orders');
  const addItem = (item: OrderItem) => {
    item = { ...item, seat: seat || null };
    const cur = draftRef.current;
    const idx = cur.findIndex(i => sameLine(i, item));
    const next = idx >= 0 ? cur.map((i, k) => (k === idx ? { ...i, quantity: i.quantity + 1 } : i)) : [...cur, item];
    persist(next);
  };
  const changeQty = (idx: number, delta: number) => {
    const next = draftRef.current.map((i, k) => (k === idx ? { ...i, quantity: i.quantity + delta } : i)).filter(i => i.quantity > 0);
    persist(next);
  };
  const setNote = (idx: number, notes: string) => persist(draftRef.current.map((i, k) => (k === idx ? { ...i, notes } : i)));
  // Corregir un producto ya enviado: quitar una unidad o toda la línea (queda como adición cancelada)
  const removeSent = async (item: OrderItem, quantity?: number) => {
    if (!item.id) return;
    const what = quantity && quantity < item.quantity ? `1 de ${item.quantity} × "${item.name}"` : `"${item.name}"`;
    const reason = window.prompt(`Quitar ${what} de la cuenta (ya se envió a cocina).\nMotivo (opcional): ej. el cliente cambió de opinión`, '');
    if (reason === null) return;
    try { const o = await api.removeSentItem(orderId, item.id, quantity, reason || undefined); setOrder({ ...o, items: [...o.items.filter((i: OrderItem) => i.batch), ...draftRef.current] }); toast.success('Producto corregido'); } catch (e: any) { toast.error(e.message); }
  };
  const cycleSeat = (idx: number) => persist(draftRef.current.map((i, k) => (k === idx ? { ...i, seat: ((i.seat || 0) + 1) > seatCount ? null : (i.seat || 0) + 1 } : i)));

  const flush = async () => { if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; await api.setOrderItems(orderId, draftRef.current); } };
  const send = async () => {
    if (!order) return;
    setBusy(true);
    try {
      await flush();
      const r = await api.sendToKitchen(orderId);
      setOrder(r.order); setDraft([]); draftRef.current = [];
      if (r.batch) {
        lastBatch.current = { batch: r.batch, items: r.items };
        toast.success(`Comanda #${r.batch} enviada a cocina (${r.items.length} producto${r.items.length === 1 ? '' : 's'})`);
        // Impresión del navegador: no se espera a que cierren el diálogo para volver a la lista
        if (restaurant?.autoPrintKitchen && !netPrintOn()) Promise.resolve(printKitchenTickets(r.order, r.items, r.batch, restaurant)).catch(() => {});
      } else toast.info('No hay productos nuevos para enviar');
      if (r.batch && netPrintOn() && !r.printed) toast.warning('La comanda no se imprimió: no hay impresora de cocina configurada (Configuración → Impresoras).', { duration: 7000 });
      // Enviada la comanda, se vuelve a la lista (mesas, para llevar o domicilios)
      navigate(backPath(order));
    } catch (e: any) { toast.error(e.message); }
    setBusy(false);
  };
  // Salir de la cuenta sin cobrar: lo que no se ha enviado queda guardado en la cuenta
  const leave = async () => {
    try { await flush(); } catch { /* se reintenta al volver */ }
    if (order && draftRef.current.length) toast.info(`${draftRef.current.length} producto(s) quedaron guardados sin enviar a cocina`);
    if (order) navigate(backPath(order));
  };
  const printLastBatch = () => { if (order && lastBatch.current) printKitchen(order, lastBatch.current.items, lastBatch.current.batch, restaurant); };
  const prebill = async () => {
    if (!order) return;
    setBusy(true);
    try {
      await flush();
      if (draftRef.current.length) { const r = await api.sendToKitchen(orderId); setDraft([]); draftRef.current = []; setOrder(r.order); }
      const o = order.type === 'dine-in' ? await api.setRestaurantStatus(orderId, 'billing') : await api.getOrder(orderId);
      setOrder(o);
      await printPreBill(o, restaurant?.tipDineIn && o.type === 'dine-in' ? restaurant.tipPercent : 0);
      // Impresa la precuenta, la mesa queda "pidiendo la cuenta" y se vuelve al plano
      if (o.type === 'dine-in') navigate(backPath(o));
    } catch (e: any) { toast.error(e.message); }
    setBusy(false);
  };
  const cancel = async () => {
    if (!order || !window.confirm('¿Anular esta cuenta? Si tenía productos enviados, el inventario se devuelve.')) return;
    try { await api.setRestaurantStatus(orderId, 'cancelled'); toast.success('Cuenta anulada'); navigate(backPath(order)); } catch (e: any) { toast.error(e.message); }
  };
  const openClose = async () => { await flush(); setShowClose(true); };
  const openSplit = async () => {
    try { await flush(); const o = await api.getOrder(orderId); const unsent = o.items.filter((i: OrderItem) => !i.batch); setOrder(o); setDraft(unsent); draftRef.current = unsent; setSplitOpen(true); }
    catch (e: any) { toast.error(e.message); }
  };
  const afterSplit = async () => {
    const child = splitChild;
    setSplitChild(null);
    if (child && !splitPaid.current) { try { await api.unsplitOrder(child.id); toast.info('Cuenta separada sin cobrar: los productos volvieron a la mesa'); } catch (e: any) { toast.error(e.message); } }
    splitPaid.current = false;
    load();
  };

  const sentGroups = useMemo(() => {
    if (!order) return [] as Array<{ batch: number; items: OrderItem[] }>;
    const map = new Map<number, OrderItem[]>();
    for (const i of order.items.filter(x => x.batch)) { const b = i.batch as number; map.set(b, [...(map.get(b) || []), i]); }
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([batch, items]) => ({ batch, items }));
  }, [order]);
  const subtotal = (order ? order.items.filter(i => i.batch).reduce((a, i) => a + i.price * i.quantity, 0) : 0) + draft.reduce((a, i) => a + i.price * i.quantity, 0);
  // Cuentas separadas: subtotal de cada persona
  const allLines = [...(order ? order.items.filter(i => i.batch) : []), ...draft];
  const anySeat = allLines.some(i => i.seat);
  const seatTotals = Object.entries(allLines.reduce((acc: Record<number, number>, i) => { const k = i.seat || 0; acc[k] = (acc[k] || 0) + i.price * i.quantity; return acc; }, {})).map(([k, v]) => [Number(k), v] as [number, number]).sort((a, b) => (a[0] || 99) - (b[0] || 99));
  useEffect(() => { const max = allLines.reduce((m, i) => Math.max(m, i.seat || 0), 0); if (max > seatCount) setSeatCount(max); }, [allLines.length]);
  const total = Math.max(0, subtotal + (order?.deliveryFee || 0) - (order?.discount || 0));

  if (error) return <div className="p-6 text-sm text-red-600">{error} <button onClick={() => navigate(-1)} className="underline ml-2">Volver</button></div>;
  if (!order) return <div className="p-6 text-sm text-muted-foreground">Cargando cuenta...</div>;
  const closed = !isActive(order);

  return (
    <div className="flex flex-col lg:flex-row h-full w-full bg-brand-bg text-brand-primary overflow-hidden" data-account-page>
      {/* Catálogo */}
      <div className={cn('flex-1 min-h-0 flex-col lg:h-full overflow-hidden border-r border-brand-primary/10', mobileView === 'catalog' ? 'flex' : 'hidden lg:flex')}>
        <div className="flex items-center gap-2 px-3 py-2 bg-brand-surface text-brand-on-dark shrink-0">
          <button onClick={leave} className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center" title="Volver sin cobrar"><ArrowLeft size={18} /></button>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-sm truncate">{orderTitle(order)} <span className="font-normal opacity-70">· {TYPE_LABEL[order.type]}{order.channel && order.channel !== 'local' ? ` · ${CHANNEL_LABEL[order.channel as Channel]}` : ''}</span></p>
            <p className="text-[11px] opacity-70 truncate">{order.type === 'dine-in' ? `${order.people || 0} personas${order.waiterName ? ` · ${order.waiterName}` : ''}` : order.type === 'delivery' ? `${order.customer.address || ''}${order.customer.neighborhood ? ` · ${order.customer.neighborhood}` : ''}` : order.customer.phone || ''} · {elapsedLabel(order.createdAt)}</p>
          </div>
          <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-bold', STATUS_CLASS[order.status])}>{statusLabel(order)}</span>
        </div>
        {!closed && (
          <div className="px-3 py-2 bg-white/70 border-b border-brand-primary/10 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0" data-seat-bar>
            <span className="text-[11px] font-semibold text-brand-muted whitespace-nowrap">Cuentas separadas · para:</span>
            <button onClick={() => setSeat(0)} className={cn('px-2.5 py-1 rounded-lg text-xs font-bold border whitespace-nowrap', !seat ? 'bg-brand-button text-brand-on-button border-brand-primary' : 'bg-white text-brand-dark border-border')}>Toda la mesa</button>
            {Array.from({ length: seatCount }, (_, k) => k + 1).map(n => (
              <button key={n} onClick={() => setSeat(n)} className={cn('px-2.5 py-1 rounded-lg text-xs font-bold border whitespace-nowrap', seat === n ? 'bg-sky-600 text-white border-sky-700' : 'bg-white text-sky-800 border-sky-200')} data-seat={n}>Persona {n}</button>
            ))}
            <button onClick={() => { setSeatCount(c => Math.min(20, c + 1)); setSeat(seatCount + 1); }} className="px-2 py-1 rounded-lg text-xs font-bold border border-dashed border-border text-brand-muted whitespace-nowrap" title="Otra persona" data-seat-add>+ Persona</button>
          </div>
        )}
        {closed ? <div className="p-6 text-sm text-muted-foreground">Esta cuenta ya está cerrada.</div> : <ProductPicker onAdd={addItem} />}
      </div>

      {/* Cuenta */}
      <div className={cn('w-full flex-1 min-h-0 lg:flex-none lg:w-[400px] xl:w-[440px] flex-col lg:h-full bg-white border-l border-brand-primary/10', mobileView === 'account' ? 'flex' : 'hidden lg:flex')}>
        <div className="px-3 py-2 border-b border-brand-primary/10 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={leave} className="lg:hidden h-8 pl-1.5 pr-2.5 rounded-lg bg-brand-card text-brand-dark text-xs font-bold flex items-center gap-1" title="Volver sin cobrar" data-leave-account><ArrowLeft size={14} /> {order.type === 'dine-in' ? 'Mesas' : 'Volver'}</button>
            <span className="text-xs font-bold uppercase tracking-wide text-brand-muted">Cuenta #{order.id}</span>
            {order.unsentCount || draft.length ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">{draft.length} sin enviar</span> : null}
          </div>
          <div className="relative">
            <button onClick={() => setShowMenu(m => !m)} className="w-8 h-8 rounded-lg hover:bg-brand-card flex items-center justify-center" title="Más opciones"><MoreHorizontal size={18} /></button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-border rounded-xl shadow-elevated z-30 overflow-hidden text-sm" onMouseLeave={() => setShowMenu(false)}>
                <button onClick={() => { setShowMenu(false); setShowEdit(true); }} className="w-full text-left px-3 py-2 hover:bg-brand-card flex items-center gap-2"><Pencil size={14} /> Editar datos del pedido</button>
                {order.type === 'dine-in' && <button onClick={() => { setShowMenu(false); setShowMove('move'); }} className="w-full text-left px-3 py-2 hover:bg-brand-card flex items-center gap-2"><ArrowLeftRight size={14} /> Cambiar de mesa</button>}
                {order.type === 'dine-in' && <button onClick={() => { setShowMenu(false); setShowMove('merge'); }} className="w-full text-left px-3 py-2 hover:bg-brand-card flex items-center gap-2"><Merge size={14} /> Unir con otra mesa</button>}
                {<button onClick={() => { setShowMenu(false); openSplit(); }} className="w-full text-left px-3 py-2 hover:bg-brand-card flex items-center gap-2" data-split-menu><Split size={14} /> Cuentas separadas</button>}
                {lastBatch.current && <button onClick={() => { setShowMenu(false); printLastBatch(); }} className="w-full text-left px-3 py-2 hover:bg-brand-card flex items-center gap-2"><Printer size={14} /> Reimprimir última comanda</button>}
                {canDo(user, 'cancel_orders') && <button onClick={() => { setShowMenu(false); cancel(); }} className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 flex items-center gap-2"><Ban size={14} /> Anular cuenta</button>}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3"
          onFocus={e => { if ((e.target as HTMLElement).tagName === 'INPUT') { setTyping(true); const t = e.target as HTMLElement; setTimeout(() => t.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300); } }}
          onBlur={e => { const box = e.currentTarget; if ((e.target as HTMLElement).tagName === 'INPUT') setTimeout(() => { const a = document.activeElement as HTMLElement | null; if (!(a && a.tagName === 'INPUT' && box.contains(a))) setTyping(false); }, 150); }}>
          {sentGroups.map(g => (
            <div key={g.batch} className="rounded-xl border border-border bg-brand-card/60">
              <div className="px-3 py-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-brand-muted"><span className="flex items-center gap-1"><ChefHat size={11} /> Comanda #{g.batch}</span><span>{g.items.every(i => i.kitchenStatus === 'ready') ? '✓ lista' : g.items.some(i => i.kitchenStatus === 'preparing') ? 'en preparación' : 'en cocina'}</span></div>
              {g.items.map(i => (
                <div key={i.id} className="px-3 py-1.5 flex items-start gap-2 text-xs border-t border-border/60">
                  <span className="font-bold w-6">{i.quantity}x</span>
                  {anySeat && <SeatBadge seat={i.seat} />}
                  <span className="flex-1 min-w-0"><span className="font-semibold text-brand-dark">{i.name}</span>{i.notes && <span className="block text-[11px] text-brand-muted">➜ {i.notes}</span>}</span>
                  <span className="font-semibold">{formatPrice(i.price * i.quantity)}</span>
                  {canCancel && !closed && i.quantity > 1 && <button onClick={() => removeSent(i, 1)} className="w-6 h-6 rounded-md border border-border text-brand-muted hover:text-red-600 flex items-center justify-center" title="Quitar una unidad" data-sent-minus><Minus size={12} /></button>}
                  {canCancel && !closed && <button onClick={() => removeSent(i)} className="w-6 h-6 rounded-md text-brand-muted hover:text-red-600 flex items-center justify-center" title="Quitar de la cuenta" data-sent-remove><Trash2 size={13} /></button>}
                </div>
              ))}
            </div>
          ))}
          {(order as any).cancellations?.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50/50" data-cancelled-items>
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-red-700">Cancelados</div>
              {(order as any).cancellations.map((c: any) => (
                <div key={c.id} className="px-3 py-1.5 border-t border-red-100 text-xs flex items-start gap-2 text-red-900/80">
                  <span className="font-bold w-6 line-through">{c.quantity}x</span>
                  <span className="flex-1 min-w-0"><span className="line-through">{c.name}</span><span className="block text-[10px] text-red-700/80">{c.wasSent ? 'Ya estaba en cocina' : 'Sin enviar'}{c.reason ? ` · ${c.reason}` : ''}{c.cancelledBy ? ` · ${c.cancelledBy}` : ''} · {String(c.cancelledAt || '').slice(11, 16)}</span></span>
                  <span className="line-through">{formatPrice(c.price * c.quantity)}</span>
                </div>
              ))}
            </div>
          )}
          {draft.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50/60">
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">Por enviar a cocina</div>
              {draft.map((i, idx) => (
                <div key={idx} className="px-3 py-1.5 border-t border-amber-200/70 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center rounded-lg border border-border bg-white">
                      <button onClick={() => changeQty(idx, -1)} className="w-7 h-7 flex items-center justify-center" title="Quitar uno"><Minus size={12} /></button>
                      <span className="w-6 text-center font-bold">{i.quantity}</span>
                      <button onClick={() => changeQty(idx, 1)} className="w-7 h-7 flex items-center justify-center" title="Agregar uno"><Plus size={12} /></button>
                    </div>
                    {(anySeat || seat > 0) && <SeatBadge seat={i.seat} onClick={() => cycleSeat(idx)} title="Tocar para cambiar de persona" />}
                    <span className="flex-1 min-w-0 font-semibold text-brand-dark truncate">{i.name}</span>
                    <span className="font-semibold">{formatPrice(i.price * i.quantity)}</span>
                    <button onClick={() => setNoteEdit(noteEdit === idx ? null : idx)} className={cn('w-7 h-7 rounded-lg flex items-center justify-center', i.notes ? 'text-brand-primary bg-brand-card' : 'text-brand-muted hover:bg-brand-card')} title="Nota para cocina"><StickyNote size={13} /></button>
                    <button onClick={() => changeQty(idx, -i.quantity)} className="w-7 h-7 rounded-lg flex items-center justify-center text-brand-muted hover:text-red-600" title="Eliminar"><Trash2 size={13} /></button>
                  </div>
                  {(noteEdit === idx || i.notes) && <input value={i.notes} onChange={e => setNote(idx, e.target.value)} placeholder="Ej. sin cebolla, término medio..." className="mt-1.5 w-full px-2 py-1 rounded-lg border border-amber-200 bg-white text-[11px] outline-none" autoFocus={noteEdit === idx} />}
                </div>
              ))}
            </div>
          )}
          {sentGroups.length === 0 && draft.length === 0 && (
            <div className="text-center py-10 text-brand-muted"><Utensils size={28} className="mx-auto mb-2 opacity-40" /><p className="text-xs">Toca los productos del catálogo para agregarlos a la cuenta.</p></div>
          )}
        </div>

        <div className={cn('border-t border-brand-primary/10 p-3 space-y-2 bg-white', typing && 'hidden lg:block')}>
          <div className="text-xs space-y-0.5">
            <div className="flex justify-between text-brand-muted"><span>Subtotal</span><span>{formatPrice(subtotal)}</span></div>
            {order.deliveryFee ? <div className="flex justify-between text-brand-muted"><span>Envío</span><span>{formatPrice(order.deliveryFee)}</span></div> : null}
            {order.discount ? <div className="flex justify-between text-red-700"><span>Descuento</span><span>− {formatPrice(order.discount)}</span></div> : null}
            <div className="flex justify-between text-base font-bold text-brand-dark"><span>Total</span><span>{formatPrice(total)}</span></div>
            {anySeat && <div className="flex flex-wrap gap-1.5 pt-1" data-seat-totals>{seatTotals.map(([s, v]) => <span key={s} className={cn('px-2 py-0.5 rounded-md text-[11px] font-semibold border', s ? 'bg-sky-50 text-sky-800 border-sky-200' : 'bg-gray-50 text-gray-600 border-gray-200')}>{s ? `Persona ${s}` : 'Mesa'}: {formatPrice(v)}</span>)}</div>}
          </div>
          {!closed && (
            <>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={send} disabled={busy || draft.length === 0} className="py-2.5 rounded-xl bg-brand-surface text-brand-on-dark text-xs font-bold flex flex-col items-center gap-1 disabled:opacity-40" title="Enviar a cocina solo lo nuevo"><ChefHat size={16} />{order.type === 'dine-in' ? 'A cocina' : 'Confirmar'}</button>
              <button onClick={prebill} disabled={busy || (sentGroups.length === 0 && draft.length === 0)} className="py-2.5 rounded-xl bg-white border border-brand-primary/20 text-brand-primary text-xs font-bold flex flex-col items-center gap-1 disabled:opacity-40" title="Imprimir precuenta"><Receipt size={16} />Precuenta</button>
              <button onClick={openClose} disabled={busy || (sentGroups.length === 0 && draft.length === 0)} className="py-2.5 rounded-xl gradient-primary text-primary-foreground text-xs font-bold flex flex-col items-center gap-1 disabled:opacity-40" title="Cobrar y cerrar"><Wallet size={16} />Cobrar</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {true ? <button onClick={openSplit} disabled={busy || allLines.reduce((n, i) => n + i.quantity, 0) < 2} className="py-2 rounded-xl border border-border text-xs font-semibold text-brand-dark flex items-center justify-center gap-1.5 hover:bg-brand-card disabled:opacity-40" data-split><Split size={13} /> Cuentas separadas</button> : <span />}
              <button onClick={leave} className="py-2 rounded-xl border border-border text-xs font-semibold text-brand-dark flex items-center justify-center gap-1.5 hover:bg-brand-card" data-leave-bottom><ArrowLeft size={13} /> Salir sin cobrar</button>
            </div>
            </>
          )}
        </div>
      </div>

      {/* Alternar catálogo / cuenta en móvil */}
      <div className={cn('lg:hidden shrink-0 grid grid-cols-2 bg-brand-surface text-brand-on-dark pb-[env(safe-area-inset-bottom)]', typing && 'hidden')}>
        <button onClick={() => setMobileView('catalog')} className={cn('py-3 text-xs font-bold flex items-center justify-center gap-1.5', mobileView === 'catalog' && 'bg-white/15')}><Utensils size={15} /> Productos</button>
        <button onClick={() => setMobileView('account')} className={cn('py-3 text-xs font-bold flex items-center justify-center gap-1.5', mobileView === 'account' && 'bg-white/15')}><ShoppingBag size={15} /> Cuenta · {formatPrice(total)}</button>
      </div>

      {showClose && <CloseOrderModal order={{ ...order, subtotal, total }} onClose={() => { setShowClose(false); if (!isActive(order)) navigate(backPath(order)); }} onClosed={o => { setOrder(o); setDraft([]); draftRef.current = []; }} />}
      {splitOpen && <SplitModal order={order} onClose={() => setSplitOpen(false)} onSplit={child => { setSplitOpen(false); splitPaid.current = false; setSplitChild(child); }} />}
      {splitChild && <CloseOrderModal order={splitChild} onClose={afterSplit} onClosed={() => { splitPaid.current = true; }} />}
      {showEdit && <EditHeaderModal order={order} onClose={() => setShowEdit(false)} onSaved={o => { setOrder({ ...o, items: [...o.items.filter((i: OrderItem) => i.batch), ...draftRef.current] }); setShowEdit(false); }} />}
      {showMove && <MoveTableModal mode={showMove} order={order} onClose={() => setShowMove(null)} onDone={(o, merged) => { setShowMove(null); if (merged) navigate(`/cuenta/${o.id}`); else setOrder({ ...o, items: [...o.items.filter((i: OrderItem) => i.batch), ...draftRef.current] }); }} />}
    </div>
  );
};

/* ---------- Editar cabecera ---------- */
const EditHeaderModal = ({ order, onClose, onSaved }: { order: Order; onClose: () => void; onSaved: (o: Order) => void }) => {
  const restaurant = useStore(s => s.restaurant);
  const [f, setF] = useState<any>({
    people: String(order.people || ''), waiterId: order.waiterId || 0, driverId: order.driverId || 0, label: order.label || '', channel: order.channel || 'local', notes: order.notes || '',
    name: order.customer.name === 'Consumidor Final' ? '' : order.customer.name, phone: order.customer.phone || '', address: order.customer.address || '', address2: order.customer.address2 || '', neighborhood: order.customer.neighborhood || '',
    estimatedMinutes: order.estimatedMinutes || 0, deliveryFee: String(order.deliveryFee || 0), saveCustomer: false,
  });
  const set = (p: any) => setF((x: any) => ({ ...x, ...p }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setSaving(true); setError('');
    try {
      const body: any = { label: f.label, channel: f.channel, notes: f.notes, customer: { name: f.name || 'Consumidor Final', phone: f.phone, address: f.address, address2: f.address2, neighborhood: f.neighborhood, saveCustomer: f.saveCustomer } };
      if (order.type === 'dine-in') { body.people = Number(f.people) || 1; body.waiterId = f.waiterId || null; }
      if (order.type === 'delivery') { body.driverId = f.driverId || null; body.estimatedMinutes = f.estimatedMinutes || null; body.deliveryFee = Number(f.deliveryFee) || 0; }
      onSaved(await api.updateOrderHeader(order.id, body));
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };
  return (
    <Modal title="Datos del pedido" onClose={onClose} wide>
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        {order.type === 'dine-in' && <>
          <div><label className={LABEL}>Personas</label><input type="number" min={1} value={f.people} onChange={e => set({ people: e.target.value })} className={cn(INPUT, 'font-mono')} /></div>
          <div><label className={LABEL}>Mesero</label><NiceSelect value={f.waiterId} onChange={e => set({ waiterId: Number(e.target.value) })} className={INPUT}><option value={0}>— Sin asignar —</option>{(restaurant?.staff.waiters || []).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</NiceSelect></div>
        </>}
        <div><label className={LABEL}>{order.type === 'pickup' ? 'Nombre o etiqueta' : 'Etiqueta'}</label><input value={f.label} onChange={e => set({ label: e.target.value })} className={INPUT} /></div>
        <div><label className={LABEL}>Cliente</label><input value={f.name} onChange={e => set({ name: e.target.value })} className={INPUT} /></div>
        <div><label className={LABEL}>Teléfono</label><input value={f.phone} onChange={e => set({ phone: e.target.value })} className={INPUT} /></div>
        <div><label className={LABEL}>Canal</label><NiceSelect value={f.channel} onChange={e => set({ channel: e.target.value })} className={INPUT}>{Object.entries(CHANNEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NiceSelect></div>
        {order.type === 'delivery' && <>
          <div className="sm:col-span-2"><label className={LABEL}>Dirección</label><input value={f.address} onChange={e => set({ address: e.target.value })} className={INPUT} /></div>
          <div><label className={LABEL}>Piso / apto</label><input value={f.address2} onChange={e => set({ address2: e.target.value })} className={INPUT} /></div>
          <div><label className={LABEL}>Barrio</label><input value={f.neighborhood} onChange={e => set({ neighborhood: e.target.value })} className={INPUT} /></div>
          <div><label className={LABEL}>Repartidor</label><NiceSelect value={f.driverId} onChange={e => set({ driverId: Number(e.target.value) })} className={INPUT}><option value={0}>— Sin asignar —</option>{(restaurant?.staff.couriers || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</NiceSelect></div>
          <div><label className={LABEL}>Tiempo estimado</label><div className="flex flex-wrap gap-1.5">{(restaurant?.deliveryTimes || [15, 30, 45, 60]).map(m => <Chip key={m} active={f.estimatedMinutes === m} onClick={() => set({ estimatedMinutes: m })}>{m} min</Chip>)}</div></div>
          <div><label className={LABEL}>Costo de envío</label><input type="number" min={0} value={f.deliveryFee} onChange={e => set({ deliveryFee: e.target.value })} className={cn(INPUT, 'font-mono')} /></div>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={f.saveCustomer} onChange={e => set({ saveCustomer: e.target.checked })} /> Actualizar la dirección del cliente guardado</label>
        </>}
        <div className="sm:col-span-2"><label className={LABEL}>Comentario</label><input value={f.notes} onChange={e => set({ notes: e.target.value })} className={INPUT} /></div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button onClick={save} disabled={saving} className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-40">{saving ? 'Guardando...' : 'Guardar'}</button>
    </Modal>
  );
};

/* ---------- Cambiar de mesa / unir ---------- */
const MoveTableModal = ({ mode, order, onClose, onDone }: { mode: 'move' | 'merge'; order: Order; onClose: () => void; onDone: (o: Order, merged: boolean) => void }) => {
  const [rooms, setRooms] = useState<any[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { api.getTablesState().then(setRooms).catch(() => {}); }, []);
  const pick = async (t: any) => {
    setError('');
    try {
      if (mode === 'move') onDone(await api.moveTable(order.id, t.id), false);
      else if (t.order && window.confirm(`¿Unir esta cuenta con la mesa ${t.label}? Los productos pasan a la cuenta de la mesa ${t.label}.`)) onDone(await api.mergeOrders(order.id, t.order.id), true);
    } catch (e: any) { setError(e.message); }
  };
  return (
    <Modal title={mode === 'move' ? 'Cambiar de mesa' : 'Unir con otra mesa'} onClose={onClose}>
      <p className="text-xs text-muted-foreground">{mode === 'move' ? 'Elige una mesa libre.' : 'Elige la mesa ocupada a la que se une esta cuenta.'}</p>
      {rooms.map(r => (
        <div key={r.id}>
          <p className="text-[10px] font-bold uppercase text-brand-muted mb-1">{r.name}</p>
          <div className="flex flex-wrap gap-1.5">
            {r.tables.filter((t: any) => (mode === 'move' ? t.state === 'free' : t.state !== 'free' && t.order?.id !== order.id)).map((t: any) => (
              <button key={t.id} onClick={() => pick(t)} className="px-3 py-2 rounded-xl border border-brand-primary/15 bg-brand-card text-sm font-bold hover:bg-brand-button hover:text-brand-on-button">{t.label}{t.order ? <span className="block text-[10px] font-normal">{formatPrice(t.order.total)}</span> : null}</button>
            ))}
            {r.tables.filter((t: any) => (mode === 'move' ? t.state === 'free' : t.state !== 'free' && t.order?.id !== order.id)).length === 0 && <span className="text-xs text-muted-foreground">Ninguna disponible</span>}
          </div>
        </div>
      ))}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </Modal>
  );
};

export default OpenOrderPage;

/** Cuentas separadas: se elige qué productos (y cuántos) paga esta persona; esa parte se cobra aparte con su recibo. */
const SplitModal = ({ order, onClose, onSplit }: { order: Order; onClose: () => void; onSplit: (child: Order) => void }) => {
  const lines = order.items.filter(i => i.id);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [people, setPeople] = useState(1);
  const [busy, setBusy] = useState(false);
  const picked = lines.reduce((s, i) => s + (qty[i.id as number] || 0) * i.price, 0);
  const totalQty = lines.reduce((s, i) => s + i.quantity, 0);
  const pickedQty = Object.values(qty).reduce((a, b) => a + b, 0);
  const set = (id: number, max: number, d: number) => setQty(q => ({ ...q, [id]: Math.max(0, Math.min(max, (q[id] || 0) + d)) }));
  const seats = [...new Set(lines.map(i => i.seat || 0).filter(Boolean))].sort((a, b) => a - b);
  const pickSeat = (s: number) => { setQty(Object.fromEntries(lines.filter(i => (i.seat || 0) === s).map(i => [i.id as number, i.quantity]))); setPeople(1); };
  const go = async () => {
    setBusy(true);
    try {
      const r = await api.splitOrder(order.id, Object.entries(qty).filter(([, n]) => n > 0).map(([id, n]) => ({ itemId: Number(id), quantity: n })), people);
      onSplit(r.split);
    } catch (e: any) { toast.error(e.message); }
    setBusy(false);
  };
  return (
    <Modal title={`Cuentas separadas · ${orderTitle(order)}`} onClose={onClose}>
      <p className="text-xs text-muted-foreground">Marca lo que paga <b>esta persona</b>. Esa parte se cobra aparte con su propio recibo o factura y la mesa sigue abierta con el resto. Repite para cada persona; la última paga con <b>Cobrar</b>.</p>
      {seats.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" data-split-seats>
          <span className="text-xs text-muted-foreground">Cobrar a:</span>
          {seats.map(s => <button key={s} onClick={() => pickSeat(s)} className="px-3 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-bold" data-split-seat={s}>Persona {s} · {formatPrice(lines.filter(i => i.seat === s).reduce((a, i) => a + i.price * i.quantity, 0))}</button>)}
        </div>
      )}
      <ul className="divide-y divide-border border border-border rounded-xl max-h-[45dvh] overflow-y-auto" data-split-list>
        {lines.map(i => {
          const n = qty[i.id as number] || 0;
          return (
            <li key={i.id} className={cn('flex items-center gap-2 px-3 py-2 text-xs', n > 0 && 'bg-brand-card/60')}>
              {i.seat ? <SeatBadge seat={i.seat} /> : null}
              <span className="flex-1 min-w-0"><span className="font-semibold text-brand-dark block truncate">{i.name}</span><span className="text-muted-foreground">{i.quantity} × {formatPrice(i.price)}</span></span>
              <div className="flex items-center rounded-lg border border-border bg-white">
                <button onClick={() => set(i.id as number, i.quantity, -1)} className="w-8 h-8 flex items-center justify-center" aria-label="Menos"><Minus size={13} /></button>
                <span className="w-7 text-center font-bold" data-split-qty>{n}</span>
                <button onClick={() => set(i.id as number, i.quantity, 1)} className="w-8 h-8 flex items-center justify-center" aria-label="Más" data-split-plus><Plus size={13} /></button>
              </div>
              <button onClick={() => setQty(q => ({ ...q, [i.id as number]: n === i.quantity ? 0 : i.quantity }))} className="text-[10px] font-semibold text-brand-primary w-10">{n === i.quantity ? 'Quitar' : 'Todo'}</button>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between text-xs">
        <label className="flex items-center gap-2">Personas en esta cuenta
          <input type="number" min={1} value={people} onChange={e => setPeople(Math.max(1, Number(e.target.value) || 1))} className={cn(INPUT, 'w-16 font-mono text-center py-1')} /></label>
        <span className="text-sm">Esta cuenta: <b className="text-brand-dark">{formatPrice(picked)}</b></span>
      </div>
      {pickedQty >= totalQty && <p className="text-xs text-amber-700">Elegiste todo: para cobrar la mesa completa usa Cobrar.</p>}
      <button onClick={go} disabled={busy || pickedQty === 0 || pickedQty >= totalQty} className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-40" data-split-go>{busy ? 'Separando...' : `Cobrar esta cuenta · ${formatPrice(picked)}`}</button>
    </Modal>
  );
};
