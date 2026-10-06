import { useCallback, useEffect, useMemo, useState } from 'react';
import { Printer, RefreshCw, ChevronDown, ChevronUp, Banknote, ArrowLeftRight, CreditCard, Lock, Info, Undo2, Eye } from 'lucide-react';
import { ZReportModal } from '@/components/ZReportModal';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import { downloadXlsx } from '@/lib/xlsx';
import { printThermal, generateZReportHtml } from '@/lib/thermalPrint';
import { printShiftReport } from '@/lib/netPrint';
import { Kpi, DetailPane, ActionBtn, Row, SectionTitle, Empty, usePaged, MoreButton, dt, useIsMobile, INPUT, LBL, SEL } from './common';

const ARQUEO: Array<{ key: 'cash' | 'transfer' | 'card'; label: string; icon: any }> = [
  { key: 'cash', label: 'Efectivo', icon: Banknote }, { key: 'transfer', label: 'Transferencias bancarias', icon: ArrowLeftRight }, { key: 'card', label: 'Datáfono', icon: CreditCard },
];
const diffClass = (d: number | null) => (d === null ? '' : d < 0 ? 'text-red-700 font-bold ring-1 ring-red-400 rounded px-1' : d > 0 ? 'text-emerald-700 font-bold' : 'text-brand-dark font-bold');

export const ArqueosTab = ({ onShiftsChanged }: { onShiftsChanged: () => void }) => {
  const [sub, setSub] = useState<'cajas' | 'conciliacion'>('cajas');
  return (
    <div className="space-y-3" data-arqueos>
      <div className="flex gap-1 bg-card border border-border rounded-xl p-1 w-fit">
        {([['cajas', 'Cajas'], ['conciliacion', 'Conciliación']] as const).map(([k, l]) => <button key={k} onClick={() => setSub(k)} data-arqueo-sub={k} className={cn('px-4 py-1.5 rounded-lg text-sm font-semibold', sub === k ? 'bg-brand-button text-brand-on-button' : 'text-muted-foreground')}>{l}</button>)}
      </div>
      {sub === 'cajas' ? <CajasView onShiftsChanged={onShiftsChanged} /> : <ConciliacionView />}
    </div>
  );
};

