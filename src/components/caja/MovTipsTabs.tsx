import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import { downloadXlsx } from '@/lib/xlsx';
import { canDo } from '@/lib/permissions';
import { FilterBar, Kpi, DetailPane, Row, SectionTitle, Empty, usePaged, MoreButton, dt, periodParams, useIsMobile, INPUT, LBL, METHOD_OPTS, type Period, type FilterField } from './common';

/* ======================= Movimientos de caja ======================= */
export const MovimientosTab = ({ period, setPeriod, shifts, serviceShifts }: { period: Period; setPeriod: (p: Period) => void; shifts: any[]; serviceShifts: any[] }) => {
  const user = useStore(s => s.user);
  const currentShift = useStore(s => s.currentShift);
  const addCashMovement = useStore(s => s.addCashMovement);
  const mobile = useIsMobile();
  const [f, setF] = useState<Record<string, string>>({ type: '' });
  const [data, setData] = useState<any>(null);
  const [sel, setSel] = useState<any>(null);
  const [form, setForm] = useState(false);
  const [mv, setMv] = useState({ amount: '', type: 'withdrawal', reason: '' });
  const load = useCallback(() => { api.getCajaMovements({ ...periodParams(period), ...f }).then(setData).catch(e => toast.error(e.message)); }, [period, f]);
  useEffect(() => { load(); }, [load]);
  const rows: any[] = data?.movements || [];
  const paged = usePaged(rows, JSON.stringify([period, f]));
  const canNew = !!currentShift && canDo(user, 'cash_withdrawals');
  const save = async () => {
    try { await addCashMovement(Math.round(Number(mv.amount)), mv.reason.trim(), mv.type as any); toast.success(mv.type === 'withdrawal' ? 'Egreso registrado' : 'Ingreso registrado'); setForm(false); setMv({ amount: '', type: 'withdrawal', reason: '' }); load(); }
    catch (e: any) { toast.error(e.message); }
  };
  const exportX = () => downloadXlsx('movimientos_de_caja', [{ name: 'Movimientos', headers: ['Fecha', 'Caja', 'Turno', 'Tipo', 'Comentario', 'Origen', 'Usuario', 'Monto'], rows: rows.map(m => [dt(m.date), m.caja, m.shiftId, m.typeLabel, m.reason, m.origin, m.user, m.type === 'withdrawal' ? -m.amount : m.amount]) }]);
  const fields: FilterField[] = [{ key: 'type', label: 'Tipo', options: [['deposit', 'Ingreso'], ['withdrawal', 'Egreso']] }];
  return (
    <div className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)] gap-3 items-start" data-movimientos>
      <div className="space-y-3 min-w-0">
        <FilterBar period={period} setPeriod={setPeriod} shifts={shifts} serviceShifts={serviceShifts} fields={fields} values={f} setValues={setF} onExport={exportX} onNew={canNew ? () => { setSel(null); setForm(true); } : undefined} newLabel="Nuevo movimiento" rangeLabel={data?.scope.label} showDateBy={false} />
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card rounded-xl border border-border p-3"><p className="text-[11px] font-semibold text-muted-foreground uppercase">Registros</p><p className="font-display font-bold text-xl">{data?.count ?? 0}</p></div>
          <div className="bg-card rounded-xl border border-border p-3"><p className="text-[11px] font-semibold text-muted-foreground uppercase">Total</p><p className={cn('font-display font-bold text-xl', (data?.net || 0) < 0 ? 'text-red-700' : 'text-emerald-700')}>{formatPrice(data?.net || 0)}</p><p className="text-[10px] text-muted-foreground">Ingresos {formatPrice(data?.deposits || 0)} · Egresos {formatPrice(data?.withdrawals || 0)}</p></div>
        </div>
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="bg-muted/40 text-muted-foreground text-left">
                <th className="px-3 py-2 font-semibold">Fecha</th><th className="px-3 py-2 font-semibold">Caja</th><th className="px-3 py-2 font-semibold text-right">Monto</th><th className="px-3 py-2 font-semibold">Tipo</th>
                {!mobile && <><th className="px-3 py-2 font-semibold">Comentario</th><th className="px-3 py-2 font-semibold">Origen</th></>}
              </tr></thead>
              <tbody>
                {paged.shown.map(m => (
                  <tr key={m.id} onClick={() => { setForm(false); setSel(m); }} className={cn('border-t border-border cursor-pointer', sel?.id === m.id ? 'bg-amber-100' : 'hover:bg-brand-button/5')}>
                    <td className="px-3 py-2 whitespace-nowrap">{dt(m.date)}</td><td className="px-3 py-2">{m.caja}</td>
                    <td className={cn('px-3 py-2 text-right font-bold whitespace-nowrap', m.type === 'withdrawal' ? 'text-red-700' : 'text-emerald-700')}>{m.type === 'withdrawal' ? '−' : '+'}{formatPrice(m.amount)}</td>
                    <td className="px-3 py-2"><span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold', m.type === 'withdrawal' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800')}>{m.typeLabel}</span></td>
                    {!mobile && <><td className="px-3 py-2">{m.reason}</td><td className="px-3 py-2 text-muted-foreground">{m.origin}</td></>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && rows.length === 0 && <Empty title="No se encontraron movimientos" text="No hay movimientos de caja para los filtros seleccionados." />}
          {rows.length > 0 && <MoreButton more={paged.more} onClick={paged.showMore} shown={paged.shown.length} total={paged.total} />}
        </div>
      </div>
      {form ? (
        <DetailPane open onClose={() => setForm(false)} title="NUEVO MOVIMIENTO" tone="yellow">
          <div className="p-4 space-y-3" data-movement-form>
            <div><label className={LBL}>Monto *</label><input type="number" min={0} value={mv.amount} onChange={e => setMv({ ...mv, amount: e.target.value })} className={cn(INPUT, 'font-mono')} data-mv-amount /></div>
            <div><label className={LBL}>Tipo *</label><select value={mv.type} onChange={e => setMv({ ...mv, type: e.target.value })} className={INPUT}><option value="deposit">Ingreso</option><option value="withdrawal">Egreso</option></select></div>
            <div><label className={LBL}>Medio de pago</label><input value="Efectivo" disabled className={cn(INPUT, 'bg-muted/40')} /></div>
            <div><label className={LBL}>Caja *</label><input value={`Principal · turno #${currentShift?.id ?? ''}`} disabled className={cn(INPUT, 'bg-muted/40')} /></div>
            <div><label className={LBL}>Comentario *</label><textarea value={mv.reason} onChange={e => setMv({ ...mv, reason: e.target.value })} className={cn(INPUT, 'h-20')} placeholder="Ej. compra de hielo, base adicional" data-mv-reason /></div>
            <div className="grid grid-cols-2 gap-2"><button onClick={() => setForm(false)} className="py-2.5 rounded-xl border border-border font-semibold text-sm">Cancelar</button><button onClick={save} disabled={!(Number(mv.amount) > 0) || mv.reason.trim().length < 2} className="py-2.5 rounded-xl gradient-primary text-primary-foreground font-bold text-sm disabled:opacity-40" data-mv-save>Crear</button></div>
          </div>
        </DetailPane>
      ) : (
        <DetailPane open={!!sel} onClose={() => setSel(null)} title={sel ? `MOVIMIENTO #${sel.id}` : ''} empty="Selecciona un movimiento para ver su detalle">
          {sel && <div className="py-1"><Row k="Fecha" v={dt(sel.date)} /><Row k="Caja" v={`${sel.caja} · turno #${sel.shiftId}`} /><Row k="Tipo" v={sel.typeLabel} /><Row k="Monto" v={formatPrice(sel.amount)} strong /><Row k="Comentario" v={sel.reason} /><Row k="Origen" v={sel.origin} /><Row k="Usuario" v={sel.user} /></div>}
        </DetailPane>
      )}
    </div>
  );
};

