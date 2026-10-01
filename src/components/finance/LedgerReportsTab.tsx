import { Fragment, useEffect, useMemo, useState } from 'react';
import { Scale, Landmark, TrendingUp, BookOpen, Users, Download, Printer, ChevronDown, ChevronRight, CheckCircle2, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { formatPrice, getColombiaTodayStr } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Chip, INPUT, LABEL, fmtDate } from '@/components/common/Primitives';
import { downloadXlsx } from '@/lib/xlsx';
import { useStore } from '@/store/useStore';

type View = 'balance' | 'situacion' | 'resultados' | 'auxiliar' | 'terceros';
const monthStart = () => `${getColombiaTodayStr().slice(0, 7)}-01`;
const yearStart = () => `${getColombiaTodayStr().slice(0, 4)}-01-01`;
const money = (n: number) => (n < 0 ? `(${formatPrice(Math.abs(n))})` : formatPrice(n));

const print = () => {
  document.body.classList.add('print-report');
  const cleanup = () => { document.body.classList.remove('print-report'); window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  setTimeout(() => window.print(), 50);
  setTimeout(cleanup, 60000);
};

const Head = ({ title, subtitle, onExport }: { title: string; subtitle: string; onExport: () => void }) => {
  const businessName = useStore(s => s.businessName);
  const businessNit = useStore(s => s.businessNit);
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <p className="text-[11px] text-muted-foreground">{businessName}{businessNit ? ` · NIT ${businessNit}` : ''}</p>
        <h3 className="font-display font-bold text-base text-brand-dark">{title}</h3>
        <p className="text-[11px] text-muted-foreground">{subtitle} · cifras en pesos colombianos</p>
      </div>
      <div className="flex gap-1.5 print:hidden">
        <button onClick={onExport} className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold flex items-center gap-1"><Download size={13} /> Excel</button>
        <button onClick={print} className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold flex items-center gap-1"><Printer size={13} /> Imprimir / PDF</button>
      </div>
    </div>
  );
};

/** Balances e informes contables tomados del libro diario: balance de prueba, situación financiera, resultados, auxiliares y terceros. */
const LedgerReportsTab = () => {
  const [view, setView] = useState<View>('balance');
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 print:hidden">
        <Chip active={view === 'balance'} onClick={() => setView('balance')}><span className="flex items-center gap-1"><Scale size={13} /> Balance de prueba</span></Chip>
        <Chip active={view === 'situacion'} onClick={() => setView('situacion')}><span className="flex items-center gap-1"><Landmark size={13} /> Situación financiera</span></Chip>
        <Chip active={view === 'resultados'} onClick={() => setView('resultados')}><span className="flex items-center gap-1"><TrendingUp size={13} /> Estado de resultados</span></Chip>
        <Chip active={view === 'auxiliar'} onClick={() => setView('auxiliar')}><span className="flex items-center gap-1"><BookOpen size={13} /> Libro auxiliar</span></Chip>
        <Chip active={view === 'terceros'} onClick={() => setView('terceros')}><span className="flex items-center gap-1"><Users size={13} /> Terceros (exógena)</span></Chip>
      </div>
      <div className="print-area">
        {view === 'balance' && <TrialBalanceView />}
        {view === 'situacion' && <BalanceSheetView />}
        {view === 'resultados' && <IncomeView />}
        {view === 'auxiliar' && <LedgerView />}
        {view === 'terceros' && <ThirdPartiesView />}
      </div>
    </div>
  );
};

const RangeBar = ({ from, to, setFrom, setTo, children }: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void; children?: any }) => (
  <div className="flex flex-wrap items-end gap-2 print:hidden">
    <div><label className={LABEL}>Desde</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} className={cn(INPUT, 'py-1.5 text-xs')} /></div>
    <div><label className={LABEL}>Hasta</label><input type="date" value={to} onChange={e => setTo(e.target.value)} className={cn(INPUT, 'py-1.5 text-xs')} /></div>
    <div className="flex gap-1 pb-0.5">
      <Chip onClick={() => { setFrom(monthStart()); setTo(getColombiaTodayStr()); }}>Este mes</Chip>
      <Chip onClick={() => { setFrom(yearStart()); setTo(getColombiaTodayStr()); }}>Este año</Chip>
    </div>
    {children}
  </div>
);

