import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import {
  Plus, Edit2, Trash2, X, Search, Landmark, Receipt, CalendarClock, Truck, FolderOpen, TrendingUp, TrendingDown,
  Wallet, AlertTriangle, CheckCircle2, Banknote, CreditCard, ArrowLeftRight, Clock, Filter, BookOpen,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { formatPrice, getColombiaTodayStr } from '@/lib/format';
import { cn } from '@/lib/utils';
import { BRAND } from '@/lib/theme';
import AccountingTab from '@/components/finance/AccountingTab';

/* ------------------------------------------------------------------ */
/* Tipos y constantes                                                   */
/* ------------------------------------------------------------------ */
type Kind = 'cogs' | 'opex' | 'payroll' | 'other';
type PlGroup = 'cost' | 'personnel' | 'admin' | 'sales' | 'financial' | 'other';
const PL_GROUP_META: Record<PlGroup, string> = { cost: 'Costo de ventas', personnel: 'Gastos de personal', admin: 'Gastos administrativos', sales: 'Gastos de ventas', financial: 'Gastos financieros', other: 'Otros gastos' };
const defaultGroup = (k: Kind): PlGroup => (({ cogs: 'cost', payroll: 'personnel', other: 'other' } as Record<string, PlGroup>)[k] || 'admin');
type Tab = 'resumen' | 'contabilidad' | 'gastos' | 'porpagar' | 'proveedores' | 'categorias';
type Period = 'today' | 'week' | 'month' | 'last_month' | 'year' | 'custom';

interface ExpenseCategory { id: number; name: string; emoji: string; kind: Kind; plGroup?: PlGroup; isSystem: boolean }
interface Supplier { id: number; name: string; nit: string; phone: string; email: string; address: string; category: string; notes: string; active: boolean; totalPurchased: number; pendingAmount: number; purchases: number; lastPurchase: string | null }
interface Expense {
  id: number; date: string; categoryId: number; categoryName: string; categoryEmoji: string; categoryKind: Kind;
  supplierId: number | null; supplierName: string | null; description: string; amount: number; paymentMethod: string;
  status: 'paid' | 'pending'; dueDate: string | null; paidAt: string | null; invoiceNumber: string; notes: string;
  fromCashRegister: boolean; source: string; overdue?: boolean; dueSoon?: boolean; taxAmount?: number;
}

const KIND_META: Record<Kind, { label: string; short: string; className: string }> = {
  cogs: { label: 'Costo de insumos (materia prima, empaques)', short: 'Insumos', className: 'bg-amber-100 text-amber-800' },
  opex: { label: 'Gasto operativo (arriendo, servicios, etc.)', short: 'Operativo', className: 'bg-sky-100 text-sky-800' },
  payroll: { label: 'Nómina y pagos al personal', short: 'Nómina', className: 'bg-violet-100 text-violet-800' },
  other: { label: 'Otros', short: 'Otro', className: 'bg-gray-100 text-gray-700' },
};

const PAYMENT_META: Record<string, { label: string; icon: any }> = {
  cash: { label: 'Efectivo', icon: Banknote },
  transfer: { label: 'Transferencia', icon: ArrowLeftRight },
  card: { label: 'Tarjeta', icon: CreditCard },
  credit: { label: 'Crédito (por pagar)', icon: Clock },
};

const INPUT = 'w-full px-3 py-2 rounded-lg border border-input bg-card text-sm font-sans outline-none focus:ring-2 focus:ring-primary/20';
const LABEL = 'text-xs font-medium text-muted-foreground mb-1 block';

const monthStart = () => `${getColombiaTodayStr().slice(0, 7)}-01`;
const fmtDate = (d?: string | null) => {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
};
const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

/* ------------------------------------------------------------------ */
/* Componentes auxiliares                                               */
/* ------------------------------------------------------------------ */
const Modal = ({ title, onClose, children, wide }: { title: string; onClose: () => void; children: any; wide?: boolean }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className={cn('bg-white rounded-t-3xl sm:rounded-2xl w-full p-5 shadow-2xl space-y-3 max-h-[92vh] overflow-y-auto', wide ? 'max-w-2xl' : 'max-w-md')} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-sm text-brand-dark">{title}</h4>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
};

const Chip = ({ active, onClick, children, className }: { active?: boolean; onClick?: () => void; children: any; className?: string }) => (
  <button type="button" onClick={onClick}
    className={cn('px-3 py-1.5 rounded-full text-xs font-semibold border transition-all whitespace-nowrap', active ? 'bg-brand-button text-brand-on-button border-brand-primary' : 'bg-white text-brand-dark border-border hover:bg-muted/40', className)}>
    {children}
  </button>
);

const PeriodBar = ({ period, from, to, onChange }: { period: Period; from: string; to: string; onChange: (p: Period, from: string, to: string) => void }) => (
  <div className="flex flex-wrap items-center gap-2">
    {([['today', 'Hoy'], ['week', '7 días'], ['month', 'Este mes'], ['last_month', 'Mes anterior'], ['year', 'Este año'], ['custom', 'Personalizado']] as Array<[Period, string]>).map(([p, l]) => (
      <Chip key={p} active={period === p} onClick={() => onChange(p, from, to)}>{l}</Chip>
    ))}
    {period === 'custom' && (
      <div className="flex items-center gap-1.5">
        <input type="date" value={from} onChange={e => onChange('custom', e.target.value, to)} className="px-2 py-1.5 rounded-lg border border-input bg-card text-xs" />
        <span className="text-xs text-muted-foreground">a</span>
        <input type="date" value={to} onChange={e => onChange('custom', from, e.target.value)} className="px-2 py-1.5 rounded-lg border border-input bg-card text-xs" />
      </div>
    )}
  </div>
);

const StatusPill = ({ e }: { e: Expense }) => {
  if (e.status === 'paid') return <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">Pagado</span>;
  if (e.overdue) return <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">Vencido</span>;
  return <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">Pendiente</span>;
};

/* ------------------------------------------------------------------ */
/* Modal de gasto                                                       */
/* ------------------------------------------------------------------ */
const ExpenseModal = ({ categories, suppliers, expense, isAdmin, onClose, onSaved }: {
  categories: ExpenseCategory[]; suppliers: Supplier[]; expense: Expense | null; isAdmin: boolean; onClose: () => void; onSaved: (e: Expense) => void;
}) => {
  const currentShift = useStore(s => s.currentShift);
  const refreshCurrentShift = useStore(s => s.refreshCurrentShift);
  const [form, setForm] = useState({
    date: expense?.date || getColombiaTodayStr(),
    categoryId: expense?.categoryId || categories[0]?.id || 0,
    supplierId: expense?.supplierId || 0,
    description: expense?.description || '',
    amount: expense ? String(expense.amount) : '',
    taxAmount: expense && expense.taxAmount ? String(expense.taxAmount) : '',
    paymentMethod: expense?.paymentMethod || 'cash',
    status: expense?.status || 'paid',
    dueDate: expense?.dueDate || '',
    invoiceNumber: expense?.invoiceNumber || '',
    notes: expense?.notes || '',
    fromCashRegister: false,
  });
  const [newSupplier, setNewSupplier] = useState('');
  const [supplierList, setSupplierList] = useState(suppliers);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }));
  const isCredit = form.paymentMethod === 'credit';
  const status = isCredit ? 'pending' : form.status;
  const canCash = form.paymentMethod === 'cash' && status === 'paid' && !expense;

  const quickAddSupplier = async () => {
    if (newSupplier.trim().length < 2) return;
    try {
      const s = await api.addSupplier({ name: newSupplier.trim() });
      setSupplierList(l => [...l, s].sort((a, b) => a.name.localeCompare(b.name)));
      set({ supplierId: s.id });
      setNewSupplier('');
    } catch (e: any) { setError(e.message); }
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        date: form.date, categoryId: Number(form.categoryId), supplierId: form.supplierId ? Number(form.supplierId) : null,
        description: form.description.trim(), amount: Number(form.amount), taxAmount: Number(form.taxAmount) || 0, paymentMethod: form.paymentMethod, status,
        dueDate: status === 'pending' ? form.dueDate || null : null, invoiceNumber: form.invoiceNumber, notes: form.notes,
        fromCashRegister: canCash && form.fromCashRegister,
      };
      const saved = expense ? await api.updateExpense(expense.id, payload) : await api.addExpense(payload);
      if (payload.fromCashRegister) refreshCurrentShift();
      onSaved(saved);
    } catch (e: any) { setError(e.message || 'No se pudo guardar'); }
    setSaving(false);
  };

  return (
    <Modal title={expense ? 'Editar gasto' : 'Registrar gasto o compra'} onClose={onClose} wide>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>Fecha</label>
          <input type="date" value={form.date} onChange={e => set({ date: e.target.value })} className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Categoría</label>
          <select value={form.categoryId} onChange={e => set({ categoryId: Number(e.target.value) })} className={INPUT}>
            {categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL}>Descripción</label>
          <input value={form.description} onChange={e => set({ description: e.target.value })} placeholder="Ej: 20 kg de base de gelato, factura #123" className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Monto</label>
          <input type="number" min={0} value={form.amount} onChange={e => set({ amount: e.target.value })} placeholder="0" className={cn(INPUT, 'font-mono text-base')} />
        </div>
        <div>
          <label className={LABEL}>Proveedor (opcional)</label>
          <select value={form.supplierId} onChange={e => set({ supplierId: Number(e.target.value) })} className={INPUT}>
            <option value={0}>— Sin proveedor —</option>
            {supplierList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {isAdmin && (
            <div className="flex gap-1.5 mt-1.5">
              <input value={newSupplier} onChange={e => setNewSupplier(e.target.value)} placeholder="Nuevo proveedor rápido" className={cn(INPUT, 'text-xs py-1.5')} />
              <button type="button" onClick={quickAddSupplier} disabled={newSupplier.trim().length < 2} className="px-3 rounded-lg bg-brand-button/10 text-brand-primary text-xs font-semibold disabled:opacity-40"><Plus size={14} /></button>
            </div>
          )}
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL}>Método de pago</label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(PAYMENT_META).map(([k, m]) => {
              const Icon = m.icon;
              return <Chip key={k} active={form.paymentMethod === k} onClick={() => set({ paymentMethod: k, status: k === 'credit' ? 'pending' : form.status })}><span className="flex items-center gap-1"><Icon size={13} /> {m.label}</span></Chip>;
            })}
          </div>
        </div>
        {!isCredit && (
          <div>
            <label className={LABEL}>Estado</label>
            <div className="flex gap-2">
              <Chip active={status === 'paid'} onClick={() => set({ status: 'paid' })}>Pagado</Chip>
              <Chip active={status === 'pending'} onClick={() => set({ status: 'pending' })}>Pendiente por pagar</Chip>
            </div>
          </div>
        )}
        {status === 'pending' && (
          <div>
            <label className={LABEL}>Fecha de vencimiento</label>
            <input type="date" value={form.dueDate} onChange={e => set({ dueDate: e.target.value })} className={INPUT} />
          </div>
        )}
        <div>
          <label className={LABEL}>N° factura / soporte</label>
          <input value={form.invoiceNumber} onChange={e => set({ invoiceNumber: e.target.value })} className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>IVA incluido en el monto (opcional)</label>
          <input type="number" min={0} value={form.taxAmount} onChange={e => set({ taxAmount: e.target.value })} placeholder="0" className={cn(INPUT, 'font-mono')} />
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL}>Notas</label>
          <input value={form.notes} onChange={e => set({ notes: e.target.value })} className={INPUT} />
        </div>
        {canCash && (
          <label className={cn('sm:col-span-2 flex items-start gap-2 p-3 rounded-lg border text-xs', currentShift ? 'border-brand-accent/40 bg-brand-card cursor-pointer' : 'border-border bg-muted/30 opacity-70')}>
            <input type="checkbox" disabled={!currentShift} checked={form.fromCashRegister} onChange={e => set({ fromCashRegister: e.target.checked })} className="mt-0.5" />
            <span>
              <span className="font-semibold text-brand-dark block">Descontar de la caja abierta</span>
              <span className="text-muted-foreground">{currentShift ? `Se registra como retiro de efectivo en el turno de ${currentShift.cashierName} y cuadra con el cierre.` : 'No hay un turno de caja abierto; el gasto se registra sin afectar la caja.'}</span>
            </span>
          </label>
        )}
      </div>
      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
      <button onClick={save} disabled={saving || !form.description.trim() || !(Number(form.amount) > 0)}
        className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-40">
        {saving ? 'Guardando...' : expense ? 'Guardar cambios' : 'Registrar gasto'}
      </button>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Modal de pago (cuentas por pagar)                                    */
