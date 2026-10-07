import { useEffect, useMemo, useRef, useState } from 'react';
import {
  HandCoins, Wallet, Printer, Trash2, Upload, Download, FileSpreadsheet, CheckCircle2, AlertTriangle, Info, Plus, Settings2, CalendarClock, ClipboardList, Landmark,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { formatPrice, getColombiaTodayStr } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Modal, Chip, KpiCard, INPUT, LABEL, fmtDate, periodPresets } from '@/components/common/Primitives';
import { printDocument, escHtml, docLogo } from '@/lib/printDoc';
import { downloadXlsx } from '@/lib/xlsx';
import { readSpreadsheet, normHeader } from '@/lib/xlsxRead';
import { NiceSelect } from '@/components/ui/nice-select';

const PAY_METHOD: Record<string, string> = { cash: 'Efectivo', transfer: 'Transferencia' };

/* ================================================================== */
/* Comprobante de pago de propinas                                      */
/* ================================================================== */
export function printTipPayout(p: any) {
  const st = useStore.getState() as any;
  const html = `
    <div class="head">
      <div class="brand">${docLogo(st.branding)}<div><h1>${escHtml(st.businessName)}</h1><div class="muted">${st.businessNit ? 'NIT ' + escHtml(st.businessNit) + ' · ' : ''}${escHtml(st.businessAddress || '')}</div></div></div>
      <div class="num"><div class="lbl">Comprobante de pago de propinas</div><div class="big">N.º ${String(p.id).padStart(5, '0')}</div><div class="muted">Fecha ${fmtDate(p.date)}</div></div>
    </div>
    <div class="grid">
      <div class="box"><div class="lbl">Pagado a</div><b>${escHtml(p.employeeName)}</b><br>${p.document ? 'Documento ' + escHtml(p.document) + '<br>' : ''}${escHtml(p.position || '')}</div>
      <div class="box"><div class="lbl">Concepto</div><b>${p.kind === 'liquidacion' ? 'Liquidación de propinas' : 'Abono de propinas'}</b>${p.periodStart ? `<br>Período ${fmtDate(p.periodStart)} a ${fmtDate(p.periodEnd)}` : ''}<br>Medio: ${PAY_METHOD[p.method] || p.method}${p.fromCashRegister ? ' · salió de la caja' : ''}</div>
    </div>
    <table><thead><tr><th>Detalle</th><th class="r">Valor</th></tr></thead><tbody>
      <tr class="tot"><td>Propinas entregadas</td><td class="r">${formatPrice(p.amount)}</td></tr>
    </tbody></table>
    <p class="muted">Las propinas no constituyen salario (art. 131 del Código Sustantivo del Trabajo); se entregan en su totalidad al personal.</p>
    ${p.notes ? `<p><b>Notas:</b> ${escHtml(p.notes)}</p>` : ''}
    <div class="sign"><div>Entregó: ${escHtml(p.createdBy || '')}</div><div>Recibí conforme (firma y documento)</div></div>
    <div class="foot">Comprobante generado por el POS · ${escHtml(st.businessName)}</div>`;
  printDocument(html, `Propinas-${p.id}`);
}

