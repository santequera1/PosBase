import { useEffect, useMemo, useState } from 'react';
import { IdCard, Receipt, UtensilsCrossed, HandCoins, Wallet, FileText, RefreshCw, CalendarDays, ClipboardList, Clock, ChefHat } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import { fmtDate } from '@/components/common/Primitives';
import { openPayslip, noveltyText, settlementNovelties } from '@/lib/payslip';
import { can } from '@/lib/permissions';
import { HolidayCalendar, longDate, weekday, daysUntil, type DayMark } from '@/components/staff/HolidayCalendar';

const Card = ({ title, icon: Icon, right, children, ...rest }: { title: string; icon: any; right?: any; children: any; [k: string]: any }) => (
  <div className="bg-card rounded-2xl border border-border shadow-card overflow-hidden" {...rest}>
    <div className="px-4 py-2.5 border-b border-border bg-brand-card flex items-center justify-between gap-2">
      <p className="text-xs font-bold text-brand-dark flex items-center gap-1.5"><Icon size={14} /> {title}</p>{right}
    </div>
    {children}
  </div>
);
const Kpi = ({ label, value, sub, tone, ...rest }: { label: string; value: string; sub?: string; tone?: string; [k: string]: any }) => (
  <div className={cn('rounded-2xl border p-3', tone || 'bg-card border-border')} {...rest}>
    <p className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</p>
    <p className="font-display font-bold text-xl text-brand-dark">{value}</p>
    {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
  </div>
);
const Line = ({ k, v, minus, ...rest }: { k: string; v: number; minus?: boolean; [x: string]: any }) => (
  <div className="flex justify-between gap-3" {...rest}><span className="text-muted-foreground">{k}</span><span className={cn('whitespace-nowrap', minus && 'text-red-700')}>{minus ? '− ' : ''}{formatPrice(v)}</span></div>
);
const METHOD: Record<string, string> = { cash: 'efectivo', transfer: 'transferencia', card: 'tarjeta' };
const SRC: Record<string, string> = { shift: 'al abrir/cerrar caja', manual: 'anotado por administración' };
const sign = (n: any) => (n.group === 'absence' || n.group === 'deduction' ? -1 : 1);
const fmtHours = (h: any) => (Number(h) > 0 ? `${Math.round(Number(h) * 10) / 10} h` : '');
/** Hora "14:00" (la asistencia puede venir con la fecha completa) */
const hhmm = (v?: string | null) => (!v ? '' : v.length > 8 ? v.slice(11, 16) : v.slice(0, 5));
const since = (start: string, today: string) => {
  const months = (Number(today.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(today.slice(5, 7)) - Number(start.slice(5, 7)) - (today.slice(8, 10) < start.slice(8, 10) ? 1 : 0);
  if (months < 1) return 'menos de un mes';
  const y = Math.floor(months / 12), m = months % 12;
  return [y ? `${y} año${y > 1 ? 's' : ''}` : '', m ? `${m} mes${m > 1 ? 'es' : ''}` : ''].filter(Boolean).join(' y ');
};

/** Texto del festivo para el colaborador (lo que se le pagó o qué hacer si trabajó y no aparece). */
const holidayStatus = (h: any) => {
  if (h.paid) return { tone: 'paid' as const, text: `Se te sumó el recargo de festivo: ${formatPrice(h.paid.amount)}${h.paid.status === 'paid' ? ' (ya pagado)' : h.paid.status === 'settled' ? ' (va en tu liquidación)' : ' (entra en tu próxima liquidación)'}` };
  if (h.autoPaid) return { tone: 'auto' as const, text: 'Marcaste asistencia ese día: el recargo sale con tus horas en la liquidación.' };
  if (!h.past) return { tone: 'info' as const, text: 'Aún no llega.' };
  if (h.beforeStart) return { tone: 'info' as const, text: 'Antes de tu fecha de ingreso.' };
  if (h.beforeSystem) return { tone: 'info' as const, text: 'Antes de que tu nómina se llevara en el sistema.' };
  return { tone: 'missing' as const, text: 'No tienes recargo registrado ese día. Si trabajaste, avísale a administración para que te lo sume.' };
};

/** Mi cuenta: cada colaborador ve lo suyo: la quincena (liquidada o estimada), festivos, novedades, turnos, consumos, préstamos y comprobantes. */
const MyAccountPage = () => {
  const user = useStore(s => s.user);
  const kitchenOn = useStore(s => s.restaurant?.modules?.kitchen);
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState('');
  const [showAllAtt, setShowAllAtt] = useState(false);
  const load = () => {
    setLoading(true);
    api.getMyAccount().then(d => { setData(d); setError(''); setMonth(m => m || String(d?.today || '').slice(0, 7)); }).catch(e => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const holidays: any[] = data?.holidays || [];
  const names = useMemo(() => Object.fromEntries(holidays.map(h => [h.date, h.name])), [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const marks = useMemo(() => Object.fromEntries(holidays.map(h => { const st = holidayStatus(h); return [h.date, st.tone === 'info' ? undefined : { tone: st.tone, title: st.text } as DayMark]; })), [data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) return <p className="p-6 text-sm text-muted-foreground">Cargando tu cuenta...</p>;
  if (error) return <p className="p-6 text-sm text-red-600">{error}</p>;
  if (!data?.linked) return (
    <div className="max-w-md mx-auto p-6 text-center space-y-2">
      <IdCard size={32} className="mx-auto text-brand-primary" />
      <h2 className="font-display font-bold text-lg text-brand-dark">Tu usuario no está vinculado a un colaborador</h2>
      <p className="text-sm text-muted-foreground">Aquí cada colaborador ve sus turnos, consumos, préstamos y comprobantes de nómina. Para eso su usuario ({user?.name}) debe estar vinculado a su ficha en Personal &amp; Nómina.</p>
      {user?.role === 'admin'
        ? <p className="text-xs text-muted-foreground">Para vincular un usuario: Configuración → Usuarios → el usuario → "Ficha en Personal" (o Personal &amp; Nómina → el colaborador → Usuario del sistema).</p>
        : <p className="text-xs font-semibold text-brand-dark">Pídele a administración que vincule tu usuario a tu ficha.</p>}
    </div>
  );

  const { employee: emp, preview: p, currentSettlement: cur, period, loans, settlements, advances, balances, novelties = [], attendance = [], yearSummary: ys, today } = data;
  const consumos = loans.filter((l: any) => l.kind === 'consumo');
  const prestamos = loans.filter((l: any) => l.kind !== 'consumo');
  const periodHolidays = holidays.filter(h => h.date >= period.from && h.date <= period.to);
  const year = Number(String(today).slice(0, 4));
  const yearAll = holidays.filter(h => h.date.startsWith(month.slice(0, 4) || String(year)));
  const yearHolidays = yearAll.filter(h => h.paid || !(h.beforeSystem || h.beforeStart));
  const hiddenBefore = yearAll.length - yearHolidays.length;
  const nextHoliday = holidays.find(h => !h.past);
  const setStatus = (id: number | null) => settlements.find((s: any) => s.id === id)?.status;
  const nv = cur ? settlementNovelties(cur) : null;
  const attShown = showAllAtt ? attendance : attendance.slice(0, 10);

  return (
    <div className="max-w-5xl mx-auto space-y-4 font-sans pb-8" data-my-account>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display font-bold text-2xl text-brand-dark">Mi cuenta</h1>
          <p className="text-xs text-muted-foreground">{emp.name}{emp.position ? ` · ${emp.position}` : ''} · {emp.payModeLabel}</p>
          <div className="flex flex-wrap gap-1.5 mt-1.5 text-[10px] font-semibold" data-my-info>
            {emp.startDate && <span className="px-2 py-0.5 rounded-full bg-muted text-brand-dark">Ingreso: {fmtDate(emp.startDate)} ({since(emp.startDate, today)})</span>}
            {emp.document && <span className="px-2 py-0.5 rounded-full bg-muted text-brand-dark">Doc. {emp.document}</span>}
            {emp.bankAccountLast4 && <span className="px-2 py-0.5 rounded-full bg-muted text-brand-dark">Cuenta de pago ••••{emp.bankAccountLast4}</span>}
            <span className="px-2 py-0.5 rounded-full bg-muted text-brand-dark">Jornada {emp.hoursPerDay} h/día</span>
            {emp.legalDeductions && <span className="px-2 py-0.5 rounded-full bg-muted text-brand-dark">Con salud y pensión</span>}
            {emp.transportAllowance && <span className="px-2 py-0.5 rounded-full bg-muted text-brand-dark">Con auxilio de transporte</span>}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {kitchenOn && can(user, 'kitchen') && !can(user, ['tables', 'counter', 'pos']) && (
            <button onClick={() => navigate('/kitchen')} className="h-10 px-3 rounded-xl border border-border bg-white text-xs font-bold flex items-center gap-1.5" data-my-back-kitchen><ChefHat size={15} /> Volver a cocina</button>
          )}
          <button onClick={load} className="w-10 h-10 rounded-xl border border-border bg-white flex items-center justify-center" title="Actualizar"><RefreshCw size={16} className={cn(loading && 'animate-spin')} /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cur
          ? <Kpi label="Esta quincena" value={formatPrice(cur.total || 0)} sub={cur.status === 'paid' ? `Pagada el ${fmtDate(cur.paidAt)}` : 'Liquidada · pendiente de pago'} tone={cur.status === 'paid' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'} data-kpi-period />
          : <Kpi label="Esta quincena (estimada)" value={formatPrice(p?.subtotal || 0)} sub={`${fmtDate(period.from)} – ${fmtDate(period.to)}`} tone="bg-emerald-50 border-emerald-200" data-kpi-period />}
        <Kpi label="Consumos por descontar" value={formatPrice(balances.consumos)} sub={`${consumos.filter((c: any) => c.status === 'active').length} pendiente(s)`} tone={balances.consumos ? 'bg-amber-50 border-amber-200' : undefined} />
        <Kpi label="Préstamos (saldo)" value={formatPrice(balances.loans)} />
        <Kpi label={`Pagado en ${ys.year}`} value={formatPrice(ys.paidTotal)} sub={`${ys.paidCount} comprobante(s)${ys.holidaysPaid ? ` · ${ys.holidaysPaid} festivo(s)` : ''}`} data-kpi-year />
      </div>

      {/* Esta quincena: la liquidación real si ya se hizo; si no, la estimación */}
      <Card title={`Esta quincena · ${fmtDate(cur?.periodStart || period.from)} a ${fmtDate(cur?.periodEnd || period.to)}${cur ? '' : ' (estimada)'}`} icon={Wallet}
        right={cur && <span className={cn('px-2 py-0.5 rounded-md text-[10px] font-bold', cur.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800')}>{cur.status === 'paid' ? `Pagada${cur.paymentMethod ? ' por ' + (METHOD[cur.paymentMethod] || cur.paymentMethod) : ''}` : 'Liquidada · por pagar'}</span>}
        data-my-period>
        <div className="p-4 text-sm space-y-1" data-my-preview>
          {cur ? (
            <>
              <Line k={`Básico (${cur.units} ${cur.details?.unitLabel || 'días'})`} v={cur.baseTotal || 0} />
              {cur.extrasTotal ? <Line k="Horas extra y recargos" v={cur.extrasTotal} /> : null}
              {cur.allowanceTotal ? <Line k="Auxilio de transporte" v={cur.allowanceTotal} /> : null}
              {cur.tipsTotal ? <Line k="Propinas" v={cur.tipsTotal} /> : null}
              {nv!.itemized ? nv!.plus.map((n: any) => <Line key={n.id} k={noveltyText(n)} v={n.amount} data-my-nov-line={n.type} />)
                : (cur.noveltiesExtras || 0) + (cur.noveltiesBonus || 0) ? <Line k="Novedades (extras y bonificaciones)" v={(cur.noveltiesExtras || 0) + (cur.noveltiesBonus || 0)} /> : null}
              {cur.bonuses ? <Line k="Bonificación" v={cur.bonuses} /> : null}
              {cur.legalDeductionsTotal ? <Line k="Salud y pensión" v={cur.legalDeductionsTotal} minus /> : null}
              {cur.advancesTotal ? <Line k="Anticipos" v={cur.advancesTotal} minus /> : null}
              {cur.loansTotal ? <Line k="Préstamos y consumos (cuotas)" v={cur.loansTotal} minus /> : null}
              {nv!.itemized ? nv!.minus.map((n: any) => <Line key={n.id} k={noveltyText(n)} v={n.amount} minus />)
                : (cur.noveltiesAbsence || 0) + (cur.noveltiesDeductions || 0) ? <Line k="Ausencias y otras deducciones" v={(cur.noveltiesAbsence || 0) + (cur.noveltiesDeductions || 0)} minus /> : null}
              {cur.deductions ? <Line k="Descuentos" v={cur.deductions} minus /> : null}
              <div className="flex justify-between border-t border-border pt-1.5 mt-1 font-bold text-brand-dark"><span>Neto a pagar</span><span>{formatPrice(cur.total || 0)}</span></div>
              <div className="flex items-center justify-between gap-2 pt-1">
                <p className="text-[11px] text-muted-foreground">{cur.status === 'paid' ? `Pagada el ${fmtDate(cur.paidAt)}${cur.paymentMethod ? ' por ' + (METHOD[cur.paymentMethod] || cur.paymentMethod) : ''}.` : 'Administración ya hizo tu liquidación de esta quincena; falta el pago.'}</p>
                <button onClick={() => openPayslip(cur, emp)} className="px-2.5 py-1.5 rounded-lg bg-brand-button text-brand-on-button text-xs font-semibold flex items-center gap-1 shrink-0"><Receipt size={12} /> Comprobante</button>
              </div>
            </>
          ) : p ? (
            <>
              <Line k={`Básico (${p.units} ${p.unitLabel})`} v={p.baseTotal} />
              {(p.extras || []).filter((l: any) => l.amount).map((l: any) => <Line key={l.key} k={l.label} v={l.amount} />)}
              {!(p.extras || []).length && p.extrasTotal ? <Line k="Horas extra y recargos" v={p.extrasTotal} /> : null}
              {p.allowanceTotal ? <Line k="Auxilio de transporte" v={p.allowanceTotal} /> : null}
              {p.tipsTotal ? <Line k="Propinas" v={p.tipsTotal} /> : null}
              {(p.novelties || []).filter((n: any) => sign(n) > 0).map((n: any) => <Line key={n.id} k={noveltyText(n)} v={n.amount} data-my-nov-line={n.type} />)}
              {p.legalDeductionsTotal ? <Line k="Salud y pensión" v={p.legalDeductionsTotal} minus /> : null}
              {p.advancesTotal ? <Line k="Anticipos" v={p.advancesTotal} minus /> : null}
              {p.loansTotal ? <Line k="Préstamos y consumos (cuotas)" v={p.loansTotal} minus /> : null}
              {(p.novelties || []).filter((n: any) => sign(n) < 0).map((n: any) => <Line key={n.id} k={noveltyText(n)} v={n.amount} minus />)}
              <div className="flex justify-between border-t border-border pt-1.5 mt-1 font-bold text-brand-dark"><span>Neto estimado</span><span>{formatPrice(p.subtotal)}</span></div>
              <p className="text-[11px] text-muted-foreground">Es una estimación con lo registrado hasta hoy ({p.attendance} asistencia(s) en el período). El valor final sale en tu comprobante cuando administración haga la liquidación.</p>
            </>
          ) : <p className="text-xs text-muted-foreground">Aún no se puede calcular esta quincena.</p>}
          {!data.tipsHidden && p?.tipsSeparate && p?.tipsAccrued ? <p className="text-[11px] text-muted-foreground">Propinas del período: {formatPrice(p.tipsAccrued)} (se pagan aparte).</p> : null}
          {periodHolidays.map(h => {
            const st = holidayStatus(h);
            return (
              <div key={h.date} className={cn('mt-2 rounded-lg border px-2.5 py-2 text-[11px]', st.tone === 'paid' || st.tone === 'auto' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-300 bg-amber-50 text-amber-900')} data-my-period-holiday={h.date} data-status={st.tone}>
                <p className="font-bold first-letter:uppercase">Festivo: {longDate(h.date)} · {h.name}</p>
                <p>{st.tone === 'paid' ? '✓ ' : ''}{st.text}</p>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Festivos: calendario del año con lo que se le pagó de cada uno */}
      <Card title="Festivos" icon={CalendarDays} data-my-holidays
        right={nextHoliday && <span className="text-[10px] font-semibold text-brand-primary text-right" data-my-next-holiday>Próximo: {weekday(nextHoliday.date, true)} {fmtDate(nextHoliday.date).slice(0, 5)} · {daysUntil(nextHoliday.date, today) === 0 ? 'hoy' : daysUntil(nextHoliday.date, today) === 1 ? 'mañana' : `en ${daysUntil(nextHoliday.date, today)} días`}</span>}>
        <div className="p-3 sm:p-4 grid md:grid-cols-[minmax(0,1fr)_260px] gap-4">
          <div>
            <HolidayCalendar month={month || String(today).slice(0, 7)} onMonth={setMonth} holidays={names} marks={marks} today={today} min={`${year}-01`} max={`${year + 1}-12`} />
            <div className="flex flex-wrap gap-3 mt-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-3.5 h-3.5 rounded-full bg-emerald-500 text-white text-[9px] leading-[14px] text-center font-bold">✓</span> Te sumaron el recargo</span>
              <span className="flex items-center gap-1"><span className="w-3.5 h-3.5 rounded-full bg-sky-500 text-white text-[9px] leading-[14px] text-center font-bold">✓</span> Sale por tu asistencia</span>
              <span className="flex items-center gap-1"><span className="w-3.5 h-3.5 rounded-full bg-slate-300 text-slate-700 text-[9px] leading-[14px] text-center font-bold">–</span> Sin recargo registrado</span>
            </div>
          </div>
          <div className="text-xs">
            <p className="font-bold text-brand-dark mb-1">Festivos de {month.slice(0, 4) || year}</p>
            {ys.holidaysPaid > 0 && month.slice(0, 4) === String(year) && <p className="text-[11px] text-emerald-800 mb-1.5">Este año te han sumado {ys.holidaysPaid} recargo(s) de festivo por {formatPrice(ys.holidaysPaidTotal)}.</p>}
            {hiddenBefore > 0 && <p className="text-[10px] text-muted-foreground mb-1">{hiddenBefore} festivo(s) de antes de que tu nómina se llevara aquí no se muestran.</p>}
            <ul className="divide-y divide-border max-h-[300px] overflow-y-auto" data-my-holiday-list>
              {yearHolidays.map(h => {
                const st = holidayStatus(h);
                return (
                  <li key={h.date} className="py-1.5">
                    <button onClick={() => setMonth(h.date.slice(0, 7))} className="w-full text-left">
                      <span className="flex justify-between gap-2"><b className="capitalize text-brand-dark">{weekday(h.date, true)} {fmtDate(h.date).slice(0, 5)}</b>
                        <span className={cn('text-[10px] font-bold', st.tone === 'paid' || st.tone === 'auto' ? 'text-emerald-700' : st.tone === 'missing' ? 'text-muted-foreground' : 'text-brand-primary')}>
                          {st.tone === 'paid' ? formatPrice(h.paid.amount) : st.tone === 'auto' ? 'por asistencia' : st.tone === 'missing' ? 'sin recargo' : h.past ? '' : daysUntil(h.date, today) === 1 ? 'mañana' : `en ${daysUntil(h.date, today)} días`}
                        </span>
                      </span>
                      <span className="block text-[11px] text-muted-foreground truncate">{h.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <Card title="Mis novedades" icon={ClipboardList} data-my-novelties>
          {novelties.length === 0 ? <p className="p-4 text-xs text-muted-foreground">No tienes novedades registradas (festivos, bonificaciones, adicionales, descuentos...).</p> : (
            <div className="divide-y divide-border max-h-[420px] overflow-y-auto">
              {novelties.map((n: any) => {
                const st = n.settlementId ? setStatus(n.settlementId) : null;
                return (
                  <div key={n.id} className="px-4 py-2 text-xs flex justify-between gap-2" data-my-novelty={n.id}>
                    <span className="min-w-0"><span className="font-semibold text-brand-dark">{noveltyText(n)}</span>
                      <span className={cn('block text-[10px] font-semibold', n.settlementId ? 'text-muted-foreground' : 'text-amber-700')}>{n.settlementId ? (st === 'paid' ? 'Pagada en tu liquidación' : 'En tu liquidación (por pagar)') : 'Por liquidar: entra en tu próxima liquidación'}</span>
                    </span>
                    <b className={cn('whitespace-nowrap', sign(n) < 0 ? 'text-red-700' : 'text-emerald-700')}>{sign(n) < 0 ? '− ' : '+ '}{formatPrice(n.amount)}</b>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Mis turnos" icon={Clock} right={<span className="text-[10px] font-semibold text-muted-foreground">{data.monthAttendance} este mes</span>} data-my-attendance>
          {attendance.length === 0 ? <p className="p-4 text-xs text-muted-foreground">No hay turnos registrados. La asistencia se anota al abrir y cerrar caja, o la registra administración en Personal → Asistencia.</p> : (
            <>
              <div className="divide-y divide-border">
                {attShown.map((a: any, i: number) => (
                  <div key={a.date + i} className="px-4 py-2 text-xs flex justify-between gap-2">
                    <span><b className="capitalize text-brand-dark">{weekday(a.date, true)} {fmtDate(a.date)}</b>{names[a.date] ? <span className="ml-1 text-[10px] font-bold text-amber-700">festivo</span> : null}
                      <span className="block text-[10px] text-muted-foreground">{SRC[a.source] || ''}</span></span>
                    <span className="text-right whitespace-nowrap">{hhmm(a.checkIn) || '—'}{a.checkOut ? ` – ${hhmm(a.checkOut)}` : ''}<span className="block text-[10px] text-muted-foreground">{fmtHours(a.hours)}</span></span>
                  </div>
                ))}
              </div>
              {attendance.length > 10 && <button onClick={() => setShowAllAtt(v => !v)} className="w-full py-2 text-[11px] font-semibold text-brand-primary border-t border-border">{showAllAtt ? 'Ver menos' : `Ver los ${attendance.length} últimos`}</button>}
            </>
          )}
        </Card>
      </div>

      <Card title="Lo que he consumido (descuento por nómina)" icon={UtensilsCrossed}>
        {consumos.length === 0 ? <p className="p-4 text-xs text-muted-foreground">No tienes consumos cargados a la nómina.</p> : (
          <div className="divide-y divide-border" data-my-consumos>
            {consumos.map((c: any) => (
              <div key={c.id} className={cn('px-4 py-2.5 text-xs', c.status !== 'active' && 'opacity-60')}>
                <div className="flex justify-between gap-2"><span className="font-semibold text-brand-dark">{fmtDate(c.date)}{c.orderId ? ` · venta #${c.orderId}` : ''}</span><span className="font-bold">{formatPrice(c.amount)}</span></div>
                {c.items?.length ? <p className="text-muted-foreground">{c.items.map((i: any) => `${i.quantity}× ${i.name}${i.size ? ' (' + i.size + ')' : ''}`).join(' · ')}</p> : null}
                <p className="text-[11px] text-muted-foreground">{c.status === 'active' ? `Saldo por descontar ${formatPrice(c.balance)} · ${c.installments} cuota(s) de ${formatPrice(c.installmentAmount)}` : c.pendingSettlementId ? `Descontado en la liquidación #${c.pendingSettlementId} (pendiente de pago)` : 'Ya descontado'}{c.order?.discount ? ` · con descuento de empleado (${formatPrice(c.order.discount)})` : ''}</p>
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
                <span className="min-w-0"><b className="text-brand-dark">{fmtDate(s.periodStart)} – {fmtDate(s.periodEnd)}</b><span className={cn('ml-2 px-1.5 py-0.5 rounded-md text-[10px] font-bold', s.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800')}>{s.status === 'paid' ? 'Pagado' : 'Pendiente'}</span>
                  {s.status === 'paid' && <span className="block text-[10px] text-muted-foreground">Pagado el {fmtDate(s.paidAt)}{s.paymentMethod ? ' por ' + (METHOD[s.paymentMethod] || s.paymentMethod) : ''}</span>}
                </span>
                <span className="flex items-center gap-2 shrink-0"><b>{formatPrice(s.total)}</b><button onClick={() => openPayslip(s, emp)} className="px-2.5 py-1.5 rounded-lg bg-brand-button text-brand-on-button font-semibold flex items-center gap-1" data-open-payslip={s.id}><Receipt size={12} /> Ver / descargar</button></span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default MyAccountPage;