/* ======================= Cajas ======================= */
const CajasView = ({ onShiftsChanged }: { onShiftsChanged: () => void }) => {
  const currentShift = useStore(s => s.currentShift);
  const mobile = useIsMobile();
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [live, setLive] = useState<any>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [panel, setPanel] = useState(false);
  const load = useCallback(() => { api.getCajaShifts({ status, limit: 200 }).then(setRows).catch(e => toast.error(e.message)); }, [status]);
  const loadLive = useCallback(() => { api.getCurrentShift().then(setLive).catch(() => setLive(null)); }, []);
  useEffect(() => { load(); }, [load, currentShift?.id, currentShift?.status]);
  useEffect(() => { loadLive(); const t = setInterval(loadLive, 15000); return () => clearInterval(t); }, [loadLive, currentShift?.id]);
  const paged = usePaged(rows, status);
  const tips = live?.tips || { cash: 0, transfer: 0, card: 0, platform: 0 };
  const salesWithTips = live ? live.cashSales + live.transferSales + live.debitSales + live.creditSales + (live.totalTips || 0) - (tips.platform || 0) : 0;
  const changed = () => { load(); loadLive(); onShiftsChanged(); };
  const exportX = () => downloadXlsx('arqueos_de_caja', [{ name: 'Arqueos', headers: ['Turno', 'Apertura', 'Cierre', 'Responsable', '$ Sistema', '$ Usuario', 'Diferencia', 'Estado', 'Conciliado'], rows: rows.map(s => [s.id, dt(s.openedAt), dt(s.closedAt), s.cashierName, s.systemTotal ?? '', s.userTotal ?? '', s.diff ?? '', s.status === 'open' ? 'Abierto' : 'Cerrado', s.reconciled ? 'Sí' : 'No']) }]);
  const showPanel = sel !== null || panel || !mobile;
  return (
    <div className="space-y-3">
      <div className="bg-card rounded-xl border border-border overflow-hidden" data-arqueo-kpis>
        <div className="grid grid-cols-1 sm:grid-cols-5">
          <Kpi label="Arqueo de caja" value={currentShift ? 'Abierto' : 'Cerrado'} sub={currentShift ? `Turno #${currentShift.id}` : 'Abre uno para darle seguimiento a las ventas.'} tone={currentShift ? 'bg-emerald-50' : ''} />
          <Kpi label="Saldo actual" value={formatPrice(live ? live.initialCash + salesWithTips + (live.totalDeposits || 0) - (live.totalWithdrawals || 0) : 0)} help="Saldo actual = monto inicial + total ventas + entradas − salidas." />
          <Kpi label="Total de ventas" value={formatPrice(salesWithTips)} help="Este valor incluye propinas." />
          <Kpi label="Ingresos" value={formatPrice(live?.totalDeposits || 0)} />
          <Kpi label="Egresos" value={formatPrice(live?.totalWithdrawals || 0)} />
        </div>
      </div>
      <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(340px,1fr)] gap-3 items-start">
        <div className="space-y-3 min-w-0">
          <div className="bg-card rounded-xl border border-border p-3 flex flex-wrap items-end gap-2">
            <div><label className={LBL}>Estado</label><select value={status} onChange={e => setStatus(e.target.value)} className={SEL} data-arqueo-status><option value="">(todos)</option><option value="open">Abierto</option><option value="closed">Cerrado</option></select></div>
            <div><label className={LBL}>Caja</label><select className={SEL} disabled><option>Principal</option></select></div>
            <div className="flex-1" />
            <button onClick={exportX} className="px-3 py-1.5 rounded-lg border border-brand-primary/30 text-sm font-semibold">Exportar</button>
            <button onClick={() => { setSel(null); setPanel(true); }} className="px-3 py-1.5 rounded-lg gradient-primary text-primary-foreground text-sm font-bold" data-new-arqueo>{currentShift ? 'Arqueo actual' : '+ Nuevo arqueo de caja'}</button>
          </div>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-arqueos-table>
                <thead><tr className="bg-muted/40 text-muted-foreground text-left"><th className="px-3 py-2 font-semibold">Apertura / Cierre</th><th className="px-3 py-2 font-semibold text-right">$ Sistema</th><th className="px-3 py-2 font-semibold text-right">$ Usuario</th><th className="px-3 py-2 font-semibold text-right">Diferencia</th><th className="px-3 py-2 font-semibold">Estado</th></tr></thead>
                <tbody>
                  {paged.shown.map(s => (
                    <tr key={s.id} onClick={() => { setPanel(false); setSel(s.id); }} className={cn('border-t border-border cursor-pointer', sel === s.id ? 'bg-amber-100' : 'hover:bg-brand-button/5')} data-arqueo-row={s.id}>
                      <td className="px-3 py-2 whitespace-nowrap"><span className="block">{dt(s.openedAt)}</span><span className="block text-muted-foreground">{s.closedAt ? dt(s.closedAt) : '—'} · {s.cashierName}</span></td>
                      <td className="px-3 py-2 text-right">{s.systemTotal !== null && s.status === 'closed' ? formatPrice(s.systemTotal) : '—'}</td>
                      <td className="px-3 py-2 text-right">{s.userTotal !== null && s.status === 'closed' ? formatPrice(s.userTotal) : '—'}</td>
                      <td className="px-3 py-2 text-right"><span className={diffClass(s.diff)}>{s.diff === null ? '—' : formatPrice(s.diff)}</span></td>
                      <td className="px-3 py-2"><span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold', s.status === 'open' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700')}>{s.status === 'open' ? 'Abierto' : 'Cerrado'}</span>{s.reconciled && <span className="ml-1 text-[10px] text-sky-700 font-semibold">Conciliado</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length === 0 && <Empty title="Sin arqueos" text="Aún no hay arqueos de caja con este filtro." />}
            {rows.length > 0 && <MoreButton more={paged.more} onClick={paged.showMore} shown={paged.shown.length} total={paged.total} />}
          </div>
        </div>
        {showPanel && (sel !== null
          ? <ShiftDetail id={sel} onClose={() => setSel(null)} />
          : currentShift ? <CurrentArqueo live={live} reload={changed} onClose={mobile ? () => setPanel(false) : undefined} onClosed={id => { setSel(id); setPanel(false); }} />
          : <OpenArqueo onOpened={() => { changed(); setPanel(false); }} onClose={mobile ? () => setPanel(false) : undefined} />)}
      </div>
    </div>
  );
};