/* ---------- Balance de prueba ---------- */
const TrialBalanceView = () => {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(getColombiaTodayStr());
  const [level, setLevel] = useState(4);
  const [byThird, setByThird] = useState(false);
  const [data, setData] = useState<any>(null);
  useEffect(() => { api.getTrialBalance({ from, to, level, third: byThird ? 1 : 0 }).then(setData).catch(() => setData(null)); }, [from, to, level, byThird]);
  const exportXlsx = () => data && downloadXlsx(`balance_de_prueba_${from}_${to}`, [{ name: 'Balance de prueba', headers: ['Código', 'Cuenta', ...(byThird ? ['Tercero', 'Nombre'] : []), 'Saldo inicial', 'Débitos', 'Créditos', 'Saldo final'], rows: data.rows.map((r: any) => [r.code, r.name, ...(byThird ? [r.thirdDoc, r.thirdName] : []), r.opening, r.debits, r.credits, r.closing]), widths: [10, 40, ...(byThird ? [14, 30] : []), 16, 16, 16, 16] }]);
  return (
    <div className="space-y-3">
      <RangeBar from={from} to={to} setFrom={setFrom} setTo={setTo}>
        <div><label className={LABEL}>Nivel</label><div className="flex gap-1">{[[1, 'Clase'], [2, 'Grupo'], [4, 'Cuenta'], [6, 'Subcuenta'], [8, 'Auxiliar']].map(([v, l]) => <Chip key={v} active={level === v} onClick={() => setLevel(Number(v))}>{l}</Chip>)}</div></div>
        <label className="flex items-center gap-1.5 text-xs pb-2"><input type="checkbox" checked={byThird} onChange={e => setByThird(e.target.checked)} /> Por tercero (anexo de balances)</label>
      </RangeBar>
      {data && (
        <div className="bg-card rounded-xl border border-border shadow-card p-4 space-y-3">
          <Head title={byThird ? 'Balance de prueba por terceros' : 'Balance de prueba'} subtitle={`Del ${fmtDate(from)} al ${fmtDate(to)} · nivel ${level}`} onExport={exportXlsx} />
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead><tr className="text-muted-foreground bg-muted/30"><th className="px-2 py-1.5 text-left font-semibold">Código</th><th className="px-2 py-1.5 text-left font-semibold">Cuenta</th>{byThird && <th className="px-2 py-1.5 text-left font-semibold">Tercero</th>}<th className="px-2 py-1.5 text-right font-semibold">Saldo inicial</th><th className="px-2 py-1.5 text-right font-semibold">Débitos</th><th className="px-2 py-1.5 text-right font-semibold">Créditos</th><th className="px-2 py-1.5 text-right font-semibold">Saldo final</th></tr></thead>
              <tbody>
                {data.rows.map((r: any, i: number) => (
                  <tr key={i} className={cn('border-t border-border', r.code.length <= 2 && 'font-semibold bg-brand-card/40')}>
                    <td className="px-2 py-1 font-mono whitespace-nowrap" style={{ paddingLeft: 8 + Math.max(0, (r.code.length - 1)) * 4 }}>{r.code}</td><td className="px-2 py-1">{r.name}</td>
                    {byThird && <td className="px-2 py-1">{r.thirdName}{r.thirdDoc ? <span className="text-muted-foreground"> ({r.thirdDoc})</span> : ''}</td>}
                    <td className="px-2 py-1 text-right">{money(r.opening)}</td><td className="px-2 py-1 text-right">{formatPrice(r.debits)}</td><td className="px-2 py-1 text-right">{formatPrice(r.credits)}</td><td className="px-2 py-1 text-right font-semibold">{money(r.closing)}</td>
                  </tr>
                ))}
                {data.rows.length === 0 && <tr><td colSpan={byThird ? 7 : 6} className="px-2 py-4 text-center text-muted-foreground">Sin movimientos en el período.</td></tr>}
              </tbody>
              <tfoot><tr className="border-t-2 border-brand-primary/30 font-bold bg-brand-card"><td colSpan={byThird ? 3 : 2} className="px-2 py-1.5">Totales</td><td className="px-2 py-1.5 text-right">{money(data.totals.opening)}</td><td className="px-2 py-1.5 text-right">{formatPrice(data.totals.debits)}</td><td className="px-2 py-1.5 text-right">{formatPrice(data.totals.credits)}</td><td className="px-2 py-1.5 text-right">{money(data.totals.closing)}</td></tr></tfoot>
            </table>
          </div>
          <p className={cn('text-xs font-semibold flex items-center gap-1', data.balanced ? 'text-emerald-700' : 'text-red-600')}>{data.balanced ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />} {data.balanced ? 'Partida doble verificada: débitos = créditos.' : 'Hay una diferencia entre débitos y créditos; revisa el libro diario.'}</p>
        </div>
      )}
    </div>
  );
};

