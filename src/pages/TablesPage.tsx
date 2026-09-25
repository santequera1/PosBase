import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, Save, X, Users, Clock, Receipt, Wallet, ArrowRight, LayoutGrid, Circle, Square, RectangleHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { useStore, type Order } from '@/store/useStore';
import { api } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Modal, Chip, INPUT, LABEL } from '@/components/common/Primitives';
import { NewOrderModal } from '@/components/restaurant/NewOrderModal';
import { CloseOrderModal } from '@/components/restaurant/CloseOrderModal';
import { elapsedLabel, minutesSince, type Room, type RestaurantTable } from '@/lib/restaurant';
import { printThermal } from '@/lib/thermalPrint';
import { generatePreBillHtml } from '@/lib/restaurantPrint';

const STATE_STYLE: Record<string, string> = {
  free: 'bg-emerald-500/90 text-white border-emerald-600 hover:bg-emerald-500',
  occupied: 'bg-brand-button text-brand-on-button border-brand-primary/40',
  billing: 'bg-rose-500 text-white border-rose-600 animate-pulse',
};
const SHAPE_ICON = { square: Square, round: Circle, rect: RectangleHorizontal };

/** Plano de mesas por salón: estado en vivo, abrir mesa, precuenta, cobrar; modo edición para diseñar el plano. */
const TablesPage = () => {
  const navigate = useNavigate();
  const { orders, user, restaurant } = useStore();
  const isAdmin = user?.role === 'admin';
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomId, setRoomId] = useState<number | null>(null);
  const [selected, setSelected] = useState<RestaurantTable | null>(null);
  const [opening, setOpening] = useState<RestaurantTable | null>(null);
  const [closing, setClosing] = useState<Order | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [tableForm, setTableForm] = useState<{ table?: RestaurantTable } | null>(null);
  const [roomForm, setRoomForm] = useState<{ room?: Room } | null>(null);
  const [, setTick] = useState(0);
  const planRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; dx: number; dy: number; startX: number; startY: number; moved: boolean } | null>(null);
  const justDragged = useRef(false);
  const roomsRef = useRef<Room[]>([]);
  useEffect(() => { roomsRef.current = rooms; }, [rooms]);

  const load = useCallback(async () => {
    try { const r = await api.getTablesState(); setRooms(r); setRoomId(id => id && r.some(x => x.id === id) ? id : (r[0]?.id ?? null)); } catch (e: any) { toast.error(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  // Se refresca cuando cambia cualquier pedido (socket) y cada 30 s para los tiempos
  const activeSig = orders.filter(o => o.type === 'dine-in').map(o => `${o.id}:${o.status}:${o.total}`).join('|');
  useEffect(() => { if (!editMode) load(); }, [activeSig, editMode, load]);
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 30000); return () => clearInterval(t); }, []);

  const room = rooms.find(r => r.id === roomId) || null;
  const stats = { free: 0, occupied: 0, billing: 0 };
  for (const r of rooms) for (const t of r.tables) stats[(t.state || 'free') as keyof typeof stats]++;

  /* ---------- edición del plano ---------- */
  const onPointerDown = (e: React.PointerEvent, t: RestaurantTable) => {
    if (!editMode || !planRef.current) return;
    const rect = planRef.current.getBoundingClientRect();
    drag.current = { id: t.id, dx: ((e.clientX - rect.left) / rect.width) * 100 - t.x, dy: ((e.clientY - rect.top) / rect.height) * 100 - t.y, startX: t.x, startY: t.y, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !planRef.current || !room) return;
    const rect = planRef.current.getBoundingClientRect();
    const x = Math.round(Math.max(0, Math.min(100 - 6, ((e.clientX - rect.left) / rect.width) * 100 - d.dx)) * 10) / 10;
    const y = Math.round(Math.max(0, Math.min(100 - 6, ((e.clientY - rect.top) / rect.height) * 100 - d.dy)) * 10) / 10;
    if (Math.abs(x - d.startX) < 0.8 && Math.abs(y - d.startY) < 0.8 && !d.moved) return;
    d.moved = true;
    // Se capturan id y salón aquí: la actualización de estado corre después, cuando el arrastre ya puede haber terminado
    const tableId = d.id, roomId = room.id;
    setRooms(rs => rs.map(r => r.id !== roomId ? r : { ...r, tables: r.tables.map(t => t.id === tableId ? { ...t, x, y } : t) }));
    setDirty(true);
  };
  const saveLayout = async (silent = false) => {
    try {
      await api.saveTableLayout(roomsRef.current.flatMap(r => r.tables.map(t => ({ id: t.id, x: t.x, y: t.y, w: t.w, h: t.h }))));
      setDirty(false);
      if (!silent) toast.success('Plano guardado');
    } catch (e: any) { toast.error(e.message); }
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.moved) return;
    // El clic que sigue al arrastre no debe abrir el editor de la mesa; la posición se guarda sola al soltar
    justDragged.current = true;
    setTimeout(() => { justDragged.current = false; }, 300);
    setTimeout(() => saveLayout(true), 50);
  };
  const removeTable = async (t: RestaurantTable) => {
    if (!window.confirm(`¿Eliminar la mesa ${t.label}?`)) return;
    try { await api.deleteTable(t.id); load(); } catch (e: any) { toast.error(e.message); }
  };
  const removeRoom = async (r: Room) => {
    if (!window.confirm(`¿Eliminar el salón "${r.name}" y sus mesas?`)) return;
    try { await api.deleteRoom(r.id); setRoomId(null); load(); } catch (e: any) { toast.error(e.message); }
  };

  /* ---------- acciones sobre una mesa ---------- */
  const openAccount = (t: RestaurantTable) => { if (t.order) navigate(`/cuenta/${t.order.id}`); };
  const prebill = async (t: RestaurantTable) => {
    if (!t.order) return;
    try {
      const o = await api.setRestaurantStatus(t.order.id, 'billing');
      printThermal(generatePreBillHtml(o, restaurant?.tipDineIn ? restaurant.tipPercent : 0), `Precuenta-${o.id}`);
      load();
    } catch (e: any) { toast.error(e.message); }
  };
  const startClose = async (t: RestaurantTable) => {
    if (!t.order) return;
    try { setClosing(await api.getOrder(t.order.id)); } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4 font-sans">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-lg text-brand-dark">Mesas</h2>
          <p className="text-xs text-muted-foreground">Toca una mesa libre para abrirla; una ocupada para ver su cuenta, imprimir la precuenta o cobrar.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-semibold">{stats.free} libres</span>
          <span className="text-xs px-2.5 py-1 rounded-full bg-brand-card text-brand-primary font-semibold border border-brand-accent/40">{stats.occupied} ocupadas</span>
          <span className="text-xs px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 font-semibold">{stats.billing} pidiendo cuenta</span>
          {isAdmin && !editMode && <button onClick={() => { setEditMode(true); setSelected(null); }} className="px-3 py-1.5 rounded-xl border border-border bg-white text-xs font-semibold text-brand-dark flex items-center gap-1.5" title="Editar plano de mesas"><Pencil size={13} /> Editar plano</button>}
          {editMode && (
            <>
              <button onClick={() => setTableForm({})} className="px-3 py-1.5 rounded-xl border border-border bg-white text-xs font-semibold flex items-center gap-1.5"><Plus size={13} /> Mesa</button>
              <button onClick={() => setRoomForm({})} className="px-3 py-1.5 rounded-xl border border-border bg-white text-xs font-semibold flex items-center gap-1.5"><Plus size={13} /> Salón</button>
              <button onClick={() => saveLayout()} disabled={!dirty} className="px-3 py-1.5 rounded-xl bg-brand-button text-brand-on-button text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40"><Save size={13} /> Guardar plano</button>
              <button onClick={() => { setEditMode(false); setDirty(false); load(); }} className="px-3 py-1.5 rounded-xl border border-border bg-white text-xs font-semibold flex items-center gap-1.5"><X size={13} /> Salir</button>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {rooms.map(r => (
          <div key={r.id} className="flex items-center">
            <Chip active={roomId === r.id} onClick={() => { setRoomId(r.id); setSelected(null); }}>{r.name} <span className="opacity-60">· {r.tables.length}</span></Chip>
            {editMode && roomId === r.id && <button onClick={() => setRoomForm({ room: r })} className="ml-1 p-1 text-brand-muted hover:text-brand-primary" title="Renombrar salón"><Pencil size={12} /></button>}
            {editMode && roomId === r.id && rooms.length > 1 && <button onClick={() => removeRoom(r)} className="p-1 text-brand-muted hover:text-red-600" title="Eliminar salón"><Trash2 size={12} /></button>}
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3">
          <div ref={planRef} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
            className={cn('relative w-full aspect-[16/10] rounded-2xl border bg-brand-card/70 overflow-hidden select-none', editMode ? 'border-dashed border-brand-primary/40' : 'border-brand-primary/10')}
            style={{ backgroundImage: 'radial-gradient(hsl(var(--brand-primary) / 0.08) 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
            {room?.tables.map(t => {
              const st = t.state || 'free';
              const Icon = SHAPE_ICON[t.shape] || Square;
              return (
                <button key={t.id} onPointerDown={e => onPointerDown(e, t)} onClick={() => { if (justDragged.current) return; if (editMode) setTableForm({ table: t }); else if (st === 'free') setOpening(t); else setSelected(t); }}
                  title={editMode ? 'Arrastra para mover · clic para editar' : st === 'free' ? `Abrir mesa ${t.label}` : `Mesa ${t.label}: ${formatPrice(t.order?.total || 0)}`}
                  className={cn('absolute flex flex-col items-center justify-center border-2 shadow-md transition-transform', t.shape === 'round' ? 'rounded-full' : 'rounded-2xl', STATE_STYLE[st], editMode && 'cursor-move', selected?.id === t.id && 'ring-4 ring-brand-accent scale-105')}
                  style={{ left: `${t.x}%`, top: `${t.y}%`, width: `${t.w}%`, height: `${t.h}%` }}>
                  <span className="font-display font-bold text-lg leading-none">{t.label}</span>
                  {st !== 'free' && t.order ? (
                    <span className="text-[10px] leading-tight mt-1 text-center opacity-90">{formatPrice(t.order.total)}<br />{elapsedLabel(t.order.since)}</span>
                  ) : (
                    <span className="text-[10px] mt-0.5 opacity-80 flex items-center gap-0.5"><Icon size={9} /> {t.seats}</span>
                  )}
                  {t.order?.unsent ? <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-amber-400 text-amber-900 text-[10px] font-bold flex items-center justify-center" title="Productos sin enviar a cocina">{t.order.unsent}</span> : null}
                </button>
              );
            })}
            {room && room.tables.length === 0 && <p className="absolute inset-0 flex items-center justify-center text-sm text-brand-muted">Este salón no tiene mesas{editMode ? ': agrega una con el botón "+ Mesa"' : ''}.</p>}
            {!room && <p className="absolute inset-0 flex items-center justify-center text-sm text-brand-muted">Cargando plano...</p>}
          </div>
          {editMode && <p className="text-[11px] text-muted-foreground mt-2">Arrastra las mesas a su posición real (se guarda sola al soltar); tócalas sin mover para cambiar nombre, forma o puestos.</p>}
        </div>

        <div className="space-y-3">
          {selected && selected.order ? (
            <div className="bg-card rounded-xl border border-border shadow-card p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div><p className="font-display font-bold text-lg text-brand-dark">Mesa {selected.label}</p><p className="text-[11px] text-muted-foreground">{selected.order.status === 'billing' ? 'Pidiendo la cuenta' : 'Cuenta abierta'} · cuenta #{selected.order.id}</p></div>
                <button onClick={() => setSelected(null)} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center"><X size={14} /></button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-brand-card rounded-lg p-2"><p className="text-muted-foreground flex items-center gap-1"><Users size={11} /> Personas</p><p className="font-bold text-brand-dark">{selected.order.people}</p></div>
                <div className="bg-brand-card rounded-lg p-2"><p className="text-muted-foreground flex items-center gap-1"><Clock size={11} /> Tiempo</p><p className={cn('font-bold', minutesSince(selected.order.since) > 90 ? 'text-red-600' : 'text-brand-dark')}>{elapsedLabel(selected.order.since)}</p></div>
                <div className="bg-brand-card rounded-lg p-2 col-span-2"><p className="text-muted-foreground">Mesero</p><p className="font-bold text-brand-dark">{selected.order.waiterName || 'Sin asignar'}</p></div>
                <div className="bg-brand-card rounded-lg p-2 col-span-2 flex items-center justify-between"><span className="text-muted-foreground">{selected.order.items} producto(s){selected.order.unsent ? ` · ${selected.order.unsent} sin enviar` : ''}</span><span className="text-base font-bold text-brand-primary">{formatPrice(selected.order.total)}</span></div>
              </div>
              <div className="grid gap-2">
                <button onClick={() => openAccount(selected)} className="py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-1.5"><ArrowRight size={15} /> Abrir la cuenta</button>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => prebill(selected)} className="py-2 rounded-xl border border-border bg-white text-xs font-semibold text-brand-dark flex items-center justify-center gap-1"><Receipt size={13} /> Precuenta</button>
                  <button onClick={() => startClose(selected)} className="py-2 rounded-xl bg-brand-button text-brand-on-button text-xs font-semibold flex items-center justify-center gap-1"><Wallet size={13} /> Cobrar</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border shadow-card p-4 text-xs text-muted-foreground space-y-2">
              <p className="font-bold text-brand-dark flex items-center gap-1.5"><LayoutGrid size={14} /> Cómo funciona</p>
              <p><span className="inline-block w-3 h-3 rounded bg-emerald-500 align-middle mr-1" /> Libre: toca para abrirla (personas, mesero, comentario).</p>
              <p><span className="inline-block w-3 h-3 rounded bg-brand-button align-middle mr-1" /> Ocupada: cuenta abierta; se le agregan productos y se mandan comandas.</p>
              <p><span className="inline-block w-3 h-3 rounded bg-rose-500 align-middle mr-1" /> Pidiendo la cuenta: ya se imprimió la precuenta.</p>
              <p>Desde la cuenta puedes cambiar de mesa, unir mesas, aplicar descuento con motivo, propina y cobrar con varios medios.</p>
            </div>
          )}
        </div>
      </div>

      {opening && <NewOrderModal type="dine-in" tableId={opening.id} tableLabel={opening.label} onClose={() => setOpening(null)} onCreated={o => { setOpening(null); navigate(`/cuenta/${o.id}`); }} />}
      {closing && <CloseOrderModal order={closing} onClose={() => { setClosing(null); setSelected(null); load(); }} onClosed={() => load()} />}
      {tableForm && room && <TableFormModal room={room} rooms={rooms} table={tableForm.table} onClose={() => setTableForm(null)} onSaved={() => { setTableForm(null); load(); }} onDelete={t => { setTableForm(null); removeTable(t); }} />}
      {roomForm && <RoomFormModal room={roomForm.room} onClose={() => setRoomForm(null)} onSaved={r => { setRoomForm(null); load().then(() => setRoomId(r.id)); }} />}
    </div>
  );
};

const TableFormModal = ({ room, rooms, table, onClose, onSaved, onDelete }: { room: Room; rooms: Room[]; table?: RestaurantTable; onClose: () => void; onSaved: () => void; onDelete: (t: RestaurantTable) => void }) => {
  const [label, setLabel] = useState(table?.label || String(room.tables.length + 1));
  const [shape, setShape] = useState<'square' | 'round' | 'rect'>(table?.shape || 'square');
  const [seats, setSeats] = useState(String(table?.seats || 4));
  const [roomId, setRoomId] = useState(table?.roomId || room.id);
  const [error, setError] = useState('');
  const save = async () => {
    setError('');
    try {
      const body = { roomId, label, shape, seats: Number(seats) || 4, w: shape === 'rect' ? 18 : 12, h: shape === 'rect' ? 12 : 16 };
      if (table) await api.updateTable(table.id, body); else await api.addTable({ ...body, x: 8 + (room.tables.length % 4) * 22, y: 8 + Math.floor(room.tables.length / 4) * 24 });
      onSaved();
    } catch (e: any) { setError(e.message); }
  };
  return (
    <Modal title={table ? `Mesa ${table.label}` : 'Nueva mesa'} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div><label className={LABEL}>Nombre o número</label><input value={label} onChange={e => setLabel(e.target.value)} className={INPUT} autoFocus /></div>
        <div><label className={LABEL}>Puestos</label><input type="number" min={1} value={seats} onChange={e => setSeats(e.target.value)} className={cn(INPUT, 'font-mono')} /></div>
        <div className="col-span-2"><label className={LABEL}>Forma</label><div className="flex gap-1.5">{(['square', 'round', 'rect'] as const).map(s => <Chip key={s} active={shape === s} onClick={() => setShape(s)}>{s === 'square' ? 'Cuadrada' : s === 'round' ? 'Redonda' : 'Rectangular'}</Chip>)}</div></div>
        {rooms.length > 1 && <div className="col-span-2"><label className={LABEL}>Salón</label><select value={roomId} onChange={e => setRoomId(Number(e.target.value))} className={INPUT}>{rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        {table && <button onClick={() => onDelete(table)} className="px-3 py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-semibold flex items-center gap-1"><Trash2 size={14} /> Eliminar</button>}
        <button onClick={save} disabled={!label.trim()} className="flex-1 py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-40">Guardar</button>
      </div>
    </Modal>
  );
};

const RoomFormModal = ({ room, onClose, onSaved }: { room?: Room; onClose: () => void; onSaved: (r: Room) => void }) => {
  const [name, setName] = useState(room?.name || '');
  const [error, setError] = useState('');
  const save = async () => { setError(''); try { onSaved(room ? await api.updateRoom(room.id, name) : await api.addRoom(name)); } catch (e: any) { setError(e.message); } };
  return (
    <Modal title={room ? 'Renombrar salón' : 'Nuevo salón'} onClose={onClose}>
      <div><label className={LABEL}>Nombre</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Terraza, Segundo piso..." className={INPUT} autoFocus /></div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button onClick={save} disabled={name.trim().length < 2} className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-40">Guardar</button>
    </Modal>
  );
};

export default TablesPage;
