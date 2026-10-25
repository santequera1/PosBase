import { useEffect, useRef, useState } from 'react';
import { FileStack, Play, Square, AlertTriangle, CheckCircle2, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import { INPUT } from '@/components/common/Primitives';

type Pending = {
  date: string; today: string; provider: 'factus' | 'test'; env: 'production' | 'sandbox';
  orders: Array<{ id: number; type: string; total: number; paymentMethod: string; closedAt: string; tableLabel?: string; feError?: string }>;
  total: number; excluded: { unpaid: number; payroll: number; zero: number; withCustomer: number };
};
const TYPE: Record<string, string> = { 'dine-in': 'Mesa', pickup: 'Para llevar', delivery: 'Domicilio', pos: 'Venta' };

/**
 * Caja → Facturas electrónicas → Facturar consumidor final: al cierre, emite la factura electrónica de cada venta a
 * consumidor final de la jornada que no la tenga. Una factura por venta (la DIAN no tiene factura "global"), una por una.
 */
export const FacturarLote = ({ onDone }: { onDone: () => void }) => {
  const [date, setDate] = useState('');
  const [data, setData] = useState<Pending | null>(null);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [run, setRun] = useState<{ done: number; ok: number; failed: Array<{ id: number; error: string }>; total: number; active: boolean } | null>(null);
  const stop = useRef(false);

  const load = (d?: string) => api.getPendingInvoices(d || date || undefined).then(r => { setData(r); if (!date) setDate(r.date); }).catch(e => toast.error(e.message));
  useEffect(() => { load(); }, []);

  const start = async () => {
    if (!data) return;
    setConfirming(false);
    stop.current = false;
    const list = data.orders;
    const state = { done: 0, ok: 0, failed: [] as Array<{ id: number; error: string }>, total: list.length, active: true };
    setRun({ ...state });
    for (const o of list) {
      if (stop.current) break;
      try { await api.issueTestInvoice(o.id); state.ok++; }
      catch (e: any) { state.failed.push({ id: o.id, error: e.message || 'Error' }); }
      state.done++;
      setRun({ ...state, failed: [...state.failed] });
    }
    state.active = false;
    setRun({ ...state, failed: [...state.failed] });
    toast[state.failed.length ? 'warning' : 'success'](`${state.ok} factura(s) emitida(s)${state.failed.length ? ` · ${state.failed.length} con error` : ''}`);
    load(); onDone();
  };

  const real = data?.provider === 'factus';
  const notToday = data && data.date !== data.today;
  const ex = data?.excluded;
  const exText = ex ? [ex.withCustomer && `${ex.withCustomer} con datos de cliente (se facturan desde la venta)`, ex.payroll && `${ex.payroll} por nómina`, ex.unpaid && `${ex.unpaid} sin pagar`, ex.zero && `${ex.zero} en $0`].filter(Boolean).join(' · ') : '';

  return (
    <section className="bg-card rounded-xl border border-border p-4 shadow-card space-y-3" data-facturar-lote>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-bold text-sm text-brand-dark flex items-center gap-1.5"><FileStack size={15} /> Facturar ventas a consumidor final</h3>
          <p className="text-xs text-muted-foreground">Al cierre, emite la factura electrónica de cada venta del día que no la pidió. Cada venta queda con su propia factura a "Consumidor final".</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Jornada</label>
          <input type="date" value={date} max={data?.today} onChange={e => { setDate(e.target.value); setRun(null); load(e.target.value); }} className={cn(INPUT, 'w-40')} data-lote-fecha />
        </div>
      </div>

      {!data ? <p className="text-xs text-muted-foreground">Buscando ventas…</p> : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm"><b className="text-brand-dark" data-lote-cuantas>{data.orders.length}</b> venta(s) sin factura · <b>{formatPrice(data.total)}</b></p>
            {data.orders.length > 0 && <button onClick={() => setOpen(o => !o)} className="text-xs text-brand-primary font-semibold flex items-center gap-0.5">{open ? 'Ocultar' : 'Ver'} ventas <ChevronDown size={13} className={cn('transition-transform', open && 'rotate-180')} /></button>}
          </div>
          {exText && <p className="text-[11px] text-muted-foreground">No entran: {exText}.</p>}
          {open && (
            <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/30 text-muted-foreground"><tr><th className="text-left px-3 py-1.5">Venta</th><th className="text-left px-3 py-1.5">Hora</th><th className="text-left px-3 py-1.5">Tipo</th><th className="text-right px-3 py-1.5">Total</th></tr></thead>
                <tbody>{data.orders.map(o => (
                  <tr key={o.id} className="border-t border-border"><td className="px-3 py-1">#{o.id}{o.feError && <span className="ml-1 text-[10px] text-red-600" title={o.feError}>(falló antes)</span>}</td><td className="px-3 py-1">{String(o.closedAt).slice(11, 16)}</td><td className="px-3 py-1">{TYPE[o.type] || o.type}{o.tableLabel ? ` ${o.tableLabel}` : ''}</td><td className="px-3 py-1 text-right font-semibold">{formatPrice(o.total)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}

          {notToday && data.orders.length > 0 && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex gap-1.5"><AlertTriangle size={13} className="shrink-0 mt-0.5" /> Es una jornada pasada: la factura sale con la fecha de hoy. La DIAN pide expedirla el día de la venta; consúltalo con el contador antes de emitir.</p>
          )}

          {run && (
            <div className="space-y-1.5" data-lote-progreso>
              <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-brand-button transition-all" style={{ width: `${run.total ? (run.done / run.total) * 100 : 0}%` }} /></div>
              <p className="text-xs flex items-center gap-1.5">{run.active ? `Emitiendo ${run.done} de ${run.total}…` : <><CheckCircle2 size={13} className="text-emerald-600" /> {run.ok} emitida(s){run.failed.length ? ` · ${run.failed.length} con error` : ''}{run.done < run.total ? ` · detenido (faltan ${run.total - run.done})` : ''}</>}</p>
              {run.failed.length > 0 && <ul className="text-[11px] text-red-700 space-y-0.5 max-h-28 overflow-y-auto">{run.failed.map(f => <li key={f.id}>Venta #{f.id}: {f.error}</li>)}</ul>}
            </div>
          )}

          {data.orders.length > 0 && !run?.active && (
            confirming ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2" data-lote-confirmar>
                <p className="text-xs text-amber-900">
                  {real
                    ? <>Se van a emitir <b>{data.orders.length} facturas electrónicas reales{data.env === 'production' ? ' ante la DIAN' : ' (ambiente de pruebas de Factus)'}</b> por {formatPrice(data.total)}, una por venta, a "Consumidor final". Una factura emitida no se borra: solo se anula con nota crédito.</>
                    : <>Modo pruebas: se generan {data.orders.length} documentos simulados (sin validez fiscal).</>}
                </p>
                <div className="flex gap-2">
                  <button onClick={start} className="px-4 py-2 rounded-lg bg-brand-button text-brand-on-button text-xs font-bold flex items-center gap-1.5" data-lote-si><Play size={13} /> Sí, emitir {data.orders.length}</button>
                  <button onClick={() => setConfirming(false)} className="px-3 py-2 rounded-lg border border-border text-xs font-semibold">Cancelar</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirming(true)} className="px-4 py-2 rounded-xl gradient-primary text-primary-foreground text-xs font-bold flex items-center gap-1.5" data-lote-emitir>
                <FileStack size={14} /> Emitir {data.orders.length} factura(s)
              </button>
            )
          )}
          {run?.active && <button onClick={() => { stop.current = true; }} className="px-3 py-2 rounded-lg border border-border text-xs font-semibold flex items-center gap-1.5"><Square size={12} /> Detener</button>}
          {data.orders.length === 0 && !run && <p className="text-xs text-emerald-700">Todas las ventas a consumidor final de esta jornada ya tienen factura.</p>}
        </>
      )}
    </section>
  );
};

export default FacturarLote;
