import React, { useEffect, useMemo, useState } from 'react';
import {
  Search, Download, Printer, Eye, X, FileText, BarChart3, Trash2, SlidersHorizontal, Utensils, CreditCard, UserRound, Bike,
  LayoutGrid, Radio, Tags, Package, CircleDot, Clock, Users, ChevronDown, RotateCcw, Calendar,
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Legend, CartesianGrid } from 'recharts';
import { toast } from 'sonner';
import { useStore, type Order } from '@/store/useStore';
import { api } from '@/lib/api';
import { ElectronicInvoiceModal } from '@/components/ElectronicInvoiceModal';
import { PrintModal } from '@/components/PrintModal';
import { GelatoStats } from '@/components/GelatoStats';
import { FilterSelect, type FilterOption } from '@/components/reports/FilterSelect';
import { downloadXlsx, xlsxDate, xlsxTime } from '@/lib/xlsx';
import { orderNumber } from '@/lib/orderNumber';
import { BRAND } from '@/lib/theme';
import { CHANNEL_LABEL } from '@/lib/restaurant';
import { formatPrice, getColombiaTodayStr } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NiceSelect } from '@/components/ui/nice-select';
import {
  DEFAULT_FILTERS, PERIOD_LABEL, SALE_KIND_LABEL, STATUS_FILTER_LABEL, WEEKDAYS, PAY_LABEL, FLAG_LABEL,
  type SalesFilters, type PeriodKey, type SaleKind,
  periodRange, applyFilters, inPeriod, activeCount, summarize, byProduct, saleKind, cashierOf, paymentParts, hasItemFilter, groupBy,
} from '@/lib/salesFilters';

const STORE_KEY = 'reports-filters-v2';
const PIE_COLORS = [BRAND.primary, BRAND.dark, BRAND.accent, '#0ea5e9', '#f59e0b', '#10b981', '#8b5cf6', BRAND.muted];
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
type Tab = 'ventas' | 'productos' | 'personal' | 'graficas';

function loadFilters(): SalesFilters {
  try { const raw = localStorage.getItem(STORE_KEY); if (raw) return { ...DEFAULT_FILTERS, ...JSON.parse(raw), search: '' }; } catch { /* sin almacenamiento */ }
  return DEFAULT_FILTERS;
}