const OpenArqueo = ({ onOpened, onClose }: { onOpened: () => void; onClose?: () => void }) => {
  const user = useStore(s => s.user);
  const openShift = useStore(s => s.openShift);
  const [base, setBase] = useState('100000');
  const [cashier, setCashier] = useState(user?.name || '');
  const open = async () => { try { await openShift(Math.round(Number(base) || 0), cashier || user?.name || 'Caja', 'Apertura de turno'); toast.success('Caja abierta'); onOpened(); } catch (e: any) { toast.error(e.message); } };
  return (
    <DetailPane open onClose={onClose} title="NUEVO ARQUEO DE CAJA">
      <div className="p-4 space-y-3" data-open-shift>
        <div><label className={LBL}>Hora de apertura</label><input value={dt(new Date(Date.now() - 5 * 3600e3).toISOString().replace('T', ' '))} disabled className={cn(INPUT, 'bg-muted/40')} /></div>
        <div><label className={LBL}>Monto inicial (base en efectivo) *</label><input type="number" value={base} onChange={e => setBase(e.target.value)} className={cn(INPUT, 'font-mono text-lg')} /></div>
        <div><label className={LBL}>Responsable</label><input value={cashier} onChange={e => setCashier(e.target.value)} className={INPUT} /></div>
        <button onClick={open} disabled={base === ''} className="w-full py-3 rounded-xl gradient-primary text-primary-foreground font-bold disabled:opacity-40">Iniciar arqueo</button>
      </div>
    </DetailPane>
  );
};