/* ---------- Estado de situación financiera ---------- */
const GroupTable = ({ title, groups, total, tone }: { title: string; groups: any[]; total: number; tone: string }) => {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className={cn('px-3 py-2 text-xs font-bold uppercase tracking-wide', tone)}>{title}</div>
      <table className="w-full text-[11px]">
        <tbody>
          {groups.map(g => (
            <Fragment key={g.code}>
              <tr onClick={() => setOpen(o => ({ ...o, [g.code]: !o[g.code] }))} className="border-t border-border cursor-pointer hover:bg-brand-button/5">
                <td className="px-3 py-1.5 font-mono text-muted-foreground w-14"><span className="inline-flex items-center gap-1">{open[g.code] ? <ChevronDown size={11} /> : <ChevronRight size={11} />}{g.code}</span></td>
                <td className="px-3 py-1.5 font-semibold text-brand-dark">{g.name}</td>
                <td className="px-3 py-1.5 text-right font-semibold">{money(g.balance)}</td>
              </tr>
              {open[g.code] && g.accounts.map((a: any) => (
                <tr key={a.code} className="border-t border-border/60 bg-muted/20"><td className="px-3 py-1 font-mono text-muted-foreground pl-7">{a.code}</td><td className="px-3 py-1">{a.name}</td><td className="px-3 py-1 text-right">{money(a.balance)}</td></tr>
              ))}
            </Fragment>
          ))}
          {groups.length === 0 && <tr><td colSpan={3} className="px-3 py-3 text-center text-muted-foreground">Sin saldos.</td></tr>}
        </tbody>
        <tfoot><tr className="border-t-2 border-brand-primary/30 font-bold bg-brand-card"><td colSpan={2} className="px-3 py-1.5">Total {title.toLowerCase()}</td><td className="px-3 py-1.5 text-right">{money(total)}</td></tr></tfoot>
      </table>
    </div>
  );
};

