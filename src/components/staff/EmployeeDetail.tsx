import { useEffect, useMemo, useState } from 'react';
import { Plus, Phone, Mail, IdCard, Landmark, CalendarDays, Link2, Pencil } from 'lucide-react';
import { api } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { formatPrice, getColombiaTodayStr } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Modal, Chip, KpiCard, fmtDate } from '@/components/common/Primitives';
import { LoanModal } from '@/components/staff/StaffExtras';

/** Período de pago en curso: quincena (1–15 / 16–fin de mes) o mes completo. */
function currentPeriod(kind: 'quincena' | 'mes', today = getColombiaTodayStr()) {
  const [y, m, d] = today.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, '0');
  if (kind === 'mes') return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, '0')}` };
  return d <= 15 ? { from: `${y}-${mm}-01`, to: `${y}-${mm}-15` } : { from: `${y}-${mm}-16`, to: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}

const Section = ({ title, children, right }: { title: string; children: any; right?: any }) => (
  <section className="border border-border rounded-xl overflow-hidden">
    <div className="px-3 py-2 bg-brand-card flex items-center justify-between gap-2"><p className="text-xs font-bold text-brand-dark uppercase tracking-wide">{title}</p>{right}</div>
    <div>{children}</div>
  </section>
);
const Line = ({ k, v, minus, strong }: { k: string; v: number; minus?: boolean; strong?: boolean }) => (
  v || strong ? <div className={cn('flex justify-between px-3 py-1 text-xs', strong && 'border-t border-border font-bold text-sm text-brand-dark py-2')}><span className={cn(!strong && 'text-muted-foreground')}>{k}</span><span className={cn(minus && 'text-red-700')}>{minus ? '− ' : ''}{formatPrice(Math.abs(v))}</span></div> : null
);

/**
 * Vista detallada de un colaborador: datos, próxima liquidación estimada, préstamos y consumos por nómina, anticipos,
 * novedades, asistencia y liquidaciones anteriores.
 */
export const EmployeeDetail = ({ employee, onClose, onEdit }: { employee: any; onClose: () => void; onEdit?: () => void }) => {
  const currentShift = useStore(s => s.currentShift);
  const [periodKind, setPeriodKind] = useState<'quincena' | 'mes'>(employee.payMode === 'monthly' ? 'mes' : 'quincena');
  const period = useMemo(() => currentPeriod(periodKind), [periodKind]);
  const [preview, setPreview] = useState<any>(null);
  const [loans, setLoans] = useState<any[] | null>(null);
  const [advances, setAdvances] = useState<any[]>([]);
  const [novelties, setNovelties] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [newLoan, setNewLoan] = useState(false);
  const [error, setError] = useState('');

  const loadLoans = () => api.getLoans({ employeeId: employee.id }).then(d => setLoans(d.loans)).catch(e => setError(e.message));
  const loadPreview = () => api.previewSettlement(employee.id, period.from, period.to).then(setPreview).catch(e => { setPreview(null); setError(e.message); });
  useEffect(() => {
    loadLoans();
    api.getAdvances({ employeeId: employee.id }).then(d => setAdvances(d.advances || [])).catch(() => {});
    api.getSettlements({ employeeId: employee.id }).then(setSettlements).catch(() => {});
    const monthStart = `${getColombiaTodayStr().slice(0, 7)}-01`;
    api.getAttendance({ employeeId: employee.id, from: monthStart, to: getColombiaTodayStr() }).then(setAttendance).catch(() => {});
  }, [employee.id]);
  useEffect(() => {
    loadPreview();
    api.getNovelties({ employeeId: employee.id, from: period.from, to: period.to }).then(setNovelties).catch(() => {});
  }, [employee.id, period.from, period.to]);

  const rows = loans || [];
  const active = rows.filter(r => r.status === 'active');
  const loansBal = active.filter(r => r.kind !== 'consumo').reduce((a, r) => a + r.balance, 0);
  const consBal = active.filter(r => r.kind === 'consumo').reduce((a, r) => a + r.balance, 0);
  const pendingAdv = advances.filter(a => !a.settled);
  const initials = employee.name.split(' ').map((p: string) => p[0]).slice(0, 2).join('');

  return (
    <Modal title="Detalle del colaborador" onClose={onClose} wide>
      <div className="space-y-3" data-employee-detail={employee.id} data-employee-account-modal>
        {/* Encabezado */}
        <div className="flex items-start gap-3">
          <div className="w-14 h-14 rounded-full bg-brand-accent/30 text-brand-dark flex items-center justify-center text-lg font-bold shrink-0">{initials}</div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-brand-dark">{employee.name}</p>
            <p className="text-xs text-muted-foreground">{employee.position || 'Sin cargo'}{employee.userId ? ' · vinculado al sistema' : ''}{!employee.active ? ' · inactivo' : ''}</p>
            <p className="text-xs font-semibold text-brand-primary">{employee.payModeLabel}: {formatPrice(employee.baseAmount)}</p>
          </div>
          {onEdit && <button onClick={onEdit} className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold flex items-center gap-1"><Pencil size={12} /> Editar</button>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          {employee.document && <span className="flex items-center gap-1"><IdCard size={12} /> C.C. {employee.document}</span>}
          {employee.phone && <span className="flex items-center gap-1"><Phone size={12} /> {employee.phone}</span>}
          {employee.email && <span className="flex items-center gap-1 truncate"><Mail size={12} /> {employee.email}</span>}
          {employee.bankAccount && <span className="flex items-center gap-1"><Landmark size={12} /> Cuenta {employee.bankAccount}</span>}
          {employee.startDate && <span className="flex items-center gap-1"><CalendarDays size={12} /> Ingreso {fmtDate(employee.startDate)}</span>}
          {employee.userId && <span className="flex items-center gap-1"><Link2 size={12} /> Usuario del sistema</span>}
        </div>

        {/* Indicadores */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <KpiCard label="Neto estimado del período" value={preview ? formatPrice(preview.subtotal) : '…'} />
          <KpiCard label="Préstamos (saldo)" value={formatPrice(loansBal)} className={loansBal > 0 ? 'bg-amber-50 border-amber-200' : ''} />
          <KpiCard label="Consumos por nómina" value={formatPrice(consBal)} className={consBal > 0 ? 'bg-amber-50 border-amber-200' : ''} />
          <KpiCard label="Asistencias este mes" value={String(attendance.length)} />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}

        {/* Próxima liquidación */}
        <Section title="Próxima liquidación (estimada)" right={
          <div className="flex gap-1"><Chip active={periodKind === 'quincena'} onClick={() => setPeriodKind('quincena')}>Quincena</Chip><Chip active={periodKind === 'mes'} onClick={() => setPeriodKind('mes')}>Mes</Chip></div>}>
          <p className="px-3 pt-2 text-[11px] text-muted-foreground">Del {fmtDate(period.from)} al {fmtDate(period.to)}. Es una estimación: el valor final sale en Personal → Liquidaciones.</p>
          {!preview ? <p className="p-3 text-xs text-muted-foreground">Calculando…</p> : (
            <div className="py-1" data-detail-preview>
              <Line k={`Salario (${preview.units ?? ''} ${preview.unitLabel || ''})`} v={preview.baseTotal} />
              <Line k="Horas extra y recargos" v={preview.extrasTotal} />
              <Line k="Auxilio de transporte" v={preview.allowanceTotal} />
              <Line k="Propinas" v={preview.tipsTotal} />
              <Line k="Novedades: extras" v={preview.noveltiesExtras} />
              <Line k="Novedades: bonificaciones" v={preview.noveltiesBonus} />
              <Line k="Novedades: faltas" v={preview.noveltiesAbsence} minus />
              <Line k="Novedades: descuentos" v={preview.noveltiesDeductions} minus />
              <Line k="Anticipos" v={preview.advancesTotal} minus />
              <Line k="Préstamos y consumos (cuotas)" v={preview.loansTotal} minus />
              <Line k="Salud y pensión" v={preview.legalDeductionsTotal} minus />
              <Line k="Neto a pagar (estimado)" v={preview.subtotal} strong />
              {preview.tipsSeparate && preview.tipsAccrued > 0 && <p className="px-3 pb-2 text-[11px] text-muted-foreground">Propinas acumuladas aparte: {formatPrice(preview.tipsAccrued)} (se pagan por separado).</p>}
            </div>
          )}
        </Section>

        {/* Préstamos y consumos */}
        <Section title="Préstamos y consumos por nómina" right={<button onClick={() => setNewLoan(true)} className="px-2.5 py-1 rounded-lg bg-brand-button text-brand-on-button text-[11px] font-semibold flex items-center gap-1" data-account-new-loan><Plus size={12} /> Nuevo préstamo</button>}>
          {!loans ? <p className="p-3 text-xs text-muted-foreground">Cargando…</p> : rows.length === 0 ? <p className="p-3 text-xs text-muted-foreground text-center">Sin préstamos ni consumos.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-xs">
              <thead className="text-muted-foreground"><tr><th className="text-left px-3 py-1.5">Fecha</th><th className="text-left px-3 py-1.5">Concepto</th><th className="text-right px-3 py-1.5">Valor</th><th className="text-right px-3 py-1.5">Cuota</th><th className="text-right px-3 py-1.5">Pagado</th><th className="text-right px-3 py-1.5">Saldo</th></tr></thead>
              <tbody>{rows.map(r => (
                <tr key={r.id} className={cn('border-t border-border', r.status !== 'active' && 'opacity-50')} data-account-row={r.kind}>
                  <td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(r.date)}</td>
                  <td className="px-3 py-1.5"><span className="font-semibold">{r.kind === 'consumo' ? `Consumo${r.orderId ? ` · venta #${r.orderId}` : ''}` : 'Préstamo'}</span><span className="block text-[10px] text-muted-foreground">{r.installments} cuota(s){r.notes && r.kind !== 'consumo' ? ` · ${r.notes}` : ''}{r.status === 'paid' ? ' · pagado' : ''}</span></td>
                  <td className="px-3 py-1.5 text-right">{formatPrice(r.amount)}</td>
                  <td className="px-3 py-1.5 text-right">{formatPrice(r.installmentAmount)}</td>
                  <td className="px-3 py-1.5 text-right">{formatPrice(r.paidTotal)}</td>
                  <td className="px-3 py-1.5 text-right font-bold">{formatPrice(r.balance)}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
          <p className="px-3 py-2 text-[11px] text-muted-foreground">Las cuotas se descuentan solas en cada liquidación. Los consumos salen de ventas cobradas con <b>Descuento de nómina</b>; para quitar uno, anula la venta en Caja → Ventas.</p>
        </Section>

        <div className="grid sm:grid-cols-2 gap-3">
          <Section title={`Anticipos por descontar (${pendingAdv.length})`}>
            {pendingAdv.length === 0 ? <p className="p-3 text-xs text-muted-foreground">Ninguno.</p> : pendingAdv.slice(0, 8).map(a => (
              <div key={a.id} className="flex justify-between px-3 py-1 text-xs border-t border-border first:border-t-0"><span>{fmtDate(a.date)}{a.notes ? ` · ${a.notes}` : ''}</span><span className="font-semibold">{formatPrice(a.amount)}</span></div>
            ))}
          </Section>
          <Section title={`Novedades del período (${novelties.length})`}>
            {novelties.length === 0 ? <p className="p-3 text-xs text-muted-foreground">Ninguna.</p> : novelties.slice(0, 8).map(n => (
              <div key={n.id} className="flex justify-between gap-2 px-3 py-1 text-xs border-t border-border first:border-t-0"><span className="truncate">{fmtDate(n.date)} · {n.label || n.typeLabel || n.type}</span><span className="font-semibold whitespace-nowrap">{formatPrice(n.amount)}</span></div>
            ))}
          </Section>
          <Section title={`Asistencia este mes (${attendance.length})`}>
            {attendance.length === 0 ? <p className="p-3 text-xs text-muted-foreground">Sin registros.</p> : attendance.slice(0, 8).map(a => (
              <div key={a.id} className="flex justify-between px-3 py-1 text-xs border-t border-border first:border-t-0"><span>{fmtDate(a.date)}</span><span className="text-muted-foreground">{a.checkIn ? String(a.checkIn).slice(11, 16) || a.checkIn : ''}{a.checkOut ? ` – ${String(a.checkOut).slice(11, 16) || a.checkOut}` : ''}{a.hours ? ` · ${a.hours} h` : ''}</span></div>
            ))}
          </Section>
          <Section title={`Liquidaciones (${settlements.length})`}>
            {settlements.length === 0 ? <p className="p-3 text-xs text-muted-foreground">Aún no tiene liquidaciones.</p> : settlements.slice(0, 8).map((s: any) => (
              <div key={s.id} className="flex justify-between px-3 py-1 text-xs border-t border-border first:border-t-0"><span>{fmtDate(s.periodStart)} – {fmtDate(s.periodEnd)} <span className={cn('ml-1 text-[10px] px-1.5 rounded-full', s.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800')}>{s.status === 'paid' ? 'pagada' : 'pendiente'}</span></span><span className="font-semibold">{formatPrice(s.total ?? s.netTotal ?? 0)}</span></div>
            ))}
          </Section>
        </div>
      </div>
      {newLoan && <LoanModal employees={[employee]} hasShift={!!currentShift} onClose={() => setNewLoan(false)} onSaved={() => { setNewLoan(false); loadLoans(); loadPreview(); }} />}
    </Modal>
  );
};