const CurrentArqueo = ({ live, reload, onClose, onClosed }: { live: any; reload: () => void; onClose?: () => void; onClosed: (id: number) => void }) => {
  const refreshCurrentShift = useStore(s => s.refreshCurrentShift);
  const [counted, setCounted] = useState<Record<string, string>>({ cash: '', transfer: '', card: '' });
  const [notes, setNotes] = useState('');
  const [openIn, setOpenIn] = useState(false);
  const [openOut, setOpenOut] = useState(false);
  const [closing, setClosing] = useState(false);
  if (!live) return <DetailPane open onClose={onClose} title="ARQUEO DE CAJA"><p className="p-4 text-sm text-muted-foreground">Cargando...</p></DetailPane>;
  const exp = live.expectedByMethod || { cash: 0, transfer: 0, card: 0 };
  const tips = live.tips || { cash: 0, transfer: 0, card: 0, platform: 0 };
  const ingreso = live.cashSales + live.transferSales + live.debitSales + live.creditSales + (live.totalTips || 0) - (tips.platform || 0) + (live.totalDeposits || 0);
  const egreso = live.totalWithdrawals || 0;
  const sysTotal = exp.cash + exp.transfer + exp.card;
  const userTotal = ARQUEO.reduce((a, m) => a + (Math.round(Number(counted[m.key]) || 0)), 0);
  const allFilled = ARQUEO.every(m => counted[m.key] !== '');
  const diff = userTotal - sysTotal;
  const close = async () => {
    if (!allFilled) { toast.error('Ingresa lo contado en cada medio de pago'); return; }
    setClosing(true);
    try {
      const r = await api.closeShift({ counted: { cash: Number(counted.cash) || 0, transfer: Number(counted.transfer) || 0, card: Number(counted.card) || 0 }, notes } as any);
      await refreshCurrentShift(); reload(); toast.success('Caja cerrada'); onClosed(r.id);
    } catch (e: any) { toast.error(e.message); }
    setClosing(false);
  };
  const printX = () => printShiftReport(live.id, 'X', () => printThermal(generateZReportHtml({ ...live, countedDetail: null }, { paperSize: '80mm', isReportX: true }), `Reporte-X-${live.id}`));
  return (
    <DetailPane open onClose={onClose} title="ARQUEO DE CAJA" actions={<><ActionBtn title="Actualizar" onClick={reload}><RefreshCw size={15} /></ActionBtn><ActionBtn title="Imprimir corte parcial (X)" onClick={printX}><Printer size={15} /></ActionBtn></>}>
      <div data-arqueo>
        <div className="py-1"><Row k="Hora de apertura" v={dt(live.opened_at || live.openedAt)} /><Row k="Creado por" v={live.cashierName} /><Row k="Estado" v={`Abierto · turno #${live.id}`} /></div>
        <div className="text-sm">
          <div className="px-4 py-2.5 flex justify-between border-t border-border font-bold"><span>MONTO INICIAL</span><span>{formatPrice(live.initialCash)}</span></div>
          <button onClick={() => setOpenIn(v => !v)} className="w-full px-4 py-2.5 flex justify-between border-t border-border font-bold"><span className="flex items-center gap-1">{openIn ? <ChevronUp size={14} /> : <ChevronDown size={14} />} INGRESOS</span><span>{formatPrice(ingreso)}</span></button>
          {openIn && (
            <div className="px-6 pb-2 text-xs space-y-0.5 bg-muted/20" data-ingreso-detalle>
              <div className="flex justify-between"><span>Ventas en efectivo</span><span>{formatPrice(live.cashSales)}</span></div>
              <div className="flex justify-between"><span>Ventas por transferencia</span><span>{formatPrice(live.transferSales)}</span></div>
              <div className="flex justify-between"><span>Ventas por datáfono</span><span>{formatPrice(live.debitSales + live.creditSales)}</span></div>
              <div className="flex justify-between text-amber-800 font-semibold"><span>Propinas</span><span>{formatPrice(tips.cash + tips.transfer + tips.card)}</span></div>
              {live.totalDeposits > 0 && <div className="flex justify-between"><span>Ingresos de efectivo</span><span>{formatPrice(live.totalDeposits)}</span></div>}
              {live.platformSales > 0 && <div className="flex justify-between text-muted-foreground"><span>Plataformas (no entra a caja)</span><span>{formatPrice(live.platformSales)}</span></div>}
              {live.pendingSales > 0 && <div className="flex justify-between text-muted-foreground"><span>Por cobrar (no entra a caja)</span><span>{formatPrice(live.pendingSales)}</span></div>}
            </div>
          )}
          <button onClick={() => setOpenOut(v => !v)} className="w-full px-4 py-2.5 flex justify-between border-t border-border font-bold"><span className="flex items-center gap-1">{openOut ? <ChevronUp size={14} /> : <ChevronDown size={14} />} EGRESOS</span><span>{formatPrice(egreso)}</span></button>
          {openOut && <div className="px-6 pb-2 text-xs space-y-0.5 bg-muted/20">{(live.movements || []).filter((m: any) => m.type === 'withdrawal').map((m: any) => <div key={m.id} className="flex justify-between"><span>{m.reason}</span><span>{formatPrice(m.amount)}</span></div>)}{egreso === 0 && <p className="text-muted-foreground">Sin egresos.</p>}</div>}
          <div className="px-4 py-3 flex justify-between border-t border-border bg-muted/40"><span>Total</span><span className="text-lg font-bold">{formatPrice(live.initialCash + ingreso - egreso)}</span></div>
        </div>
        <div className="px-4 py-2.5 bg-brand-surface text-brand-on-dark text-sm font-bold">SEGÚN USUARIO</div>
        <table className="w-full text-sm">
          <thead><tr className="text-xs"><th /><th className="px-3 py-2 text-right font-semibold">$ Sistema</th><th className="px-3 py-2 text-right font-semibold bg-muted/40">$ Usuario</th></tr></thead>
          <tbody>
            {ARQUEO.map(m => (
              <tr key={m.key} className="border-t border-border">
                <td className="px-3 py-2 text-xs"><span className="flex items-center gap-1.5"><m.icon size={14} /> {m.label} <span className="text-red-600">*</span></span></td>
                <td className="px-3 py-2 text-right font-mono" data-sistema={m.key}>{formatPrice(exp[m.key])}</td>
                <td className="px-2 py-1.5 bg-muted/40"><input type="number" inputMode="numeric" value={counted[m.key]} onChange={e => setCounted(c => ({ ...c, [m.key]: e.target.value }))} data-usuario={m.key} className="w-full px-2 py-1.5 rounded-md border border-input bg-white text-right font-mono" /></td>
              </tr>
            ))}
            <tr className="border-t border-border bg-muted/40"><td className="px-3 py-2 font-semibold">Total</td><td className="px-3 py-2 text-right font-mono">{formatPrice(sysTotal)}</td><td className="px-3 py-2 text-right font-mono font-bold">{formatPrice(userTotal)}</td></tr>
          </tbody>
        </table>
        <div className={cn('px-4 py-3 flex justify-between text-white font-bold', diff === 0 && allFilled ? 'bg-emerald-600' : 'bg-red-500')} data-diferencia><span>Diferencia</span><span className="text-lg">{diff > 0 ? '+' : ''}{formatPrice(diff)}</span></div>
        <div className="p-4 space-y-2 border-t border-border">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observaciones del cierre" className={cn(INPUT, 'h-16 text-xs')} />
          <button onClick={close} disabled={closing || !allFilled} className="w-full py-3 rounded-xl bg-brand-surface text-brand-on-dark font-bold flex items-center justify-center gap-2 disabled:opacity-40" data-cerrar-caja><Lock size={16} /> {closing ? 'Cerrando...' : 'Cerrar caja'}</button>
          <p className="text-[10px] text-muted-foreground flex items-start gap-1"><Info size={11} className="mt-0.5 shrink-0" /> El sistema suma lo cobrado en cada medio, incluidas las propinas. Cuenta el efectivo, revisa transferencias y datáfono e ingrésalos.</p>
        </div>
      </div>
    </DetailPane>
  );
};

