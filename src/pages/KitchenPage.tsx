import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChefHat, Play, CheckCircle2, Undo2, ArrowLeft, LogOut, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '@/store/useStore';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { elapsedLabel, minutesSince, TYPE_LABEL, CHANNEL_LABEL, type KitchenTicket, type Channel } from '@/lib/restaurant';

const STATIONS: Array<[string, string]> = [['', 'Todas'], ['cocina', 'Cocina'], ['barra', 'Barra']];

/** Monitor de cocina (KDS): comandas por tanda con tiempo, notas y estaciones. Pantalla completa, letra grande. */
const KitchenPage = () => {
  const navigate = useNavigate();
  const { orders, user, logout } = useStore();
  const [tickets, setTickets] = useState<KitchenTicket[]>([]);
  const [station, setStation] = useState('');
  const [, setTick] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try { setTickets(await api.getKitchen(station || undefined)); } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  }, [station]);
  useEffect(() => { setLoading(true); load(); }, [load]);
  const sig = orders.map(o => `${o.id}:${o.status}:${o.items.filter(i => i.batch).map(i => `${i.batch}${i.kitchenStatus}`).join('')}`).join('|');
  useEffect(() => { load(); }, [sig, load]);
  useEffect(() => { const t = setInterval(() => { setTick(x => x + 1); load(); }, 15000); return () => clearInterval(t); }, [load]);

  const act = async (t: KitchenTicket, action: 'start' | 'ready' | 'undo') => {
    try { await api.kitchenAction(t.orderId, t.batch, action, station || undefined); load(); } catch (e: any) { toast.error(e.message); }
  };
  const cols: Array<[string, string, string]> = [['new', 'Nuevas', 'border-amber-400/60'], ['preparing', 'En preparación', 'border-orange-400/60'], ['ready', 'Listas', 'border-emerald-400/60']];

  return (
    <div className="min-h-screen bg-brand-surface text-brand-on-dark p-3 sm:p-4 font-sans">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          {user?.role !== 'kitchen' && <button onClick={() => navigate('/pos')} className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center" title="Volver"><ArrowLeft size={18} /></button>}
          <div>
            <h1 className="font-display font-bold text-xl flex items-center gap-2"><ChefHat size={22} /> Cocina</h1>
            <p className="text-xs opacity-70">{tickets.filter(t => t.kitchenStatus !== 'ready').length} comanda(s) en curso · se actualiza sola</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-white/10 rounded-xl p-1">
            {STATIONS.map(([id, label]) => <button key={id} onClick={() => setStation(id)} className={cn('px-3 py-1.5 rounded-lg text-xs font-bold', station === id ? 'bg-brand-accent text-brand-on-accent' : 'opacity-80 hover:opacity-100')}>{label}</button>)}
          </div>
          <button onClick={() => { setLoading(true); load(); }} className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center" title="Actualizar"><RefreshCw size={16} className={cn(loading && 'animate-spin')} /></button>
          {user?.role === 'kitchen' && <button onClick={logout} className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center" title="Cerrar sesión"><LogOut size={16} /></button>}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        {cols.map(([key, title, cls]) => {
          const list = tickets.filter(t => t.kitchenStatus === key);
          return (
            <div key={key} className={cn('rounded-2xl border-2 bg-white/5 p-2.5 min-h-[60vh] space-y-2.5', cls)}>
              <div className="flex items-center justify-between px-1"><p className="text-sm font-bold uppercase tracking-wide">{title}</p><span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white/15">{list.length}</span></div>
              {list.length === 0 && <p className="text-xs opacity-50 text-center py-10">{key === 'new' ? 'Sin comandas nuevas ✨' : key === 'preparing' ? 'Nada en preparación' : 'Nada listo aún'}</p>}
              {list.map(t => {
                const mins = minutesSince(t.sentAt);
                const timeCls = t.kitchenStatus === 'ready' ? 'bg-emerald-500/20 text-emerald-200' : mins >= 20 ? 'bg-red-500/30 text-red-100' : mins >= 10 ? 'bg-amber-500/25 text-amber-100' : 'bg-white/10';
                return (
                  <div key={t.key} className="rounded-xl bg-white text-brand-dark shadow-lg overflow-hidden">
                    <div className="px-3 py-2 bg-brand-card flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-base leading-tight truncate">{t.type === 'dine-in' ? `Mesa ${t.tableLabel || '?'}` : t.label || t.customerName}</p>
                        <p className="text-[11px] text-brand-muted">{TYPE_LABEL[t.type]}{t.channel && t.channel !== 'local' ? ` · ${CHANNEL_LABEL[t.channel as Channel]}` : ''} · comanda #{t.batch} · pedido #{t.orderId}{t.waiterName ? ` · ${t.waiterName}` : ''}</p>
                      </div>
                      <span className={cn('text-xs font-bold px-2 py-1 rounded-lg whitespace-nowrap', timeCls)}>{elapsedLabel(t.sentAt)}</span>
                    </div>
                    <div className="px-3 py-2 space-y-1.5">
                      {t.items.map(i => (
                        <div key={i.id} className={cn('flex items-start gap-2', i.kitchenStatus === 'ready' && 'opacity-50 line-through')}>
                          <span className="text-lg font-bold w-8 leading-6">{i.quantity}x</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold leading-tight">{i.name}{i.station === 'barra' ? <span className="ml-1 text-[9px] px-1 rounded bg-sky-100 text-sky-800 font-bold align-middle">BARRA</span> : null}</p>
                            {i.flavors && <p className="text-xs text-brand-muted">• {i.flavors}</p>}
                            {i.notes && <p className="text-xs font-bold text-amber-800 bg-amber-50 rounded px-1.5 py-0.5 mt-0.5">➜ {i.notes}</p>}
                          </div>
                        </div>
                      ))}
                      {t.orderNotes && <p className="text-xs font-semibold text-brand-primary bg-brand-card rounded-lg px-2 py-1">📝 {t.orderNotes}</p>}
                    </div>
                    <div className="px-3 pb-3 flex gap-2">
                      {t.kitchenStatus === 'new' && <button onClick={() => act(t, 'start')} className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold flex items-center justify-center gap-1.5"><Play size={15} /> Empezar</button>}
                      {t.kitchenStatus !== 'ready' && <button onClick={() => act(t, 'ready')} className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-1.5"><CheckCircle2 size={15} /> Listo</button>}
                      {t.kitchenStatus === 'ready' && <button onClick={() => act(t, 'undo')} className="flex-1 py-2 rounded-xl border border-border text-xs font-semibold flex items-center justify-center gap-1.5 text-brand-muted"><Undo2 size={13} /> Devolver a cocina</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default KitchenPage;
