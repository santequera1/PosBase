import { useMemo, useState } from 'react';
import { Users, Phone, MapPin, Bike, Clock, MessageSquare, UserRound } from 'lucide-react';
import { useStore, type Order, type OrderType } from '@/store/useStore';
import { api } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Modal, Chip, INPUT, LABEL } from '@/components/common/Primitives';
import { CHANNEL_LABEL, type Channel } from '@/lib/restaurant';

interface Props {
  type: OrderType;
  tableId?: number;
  tableLabel?: string;
  onClose: () => void;
  onCreated: (order: Order) => void;
}

/** Abrir una mesa, un pedido para llevar o un domicilio. Los productos se agregan después en la cuenta. */
export const NewOrderModal = ({ type, tableId, tableLabel, onClose, onCreated }: Props) => {
  const { restaurant, customers } = useStore();
  const waiters = restaurant?.staff.waiters || [];
  const couriers = restaurant?.staff.couriers || [];
  const [people, setPeople] = useState('2');
  const [waiterId, setWaiterId] = useState<number>(0);
  const [label, setLabel] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [address2, setAddress2] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [channel, setChannel] = useState<Channel>(type === 'delivery' ? 'phone' : 'local');
  const [driverId, setDriverId] = useState<number>(0);
  const [minutes, setMinutes] = useState<number>(restaurant?.deliveryTimes?.[1] || restaurant?.deliveryTimes?.[0] || 30);
  const [fee, setFee] = useState(String(restaurant?.deliveryFee ?? 5000));
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [saveCustomer, setSaveCustomer] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Clientes guardados que coinciden con el teléfono o el nombre escritos
  const matches = useMemo(() => {
    const q = (phone || name).trim().toLowerCase();
    if (q.length < 3) return [];
    return customers.filter(c => (c.phone || '').includes(q) || c.name.toLowerCase().includes(q)).slice(0, 5);
  }, [customers, phone, name]);
  const useCustomer = (c: any) => { setName(c.name); setPhone(c.phone || ''); setAddress(c.address || ''); setAddress2(c.address2 || ''); setNeighborhood(c.neighborhood || ''); };

  const submit = async () => {
    setSaving(true); setError('');
    try {
      const payload: any = { type, channel, notes, label: label.trim() || undefined };
      if (type === 'dine-in') { payload.tableId = tableId; payload.people = Number(people) || 1; payload.waiterId = waiterId || undefined; payload.customer = { name: name.trim() }; }
      if (type === 'pickup') { payload.customer = { name: name.trim() || label.trim(), phone: phone.trim(), saveCustomer: saveCustomer && phone.trim().length >= 7 }; }
      if (type === 'delivery') {
        payload.customer = { name: name.trim(), phone: phone.trim(), address: address.trim(), address2: address2.trim(), neighborhood: neighborhood.trim(), saveCustomer };
        payload.driverId = driverId || undefined; payload.estimatedMinutes = minutes; payload.deliveryFee = Number(fee) || 0; payload.paymentMethod = paymentMethod;
      }
      const order = await api.openRestaurantOrder(payload);
      onCreated(order);
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };
  const canSubmit = type === 'dine-in' ? Number(people) >= 1 : type === 'pickup' ? (label.trim() || name.trim()).length > 0 : name.trim().length > 0 && address.trim().length > 3;
  const title = type === 'dine-in' ? `Abrir mesa ${tableLabel || ''}` : type === 'pickup' ? 'Nuevo pedido para llevar' : 'Nuevo domicilio';

  return (
    <Modal title={title} onClose={onClose} wide={type === 'delivery'}>
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        {type === 'dine-in' && (
          <>
            <div><label className={cn(LABEL, 'flex items-center gap-1')}><Users size={12} /> Personas</label>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5, 6].map(n => <Chip key={n} active={people === String(n)} onClick={() => setPeople(String(n))}>{n}</Chip>)}
                <input type="number" min={1} value={people} onChange={e => setPeople(e.target.value)} className={cn(INPUT, 'w-16 font-mono')} />
              </div></div>
            <div><label className={cn(LABEL, 'flex items-center gap-1')}><UserRound size={12} /> Mesero</label>
              <select value={waiterId} onChange={e => setWaiterId(Number(e.target.value))} className={INPUT}>
                <option value={0}>— Sin asignar —</option>{waiters.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              {waiters.length === 0 && <p className="text-[10px] text-muted-foreground mt-1">Crea los meseros en Personal para poder asignarlos.</p>}</div>
            <div><label className={LABEL}>Cliente (opcional)</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre para la cuenta" className={INPUT} /></div>
            <div><label className={LABEL}>Etiqueta (opcional)</label><input value={label} onChange={e => setLabel(e.target.value)} placeholder="Ej. Cumpleaños, reserva Ana..." className={INPUT} /></div>
          </>
        )}
        {type === 'pickup' && (
          <>
            <div><label className={LABEL}>Nombre o etiqueta del pedido</label><input autoFocus value={label} onChange={e => setLabel(e.target.value)} placeholder="Ej. Brayan, rappi#2506..." className={INPUT} /></div>
            <div><label className={cn(LABEL, 'flex items-center gap-1')}><Phone size={12} /> Teléfono (opcional)</label><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="300 000 0000" className={INPUT} /></div>
            <div className="sm:col-span-2"><label className={LABEL}>Canal</label>
              <div className="flex flex-wrap gap-1.5">{(Object.keys(CHANNEL_LABEL) as Channel[]).map(c => <Chip key={c} active={channel === c} onClick={() => setChannel(c)}>{CHANNEL_LABEL[c]}</Chip>)}</div></div>
          </>
        )}
        {type === 'delivery' && (
          <>
            <div><label className={cn(LABEL, 'flex items-center gap-1')}><Phone size={12} /> Teléfono</label><input autoFocus value={phone} onChange={e => setPhone(e.target.value)} placeholder="300 000 0000" className={cn(INPUT, 'font-mono')} /></div>
            <div><label className={LABEL}>Nombre</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre del cliente" className={INPUT} /></div>
            {matches.length > 0 && (
              <div className="sm:col-span-2 rounded-xl border border-brand-accent/40 bg-brand-card p-2 space-y-1">
                <p className="text-[10px] font-bold text-brand-muted uppercase">Clientes guardados</p>
                {matches.map(c => (
                  <button key={c.id} onClick={() => useCustomer(c)} className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white text-xs flex items-center justify-between">
                    <span><b>{c.name}</b> · {c.phone}</span><span className="text-brand-muted truncate max-w-[50%]">{c.address}{c.neighborhood ? ` · ${c.neighborhood}` : ''}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="sm:col-span-2"><label className={cn(LABEL, 'flex items-center gap-1')}><MapPin size={12} /> Dirección</label><input value={address} onChange={e => setAddress(e.target.value)} placeholder="Calle 45 # 12-30" className={INPUT} /></div>
            <div><label className={LABEL}>Piso / apto / referencia</label><input value={address2} onChange={e => setAddress2(e.target.value)} placeholder="Apto 302, portería azul..." className={INPUT} /></div>
            <div><label className={LABEL}>Barrio</label><input value={neighborhood} onChange={e => setNeighborhood(e.target.value)} placeholder="Manga" className={INPUT} /></div>
            <div className="sm:col-span-2"><label className={LABEL}>Canal</label>
              <div className="flex flex-wrap gap-1.5">{(Object.keys(CHANNEL_LABEL) as Channel[]).map(c => <Chip key={c} active={channel === c} onClick={() => { setChannel(c); if (c === 'rappi' || c === 'didi') setPaymentMethod('platform'); }}>{CHANNEL_LABEL[c]}</Chip>)}</div></div>
            <div><label className={cn(LABEL, 'flex items-center gap-1')}><Bike size={12} /> Repartidor (se puede asignar después)</label>
              <select value={driverId} onChange={e => setDriverId(Number(e.target.value))} className={INPUT}><option value={0}>— Sin asignar —</option>{couriers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              {couriers.length === 0 && <p className="text-[10px] text-muted-foreground mt-1">Crea los domiciliarios en Personal con el cargo "Domiciliario".</p>}</div>
            <div><label className={cn(LABEL, 'flex items-center gap-1')}><Clock size={12} /> Tiempo estimado</label>
              <div className="flex flex-wrap gap-1.5">{(restaurant?.deliveryTimes || [15, 30, 45, 60]).map(m => <Chip key={m} active={minutes === m} onClick={() => setMinutes(m)}>{m >= 60 ? `${m / 60} h` : `${m} min`}</Chip>)}</div></div>
            <div><label className={LABEL}>Costo de envío</label><input type="number" min={0} value={fee} onChange={e => setFee(e.target.value)} className={cn(INPUT, 'font-mono')} /></div>
            <div><label className={LABEL}>Medio de pago previsto</label>
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className={INPUT}>
                <option value="cash">Efectivo contra entrega</option><option value="transfer">Transferencia / Nequi</option><option value="card_debit">Datáfono contra entrega</option><option value="platform">Paga la plataforma (Rappi / DiDi)</option>
              </select></div>
            <label className="sm:col-span-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={saveCustomer} onChange={e => setSaveCustomer(e.target.checked)} /> Guardar cliente y dirección para la próxima vez</label>
          </>
        )}
        <div className="sm:col-span-2"><label className={cn(LABEL, 'flex items-center gap-1')}><MessageSquare size={12} /> Comentario</label><input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej. sin cebolla, timbre dañado, pagar con 50 mil..." className={INPUT} /></div>
      </div>
      {type === 'delivery' && <p className="text-[11px] text-muted-foreground">Envío {formatPrice(Number(fee) || 0)} · llega en ~{minutes} min. Los productos se agregan en el siguiente paso.</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button onClick={submit} disabled={saving || !canSubmit} className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-40">{saving ? 'Creando...' : type === 'dine-in' ? 'Abrir mesa y agregar productos' : 'Crear y agregar productos'}</button>
    </Modal>
  );
};

export default NewOrderModal;
