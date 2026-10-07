import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Printer, Receipt, ChefHat, Pencil, Trash2, FileCheck2, X, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import { downloadXlsx } from '@/lib/xlsx';
import { canDo } from '@/lib/permissions';
import { printReceipt, printPreBill, printKitchen } from '@/lib/netPrint';
import { ElectronicInvoiceModal } from '@/components/ElectronicInvoiceModal';
import { Modal, INPUT as PINPUT, LABEL } from '@/components/common/Primitives';
import { FilterBar, Kpi, DetailPane, ActionBtn, Row, SectionTitle, Empty, usePaged, MoreButton, statusStyle, dt, periodParams, METHOD_NAME, type Period, type FilterField } from './common';
import { NiceSelect } from '@/components/ui/nice-select';

const INFO_TABS = [['methods', 'Medios de pago'], ['rooms', 'Salones'], ['cancel', 'Cancelaciones'], ['tips', 'Propinas'], ['delivery', 'Costos de envío']] as const;

export const VentasTab = ({ period, setPeriod, shifts, selectedId, onSelect }: { period: Period; setPeriod: (p: Period) => void; shifts: any[]; selectedId: number | null; onSelect: (id: number | null) => void }) => {
  const customers = useStore(s => s.customers);
  const branches = useStore(s => s.branches);
  const [f, setF] = useState<Record<string, string>>({ status: '', type: '', waiter: '', customer: '', method: '', table: '', invoiced: '' });
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const load = useCallback(() => { setLoading(true); api.getCajaSales({ ...periodParams(period), ...f }).then(setData).catch(e => toast.error(e.message)).finally(() => setLoading(false)); }, [period, f]);
  useEffect(() => { load(); }, [load]);
  const s = data?.summary;
  const rows: any[] = data?.orders || [];
  const paged = usePaged(rows, JSON.stringify([period, f]));
  const fields: FilterField[] = [
    { key: 'status', label: 'Estado de venta', options: [['cancelled', 'Eliminada'], ['closed', 'Cerrada'], ['shipped', 'Enviado'], ['active', 'En curso'], ['billing', 'Pagando'], ['ready', 'A entregar'], ['unpaid', 'Por cobrar']] },
    { key: 'type', label: 'Tipo de venta', options: [['dine-in', 'Mesas'], ['delivery', 'Domicilio'], ['pickup', 'Mostrador']] },
    { key: 'waiter', label: 'Cam / Rep', options: (data?.waiters || []).map((w: string) => [w, w]) },
    { key: 'customer', label: 'Cliente', type: 'text', placeholder: 'Nombre o teléfono', list: customers.slice(0, 300).map(c => c.name) },
    { key: 'method', label: 'Medio de pago', options: [['cash', 'Efectivo'], ['card', 'Datáfono'], ['transfer', 'Transferencia bancaria'], ['platform', 'Plataforma'], ['credit', 'A crédito']] },
    { key: 'table', label: 'Mesa', options: (data?.tables || []).map((t: string) => [t, t]) },
    { key: 'invoiced', label: 'Facturación', options: [['yes', 'Facturado'], ['no', 'No facturado']] },
    ...(branches.length > 1 ? [{ key: 'branch', label: 'Sede', options: [['all', 'Todas las sedes'], ...branches.map(b => [String(b.id), b.name] as [string, string])] as Array<[string, string]> }] : []),
  ];
  const exportX = () => data && downloadXlsx(`ventas_${new Date().toISOString().slice(0, 10)}`, [{
    name: 'Ventas', widths: [8, 16, 16, 11, 12, 6, 20, 22, 12, 14, 12, 10, 10, 13],
    headers: ['ID', 'Hora inicio', 'Hora cierre', 'Estado', 'Tipo', 'Mesa', 'Cam / Rep', 'Cliente', 'Facturación', 'Medio de pago', 'Venta', 'Propina', 'Descuento', 'Total cobrado'],
    rows: rows.map(o => [o.label || o.id, dt(o.createdAt), dt(o.closedAt), statusStyle(o.status).label, o.typeLabel, o.table || '', o.waiter, o.customer, o.invoiced ? o.invoiceNumber : 'No facturado', METHOD_NAME[o.method] || o.method, o.total, o.tip, o.discount, o.status === 'cancelled' ? 0 : o.total + o.tip]),
  }]);
  const maxMethod = Math.max(1, ...(data?.byMethod || []).map((m: any) => m.amount));
  const maxRoom = Math.max(1, ...(data?.byRoom || []).map((m: any) => m.amount));
  return (
    <div className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)] gap-3 items-start" data-ventas>
      <div className="space-y-3 min-w-0">
        <FilterBar period={period} setPeriod={setPeriod} shifts={shifts} serviceShifts={data?.serviceShifts || []} fields={fields} values={f} setValues={setF} onExport={exportX} rangeLabel={data ? `${data.scope.label} · ${data.records} registros` : undefined} />
        {s && (
          <div className="bg-card rounded-xl border border-border overflow-hidden" data-ventas-summary>
            <div className="grid grid-cols-1 sm:grid-cols-5">
              <Kpi label="Ventas" value={String(s.count)} help="Solo ventas con productos confirmados." sub={s.cancelled ? `${s.cancelled} eliminada(s)` : undefined} testId="ventas" />
              <Kpi label="Promedio por venta" value={formatPrice(s.avgTicket)} help="Total de ventas dividido número de ventas, sin importar el tipo de venta." />
              <Kpi label="Personas" value={String(s.people)} help="Suma de comensales (solo mesas)." />
              <Kpi label="Promedio por persona" value={formatPrice(s.avgPerPerson)} help="Total de ventas de mesas dividido número de personas." />
              <Kpi label="Total" value={formatPrice(s.total)} sub={`Propinas ${formatPrice(s.tips)} aparte`} help="Suma de las ventas (sin propinas)." />
            </div>
            <button onClick={() => setInfo(i => (i ? null : 'methods'))} className="w-full py-1.5 border-t border-border text-[11px] font-bold text-muted-foreground uppercase tracking-wide" data-more-info>{info ? 'Ocultar' : 'Más info'}</button>
            {info && (
              <div className="grid sm:grid-cols-[170px_1fr] border-t border-border text-sm" data-more-info-panel>
                <div className="flex sm:flex-col overflow-x-auto sm:border-r border-border bg-muted/30">
                  {INFO_TABS.map(([k, l]) => <button key={k} onClick={() => setInfo(k)} className={cn('px-3 py-2 text-left text-xs font-semibold whitespace-nowrap', info === k ? 'bg-white text-brand-dark' : 'text-muted-foreground')}>{l}</button>)}
                </div>
                <div className="p-3 space-y-1.5">
                  {info === 'methods' && (data.byMethod.length ? data.byMethod.map((m: any) => (
                    <div key={m.method} className="text-xs"><div className="flex justify-between"><span>{METHOD_NAME[m.method] || m.label}</span><b>{formatPrice(m.amount)}</b></div><div className="h-2 rounded bg-muted mt-0.5"><div className="h-2 rounded bg-brand-button" style={{ width: `${(m.amount / maxMethod) * 100}%` }} /></div></div>
                  )) : <p className="text-xs text-muted-foreground">Sin pagos.</p>)}
                  {info === 'methods' && s.pending > 0 && <div className="flex justify-between text-xs text-amber-700"><span>Por cobrar</span><b>{formatPrice(s.pending)}</b></div>}
                  {info === 'rooms' && data.byRoom.map((r: any) => <div key={r.room} className="text-xs"><div className="flex justify-between"><span>{r.room}</span><b>{formatPrice(r.amount)}</b></div><div className="h-2 rounded bg-muted mt-0.5"><div className="h-2 rounded bg-brand-accent" style={{ width: `${(r.amount / maxRoom) * 100}%` }} /></div></div>)}
                  {info === 'cancel' && <div className="text-xs space-y-1"><p className="font-semibold">Adiciones canceladas</p><div className="flex justify-between"><span>Cantidad</span><b>{s.cancelledItems}</b></div><div className="flex justify-between"><span>Monto</span><b>{formatPrice(s.cancelledItemsAmount)}</b></div><div className="flex justify-between text-muted-foreground"><span>Ventas eliminadas</span><b>{s.cancelled} · {formatPrice(s.cancelledTotal)}</b></div></div>}
                  {info === 'tips' && <div className="flex justify-between text-xs"><span>Total propinas</span><b>{formatPrice(s.tips)}</b></div>}
                  {info === 'delivery' && <div className="flex justify-between text-xs"><span>Total costos de envío</span><b>{formatPrice(s.deliveryFees)}</b></div>}
                </div>
              </div>
            )}
          </div>
        )}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-ventas-table>
              <thead><tr className="bg-muted/40 text-muted-foreground text-left">{['ID / Etiqueta', 'Hora inicio', 'Hora cierre', 'Estado', 'Mesa', 'Cam / Rep', 'Cliente', 'Facturación', 'Total'].map((h, i) => <th key={h} className={cn('px-3 py-2 font-semibold whitespace-nowrap', i === 8 && 'text-right')}>{h}</th>)}</tr></thead>
              <tbody>
                {paged.shown.map(o => {
                  const st = statusStyle(o.status);
                  return (
                    <tr key={o.id} onClick={() => onSelect(o.id)} data-sale-row={o.id} className={cn('border-t border-border cursor-pointer border-l-4', st.bar, selectedId === o.id ? 'bg-amber-100' : 'hover:bg-brand-button/5', o.status === 'cancelled' && 'opacity-70')}>
                      <td className="px-3 py-2 font-semibold whitespace-nowrap">{o.label || `#${o.id}`}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{dt(o.createdAt)}</td><td className="px-3 py-2 whitespace-nowrap">{dt(o.closedAt)}</td>
                      <td className="px-3 py-2"><span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap', st.chip)}>{st.label}</span></td>
                      <td className="px-3 py-2">{o.table || '—'}</td><td className="px-3 py-2 whitespace-nowrap">{o.waiter || '—'}</td><td className="px-3 py-2 truncate max-w-[140px]">{o.customer || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{o.invoiced ? <span className="text-emerald-700 font-semibold">{o.invoiceNumber}</span> : <span className="text-muted-foreground">No facturado</span>}</td>
                      <td className="px-3 py-2 text-right font-bold whitespace-nowrap">{formatPrice(o.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {data && rows.length === 0 && <Empty title={loading ? 'Cargando...' : 'No se encontraron ventas'} text="No hay ventas para los filtros seleccionados." />}
          {rows.length > 0 && <MoreButton more={paged.more} onClick={paged.showMore} shown={paged.shown.length} total={paged.total} />}
        </div>
      </div>
      <SaleDetail id={selectedId} onClose={() => onSelect(null)} onChanged={load} />
    </div>
  );
};

/* ======================= Detalle de venta ======================= */
export const SaleDetail = ({ id, onClose, onChanged }: { id: number | null; onClose: () => void; onChanged: () => void }) => {
  const navigate = useNavigate();
  const user = useStore(s => s.user);
  const restaurant = useStore(s => s.restaurant);
  const [d, setD] = useState<any>(null);
  const [fe, setFe] = useState(false);
  const [edit, setEdit] = useState<null | 'payment' | 'tip' | 'cancel' | { item: any }>(null);
  const load = useCallback(() => { if (id) api.getCajaSale(id).then(setD).catch(e => { toast.error(e.message); setD(null); }); }, [id]);
  useEffect(() => { setD(null); load(); }, [load]);
  const o = d?.order, sm = d?.summary;
  const active = o && !['delivered', 'cancelled'].includes(o.status);
  const canCancel = user?.role === 'admin' || canDo(user, 'cancel_orders');
  const changed = () => { load(); onChanged(); };
  const st = o ? statusStyle(o.status) : null;
  return (
    <DetailPane open={!!id} onClose={onClose} title={o ? `VENTA ${o.label ? o.label : '#' + o.id}` : 'VENTA'} empty="‹ Selecciona una venta del listado para ver su detalle"
      actions={o && (
        <>
          {o.status === 'delivered' && <ActionBtn title="Factura electrónica (emitir / ver)" onClick={() => setFe(true)} testId="fe"><FileCheck2 size={15} /></ActionBtn>}
          {o.status === 'delivered' && <ActionBtn title="Imprimir ticket" onClick={() => printReceipt(o)} testId="print-ticket"><Printer size={15} /></ActionBtn>}
          {o.type === 'dine-in' && o.status !== 'cancelled' && <ActionBtn title="Imprimir control de mesa (precuenta)" onClick={() => printPreBill(o, restaurant?.tipDineIn ? restaurant.tipPercent : 0)} testId="print-prebill"><Receipt size={15} /></ActionBtn>}
          {o.status !== 'cancelled' && <ActionBtn title="Imprimir comanda completa" onClick={() => printKitchen(o, o.items, undefined, restaurant)} testId="print-kitchen"><ChefHat size={15} /></ActionBtn>}
          {active && <ActionBtn title="Editar venta" onClick={() => navigate(`/cuenta/${o.id}`)} testId="edit"><Pencil size={15} /></ActionBtn>}
          {o.status !== 'cancelled' && canCancel && <ActionBtn title="Eliminar (anular) venta" onClick={() => setEdit('cancel')} testId="delete"><Trash2 size={15} /></ActionBtn>}
        </>
      )}>
      {!o ? <p className="p-4 text-sm text-muted-foreground">Cargando...</p> : (
        <div data-sale-detail={o.id}>
          <div className="py-1">
            <Row k="Hora inicio" v={dt(o.createdAt)} />
            <Row k="Hora de cierre" v={dt(sm.closedAt)} />
            <Row k="Creada por" v={o.createdBy || sm.createdBy || '—'} />
            <Row k="Cerrada por" v={o.closedBy || '—'} />
            <Row k="Tipo" v={sm.typeLabel} />
            <Row k="Estado" v={<span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold', st!.chip)}>{st!.label}</span>} />
            {o.cancelReason && <Row k="Motivo de anulación" v={o.cancelReason} />}
            {sm.waiter && <Row k={o.type === 'delivery' ? 'Repartidor' : 'Mesero'} v={sm.waiter} />}
            {o.type === 'dine-in' && <Row k="Mesa" v={`${o.tableLabel || '—'}${sm.room ? ' · ' + sm.room : ''}`} />}
            {o.people ? <Row k="Personas" v={o.people} /> : null}
            {sm.customer && <Row k="Cliente" v={`${sm.customer}${sm.customerPhone ? ' · ' + sm.customerPhone : ''}`} />}
            {sm.invoiced && <Row k="Factura" v={sm.invoiceNumber} />}
          </div>
          <SectionTitle>Adiciones</SectionTitle>
          <div className="divide-y divide-border/60">
            {o.items.map((i: any) => (
              <div key={i.id} className="px-4 py-1.5 flex items-center gap-2 text-sm" data-sale-item>
                <span className="w-7 text-right font-semibold">{i.quantity}</span>
                <span className="flex-1 min-w-0"><span className="block truncate">{i.name}{i.size ? ` (${i.size})` : ''}</span>{i.sentAt && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Clock size={9} /> {dt(i.sentAt).slice(9)}</span>}</span>
                <span className="whitespace-nowrap">{formatPrice(i.price * i.quantity)}</span>
                {active && canCancel && <button onClick={() => setEdit({ item: i })} title="Cancelar adición" className="p-1 text-muted-foreground hover:text-red-600" data-cancel-item><X size={13} /></button>}
              </div>
            ))}
            {d.cancellations.map((c: any) => (
              <div key={'c' + c.id} className="px-4 py-1.5 flex items-center gap-2 text-sm text-muted-foreground line-through" title={`Cancelada por ${c.cancelledBy || '—'} ${dt(c.cancelledAt)}${c.reason ? ' · ' + c.reason : ''}`}>
                <span className="w-7 text-right">{c.quantity}</span><span className="flex-1 truncate">{c.name}</span><span>{formatPrice(c.price * c.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-border py-1">
            <Row k="Subtotal" v={formatPrice(o.subtotal)} />
            {o.deliveryFee > 0 && <Row k="Costo de envío" v={formatPrice(o.deliveryFee)} />}
            {o.discount > 0 && <Row k={`Descuento ${o.discountReason || ''}`} v={<span className="text-red-700">−{formatPrice(o.discount)}</span>} />}
            <Row k="Total" v={formatPrice(o.total)} strong />
          </div>
          <SectionTitle>Pagos</SectionTitle>
          <div className="py-1">
            {o.paymentStatus !== 'paid' && o.status === 'delivered' && <Row k="Estado" v={<span className="text-amber-700 font-semibold">Por cobrar</span>} />}
            {o.status !== 'delivered' && <p className="px-4 py-1.5 text-xs text-muted-foreground">Aún sin cobrar.</p>}
            {o.status === 'delivered' && Object.entries(sm.parts || {}).map(([m, v]: any) => <Row key={m} k={METHOD_NAME[m] || m} v={formatPrice(v)} />)}
            {d.creditPayments.map((p: any) => <Row key={'p' + p.id} k={`Abono ${dt(p.date)} · ${METHOD_NAME[p.method] || p.method}`} v={formatPrice(p.amount)} />)}
            {d.canEdit && <button onClick={() => setEdit('payment')} className="mx-4 my-1.5 text-xs font-semibold text-brand-primary flex items-center gap-1" data-edit-payment><Pencil size={12} /> Editar pago</button>}
          </div>
          <SectionTitle>Propinas</SectionTitle>
          <div className="py-1">
            {o.tip > 0 ? <Row k={o.tipTo === 'waiter' && o.waiterName ? `Para ${o.waiterName}` : 'Propina común'} v={formatPrice(o.tip)} /> : <p className="px-4 py-1.5 text-xs text-muted-foreground">Sin propina.</p>}
            {d.canEdit && <button onClick={() => setEdit('tip')} className="mx-4 my-1.5 text-xs font-semibold text-brand-primary flex items-center gap-1" data-edit-tip><Pencil size={12} /> Editar propina</button>}
            {!d.canEdit && o.status === 'delivered' && <p className="px-4 pb-2 text-[11px] text-muted-foreground">La caja de esta venta está cerrada: solo un administrador puede corregir pagos y propinas.</p>}
          </div>
        </div>
      )}
      {fe && o && <ElectronicInvoiceModal order={o} onClose={() => { setFe(false); changed(); }} />}
      {edit === 'payment' && o && <EditPaymentModal o={o} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); changed(); }} />}
      {edit === 'tip' && o && <EditTipModal o={o} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); changed(); }} />}
      {edit === 'cancel' && o && <ReasonModal title={`Eliminar venta #${o.id}`} text="La venta queda como Eliminada (anulada): sale de los totales, se devuelve el inventario y se anula su asiento contable." confirm="Eliminar venta"
        onClose={() => setEdit(null)} onConfirm={async r => { await api.cancelSale(o.id, r); toast.success('Venta eliminada'); setEdit(null); changed(); }} />}
      {edit && typeof edit === 'object' && 'item' in edit && o && <ReasonModal title={`Cancelar ${edit.item.quantity} × ${edit.item.name}`} text="La adición sale de la cuenta y queda registrada como cancelada (con quién y por qué)." confirm="Cancelar adición"
        onClose={() => setEdit(null)} onConfirm={async r => { await api.cancelItem(o.id, edit.item.id, r); toast.success('Adición cancelada'); setEdit(null); changed(); }} />}
    </DetailPane>
  );
};

const ReasonModal = ({ title, text, confirm, onClose, onConfirm }: { title: string; text: string; confirm: string; onClose: () => void; onConfirm: (reason: string) => Promise<void> }) => {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); try { await onConfirm(reason.trim()); } catch (e: any) { toast.error(e.message); } setBusy(false); };
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-xs text-muted-foreground">{text}</p>
      <div><label className={LABEL}>Motivo</label><input autoFocus value={reason} onChange={e => setReason(e.target.value)} className={PINPUT} placeholder="Ej. el cliente se fue, se marcó por error" data-reason /></div>
      <button onClick={go} disabled={busy || reason.trim().length < 3} className="w-full py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-40" data-confirm>{confirm}</button>
    </Modal>
  );
};

const PAY_METHODS: Array<[string, string]> = [['cash', 'Efectivo'], ['card_debit', 'Datáfono débito'], ['card_credit', 'Datáfono crédito'], ['transfer', 'Transferencia'], ['platform', 'Plataforma'], ['credit', 'A crédito'], ['mixed', 'Mixto (dos medios)']];
const EditPaymentModal = ({ o, onClose, onSaved }: { o: any; onClose: () => void; onSaved: () => void }) => {
  const due = o.total + (o.tip || 0);
  const [method, setMethod] = useState(o.paymentMethod);
  const [m1, setM1] = useState(o.paymentSplit?.method1 || 'cash'); const [a1, setA1] = useState(String(o.paymentSplit?.amount1 ?? ''));
  const [m2, setM2] = useState(o.paymentSplit?.method2 || 'transfer'); const [a2, setA2] = useState(String(o.paymentSplit?.amount2 ?? ''));
  const ok = method !== 'mixed' || ((Number(a1) || 0) + (Number(a2) || 0) === due && m1 !== m2);
  const save = async () => {
    try { await api.editSalePayment(o.id, { paymentMethod: method, paymentSplit: method === 'mixed' ? { method1: m1, amount1: Number(a1) || 0, method2: m2, amount2: Number(a2) || 0 } : undefined }); toast.success('Pago corregido'); onSaved(); }
    catch (e: any) { toast.error(e.message); }
  };
  const simple = PAY_METHODS.filter(([k]) => !['mixed', 'credit'].includes(k));
  return (
    <Modal title={`Editar pago · venta #${o.id}`} onClose={onClose}>
      <p className="text-xs text-muted-foreground">Total cobrado (venta + propina): <b>{formatPrice(due)}</b>. El cambio se refleja en el arqueo y en la contabilidad.</p>
      <div><label className={LABEL}>Medio de pago</label><NiceSelect value={method} onChange={e => setMethod(e.target.value)} className={PINPUT} data-pay-method>{PAY_METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</NiceSelect></div>
      {method === 'mixed' && (
        <div className="grid grid-cols-2 gap-2">
          <div><NiceSelect value={m1} onChange={e => setM1(e.target.value)} className={PINPUT}>{simple.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</NiceSelect><input type="number" value={a1} onChange={e => { setA1(e.target.value); setA2(String(Math.max(0, due - (Number(e.target.value) || 0)))); }} className={cn(PINPUT, 'mt-1 font-mono')} data-pay-a1 /></div>
          <div><NiceSelect value={m2} onChange={e => setM2(e.target.value)} className={PINPUT}>{simple.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</NiceSelect><input type="number" value={a2} onChange={e => setA2(e.target.value)} className={cn(PINPUT, 'mt-1 font-mono')} /></div>
          <p className={cn('col-span-2 text-[11px]', ok ? 'text-emerald-700' : 'text-red-600')}>{ok ? 'Los dos medios suman el total.' : `Deben sumar ${formatPrice(due)}.`}</p>
        </div>
      )}
      <button onClick={save} disabled={!ok} className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-40" data-save-payment>Guardar pago</button>
    </Modal>
  );
};

const EditTipModal = ({ o, onClose, onSaved }: { o: any; onClose: () => void; onSaved: () => void }) => {
  const [tip, setTip] = useState(String(o.tip || 0));
  const [to, setTo] = useState(o.tipTo === 'waiter' ? 'waiter' : 'common');
  const save = async () => { try { await api.editSaleTip(o.id, { tip: Number(tip) || 0, tipTo: to }); toast.success('Propina corregida'); onSaved(); } catch (e: any) { toast.error(e.message); } };
  return (
    <Modal title={`Editar propina · venta #${o.id}`} onClose={onClose}>
      <div><label className={LABEL}>Valor de la propina</label><input type="number" min={0} value={tip} onChange={e => setTip(e.target.value)} className={cn(PINPUT, 'font-mono')} data-tip-value /></div>
      {o.waiterName && <div className="flex gap-2 text-xs"><label className="flex items-center gap-1"><input type="radio" checked={to === 'waiter'} onChange={() => setTo('waiter')} /> Para {o.waiterName}</label><label className="flex items-center gap-1"><input type="radio" checked={to === 'common'} onChange={() => setTo('common')} /> Propina común</label></div>}
      <p className="text-[11px] text-muted-foreground">Se actualiza la propina del personal y, en pagos mixtos, la diferencia se ajusta en el primer medio.</p>
      <button onClick={save} className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold" data-save-tip>Guardar propina</button>
    </Modal>
  );
};

export default VentasTab;
void useMemo;
