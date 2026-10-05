import { useCallback, useEffect, useMemo, useState } from 'react';
import { Wallet, Download, Printer, RefreshCw, ChevronDown, ChevronUp, Eye, Banknote, ArrowLeftRight, CreditCard, Smartphone, Plus, Minus, Lock, Unlock, Info, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { formatPrice, getColombiaTodayStr } from '@/lib/format';
import { cn } from '@/lib/utils';
import { downloadXlsx } from '@/lib/xlsx';
import { canDo } from '@/lib/permissions';
import { ZReportModal } from '@/components/ZReportModal';
import { printThermal, generateZReportHtml } from '@/lib/thermalPrint';

type Tab = 'ventas' | 'movimientos' | 'arqueos' | 'propinas' | 'descuentos';
type Period = 'day' | 'week' | 'month' | 'custom';
const INPUT = 'w-full px-3 py-2 rounded-lg border border-input bg-card text-sm outline-none focus:ring-2 focus:ring-primary/20';
const SEL = 'px-3 py-2 rounded-lg border border-input bg-card text-sm outline-none';
const LBL = 'text-[11px] font-semibold text-muted-foreground mb-1 block';
const dt = (s?: string | null) => { if (!s) return '—'; const [d, t] = String(s).split(/[ T]/); const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y.slice(2)} ${t ? t.slice(0, 5) : ''}`; };
const STATUS: Record<string, [string, string]> = { delivered: ['Cerrada', 'bg-emerald-100 text-emerald-800'], cancelled: ['Anulada', 'bg-red-100 text-red-700'], billing: ['Pidiendo cuenta', 'bg-amber-100 text-amber-800'] };
const statusOf = (s: string) => STATUS[s] || ['En curso', 'bg-sky-100 text-sky-800'];
const METHODS: Array<[string, string]> = [['cash', 'Efectivo'], ['transfer', 'Transferencia'], ['card', 'Datáfono'], ['platform', 'Plataforma'], ['credit', 'Crédito']];
const ARQUEO: Array<{ key: 'cash' | 'transfer' | 'card'; label: string; icon: any }> = [
  { key: 'cash', label: 'Efectivo', icon: Banknote }, { key: 'transfer', label: 'Transferencias bancarias', icon: ArrowLeftRight }, { key: 'card', label: 'Datáfono', icon: CreditCard },
];

/** Filtro común: período (diario, semanal, mensual, personalizado) o turno. */
interface Scope { period: Period; date: string; from: string; to: string; shiftId: string }
const scopeParams = (s: Scope) => (s.shiftId ? { shiftId: s.shiftId } : s.period === 'custom' ? { period: 'custom', from: s.from, to: s.to } : { period: s.period, date: s.date });

const Kpi = ({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) => (
  <div className={cn('px-4 py-3 border-r border-b sm:border-b-0 border-border last:border-r-0 sm:min-w-[130px]', tone)}>
    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
    <p className="font-display font-bold text-xl text-brand-dark leading-tight">{value}</p>
    {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
  </div>
);

const CajaPage = () => {
  const currentShift = useStore(s => s.currentShift);
  const [tab, setTab] = useState<Tab>('ventas');
  const [shifts, setShifts] = useState<any[]>([]);
  const today = getColombiaTodayStr();
  const [scope, setScope] = useState<Scope>({ period: 'day', date: today, from: today, to: today, shiftId: '' });
  const loadShifts = useCallback(() => { api.getCajaShifts().then(setShifts).catch(() => {}); }, []);
  useEffect(() => { loadShifts(); }, [loadShifts, currentShift?.id, currentShift?.status]);

  const tabs: Array<[Tab, string]> = [['ventas', 'Ventas'], ['movimientos', 'Movimientos de caja'], ['arqueos', 'Arqueos de caja'], ['propinas', 'Propinas'], ['descuentos', 'Descuentos']];
  return (
    <div className="-m-4 lg:-m-6 min-h-full font-sans" data-testid="caja-page">
      <div className="bg-brand-surface text-brand-on-dark px-2 sm:px-4 flex items-stretch overflow-x-auto">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} data-caja-tab={k} className={cn('px-4 py-3 text-sm whitespace-nowrap flex items-center gap-2 transition-colors', tab === k ? 'bg-white/15 font-bold' : 'opacity-80 hover:opacity-100')}>
            {l}
            {k === 'arqueos' && <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-full', currentShift ? 'bg-emerald-400 text-emerald-950' : 'bg-white/20')}>{currentShift ? 'Abierto' : 'Cerrado'}</span>}
          </button>
        ))}
      </div>
      <div className="p-3 lg:p-5 space-y-3">
        {tab !== 'arqueos' && <ScopeBar scope={scope} setScope={setScope} shifts={shifts} />}
        {tab === 'ventas' && <VentasTab scope={scope} />}
        {tab === 'movimientos' && <MovimientosTab scope={scope} />}
        {tab === 'arqueos' && <ArqueosTab shifts={shifts} reload={loadShifts} />}
        {tab === 'propinas' && <PropinasTab scope={scope} />}
        {tab === 'descuentos' && <DescuentosTab scope={scope} />}
      </div>
    </div>
  );
};

const ScopeBar = ({ scope, setScope, shifts, children }: { scope: Scope; setScope: (s: Scope) => void; shifts: any[]; children?: any }) => (
  <div className="bg-card rounded-xl border border-border p-3 flex flex-wrap items-end gap-2">
    <div><label className={LBL}>Turno</label>
      <select value={scope.shiftId} onChange={e => setScope({ ...scope, shiftId: e.target.value })} className={SEL} data-scope-shift>
        <option value="">Todos (por fecha)</option>
        {shifts.map(s => <option key={s.id} value={s.id}>#{s.id} · {s.cashierName} · {dt(s.openedAt)}{s.status === 'open' ? ' (abierto)' : ''}</option>)}
      </select></div>
    {!scope.shiftId && (
      <>
        <div><label className={LBL}>Período</label>
          <select value={scope.period} onChange={e => setScope({ ...scope, period: e.target.value as Period })} className={SEL}>
            <option value="day">Diario</option><option value="week">Últimos 7 días</option><option value="month">Mensual</option><option value="custom">Personalizado</option>
          </select></div>
        {scope.period === 'custom' ? (
          <>
            <div><label className={LBL}>Desde</label><input type="date" value={scope.from} onChange={e => setScope({ ...scope, from: e.target.value })} className={SEL} /></div>
            <div><label className={LBL}>Hasta</label><input type="date" value={scope.to} onChange={e => setScope({ ...scope, to: e.target.value })} className={SEL} /></div>
          </>
        ) : <div><label className={LBL}>Fecha</label><input type="date" value={scope.date} onChange={e => setScope({ ...scope, date: e.target.value })} className={SEL} data-scope-date /></div>}
      </>
    )}
    {children}
  </div>
);

/* =================== VENTAS =================== */
const VentasTab = ({ scope }: { scope: Scope }) => {
  const [f, setF] = useState({ status: '', type: '', waiter: '', method: '', search: '' });
  const [data, setData] = useState<any>(null);
  const [more, setMore] = useState(false);
  const [sel, setSel] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(() => { setLoading(true); api.getCajaSales({ ...scopeParams(scope), ...f }).then(setData).catch(e => toast.error(e.message)).finally(() => setLoading(false)); }, [scope, f]);
  useEffect(() => { load(); }, [load]);
  const s = data?.summary;
  const exportX = () => data && downloadXlsx(`ventas_${data.scope.label.replace(/\s+/g, '_')}`, [{ name: 'Ventas', headers: ['ID', 'Fecha apertura', 'Hora apertura', 'Fecha cierre', 'Hora cierre', 'Estado', 'Tipo', 'Mesa', 'Mesero / Repartidor', 'Cliente', 'Medio de pago', 'Venta', 'Propina', 'Descuento', 'Total cobrado'],
    rows: data.orders.map((o: any) => [o.id, o.createdAt?.slice(0, 10), o.createdAt?.slice(11, 16), o.closedAt?.slice(0, 10) || '', o.closedAt?.slice(11, 16) || '', statusOf(o.status)[0], o.typeLabel, o.table || '', o.waiter, o.customer, o.methodLabel, o.total, o.tip, o.discount, o.total + o.tip]), widths: [7, 11, 8, 11, 8, 11, 12, 6, 20, 22, 14, 12, 10, 10, 13] }]);
  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-3 items-start">
      <div className="space-y-3 min-w-0">
        <div className="bg-card rounded-xl border border-border p-3 flex flex-wrap items-end gap-2">
          <div><label className={LBL}>Estado de venta</label><select value={f.status} onChange={e => setF({ ...f, status: e.target.value })} className={SEL}><option value="">Todas</option><option value="closed">Cerradas</option><option value="active">En curso</option><option value="cancelled">Anuladas</option></select></div>
          <div><label className={LBL}>Tipo de venta</label><select value={f.type} onChange={e => setF({ ...f, type: e.target.value })} className={SEL}><option value="">Todas</option><option value="dine-in">Mesa</option><option value="pickup">Para llevar / mostrador</option><option value="delivery">Domicilio</option></select></div>
          <div><label className={LBL}>Mesero / Repartidor</label><select value={f.waiter} onChange={e => setF({ ...f, waiter: e.target.value })} className={SEL}><option value="">Todos</option>{(data?.waiters || []).map((w: string) => <option key={w} value={w}>{w}</option>)}</select></div>
          <div><label className={LBL}>Medio de pago</label><select value={f.method} onChange={e => setF({ ...f, method: e.target.value })} className={SEL}><option value="">Todos</option>{METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div className="flex-1 min-w-[150px]"><label className={LBL}>Buscar</label><div className="relative"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={f.search} onChange={e => setF({ ...f, search: e.target.value })} placeholder="ID, cliente o etiqueta" className={cn(INPUT, 'pl-8')} /></div></div>
          <button onClick={exportX} className="px-3 py-2 rounded-lg border border-brand-primary/30 text-sm font-semibold flex items-center gap-1.5"><Download size={14} /> Exportar</button>
        </div>
        {s && (
          <div className="bg-card rounded-xl border border-border overflow-hidden" data-ventas-summary>
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap">
              <div className="px-4 py-3 border-r border-border text-[11px] text-muted-foreground italic min-w-[120px]">{data.scope.label}<br />{data.orders.length} registros</div>
              <Kpi label="Ventas" value={String(s.count)} sub={s.cancelled ? `${s.cancelled} anulada(s)` : undefined} />
              <Kpi label="Promedio por venta" value={formatPrice(s.avgTicket)} />
              <Kpi label="Personas" value={String(s.people)} />
              <Kpi label="Promedio por persona" value={formatPrice(s.avgPerPerson)} />
              <Kpi label="Propinas" value={formatPrice(s.tips)} tone="bg-amber-50" />
              <Kpi label="Total ventas" value={formatPrice(s.total)} sub={`Con propinas ${formatPrice(s.totalWithTips)}`} />
            </div>
            <button onClick={() => setMore(m => !m)} className="w-full py-1.5 border-t border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center justify-center gap-1">Más info {more ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</button>
            {more && (
              <div className="grid sm:grid-cols-3 gap-3 p-3 border-t border-border text-xs">
                <div><p className="font-bold text-brand-dark mb-1">Por medio de pago (incluye propinas)</p>{data.byMethod.map((m: any) => <div key={m.method} className="flex justify-between"><span>{m.label}</span><b>{formatPrice(m.amount)}</b></div>)}{s.pending > 0 && <div className="flex justify-between text-amber-700"><span>Por cobrar</span><b>{formatPrice(s.pending)}</b></div>}</div>
                <div><p className="font-bold text-brand-dark mb-1">Por tipo de venta</p>{data.byType.map((t: any) => <div key={t.type} className="flex justify-between"><span>{t.label} ({t.count})</span><b>{formatPrice(t.total)}</b></div>)}</div>
                <div><p className="font-bold text-brand-dark mb-1">Ajustes</p><div className="flex justify-between"><span>Descuentos</span><b>{formatPrice(s.discounts)}</b></div><div className="flex justify-between"><span>Anuladas</span><b>{formatPrice(s.cancelledTotal)}</b></div><div className="flex justify-between"><span>Propinas</span><b>{formatPrice(s.tips)}</b></div></div>
              </div>
            )}
          </div>
        )}
        <div className="bg-card rounded-xl border border-border overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="bg-muted/40 text-muted-foreground"><th className="px-3 py-2 text-left font-semibold">ID / Etiqueta</th><th className="px-3 py-2 text-left font-semibold">Hora inicio</th><th className="px-3 py-2 text-left font-semibold">Hora cierre</th><th className="px-3 py-2 text-left font-semibold">Estado</th><th className="px-3 py-2 text-left font-semibold">Mesa</th><th className="px-3 py-2 text-left font-semibold">Cam / Rep</th><th className="px-3 py-2 text-left font-semibold">Cliente</th><th className="px-3 py-2 text-left font-semibold">Medio</th><th className="px-3 py-2 text-right font-semibold">Propina</th><th className="px-3 py-2 text-right font-semibold">Total</th></tr></thead>
            <tbody>
              {(data?.orders || []).map((o: any) => {
                const [sl, sc] = statusOf(o.status);
                return (
                  <tr key={o.id} onClick={() => setSel(o)} className={cn('border-t border-border cursor-pointer hover:bg-brand-button/5', sel?.id === o.id && 'bg-brand-card', o.status === 'cancelled' && 'opacity-60')}>
                    <td className="px-3 py-2 font-semibold whitespace-nowrap"><span className={cn('inline-block w-1 h-4 mr-2 align-middle rounded', o.status === 'cancelled' ? 'bg-red-500' : o.status === 'delivered' ? 'bg-emerald-500' : 'bg-sky-500')} />#{o.id}{o.label ? <span className="text-muted-foreground font-normal"> · {o.label}</span> : ''}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{dt(o.createdAt)}</td><td className="px-3 py-2 whitespace-nowrap">{dt(o.closedAt)}</td>
                    <td className="px-3 py-2"><span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold', sc)}>{sl}</span></td>
                    <td className="px-3 py-2">{o.table || '—'}</td><td className="px-3 py-2">{o.waiter || '—'}</td><td className="px-3 py-2 truncate max-w-[140px]">{o.customer || '—'}</td>
                    <td className="px-3 py-2">{o.paymentStatus === 'paid' ? o.methodLabel : o.status === 'cancelled' ? '—' : 'Por cobrar'}</td>
                    <td className="px-3 py-2 text-right">{o.tip ? formatPrice(o.tip) : ''}</td><td className="px-3 py-2 text-right font-bold">{formatPrice(o.total)}</td>
                  </tr>
                );
              })}
              {data && data.orders.length === 0 && <tr><td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">{loading ? 'Cargando...' : 'No hay ventas con estos filtros.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <SaleDetail o={sel} onClose={() => setSel(null)} />
    </div>
  );
};

const SaleDetail = ({ o, onClose }: { o: any; onClose: () => void }) => {
  const [full, setFull] = useState<any>(null);
  useEffect(() => { setFull(null); if (o) api.getOrder(o.id).then(setFull).catch(() => {}); }, [o?.id]);
  if (!o) return <div className="hidden lg:flex bg-card rounded-xl border border-border min-h-[240px] items-center justify-center text-sm text-muted-foreground sticky top-3">‹ Selecciona una venta del listado</div>;
  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-2 sticky top-3 text-sm">
      <div className="flex items-center justify-between"><p className="font-display font-bold text-brand-dark">Venta #{o.id}</p><button onClick={onClose} className="w-7 h-7 rounded-full bg-muted flex items-center justify-center"><X size={14} /></button></div>
      <div className="text-xs space-y-0.5 text-muted-foreground">
        <p>{o.typeLabel}{o.table ? ` · Mesa ${o.table}` : ''}{o.people ? ` · ${o.people} personas` : ''}</p>
        <p>Abrió {dt(o.createdAt)} · cerró {dt(o.closedAt)}{o.closedBy ? ` · ${o.closedBy}` : ''}</p>
        {o.waiter && <p>Atendió: {o.waiter}</p>}{o.customer && <p>Cliente: {o.customer}</p>}
      </div>
      <div className="border-t border-border pt-2 space-y-1 text-xs">
        {(full?.items || []).map((i: any, k: number) => <div key={k} className="flex justify-between gap-2"><span>{i.quantity}x {i.name}</span><span>{formatPrice(i.price * i.quantity)}</span></div>)}
        {!full && <p className="text-muted-foreground">Cargando productos...</p>}
      </div>
      <div className="border-t border-border pt-2 text-xs space-y-0.5">
        {o.discount > 0 && <div className="flex justify-between text-red-700"><span>Descuento{o.discountReason ? ` (${o.discountReason})` : ''}</span><span>−{formatPrice(o.discount)}</span></div>}
        <div className="flex justify-between font-bold text-sm text-brand-dark"><span>Total venta</span><span>{formatPrice(o.total)}</span></div>
        {o.tip > 0 && <div className="flex justify-between text-amber-800"><span>Propina</span><span>{formatPrice(o.tip)}</span></div>}
        <div className="flex justify-between"><span>Cobrado</span><span>{o.paymentStatus === 'paid' ? formatPrice(o.total + o.tip) : 'Pendiente'}</span></div>
        {Object.entries(o.parts || {}).map(([m, v]: any) => <div key={m} className="flex justify-between text-muted-foreground"><span>· {METHODS.find(x => x[0] === m)?.[1] || (m.startsWith('card') ? 'Datáfono' : m)}</span><span>{formatPrice(v)}</span></div>)}
      </div>
    </div>
  );
};

/* =================== MOVIMIENTOS =================== */
const MovimientosTab = ({ scope }: { scope: Scope }) => {
  const user = useStore(s => s.user);
  const currentShift = useStore(s => s.currentShift);
  const addCashMovement = useStore(s => s.addCashMovement);
  const [data, setData] = useState<any>(null);
  const [form, setForm] = useState<null | 'withdrawal' | 'deposit'>(null);
  const [amount, setAmount] = useState(''); const [reason, setReason] = useState('');
  const load = useCallback(() => { api.getCajaMovements(scopeParams(scope)).then(setData).catch(e => toast.error(e.message)); }, [scope]);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    try { await addCashMovement(Math.round(Number(amount)), reason.trim(), form!); toast.success(form === 'withdrawal' ? 'Egreso registrado' : 'Ingreso registrado'); setForm(null); setAmount(''); setReason(''); load(); } catch (e: any) { toast.error(e.message); }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="bg-card rounded-xl border border-border px-4 py-2"><p className="text-[11px] font-semibold text-muted-foreground uppercase">Ingresos</p><p className="font-bold text-emerald-700">{formatPrice(data?.deposits || 0)}</p></div>
        <div className="bg-card rounded-xl border border-border px-4 py-2"><p className="text-[11px] font-semibold text-muted-foreground uppercase">Egresos</p><p className="font-bold text-red-700">{formatPrice(data?.withdrawals || 0)}</p></div>
        <div className="flex-1" />
        {currentShift && canDo(user, 'cash_withdrawals') && <>
          <button onClick={() => setForm('deposit')} className="px-3 py-2 rounded-lg border border-emerald-300 text-emerald-800 bg-emerald-50 text-sm font-semibold flex items-center gap-1.5"><Plus size={14} /> Ingreso de efectivo</button>
          <button onClick={() => setForm('withdrawal')} className="px-3 py-2 rounded-lg border border-red-300 text-red-700 bg-red-50 text-sm font-semibold flex items-center gap-1.5"><Minus size={14} /> Egreso / retiro</button>
        </>}
        <button onClick={() => data && downloadXlsx('movimientos_de_caja', [{ name: 'Movimientos', headers: ['Fecha', 'Hora', 'Turno', 'Tipo', 'Concepto', 'Origen', 'Usuario', 'Valor'], rows: data.movements.map((m: any) => [m.date.slice(0, 10), m.date.slice(11, 16), m.shiftId, m.typeLabel, m.reason, m.origin, m.user, m.type === 'withdrawal' ? -m.amount : m.amount]) }])} className="px-3 py-2 rounded-lg border border-brand-primary/30 text-sm font-semibold flex items-center gap-1.5"><Download size={14} /> Exportar</button>
      </div>
      {form && (
        <div className="bg-card rounded-xl border border-border p-3 flex flex-wrap items-end gap-2">
          <div><label className={LBL}>{form === 'withdrawal' ? 'Valor del egreso' : 'Valor del ingreso'}</label><input type="number" value={amount} onChange={e => setAmount(e.target.value)} className={cn(INPUT, 'w-36 font-mono')} /></div>
          <div className="flex-1 min-w-[200px]"><label className={LBL}>Concepto</label><input value={reason} onChange={e => setReason(e.target.value)} placeholder={form === 'withdrawal' ? 'Ej: compra de hielo' : 'Ej: base adicional'} className={INPUT} /></div>
          <button onClick={save} disabled={!(Number(amount) > 0) || reason.trim().length < 2} className="px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-40">Registrar</button>
          <button onClick={() => setForm(null)} className="px-3 py-2 rounded-lg border border-border text-sm">Cancelar</button>
        </div>
      )}
      <div className="bg-card rounded-xl border border-border overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="bg-muted/40 text-muted-foreground"><th className="px-3 py-2 text-left font-semibold">Fecha</th><th className="px-3 py-2 text-left font-semibold">Turno</th><th className="px-3 py-2 text-left font-semibold">Tipo</th><th className="px-3 py-2 text-left font-semibold">Concepto</th><th className="px-3 py-2 text-left font-semibold">Origen</th><th className="px-3 py-2 text-left font-semibold">Usuario</th><th className="px-3 py-2 text-right font-semibold">Valor</th></tr></thead>
          <tbody>
            {(data?.movements || []).map((m: any) => <tr key={m.id} className="border-t border-border"><td className="px-3 py-2 whitespace-nowrap">{dt(m.date)}</td><td className="px-3 py-2">#{m.shiftId}</td><td className="px-3 py-2"><span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold', m.type === 'withdrawal' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800')}>{m.typeLabel}</span></td><td className="px-3 py-2">{m.reason}</td><td className="px-3 py-2 text-muted-foreground">{m.origin}</td><td className="px-3 py-2">{m.user}</td><td className={cn('px-3 py-2 text-right font-bold', m.type === 'withdrawal' ? 'text-red-700' : 'text-emerald-700')}>{m.type === 'withdrawal' ? '−' : '+'}{formatPrice(m.amount)}</td></tr>)}
            {data && data.movements.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Sin movimientos de caja en este período.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* =================== ARQUEOS =================== */
const ArqueosTab = ({ shifts, reload }: { shifts: any[]; reload: () => void }) => {
  const user = useStore(s => s.user);
  const currentShift = useStore(s => s.currentShift);
  const refreshCurrentShift = useStore(s => s.refreshCurrentShift);
  const openShift = useStore(s => s.openShift);
  const [live, setLive] = useState<any>(null);
  const [counted, setCounted] = useState<Record<string, string>>({ cash: '', transfer: '', card: '' });
  const [notes, setNotes] = useState('');
  const [openIn, setOpenIn] = useState(false);
  const [openOut, setOpenOut] = useState(false);
  const [closing, setClosing] = useState(false);
  const [viewShift, setViewShift] = useState<any>(null);
  const [base, setBase] = useState('100000');
  const [cashier, setCashier] = useState(user?.name || '');
  const loadLive = useCallback(() => { api.getCurrentShift().then(setLive).catch(() => setLive(null)); }, []);
  useEffect(() => { loadLive(); const t = setInterval(loadLive, 15000); return () => clearInterval(t); }, [loadLive, currentShift?.id]);

  const exp = live?.expectedByMethod || { cash: 0, transfer: 0, card: 0 };
  const tips = live?.tips || { cash: 0, transfer: 0, card: 0, platform: 0 };
  const ingreso = (live ? live.cashSales + live.transferSales + live.debitSales + live.creditSales + (live.totalTips || 0) - (tips.platform || 0) + (live.totalDeposits || 0) : 0);
  const egreso = live?.totalWithdrawals || 0;
  const sysTotal = exp.cash + exp.transfer + exp.card;
  const userTotal = ARQUEO.reduce((a, m) => a + (Math.round(Number(counted[m.key]) || 0)), 0);
  const allFilled = ARQUEO.every(m => counted[m.key] !== '');
  const diff = userTotal - sysTotal;

  const close = async () => {
    if (!allFilled) { toast.error('Ingresa lo contado en cada medio de pago'); return; }
    setClosing(true);
    try {
      const r = await api.closeShift({ counted: { cash: Number(counted.cash) || 0, transfer: Number(counted.transfer) || 0, card: Number(counted.card) || 0 }, notes } as any);
      await refreshCurrentShift();
      setCounted({ cash: '', transfer: '', card: '' }); setNotes(''); reload();
      const rep = await api.getShiftReport(r.id).catch(() => r);
      setViewShift(rep);
      toast.success('Caja cerrada');
    } catch (e: any) { toast.error(e.message); }
    setClosing(false);
  };
  const open = async () => { try { await openShift(Math.round(Number(base) || 0), cashier || user?.name || 'Caja', 'Apertura de turno'); reload(); loadLive(); toast.success('Caja abierta'); } catch (e: any) { toast.error(e.message); } };
  const printX = async () => { if (live) await printThermal(generateZReportHtml({ ...live, countedDetail: null }, { paperSize: '80mm', isReportX: true }), `Reporte-X-${live.id}`); };

  return (
    <div className="grid lg:grid-cols-[420px_1fr] gap-4 items-start">
      {/* Arqueo actual */}
      {!currentShift ? (
        <div className="bg-card rounded-2xl border border-border overflow-hidden" data-open-shift>
          <div className="px-4 py-3 bg-brand-button text-brand-on-button font-bold flex items-center gap-2"><Unlock size={16} /> ABRIR CAJA</div>
          <div className="p-4 space-y-3">
            <div><label className={LBL}>Monto inicial (base en efectivo)</label><input type="number" value={base} onChange={e => setBase(e.target.value)} className={cn(INPUT, 'font-mono text-lg')} /></div>
            <div><label className={LBL}>Responsable</label><input value={cashier} onChange={e => setCashier(e.target.value)} className={INPUT} /></div>
            <button onClick={open} disabled={!canDo(user, 'cash_withdrawals') && user?.role !== 'admin' && false} className="w-full py-3 rounded-xl gradient-primary text-primary-foreground font-bold">Abrir caja</button>
          </div>
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-card" data-arqueo>
          <div className="px-4 py-3 bg-orange-500 text-white flex items-center justify-between">
            <p className="font-bold tracking-wide">ARQUEO DE CAJA</p>
            <div className="flex gap-1.5">
              <button onClick={loadLive} title="Actualizar" className="w-9 h-9 rounded-lg bg-black/15 hover:bg-black/25 flex items-center justify-center"><RefreshCw size={15} /></button>
              <button onClick={printX} title="Imprimir reporte X (parcial)" className="w-9 h-9 rounded-lg bg-black/15 hover:bg-black/25 flex items-center justify-center"><Printer size={15} /></button>
            </div>
          </div>
          {live && (
            <>
              <div className="px-4 py-3 text-xs grid grid-cols-[120px_1fr] gap-y-1.5">
                <span className="text-muted-foreground">Hora de apertura</span><b>{dt(live.opened_at || live.openedAt)}</b>
                <span className="text-muted-foreground">Creado por</span><b>{live.cashierName}</b>
                <span className="text-muted-foreground">Estado</span><b>Abierto · turno #{live.id}</b>
              </div>
              <div className="text-sm">
                <div className="px-4 py-2.5 flex justify-between border-t border-border font-bold"><span>MONTO INICIAL</span><span>{formatPrice(live.initialCash)}</span></div>
                <button onClick={() => setOpenIn(v => !v)} className="w-full px-4 py-2.5 flex justify-between border-t border-border font-bold"><span className="flex items-center gap-1">{openIn ? <ChevronUp size={14} /> : <ChevronDown size={14} />} INGRESO</span><span>{formatPrice(ingreso)}</span></button>
                {openIn && (
                  <div className="px-6 pb-2 text-xs space-y-0.5 bg-muted/20" data-ingreso-detalle>
                    <div className="flex justify-between"><span>Ventas en efectivo</span><span>{formatPrice(live.cashSales)}</span></div>
                    <div className="flex justify-between"><span>Ventas por transferencia</span><span>{formatPrice(live.transferSales)}</span></div>
                    <div className="flex justify-between"><span>Ventas por datáfono</span><span>{formatPrice(live.debitSales + live.creditSales)}</span></div>
                    <div className="flex justify-between text-amber-800 font-semibold"><span>Propinas (efectivo {formatPrice(tips.cash)} · transf. {formatPrice(tips.transfer)} · datáfono {formatPrice(tips.card)})</span><span>{formatPrice(tips.cash + tips.transfer + tips.card)}</span></div>
                    {live.totalDeposits > 0 && <div className="flex justify-between"><span>Ingresos de efectivo</span><span>{formatPrice(live.totalDeposits)}</span></div>}
                    {live.platformSales > 0 && <div className="flex justify-between text-muted-foreground"><span>Plataformas (no entra a caja)</span><span>{formatPrice(live.platformSales)}</span></div>}
                    {live.pendingSales > 0 && <div className="flex justify-between text-muted-foreground"><span>Por cobrar (no entra a caja)</span><span>{formatPrice(live.pendingSales)}</span></div>}
                  </div>
                )}
                <button onClick={() => setOpenOut(v => !v)} className="w-full px-4 py-2.5 flex justify-between border-t border-border font-bold"><span className="flex items-center gap-1">{openOut ? <ChevronUp size={14} /> : <ChevronDown size={14} />} EGRESO</span><span>{formatPrice(egreso)}</span></button>
                {openOut && <div className="px-6 pb-2 text-xs space-y-0.5 bg-muted/20">{(live.movements || []).filter((m: any) => m.type === 'withdrawal').map((m: any) => <div key={m.id} className="flex justify-between"><span>{m.reason}</span><span>{formatPrice(m.amount)}</span></div>)}{egreso === 0 && <p className="text-muted-foreground">Sin egresos.</p>}</div>}
                <div className="px-4 py-3 flex justify-between border-t border-border bg-muted/40"><span>Total</span><span className="text-lg font-bold">{formatPrice(live.initialCash + ingreso - egreso)}</span></div>
              </div>
              <div className="px-4 py-2.5 bg-brand-surface text-brand-on-dark text-sm font-bold">SEGÚN USUARIO</div>
              <table className="w-full text-sm">
                <thead><tr className="text-xs"><th /><th className="px-3 py-2 text-right font-semibold">$ Sistema</th><th className="px-3 py-2 text-right font-semibold bg-muted/40">$ Usuario</th></tr></thead>
                <tbody>
                  {ARQUEO.map(m => (
                    <tr key={m.key} className="border-t border-border">
                      <td className="px-3 py-2 text-xs"><span className="flex items-center gap-1.5"><m.icon size={14} /> {m.label} <span className="text-red-600">*</span></span></td>
                      <td className="px-3 py-2 text-right font-mono" data-sistema={m.key}>{formatPrice(exp[m.key])}</td>
                      <td className="px-2 py-1.5 bg-muted/40"><input type="number" inputMode="numeric" value={counted[m.key]} onChange={e => setCounted(c => ({ ...c, [m.key]: e.target.value }))} data-usuario={m.key} className="w-full px-2 py-1.5 rounded-md border border-input bg-white text-right font-mono" /></td>
                    </tr>
                  ))}
                  <tr className="border-t border-border bg-muted/40"><td className="px-3 py-2 font-semibold">Total</td><td className="px-3 py-2 text-right font-mono">{formatPrice(sysTotal)}</td><td className="px-3 py-2 text-right font-mono font-bold">{formatPrice(userTotal)}</td></tr>
                </tbody>
              </table>
              <div className={cn('px-4 py-3 flex justify-between text-white font-bold', diff === 0 && allFilled ? 'bg-emerald-600' : 'bg-red-500')} data-diferencia>
                <span>Diferencia</span><span className="text-lg">{diff > 0 ? '+' : ''}{formatPrice(diff)}</span>
              </div>
              {allFilled && <div className="px-4 py-2 text-[11px] space-y-0.5 bg-muted/20">{ARQUEO.map(m => { const d = (Math.round(Number(counted[m.key]) || 0)) - exp[m.key]; return d !== 0 ? <div key={m.key} className={cn('flex justify-between', d < 0 ? 'text-red-700' : 'text-emerald-700')}><span>{m.label}</span><span>{d > 0 ? 'Sobran ' : 'Faltan '}{formatPrice(Math.abs(d))}</span></div> : null; })}</div>}
              <div className="p-4 space-y-2 border-t border-border">
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observaciones del cierre (ej: se pagó el hielo con efectivo)" className={cn(INPUT, 'h-16 text-xs')} />
                <button onClick={close} disabled={closing || !allFilled} className="w-full py-3 rounded-xl bg-brand-surface text-brand-on-dark font-bold flex items-center justify-center gap-2 disabled:opacity-40" data-cerrar-caja><Lock size={16} /> {closing ? 'Cerrando...' : 'Cerrar caja'}</button>
                <p className="text-[10px] text-muted-foreground flex items-start gap-1"><Info size={11} className="mt-0.5 shrink-0" /> El sistema va sumando lo cobrado en cada medio, incluidas las propinas. Al cerrar, cuenta el efectivo, revisa transferencias y datáfono e ingrésalos: la diferencia debe quedar en cero.</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Historial de arqueos */}
      <div className="bg-card rounded-2xl border border-border overflow-x-auto">
        <p className="px-4 py-3 font-bold text-brand-dark border-b border-border">Arqueos de caja</p>
        <table className="w-full text-xs">
          <thead><tr className="bg-muted/40 text-muted-foreground"><th className="px-3 py-2 text-left font-semibold">Turno</th><th className="px-3 py-2 text-left font-semibold">Apertura</th><th className="px-3 py-2 text-left font-semibold">Cierre</th><th className="px-3 py-2 text-left font-semibold">Responsable</th><th className="px-3 py-2 text-right font-semibold">Ventas</th><th className="px-3 py-2 text-right font-semibold">Propinas</th><th className="px-3 py-2 text-right font-semibold">Diferencia</th><th /></tr></thead>
          <tbody>
            {shifts.map(s => {
              const cd = s.countedDetail, ed = s.expectedDetail;
              const totalDiff = cd && ed ? ['cash', 'transfer', 'card'].reduce((a, k) => a + ((cd[k] ?? ed[k]) - ed[k]), 0) : s.difference;
              return (
                <tr key={s.id} className="border-t border-border">
                  <td className="px-3 py-2 font-semibold">#{s.id} {s.status === 'open' && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px]">Abierto</span>}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{dt(s.openedAt)}</td><td className="px-3 py-2 whitespace-nowrap">{dt(s.closedAt)}</td><td className="px-3 py-2">{s.cashierName}</td>
                  <td className="px-3 py-2 text-right">{s.status === 'closed' ? formatPrice(s.totalSales) : '—'}</td><td className="px-3 py-2 text-right">{s.status === 'closed' ? formatPrice(s.totalTips) : '—'}</td>
                  <td className={cn('px-3 py-2 text-right font-bold', s.status !== 'closed' ? '' : totalDiff === 0 ? 'text-emerald-700' : 'text-red-600')}>{s.status === 'closed' ? (totalDiff === 0 ? 'Exacto' : formatPrice(totalDiff)) : '—'}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button onClick={() => api.getShiftReport(s.id).then(setViewShift).catch(e => toast.error(e.message))} className="px-2.5 py-1 rounded-lg bg-brand-button text-brand-on-button font-bold inline-flex items-center gap-1"><Eye size={12} /> Ver</button>
                  </td>
                </tr>
              );
            })}
            {shifts.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Aún no hay arqueos.</td></tr>}
          </tbody>
        </table>
      </div>
      {viewShift && <ZReportModal shift={viewShift} onClose={() => setViewShift(null)} />}
    </div>
  );
};

/* =================== PROPINAS =================== */
const PropinasTab = ({ scope }: { scope: Scope }) => {
  const [f, setF] = useState({ waiter: '', type: '', method: '' });
  const [data, setData] = useState<any>(null);
  const [waiters, setWaiters] = useState<string[]>([]);
  useEffect(() => { api.getCajaTips({ ...scopeParams(scope), ...f }).then(setData).catch(e => toast.error(e.message)); }, [scope, f]);
  useEffect(() => { api.getCajaSales({ ...scopeParams(scope) }).then(d => setWaiters(d.waiters || [])).catch(() => {}); }, [scope]);
  const exportX = () => data && downloadXlsx('propinas', [{ name: 'Propinas', headers: ['Fecha', 'Hora', 'Venta', 'Mesa', 'Tipo', 'Mesero / Repartidor', 'Cliente', 'Medio de pago', 'Total de venta', 'Propina'], rows: data.tips.map((t: any) => [String(t.date).slice(0, 10), String(t.date).slice(11, 16), t.id || '', t.table || '', t.type, t.waiter, t.customer, t.method, t.saleTotal, t.amount]) }, { name: 'Por mesero', headers: ['Mesero', 'Propinas'], rows: data.byWaiter.map((w: any) => [w.waiter, w.amount]) }]);
  return (
    <div className="space-y-3">
      <div className="bg-card rounded-xl border border-border p-3 flex flex-wrap items-end gap-2">
        <div><label className={LBL}>Mesero / Repartidor</label><select value={f.waiter} onChange={e => setF({ ...f, waiter: e.target.value })} className={SEL}><option value="">Todos</option>{waiters.map(w => <option key={w} value={w}>{w}</option>)}</select></div>
        <div><label className={LBL}>Tipo de venta</label><select value={f.type} onChange={e => setF({ ...f, type: e.target.value })} className={SEL}><option value="">Todos</option><option value="dine-in">Mesa</option><option value="pickup">Para llevar</option><option value="delivery">Domicilio</option></select></div>
        <div><label className={LBL}>Medio de pago</label><select value={f.method} onChange={e => setF({ ...f, method: e.target.value })} className={SEL}><option value="">Todos</option>{METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="flex-1" />
        <button onClick={exportX} className="px-3 py-2 rounded-lg border border-brand-primary/30 text-sm font-semibold flex items-center gap-1.5"><Download size={14} /> Exportar</button>
      </div>
      {data && (
        <div className="grid sm:grid-cols-[1fr_1fr_2fr] gap-3">
          <div className="bg-card rounded-xl border border-border p-3"><p className="text-[11px] font-semibold text-muted-foreground uppercase">Registros</p><p className="font-display font-bold text-xl">{data.count}</p></div>
          <div className="bg-amber-50 rounded-xl border border-amber-200 p-3" data-propinas-total><p className="text-[11px] font-semibold text-amber-800 uppercase">Total propinas</p><p className="font-display font-bold text-xl text-amber-900">{formatPrice(data.total)}</p></div>
          <div className="bg-card rounded-xl border border-border p-3 text-xs"><p className="font-bold text-brand-dark mb-1">Por mesero</p><div className="grid grid-cols-2 gap-x-4">{data.byWaiter.map((w: any) => <div key={w.waiter} className="flex justify-between"><span>{w.waiter}</span><b>{formatPrice(w.amount)}</b></div>)}</div></div>
        </div>
      )}
      <div className="bg-card rounded-xl border border-border overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="bg-muted/40 text-muted-foreground"><th className="px-3 py-2 text-left font-semibold">Fecha</th><th className="px-3 py-2 text-left font-semibold">Mesa</th><th className="px-3 py-2 text-left font-semibold">Camarero</th><th className="px-3 py-2 text-left font-semibold">Cliente</th><th className="px-3 py-2 text-left font-semibold">Medio de pago</th><th className="px-3 py-2 text-right font-semibold">Total de venta</th><th className="px-3 py-2 text-right font-semibold">Monto</th></tr></thead>
          <tbody>
            {(data?.tips || []).map((t: any, i: number) => <tr key={i} className="border-t border-border"><td className="px-3 py-2 whitespace-nowrap">{dt(t.date)}</td><td className="px-3 py-2">{t.table || (t.type !== 'Mesa' ? t.type : '—')}</td><td className="px-3 py-2">{t.waiter || '—'}</td><td className="px-3 py-2">{t.customer || '—'}</td><td className="px-3 py-2">{t.method}</td><td className="px-3 py-2 text-right">{t.saleTotal ? formatPrice(t.saleTotal) : '—'}</td><td className="px-3 py-2 text-right font-bold">{formatPrice(t.amount)}</td></tr>)}
            {data && data.tips.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Sin propinas en este período.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* =================== DESCUENTOS =================== */
const DescuentosTab = ({ scope }: { scope: Scope }) => {
  const [data, setData] = useState<any>(null);
  useEffect(() => { api.getCajaDiscounts(scopeParams(scope)).then(setData).catch(e => toast.error(e.message)); }, [scope]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="bg-card rounded-xl border border-border px-4 py-2"><p className="text-[11px] font-semibold text-muted-foreground uppercase">Registros</p><p className="font-bold">{data?.count || 0}</p></div>
        <div className="bg-card rounded-xl border border-border px-4 py-2"><p className="text-[11px] font-semibold text-muted-foreground uppercase">Total descuentos</p><p className="font-bold text-red-700">{formatPrice(data?.total || 0)}</p></div>
        <div className="flex-1" />
        <button onClick={() => data && downloadXlsx('descuentos', [{ name: 'Descuentos', headers: ['Fecha', 'Venta', 'Mesa', 'Tipo', 'Mesero', 'Cliente', 'Motivo', 'Autorizó', 'Total venta', 'Descuento'], rows: data.discounts.map((d: any) => [String(d.date).slice(0, 16), d.id, d.table || '', d.type, d.waiter, d.customer, d.reason, d.by, d.saleTotal, d.amount]) }])} className="px-3 py-2 rounded-lg border border-brand-primary/30 text-sm font-semibold flex items-center gap-1.5"><Download size={14} /> Exportar</button>
      </div>
      <div className="bg-card rounded-xl border border-border overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="bg-muted/40 text-muted-foreground"><th className="px-3 py-2 text-left font-semibold">Fecha</th><th className="px-3 py-2 text-left font-semibold">Venta</th><th className="px-3 py-2 text-left font-semibold">Mesa / Tipo</th><th className="px-3 py-2 text-left font-semibold">Mesero</th><th className="px-3 py-2 text-left font-semibold">Motivo</th><th className="px-3 py-2 text-left font-semibold">Autorizó</th><th className="px-3 py-2 text-right font-semibold">Total venta</th><th className="px-3 py-2 text-right font-semibold">Descuento</th></tr></thead>
          <tbody>
            {(data?.discounts || []).map((d: any) => <tr key={d.id} className="border-t border-border"><td className="px-3 py-2 whitespace-nowrap">{dt(d.date)}</td><td className="px-3 py-2 font-semibold">#{d.id}</td><td className="px-3 py-2">{d.table ? `Mesa ${d.table}` : d.type}</td><td className="px-3 py-2">{d.waiter || '—'}</td><td className="px-3 py-2">{d.reason || '—'}</td><td className="px-3 py-2">{d.by || '—'}</td><td className="px-3 py-2 text-right">{formatPrice(d.saleTotal)}</td><td className="px-3 py-2 text-right font-bold text-red-700">−{formatPrice(d.amount)}</td></tr>)}
            {data && data.discounts.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Sin descuentos en este período.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CajaPage;
