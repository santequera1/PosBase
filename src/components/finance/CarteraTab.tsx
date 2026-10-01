import { Fragment, useEffect, useState } from 'react';
import { HandCoins, Download, ChevronDown, ChevronRight, AlertTriangle, Clock, MessageCircle, Trash2, Banknote, ArrowLeftRight, CreditCard, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatPrice, getColombiaTodayStr } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Chip, Modal, INPUT, LABEL, fmtDate, KpiCard } from '@/components/common/Primitives';
import { downloadXlsx } from '@/lib/xlsx';
import { useStore } from '@/store/useStore';

type Side = 'cobrar' | 'pagar';
const BUCKET: Array<[string, string]> = [['current', 'Al día'], ['d30', '1–30 días'], ['d60', '31–60'], ['d90', '61–90'], ['d90plus', '> 90 días']];
const METHODS: Record<string, { label: string; icon: any }> = { cash: { label: 'Efectivo', icon: Banknote }, transfer: { label: 'Transferencia', icon: ArrowLeftRight }, card: { label: 'Tarjeta', icon: CreditCard } };

/** Cartera: cuentas por cobrar (clientes a crédito y plataformas) y por pagar (proveedores) por tercero, documento y vencimiento, con abonos. */
const CarteraTab = ({ isAdmin }: { isAdmin: boolean }) => {
  const [side, setSide] = useState<Side>('pagar');
  const [date, setDate] = useState(getColombiaTodayStr());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [paying, setPaying] = useState<any>(null);
  const [error, setError] = useState('');
  const businessName = useStore(s => s.businessName);

  const load = () => {
    setLoading(true);
    (side === 'cobrar' ? api.getReceivablesAging(date) : api.getPayablesAging(date)).then(setData).catch(e => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, [side, date]);

  const exportXlsx = () => data && downloadXlsx(`cartera_por_${side}_${date}`, [{ name: side === 'cobrar' ? 'Por cobrar' : 'Por pagar', headers: ['Tercero', 'Documento tercero', 'Documento', 'Descripción', 'Fecha', 'Vence', 'Días', 'Valor', 'Abonado', 'Saldo', 'Rango'],
    rows: data.thirds.flatMap((t: any) => t.documents.map((d: any) => [t.name, t.doc, d.doc, d.description || '', d.date, d.dueDate, d.overdueDays, d.total, d.paid, d.balance, BUCKET.find(b => b[0] === d.bucket)?.[1] || d.bucket])), widths: [30, 14, 14, 30, 11, 11, 6, 14, 14, 14, 12] }]);

  const remind = (t: any) => {
    const docs = t.documents.map((d: any) => `• ${d.doc} · vence ${fmtDate(d.dueDate)} · ${formatPrice(d.balance)}`).join('\n');
    const msg = `Hola ${t.name}, te escribimos de ${businessName}. Tienes un saldo pendiente de ${formatPrice(t.balance)}:\n${docs}\n¿Nos confirmas la fecha de pago? ¡Gracias!`;
    const phone = String(t.phone || '').replace(/\D/g, '');
    window.open(`https://wa.me/${phone.length === 10 ? '57' + phone : phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex gap-1.5">
          <Chip active={side === 'pagar'} onClick={() => setSide('pagar')}>Cuentas por pagar (proveedores)</Chip>
          <Chip active={side === 'cobrar'} onClick={() => setSide('cobrar')}>Cuentas por cobrar (clientes y plataformas)</Chip>
        </div>
        <div><label className={LABEL}>Corte</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className={cn(INPUT, 'py-1.5 text-xs')} /></div>
        <button onClick={exportXlsx} className="px-3 py-2 rounded-lg border border-border text-xs font-semibold flex items-center gap-1.5"><Download size={13} /> Excel</button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label={side === 'cobrar' ? 'Total por cobrar' : 'Total por pagar'} value={formatPrice(data.total)} sub={`${data.count} documento(s) · ${data.thirds.length} tercero(s)`} />
            <KpiCard label="Vencido" value={formatPrice(data.overdue)} className={data.overdue > 0 ? 'bg-red-50 border-red-200' : ''} />
            <KpiCard label="Vence en 7 días" value={formatPrice(data.dueSoon)} className={data.dueSoon > 0 ? 'bg-amber-50 border-amber-200' : ''} />
            <div className="bg-card rounded-xl border border-border p-3 shadow-card">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Edades de cartera</p>
              <div className="space-y-0.5">{BUCKET.map(([k, l]) => <div key={k} className="flex justify-between text-[11px]"><span className={cn(k !== 'current' && data.buckets[k] > 0 ? 'text-red-700 font-semibold' : 'text-muted-foreground')}>{l}</span><span className="font-semibold">{formatPrice(data.buckets[k] || 0)}</span></div>)}</div>
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
            {loading ? <p className="p-4 text-xs text-muted-foreground">Cargando...</p> : data.thirds.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground"><CheckCircle2 size={28} className="mx-auto mb-2 text-emerald-500" /><p className="text-sm">{side === 'cobrar' ? 'No hay saldos por cobrar.' : 'No hay saldos por pagar.'}</p></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead><tr className="text-muted-foreground bg-muted/30"><th className="px-3 py-2 text-left font-semibold">Tercero</th><th className="px-3 py-2 text-right font-semibold">Docs</th><th className="px-3 py-2 text-right font-semibold">Al día</th><th className="px-3 py-2 text-right font-semibold">Vencido</th><th className="px-3 py-2 text-right font-semibold">Saldo</th><th className="px-3 py-2 text-left font-semibold">Vence antes</th><th /></tr></thead>
                  <tbody>
                    {data.thirds.map((t: any) => {
                      const key = `${t.doc}|${t.name}`;
                      return (
                        <Fragment key={key}>
                          <tr onClick={() => setOpen(o => ({ ...o, [key]: !o[key] }))} className={cn('border-t border-border cursor-pointer hover:bg-brand-button/5', t.overdue > 0 && 'bg-red-50/40')}>
                            <td className="px-3 py-2"><span className="inline-flex items-center gap-1 font-semibold text-brand-dark">{open[key] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{t.name}</span>{t.doc && <span className="text-muted-foreground ml-1 font-mono">({t.doc})</span>}</td>
                            <td className="px-3 py-2 text-right">{t.count}</td>
                            <td className="px-3 py-2 text-right">{formatPrice(t.current)}</td>
                            <td className={cn('px-3 py-2 text-right', t.overdue > 0 && 'text-red-700 font-semibold')}>{formatPrice(t.overdue)}</td>
                            <td className="px-3 py-2 text-right font-bold text-brand-primary">{formatPrice(t.balance)}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{fmtDate(t.oldestDue)}</td>
                            <td className="px-2 py-1 text-right whitespace-nowrap">{side === 'cobrar' && t.phone && <button onClick={e => { e.stopPropagation(); remind(t); }} title="Recordatorio por WhatsApp" className="p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-50"><MessageCircle size={14} /></button>}</td>
                          </tr>
                          {open[key] && (
                            <tr className="bg-muted/20"><td colSpan={7} className="px-3 py-2">
                              <table className="w-full text-[11px] border border-border rounded-lg overflow-hidden bg-card">
                                <thead><tr className="text-muted-foreground"><th className="px-2 py-1 text-left font-semibold">Documento</th><th className="px-2 py-1 text-left font-semibold">Fecha</th><th className="px-2 py-1 text-left font-semibold">Vence</th><th className="px-2 py-1 text-right font-semibold">Valor</th><th className="px-2 py-1 text-right font-semibold">Abonado</th><th className="px-2 py-1 text-right font-semibold">Saldo</th><th className="px-2 py-1 font-semibold">Estado</th><th /></tr></thead>
                                <tbody>
                                  {t.documents.map((d: any) => (
                                    <tr key={d.id} className="border-t border-border">
                                      <td className="px-2 py-1">{d.doc}{d.description ? <span className="text-muted-foreground"> · {d.description}</span> : ''}</td>
                                      <td className="px-2 py-1 whitespace-nowrap">{fmtDate(d.date)}</td><td className="px-2 py-1 whitespace-nowrap">{fmtDate(d.dueDate)}</td>
                                      <td className="px-2 py-1 text-right">{formatPrice(d.total)}</td><td className="px-2 py-1 text-right">{formatPrice(d.paid)}</td><td className="px-2 py-1 text-right font-bold">{formatPrice(d.balance)}</td>
                                      <td className="px-2 py-1 text-center">{d.overdueDays > 0 ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold inline-flex items-center gap-0.5"><AlertTriangle size={10} /> {d.overdueDays} d vencido</span> : d.overdueDays === 0 ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">Vence hoy</span> : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold inline-flex items-center gap-0.5"><Clock size={10} /> {-d.overdueDays} d</span>}</td>
                                      <td className="px-2 py-1 text-right"><button onClick={() => setPaying({ ...d, third: t })} className="px-2.5 py-1 rounded-lg bg-brand-button text-brand-on-button text-[11px] font-semibold whitespace-nowrap">{side === 'cobrar' ? 'Registrar abono' : 'Abonar / pagar'}</button></td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td></tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
      {paying && <PaymentModal side={side} doc={paying} isAdmin={isAdmin} onClose={() => setPaying(null)} onDone={() => { setPaying(null); load(); }} />}
    </div>
  );
};

/** Abono a un documento (pedido a crédito / plataforma, o factura de proveedor), con historial de abonos. */
const PaymentModal = ({ side, doc, isAdmin, onClose, onDone }: { side: Side; doc: any; isAdmin: boolean; onClose: () => void; onDone: () => void }) => {
  const currentShift = useStore(s => s.currentShift);
  const refreshCurrentShift = useStore(s => s.refreshCurrentShift);
  const [amount, setAmount] = useState(String(doc.balance));
  const [method, setMethod] = useState('transfer');
  const [date, setDate] = useState(getColombiaTodayStr());
  const [notes, setNotes] = useState('');
  const [fromCash, setFromCash] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const loadHistory = () => (side === 'cobrar' ? api.getOrderPayments(doc.id).then(r => setHistory(r.payments)) : api.getExpensePayments(doc.id).then(r => setHistory(r.payments))).catch(() => {});
  useEffect(() => { loadHistory(); }, [doc.id]);
  const n = Math.round(Number(amount) || 0);
  const save = async () => {
    setSaving(true); setError('');
    try {
      if (side === 'cobrar') await api.addOrderPayment(doc.id, { amount: n, method, date, notes });
      else { await api.payExpense(doc.id, { amount: n, paymentMethod: method, fromCashRegister: method === 'cash' && fromCash, paidAt: date, notes }); if (method === 'cash' && fromCash) refreshCurrentShift(); }
      onDone();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };
  const removePayment = async (p: any) => {
    if (!window.confirm('¿Eliminar este abono? El saldo volverá a quedar pendiente.')) return;
    try { if (side === 'cobrar') await api.deleteOrderPayment(doc.id, p.id); else await api.deleteExpensePayment(doc.id, p.id); onDone(); } catch (e: any) { setError(e.message); }
  };
  return (
    <Modal title={side === 'cobrar' ? 'Registrar abono del cliente' : 'Abono o pago al proveedor'} onClose={onClose}>
      <div className="p-3 rounded-lg bg-brand-card border border-border">
        <p className="text-sm font-semibold text-brand-dark">{doc.third.name} · {doc.doc}</p>
        <p className="text-xs text-muted-foreground">{doc.description ? `${doc.description} · ` : ''}vence {fmtDate(doc.dueDate)}</p>
        <div className="flex justify-between mt-1 text-xs"><span>Valor {formatPrice(doc.total)} · abonado {formatPrice(doc.paid)}</span><span className="font-bold text-brand-primary">Saldo {formatPrice(doc.balance)}</span></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={LABEL}>Valor del abono</label><input type="number" min={1} max={doc.balance} value={amount} onChange={e => setAmount(e.target.value)} className={cn(INPUT, 'font-mono text-base')} /><div className="flex gap-1 mt-1"><Chip onClick={() => setAmount(String(doc.balance))} active={n === doc.balance}>Saldo total</Chip><Chip onClick={() => setAmount(String(Math.round(doc.balance / 2)))}>Mitad</Chip></div></div>
        <div><label className={LABEL}>Fecha</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className={INPUT} /></div>
        <div className="col-span-2"><label className={LABEL}>Medio</label><div className="flex flex-wrap gap-2">{Object.entries(METHODS).map(([k, m]) => <Chip key={k} active={method === k} onClick={() => setMethod(k)}><span className="flex items-center gap-1"><m.icon size={13} /> {m.label}</span></Chip>)}</div></div>
        <div className="col-span-2"><label className={LABEL}>Nota</label><input value={notes} onChange={e => setNotes(e.target.value)} className={INPUT} placeholder="Ej: consignación Bancolombia, pago semanal" /></div>
        {side === 'pagar' && method === 'cash' && (
          <label className={cn('col-span-2 flex items-start gap-2 p-3 rounded-lg border text-xs', currentShift ? 'border-brand-accent/40 bg-brand-card cursor-pointer' : 'border-border bg-muted/30 opacity-70')}>
            <input type="checkbox" disabled={!currentShift} checked={fromCash} onChange={e => setFromCash(e.target.checked)} className="mt-0.5" />
            <span><span className="font-semibold text-brand-dark block">Descontar de la caja abierta</span><span className="text-muted-foreground">{currentShift ? 'Se registra como retiro en el turno actual.' : 'No hay turno abierto.'}</span></span>
          </label>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button onClick={save} disabled={saving || n <= 0 || n > doc.balance} className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-1.5"><HandCoins size={15} /> {saving ? 'Registrando...' : n >= doc.balance ? 'Registrar pago total' : `Registrar abono de ${formatPrice(n)}`}</button>
      {history.length > 0 && (
        <div>
          <p className={LABEL}>Abonos registrados</p>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {history.map(p => (
              <li key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                <span className="text-muted-foreground w-20">{fmtDate(p.date)}</span><span className="flex-1">{METHODS[p.method]?.label || p.method}{p.notes ? ` · ${p.notes}` : ''}</span><span className="font-semibold">{formatPrice(p.amount)}</span>
                {isAdmin && <button onClick={() => removePayment(p)} className="p-1 text-muted-foreground hover:text-red-600"><Trash2 size={12} /></button>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
};

export default CarteraTab;
