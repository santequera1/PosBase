import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Plus, Pencil, Trash2, Tag, CheckCircle2, XCircle, Percent, Banknote } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import { downloadXlsx } from '@/lib/xlsx';
import { FilterBar, DetailPane, Row, SectionTitle, Empty, dt, periodParams, useIsMobile, INPUT, LBL, SEL, type Period } from './common';
import { NiceSelect } from '@/components/ui/nice-select';

const amountLabel = (d: any) => (d.value === null || d.value === undefined ? 'Libre' : d.kind === 'percent' ? `${d.value}%` : formatPrice(d.value));

export const DescuentosTab = ({ period, setPeriod, shifts, serviceShifts }: { period: Period; setPeriod: (p: Period) => void; shifts: any[]; serviceShifts: any[] }) => {
  const user = useStore(s => s.user);
  const loadRestaurantConfig = useStore(s => s.loadRestaurantConfig);
  const isAdmin = user?.role === 'admin';
  const mobile = useIsMobile();
  const [cat, setCat] = useState<any>(null);
  const [applied, setApplied] = useState<any>(null);
  const [q, setQ] = useState('');
  const [state, setState] = useState<'active' | 'inactive' | 'all'>('all');
  const [sel, setSel] = useState<any>(null);
  const [form, setForm] = useState<any>(null);
  const load = useCallback(() => {
    api.getDiscountCatalog(periodParams(period)).then(setCat).catch(e => toast.error(e.message));
    api.getCajaDiscounts(periodParams(period)).then(setApplied).catch(() => {});
  }, [period]);
  useEffect(() => { load(); }, [load]);
  const list = useMemo(() => (cat?.catalog || []).filter((d: any) => (state === 'all' || (state === 'active' ? d.active : !d.active)) && (!q.trim() || d.name.toLowerCase().includes(q.trim().toLowerCase()))), [cat, state, q]);
  const save = async () => {
    try {
      const body = { name: form.name, kind: form.kind, value: form.value === '' ? null : Number(form.value), applyTo: form.applyTo, requiresEmployee: form.requiresEmployee, active: form.active };
      const d = await api.saveDiscount(body, form.id);
      toast.success('Descuento guardado'); setForm(null); setSel(d); load(); loadRestaurantConfig();
    } catch (e: any) { toast.error(e.message); }
  };
  const remove = async (d: any) => {
    if (!window.confirm(`¿Eliminar el descuento "${d.name}"? Si ya se usó, queda inactivo para conservar el historial.`)) return;
    try { const r = await api.deleteDiscount(d.id); toast.success(r.deactivated ? 'Ya se había usado: quedó inactivo' : 'Descuento eliminado'); setSel(null); load(); loadRestaurantConfig(); } catch (e: any) { toast.error(e.message); }
  };
  const k = cat?.kpis || { active: 0, inactive: 0, applied: 0, total: 0 };
  const exportX = () => applied && downloadXlsx('descuentos', [
    { name: 'Catálogo', headers: ['Nombre', 'Tipo', 'Importe', 'Estado', 'Veces usado', 'Monto usado', 'Última vez'], rows: (cat?.catalog || []).map((d: any) => [d.name, d.kind === 'percent' ? 'Porcentual' : 'Fijo', amountLabel(d), d.active ? 'Activo' : 'Inactivo', d.timesUsed, d.amountUsed, dt(d.lastUsed)]) },
    { name: 'Aplicados', headers: ['Fecha', 'Venta', 'Descuento', 'Motivo', 'Mesa / tipo', 'Mesero', 'Cliente', 'Autorizó', 'Total venta', 'Descuento'], rows: applied.discounts.map((d: any) => [dt(d.date), d.id, d.name, d.reason, d.table ? `Mesa ${d.table}` : d.type, d.waiter, d.customer, d.by, d.saleTotal, d.amount]) },
  ]);
  return (
    <div className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)] gap-3 items-start" data-descuentos>
      <div className="space-y-3 min-w-0">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar descuento por nombre" className={cn(INPUT, 'pl-8')} /></div>
          <div className="flex gap-2">
            <NiceSelect value={state} onChange={e => setState(e.target.value as any)} className={cn(SEL, 'flex-1 sm:flex-none')} data-discount-state><option value="all">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option></NiceSelect>
            {isAdmin && <button onClick={() => { setSel(null); setForm({ name: '', kind: 'percent', value: '', applyTo: 'all', requiresEmployee: false, active: true }); }} className="px-3 py-2 rounded-lg gradient-primary text-primary-foreground text-sm font-bold flex items-center gap-1.5 whitespace-nowrap" data-discount-new><Plus size={14} /> Nuevo descuento</button>}
          </div>
        </div>
        <FilterBar period={period} setPeriod={setPeriod} shifts={shifts} serviceShifts={serviceShifts} onExport={exportX} rangeLabel={cat?.scope.label} showDateBy={false} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-discount-kpis>
          {[[CheckCircle2, 'Activos', String(k.active), 'text-emerald-600'], [XCircle, 'Inactivos', String(k.inactive), 'text-muted-foreground'], [Tag, 'Descuentos aplicados', String(k.applied), 'text-brand-primary'], [Banknote, 'Total descontado', formatPrice(k.total), 'text-red-600']].map(([Icon, l, v, c]: any) => (
            <div key={l} className="bg-card rounded-xl border border-border p-3 flex items-center gap-3"><Icon size={22} className={c} /><div><p className="text-[11px] font-semibold text-muted-foreground uppercase">{l}</p><p className="font-display font-bold text-lg">{v}</p></div></div>
          ))}
        </div>
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-discount-table>
              <thead><tr className="bg-muted/40 text-muted-foreground text-left"><th className="px-3 py-2 font-semibold">Nombre</th><th className="px-3 py-2 font-semibold">Importe</th><th className="px-3 py-2 font-semibold">Estado</th><th className="px-3 py-2 font-semibold text-right">Veces usado</th>{!mobile && <><th className="px-3 py-2 font-semibold text-right">Monto usado</th><th className="px-3 py-2 font-semibold">Última vez usado</th></>}</tr></thead>
              <tbody>
                {list.map((d: any) => (
                  <tr key={d.id} onClick={() => { setForm(null); setSel(d); }} className={cn('border-t border-border cursor-pointer', sel?.id === d.id ? 'bg-amber-100' : 'hover:bg-brand-button/5')} data-discount-row={d.name}>
                    <td className="px-3 py-2 font-semibold">{d.name}{d.special === 'staff' && <span className="ml-1 text-[10px] text-muted-foreground font-normal">(sin bebidas · pide trabajador)</span>}</td>
                    <td className="px-3 py-2">{amountLabel(d)}</td>
                    <td className="px-3 py-2"><span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold', d.active ? 'bg-emerald-100 text-emerald-800' : 'bg-muted text-muted-foreground')}>{d.active ? 'Activo' : 'Inactivo'}</span></td>
                    <td className="px-3 py-2 text-right">{d.timesUsed}</td>
                    {!mobile && <><td className="px-3 py-2 text-right">{formatPrice(d.amountUsed)}</td><td className="px-3 py-2">{dt(d.lastUsed)}</td></>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cat && list.length === 0 && <Empty title="Sin descuentos" text="No hay descuentos con estos filtros." />}
        </div>
        {applied && applied.discounts.length > 0 && (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <p className="px-3 py-2 text-xs font-bold text-brand-dark border-b border-border">Aplicados en el período ({applied.count}) · {formatPrice(applied.total)}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs"><thead><tr className="bg-muted/40 text-muted-foreground text-left"><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Venta</th><th className="px-3 py-2">Descuento</th><th className="px-3 py-2">Motivo</th><th className="px-3 py-2">Autorizó</th><th className="px-3 py-2 text-right">Valor</th></tr></thead>
                <tbody>{applied.discounts.map((d: any) => <tr key={d.id} className="border-t border-border"><td className="px-3 py-1.5 whitespace-nowrap">{dt(d.date)}</td><td className="px-3 py-1.5">#{d.id}</td><td className="px-3 py-1.5">{d.name}</td><td className="px-3 py-1.5">{d.reason || '—'}</td><td className="px-3 py-1.5">{d.by || '—'}</td><td className="px-3 py-1.5 text-right font-bold text-red-700">−{formatPrice(d.amount)}</td></tr>)}</tbody></table>
            </div>
          </div>
        )}
      </div>
      {form ? (
        <DetailPane open onClose={() => setForm(null)} title={form.id ? 'EDITAR DESCUENTO' : 'NUEVO DESCUENTO'} tone="yellow">
          <div className="p-4 space-y-3" data-discount-form>
            <div><label className={LBL}>Nombre *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={INPUT} placeholder="Ej. Clientes frecuentes, Pago en efectivo" data-discount-name /></div>
            {form.special !== 'staff' && (
              <div><label className={LBL}>Tipo de descuento</label>
                <div className="flex gap-3 text-sm"><label className="flex items-center gap-1.5"><input type="radio" checked={form.kind === 'percent'} onChange={() => setForm({ ...form, kind: 'percent' })} /> <Percent size={13} /> Porcentual</label><label className="flex items-center gap-1.5"><input type="radio" checked={form.kind === 'fixed'} onChange={() => setForm({ ...form, kind: 'fixed' })} /> <Banknote size={13} /> Fijo</label></div></div>
            )}
            <div><label className={LBL}>Importe ({form.kind === 'percent' ? '%' : '$'})</label><input type="number" min={0} value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} className={cn(INPUT, 'font-mono')} placeholder={form.special === 'staff' ? '50' : 'Vacío = el cajero define el valor al aplicarlo'} data-discount-value /></div>
            {form.special !== 'staff' && (
              <>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.applyTo === 'no_drinks'} onChange={e => setForm({ ...form, applyTo: e.target.checked ? 'no_drinks' : 'all' })} /> No aplica a bebidas</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.requiresEmployee} onChange={e => setForm({ ...form, requiresEmployee: e.target.checked })} /> Pedir a qué trabajador se le aplica</label>
              </>
            )}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /> Activo</label>
            {form.special === 'staff' && <p className="text-[11px] text-muted-foreground">Las categorías sin descuento (bebidas) se eligen en Configuración → Restaurante.</p>}
            <div className="grid grid-cols-2 gap-2"><button onClick={() => setForm(null)} className="py-2.5 rounded-xl border border-border font-semibold text-sm">Cancelar</button><button onClick={save} disabled={form.name.trim().length < 2} className="py-2.5 rounded-xl gradient-primary text-primary-foreground font-bold text-sm disabled:opacity-40" data-discount-save>Guardar</button></div>
          </div>
        </DetailPane>
      ) : (
        <DetailPane open={!!sel} onClose={() => setSel(null)} title={sel ? sel.name.toUpperCase() : ''} empty="Selecciona un descuento para ver su detalle"
          actions={sel && isAdmin && (
            <>
              <button onClick={() => setForm({ ...sel, value: sel.value ?? '' })} title="Editar" className="w-8 h-8 rounded-lg bg-black/15 hover:bg-black/25 flex items-center justify-center" data-discount-edit><Pencil size={14} /></button>
              {!sel.special && <button onClick={() => remove(sel)} title="Eliminar" className="w-8 h-8 rounded-lg bg-black/15 hover:bg-black/25 flex items-center justify-center"><Trash2 size={14} /></button>}
            </>
          )}>
          {sel && (
            <div className="py-1">
              <Row k="Estado" v={<span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold', sel.active ? 'bg-emerald-100 text-emerald-800' : 'bg-muted text-muted-foreground')}>{sel.active ? 'Activo' : 'Inactivo'}</span>} />
              <Row k="Fecha de registro" v={dt(sel.createdAt)} />
              <Row k="Tipo" v={sel.kind === 'percent' ? 'Porcentual' : 'Fijo'} />
              <Row k="Importe" v={sel.value === null ? 'Sin importe (lo define el cajero)' : amountLabel(sel)} />
              <Row k="Aplica a" v={sel.applyTo === 'no_drinks' ? 'Todo menos bebidas' : 'Toda la cuenta'} />
              {sel.requiresEmployee && <Row k="Trabajador" v="Se elige al aplicarlo" />}
              <SectionTitle>Uso</SectionTitle>
              <Row k="Veces usado (histórico)" v={sel.timesUsed} />
              <Row k="Monto usado (histórico)" v={formatPrice(sel.amountUsed)} />
              <Row k="En el período" v={`${sel.periodTimes} · ${formatPrice(sel.periodAmount)}`} />
              <Row k="Última vez usado" v={dt(sel.lastUsed)} />
            </div>
          )}
        </DetailPane>
      )}
    </div>
  );
};

export default DescuentosTab;