/* ------------------------------------------------------------------ */
const PayModal = ({ expense, onClose, onPaid }: { expense: Expense; onClose: () => void; onPaid: (e: Expense) => void }) => {
  const currentShift = useStore(s => s.currentShift);
  const refreshCurrentShift = useStore(s => s.refreshCurrentShift);
  const [method, setMethod] = useState('transfer');
  const [fromCash, setFromCash] = useState(false);
  const [paidAt, setPaidAt] = useState(getColombiaTodayStr());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const pay = async () => {
    setSaving(true);
    setError('');
    try {
      const r = await api.payExpense(expense.id, { paymentMethod: method, fromCashRegister: method === 'cash' && fromCash, paidAt });
      if (method === 'cash' && fromCash) refreshCurrentShift();
      onPaid(r);
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };
  return (
    <Modal title="Registrar pago" onClose={onClose}>
      <div className="p-3 rounded-lg bg-brand-card border border-border">
        <p className="text-sm font-semibold text-brand-dark">{expense.description}</p>
        <p className="text-xs text-muted-foreground">{expense.supplierName || 'Sin proveedor'} · vence {fmtDate(expense.dueDate)}</p>
        <p className="text-lg font-bold text-brand-primary mt-1">{formatPrice(expense.amount)}</p>
      </div>
      <div>
        <label className={LABEL}>Método</label>
        <div className="flex flex-wrap gap-2">
          {['cash', 'transfer', 'card'].map(k => { const Icon = PAYMENT_META[k].icon; return <Chip key={k} active={method === k} onClick={() => setMethod(k)}><span className="flex items-center gap-1"><Icon size={13} /> {PAYMENT_META[k].label}</span></Chip>; })}
        </div>
      </div>
      <div>
        <label className={LABEL}>Fecha de pago</label>
        <input type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)} className={INPUT} />
      </div>
      {method === 'cash' && (
        <label className={cn('flex items-start gap-2 p-3 rounded-lg border text-xs', currentShift ? 'border-brand-accent/40 bg-brand-card cursor-pointer' : 'border-border bg-muted/30 opacity-70')}>
          <input type="checkbox" disabled={!currentShift} checked={fromCash} onChange={e => setFromCash(e.target.checked)} className="mt-0.5" />
          <span><span className="font-semibold text-brand-dark block">Descontar de la caja abierta</span><span className="text-muted-foreground">{currentShift ? 'Se registra como retiro en el turno actual.' : 'No hay turno abierto.'}</span></span>
        </label>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button onClick={pay} disabled={saving} className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-40">{saving ? 'Registrando...' : 'Confirmar pago'}</button>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Pestaña Resumen (P&L)                                                */
/* ------------------------------------------------------------------ */
const SummaryTab = ({ goTo }: { goTo: (t: Tab) => void }) => {
  const [period, setPeriod] = useState<Period>('month');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(getColombiaTodayStr());
  const [months, setMonths] = useState<6 | 12>(6);
  const [summary, setSummary] = useState<any>(null);
  const [pnl, setPnl] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getFinanceSummary({ period, from, to }).then(setSummary).catch(() => setSummary(null)).finally(() => setLoading(false));
  }, [period, from, to]);
  useEffect(() => { api.getPnl(months).then(setPnl).catch(() => setPnl([])); }, [months]);

  const kpis = summary ? [
    { label: 'Ventas', value: summary.sales, sub: `${summary.salesCount} comprobantes`, icon: TrendingUp, tone: 'text-brand-primary' },
    { label: 'Costo de insumos', value: summary.cogs, sub: `${pct(summary.cogs, summary.sales)}% de las ventas`, icon: Receipt, tone: 'text-amber-700' },
    { label: 'Gastos operativos', value: summary.opex + summary.other, sub: `${pct(summary.opex + summary.other, summary.sales)}% de las ventas`, icon: Wallet, tone: 'text-sky-700' },
    { label: 'Nómina', value: summary.payroll, sub: `${pct(summary.payroll, summary.sales)}% de las ventas`, icon: Landmark, tone: 'text-violet-700' },
  ] : [];

  return (
    <div className="space-y-4">
      <PeriodBar period={period} from={from} to={to} onChange={(p, f, t) => { setPeriod(p); setFrom(f); setTo(t); }} />

      {loading || !summary ? <p className="text-xs text-muted-foreground">{loading ? 'Calculando...' : 'Sin datos'}</p> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {kpis.map(k => (
              <div key={k.label} className="bg-card rounded-xl border border-border p-3.5 shadow-card">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{k.label}</p>
                  <k.icon size={15} className={k.tone} />
                </div>
                <p className={cn('font-display font-bold text-lg leading-tight', k.tone)}>{formatPrice(k.value)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{k.sub}</p>
              </div>
            ))}
            <div className={cn('rounded-xl border p-3.5 shadow-card col-span-2 lg:col-span-1', summary.net >= 0 ? 'bg-emerald-600 border-emerald-700 text-white' : 'bg-red-600 border-red-700 text-white')}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide opacity-90">Utilidad neta</p>
                {summary.net >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
              </div>
              <p className="font-display font-bold text-lg leading-tight">{formatPrice(summary.net)}</p>
              <p className="text-[10px] opacity-90 mt-0.5">Margen neto {summary.netMargin}% · bruto {summary.grossMargin}%</p>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-card rounded-xl border border-border p-4 shadow-card">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-bold text-sm text-brand-dark">Estado de resultados mes a mes</h3>
                  <p className="text-[11px] text-muted-foreground">Ventas − insumos − gastos − nómina = utilidad</p>
                </div>
                <div className="flex gap-1">
                  <Chip active={months === 6} onClick={() => setMonths(6)}>6 meses</Chip>
                  <Chip active={months === 12} onClick={() => setMonths(12)}>12 meses</Chip>
                </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={pnl} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={BRAND.card2} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: BRAND.muted }} />
                    <YAxis tick={{ fontSize: 10, fill: BRAND.muted }} tickFormatter={v => (v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : `${Math.round(v / 1000)}k`)} width={44} />
                    <Tooltip formatter={(v: any, name: any) => [formatPrice(Number(v)), name]} contentStyle={{ fontSize: 12, borderRadius: 10 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="sales" name="Ventas" fill={BRAND.primary} radius={[6, 6, 0, 0]} />
                    <Bar dataKey="expenses" name="Gastos totales" fill={BRAND.accent} radius={[6, 6, 0, 0]} />
                    <Line type="monotone" dataKey="net" name="Utilidad" stroke="#059669" strokeWidth={2.5} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead><tr className="text-muted-foreground"><th className="text-left py-1 font-semibold">Mes</th><th className="text-right font-semibold">Ventas</th><th className="text-right font-semibold">Insumos</th><th className="text-right font-semibold">Operativos</th><th className="text-right font-semibold">Nómina</th><th className="text-right font-semibold">Utilidad</th><th className="text-right font-semibold">Margen</th></tr></thead>
                  <tbody>
                    {pnl.map(r => (
                      <tr key={r.month} className="border-t border-border">
                        <td className="py-1.5 font-semibold text-brand-dark">{r.label}</td>
                        <td className="text-right">{formatPrice(r.sales)}</td>
                        <td className="text-right">{formatPrice(r.cogs)}</td>
                        <td className="text-right">{formatPrice(r.opex + r.other)}</td>
                        <td className="text-right">{formatPrice(r.payroll)}</td>
                        <td className={cn('text-right font-bold', r.net >= 0 ? 'text-emerald-700' : 'text-red-600')}>{formatPrice(r.net)}</td>
                        <td className="text-right">{r.netMargin}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-card rounded-xl border border-border p-4 shadow-card">
                <h3 className="font-bold text-sm text-brand-dark mb-2">Gastos por categoría</h3>
                <p className="text-[11px] text-muted-foreground mb-3">{summary.period.label} · total {formatPrice(summary.totalExpenses)}</p>
                <ul className="space-y-2">
                  {summary.byCategory.filter((c: any) => c.total > 0).map((c: any) => (
                    <li key={c.id}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-brand-dark">{c.emoji} {c.name}</span>
                        <span className="font-semibold">{formatPrice(c.total)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted mt-1 overflow-hidden">
                        <div className="h-full rounded-full bg-brand-button" style={{ width: `${pct(c.total, summary.totalExpenses)}%` }} />
                      </div>
                    </li>
                  ))}
                  {summary.byCategory.every((c: any) => c.total === 0) && <li className="text-xs text-muted-foreground">Sin gastos registrados en el período.</li>}
                </ul>
              </div>
              <button onClick={() => goTo('porpagar')} className="w-full text-left bg-card rounded-xl border border-border p-4 shadow-card hover:shadow-elevated transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Cuentas por pagar</p>
                    <p className="font-display font-bold text-lg text-brand-dark">{formatPrice(summary.pendingPayables)}</p>
                    <p className="text-[10px] text-muted-foreground">{summary.pendingPayablesCount} factura(s) pendientes</p>
                  </div>
                  <CalendarClock size={22} className="text-brand-accent" />
                </div>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Pestaña Gastos                                                       */
/* ------------------------------------------------------------------ */
const ExpensesTab = ({ categories, suppliers, isAdmin }: { categories: ExpenseCategory[]; suppliers: Supplier[]; isAdmin: boolean }) => {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(getColombiaTodayStr());
  const [categoryId, setCategoryId] = useState(0);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState<{ expenses: Expense[]; total: number }>({ expenses: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; expense: Expense | null }>({ open: false, expense: null });
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    api.getExpenses({ from, to, categoryId: categoryId || undefined, status: status || undefined, search: search || undefined })
      .then(setData).catch(e => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, [from, to, categoryId, status, search]);

  const remove = async (e: Expense) => {
    if (confirmDelete !== e.id) { setConfirmDelete(e.id); setTimeout(() => setConfirmDelete(null), 3000); return; }
    try { await api.deleteExpense(e.id); setConfirmDelete(null); load(); } catch (err: any) { setError(err.message); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div><label className={LABEL}>Desde</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} className={cn(INPUT, 'py-1.5 text-xs')} /></div>
        <div><label className={LABEL}>Hasta</label><input type="date" value={to} onChange={e => setTo(e.target.value)} className={cn(INPUT, 'py-1.5 text-xs')} /></div>
        <div><label className={LABEL}>Categoría</label>
          <select value={categoryId} onChange={e => setCategoryId(Number(e.target.value))} className={cn(INPUT, 'py-1.5 text-xs')}>
            <option value={0}>Todas</option>{categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
          </select></div>
        <div><label className={LABEL}>Estado</label>
          <select value={status} onChange={e => setStatus(e.target.value)} className={cn(INPUT, 'py-1.5 text-xs')}>
            <option value="">Todos</option><option value="paid">Pagados</option><option value="pending">Pendientes</option>
          </select></div>
        <div className="flex-1 min-w-[160px]"><label className={LABEL}>Buscar</label>
          <div className="relative"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Descripción, proveedor o factura" className={cn(INPUT, 'py-1.5 text-xs pl-8')} /></div></div>
        <button onClick={() => setModal({ open: true, expense: null })} className="px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-xs font-semibold flex items-center gap-1.5 shadow-fab hover:opacity-90">
          <Plus size={14} /> Nuevo gasto
        </button>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-brand-card">
          <p className="text-xs text-muted-foreground">{data.expenses.length} registro(s)</p>
          <p className="text-sm font-bold text-brand-dark">Total: {formatPrice(data.total)}</p>
        </div>
        {loading ? <p className="p-4 text-xs text-muted-foreground">Cargando...</p> : data.expenses.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground"><Receipt size={28} className="mx-auto mb-2 opacity-40" /><p className="text-sm">No hay gastos en este rango.</p></div>
        ) : (
          <ul className="divide-y divide-border">
            {data.expenses.map(e => {
              const PM = PAYMENT_META[e.paymentMethod]?.icon || Banknote;
              return (
                <li key={e.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20">
                  <div className="w-9 h-9 rounded-lg bg-brand-card border border-border flex items-center justify-center text-lg shrink-0">{e.categoryEmoji}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-brand-dark truncate">{e.description}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {fmtDate(e.date)} · {e.categoryName}{e.supplierName ? ` · ${e.supplierName}` : ''}{e.invoiceNumber ? ` · Fac. ${e.invoiceNumber}` : ''}{e.fromCashRegister ? ' · desde caja' : ''}
                    </p>
                  </div>
                  <span className="hidden sm:flex items-center gap-1 text-[11px] text-muted-foreground"><PM size={12} /> {PAYMENT_META[e.paymentMethod]?.label}</span>
                  <StatusPill e={e} />
                  <p className="text-sm font-bold text-brand-primary w-24 text-right">{formatPrice(e.amount)}</p>
                  {isAdmin && e.source === 'manual' && (
                    <div className="flex items-center">
                      <button onClick={() => setModal({ open: true, expense: e })} className="p-1.5 rounded-lg text-muted-foreground hover:text-brand-primary hover:bg-brand-button/5"><Edit2 size={14} /></button>
                      <button onClick={() => remove(e)} className={cn('p-1.5 rounded-lg', confirmDelete === e.id ? 'bg-red-600 text-white' : 'text-muted-foreground hover:text-red-600 hover:bg-red-50')}><Trash2 size={14} /></button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {modal.open && <ExpenseModal categories={categories} suppliers={suppliers} expense={modal.expense} isAdmin={isAdmin} onClose={() => setModal({ open: false, expense: null })} onSaved={() => { setModal({ open: false, expense: null }); load(); }} />}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Pestaña Cuentas por pagar                                            */
/* ------------------------------------------------------------------ */
const PayablesTab = () => {
  const [data, setData] = useState<any>({ payables: [], total: 0, overdue: 0, dueSoon: 0 });
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<Expense | null>(null);
  const load = () => { setLoading(true); api.getPayables().then(setData).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(load, []);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card rounded-xl border border-border p-3.5 shadow-card"><p className="text-[11px] font-semibold text-muted-foreground uppercase">Pendiente total</p><p className="font-display font-bold text-lg text-brand-dark">{formatPrice(data.total)}</p></div>
        <div className="bg-red-50 rounded-xl border border-red-200 p-3.5 shadow-card"><p className="text-[11px] font-semibold text-red-700 uppercase flex items-center gap-1"><AlertTriangle size={12} /> Vencido</p><p className="font-display font-bold text-lg text-red-700">{formatPrice(data.overdue)}</p></div>
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-3.5 shadow-card"><p className="text-[11px] font-semibold text-amber-800 uppercase flex items-center gap-1"><Clock size={12} /> Próximos 7 días</p><p className="font-display font-bold text-lg text-amber-800">{formatPrice(data.dueSoon)}</p></div>
      </div>
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        {loading ? <p className="p-4 text-xs text-muted-foreground">Cargando...</p> : data.payables.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground"><CheckCircle2 size={28} className="mx-auto mb-2 text-emerald-500" /><p className="text-sm">No tienes cuentas pendientes por pagar.</p></div>
        ) : (
          <ul className="divide-y divide-border">
            {data.payables.map((e: Expense) => (
              <li key={e.id} className={cn('flex items-center gap-3 px-4 py-3', e.overdue && 'bg-red-50/60')}>
                <div className="w-9 h-9 rounded-lg bg-brand-card border border-border flex items-center justify-center text-lg shrink-0">{e.categoryEmoji}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-brand-dark truncate">{e.description}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{e.supplierName || 'Sin proveedor'} · registrado {fmtDate(e.date)}{e.invoiceNumber ? ` · Fac. ${e.invoiceNumber}` : ''}</p>
                </div>
                <div className="text-right">
                  <p className={cn('text-[11px] font-semibold', e.overdue ? 'text-red-600' : e.dueSoon ? 'text-amber-700' : 'text-muted-foreground')}>{e.dueDate ? `Vence ${fmtDate(e.dueDate)}` : 'Sin fecha'}</p>
                  <StatusPill e={e} />
                </div>
                <p className="text-sm font-bold text-brand-primary w-24 text-right">{formatPrice(e.amount)}</p>
                <button onClick={() => setPaying(e)} className="px-3 py-1.5 rounded-lg bg-brand-button text-brand-on-button text-xs font-semibold whitespace-nowrap">Pagar</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {paying && <PayModal expense={paying} onClose={() => setPaying(null)} onPaid={() => { setPaying(null); load(); }} />}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Pestaña Proveedores                                                  */
/* ------------------------------------------------------------------ */
const SuppliersTab = ({ suppliers, isAdmin, reload }: { suppliers: Supplier[]; isAdmin: boolean; reload: () => void }) => {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Supplier | null | 'new'>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const open = (s: Supplier | 'new') => {
    setEditing(s);
    setForm(s === 'new' ? { name: '', nit: '', phone: '', email: '', address: '', category: '', notes: '' } : { ...s });
    setError('');
  };
  const save = async () => {
    setSaving(true);
    setError('');
    try {
      if (editing === 'new') await api.addSupplier(form); else if (editing) await api.updateSupplier(editing.id, form);
      setEditing(null); reload();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };
  const remove = async (s: Supplier) => {
    if (confirmDelete !== s.id) { setConfirmDelete(s.id); setTimeout(() => setConfirmDelete(null), 3000); return; }
    try { await api.deleteSupplier(s.id); setConfirmDelete(null); reload(); } catch (e: any) { setError(e.message); }
  };
  const list = suppliers.filter(s => !search || `${s.name} ${s.nit} ${s.category}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar proveedor" className={cn(INPUT, 'pl-8')} /></div>
        {isAdmin && <button onClick={() => open('new')} className="px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-xs font-semibold flex items-center gap-1.5 shadow-fab"><Plus size={14} /> Nuevo proveedor</button>}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {list.map(s => (
          <div key={s.id} className={cn('bg-card rounded-xl border border-border p-4 shadow-card', !s.active && 'opacity-50')}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-button/10 text-brand-primary flex items-center justify-center shrink-0"><Truck size={18} /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-brand-dark truncate">{s.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">{s.category || 'Sin categoría'}{s.nit ? ` · NIT ${s.nit}` : ''}</p>
                {s.phone && <p className="text-[11px] text-muted-foreground">{s.phone}</p>}
              </div>
              {isAdmin && (
                <div className="flex">
                  <button onClick={() => open(s)} className="p-1.5 text-muted-foreground hover:text-brand-primary"><Edit2 size={14} /></button>
                  <button onClick={() => remove(s)} className={cn('p-1.5 rounded-lg', confirmDelete === s.id ? 'bg-red-600 text-white' : 'text-muted-foreground hover:text-red-600')}><Trash2 size={14} /></button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 text-[11px]">
              <div className="bg-brand-card rounded-lg p-2"><p className="text-muted-foreground">Comprado</p><p className="font-bold text-brand-dark">{formatPrice(s.totalPurchased)}</p><p className="text-muted-foreground">{s.purchases} compra(s)</p></div>
              <div className={cn('rounded-lg p-2', s.pendingAmount > 0 ? 'bg-amber-50' : 'bg-brand-card')}><p className="text-muted-foreground">Por pagar</p><p className={cn('font-bold', s.pendingAmount > 0 ? 'text-amber-800' : 'text-brand-dark')}>{formatPrice(s.pendingAmount)}</p><p className="text-muted-foreground">Última: {fmtDate(s.lastPurchase)}</p></div>
            </div>
          </div>
        ))}
        {list.length === 0 && <p className="text-xs text-muted-foreground">No hay proveedores registrados.</p>}
      </div>
      {editing && (
        <Modal title={editing === 'new' ? 'Nuevo proveedor' : 'Editar proveedor'} onClose={() => setEditing(null)}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className={LABEL}>Nombre / Razón social</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={INPUT} /></div>
            <div><label className={LABEL}>NIT / Cédula</label><input value={form.nit} onChange={e => setForm({ ...form, nit: e.target.value })} className={INPUT} /></div>
            <div><label className={LABEL}>Qué provee</label><input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Insumos, empaques..." className={INPUT} /></div>
            <div><label className={LABEL}>Teléfono</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={INPUT} /></div>
            <div><label className={LABEL}>Correo</label><input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={INPUT} /></div>
            <div className="col-span-2"><label className={LABEL}>Dirección</label><input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className={INPUT} /></div>
            <div className="col-span-2"><label className={LABEL}>Notas</label><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={INPUT} /></div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button onClick={save} disabled={saving || !form.name || form.name.trim().length < 2} className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-40">{saving ? 'Guardando...' : 'Guardar'}</button>
        </Modal>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Pestaña Categorías                                                   */
/* ------------------------------------------------------------------ */
const CategoriesTab = ({ categories, reload }: { categories: ExpenseCategory[]; reload: () => void }) => {
  const [form, setForm] = useState<{ id: number | null; name: string; emoji: string; kind: Kind; plGroup: PlGroup }>({ id: null, name: '', emoji: '💸', kind: 'opex', plGroup: 'admin' });
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setError('');
    try {
      if (form.id) await api.updateExpenseCategory(form.id, form); else await api.addExpenseCategory(form);
      setShowForm(false); setForm({ id: null, name: '', emoji: '💸', kind: 'opex', plGroup: 'admin' }); reload();
    } catch (e: any) { setError(e.message); }
  };
  const remove = async (c: ExpenseCategory) => {
    if (!window.confirm(`¿Eliminar la categoría "${c.name}"?`)) return;
    try { await api.deleteExpenseCategory(c.id); reload(); } catch (e: any) { setError(e.message); }
  };
  return (
    <div className="max-w-xl space-y-3">
      <div className="bg-card rounded-xl border border-border p-4 shadow-card space-y-2">
        <div className="flex items-center justify-between">
          <div><h3 className="font-bold text-sm">Categorías de gasto</h3><p className="text-[11px] text-muted-foreground">El tipo y el grupo definen dónde cae cada gasto en el estado de resultados.</p></div>
          <button onClick={() => { setForm({ id: null, name: '', emoji: '💸', kind: 'opex', plGroup: 'admin' }); setShowForm(true); }} className="text-xs text-primary font-medium flex items-center gap-1"><Plus size={14} /> Agregar</button>
        </div>
        {categories.map(c => (
          <div key={c.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
            <span className="text-lg">{c.emoji}</span>
            <span className="text-sm font-medium flex-1">{c.name}</span>
            <span className="text-[10px] text-muted-foreground hidden sm:inline">{PL_GROUP_META[c.plGroup || defaultGroup(c.kind)]}</span>
            <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-semibold', KIND_META[c.kind].className)}>{KIND_META[c.kind].short}</span>
            <button onClick={() => { setForm({ id: c.id, name: c.name, emoji: c.emoji, kind: c.kind, plGroup: c.plGroup || defaultGroup(c.kind) }); setShowForm(true); }} className="text-muted-foreground hover:text-primary"><Edit2 size={14} /></button>
            {!c.isSystem && <button onClick={() => remove(c)} className="text-muted-foreground hover:text-destructive"><Trash2 size={14} /></button>}
          </div>
        ))}
        {showForm && (
          <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-2">
            <div className="grid grid-cols-4 gap-2">
              <div><label className={LABEL}>Emoji</label><input value={form.emoji} onChange={e => setForm({ ...form, emoji: e.target.value })} className={cn(INPUT, 'text-center')} /></div>
              <div className="col-span-3"><label className={LABEL}>Nombre</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={INPUT} /></div>
            </div>
            <div><label className={LABEL}>Tipo</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.keys(KIND_META) as Kind[]).map(k => <Chip key={k} active={form.kind === k} onClick={() => setForm({ ...form, kind: k, plGroup: defaultGroup(k) })} className="justify-start text-left">{KIND_META[k].label}</Chip>)}
              </div></div>
            <div><label className={LABEL}>Grupo en el estado de resultados</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {(Object.keys(PL_GROUP_META) as PlGroup[]).map(g => <Chip key={g} active={form.plGroup === g} onClick={() => setForm({ ...form, plGroup: g })} className="justify-start text-left">{PL_GROUP_META[g]}</Chip>)}
              </div></div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button onClick={save} disabled={form.name.trim().length < 2} className="flex-1 py-2 rounded-lg gradient-primary text-primary-foreground text-xs font-semibold disabled:opacity-40">{form.id ? 'Guardar' : 'Crear categoría'}</button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border border-border text-xs">Cancelar</button>
            </div>
          </div>
        )}
        {error && !showForm && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Página                                                               */
/* ------------------------------------------------------------------ */
const FinancePage = () => {
  const user = useStore(s => s.user);
  const isAdmin = user?.role === 'admin';
  const [tab, setTab] = useState<Tab>(isAdmin ? 'resumen' : 'gastos');
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const loadCategories = () => api.getExpenseCategories().then(setCategories).catch(() => {});
  const loadSuppliers = () => api.getSuppliers(undefined, true).then(setSuppliers).catch(() => {});
  useEffect(() => { loadCategories(); loadSuppliers(); }, []);

  const tabs = useMemo(() => [
    { id: 'resumen' as Tab, label: 'Resumen', icon: Landmark, admin: true },
    { id: 'contabilidad' as Tab, label: 'Contabilidad', icon: BookOpen, admin: true },
    { id: 'gastos' as Tab, label: 'Gastos', icon: Receipt },
    { id: 'porpagar' as Tab, label: 'Por pagar', icon: CalendarClock },
    { id: 'proveedores' as Tab, label: 'Proveedores', icon: Truck },
    { id: 'categorias' as Tab, label: 'Categorías', icon: FolderOpen, admin: true },
  ].filter(t => !t.admin || isAdmin), [isAdmin]);

  return (
    <div className="space-y-4 font-sans">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-display font-bold text-lg text-brand-dark">Finanzas</h2>
          <p className="text-xs text-muted-foreground">Gastos, compras a proveedores, cuentas por pagar y utilidad real del negocio.</p>
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn('px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap border transition-all',
                tab === t.id ? 'bg-brand-button text-brand-on-button border-brand-primary shadow-card' : 'bg-card text-brand-dark border-border hover:bg-muted/40')}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'resumen' && isAdmin && <SummaryTab goTo={setTab} />}
      {tab === 'contabilidad' && isAdmin && <AccountingTab />}
      {tab === 'gastos' && <ExpensesTab categories={categories} suppliers={suppliers.filter(s => s.active)} isAdmin={isAdmin} />}
      {tab === 'porpagar' && <PayablesTab />}
      {tab === 'proveedores' && <SuppliersTab suppliers={suppliers} isAdmin={isAdmin} reload={loadSuppliers} />}
      {tab === 'categorias' && isAdmin && <CategoriesTab categories={categories} reload={loadCategories} />}
      <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Filter size={10} /> Los gastos cuentan en el estado de resultados por su fecha, estén pagados o pendientes.</p>
    </div>
  );
};

export default FinancePage;