/* ======================= Propinas ======================= */
export const PropinasTab = ({ period, setPeriod, shifts, serviceShifts }: { period: Period; setPeriod: (p: Period) => void; shifts: any[]; serviceShifts: any[] }) => {
  const customers = useStore(s => s.customers);
  const mobile = useIsMobile();
  const [f, setF] = useState<Record<string, string>>({ waiter: '', type: '', customer: '', method: '' });
  const [data, setData] = useState<any>(null);
  const [waiters, setWaiters] = useState<string[]>([]);
  const [sel, setSel] = useState<any>(null);
  const [sale, setSale] = useState<any>(null);
  const [showItems, setShowItems] = useState(false);
  useEffect(() => { api.getCajaTips({ ...periodParams(period), ...f }).then(setData).catch(e => toast.error(e.message)); }, [period, f]);
  useEffect(() => { api.getCajaSales({ ...periodParams(period) }).then(d => setWaiters(d.waiters || [])).catch(() => {}); }, [period]);
  useEffect(() => { setSale(null); setShowItems(false); if (sel?.id) api.getCajaSale(sel.id).then(setSale).catch(() => {}); }, [sel?.id]);
  const rows: any[] = data?.tips || [];
  const paged = usePaged(rows, JSON.stringify([period, f]));
  const fields: FilterField[] = [
    { key: 'waiter', label: 'Mozo / Repartidor', options: waiters.map(w => [w, w]) },
    { key: 'type', label: 'Tipo de venta', options: [['dine-in', 'Mesas'], ['pickup', 'Mostrador'], ['delivery', 'Domicilio']] },
    { key: 'customer', label: 'Cliente', type: 'text', placeholder: 'Nombre o teléfono', list: customers.slice(0, 300).map(c => c.name) },
    { key: 'method', label: 'Medio de pago', options: METHOD_OPTS },
  ];
  const exportX = () => data && downloadXlsx('propinas', [{ name: 'Propinas', headers: ['Fecha', 'Venta', 'Mesa', 'Tipo', 'Mozo / Repartidor', 'Cliente', 'Medio de pago', 'Total de venta', 'Propina'], rows: rows.map(t => [dt(t.date), t.id || '', t.table || '', t.type, t.waiter, t.customer, t.method, t.saleTotal, t.amount]) }, { name: 'Por mesero', headers: ['Mesero', 'Propinas'], rows: data.byWaiter.map((w: any) => [w.waiter, w.amount]) }]);
  return (
    <div className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)] gap-3 items-start" data-propinas>
      <div className="space-y-3 min-w-0">
        <FilterBar period={period} setPeriod={setPeriod} shifts={shifts} serviceShifts={serviceShifts} fields={fields} values={f} setValues={setF} onExport={exportX} rangeLabel={data?.scope.label} />
        {data && (
          <div className="grid grid-cols-2 lg:grid-cols-[1fr_1fr_2fr] gap-3">
            <div className="bg-card rounded-xl border border-border p-3"><p className="text-[11px] font-semibold text-muted-foreground uppercase">Registros</p><p className="font-display font-bold text-xl">{data.count}</p></div>
            <div className="bg-amber-50 rounded-xl border border-amber-200 p-3" data-propinas-total><p className="text-[11px] font-semibold text-amber-800 uppercase">Total</p><p className="font-display font-bold text-xl text-amber-900">{formatPrice(data.total)}</p></div>
            <div className="col-span-2 lg:col-span-1 bg-card rounded-xl border border-border p-3 text-xs"><p className="font-bold text-brand-dark mb-1">Por mesero</p><div className="grid grid-cols-2 gap-x-4">{data.byWaiter.map((w: any) => <div key={w.waiter} className="flex justify-between gap-2"><span className="truncate">{w.waiter}</span><b>{formatPrice(w.amount)}</b></div>)}</div></div>
          </div>
        )}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="bg-muted/40 text-muted-foreground text-left">
                <th className="px-3 py-2 font-semibold">Fecha</th>{!mobile && <th className="px-3 py-2 font-semibold">Mesa</th>}<th className="px-3 py-2 font-semibold">Camarero</th>
                {!mobile && <><th className="px-3 py-2 font-semibold">Cliente</th><th className="px-3 py-2 font-semibold">Medio de pago</th><th className="px-3 py-2 font-semibold text-right">Total de venta</th></>}
                <th className="px-3 py-2 font-semibold text-right">Monto</th>
              </tr></thead>
              <tbody>
                {paged.shown.map((t, i) => (
                  <tr key={(t.id || 'm' + t.manualId) + '-' + i} onClick={() => setSel(t)} className={cn('border-t border-border cursor-pointer', sel === t ? 'bg-amber-100' : 'hover:bg-brand-button/5')}>
                    <td className="px-3 py-2 whitespace-nowrap">{dt(t.date)}</td>{!mobile && <td className="px-3 py-2">{t.table || (t.type !== 'Mesa' ? t.type : '—')}</td>}<td className="px-3 py-2">{t.waiter || '—'}</td>
                    {!mobile && <><td className="px-3 py-2">{t.customer || '—'}</td><td className="px-3 py-2">{t.method}</td><td className="px-3 py-2 text-right">{t.saleTotal ? formatPrice(t.saleTotal) : '—'}</td></>}
                    <td className="px-3 py-2 text-right font-bold">{formatPrice(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && rows.length === 0 && <Empty title="Sin propinas" text="No hay propinas para los filtros seleccionados." />}
          {rows.length > 0 && <MoreButton more={paged.more} onClick={paged.showMore} shown={paged.shown.length} total={paged.total} />}
        </div>
      </div>
      <DetailPane open={!!sel} onClose={() => setSel(null)} title={sel ? (sel.id ? `PROPINA · VENTA #${sel.id}` : 'PROPINA (registro manual)') : ''} tone="yellow" empty="Selecciona una propina para ver su detalle">
        {sel && (
          <div>
            <div className="py-1"><Row k="Fecha" v={dt(sel.date)} /><Row k="Mesa" v={sel.table || sel.type} /><Row k="Mozo / Repartidor" v={sel.waiter || '—'} /><Row k="Cliente" v={sel.customer || '—'} /><Row k="Medio de pago" v={sel.method} /><Row k="Monto" v={formatPrice(sel.amount)} strong /></div>
            {sel.id && (
              <>
                <SectionTitle>Venta</SectionTitle>
                <div className="py-1"><Row k="ID de venta" v={`#${sel.id}`} /><Row k="Hora de inicio" v={dt(sel.createdAt)} /><Row k="Hora de cierre" v={dt(sel.closedAt)} /><Row k="Total de venta" v={formatPrice(sel.saleTotal)} /></div>
                <button onClick={() => setShowItems(v => !v)} className="mx-4 mb-2 text-xs font-semibold text-brand-primary">{showItems ? 'Ocultar detalle' : 'Ver detalle'}</button>
                {showItems && sale && <div className="pb-2">{sale.order.items.map((i: any) => <div key={i.id} className="flex justify-between px-4 py-1 text-xs"><span>{i.quantity} × {i.name}</span><span>{formatPrice(i.price * i.quantity)}</span></div>)}</div>}
              </>
            )}
            {sel.notes && <p className="px-4 py-2 text-xs text-muted-foreground">{sel.notes}</p>}
          </div>
        )}
      </DetailPane>
    </div>
  );
};
