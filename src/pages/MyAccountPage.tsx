import { useEffect, useState } from 'react';
import { IdCard, Receipt, UtensilsCrossed, HandCoins, Wallet, FileText, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import { fmtDate } from '@/components/common/Primitives';
import { openPayslip } from '@/lib/payslip';

const Card = ({ title, icon: Icon, right, children }: { title: string; icon: any; right?: any; children: any }) => (
  <div className="bg-card rounded-2xl border border-border shadow-card overflow-hidden">
    <div className="px-4 py-2.5 border-b border-border bg-brand-card flex items-center justify-between gap-2">
      <p className="text-xs font-bold text-brand-dark flex items-center gap-1.5"><Icon size={14} /> {title}</p>{right}
    </div>
    {children}
  </div>
);
const Kpi = ({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) => (
  <div className={cn('rounded-2xl border p-3', tone || 'bg-card border-border')}>
    <p className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</p>
    <p className="font-display font-bold text-xl text-brand-dark">{value}</p>
    {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
  </div>
);

/** Mi cuenta: cada colaborador ve sus comprobantes de nómina, lo que ha consumido, su saldo, préstamos y la próxima liquidación. */
const MyAccountPage = () => {
  const user = useStore(s => s.user);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = () => { setLoading(true); api.getMyAccount().then(d => { setData(d); setError(''); }).catch(e => setError(e.message)).finally(() => setLoading(false)); };
  useEffect(load, []);

  if (loading && !data) return <p className="p-6 text-sm text-muted-foreground">Cargando tu cuenta...</p>;
  if (error) return <p className="p-6 text-sm text-red-600">{error}</p>;
  if (!data?.linked) return (
    <div className="max-w-md mx-auto p-6 text-center space-y-2">
      <IdCard size={32} className="mx-auto text-brand-primary" />
      <h2 className="font-display font-bold text-lg text-brand-dark">Tu usuario no está vinculado a un colaborador</h2>
      <p className="text-sm text-muted-foreground">Aquí cada colaborador ve sus turnos, consumos, préstamos y comprobantes de nómina. Para eso su usuario ({user?.name}) debe estar vinculado a su ficha en Personal &amp; Nómina.</p>
      {user?.role === 'admin' && <p className="text-xs text-muted-foreground">Como administrador no necesitas ficha, salvo que también cobres nómina. Para vincular a alguien: Personal &amp; Nómina → el colaborador → Usuario del sistema.</p>}
    </div>
  );

  const { employee: emp, preview: p, loans, settlements, advances, balances } = data;
  const consumos = loans.filter((l: any) => l.kind === 'consumo');
  const prestamos = loans.filter((l: any) => l.kind !== 'consumo');
  return (
    <div className="max-w-4xl mx-auto space-y-4 font-sans pb-8" data-my-account>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl text-brand-dark">Mi cuenta</h1>
          <p className="text-xs text-muted-foreground">{emp.name}{emp.position ? ` · ${emp.position}` : ''} · {emp.payModeLabel}</p>
        </div>
        <button onClick={load} className="w-10 h-10 rounded-xl border border-border bg-white flex items-center justify-center" title="Actualizar"><RefreshCw size={16} className={cn(loading && 'animate-spin')} /></button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Próxima liquidación (estimada)" value={formatPrice(p?.subtotal || 0)} sub={p ? `${fmtDate(p.periodStart)} – ${fmtDate(p.periodEnd)}` : ''} tone="bg-emerald-50 border-emerald-200" />
        <Kpi label="Consumos por descontar" value={formatPrice(balances.consumos)} sub={`${consumos.filter((c: any) => c.status === 'active').length} pendiente(s)`} tone={balances.consumos ? 'bg-amber-50 border-amber-200' : undefined} />
        <Kpi label="Préstamos (saldo)" value={formatPrice(balances.loans)} />
        {!p?.tipsHidden && <Kpi label="Propinas del período" value={formatPrice(p?.tipsAccrued || 0)} sub={p?.tipsSeparate ? 'se pagan aparte' : 'van en la liquidación'} />}
      </div>

      {p && (
        <Card title={`Próxima liquidación · ${fmtDate(p.periodStart)} a ${fmtDate(p.periodEnd)} (estimada)`} icon={Wallet}>
          <div className="p-4 text-sm space-y-1" data-my-preview>
            <Line k={`Básico (${p.units} ${p.unitLabel})`} v={p.baseTotal} />
            {p.extrasTotal ? <Line k="Horas extra y recargos" v={p.extrasTotal} /> : null}
            {p.allowanceTotal ? <Line k="Auxilio de transporte" v={p.allowanceTotal} /> : null}
            {p.tipsTotal ? <Line k="Propinas" v={p.tipsTotal} /> : null}
            {(p.noveltiesExtras || 0) + (p.noveltiesBonus || 0) ? <Line k="Novedades" v={(p.noveltiesExtras || 0) + (p.noveltiesBonus || 0)} /> : null}
            {p.legalDeductionsTotal ? <Line k="Salud y pensión" v={p.legalDeductionsTotal} minus /> : null}
            {p.advancesTotal ? <Line k="Anticipos" v={p.advancesTotal} minus /> : null}
            {p.loansTotal ? <Line k="Préstamos y consumos (cuotas)" v={p.loansTotal} minus /> : null}
            {(p.noveltiesAbsence || 0) + (p.noveltiesDeductions || 0) ? <Line k="Ausencias y otras deducciones" v={(p.noveltiesAbsence || 0) + (p.noveltiesDeductions || 0)} minus /> : null}
            <div className="flex justify-between border-t border-border pt-1.5 mt-1 font-bold text-brand-dark"><span>Neto estimado</span><span>{formatPrice(p.subtotal)}</span></div>
            <p className="text-[11px] text-muted-foreground">Es una estimación con lo registrado hasta hoy ({p.attendance} asistencia(s) en el período). El valor final sale en tu comprobante.</p>
          </div>
        </Card>
      )}

      <Card title="Lo que he consumido (descuento por nómina)" icon={UtensilsCrossed}>
        {consumos.length === 0 ? <p className="p-4 text-xs text-muted-foreground">No tienes consumos cargados a la nómina.</p> : (
          <div className="divide-y divide-border" data-my-consumos>
            {consumos.map((c: any) => (
              <div key={c.id} className={cn('px-4 py-2.5 text-xs', c.status !== 'active' && 'opacity-60')}>
                <div className="flex justify-between gap-2"><span className="font-semibold text-brand-dark">{fmtDate(c.date)}{c.orderId ? ` · venta #${c.orderId}` : ''}</span><span className="font-bold">{formatPrice(c.amount)}</span></div>
                {c.items?.length ? <p className="text-muted-foreground">{c.items.map((i: any) => `${i.quantity}× ${i.name}${i.size ? ' (' + i.size + ')' : ''}`).join(' · ')}</p> : null}
                <p className="text-[11px] text-muted-foreground">{c.status === 'active' ? `Saldo por descontar ${formatPrice(c.balance)} · ${c.installments} cuota(s) de ${formatPrice(c.installmentAmount)}` : 'Ya descontado'}{c.order?.discount ? ` · con descuento de empleado (${formatPrice(c.order.discount)})` : ''}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {(prestamos.length > 0 || advances.length > 0) && (
        <Card title="Préstamos y anticipos" icon={HandCoins}>
          <div className="divide-y divide-border text-xs">
            {prestamos.map((l: any) => (
              <div key={l.id} className={cn('px-4 py-2.5 flex justify-between gap-2', l.status !== 'active' && 'opacity-60')}>
                <span><b>Préstamo</b> · {fmtDate(l.date)}{l.notes ? ` · ${l.notes}` : ''}<span className="block text-[11px] text-muted-foreground">{l.installments} cuota(s) de {formatPrice(l.installmentAmount)} {l.frequencyLabel || 'cada quincena'} · pagado {formatPrice(l.paidTotal)} ({l.paymentsCount} cuota(s)){l.status === 'active' ? ` · faltan ${l.remainingInstallments}` : ''}</span></span>
                <span className="text-right">{formatPrice(l.amount)}<span className="block font-bold">{l.status === 'active' ? `debe ${formatPrice(l.balance)}` : 'pagado'}</span></span>
              </div>
            ))}
            {advances.map((a: any) => <div key={'a' + a.id} className="px-4 py-2.5 flex justify-between"><span><b>Anticipo</b> · {fmtDate(a.date)}{a.notes ? ` · ${a.notes}` : ''}</span><span className="font-bold">{formatPrice(a.amount)}</span></div>)}
          </div>
        </Card>
      )}

      <Card title="Mis comprobantes de nómina" icon={FileText}>
        {settlements.length === 0 ? <p className="p-4 text-xs text-muted-foreground">Aún no tienes liquidaciones.</p> : (
          <div className="divide-y divide-border" data-my-payslips>
            {settlements.map((s: any) => (
              <div key={s.id} className="px-4 py-2.5 flex items-center justify-between gap-2 text-xs">
                <span><b className="text-brand-dark">{fmtDate(s.periodStart)} – {fmtDate(s.periodEnd)}</b><span className={cn('ml-2 px-1.5 py-0.5 rounded-md text-[10px] font-bold', s.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800')}>{s.status === 'paid' ? 'Pagado' : 'Pendiente'}</span></span>
                <span className="flex items-center gap-2"><b>{formatPrice(s.total)}</b><button onClick={() => openPayslip(s, emp)} className="px-2.5 py-1.5 rounded-lg bg-brand-button text-brand-on-button font-semibold flex items-center gap-1" data-open-payslip={s.id}><Receipt size={12} /> Ver / descargar</button></span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

const Line = ({ k, v, minus }: { k: string; v: number; minus?: boolean }) => (
  <div className="flex justify-between"><span className="text-muted-foreground">{k}</span><span className={cn(minus && 'text-red-700')}>{minus ? '− ' : ''}{formatPrice(v)}</span></div>
);

export default MyAccountPage;