const ShiftDetail = ({ id, onClose }: { id: number; onClose: () => void }) => {
  const [r, setR] = useState<any>(null);
  const [openIn, setOpenIn] = useState(false);
  const [z, setZ] = useState(false);
  useEffect(() => { setR(null); api.getShiftReport(id).then(setR).catch(e => toast.error(e.message)); }, [id]);
  const exp = r?.expectedByMethod || { cash: 0, transfer: 0, card: 0 };
  const cnt = r?.countedDetail;
  const tips = r?.tips || { cash: 0, transfer: 0, card: 0, platform: 0 };
  const ingreso = r ? r.cashSales + r.transferSales + r.debitSales + r.creditSales + (r.totalTips || 0) - (tips.platform || 0) + (r.totalDeposits || 0) : 0;
  const sys = exp.cash + exp.transfer + exp.card;
  const usr = cnt ? ['cash', 'transfer', 'card'].reduce((a, k) => a + (Number(cnt[k]) || 0), 0) : null;
  const print = () => r && printShiftReport(r.id, r.status === 'closed' ? 'Z' : 'X', () => printThermal(generateZReportHtml(r, { paperSize: '80mm', isReportX: r.status !== 'closed' }), `Reporte-${r.id}`));
  return (
    <DetailPane open onClose={onClose} title={`ARQUEO #${id}`} actions={r && <><ActionBtn title="Ver reporte en pantalla" onClick={() => setZ(true)} testId="view-z"><Eye size={15} /></ActionBtn><ActionBtn title="Imprimir arqueo" onClick={print} testId="print-arqueo"><Printer size={15} /></ActionBtn></>}>
      {!r ? <p className="p-4 text-sm text-muted-foreground">Cargando...</p> : (
        <div data-shift-detail={id}>
          <div className="py-1"><Row k="Hora de apertura" v={dt(r.openedAt)} /><Row k="Creado por" v={r.cashierName} /><Row k="Hora de cierre" v={dt(r.closedAt)} /><Row k="Estado" v={r.status === 'closed' ? 'Cerrado' : 'Abierto'} />{r.notes && <Row k="Observaciones" v={r.notes} />}</div>
          <SectionTitle>{dt(r.openedAt)} — {r.closedAt ? dt(r.closedAt) : 'ahora'}</SectionTitle>
          <Row k="Monto inicial" v={formatPrice(r.initialCash)} />
          <button onClick={() => setOpenIn(v => !v)} className="w-full flex justify-between px-4 py-1.5 text-sm border-b border-border/60"><span className="text-muted-foreground flex items-center gap-1">{openIn ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Ingresos</span><span>{formatPrice(ingreso)}</span></button>
          {openIn && <div className="px-6 py-1 text-xs space-y-0.5 bg-muted/20"><div className="flex justify-between"><span>Efectivo</span><span>{formatPrice(r.cashSales)}</span></div><div className="flex justify-between"><span>Transferencia</span><span>{formatPrice(r.transferSales)}</span></div><div className="flex justify-between"><span>Datáfono</span><span>{formatPrice(r.debitSales + r.creditSales)}</span></div><div className="flex justify-between"><span>Propinas</span><span>{formatPrice(tips.cash + tips.transfer + tips.card)}</span></div><div className="flex justify-between"><span>Ingresos de efectivo</span><span>{formatPrice(r.totalDeposits || 0)}</span></div></div>}
          <Row k="Egreso" v={formatPrice(r.totalWithdrawals || 0)} />
          <Row k="Total (sistema)" v={formatPrice(sys)} strong />
          <SectionTitle>Según usuario</SectionTitle>
          {ARQUEO.map(m => <Row key={m.key} k={`${m.label} · sistema ${formatPrice(exp[m.key])}`} v={cnt ? formatPrice(Number(cnt[m.key]) || 0) : '—'} />)}
          <Row k="Total (usuario)" v={usr === null ? '—' : formatPrice(usr)} strong />
          {usr !== null && <div className={cn('px-4 py-3 flex justify-between font-bold text-white', usr - sys === 0 ? 'bg-emerald-600' : 'bg-red-500')}><span>Diferencia</span><span>{formatPrice(usr - sys)}</span></div>}
        </div>
      )}
      {z && r && <ZReportModal shift={r} isReportX={r.status !== 'closed'} onClose={() => setZ(false)} />}
    </DetailPane>
  );
};

/* ======================= Conciliación ======================= */
const ConciliacionView = () => {
  const user = useStore(s => s.user);
  const isAdmin = user?.role === 'admin';
  const [f, setF] = useState({ reconciled: '', closedBy: '', month: new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 7) });
  const [rows, setRows] = useState<any[]>([]);
  const [sel, setSel] = useState<any>(null);
  const [form, setForm] = useState({ amount: '', reason: '', comment: '' });
  const range = useMemo(() => { const [y, m] = f.month.split('-').map(Number); const last = new Date(y, m, 0).getDate(); return { from: `${f.month}-01`, to: `${f.month}-${String(last).padStart(2, '0')}` }; }, [f.month]);
  const load = useCallback(() => { api.getCajaShifts({ status: 'closed', reconciled: f.reconciled, closedBy: f.closedBy, ...range, limit: 500 }).then(setRows).catch(e => toast.error(e.message)); }, [f, range]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (sel) setForm({ amount: String(sel.reconciledAmount ?? sel.userTotal ?? sel.systemTotal ?? ''), reason: sel.reconcileReason || '', comment: sel.reconcileComment || '' }); }, [sel?.id]);
  const users = [...new Set(rows.map(r => r.cashierName))];
  const pend = rows.filter(r => !r.reconciled), done = rows.filter(r => r.reconciled);
  const totalDiff = rows.reduce((a, r) => a + ((r.reconciled ? r.reconcileDiff : r.diff) || 0), 0);
  const save = async () => {
    try { const r = await api.reconcileShift(sel.id, { amount: Number(form.amount), reason: form.reason, comment: form.comment }); toast.success('Caja conciliada'); setSel(r); load(); } catch (e: any) { toast.error(e.message); }
  };
  const undo = async () => { if (!window.confirm('¿Deshacer la conciliación de esta caja?')) return; await api.undoReconcile(sel.id); setSel(null); load(); };
  const diffNow = sel ? Number(form.amount) - (sel.systemTotal || 0) : 0;
  return (
    <div className="space-y-3" data-conciliacion>
      <div className="bg-card rounded-xl border border-border p-3 flex flex-wrap items-end gap-2">
        <div><label className={LBL}>Período (mes)</label><input type="month" value={f.month} onChange={e => e.target.value && setF({ ...f, month: e.target.value })} className={SEL} /></div>
        <div><label className={LBL}>Caja</label><select className={SEL} disabled><option>Principal</option></select></div>
        <div><label className={LBL}>Estado</label><select value={f.reconciled} onChange={e => setF({ ...f, reconciled: e.target.value })} className={SEL} data-conc-state><option value="">(todos)</option><option value="no">Pendiente</option><option value="yes">Conciliado</option></select></div>
        <div><label className={LBL}>Usuario</label><select value={f.closedBy} onChange={e => setF({ ...f, closedBy: e.target.value })} className={SEL}><option value="">(todos)</option>{users.map(u => <option key={u}>{u}</option>)}</select></div>
      </div>
      <div className="bg-card rounded-xl border border-border overflow-hidden"><div className="grid grid-cols-1 sm:grid-cols-4"><Kpi label="Total de cajas" value={String(rows.length)} /><Kpi label="Pendientes" value={String(pend.length)} tone={pend.length ? 'bg-amber-50' : ''} /><Kpi label="Conciliadas" value={String(done.length)} /><Kpi label="Diferencia total" value={formatPrice(totalDiff)} tone={totalDiff < 0 ? 'bg-red-50' : ''} /></div></div>
      <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(340px,1fr)] gap-3 items-start">
        <div className="bg-card rounded-xl border border-border overflow-hidden min-w-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="bg-muted/40 text-muted-foreground text-left"><th className="px-3 py-2">Apertura / Cierre</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2 text-right">$ Sistema</th><th className="px-3 py-2 text-right">$ Usuario</th><th className="px-3 py-2 text-right">$ Conciliado</th><th className="px-3 py-2 text-right">Diferencia</th><th className="px-3 py-2">Cerrado por</th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} onClick={() => setSel(r)} className={cn('border-t border-border cursor-pointer', sel?.id === r.id ? 'bg-amber-100' : 'hover:bg-brand-button/5')} data-conc-row={r.id}>
                    <td className="px-3 py-2 whitespace-nowrap"><span className="block">{dt(r.openedAt)}</span><span className="block text-muted-foreground">{dt(r.closedAt)}</span></td>
                    <td className="px-3 py-2"><span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold', r.reconciled ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800')}>{r.reconciled ? 'Conciliado' : 'Pendiente'}</span></td>
                    <td className="px-3 py-2 text-right">{formatPrice(r.systemTotal || 0)}</td><td className="px-3 py-2 text-right">{r.userTotal === null ? '—' : formatPrice(r.userTotal)}</td>
                    <td className="px-3 py-2 text-right">{r.reconciled ? formatPrice(r.reconciledAmount) : '—'}</td>
                    <td className="px-3 py-2 text-right"><span className={diffClass(r.reconciled ? r.reconcileDiff : r.diff)}>{formatPrice((r.reconciled ? r.reconcileDiff : r.diff) || 0)}</span></td>
                    <td className="px-3 py-2">{r.cashierName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && <Empty title="Sin cajas cerradas" text="No hay cajas cerradas en este período." />}
        </div>
        <DetailPane open={!!sel} onClose={() => setSel(null)} title={sel ? `CONCILIACIÓN · ARQUEO #${sel.id}` : ''} empty="Selecciona una caja cerrada para conciliarla">
          {sel && (
            <div data-conc-detail>
              <SectionTitle>Detalle de caja</SectionTitle>
              <Row k="Caja" v="Principal" /><Row k="Apertura / cierre" v={`${dt(sel.openedAt)} → ${dt(sel.closedAt)}`} /><Row k="Cerrado por" v={sel.cashierName} />{sel.notes && <Row k="Comentario" v={sel.notes} />}
              <SectionTitle>Montos</SectionTitle>
              <table className="w-full text-xs"><thead><tr className="text-muted-foreground"><th className="px-4 py-1 text-left" /><th className="px-2 py-1 text-right">$ Sistema</th><th className="px-2 py-1 text-right">$ Usuario</th><th className="px-4 py-1 text-right">Diferencia</th></tr></thead>
                <tbody>{['cash', 'transfer', 'card'].map(k => { const sy = sel.expectedDetail?.[k] || 0, us = sel.countedDetail?.[k]; return <tr key={k} className="border-t border-border"><td className="px-4 py-1">{({ cash: 'Efectivo', transfer: 'Transferencia', card: 'Datáfono' } as any)[k]}</td><td className="px-2 py-1 text-right">{formatPrice(sy)}</td><td className="px-2 py-1 text-right">{us === undefined ? '—' : formatPrice(us)}</td><td className="px-4 py-1 text-right">{us === undefined ? '—' : formatPrice(us - sy)}</td></tr>; })}
                  <tr className="border-t border-border font-bold"><td className="px-4 py-1">Total</td><td className="px-2 py-1 text-right">{formatPrice(sel.systemTotal || 0)}</td><td className="px-2 py-1 text-right">{sel.userTotal === null ? '—' : formatPrice(sel.userTotal)}</td><td className="px-4 py-1 text-right">{formatPrice(sel.diff || 0)}</td></tr></tbody></table>
              <SectionTitle>Detalle de conciliación</SectionTitle>
              {sel.reconciled ? (
                <div className="pb-2"><Row k="Conciliado por" v={`${sel.reconciledBy} · ${dt(sel.reconciledAt)}`} /><Row k="Monto conciliado" v={formatPrice(sel.reconciledAmount)} strong /><Row k="Diferencia" v={formatPrice(sel.reconcileDiff || 0)} /><Row k="Motivo de la diferencia" v={sel.reconcileReason || '—'} /><Row k="Comentario" v={sel.reconcileComment || '—'} />
                  {isAdmin && <button onClick={undo} className="mx-4 mt-2 text-xs font-semibold text-red-600 flex items-center gap-1"><Undo2 size={12} /> Deshacer conciliación</button>}</div>
              ) : isAdmin ? (
                <div className="p-4 space-y-2">
                  <div><label className={LBL}>Monto conciliado (lo que realmente quedó)</label><input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className={cn(INPUT, 'font-mono')} data-conc-amount /></div>
                  <p className={cn('text-xs', diffNow === 0 ? 'text-emerald-700' : 'text-red-700')}>Diferencia con el sistema: {formatPrice(diffNow)}</p>
                  <div><label className={LBL}>Motivo de la diferencia {diffNow !== 0 && '*'}</label><input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} className={INPUT} placeholder="Ej. faltante asumido por el cajero" data-conc-reason /></div>
                  <div><label className={LBL}>Comentario</label><textarea value={form.comment} onChange={e => setForm({ ...form, comment: e.target.value })} className={cn(INPUT, 'h-16')} /></div>
                  <button onClick={save} disabled={form.amount === '' || (diffNow !== 0 && form.reason.trim().length < 3)} className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground font-bold disabled:opacity-40" data-conc-save>Conciliar caja</button>
                </div>
              ) : <p className="p-4 text-xs text-muted-foreground">La conciliación la hace un administrador.</p>}
            </div>
          )}
        </DetailPane>
      </div>
    </div>
  );
};

export default ArqueosTab;
