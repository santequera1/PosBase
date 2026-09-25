import { useEffect, useState } from 'react';
import { LayoutGrid, ShoppingBag, Bike, ChefHat, Percent, Wallet, Printer, Info } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { INPUT, LABEL } from '@/components/common/Primitives';

const MODULES = [
  { key: 'tables', label: 'Mesas', icon: LayoutGrid, desc: 'Plano del salón, cuentas abiertas por mesa, comandas por tandas, precuenta y cobro.' },
  { key: 'counter', label: 'Para llevar', icon: ShoppingBag, desc: 'Pedidos a nombre del cliente con estados hasta que los recogen.' },
  { key: 'delivery', label: 'Domicilios', icon: Bike, desc: 'Clientes por teléfono con dirección, repartidor, tiempo estimado y costo de envío.' },
  { key: 'kitchen', label: 'Cocina (monitor)', icon: ChefHat, desc: 'Pantalla de comandas para cocina y barra; usuarios con rol "cocina" entran directo aquí.' },
];

/** Ajustes → Restaurante: qué módulos se usan, propinas, domicilios y caja obligatoria. */
export const RestaurantPanel = () => {
  const loadRestaurantConfig = useStore(s => s.loadRestaurantConfig);
  const [cfg, setCfg] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [times, setTimes] = useState('');
  useEffect(() => { api.getRestaurantConfig().then(c => { setCfg(c); setTimes(c.deliveryTimes.join(', ')); }).catch(() => {}); }, []);
  if (!cfg) return <p className="text-xs text-muted-foreground">Cargando...</p>;
  const set = (p: any) => setCfg((c: any) => ({ ...c, ...p }));
  const save = async () => {
    setSaving(true); setMsg('');
    try {
      const saved = await api.updateRestaurantConfig({ modules: cfg.modules, tipPercent: cfg.tipPercent, tipDineIn: cfg.tipDineIn, tipCounter: cfg.tipCounter, tipDelivery: cfg.tipDelivery, deliveryFee: cfg.deliveryFee, deliveryTimes: times, requireOpenShift: cfg.requireOpenShift, autoPrintKitchen: cfg.autoPrintKitchen });
      setCfg(saved); setTimes(saved.deliveryTimes.join(', ')); setMsg('Guardado. El menú lateral se actualiza con los módulos activos.');
      loadRestaurantConfig();
    } catch (e: any) { setMsg(e.message); }
    setSaving(false);
  };

  return (
    <div className="max-w-2xl space-y-4 font-sans">
      <section className="bg-card rounded-xl border border-border p-4 shadow-card space-y-3">
        <div><h3 className="font-bold text-sm text-brand-dark">Módulos del restaurante</h3><p className="text-[11px] text-muted-foreground">Activa solo lo que el negocio usa. Una heladería de mostrador puede dejar todo apagado; un restaurante con salón y domicilios los enciende todos.</p></div>
        <div className="grid sm:grid-cols-2 gap-2">
          {MODULES.map(m => (
            <label key={m.key} className={cn('flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors', cfg.modules[m.key] ? 'border-brand-primary/40 bg-brand-button/5' : 'border-border')}>
              <input type="checkbox" checked={!!cfg.modules[m.key]} onChange={e => set({ modules: { ...cfg.modules, [m.key]: e.target.checked } })} className="mt-1" data-module={m.key} />
              <span><span className="flex items-center gap-1.5 text-sm font-semibold text-brand-dark"><m.icon size={14} /> {m.label}</span><span className="block text-[11px] text-muted-foreground">{m.desc}</span></span>
            </label>
          ))}
        </div>
      </section>

      <section className="bg-card rounded-xl border border-border p-4 shadow-card space-y-3">
        <h3 className="font-bold text-sm text-brand-dark flex items-center gap-1.5"><Percent size={14} /> Propina sugerida</h3>
        <div className="grid sm:grid-cols-4 gap-3 items-end">
          <div><label className={LABEL}>Porcentaje</label><input type="number" min={0} max={50} value={cfg.tipPercent} onChange={e => set({ tipPercent: Number(e.target.value) })} className={cn(INPUT, 'font-mono')} /></div>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!cfg.tipDineIn} onChange={e => set({ tipDineIn: e.target.checked })} /> En mesas</label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!cfg.tipCounter} onChange={e => set({ tipCounter: e.target.checked })} /> Para llevar</label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!cfg.tipDelivery} onChange={e => set({ tipDelivery: e.target.checked })} /> Domicilios</label>
        </div>
        <p className="text-[11px] text-muted-foreground">Sale como sugerencia en la precuenta y al cobrar; el cliente puede aceptarla, cambiarla o no dejar. Se registra en Personal → Propinas (directa al mesero o común).</p>
      </section>

      <section className="bg-card rounded-xl border border-border p-4 shadow-card space-y-3">
        <h3 className="font-bold text-sm text-brand-dark flex items-center gap-1.5"><Bike size={14} /> Domicilios</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className={LABEL}>Costo de envío por defecto</label><input type="number" min={0} value={cfg.deliveryFee} onChange={e => set({ deliveryFee: Number(e.target.value) })} className={cn(INPUT, 'font-mono')} /><p className="text-[10px] text-muted-foreground mt-1">Se puede cambiar en cada pedido.</p></div>
          <div><label className={LABEL}>Tiempos estimados (minutos, separados por coma)</label><input value={times} onChange={e => setTimes(e.target.value)} placeholder="15, 20, 30, 45, 60" className={INPUT} /></div>
        </div>
        <p className="text-[11px] text-muted-foreground flex items-start gap-1.5"><Info size={12} className="mt-0.5 shrink-0" /> Los repartidores se crean en Personal con el cargo "Domiciliario". Rappi y DiDi se registran eligiendo el canal y el medio de pago "Plataforma"; la integración automática se conecta después.</p>
      </section>

      <section className="bg-card rounded-xl border border-border p-4 shadow-card space-y-3">
        <h3 className="font-bold text-sm text-brand-dark flex items-center gap-1.5"><Wallet size={14} /> Caja y cocina</h3>
        <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={!!cfg.requireOpenShift} onChange={e => set({ requireOpenShift: e.target.checked })} className="mt-0.5" /><span><span className="font-semibold text-brand-dark block">Exigir caja abierta para vender</span><span className="text-muted-foreground">Sin un turno de caja abierto no se pueden registrar ni cobrar ventas.</span></span></label>
        <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={!!cfg.autoPrintKitchen} onChange={e => set({ autoPrintKitchen: e.target.checked })} className="mt-0.5" /><span><span className="font-semibold text-brand-dark flex items-center gap-1"><Printer size={12} /> Imprimir la comanda al enviarla a cocina</span><span className="text-muted-foreground">Además del monitor de cocina, abre la impresión térmica de cada comanda.</span></span></label>
      </section>

      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={save} disabled={saving} className="px-5 py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-40">{saving ? 'Guardando...' : 'Guardar configuración'}</button>
        {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      </div>
    </div>
  );
};

export default RestaurantPanel;