const kindLabel = (o: Order) => {
  const k = saleKind(o);
  if (k === 'mesa') return `Mesa ${o.tableLabel || o.tableNumber || ''}`.trim();
  if (k === 'llevar') return `Para llevar${o.label ? ' · ' + o.label : ''}`;
  return k === 'domicilio' ? 'Domicilio' : 'Mostrador';
};
const statusInfo = (o: Order) => {
  if (o.status === 'cancelled') return { label: 'Anulada', cls: 'bg-red-50 text-red-700 border-red-200' };
  if (['open', 'pending', 'preparing', 'ready', 'shipped', 'billing'].includes(o.status)) return { label: 'Abierta', cls: 'bg-sky-50 text-sky-700 border-sky-200' };
  if (o.paymentStatus === 'pending') return { label: 'Por cobrar', cls: 'bg-amber-50 text-amber-800 border-amber-200' };
  return { label: 'Cerrada', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
};
const payLabel = (o: Order) => {
  const s = o.paymentSplit;
  if (o.paymentMethod === 'mixed' && s?.method1) return `${PAY_LABEL[s.method1] || s.method1} + ${PAY_LABEL[s.method2] || s.method2}`;
  return PAY_LABEL[o.paymentMethod] || o.paymentMethod;
};

const Card = ({ title, icon: Icon, children, right, className }: { title: string; icon?: any; children: any; right?: any; className?: string }) => (
  <div className={cn('bg-white rounded-2xl border border-brand-primary/10 shadow-sm overflow-hidden', className)}>
    <div className="px-4 py-2.5 border-b border-border bg-brand-card flex items-center justify-between gap-2">
      <p className="text-xs font-bold text-brand-dark flex items-center gap-1.5">{Icon && <Icon size={13} />} {title}</p>
      {right}
    </div>
    {children}
  </div>
);
const SimpleTable = ({ headers, rows, empty = 'Sin datos con estos filtros.' }: { headers: string[]; rows: (string | number)[][]; empty?: string }) => (
  rows.length ? (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead><tr className="text-muted-foreground bg-muted/30">{headers.map((h, i) => <th key={h} className={cn('px-3 py-1.5 font-semibold whitespace-nowrap', i === 0 ? 'text-left' : 'text-right')}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-border">{r.map((c, j) => <td key={j} className={cn('px-3 py-1.5 whitespace-nowrap', j === 0 ? 'text-left font-semibold text-brand-dark' : 'text-right')}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  ) : <p className="p-4 text-xs text-muted-foreground">{empty}</p>
);

export const ReportsPage: React.FC = () => {
  const { orders: branchOrders, user, deleteOrder, products, categories, branches, branchId } = useStore();
  // Sede: la activa (pedidos del store) o todas / otra sede (se consultan aparte)
  const [branchView, setBranchView] = useState<string>('current');
  const [otherOrders, setOtherOrders] = useState<any[] | null>(null);
  useEffect(() => {
    if (branchView === 'current') { setOtherOrders(null); return; }
    api.getOrders({ branch: branchView }).then(setOtherOrders).catch(() => setOtherOrders([]));
  }, [branchView, branchId]);
  const orders = (branchView === 'current' ? branchOrders : (otherOrders || [])) as typeof branchOrders;
  const [tab, setTab] = useState<Tab>('ventas');
  const [f, setF] = useState<SalesFilters>(loadFilters);
  const [showMore, setShowMore] = useState(false);
  const [showPeriods, setShowPeriods] = useState(false);
  const [limit, setLimit] = useState(150);
  const [selectedInvoice, setSelectedInvoice] = useState<Order | null>(null);
  const [feOrderId, setFeOrderId] = useState<number | null>(null);
  const [productSort, setProductSort] = useState<'qty' | 'total'>('total');
  useEffect(() => { try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...f, search: '' })); } catch { /* sin almacenamiento */ } }, [f]);
  useEffect(() => { setLimit(150); }, [f]);
  const set = (p: Partial<SalesFilters>) => setF(cur => ({ ...cur, ...p }));

  const today = getColombiaTodayStr();
  const range = periodRange(f, today);
  const categoryOf = useMemo(() => new Map(products.map(p => [p.id, p.categoryId])), [products]);
  const catName = useMemo(() => new Map(categories.map(c => [c.id, c.name])), [categories]);
  const ctx = useMemo(() => ({ today, categoryOf }), [today, categoryOf]);
  const hasGelato = categories.some(c => [1, 2, 3].includes(c.id));

  const filtered = useMemo(() => applyFilters(orders, f, ctx).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') || b.id - a.id), [orders, f, ctx]);
  const m = useMemo(() => summarize(filtered), [filtered]);
  const productRows = useMemo(() => byProduct(filtered, f, ctx), [filtered, f, ctx]);
  const itemFilterTotals = useMemo(() => productRows.reduce((a, r) => ({ qty: a.qty + r.qty, total: a.total + r.total }), { qty: 0, total: 0 }), [productRows]);

  // Opciones de los desplegables: lo que aparece en el período elegido
  const opts = useMemo(() => {
    const inRange = orders.filter(o => inPeriod(o, range));
    const uniq = (vals: string[]) => [...new Set(vals.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
    const count = (pred: (o: Order) => boolean) => inRange.filter(pred).length;
    const toOpts = (vals: string[], pred: (v: string) => (o: Order) => boolean): FilterOption[] => vals.map(v => ({ value: v, label: v, hint: String(count(pred(v))) }));
    return {
      waiters: toOpts(uniq(inRange.map(o => o.waiterName || '')), v => o => o.waiterName === v),
      cashiers: toOpts(uniq(inRange.map(cashierOf)), v => o => cashierOf(o) === v),
      couriers: toOpts(uniq(inRange.map(o => o.driverName || '')), v => o => o.driverName === v),
      tables: uniq(inRange.map(o => o.tableLabel || '')).map(v => ({ value: v, label: `Mesa ${v}`, hint: String(count(o => o.tableLabel === v)) })),
      channels: uniq(inRange.map(o => o.channel || 'local')).map(v => ({ value: v, label: (CHANNEL_LABEL as any)[v] || v })),
    };
  }, [orders, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps

  const categoryOpts: FilterOption[] = categories.map(c => ({ value: String(c.id), label: c.name }));
  const productOpts: FilterOption[] = products
    .filter(p => !f.categories.length || f.categories.includes(String(p.categoryId)))
    .map(p => ({ value: String(p.id), label: p.name, group: catName.get(p.categoryId) || 'Sin categoría' }))
    .sort((a, b) => (a.group || '').localeCompare(b.group || '') || a.label.localeCompare(b.label));
  const paymentOpts: FilterOption[] = ['cash', 'card_debit', 'card_credit', 'transfer', 'platform', 'credit'].map(v => ({ value: v, label: PAY_LABEL[v] }));
  const kindOpts: FilterOption[] = (Object.keys(SALE_KIND_LABEL) as SaleKind[]).map(k => ({ value: k, label: SALE_KIND_LABEL[k] }));

  // Etiquetas de los filtros activos (para quitarlos con un toque)
  const chips: Array<{ label: string; clear: () => void }> = [];
  const listChip = (key: keyof SalesFilters, title: string, labelOf: (v: string) => string) => {
    const arr = f[key] as string[];
    if (arr.length) chips.push({ label: `${title}: ${arr.map(labelOf).join(', ')}`, clear: () => set({ [key]: [] } as any) });
  };
  listChip('kinds', 'Tipo', v => SALE_KIND_LABEL[v as SaleKind] || v);
  listChip('payments', 'Pago', v => PAY_LABEL[v] || v);
  listChip('waiters', 'Mesero', v => v);
  listChip('cashiers', 'Cajero', v => v);
  listChip('couriers', 'Repartidor', v => v);
  listChip('tables', 'Mesa', v => v);
  listChip('channels', 'Canal', v => (CHANNEL_LABEL as any)[v] || v);
  listChip('categories', 'Categoría', v => catName.get(Number(v)) || v);
  listChip('products', 'Producto', v => products.find(p => String(p.id) === v)?.name || v);
  listChip('flags', 'Solo', v => FLAG_LABEL[v] || v);
  if (f.weekdays.length) chips.push({ label: `Días: ${f.weekdays.sort().map(d => WEEKDAYS[d]).join(', ')}`, clear: () => set({ weekdays: [] }) });
  if (f.hourFrom || f.hourTo) chips.push({ label: `Hora: ${f.hourFrom || '00'}:00 a ${f.hourTo || '23'}:59`, clear: () => set({ hourFrom: '', hourTo: '' }) });
  if (f.minTotal || f.maxTotal) chips.push({ label: `Monto: ${f.minTotal ? formatPrice(Number(f.minTotal)) : '$0'} a ${f.maxTotal ? formatPrice(Number(f.maxTotal)) : 'sin tope'}`, clear: () => set({ minTotal: '', maxTotal: '' }) });
  if (f.status !== 'closed') chips.push({ label: `Estado: ${STATUS_FILTER_LABEL[f.status]}`, clear: () => set({ status: 'closed' }) });
  const nActive = activeCount(f);
  const clearAll = () => setF({ ...DEFAULT_FILTERS, period: f.period, from: f.from, to: f.to });

  const handleDeleteOrder = async (orderId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`¿Eliminar permanentemente la venta ${orderNumber(orderId)}?`)) return;
    try { await deleteOrder(orderId); toast.success(`Venta ${orderNumber(orderId)} eliminada`); if (selectedInvoice?.id === orderId) setSelectedInvoice(null); }
    catch { toast.error('Error al eliminar la venta'); }
  };

  /* ---------- agregados por persona ---------- */
  const people = useMemo(() => {
    const valid = filtered.filter(o => o.status !== 'cancelled');
    const waiters = [...groupBy(valid.filter(o => o.waiterName), o => o.waiterName!).entries()].map(([name, os]) => {
      const total = os.reduce((a, o) => a + o.total, 0), ppl = os.reduce((a, o) => a + (o.people || 0), 0);
      return { name, count: os.length, people: ppl, total, avg: Math.round(total / os.length), perPerson: ppl ? Math.round(total / ppl) : 0, tips: os.reduce((a, o) => a + (o.tip || 0), 0) };
    }).sort((a, b) => b.total - a.total);
    const cashiers = [...groupBy(valid, o => cashierOf(o) || '—').entries()].map(([name, os]) => ({ name, count: os.length, total: os.reduce((a, o) => a + o.total, 0), tips: os.reduce((a, o) => a + (o.tip || 0), 0) })).sort((a, b) => b.total - a.total);
    const couriers = [...groupBy(valid.filter(o => o.type === 'delivery'), o => o.driverName || 'Sin asignar').entries()].map(([name, os]) => ({ name, count: os.length, total: os.reduce((a, o) => a + o.total, 0), fees: os.reduce((a, o) => a + (o.deliveryFee || 0), 0), cash: os.reduce((a, o) => a + (paymentParts(o).cash || 0), 0) })).sort((a, b) => b.count - a.count);
    const staffDisc = [...groupBy(valid.filter(o => o.discountKind === 'staff'), o => o.discountEmployeeName || '—').entries()].map(([name, os]) => ({ name, count: os.length, discount: os.reduce((a, o) => a + (o.discount || 0), 0), paid: os.reduce((a, o) => a + o.total, 0) })).sort((a, b) => b.discount - a.discount);
    return { waiters, cashiers, couriers, staffDisc };
  }, [filtered]);

  const categoryRows = useMemo(() => [...groupBy(productRows, r => String(r.categoryId)).entries()].map(([id, rs]) => ({ id, name: catName.get(Number(id)) || 'Sin categoría', qty: rs.reduce((a, r) => a + r.qty, 0), total: rs.reduce((a, r) => a + r.total, 0) })).sort((a, b) => b.total - a.total), [productRows, catName]);
  const sortedProducts = useMemo(() => [...productRows].sort((a, b) => productSort === 'qty' ? b.qty - a.qty : b.total - a.total), [productRows, productSort]);

  /* ---------- gráficas ---------- */
  const charts = useMemo(() => {
    const valid = filtered.filter(o => o.status !== 'cancelled');
    const byHour = HOURS.map(h => ({ name: `${h}h`, total: 0, count: 0 }));
    const byDow = WEEKDAYS.map(d => ({ name: d, total: 0, count: 0 }));
    const byDay = new Map<string, { name: string; total: number; count: number }>();
    for (const o of valid) {
      const h = Number((o.createdAt || '').slice(11, 13)) || 0;
      byHour[h].total += o.total; byHour[h].count++;
      const day = (o.createdAt || '').slice(0, 10);
      const dow = new Date(day + 'T00:00:00Z').getUTCDay();
      byDow[dow].total += o.total; byDow[dow].count++;
      const cur = byDay.get(day) || { name: day.slice(8, 10) + '/' + day.slice(5, 7), total: 0, count: 0 };
      cur.total += o.total; cur.count++; byDay.set(day, cur);
    }
    const firstHour = byHour.findIndex(x => x.count > 0), lastHour = 23 - [...byHour].reverse().findIndex(x => x.count > 0);
    const kinds = [...groupBy(valid, o => saleKind(o)).entries()].map(([k, os]) => ({ name: SALE_KIND_LABEL[k as SaleKind], value: os.reduce((a, o) => a + o.total, 0) }));
    const pays = Object.entries(m.methods).filter(([, v]) => v > 0).map(([k, v]) => ({ name: PAY_LABEL[k] || k, value: v }));
    return { byHour: firstHour >= 0 ? byHour.slice(firstHour, lastHour + 1) : [], byDow: [...byDow.slice(1), byDow[0]], byDay: [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v), kinds, pays };
  }, [filtered, m.methods]);

  /* ---------- Excel con todos los filtros aplicados ---------- */
  const exportXlsx = () => {
    const ventas = filtered.map(o => {
      const p = paymentParts(o);
      return [xlsxDate(o.createdAt), xlsxTime(o.createdAt), orderNumber(o.id), SALE_KIND_LABEL[saleKind(o)], o.tableLabel || '', o.waiterName || '', cashierOf(o), o.driverName || '',
        (CHANNEL_LABEL as any)[o.channel || 'local'] || o.channel || '', o.customer?.name || 'Consumidor Final', o.customer?.doc || '', o.people || 0, payLabel(o),
        p.cash || 0, p.card_debit || 0, (p.card_credit || 0) + (p.card || 0), p.transfer || 0, p.platform || 0, p.credit || 0,
        o.subtotal, o.deliveryFee || 0, o.discount || 0, o.discountReason || '', o.tip || 0, statusInfo(o).label, o.total];
    });
    downloadXlsx(`ventas_${range.from}_a_${range.to}`, [
      { name: 'Ventas', headers: ['Fecha', 'Hora', 'Comprobante', 'Tipo de venta', 'Mesa', 'Mesero', 'Cajero', 'Repartidor', 'Canal', 'Cliente', 'Documento', 'Personas', 'Medio de pago', 'Efectivo', 'T. débito', 'T. crédito', 'Transferencia', 'Plataforma', 'A crédito', 'Subtotal', 'Envío', 'Descuento', 'Motivo descuento', 'Propina', 'Estado', 'Total'], rows: ventas },
      { name: 'Productos', headers: ['Producto', 'Categoría', 'Cantidad', 'Total'], rows: sortedProducts.map(r => [r.name, catName.get(r.categoryId) || 'Sin categoría', r.qty, r.total]) },
      { name: 'Categorías', headers: ['Categoría', 'Cantidad', 'Total'], rows: categoryRows.map(r => [r.name, r.qty, r.total]) },
      { name: 'Meseros', headers: ['Mesero', 'Cuentas', 'Personas', 'Total', 'Ticket promedio', 'Por persona', 'Propinas'], rows: people.waiters.map(w => [w.name, w.count, w.people, w.total, w.avg, w.perPerson, w.tips]) },
      { name: 'Cajeros', headers: ['Cajero', 'Ventas', 'Total', 'Propinas'], rows: people.cashiers.map(c => [c.name, c.count, c.total, c.tips]) },
      { name: 'Repartidores', headers: ['Repartidor', 'Pedidos', 'Total', 'Envíos', 'Efectivo cobrado'], rows: people.couriers.map(c => [c.name, c.count, c.total, c.fees, c.cash]) },
      { name: 'Desc. trabajador', headers: ['Trabajador', 'Veces', 'Descontado', 'Pagó'], rows: people.staffDisc.map(s => [s.name, s.count, s.discount, s.paid]) },
    ]);
  };

  const periodLabel = f.period === 'custom' ? `${range.from} a ${range.to}` : PERIOD_LABEL[f.period];
  const MAIN_PERIODS: PeriodKey[] = ['today', 'yesterday', 'this_week', 'this_month'];
  const MORE_PERIODS: PeriodKey[] = ['last_week', 'last_month', 'last7', 'last30', 'this_year', 'custom'];

  return (
    <div className="max-w-7xl mx-auto space-y-4 font-sans">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-sans font-bold text-2xl lg:text-3xl text-brand-dark">Ventas e ingresos</h1>
          <p className="text-xs text-brand-muted mt-0.5">{periodLabel} · {m.count} venta(s){nActive ? ` · ${nActive} filtro(s)` : ''}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-brand-card p-1 rounded-2xl border border-brand-primary/10 overflow-x-auto no-scrollbar">
            {([['ventas', 'Comprobantes', FileText], ['productos', 'Productos', Package], ['personal', 'Personal', Users], ['graficas', 'Estadísticas', BarChart3]] as const).map(([id, label, Icon]) => (
              <button key={id} onClick={() => setTab(id)} data-report-tab={id}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap', tab === id ? 'bg-brand-button text-brand-on-button shadow-sm' : 'text-brand-primary hover:bg-white/60')}>
                <Icon size={14} /><span>{label}</span>
              </button>
            ))}
          </div>
          {branches.length > 1 && (
            <NiceSelect value={branchView} onChange={e => setBranchView(e.target.value)} className="py-2 text-xs font-bold" data-report-branch>
              <option value="current">Sede: {branches.find(b => b.id === branchId)?.name || 'actual'}</option>
              <option value="all">Todas las sedes</option>
              {branches.filter(b => b.id !== branchId).map(b => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
            </NiceSelect>
          )}
          <button onClick={exportXlsx} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-brand-primary/20 text-xs font-bold text-brand-primary hover:bg-brand-card shadow-sm">
            <Download size={14} /><span className="hidden sm:inline">Excel</span>
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl p-3 border border-brand-primary/10 shadow-sm space-y-2.5" data-report-filters>
        <div className="flex flex-col lg:flex-row gap-2.5 lg:items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={f.search} onChange={e => set({ search: e.target.value })} data-report-search
              placeholder="Buscar por N°, cliente, teléfono, mesero, mesa, producto..."
              className="w-full pl-9 pr-8 py-2 rounded-xl text-xs bg-gray-50 border border-gray-200 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-primary" />
            {f.search && <button onClick={() => set({ search: '' })} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><X size={14} /></button>}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {MAIN_PERIODS.map(p => (
              <button key={p} onClick={() => set({ period: p })} data-period={p}
                className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap', f.period === p ? 'bg-brand-button text-brand-on-button shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
                {PERIOD_LABEL[p]}
              </button>
            ))}
            <div className="relative">
              <button onClick={() => setShowPeriods(s => !s)} data-period-more
                className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1', MORE_PERIODS.includes(f.period) ? 'bg-brand-button text-brand-on-button shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
                <Calendar size={13} /> {MORE_PERIODS.includes(f.period) ? PERIOD_LABEL[f.period] : 'Más fechas'} <ChevronDown size={12} />
              </button>
              {showPeriods && (
                <div className="absolute z-40 right-0 mt-1 w-52 bg-white rounded-xl border border-border shadow-xl p-1">
                  {MORE_PERIODS.map(p => (
                    <button key={p} onClick={() => { set({ period: p, ...(p === 'custom' && !f.from ? { from: range.from, to: range.to } : {}) }); setShowPeriods(false); }} data-period={p}
                      className={cn('w-full text-left px-3 py-1.5 rounded-lg text-xs hover:bg-muted/50', f.period === p && 'bg-brand-card font-bold')}>{PERIOD_LABEL[p]}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {f.period === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 text-xs bg-brand-card p-2 rounded-xl">
            <span className="font-bold text-brand-primary">Desde</span>
            <input type="date" value={f.from} onChange={e => set({ from: e.target.value })} className="p-1.5 rounded-lg border border-gray-300 bg-white" data-custom-from />
            <span className="font-bold text-brand-primary">Hasta</span>
            <input type="date" value={f.to} onChange={e => set({ to: e.target.value })} className="p-1.5 rounded-lg border border-gray-300 bg-white" data-custom-to />
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 items-center">
          <FilterSelect testId="kinds" label="Tipo de venta" icon={Utensils} options={kindOpts} value={f.kinds} onChange={v => set({ kinds: v as SaleKind[] })} />
          <FilterSelect testId="payments" label="Pago" icon={CreditCard} options={paymentOpts} value={f.payments} onChange={v => set({ payments: v })} />
          <FilterSelect testId="waiters" label="Mesero" icon={UserRound} options={opts.waiters} value={f.waiters} onChange={v => set({ waiters: v })} />
          <FilterSelect testId="cashiers" label="Cajero" icon={UserRound} options={opts.cashiers} value={f.cashiers} onChange={v => set({ cashiers: v })} />
          <FilterSelect testId="couriers" label="Repartidor" icon={Bike} options={opts.couriers} value={f.couriers} onChange={v => set({ couriers: v })} />
          <FilterSelect testId="tables" label="Mesa" icon={LayoutGrid} options={opts.tables} value={f.tables} onChange={v => set({ tables: v })} />
          <FilterSelect testId="categories" label="Categoría" icon={Tags} options={categoryOpts} value={f.categories} onChange={v => set({ categories: v, products: f.products.filter(id => !v.length || v.includes(String(categoryOf.get(Number(id))))) })} />
          <FilterSelect testId="products" label="Producto" icon={Package} options={productOpts} value={f.products} onChange={v => set({ products: v })} />
          <FilterSelect testId="status" label="Estado" icon={CircleDot} single options={Object.entries(STATUS_FILTER_LABEL).map(([value, label]) => ({ value, label }))} value={f.status === 'closed' ? [] : [f.status]} onChange={v => set({ status: (v[0] || 'closed') as any })} />
          <button onClick={() => setShowMore(s => !s)} data-filters-more
            className={cn('flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border', showMore ? 'bg-brand-card border-brand-primary/30' : 'bg-white border-border hover:bg-muted/40')}>
            <SlidersHorizontal size={13} /> Más filtros <ChevronDown size={12} className={cn(showMore && 'rotate-180')} />
          </button>
        </div>

        {showMore && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs" data-filters-more-panel>
            <div>
              <p className="font-bold text-brand-dark mb-1 flex items-center gap-1"><Clock size={12} /> Franja horaria</p>
              <div className="flex items-center gap-1.5">
                <NiceSelect value={f.hourFrom} onChange={e => set({ hourFrom: e.target.value })} className="p-1.5 rounded-lg border border-gray-300 bg-white" data-hour-from>
                  <option value="">Desde</option>{HOURS.map(h => <option key={h} value={h}>{h}:00</option>)}
                </NiceSelect>
                <NiceSelect value={f.hourTo} onChange={e => set({ hourTo: e.target.value })} className="p-1.5 rounded-lg border border-gray-300 bg-white" data-hour-to>
                  <option value="">Hasta</option>{HOURS.map(h => <option key={h} value={h}>{h}:59</option>)}
                </NiceSelect>
              </div>
            </div>
            <div>
              <p className="font-bold text-brand-dark mb-1">Días de la semana</p>
              <div className="flex flex-wrap gap-1">
                {[1, 2, 3, 4, 5, 6, 0].map(d => (
                  <button key={d} onClick={() => set({ weekdays: f.weekdays.includes(d) ? f.weekdays.filter(x => x !== d) : [...f.weekdays, d] })} data-weekday={d}
                    className={cn('px-2 py-1 rounded-lg font-semibold border', f.weekdays.includes(d) ? 'bg-brand-button text-brand-on-button border-brand-primary' : 'bg-white border-gray-300')}>{WEEKDAYS[d]}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="font-bold text-brand-dark mb-1">Monto de la venta</p>
              <div className="flex items-center gap-1.5">
                <input type="number" min={0} value={f.minTotal} onChange={e => set({ minTotal: e.target.value })} placeholder="Mínimo" className="w-full p-1.5 rounded-lg border border-gray-300 bg-white" data-min-total />
                <input type="number" min={0} value={f.maxTotal} onChange={e => set({ maxTotal: e.target.value })} placeholder="Máximo" className="w-full p-1.5 rounded-lg border border-gray-300 bg-white" />
              </div>
            </div>
            <div>
              <p className="font-bold text-brand-dark mb-1 flex items-center gap-1"><Radio size={12} /> Canal y marcas</p>
              <div className="flex flex-wrap gap-1">
                {opts.channels.map(c => (
                  <button key={c.value} onClick={() => set({ channels: f.channels.includes(c.value) ? f.channels.filter(x => x !== c.value) : [...f.channels, c.value] })}
                    className={cn('px-2 py-1 rounded-lg font-semibold border', f.channels.includes(c.value) ? 'bg-brand-button text-brand-on-button border-brand-primary' : 'bg-white border-gray-300')}>{c.label}</button>
                ))}
                {Object.entries(FLAG_LABEL).map(([k, label]) => (
                  <button key={k} onClick={() => set({ flags: f.flags.includes(k) ? f.flags.filter(x => x !== k) : [...f.flags, k] })} data-flag={k}
                    className={cn('px-2 py-1 rounded-lg font-semibold border', f.flags.includes(k) ? 'bg-brand-button text-brand-on-button border-brand-primary' : 'bg-white border-gray-300')}>{label}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center" data-active-filters>
            {chips.map(c => (
              <span key={c.label} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full bg-brand-card border border-brand-accent/40 text-[11px] font-semibold text-brand-dark max-w-full">
                <span className="truncate">{c.label}</span>
                <button onClick={c.clear} className="p-0.5 rounded-full hover:bg-white"><X size={11} /></button>
              </span>
            ))}
            <button onClick={clearAll} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold text-red-600 hover:bg-red-50" data-clear-filters><RotateCcw size={11} /> Limpiar filtros</button>
          </div>
        )}
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5" data-report-kpis>
        {[
          { label: 'Total ventas', value: formatPrice(m.sales), sub: `${m.count} venta(s)`, strong: true },
          { label: 'Ticket promedio', value: formatPrice(m.avgTicket) },
          { label: 'Personas (mesas)', value: String(m.people), sub: m.people ? `${formatPrice(m.avgPerPerson)} c/u` : undefined },
          { label: 'Propinas', value: formatPrice(m.tips), sub: 'aparte de la venta' },
          { label: 'Descuentos', value: formatPrice(m.discounts), sub: m.staffDiscounts ? `trabajador ${formatPrice(m.staffDiscounts)}` : undefined },
          { label: 'Envíos', value: formatPrice(m.deliveryFees) },
          { label: 'Por cobrar', value: formatPrice(m.pending) },
          { label: 'Anuladas', value: String(m.cancelledCount), sub: m.cancelledCount ? formatPrice(m.cancelledTotal) : undefined },
        ].map(k => (
          <div key={k.label} className={cn('rounded-xl border p-2.5 shadow-sm', k.strong ? 'bg-brand-button text-brand-on-button border-brand-primary' : 'bg-white border-brand-primary/10')}>
            <p className={cn('text-[10px] font-semibold uppercase tracking-wide', k.strong ? 'opacity-80' : 'text-muted-foreground')}>{k.label}</p>
            <p className="font-bold text-base leading-tight mt-0.5">{k.value}</p>
            {k.sub && <p className={cn('text-[10px] mt-0.5', k.strong ? 'opacity-80' : 'text-muted-foreground')}>{k.sub}</p>}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 text-[11px]" data-report-methods>
        {Object.entries(m.methods).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
          <span key={k} className="px-2.5 py-1 rounded-lg bg-white border border-brand-primary/10"><span className="text-muted-foreground">{PAY_LABEL[k] || k}:</span> <b className="text-brand-dark">{formatPrice(v)}</b></span>
        ))}
        {hasItemFilter(f) && (
          <span className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-900" data-item-filter-total>
            Productos filtrados: <b>{itemFilterTotals.qty} und · {formatPrice(itemFilterTotals.total)}</b>
          </span>
        )}
      </div>

      {/* Comprobantes */}
      {tab === 'ventas' && (
        <div className="bg-white rounded-2xl border border-brand-primary/10 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse" data-report-table>
              <thead>
                <tr className="bg-brand-surface text-brand-on-dark font-semibold">
                  <th className="py-2.5 px-3">Fecha</th>
                  <th className="py-2.5 px-3">N.º</th>
                  <th className="py-2.5 px-3">Tipo</th>
                  <th className="py-2.5 px-3">Mesero / repartidor</th>
                  <th className="py-2.5 px-3">Cajero</th>
                  <th className="py-2.5 px-3">Cliente</th>
                  <th className="py-2.5 px-3">Pago</th>
                  <th className="py-2.5 px-3 text-right">Propina</th>
                  <th className="py-2.5 px-3 text-right">Desc.</th>
                  <th className="py-2.5 px-3 text-right">Total</th>
                  <th className="py-2.5 px-3">Estado</th>
                  <th className="py-2.5 px-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr><td colSpan={12} className="py-12 text-center text-gray-400">No hay ventas con estos filtros.</td></tr>
                ) : filtered.slice(0, limit).map(o => {
                  const st = statusInfo(o);
                  return (
                    <tr key={o.id} className="hover:bg-brand-card/60 cursor-pointer" onClick={() => setSelectedInvoice(o)}>
                      <td className="py-2.5 px-3 whitespace-nowrap text-gray-700">{(o.createdAt || '').slice(8, 10)}/{(o.createdAt || '').slice(5, 7)} <span className="text-gray-400">{(o.createdAt || '').slice(11, 16)}</span></td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="text-brand-primary font-bold">{orderNumber(o.id)}</span>
                        {(o.customer?.isElectronicInvoice || o.electronicInvoice) && (
                          <button onClick={e => { e.stopPropagation(); setFeOrderId(o.id); }} className="ml-1.5 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold">F.E.</button>
                        )}
                        {feOrderId === o.id && <ElectronicInvoiceModal order={o} onClose={() => setFeOrderId(null)} />}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-gray-600">{kindLabel(o)}{o.people ? <span className="text-gray-400"> · {o.people}p</span> : null}</td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-gray-700">{o.waiterName || o.driverName || '—'}</td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-gray-700">{cashierOf(o) || '—'}</td>
                      <td className="py-2.5 px-3 truncate max-w-[140px] text-brand-dark font-semibold">{o.customer?.name || 'Consumidor Final'}</td>
                      <td className="py-2.5 px-3 whitespace-nowrap"><span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-brand-card text-brand-primary border border-brand-accent/40">{payLabel(o)}</span></td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap text-gray-600">{o.tip ? formatPrice(o.tip) : '—'}</td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap text-red-700" title={o.discountReason || ''}>{o.discount ? `− ${formatPrice(o.discount)}` : '—'}{o.discountKind === 'staff' && <span className="ml-1 text-[9px] font-bold text-emerald-700">TRAB.</span>}</td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap font-bold text-brand-dark">{formatPrice(o.total)}</td>
                      <td className="py-2.5 px-3 whitespace-nowrap"><span className={cn('px-2 py-0.5 rounded-md text-[10px] font-bold border', st.cls)}>{st.label}</span></td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setSelectedInvoice(o)} className="p-1.5 rounded-lg hover:bg-brand-card text-brand-primary" title="Ver"><Eye size={15} /></button>
                          <button onClick={() => setSelectedInvoice(o)} className="p-1.5 rounded-lg hover:bg-brand-card text-brand-primary" title="Imprimir"><Printer size={15} /></button>
                          {user?.role === 'admin' && <button onClick={e => handleDeleteOrder(o.id, e)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600" title="Eliminar (admin)"><Trash2 size={15} /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="p-3 bg-gray-50 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
            <span>Mostrando {Math.min(limit, filtered.length)} de {filtered.length}</span>
            {filtered.length > limit && <button onClick={() => setLimit(l => l + 300)} className="px-3 py-1 rounded-lg bg-white border border-border font-semibold text-brand-dark">Ver más</button>}
            <span>Total filtrado: <strong className="text-brand-dark">{formatPrice(m.sales)}</strong></span>
          </div>
        </div>
      )}

      {/* Productos */}
      {tab === 'productos' && (
        <div className="grid lg:grid-cols-3 gap-4">
          <Card title="Por categoría" icon={Tags}>
            <SimpleTable headers={['Categoría', 'Cant.', 'Total', '%']} rows={categoryRows.map(r => [r.name, r.qty, formatPrice(r.total), itemFilterTotals.total ? `${Math.round((r.total / itemFilterTotals.total) * 100)}%` : '—'])} />
          </Card>
          <Card title="Por producto" icon={Package} className="lg:col-span-2" right={
            <div className="flex gap-1">{(['total', 'qty'] as const).map(s => <button key={s} onClick={() => setProductSort(s)} className={cn('px-2 py-0.5 rounded-lg text-[10px] font-bold', productSort === s ? 'bg-brand-button text-brand-on-button' : 'bg-white border border-border')}>{s === 'total' ? 'Por valor' : 'Por cantidad'}</button>)}</div>
          }>
            <SimpleTable headers={['Producto', 'Categoría', 'Cant.', 'Total', 'Precio prom.', '%']} rows={sortedProducts.map(r => [r.name, catName.get(r.categoryId) || 'Sin categoría', r.qty, formatPrice(r.total), formatPrice(r.qty ? Math.round(r.total / r.qty) : 0), itemFilterTotals.total ? `${((r.total / itemFilterTotals.total) * 100).toFixed(1)}%` : '—'])} />
          </Card>
        </div>
      )}

      {/* Personal */}
      {tab === 'personal' && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card title="Meseros" icon={Users}>
            <SimpleTable headers={['Mesero', 'Cuentas', 'Personas', 'Total', 'Ticket prom.', 'Por persona', 'Propinas']} rows={people.waiters.map(w => [w.name, w.count, w.people, formatPrice(w.total), formatPrice(w.avg), formatPrice(w.perPerson), formatPrice(w.tips)])} empty="Sin ventas en mesa." />
          </Card>
          <Card title="Cajeros (quién cobró)" icon={UserRound}>
            <SimpleTable headers={['Cajero', 'Ventas', 'Total', 'Propinas']} rows={people.cashiers.map(c => [c.name, c.count, formatPrice(c.total), formatPrice(c.tips)])} />
          </Card>
          <Card title="Repartidores" icon={Bike}>
            <SimpleTable headers={['Repartidor', 'Pedidos', 'Total', 'Envíos', 'Efectivo cobrado']} rows={people.couriers.map(c => [c.name, c.count, formatPrice(c.total), formatPrice(c.fees), formatPrice(c.cash)])} empty="Sin domicilios." />
          </Card>
          <Card title="Descuentos de trabajador" icon={Tags}>
            <SimpleTable headers={['Trabajador', 'Veces', 'Descontado', 'Pagó']} rows={people.staffDisc.map(s => [s.name, s.count, formatPrice(s.discount), formatPrice(s.paid)])} empty="Nadie usó el descuento de trabajador en este período." />
          </Card>
        </div>
      )}

      {/* Estadísticas */}
      {tab === 'graficas' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <Card title="Ventas por hora" icon={Clock} className="lg:col-span-8">
            <div className="h-64 p-2">
              {charts.byHour.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.byHour}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${Math.round(v / 1000)}k`} /><Tooltip formatter={(v: any) => formatPrice(Number(v))} /><Bar dataKey="total" fill={BRAND.primary} radius={[6, 6, 0, 0]} /></BarChart>
                </ResponsiveContainer>
              ) : <p className="text-xs text-muted-foreground p-4">Sin ventas.</p>}
            </div>
          </Card>
          <Card title="Por tipo de venta" icon={Utensils} className="lg:col-span-4">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart><Pie data={charts.kinds} dataKey="value" nameKey="name" cx="50%" cy="45%" innerRadius={40} outerRadius={70} paddingAngle={3}>{charts.kinds.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}</Pie><Tooltip formatter={(v: any) => formatPrice(Number(v))} /><Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: '11px' }} /></PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card title="Ventas por día" icon={Calendar} className="lg:col-span-8">
            <div className="h-64 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charts.byDay}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${Math.round(v / 1000)}k`} /><Tooltip formatter={(v: any) => formatPrice(Number(v))} /><Bar dataKey="total" fill={BRAND.dark} radius={[6, 6, 0, 0]} /></BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card title="Por medio de pago" icon={CreditCard} className="lg:col-span-4">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart><Pie data={charts.pays} dataKey="value" nameKey="name" cx="50%" cy="45%" innerRadius={40} outerRadius={70} paddingAngle={3}>{charts.pays.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}</Pie><Tooltip formatter={(v: any) => formatPrice(Number(v))} /><Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: '11px' }} /></PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card title="Por día de la semana" icon={Calendar} className="lg:col-span-12">
            <div className="h-56 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charts.byDow}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${Math.round(v / 1000)}k`} /><Tooltip formatter={(v: any) => formatPrice(Number(v))} /><Bar dataKey="total" fill={BRAND.accent} radius={[6, 6, 0, 0]} /></BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          {hasGelato && <GelatoStats filtered={filtered} />}
        </div>
      )}

      <PrintModal isOpen={!!selectedInvoice} onClose={() => setSelectedInvoice(null)} order={selectedInvoice} />
    </div>
  );
};

export default ReportsPage;