const BalanceSheetView = () => {
  const [date, setDate] = useState(getColombiaTodayStr());
  const [data, setData] = useState<any>(null);
  useEffect(() => { api.getBalanceSheet(date).then(setData).catch(() => setData(null)); }, [date]);
  const exportXlsx = () => data && downloadXlsx(`situacion_financiera_${date}`, [{ name: 'Situación financiera', headers: ['Sección', 'Código', 'Cuenta', 'Saldo'], rows: [
    ...data.assets.flatMap((g: any) => [['Activo', g.code, g.name, g.balance], ...g.accounts.map((a: any) => ['Activo', a.code, a.name, a.balance])]),
    ['Activo', '', 'TOTAL ACTIVO', data.totalAssets],
    ...data.liabilities.flatMap((g: any) => [['Pasivo', g.code, g.name, g.balance], ...g.accounts.map((a: any) => ['Pasivo', a.code, a.name, a.balance])]),
    ['Pasivo', '', 'TOTAL PASIVO', data.totalLiabilities],
    ...data.equity.flatMap((g: any) => [['Patrimonio', g.code, g.name, g.balance], ...g.accounts.map((a: any) => ['Patrimonio', a.code, a.name, a.balance])]),
    ['Patrimonio', '3605', 'Utilidad (pérdida) del ejercicio', data.resultYear], ['Patrimonio', '3705', 'Resultados de ejercicios anteriores', data.resultPrior], ['Patrimonio', '', 'TOTAL PATRIMONIO', data.totalEquity],
    ['', '', 'TOTAL PASIVO + PATRIMONIO', data.totalLiabilities + data.totalEquity],
  ], widths: [12, 10, 44, 18] }]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 print:hidden">
        <div><label className={LABEL}>A la fecha</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className={cn(INPUT, 'py-1.5 text-xs')} /></div>
      </div>
      {data && (
        <div className="bg-card rounded-xl border border-border shadow-card p-4 space-y-3">
          <Head title="Estado de situación financiera" subtitle={`Al ${fmtDate(date)} · ejercicio desde ${fmtDate(data.fiscalYearStart)}`} onExport={exportXlsx} />
          <div className="grid lg:grid-cols-2 gap-3">
            <GroupTable title="Activo" groups={data.assets} total={data.totalAssets} tone="bg-sky-50 text-sky-800" />
            <div className="space-y-3">
              <GroupTable title="Pasivo" groups={data.liabilities} total={data.totalLiabilities} tone="bg-amber-50 text-amber-800" />
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="px-3 py-2 text-xs font-bold uppercase tracking-wide bg-violet-50 text-violet-800">Patrimonio</div>
                <table className="w-full text-[11px]"><tbody>
                  {data.equity.map((g: any) => <tr key={g.code} className="border-t border-border"><td className="px-3 py-1.5 font-mono text-muted-foreground w-14">{g.code}</td><td className="px-3 py-1.5 font-semibold text-brand-dark">{g.name}</td><td className="px-3 py-1.5 text-right font-semibold">{money(g.balance)}</td></tr>)}
                  <tr className="border-t border-border"><td className="px-3 py-1.5 font-mono text-muted-foreground">3605</td><td className="px-3 py-1.5">Utilidad (pérdida) del ejercicio</td><td className={cn('px-3 py-1.5 text-right font-semibold', data.resultYear < 0 && 'text-red-600')}>{money(data.resultYear)}</td></tr>
                  <tr className="border-t border-border"><td className="px-3 py-1.5 font-mono text-muted-foreground">3705</td><td className="px-3 py-1.5">Resultados de ejercicios anteriores</td><td className="px-3 py-1.5 text-right font-semibold">{money(data.resultPrior)}</td></tr>
                </tbody><tfoot><tr className="border-t-2 border-brand-primary/30 font-bold bg-brand-card"><td colSpan={2} className="px-3 py-1.5">Total patrimonio</td><td className="px-3 py-1.5 text-right">{money(data.totalEquity)}</td></tr></tfoot></table>
              </div>
              <div className="rounded-xl border border-border bg-brand-card px-3 py-2 flex items-center justify-between text-xs font-bold text-brand-dark"><span>Total pasivo + patrimonio</span><span>{money(data.totalLiabilities + data.totalEquity)}</span></div>
            </div>
          </div>
          <p className={cn('text-xs font-semibold flex items-center gap-1', data.balanced ? 'text-emerald-700' : 'text-red-600')}>{data.balanced ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />} {data.balanced ? 'Activo = Pasivo + Patrimonio.' : 'El balance no cuadra; revisa los asientos manuales.'}</p>
        </div>
      )}
    </div>
  );
};