/* ================================================================== */
/* Cuenta de propinas: reparto, saldo por colaborador, abonos, liquidar */
/* ================================================================== */
export const TipsAccountPanel = ({ isAdmin }: { isAdmin: boolean }) => {
  const currentShift = useStore(s => s.currentShift);
  const refreshCurrentShift = useStore(s => s.refreshCurrentShift);
  const today = getColombiaTodayStr();
  const presets = periodPresets(today);
  const [from, setFrom] = useState(presets[0].from);
  const [to, setTo] = useState(presets[0].to);
  const [st, setSt] = useState<any>(null);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [cfg, setCfg] = useState<any>(null);
  const [abono, setAbono] = useState<any>(null);
  const [settle, setSettle] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [error, setError] = useState('');
  const load = () => {
    api.getTipStatement(from, to).then(setSt).catch(e => setError(e.message));
    api.getTipPayouts({ from, to }).then(d => setPayouts(d.payouts)).catch(() => {});
  };
  useEffect(() => { load(); }, [from, to]);
  useEffect(() => { api.getTipsConfig().then(setCfg).catch(() => {}); }, []);
  const saveCfg = async (p: any) => { try { setCfg(await api.updateTipsConfig({ ...cfg, ...p })); load(); } catch (e: any) { setError(e.message); } };
  const removePayout = async (p: any) => {
    if (!window.confirm(`¿Anular el pago de ${formatPrice(p.amount)} a ${p.employeeName}? Vuelve a quedar como saldo por pagar${p.fromCashRegister ? ' y se revierte el retiro de caja si el turno sigue abierto' : ''}.`)) return;
    try { await api.deleteTipPayout(p.id); refreshCurrentShift(); load(); } catch (e: any) { setError(e.message); }
  };
  const rows = st?.rows || [];
  const pending = rows.filter((r: any) => r.balance > 0);

  return (
    <div className="space-y-3" data-tips-account>
      <div className="flex flex-wrap items-end gap-2">
        {presets.map(p => <Chip key={p.label} active={from === p.from && to === p.to} onClick={() => { setFrom(p.from); setTo(p.to); }}>{p.label}</Chip>)}
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={cn(INPUT, 'w-auto py-1.5 text-xs')} />
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className={cn(INPUT, 'w-auto py-1.5 text-xs')} />
        {isAdmin && cfg?.payout === 'separate' && (
          <button onClick={() => setSettle(true)} disabled={!pending.length} data-tips-settle className="ml-auto px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-xs font-semibold flex items-center gap-1.5 shadow-fab disabled:opacity-40">
            <CalendarClock size={14} /> Liquidar propinas del período
          </button>
        )}
      </div>

      {isAdmin && cfg && (
        <div className="bg-card rounded-xl border border-border p-3 shadow-card grid md:grid-cols-2 gap-3 text-xs" data-tips-config>
          <div>
            <p className="font-bold text-brand-dark mb-1 flex items-center gap-1.5"><Settings2 size={13} /> ¿Cómo se pagan las propinas?</p>
            <div className="flex flex-wrap gap-1.5">
              <Chip active={cfg.payout === 'separate'} onClick={() => saveCfg({ payout: 'separate' })}>Aparte (abonos y corte cada 15 o 30 días)</Chip>
              <Chip active={cfg.payout === 'payroll'} onClick={() => saveCfg({ payout: 'payroll' })}>Dentro de la nómina</Chip>
            </div>
          </div>
          <div>
            <p className="font-bold text-brand-dark mb-1">La propina común se reparte</p>
            <div className="flex flex-wrap gap-1.5">
              <Chip active={cfg.commonSplit === 'equal'} onClick={() => saveCfg({ commonSplit: 'equal' })}>En partes iguales</Chip>
              <Chip active={cfg.commonSplit === 'hours'} onClick={() => saveCfg({ commonSplit: 'hours' })}>Por horas trabajadas</Chip>
              <Chip active={cfg.commonSplit === 'points'} onClick={() => saveCfg({ commonSplit: 'points' })}>Por puntos</Chip>
            </div>
          </div>
          <p className="md:col-span-2 text-[11px] text-muted-foreground flex gap-1"><Info size={12} className="shrink-0 mt-0.5" /> Se reparte cada día entre quienes tienen asistencia ese día. Los puntos se ponen en cada colaborador (por ejemplo mesero 2, cocina 1); con 0 puntos no participa. Las propinas directas (cuenta del mesero) son solo de esa persona.</p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Propinas del período" value={formatPrice((st?.pool.common || 0) + (st?.pool.direct || 0))} sub={`común ${formatPrice(st?.pool.common || 0)} · directas ${formatPrice(st?.pool.direct || 0)}`} />
        <KpiCard label="Repartido al personal" value={formatPrice(st?.totals.accrued || 0)} />
        <KpiCard label="Pagado en el período" value={formatPrice(st?.totals.paid || 0)} />
        <KpiCard label="Saldo por pagar" value={formatPrice(st?.totals.balance || 0)} className={(st?.totals.balance || 0) > 0 ? 'bg-amber-50 border-amber-200' : ''} />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-brand-card flex items-center justify-between"><p className="text-xs font-bold text-brand-dark flex items-center gap-1.5"><HandCoins size={13} /> Propinas por colaborador</p>{cfg && <span className="text-[10px] text-muted-foreground">{cfg.payout === 'separate' ? 'Se pagan aparte' : 'Se pagan en la liquidación de nómina'}</span>}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-tips-statement>
            <thead><tr className="text-muted-foreground bg-muted/30">{['Colaborador', 'Puntos', 'Saldo anterior', 'Directas', 'Común', 'Ganado', 'Pagado', 'Saldo', ''].map((h, i) => <th key={i} className={cn('px-3 py-1.5 font-semibold whitespace-nowrap', i === 0 ? 'text-left' : 'text-right')}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Sin propinas en el período.</td></tr>}
              {rows.map((r: any) => (
                <tr key={r.employeeId} className={cn('border-t border-border', !r.active && 'opacity-60')}>
                  <td className="px-3 py-2 font-semibold text-brand-dark whitespace-nowrap">{r.name}<span className="block text-[10px] font-normal text-muted-foreground">{r.position}</span></td>
                  <td className="px-3 py-2 text-right">{r.points}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{formatPrice(r.previousBalance)}</td>
                  <td className="px-3 py-2 text-right">{formatPrice(r.direct)}</td>
                  <td className="px-3 py-2 text-right"><button onClick={() => setDetail(r)} className="underline decoration-dotted">{formatPrice(r.shared)}</button></td>
                  <td className="px-3 py-2 text-right font-semibold">{formatPrice(r.accrued)}</td>
                  <td className="px-3 py-2 text-right text-emerald-700">{formatPrice(r.paid)}</td>
                  <td className={cn('px-3 py-2 text-right font-bold', r.balance > 0 ? 'text-amber-700' : 'text-brand-dark')}>{formatPrice(r.balance)}</td>
                  <td className="px-3 py-2 text-right">{r.balance > 0 && cfg?.payout === 'separate' && <button onClick={() => setAbono(r)} data-tip-abono={r.employeeId} className="px-2.5 py-1 rounded-lg bg-brand-button text-brand-on-button text-[11px] font-semibold whitespace-nowrap">Abonar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-brand-card"><p className="text-xs font-bold text-brand-dark flex items-center gap-1.5"><Wallet size={13} /> Pagos de propinas del período</p></div>
        {payouts.length === 0 ? <p className="p-5 text-center text-xs text-muted-foreground">Sin pagos en el período.</p> : (
          <ul className="divide-y divide-border">
            {payouts.map(p => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-brand-dark">{p.employeeName} <span className={cn('ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-bold', p.kind === 'liquidacion' ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800')}>{p.kind === 'liquidacion' ? 'Liquidación' : 'Abono'}</span></p>
                  <p className="text-[11px] text-muted-foreground">{fmtDate(p.date)} · {PAY_METHOD[p.method] || p.method}{p.fromCashRegister ? ' · salió de caja' : ''}{p.periodStart ? ` · ${fmtDate(p.periodStart)} a ${fmtDate(p.periodEnd)}` : ''}{p.createdBy ? ` · ${p.createdBy}` : ''}</p>
                </div>
                <p className="text-sm font-bold text-brand-primary">{formatPrice(p.amount)}</p>
                <button onClick={() => printTipPayout(p)} title="Imprimir comprobante" className="p-1.5 text-muted-foreground hover:text-brand-primary"><Printer size={14} /></button>
                {isAdmin && <button onClick={() => removePayout(p)} className="p-1.5 text-muted-foreground hover:text-red-600"><Trash2 size={14} /></button>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {abono && <AbonoModal row={abono} hasShift={!!currentShift} onClose={() => setAbono(null)} onDone={p => { setAbono(null); if (p.fromCashRegister) refreshCurrentShift(); load(); printTipPayout(p); }} />}
      {settle && <SettleTipsModal rows={pending} from={from} to={to} hasShift={!!currentShift} onClose={() => setSettle(false)} onDone={() => { setSettle(false); refreshCurrentShift(); load(); }} />}
      {detail && (
        <Modal title={`Propina común · ${detail.name}`} onClose={() => setDetail(null)}>
          {detail.sharedDetail.length === 0 ? <p className="text-xs text-muted-foreground">No participó en propinas comunes en el período.</p> : (
            <table className="w-full text-xs"><thead><tr className="text-muted-foreground"><th className="text-left py-1">Día</th><th className="text-right">Bote del día</th><th className="text-right">Personas</th><th className="text-right">Su parte</th></tr></thead>
              <tbody>{detail.sharedDetail.map((d: any) => <tr key={d.date} className="border-t border-border"><td className="py-1">{fmtDate(d.date)}</td><td className="text-right">{formatPrice(d.total)}</td><td className="text-right">{d.people}</td><td className="text-right font-semibold">{formatPrice(d.share)}</td></tr>)}</tbody></table>
          )}
        </Modal>
      )}
    </div>
  );
};

const AbonoModal = ({ row, hasShift, onClose, onDone }: { row: any; hasShift: boolean; onClose: () => void; onDone: (p: any) => void }) => {
  const [amount, setAmount] = useState(String(row.balance));
  const [method, setMethod] = useState('cash');
  const [fromCash, setFromCash] = useState(true);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true); setError('');
    try { onDone(await api.addTipPayout({ employeeId: row.employeeId, amount: Number(amount), method, fromCashRegister: method === 'cash' && fromCash && hasShift, notes })); }
    catch (e: any) { setError(e.message); }
    setSaving(false);
  };
  return (
    <Modal title={`Abono de propinas · ${row.name}`} onClose={onClose}>
      <p className="text-xs text-muted-foreground">Saldo por pagar: <b className="text-brand-dark">{formatPrice(row.balance)}</b></p>
      <div><label className={LABEL}>Valor del abono</label><input type="number" min={0} max={row.balance} value={amount} onChange={e => setAmount(e.target.value)} className={cn(INPUT, 'font-mono')} data-abono-amount /></div>
      <div><label className={LABEL}>Medio</label><div className="flex gap-2">{Object.entries(PAY_METHOD).map(([k, l]) => <Chip key={k} active={method === k} onClick={() => setMethod(k)}>{l}</Chip>)}</div></div>
      {method === 'cash' && (
        <label className={cn('flex items-start gap-2 p-3 rounded-lg border text-xs', hasShift ? 'border-brand-accent/40 bg-brand-card cursor-pointer' : 'border-border bg-muted/30 opacity-70')}>
          <input type="checkbox" disabled={!hasShift} checked={fromCash && hasShift} onChange={e => setFromCash(e.target.checked)} className="mt-0.5" />
          <span><span className="font-semibold text-brand-dark block">Sale de la caja abierta</span><span className="text-muted-foreground">{hasShift ? 'Queda como retiro en el turno actual.' : 'No hay turno abierto.'}</span></span>
        </label>
      )}
      <div><label className={LABEL}>Notas</label><input value={notes} onChange={e => setNotes(e.target.value)} className={INPUT} /></div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button onClick={save} disabled={saving || !(Number(amount) > 0) || Number(amount) > row.balance} className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-40">{saving ? 'Registrando...' : `Pagar ${formatPrice(Number(amount) || 0)} e imprimir comprobante`}</button>
    </Modal>
  );
};

const SettleTipsModal = ({ rows, from, to, hasShift, onClose, onDone }: { rows: any[]; from: string; to: string; hasShift: boolean; onClose: () => void; onDone: () => void }) => {
  const [ids, setIds] = useState<number[]>(rows.map(r => r.employeeId));
  const [method, setMethod] = useState('transfer');
  const [fromCash, setFromCash] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const total = rows.filter(r => ids.includes(r.employeeId)).reduce((a, r) => a + r.balance, 0);
  const save = async () => {
    setSaving(true); setError('');
    try { setResult(await api.settleTips({ from, to, method, fromCashRegister: method === 'cash' && fromCash && hasShift, employeeIds: ids })); }
    catch (e: any) { setError(e.message); }
    setSaving(false);
  };
  if (result) {
    return (
      <Modal title="Propinas liquidadas" onClose={onDone}>
        <div className="text-center py-1"><CheckCircle2 size={40} className="mx-auto text-emerald-600" /><p className="text-xl font-bold text-brand-dark mt-1">{formatPrice(result.total)}</p><p className="text-xs text-muted-foreground">{result.created.length} pago(s) registrados</p></div>
        <ul className="divide-y divide-border text-xs">{result.created.map((p: any) => <li key={p.id} className="flex items-center justify-between py-1.5"><span>{p.employeeName}</span><span className="flex items-center gap-2 font-semibold">{formatPrice(p.amount)}<button onClick={() => printTipPayout(p)} className="p-1 text-muted-foreground hover:text-brand-primary"><Printer size={13} /></button></span></li>)}</ul>
        {result.errors?.length > 0 && <p className="text-xs text-red-600">{result.errors.map((e: any) => `${e.name}: ${e.error}`).join(' · ')}</p>}
        <button onClick={() => result.created.forEach((p: any, i: number) => setTimeout(() => printTipPayout(p), i * 700))} className="w-full py-2 rounded-xl border border-border text-sm font-semibold flex items-center justify-center gap-1.5"><Printer size={14} /> Imprimir todos los comprobantes</button>
        <button onClick={onDone} className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold">Listo</button>
      </Modal>
    );
  }
  return (
    <Modal title="Liquidar propinas del período" onClose={onClose}>
      <p className="text-xs text-muted-foreground">Corte del {fmtDate(from)} al {fmtDate(to)}. Se paga a cada colaborador todo su saldo pendiente (incluye lo que quedó de cortes anteriores, ya descontados los abonos).</p>
      <ul className="divide-y divide-border border border-border rounded-lg">
        {rows.map(r => (
          <li key={r.employeeId} className="flex items-center gap-2 px-3 py-2 text-xs">
            <input type="checkbox" checked={ids.includes(r.employeeId)} onChange={e => setIds(e.target.checked ? [...ids, r.employeeId] : ids.filter(x => x !== r.employeeId))} />
            <span className="flex-1 font-semibold text-brand-dark">{r.name}</span>
            <span className="font-bold">{formatPrice(r.balance)}</span>
          </li>
        ))}
      </ul>
      <div><label className={LABEL}>Medio</label><div className="flex gap-2">{Object.entries(PAY_METHOD).map(([k, l]) => <Chip key={k} active={method === k} onClick={() => setMethod(k)}>{l}</Chip>)}</div></div>
      {method === 'cash' && (
        <label className={cn('flex items-start gap-2 p-3 rounded-lg border text-xs', hasShift ? 'border-brand-accent/40 bg-brand-card cursor-pointer' : 'border-border bg-muted/30 opacity-70')}>
          <input type="checkbox" disabled={!hasShift} checked={fromCash && hasShift} onChange={e => setFromCash(e.target.checked)} className="mt-0.5" />
          <span><span className="font-semibold text-brand-dark block">Sale de la caja abierta</span><span className="text-muted-foreground">{hasShift ? 'Cada pago queda como retiro en el turno actual.' : 'No hay turno abierto.'}</span></span>
        </label>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button onClick={save} disabled={saving || !ids.length} data-tips-settle-confirm className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-40">{saving ? 'Registrando...' : `Pagar ${formatPrice(total)} a ${ids.length} colaborador(es)`}</button>
    </Modal>
  );
};

/* ================================================================== */
/* Novedades de nómina                                                  */
/* ================================================================== */
const GROUP_LABEL: Record<string, string> = { extras: 'Extras y recargos', bonus: 'Pagos adicionales', absence: 'Faltas y licencias (descuentan)', deduction: 'Descuentos' };

export const NoveltiesTab = ({ employees }: { employees: Array<{ id: number; name: string; payModeLabel?: string }> }) => {
  const today = getColombiaTodayStr();
  const presets = periodPresets(today);
  const [from, setFrom] = useState(presets[0].from);
  const [to, setTo] = useState(presets[0].to);
  const [employeeId, setEmployeeId] = useState(0);
  const [onlyPending, setOnlyPending] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [tasksVersion, setTasksVersion] = useState(0);
  const [error, setError] = useState('');
  const load = () => api.getNovelties({ from, to, employeeId: employeeId || undefined, pending: onlyPending ? 1 : undefined }).then(setRows).catch(e => setError(e.message));
  useEffect(() => { load(); }, [from, to, employeeId, onlyPending]);
  useEffect(() => { api.getNoveltyTypes().then(setTypes).catch(() => {}); }, []);
  const remove = async (n: any) => { if (!window.confirm(`¿Eliminar la novedad "${n.label}" de ${n.employeeName}?`)) return; try { await api.deleteNovelty(n.id); load(); } catch (e: any) { setError(e.message); } };
  const totalPlus = rows.filter(r => r.sign > 0).reduce((a, r) => a + r.amount, 0);
  const totalMinus = rows.filter(r => r.sign < 0).reduce((a, r) => a + r.amount, 0);
  return (
    <div className="space-y-3" data-novelties>
      <div className="flex flex-wrap items-end gap-2">
        {presets.map(p => <Chip key={p.label} active={from === p.from && to === p.to} onClick={() => { setFrom(p.from); setTo(p.to); }}>{p.label}</Chip>)}
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={cn(INPUT, 'w-auto py-1.5 text-xs')} />
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className={cn(INPUT, 'w-auto py-1.5 text-xs')} />
        <NiceSelect value={employeeId} onChange={e => setEmployeeId(Number(e.target.value))} className={cn(INPUT, 'w-auto py-1.5 text-xs')}><option value={0}>Todos</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</NiceSelect>
        <label className="text-xs text-muted-foreground flex items-center gap-1"><input type="checkbox" checked={onlyPending} onChange={e => setOnlyPending(e.target.checked)} /> Solo sin liquidar</label>
        <button onClick={() => setShow(true)} data-novelty-new className="ml-auto px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-xs font-semibold flex items-center gap-1.5 shadow-fab"><Plus size={14} /> Nueva novedad</button>
      </div>
      <TasksManager onChanged={() => setTasksVersion(v => v + 1)} />
      <p className="text-[11px] text-muted-foreground flex gap-1"><Info size={12} className="shrink-0 mt-0.5" /> Las novedades del período se suman o restan solas al calcular la liquidación del colaborador: festivos y dominicales trabajados (recargo de ley: 90 % desde julio de 2026), horas extra, bonificaciones, comisiones, incapacidades, vacaciones, faltas, licencias, préstamos y descuentos autorizados.</p>
      <div className="grid grid-cols-2 gap-3">
        <KpiCard label="Suman al pago" value={formatPrice(totalPlus)} />
        <KpiCard label="Restan del pago" value={formatPrice(totalMinus)} />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        {rows.length === 0 ? <p className="p-6 text-center text-xs text-muted-foreground">Sin novedades en el período.</p> : (
          <ul className="divide-y divide-border">
            {rows.map(n => (
              <li key={n.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', n.sign > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}><ClipboardList size={16} /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-brand-dark">{n.label} <span className="font-normal text-muted-foreground">· {n.employeeName}</span></p>
                  <p className="text-[11px] text-muted-foreground">{fmtDate(n.date)}{n.unit !== 'valor' && n.quantity ? ` · ${n.quantity} ${n.unit}` : ''}{n.pct ? ` · ${n.pct}%` : ''}{n.notes ? ` · ${n.notes}` : ''}</p>
                </div>
                {n.settlementId ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">Liquidada</span> : <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">Pendiente</span>}
                <p className={cn('text-sm font-bold w-28 text-right', n.sign > 0 ? 'text-emerald-700' : 'text-red-700')}>{n.sign > 0 ? '+' : '−'} {formatPrice(n.amount)}</p>
                {!n.settlementId && <button onClick={() => remove(n)} className="p-1.5 text-muted-foreground hover:text-red-600"><Trash2 size={14} /></button>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {show && <NoveltyModal key={tasksVersion} employees={employees} types={types} onClose={() => setShow(false)} onSaved={() => { setShow(false); load(); }} />}
    </div>
  );
};

const NoveltyModal = ({ employees, types, onClose, onSaved }: { employees: Array<{ id: number; name: string; payModeLabel?: string }>; types: any[]; onClose: () => void; onSaved: () => void }) => {
  const [form, setForm] = useState({ employeeId: employees[0]?.id || 0, type: 'holiday_worked', date: getColombiaTodayStr(), quantity: '1', amount: '', notes: '', taskId: '' });
  const [pv, setPv] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  useEffect(() => { api.getNoveltyTasks().then(ts => { setTasks(ts); if (ts[0]) setForm(f => ({ ...f, taskId: f.taskId || ts[0].id })); }).catch(() => {}); }, []);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const t = types.find(x => x.id === form.type);
  const set = (p: any) => setForm(f => ({ ...f, ...p }));
  const timer = useRef<any>(null);
  useEffect(() => {
    clearTimeout(timer.current);
    setPv(null);
    if (!form.employeeId || !t?.auto) return;
    timer.current = setTimeout(() => { api.previewNovelty({ ...form, amount: '' }).then(setPv).catch((e: any) => setPv({ error: e.message })); }, 250);
    return () => clearTimeout(timer.current);
  }, [form.employeeId, form.type, form.date, form.quantity, form.taskId]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    setSaving(true); setError('');
    try { const r = await api.addNovelty({ ...form, amount: form.amount === '' ? undefined : Number(form.amount) }); if (r.warnings?.length) window.alert(r.warnings.join('\n')); onSaved(); }
    catch (e: any) { setError(e.message); }
    setSaving(false);
  };
  const groups = useMemo(() => Object.keys(GROUP_LABEL).map(g => ({ g, items: types.filter(x => x.group === g) })), [types]);
  return (
    <Modal title="Nueva novedad de nómina" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><label className={LABEL}>Colaborador</label>
          <NiceSelect value={form.employeeId} onChange={e => set({ employeeId: Number(e.target.value) })} className={INPUT}>{employees.map(e => <option key={e.id} value={e.id}>{e.name}{e.payModeLabel ? ` · ${e.payModeLabel}` : ''}</option>)}</NiceSelect></div>
        <div className="col-span-2"><label className={LABEL}>Tipo</label>
          <NiceSelect value={form.type} onChange={e => set({ type: e.target.value, amount: '' })} className={INPUT} data-novelty-type>
            {groups.map(({ g, items }) => <optgroup key={g} label={GROUP_LABEL[g]}>{items.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</optgroup>)}
          </NiceSelect>
          {t?.help && <p className="text-[10px] text-muted-foreground mt-1">{t.help}</p>}
        </div>
        {form.type === 'task' && (
          <div className="col-span-2"><label className={LABEL}>Adicional</label>
            <NiceSelect value={form.taskId} onChange={e => set({ taskId: e.target.value, amount: '' })} className={INPUT} data-novelty-task>
              {tasks.map(x => <option key={x.id} value={x.id}>{x.name}{x.amount ? ` · ${formatPrice(x.amount)} por vez` : ' · sin tarifa'}</option>)}
            </NiceSelect>
            {!tasks.length && <p className="text-[11px] text-amber-700 mt-1">Crea los adicionales en "Adicionales y tarifas".</p>}
          </div>
        )}
        <div><label className={LABEL}>Fecha</label><input type="date" value={form.date} onChange={e => set({ date: e.target.value })} className={INPUT} /></div>
        {t && t.unit !== 'valor'
          ? <div><label className={LABEL}>Cantidad ({t.unit})</label><input type="number" min={0} step={0.5} value={form.quantity} onChange={e => set({ quantity: e.target.value })} className={cn(INPUT, 'font-mono')} data-novelty-qty /></div>
          : <div />}
        <div className="col-span-2">
          <label className={LABEL}>Valor {t?.auto ? '(se calcula solo; escribe otro si es necesario)' : ''}</label>
          <input type="number" min={0} value={form.amount} onChange={e => set({ amount: e.target.value })} placeholder={pv && !pv.error ? String(pv.amount) : t?.auto && !pv ? 'calculando...' : 'Valor'} className={cn(INPUT, 'font-mono')} data-novelty-amount />
          {pv?.error && <p className="text-[11px] text-red-600 mt-1">{pv.error}</p>}
          {pv && !pv.error && <p className="text-[11px] text-emerald-700 mt-1">Calculado: <b>{formatPrice(pv.suggested)}</b>{pv.pct ? ` (${pv.pct}%)` : ''}</p>}
          {pv?.warnings?.map((w: string) => <p key={w} className="text-[11px] text-amber-700 mt-1 flex gap-1"><AlertTriangle size={12} className="shrink-0 mt-0.5" /> {w}</p>)}
        </div>
        <div className="col-span-2"><label className={LABEL}>Notas</label><input value={form.notes} onChange={e => set({ notes: e.target.value })} className={INPUT} placeholder="Ej. 20 de julio, meta de ventas, cuota 2 de 5" /></div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button onClick={save} disabled={saving || !form.employeeId || (!t?.auto && !(Number(form.amount) > 0))} data-novelty-save className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-40">{saving ? 'Guardando...' : 'Guardar novedad'}</button>
    </Modal>
  );
};


/* ================================================================== */
/* Préstamos a empleados (libranza sin intereses)                       */
/* ================================================================== */
export const LoansPanel = ({ employees }: { employees: Array<{ id: number; name: string }> }) => {
  const currentShift = useStore(s => s.currentShift);
  const refreshCurrentShift = useStore(s => s.refreshCurrentShift);
  const [data, setData] = useState<any>({ loans: [], lent: 0, balance: 0 });
  const [onlyActive, setOnlyActive] = useState(true);
  const [show, setShow] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [error, setError] = useState('');
  const load = () => api.getLoans({ status: onlyActive ? 'active' : undefined }).then(setData).catch(e => setError(e.message));
  useEffect(() => { load(); }, [onlyActive]);
  useEffect(() => { if (detail) api.getLoanPayments(detail.id).then(setPayments).catch(() => setPayments([])); }, [detail?.id]);
  const remove = async (l: any) => {
    if (!window.confirm(`¿Eliminar el préstamo de ${formatPrice(l.amount)} a ${l.employeeName}?${l.fromCashRegister ? ' Si salió de una caja abierta, se revierte el retiro.' : ''}`)) return;
    try { await api.deleteLoan(l.id); refreshCurrentShift(); load(); } catch (e: any) { setError(e.message); }
  };
  return (
    <div className="space-y-3" data-loans>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold text-brand-dark flex items-center gap-1.5"><Landmark size={15} /> Préstamos (libranza sin intereses)</h3>
        <label className="text-xs text-muted-foreground flex items-center gap-1"><input type="checkbox" checked={onlyActive} onChange={e => setOnlyActive(e.target.checked)} /> Solo con saldo</label>
        <button onClick={() => setShow(true)} data-loan-new className="ml-auto px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-xs font-semibold flex items-center gap-1.5 shadow-fab"><Plus size={14} /> Nuevo préstamo</button>
      </div>
      <p className="text-[11px] text-muted-foreground flex gap-1"><Info size={12} className="shrink-0 mt-0.5" /> La cuota se descuenta sola en cada liquidación de nómina hasta pagar el préstamo, sin intereses. En la liquidación se puede saltar una cuota o cobrar el saldo completo (por ejemplo, si el trabajador se retira).</p>
      <div className="grid grid-cols-2 gap-3">
        <KpiCard label="Prestado (listado)" value={formatPrice(data.lent)} />
        <KpiCard label="Saldo por descontar" value={formatPrice(data.balance)} className={data.balance > 0 ? 'bg-amber-50 border-amber-200' : ''} />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        {data.loans.length === 0 ? <p className="p-6 text-center text-xs text-muted-foreground">Sin préstamos{onlyActive ? ' con saldo' : ''}.</p> : (
          <ul className="divide-y divide-border">
            {data.loans.map((l: any) => {
              const pct = l.amount ? Math.round((l.paidTotal / l.amount) * 100) : 0;
              return (
                <li key={l.id} className="px-4 py-2.5 space-y-1.5">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-brand-dark">{l.employeeName} <span className="font-normal text-muted-foreground">· {formatPrice(l.amount)} en {l.installments} cuota(s) de {formatPrice(l.installmentAmount)}</span></p>
                      <p className="text-[11px] text-muted-foreground">{fmtDate(l.date)}{l.fromCashRegister ? ' · salió de caja' : ''}{l.notes ? ` · ${l.notes}` : ''} · {l.paymentsCount} cuota(s) descontada(s)</p>
                    </div>
                    {l.status === 'paid' ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">Pagado</span> : <span className="text-sm font-bold text-amber-700">{formatPrice(l.balance)}</span>}
                    <button onClick={() => setDetail(l)} className="px-2 py-1 rounded-lg border border-border text-[11px] font-semibold">Ver</button>
                    {l.paymentsCount === 0 && <button onClick={() => remove(l)} className="p-1.5 text-muted-foreground hover:text-red-600"><Trash2 size={14} /></button>}
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {show && <LoanModal employees={employees} hasShift={!!currentShift} onClose={() => setShow(false)} onSaved={l => { setShow(false); if (l.fromCashRegister) refreshCurrentShift(); load(); }} />}
      {detail && (
        <Modal title={`Préstamo de ${detail.employeeName}`} onClose={() => setDetail(null)}>
          <p className="text-xs text-muted-foreground">{formatPrice(detail.amount)} el {fmtDate(detail.date)} · {detail.installments} cuota(s) de {formatPrice(detail.installmentAmount)} · sin intereses</p>
          <table className="w-full text-xs"><thead><tr className="text-muted-foreground"><th className="text-left py-1">Cuota</th><th className="text-left">Fecha</th><th className="text-left">Liquidación</th><th className="text-right">Valor</th></tr></thead>
            <tbody>{payments.map((p, i) => <tr key={p.id} className="border-t border-border"><td className="py-1">{i + 1}</td><td>{fmtDate(p.date)}</td><td>#{p.settlementId}</td><td className="text-right font-semibold">{formatPrice(p.amount)}</td></tr>)}
              {payments.length === 0 && <tr><td colSpan={4} className="py-3 text-center text-muted-foreground">Aún no se ha descontado ninguna cuota.</td></tr>}
              <tr className="border-t border-border font-bold"><td colSpan={3} className="py-1">Saldo</td><td className="text-right">{formatPrice(detail.balance)}</td></tr></tbody></table>
        </Modal>
      )}
    </div>
  );
};

export const LoanModal = ({ employees, hasShift, onClose, onSaved }: { employees: Array<{ id: number; name: string }>; hasShift: boolean; onClose: () => void; onSaved: (l: any) => void }) => {
  const [f, setF] = useState({ employeeId: employees[0]?.id || 0, date: getColombiaTodayStr(), amount: '', installments: '2', installmentAmount: '', fromCashRegister: false, notes: '' });
  const [error, setError] = useState('');
  const set = (p: any) => setF(x => ({ ...x, ...p }));
  const auto = Number(f.amount) > 0 ? Math.ceil(Number(f.amount) / Math.max(1, Number(f.installments) || 1)) : 0;
  const save = async () => {
    setError('');
    try { onSaved(await api.addLoan({ ...f, amount: Number(f.amount), installments: Number(f.installments) || 1, installmentAmount: f.installmentAmount === '' ? undefined : Number(f.installmentAmount), fromCashRegister: f.fromCashRegister && hasShift })); }
    catch (e: any) { setError(e.message); }
  };
  return (
    <Modal title="Nuevo préstamo (libranza)" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><label className={LABEL}>Colaborador</label><NiceSelect value={f.employeeId} onChange={e => set({ employeeId: Number(e.target.value) })} className={INPUT}>{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</NiceSelect></div>
        <div><label className={LABEL}>Fecha</label><input type="date" value={f.date} onChange={e => set({ date: e.target.value })} className={INPUT} /></div>
        <div><label className={LABEL}>Valor prestado</label><input type="number" min={0} value={f.amount} onChange={e => set({ amount: e.target.value })} className={cn(INPUT, 'font-mono')} data-loan-amount /></div>
        <div><label className={LABEL}>Número de cuotas</label><input type="number" min={1} max={120} value={f.installments} onChange={e => set({ installments: e.target.value })} className={cn(INPUT, 'font-mono')} data-loan-installments /></div>
        <div><label className={LABEL}>Valor de la cuota</label><input type="number" min={0} value={f.installmentAmount} placeholder={auto ? String(auto) : ''} onChange={e => set({ installmentAmount: e.target.value })} className={cn(INPUT, 'font-mono')} /></div>
        <p className="col-span-2 text-[11px] text-muted-foreground">Sin intereses: se descuenta {formatPrice(Number(f.installmentAmount) || auto)} en cada liquidación hasta completar {formatPrice(Number(f.amount) || 0)}.</p>
        <div className="col-span-2"><label className={LABEL}>Notas</label><input value={f.notes} onChange={e => set({ notes: e.target.value })} className={INPUT} placeholder="Ej. para matrícula, firmó libranza" /></div>
        <label className={cn('col-span-2 flex items-start gap-2 p-3 rounded-lg border text-xs', hasShift ? 'border-brand-accent/40 bg-brand-card cursor-pointer' : 'border-border bg-muted/30 opacity-70')}>
          <input type="checkbox" disabled={!hasShift} checked={f.fromCashRegister && hasShift} onChange={e => set({ fromCashRegister: e.target.checked })} className="mt-0.5" />
          <span><span className="font-semibold text-brand-dark block">Sale de la caja abierta</span><span className="text-muted-foreground">{hasShift ? 'Queda como retiro en el turno actual. Si no, se registra como entregado por transferencia.' : 'No hay turno abierto: se registra como entregado por transferencia.'}</span></span>
        </label>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button onClick={save} disabled={!f.employeeId || !(Number(f.amount) > 0)} data-loan-save className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-40">Registrar préstamo</button>
    </Modal>
  );
};

/* ================================================================== */
/* Adicionales y tarifas (armado de carne, lavado de campana...)        */
/* ================================================================== */
const TasksManager = ({ onChanged }: { onChanged: () => void }) => {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  useEffect(() => { if (open) api.getNoveltyTasks().then(setTasks).catch(() => {}); }, [open]);
  const save = async () => { try { setTasks(await api.saveNoveltyTasks(tasks)); setMsg('Guardado'); onChanged(); setTimeout(() => setMsg(''), 2000); } catch (e: any) { setMsg(e.message); } };
  return (
    <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden" data-tasks>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-2.5 text-left">
        <span className="text-xs font-bold text-brand-dark flex items-center gap-1.5"><Settings2 size={14} /> Adicionales y tarifas (armado de carne, lavado de campana...)</span>
        <span className="text-[11px] text-muted-foreground">{open ? 'Ocultar' : 'Ver y editar'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2 border-t border-border pt-3">
          <p className="text-[11px] text-muted-foreground">Trabajos que se pagan aparte por cada vez. Luego se registran como novedad "Adicional" y entran a la liquidación.</p>
          {tasks.map((t, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input value={t.name} onChange={e => setTasks(ts => ts.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} className={cn(INPUT, 'py-1.5')} placeholder="Nombre" />
              <input type="number" min={0} value={t.amount} onChange={e => setTasks(ts => ts.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} className={cn(INPUT, 'py-1.5 w-36 font-mono')} placeholder="Valor por vez" data-task-amount={i} />
              <button onClick={() => setTasks(ts => ts.filter((_, j) => j !== i))} className="p-1.5 text-muted-foreground hover:text-red-600"><Trash2 size={14} /></button>
            </div>
          ))}
          <div className="flex gap-2 items-center">
            <button onClick={() => setTasks(ts => [...ts, { name: '', amount: 0 }])} className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold flex items-center gap-1"><Plus size={12} /> Agregar adicional</button>
            <button onClick={save} data-tasks-save className="px-3 py-1.5 rounded-lg bg-brand-button text-brand-on-button text-xs font-semibold">Guardar tarifas</button>
            {msg && <span className="text-[11px] text-muted-foreground">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
};

/* ================================================================== */
/* Importar personal desde Excel                                        */
/* ================================================================== */
const FIELD_ALIASES: Record<string, string[]> = {
  name: ['nombre', 'nombrecompleto', 'nombresyapellidos', 'nombres', 'colaborador', 'trabajador', 'empleado'],
  lastName: ['apellidos', 'apellido'],
  document: ['documento', 'cedula', 'cc', 'numerodedocumento', 'numerodocumento', 'identificacion', 'nodocumento', 'nit'],
  phone: ['telefono', 'celular', 'movil', 'whatsapp', 'tel'],
  email: ['correo', 'email', 'correoelectronico', 'mail'],
  position: ['cargo', 'puesto', 'rol', 'oficio', 'funcion', 'funciones'],
  bankAccount: ['numerodecuenta', 'numerocuenta', 'cuenta', 'cuentabancaria', 'nocuenta', 'cuentadeahorros', 'cuentadenomina'],
  payMode: ['formadepago', 'modalidad', 'modalidaddepago', 'tipodepago', 'periodicidad'],
  baseAmount: ['valor', 'valorbase', 'salario', 'sueldo', 'salariobase', 'sueldobase', 'basico', 'valorturno', 'valorporturno', 'valorpordia', 'valordia', 'valorhora', 'pago'],
  startDate: ['fechadeingreso', 'fechaingreso', 'ingreso', 'fechainicio', 'fechadeinicio'],
  hoursPerDay: ['horaspordia', 'horasdia', 'jornada', 'jornadadiaria'],
  overtime: ['extras', 'extrasyrecargos', 'recargos', 'horasextra'],
  legalDeductions: ['saludypension', 'seguridadsocial', 'descuentosaludypension', 'descuentodesaludypension'],
  transportAllowance: ['auxiliodetransporte', 'auxiliotransporte', 'auxilio', 'auxtransporte'],
  tipPoints: ['puntospropina', 'puntosdepropina', 'puntos', 'propinapuntos'],
  notes: ['notas', 'observaciones', 'nota'],
};
const TEMPLATE_HEADERS = ['Nombre', 'Documento', 'Teléfono', 'Correo', 'Cargo', 'Forma de pago', 'Valor', 'Fecha de ingreso', 'Horas por día', 'Extras y recargos', 'Salud y pensión', 'Auxilio de transporte', 'Puntos propina', 'Notas', 'Número de cuenta'];

export function downloadStaffTemplate() {
  downloadXlsx('plantilla_personal', [{
    name: 'Personal', headers: TEMPLATE_HEADERS, widths: [26, 14, 14, 24, 16, 16, 12, 16, 12, 16, 15, 20, 14, 24],
    rows: [
      ['Ana Pérez', '1047123456', '3001234567', 'ana@correo.com', 'Mesero', 'Por turno', 70000, '2026-10-01', 8, 'Sí', 'No', 'No', 1, 'Turno de noche'],
      ['Luis Gómez', '1047654321', '3007654321', '', 'Cocina', 'Mensual', 1750905, '2026-09-15', 8, 'Sí', 'Sí', 'Sí', 1, ''],
      ['Carlos Ruiz', '1047000999', '3110000000', '', 'Domiciliario', 'Por día', 60000, '', 8, 'No', 'No', 'No', 0, 'No participa en propinas'],
    ],
  }, {
    name: 'Instrucciones', headers: ['Columna', 'Qué escribir'],
    rows: [
      ['Nombre', 'Obligatorio. Si tienes nombres y apellidos en columnas separadas, deja "Nombres" y "Apellidos".'],
      ['Documento', 'Cédula. Si ya existe alguien con ese documento, se actualiza en vez de crearlo otra vez.'],
      ['Forma de pago', 'Mensual, Quincenal, Por día, Por turno o Por hora.'],
      ['Valor', 'Sueldo del mes o de la quincena, o valor del día, turno u hora.'],
      ['Extras y recargos / Salud y pensión / Auxilio de transporte', 'Sí o No.'],
      ['Puntos propina', 'Para repartir la propina común por puntos (ej. mesero 2, cocina 1). 0 = no participa. Vacío = 1.'],
      ['Fecha de ingreso', 'AAAA-MM-DD o DD/MM/AAAA.'],
    ],
  }]);
}

/** Convierte la hoja en filas con claves conocidas según los encabezados. */
function mapSheet(matrix: string[][]): { rows: any[]; mapped: string[]; unknown: string[] } {
  const headerIdx = matrix.findIndex(r => r && r.some(c => FIELD_ALIASES.name.includes(normHeader(c))));
  if (headerIdx < 0) throw new Error('No encontré la columna "Nombre". Descarga la plantilla y copia los datos ahí.');
  const headers = matrix[headerIdx].map(normHeader);
  const keyOf = headers.map(h => Object.entries(FIELD_ALIASES).find(([, al]) => al.includes(h))?.[0] || '');
  const rows = matrix.slice(headerIdx + 1).map((r, i) => {
    const o: any = { _line: headerIdx + i + 2 };
    keyOf.forEach((k, j) => { if (k && r[j] !== undefined && String(r[j]).trim() !== '') o[k] = String(r[j]).trim(); });
    if (o.lastName) { o.name = `${o.name || ''} ${o.lastName}`.trim(); delete o.lastName; }
    return o;
  }).filter(o => Object.keys(o).length > 1);
  return { rows, mapped: [...new Set(keyOf.filter(Boolean))], unknown: matrix[headerIdx].filter((_, j) => !keyOf[j] && String(matrix[headerIdx][j] || '').trim()) };
}

export const ImportEmployeesModal = ({ onClose, onDone }: { onClose: () => void; onDone: () => void }) => {
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [info, setInfo] = useState<{ mapped: string[]; unknown: string[] } | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const onFile = async (f?: File | null) => {
    if (!f) return;
    setError(''); setPreview(null); setResult(null); setFileName(f.name); setBusy(true);
    try {
      const m = mapSheet(await readSpreadsheet(f));
      setRows(m.rows); setInfo({ mapped: m.mapped, unknown: m.unknown });
      setPreview(await api.importEmployees(m.rows, true));
    } catch (e: any) { setError(e.message); setRows([]); }
    setBusy(false);
  };
  const confirm = async () => {
    setBusy(true); setError('');
    try { setResult(await api.importEmployees(rows, false)); } catch (e: any) { setError(e.message); }
    setBusy(false);
  };
  if (result) {
    return (
      <Modal title="Personal importado" onClose={onDone}>
        <div className="text-center py-2"><CheckCircle2 size={40} className="mx-auto text-emerald-600" /><p className="text-sm font-bold text-brand-dark mt-1">{result.created} creado(s) · {result.updated} actualizado(s)</p>{result.errors.length > 0 && <p className="text-xs text-red-600">{result.errors.length} fila(s) con error no se importaron.</p>}</div>
        <button onClick={onDone} className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold">Listo</button>
      </Modal>
    );
  }
  return (
    <Modal title="Importar personal desde Excel" onClose={onClose} wide>
      <div className="flex flex-wrap gap-2 items-center">
        <label className="px-4 py-2 rounded-lg bg-brand-button text-brand-on-button text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
          <Upload size={14} /> {fileName ? 'Cambiar archivo' : 'Elegir archivo (.xlsx o .csv)'}
          <input type="file" accept=".xlsx,.csv" className="hidden" onChange={e => onFile(e.target.files?.[0])} data-import-file />
        </label>
        <button onClick={downloadStaffTemplate} className="px-3 py-2 rounded-lg border border-border text-xs font-semibold flex items-center gap-1.5"><Download size={14} /> Descargar plantilla</button>
        {fileName && <span className="text-xs text-muted-foreground flex items-center gap-1"><FileSpreadsheet size={13} /> {fileName}</span>}
      </div>
      <p className="text-[11px] text-muted-foreground">Columnas que entiende: Nombre, Documento, Teléfono, Correo, Cargo, Forma de pago, Valor, Fecha de ingreso, Horas por día, Extras y recargos, Salud y pensión, Auxilio de transporte, Puntos propina, Número de cuenta y Notas. Si el documento (o el nombre) ya existe, se actualiza.</p>
      {busy && <p className="text-xs text-muted-foreground">Leyendo...</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {info && info.unknown.length > 0 && <p className="text-[11px] text-amber-700">Columnas ignoradas: {info.unknown.join(', ')}</p>}
      {preview && (
        <>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-semibold">{preview.created} nuevo(s)</span>
            <span className="px-2.5 py-1 rounded-lg bg-sky-50 text-sky-800 font-semibold">{preview.updated} a actualizar</span>
            {preview.errors.length > 0 && <span className="px-2.5 py-1 rounded-lg bg-red-50 text-red-700 font-semibold">{preview.errors.length} con error</span>}
          </div>
          <div className="max-h-72 overflow-auto border border-border rounded-lg">
            <table className="w-full text-[11px]" data-import-preview>
              <thead className="sticky top-0 bg-muted"><tr>{['Fila', '', 'Nombre', 'Documento', 'Cargo', 'Forma de pago', 'Valor'].map(h => <th key={h} className="px-2 py-1 text-left">{h}</th>)}</tr></thead>
              <tbody>
                {preview.preview.map((r: any) => <tr key={r.line} className="border-t border-border"><td className="px-2 py-1">{r.line}</td><td className="px-2 py-1">{r.action === 'create' ? <span className="text-emerald-700 font-bold">Nuevo</span> : <span className="text-sky-700 font-bold">Actualiza</span>}</td><td className="px-2 py-1 font-semibold">{r.name}</td><td className="px-2 py-1">{r.document}</td><td className="px-2 py-1">{r.position}</td><td className="px-2 py-1">{r.payModeLabel}</td><td className="px-2 py-1">{formatPrice(r.baseAmount)}</td></tr>)}
                {preview.errors.map((e: any) => <tr key={'e' + e.line} className="border-t border-border bg-red-50/60"><td className="px-2 py-1">{e.line}</td><td className="px-2 py-1 text-red-700 font-bold">Error</td><td className="px-2 py-1">{e.name}</td><td className="px-2 py-1 text-red-700" colSpan={4}>{e.error}</td></tr>)}
              </tbody>
            </table>
          </div>
          <button onClick={confirm} disabled={busy || !(preview.created + preview.updated)} data-import-confirm className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-40">Importar {preview.created + preview.updated} colaborador(es)</button>
        </>
      )}
    </Modal>
  );
};
