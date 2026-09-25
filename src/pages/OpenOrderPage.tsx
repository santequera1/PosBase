import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChefHat, Receipt, Wallet, MoreHorizontal, Minus, Plus, Trash2, StickyNote, ArrowLeftRight, Merge, Ban, Printer, Pencil, ShoppingBag, Utensils } from 'lucide-react';
import { toast } from 'sonner';
import { useStore, type Order, type OrderItem } from '@/store/useStore';
import { api } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Modal, Chip, INPUT, LABEL } from '@/components/common/Primitives';
import { ProductPicker } from '@/components/restaurant/ProductPicker';
import { CloseOrderModal } from '@/components/restaurant/CloseOrderModal';
import { orderTitle, statusLabel, STATUS_CLASS, elapsedLabel, CHANNEL_LABEL, TYPE_LABEL, type Channel, isActive } from '@/lib/restaurant';
import { printThermal } from '@/lib/thermalPrint';
import { generateKitchenTicketHtml, generatePreBillHtml } from '@/lib/restaurantPrint';

const backPath = (o: Order) => (o.type === 'dine-in' ? '/tables' : o.type === 'pickup' ? '/counter' : '/delivery');
const sameLine = (a: OrderItem, b: OrderItem) => a.productId === b.productId && (a.size || '') === (b.size || '') && (a.notes || '') === (b.notes || '');

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
  const addItem = (item: OrderItem) => {
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
  const removeSent = async (item: OrderItem) => {
    if (!item.id || !window.confirm(`¿Retirar "${item.name}" de la cuenta? Ya se envió a cocina.`)) return;
    try { const o = await api.removeSentItem(orderId, item.id); setOrder({ ...o, items: [...o.items.filter((i: OrderItem) => i.batch), ...draftRef.current] }); } catch (e: any) { toast.error(e.message); }
  };

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
        if (restaurant?.autoPrintKitchen) printThermal(generateKitchenTicketHtml(r.order, r.items, r.batch), `Comanda-${orderId}-${r.batch}`);
      } else toast.info('No hay productos nuevos para enviar');
      if (order.type !== 'dine-in') navigate(backPath(order));
    } catch (e: any) { toast.error(e.message); }
    setBusy(false);
  };
  const printLastBatch = () => { if (order && lastBatch.current) printThermal(generateKitchenTicketHtml(order, lastBatch.current.items, lastBatch.current.batch), `Comanda-${orderId}`); };
  const prebill = async () => {
    if (!order) return;
    setBusy(true);
    try {
      await flush();
      if (draftRef.current.length) { const r = await api.sendToKitchen(orderId); setDraft([]); draftRef.current = []; setOrder(r.order); }
      const o = order.type === 'dine-in' ? await api.setRestaurantStatus(orderId, 'billing') : await api.getOrder(orderId);
      setOrder(o);
      printThermal(generatePreBillHtml(o, restaurant?.tipDineIn && o.type === 'dine-in' ? restaurant.tipPercent : 0), `Precuenta-${orderId}`);
    } catch (e: any) { toast.error(e.message); }
    setBusy(false);
  };
  const cancel = async () => {
    if (!order || !window.confirm('¿Anular esta cuenta? Si tenía productos enviados, el inventario se devuelve.')) return;
    try { await api.setRestaurantStatus(orderId, 'cancelled'); toast.success('Cuenta anulada'); navigate(backPath(order)); } catch (e: any) { toast.error(e.message); }
  };
  const openClose = async () => { await flush(); setShowClose(true); };

  const sentGroups = useMemo(() => {
    if (!order) return [] as Array<{ batch: number; items: OrderItem[] }>;
    const map = new Map<number, OrderItem[]>();
    for (const i of order.items.filter(x => x.batch)) { const b = i.batch as number; map.set(b, [...(map.get(b) || []), i]); }
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([batch, items]) => ({ batch, items }));
  }, [order]);
  const subtotal = (order ? order.items.filter(i => i.batch).reduce((a, i) => a + i.price * i.quantity, 0) : 0) + draft.reduce((a, i) => a + i.price * i.quantity, 0);
  const total = Math.max(0, subtotal + (order?.deliveryFee || 0) - (order?.discount || 0));

  if (error) return <div className="p-6 text-sm text-red-600">{error} <button onClick={() => navigate(-1)} className="underline ml-2">Volver</button></div>;
  if (!order) return <div className="p-6 text-sm text-muted-foreground">Cargando cuenta...</div>;
  const closed = !isActive(order);

  return (
    <div className="flex flex-col lg:flex-row h-full w-full bg-brand-bg text-brand-primary overflow-hidden">
      {/* Catálogo */}
      <div className={cn('flex-1 flex-col h-full overflow-hidden border-r border-brand-primary/10', mobileView === 'catalog' ? 'flex' : 'hidden lg:flex')}>
        <div className="flex items-center gap-2 px-3 py-2 bg-brand-surface text-brand-on-dark shrink-0">
          <button onClick={() => navigate(backPath(order))} className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center" title="Volver"><ArrowLeft size={18} /></button>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-sm truncate">{orderTitle(order)} <span className="font-normal opacity-70">· {TYPE_LABEL[order.type]}{order.channel && order.channel !== 'local' ? ` · ${CHANNEL_LABEL[order.channel as Channel]}` : ''}</span></p>
            <p className="text-[11px] opacity-70 truncate">{order.type === 'dine-in' ? `${order.people || 0} personas${order.waiterName ? ` · ${order.waiterName}` : ''}` : order.type === 'delivery' ? `${order.customer.address || ''}${order.customer.neighborhood ? ` · ${order.customer.neighborhood}` : ''}` : order.customer.phone || ''} · {elapsedLabel(order.createdAt)}</p>
          </div>
          <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-bold', STATUS_CLASS[order.status])}>{statusLabel(order)}</span>
        </div>
        {closed ? <div className="p-6 text-sm text-muted-foreground">Esta cuenta ya está cerrada.</div> : <ProductPicker onAdd={addItem} />}
      </div>

      {/* Cuenta */}
      <div className={cn('w-full lg:w-[400px] xl:w-[440px] flex-col h-full bg-white border-l border-brand-primary/10', mobileView === 'account' ? 'flex' : 'hidden lg:flex')}>
        <div className="px-3 py-2 border-b border-brand-primary/10 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
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
                {lastBatch.current && <button onClick={() => { setShowMenu(false); printLastBatch(); }} className="w-full text-left px-3 py-2 hover:bg-brand-card flex items-center gap-2"><Printer size={14} /> Reimprimir última comanda</button>}
                <button onClick={() => { setShowMenu(false); cancel(); }} className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 flex items-center gap-2"><Ban size={14} /> Anular cuenta</button>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {sentGroups.map(g => (
            <div key={g.batch} className="rounded-xl border border-border bg-brand-card/60">
              <div className="px-3 py-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-brand-muted"><span className="flex items-center gap-1"><ChefHat size={11} /> Comanda #{g.batch}</span><span>{g.items.every(i => i.kitchenStatus === 'ready') ? '✓ lista' : g.items.some(i => i.kitchenStatus === 'preparing') ? 'en preparación' : 'en cocina'}</span></div>
              {g.items.map(i => (
                <div key={i.id} className="px-3 py-1.5 flex items-start gap-2 text-xs border-t border-border/60">
                  <span className="font-bold w-6">{i.quantity}x</span>
                  <span className="flex-1 min-w-0"><span className="font-semibold text-brand-dark">{i.name}</span>{i.notes && <span className="block text-[11px] text-brand-muted">➜ {i.notes}</span>}</span>
                  <span className="font-semibold">{formatPrice(i.price * i.quantity)}</span>
                  {user?.role === 'admin' && !closed && <button onClick={() => removeSent(i)} className="text-brand-muted hover:text-red-600" title="Retirar (admin)"><Trash2 size={13} /></button>}
                </div>
              ))}
            </div>
          ))}
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

        <div className="border-t border-brand-primary/10 p-3 space-y-2 bg-white">
          <div className="text-xs space-y-0.5">
            <div className="flex justify-between text-brand-muted"><span>Subtotal</span><span>{formatPrice(subtotal)}</span></div>
            {order.deliveryFee ? <div className="flex justify-between text-brand-muted"><span>Envío</span><span>{formatPrice(order.deliveryFee)}</span></div> : null}
            {order.discount ? <div className="flex justify-between text-red-700"><span>Descuento</span><span>− {formatPrice(order.discount)}</span></div> : null}
            <div className="flex justify-between text-base font-bold text-brand-dark"><span>Total</span><span>{formatPrice(total)}</span></div>
          </div>
          {!closed && (
            <div className="grid grid-cols-3 gap-2">
              <button onClick={send} disabled={busy || draft.length === 0} className="py-2.5 rounded-xl bg-brand-surface text-brand-on-dark text-xs font-bold flex flex-col items-center gap-1 disabled:opacity-40" title="Enviar a cocina solo lo nuevo"><ChefHat size={16} />{order.type === 'dine-in' ? 'A cocina' : 'Confirmar'}</button>
              <button onClick={prebill} disabled={busy || (sentGroups.length === 0 && draft.length === 0)} className="py-2.5 rounded-xl bg-white border border-brand-primary/20 text-brand-primary text-xs font-bold flex flex-col items-center gap-1 disabled:opacity-40" title="Imprimir precuenta"><Receipt size={16} />Precuenta</button>
              <button onClick={openClose} disabled={busy || (sentGroups.length === 0 && draft.length === 0)} className="py-2.5 rounded-xl gradient-primary text-primary-foreground text-xs font-bold flex flex-col items-center gap-1 disabled:opacity-40" title="Cobrar y cerrar"><Wallet size={16} />Cobrar</button>
            </div>
          )}
        </div>
      </div>

      {/* Alternar catálogo / cuenta en móvil */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 grid grid-cols-2 bg-brand-surface text-brand-on-dark">
        <button onClick={() => setMobileView('catalog')} className={cn('py-3 text-xs font-bold flex items-center justify-center gap-1.5', mobileView === 'catalog' && 'bg-white/15')}><Utensils size={15} /> Productos</button>
        <button onClick={() => setMobileView('account')} className={cn('py-3 text-xs font-bold flex items-center justify-center gap-1.5', mobileView === 'account' && 'bg-white/15')}><ShoppingBag size={15} /> Cuenta · {formatPrice(total)}</button>
      </div>

      {showClose && <CloseOrderModal order={{ ...order, subtotal, total }} onClose={() => { setShowClose(false); if (!isActive(order)) navigate(backPath(order)); }} onClosed={o => { setOrder(o); setDraft([]); draftRef.current = []; }} />}
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
          <div><label className={LABEL}>Mesero</label><select value={f.waiterId} onChange={e => set({ waiterId: Number(e.target.value) })} className={INPUT}><option value={0}>— Sin asignar —</option>{(restaurant?.staff.waiters || []).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
        </>}
        <div><label className={LABEL}>{order.type === 'pickup' ? 'Nombre o etiqueta' : 'Etiqueta'}</label><input value={f.label} onChange={e => set({ label: e.target.value })} className={INPUT} /></div>
        <div><label className={LABEL}>Cliente</label><input value={f.name} onChange={e => set({ name: e.target.value })} className={INPUT} /></div>
        <div><label className={LABEL}>Teléfono</label><input value={f.phone} onChange={e => set({ phone: e.target.value })} className={INPUT} /></div>
        <div><label className={LABEL}>Canal</label><select value={f.channel} onChange={e => set({ channel: e.target.value })} className={INPUT}>{Object.entries(CHANNEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        {order.type === 'delivery' && <>
          <div className="sm:col-span-2"><label className={LABEL}>Dirección</label><input value={f.address} onChange={e => set({ address: e.target.value })} className={INPUT} /></div>
          <div><label className={LABEL}>Piso / apto</label><input value={f.address2} onChange={e => set({ address2: e.target.value })} className={INPUT} /></div>
          <div><label className={LABEL}>Barrio</label><input value={f.neighborhood} onChange={e => set({ neighborhood: e.target.value })} className={INPUT} /></div>
          <div><label className={LABEL}>Repartidor</label><select value={f.driverId} onChange={e => set({ driverId: Number(e.target.value) })} className={INPUT}><option value={0}>— Sin asignar —</option>{(restaurant?.staff.couriers || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
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