/* ---------- Estado de resultados contable ---------- */
const IncomeView = () => {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(getColombiaTodayStr());
  const [data, setData] = useState<any>(null);
  useEffect(() => { api.getIncomeStatementLedger(from, to).then(setData).catch(() => setData(null)); }, [from, to]);
  const pctOf = (n: number) => (data && data.totalIncome > 0 ? `${Math.round((n / data.totalIncome) * 1000) / 10}%` : '');
  const exportXlsx = () => data && downloadXlsx(`estado_de_resultados_contable_${from}_${to}`, [{ name: 'Estado de resultados', headers: ['Código', 'Concepto', 'Valor', '% ingresos'], rows: [
    ['4', 'INGRESOS', data.totalIncome, '100%'], ...data.income.flatMap((g: any) => [[g.code, g.name, g.balance, pctOf(g.balance)], ...g.accounts.map((a: any) => [a.code, '   ' + a.name, a.balance, pctOf(a.balance)])]),
    ['6', 'COSTO DE VENTAS', data.totalCosts, pctOf(data.totalCosts)], ...data.costs.flatMap((g: any) => [[g.code, g.name, g.balance, pctOf(g.balance)], ...g.accounts.map((a: any) => [a.code, '   ' + a.name, a.balance, pctOf(a.balance)])]),
    ['', 'UTILIDAD BRUTA', data.grossProfit, pctOf(data.grossProfit)],
    ['5', 'GASTOS OPERACIONALES', data.totalExpenses, pctOf(data.totalExpenses)], ...data.expenses.flatMap((g: any) => [[g.code, g.name, g.balance, pctOf(g.balance)], ...g.accounts.map((a: any) => [a.code, '   ' + a.name, a.balance, pctOf(a.balance)])]),
    ['', 'UTILIDAD ANTES DE IMPUESTOS', data.beforeTax, pctOf(data.beforeTax)], ['54', 'Impuesto de renta', data.incomeTax, pctOf(data.incomeTax)], ['', 'UTILIDAD NETA', data.net, pctOf(data.net)],
  ], widths: [8, 48, 18, 12] }]);
  const Section = ({ code, title, groups, total, bold }: { code: string; title: string; groups: any[]; total: number; bold?: boolean }) => (
    <>
      <tr className="border-t border-border bg-brand-card/50"><td className="px-3 py-1.5 font-mono text-muted-foreground">{code}</td><td className="px-3 py-1.5 font-bold text-brand-dark">{title}</td><td className="px-3 py-1.5 text-right font-bold">{money(total)}</td><td className="px-3 py-1.5 text-right text-muted-foreground">{pctOf(total)}</td></tr>
      {groups.map(g => (
        <Fragment key={g.code}>
          <tr className="border-t border-border/60"><td className="px-3 py-1 font-mono text-muted-foreground pl-5">{g.code}</td><td className="px-3 py-1 font-semibold">{g.name}</td><td className="px-3 py-1 text-right font-semibold">{money(g.balance)}</td><td className="px-3 py-1 text-right text-muted-foreground">{pctOf(g.balance)}</td></tr>
          {g.accounts.map((a: any) => <tr key={a.code} className="border-t border-border/40"><td className="px-3 py-0.5 font-mono text-muted-foreground pl-9">{a.code}</td><td className="px-3 py-0.5 text-muted-foreground">{a.name}</td><td className="px-3 py-0.5 text-right">{money(a.balance)}</td><td className="px-3 py-0.5 text-right text-muted-foreground">{pctOf(a.balance)}</td></tr>)}
        </Fragment>
      ))}
    </>
  );
  const Result = ({ label, value, strong }: { label: string; value: number; strong?: boolean }) => (
    <tr className={cn('border-t-2 border-brand-primary/30', strong ? 'bg-brand-card font-bold text-base' : 'font-bold')}><td /><td className="px-3 py-2 text-brand-dark">{label}</td><td className={cn('px-3 py-2 text-right', value < 0 ? 'text-red-600' : 'text-emerald-700')}>{money(value)}</td><td className="px-3 py-2 text-right text-muted-foreground text-xs">{pctOf(value)}</td></tr>
  );
  return (
    <div className="space-y-3">
      <RangeBar from={from} to={to} setFrom={setFrom} setTo={setTo} />
      {data && (
        <div className="bg-card rounded-xl border border-border shadow-card p-4 space-y-3">
          <Head title="Estado de resultados" subtitle={`Del ${fmtDate(from)} al ${fmtDate(to)} · tomado del libro diario`} onExport={exportXlsx} />
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead><tr className="text-muted-foreground bg-muted/30"><th className="px-3 py-1.5 text-left font-semibold w-16">Código</th><th className="px-3 py-1.5 text-left font-semibold">Concepto</th><th className="px-3 py-1.5 text-right font-semibold">Valor</th><th className="px-3 py-1.5 text-right font-semibold w-20">% ingresos</th></tr></thead>
              <tbody>
                <Section code="4" title="Ingresos operacionales" groups={data.income} total={data.totalIncome} />
                <Section code="6" title="Costo de ventas" groups={data.costs} total={data.totalCosts} />
                <Result label="Utilidad bruta" value={data.grossProfit} />
                <Section code="5" title="Gastos operacionales" groups={data.expenses} total={data.totalExpenses} />
                <Result label="Utilidad antes de impuestos" value={data.beforeTax} />
                <tr className="border-t border-border"><td className="px-3 py-1 font-mono text-muted-foreground">54</td><td className="px-3 py-1">Impuesto de renta y complementarios</td><td className="px-3 py-1 text-right">{money(data.incomeTax)}</td><td className="px-3 py-1 text-right text-muted-foreground">{pctOf(data.incomeTax)}</td></tr>
                <Result label="Utilidad neta del período" value={data.net} strong />
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

/* ---------- Libro auxiliar por cuenta ---------- */
const LedgerView = () => {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [code, setCode] = useState('110505');
  const [third, setThird] = useState('');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(getColombiaTodayStr());
  const [data, setData] = useState<any>(null);
  useEffect(() => { api.getAccounts().then(setAccounts).catch(() => {}); }, []);
  useEffect(() => { if (code) api.getLedgerAccount({ code, from, to, third }).then(setData).catch(() => setData(null)); }, [code, from, to, third]);
  const exportXlsx = () => data && downloadXlsx(`auxiliar_${code}_${from}_${to}`, [{ name: `Auxiliar ${code}`, headers: ['Fecha', 'Comprobante', 'Descripción', 'Cuenta', 'Tercero', 'Detalle', 'Débito', 'Crédito', 'Saldo'], rows: [['', '', 'Saldo inicial', '', '', '', '', '', data.opening], ...data.rows.map((r: any) => [r.date, r.number, r.entryDescription, r.code, r.thirdName || '', r.description, r.debit, r.credit, r.balance])], widths: [11, 12, 40, 10, 28, 30, 14, 14, 16] }]);
  return (
    <div className="space-y-3">
      <RangeBar from={from} to={to} setFrom={setFrom} setTo={setTo}>
        <div className="min-w-[260px]"><label className={LABEL}>Cuenta</label><select value={code} onChange={e => setCode(e.target.value)} className={cn(INPUT, 'py-1.5 text-xs font-mono')}>{accounts.filter(a => a.level >= 4).map(a => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</select></div>
        <div><label className={LABEL}>Tercero (NIT/CC)</label><input value={third} onChange={e => setThird(e.target.value)} placeholder="Todos" className={cn(INPUT, 'py-1.5 text-xs w-32')} /></div>
      </RangeBar>
      {data && (
        <div className="bg-card rounded-xl border border-border shadow-card p-4 space-y-3">
          <Head title={`Libro auxiliar · ${data.code} ${data.name}`} subtitle={`Del ${fmtDate(from)} al ${fmtDate(to)}${third ? ` · tercero ${third}` : ''}`} onExport={exportXlsx} />
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead><tr className="text-muted-foreground bg-muted/30"><th className="px-2 py-1.5 text-left font-semibold">Fecha</th><th className="px-2 py-1.5 text-left font-semibold">Comprobante</th><th className="px-2 py-1.5 text-left font-semibold">Descripción</th><th className="px-2 py-1.5 text-left font-semibold">Tercero</th><th className="px-2 py-1.5 text-right font-semibold">Débito</th><th className="px-2 py-1.5 text-right font-semibold">Crédito</th><th className="px-2 py-1.5 text-right font-semibold">Saldo</th></tr></thead>
              <tbody>
                <tr className="border-t border-border bg-brand-card/40 font-semibold"><td colSpan={6} className="px-2 py-1.5">Saldo inicial</td><td className="px-2 py-1.5 text-right">{money(data.opening)}</td></tr>
                {data.rows.map((r: any, i: number) => (
                  <tr key={i} className="border-t border-border"><td className="px-2 py-1 whitespace-nowrap">{fmtDate(r.date)}</td><td className="px-2 py-1 font-mono whitespace-nowrap">{r.number}{code.length < r.code.length ? <span className="text-muted-foreground"> · {r.code}</span> : ''}</td><td className="px-2 py-1">{r.entryDescription}{r.description ? <span className="text-muted-foreground"> · {r.description}</span> : ''}</td><td className="px-2 py-1">{r.thirdName || ''}</td><td className="px-2 py-1 text-right">{r.debit ? formatPrice(r.debit) : ''}</td><td className="px-2 py-1 text-right">{r.credit ? formatPrice(r.credit) : ''}</td><td className="px-2 py-1 text-right font-semibold">{money(r.balance)}</td></tr>
                ))}
                {data.rows.length === 0 && <tr><td colSpan={7} className="px-2 py-3 text-center text-muted-foreground">Sin movimientos en el período.</td></tr>}
              </tbody>
              <tfoot><tr className="border-t-2 border-brand-primary/30 font-bold bg-brand-card"><td colSpan={4} className="px-2 py-1.5">Totales y saldo final</td><td className="px-2 py-1.5 text-right">{formatPrice(data.debits)}</td><td className="px-2 py-1.5 text-right">{formatPrice(data.credits)}</td><td className="px-2 py-1.5 text-right">{money(data.closing)}</td></tr></tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

/* ---------- Terceros (información exógena) ---------- */
const ThirdPartiesView = () => {
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(getColombiaTodayStr());
  const [data, setData] = useState<any>(null);
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  useEffect(() => { api.getThirdParties(from, to).then(setData).catch(() => setData(null)); }, [from, to]);
  const sup = useMemo(() => (data?.suppliers || []).filter((s: any) => !onlyIncomplete || !s.complete), [data, onlyIncomplete]);
  const cus = useMemo(() => (data?.customers || []).filter((c: any) => !onlyIncomplete || !c.complete), [data, onlyIncomplete]);
  const exportXlsx = () => data && downloadXlsx(`terceros_exogena_${from}_${to}`, [
    { name: 'Proveedores', headers: ['Tipo doc', 'NIT / CC', 'DV', 'Razón social / Nombre', 'Tipo persona', 'Dirección', 'Ciudad', 'Departamento', 'País', 'Código postal', 'Teléfono', 'Correo', 'Actividad (CIIU)', 'Responsable IVA', 'Régimen', 'Compras', 'Base', 'IVA', 'Retención', 'Documentos', 'Datos completos'], rows: data.suppliers.map((s: any) => [s.docType, s.doc, s.dv, s.legalName || s.name, s.personType, s.address, s.city, s.state, s.country, s.postalCode, s.phone, s.email, s.ciiu, s.ivaResponsible ? 'Sí' : 'No', s.regime, s.purchases, s.base, s.iva, s.retention, s.docs, s.complete ? 'Sí' : 'No']), widths: [8, 14, 4, 36, 10, 30, 16, 16, 10, 10, 14, 26, 10, 10, 12, 14, 14, 12, 12, 8, 8] },
    { name: 'Clientes', headers: ['Tipo doc', 'Documento', 'DV', 'Nombre / Razón social', 'Tipo persona', 'Dirección', 'Ciudad', 'Departamento', 'Teléfono', 'Correo', 'Actividad (CIIU)', 'Responsable IVA', 'Ventas', 'Comprobantes', 'Datos completos'], rows: data.customers.map((c: any) => [c.docType, c.doc, c.dv, c.legalName || c.name, c.personType, c.address, c.city, c.state, c.phone, c.email, c.ciiu, c.ivaResponsible ? 'Sí' : 'No', c.sales, c.docs, c.complete ? 'Sí' : 'No']), widths: [8, 14, 4, 36, 10, 30, 16, 16, 14, 26, 10, 10, 14, 8, 8] },
    { name: 'Empleados', headers: ['Documento', 'Nombre', 'Cargo', 'Teléfono', 'Correo', 'Nómina pagada', 'Deducciones legales', 'Liquidaciones'], rows: data.employees.map((e: any) => [e.doc, e.name, e.position, e.phone, e.email, e.payroll, e.legalDeductions, e.settlements]), widths: [14, 30, 16, 14, 26, 16, 16, 10] },
  ]);
  const Flag = ({ ok }: { ok: boolean }) => ok ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">Completo</span> : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">Faltan datos</span>;
  return (
    <div className="space-y-3">
      <RangeBar from={from} to={to} setFrom={setFrom} setTo={setTo}>
        <label className="flex items-center gap-1.5 text-xs pb-2"><input type="checkbox" checked={onlyIncomplete} onChange={e => setOnlyIncomplete(e.target.checked)} /> Solo terceros con datos incompletos</label>
      </RangeBar>
      {data && (
        <div className="bg-card rounded-xl border border-border shadow-card p-4 space-y-4">
          <Head title="Terceros · información exógena" subtitle={`Del ${fmtDate(from)} al ${fmtDate(to)} · proveedores, clientes y empleados con datos del RUT`} onExport={exportXlsx} />
          <div>
            <p className="text-xs font-bold text-brand-dark mb-1">Proveedores ({sup.length})</p>
            <div className="overflow-x-auto"><table className="w-full text-[11px]">
              <thead><tr className="text-muted-foreground bg-muted/30"><th className="px-2 py-1.5 text-left font-semibold">NIT / CC</th><th className="px-2 py-1.5 text-left font-semibold">Razón social</th><th className="px-2 py-1.5 text-left font-semibold">Ciudad</th><th className="px-2 py-1.5 text-left font-semibold">Correo</th><th className="px-2 py-1.5 text-left font-semibold">CIIU</th><th className="px-2 py-1.5 text-right font-semibold">Compras</th><th className="px-2 py-1.5 text-right font-semibold">IVA</th><th className="px-2 py-1.5 text-right font-semibold">Retención</th><th className="px-2 py-1.5 font-semibold">RUT</th></tr></thead>
              <tbody>{sup.map((s: any) => <tr key={s.id} className="border-t border-border"><td className="px-2 py-1 font-mono whitespace-nowrap">{s.doc}{s.dv ? `-${s.dv}` : ''}</td><td className="px-2 py-1">{s.legalName || s.name}</td><td className="px-2 py-1">{s.city}</td><td className="px-2 py-1">{s.email}</td><td className="px-2 py-1">{s.ciiu}</td><td className="px-2 py-1 text-right">{formatPrice(s.purchases)}</td><td className="px-2 py-1 text-right">{formatPrice(s.iva)}</td><td className="px-2 py-1 text-right">{formatPrice(s.retention)}</td><td className="px-2 py-1 text-center"><Flag ok={s.complete} /></td></tr>)}
                {sup.length === 0 && <tr><td colSpan={9} className="px-2 py-3 text-center text-muted-foreground">Sin proveedores.</td></tr>}</tbody>
            </table></div>
          </div>
          <div>
            <p className="text-xs font-bold text-brand-dark mb-1">Clientes identificados ({cus.length})</p>
            <div className="overflow-x-auto"><table className="w-full text-[11px]">
              <thead><tr className="text-muted-foreground bg-muted/30"><th className="px-2 py-1.5 text-left font-semibold">Documento</th><th className="px-2 py-1.5 text-left font-semibold">Nombre</th><th className="px-2 py-1.5 text-left font-semibold">Ciudad</th><th className="px-2 py-1.5 text-left font-semibold">Teléfono</th><th className="px-2 py-1.5 text-left font-semibold">Correo</th><th className="px-2 py-1.5 text-right font-semibold">Ventas</th><th className="px-2 py-1.5 text-right font-semibold">Comprobantes</th><th className="px-2 py-1.5 font-semibold">RUT</th></tr></thead>
              <tbody>{cus.map((c: any) => <tr key={c.id} className="border-t border-border"><td className="px-2 py-1 font-mono whitespace-nowrap">{c.doc}</td><td className="px-2 py-1">{c.legalName || c.name}</td><td className="px-2 py-1">{c.city}</td><td className="px-2 py-1">{c.phone}</td><td className="px-2 py-1">{c.email}</td><td className="px-2 py-1 text-right">{formatPrice(c.sales)}</td><td className="px-2 py-1 text-right">{c.docs}</td><td className="px-2 py-1 text-center"><Flag ok={c.complete} /></td></tr>)}
                {cus.length === 0 && <tr><td colSpan={8} className="px-2 py-3 text-center text-muted-foreground">Sin clientes identificados.</td></tr>}</tbody>
            </table></div>
          </div>
          <div>
            <p className="text-xs font-bold text-brand-dark mb-1">Empleados ({data.employees.length})</p>
            <div className="overflow-x-auto"><table className="w-full text-[11px]">
              <thead><tr className="text-muted-foreground bg-muted/30"><th className="px-2 py-1.5 text-left font-semibold">Documento</th><th className="px-2 py-1.5 text-left font-semibold">Nombre</th><th className="px-2 py-1.5 text-left font-semibold">Cargo</th><th className="px-2 py-1.5 text-right font-semibold">Nómina pagada</th><th className="px-2 py-1.5 text-right font-semibold">Salud y pensión</th><th className="px-2 py-1.5 text-right font-semibold">Liquidaciones</th></tr></thead>
              <tbody>{data.employees.map((e: any) => <tr key={e.id} className="border-t border-border"><td className="px-2 py-1 font-mono">{e.doc}</td><td className="px-2 py-1">{e.name}</td><td className="px-2 py-1">{e.position}</td><td className="px-2 py-1 text-right">{formatPrice(e.payroll)}</td><td className="px-2 py-1 text-right">{formatPrice(e.legalDeductions)}</td><td className="px-2 py-1 text-right">{e.settlements}</td></tr>)}
                {data.employees.length === 0 && <tr><td colSpan={6} className="px-2 py-3 text-center text-muted-foreground">Sin empleados.</td></tr>}</tbody>
            </table></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LedgerReportsTab;
