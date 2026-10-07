import { useEffect, useState } from 'react';
import { Calendar, Filter, Download, Plus, X, HelpCircle, Eraser, Table2, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getColombiaTodayStr } from '@/lib/format';
import { NiceSelect } from '@/components/ui/nice-select';

export const SEL = 'px-2.5 py-1.5 rounded-lg border border-input bg-card text-sm outline-none focus:ring-2 focus:ring-primary/20';
export const INPUT = 'w-full px-3 py-2 rounded-lg border border-input bg-card text-sm outline-none focus:ring-2 focus:ring-primary/20';
export const LBL = 'text-[11px] font-semibold text-muted-foreground mb-1 block';

/** "2026-10-06 18:30:00" → "06/10/26 18:30" */
export const dt = (s?: string | null) => { if (!s) return '—'; const [d, t] = String(s).split(/[ T]/); const [y, m, dd] = d.split('-'); return `${dd}/${m}/${(y || '').slice(2)}${t ? ' ' + t.slice(0, 5) : ''}`; };

/** En celular (< 640 px) los filtros van en paneles a pantalla completa con "Aplicar". */
export function useIsMobile() {
  const q = '(max-width: 639px)';
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => { const mq = window.matchMedia(q); const on = () => setM(mq.matches); mq.addEventListener('change', on); return () => mq.removeEventListener('change', on); }, []);
  return m;
}

/* ---------------- Período (Diario · Mensual · Anual · Rango · Arqueo) + Fecha por + Turno ---------------- */
export interface Period { dateBy: 'start' | 'close'; turno: string; period: 'day' | 'month' | 'year' | 'custom' | 'shift'; date: string; from: string; fromTime: string; to: string; toTime: string; shiftId: string }
export const defaultPeriod = (): Period => { const t = getColombiaTodayStr(); return { dateBy: 'start', turno: '', period: 'day', date: t, from: t, fromTime: '00:00', to: t, toTime: '23:59', shiftId: '' }; };
export function periodParams(p: Period): Record<string, string> {
  const base: Record<string, string> = { dateBy: p.dateBy, turno: p.turno };
  if (p.period === 'shift' && p.shiftId) return { ...base, shiftId: p.shiftId };
  if (p.period === 'custom') return { ...base, period: 'custom', from: p.from, to: p.to, fromTime: p.fromTime, toTime: p.toTime };
  return { ...base, period: p.period === 'shift' ? 'day' : p.period, date: p.date };
}
const MONTHS = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'];

export const PeriodFields = ({ p, set, shifts, serviceShifts, showDateBy = true, stacked }: { p: Period; set: (x: Period) => void; shifts: any[]; serviceShifts: Array<{ name: string }>; showDateBy?: boolean; stacked?: boolean }) => {
  const [y, m, d] = p.date.split('-').map(Number);
  const setDate = (yy: number, mm: number, dd: number) => { const last = new Date(yy, mm, 0).getDate(); set({ ...p, date: `${yy}-${String(mm).padStart(2, '0')}-${String(Math.min(dd, last)).padStart(2, '0')}` }); };
  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);
  const W = stacked ? 'w-full' : '';
  return (
    <>
      {showDateBy && <div className={W}><label className={LBL}>Fecha por</label><NiceSelect value={p.dateBy} onChange={e => set({ ...p, dateBy: e.target.value as any })} className={cn(SEL, W)} data-date-by><option value="start">Hora inicio</option><option value="close">Hora cierre</option></NiceSelect></div>}
      {serviceShifts.length > 0 && <div className={W}><label className={LBL}>Turno</label><NiceSelect value={p.turno} onChange={e => set({ ...p, turno: e.target.value })} className={cn(SEL, W)} data-turno><option value="">(todos)</option>{serviceShifts.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}</NiceSelect></div>}
      <div className={W}><label className={LBL}>Período</label>
        <NiceSelect value={p.period} onChange={e => set({ ...p, period: e.target.value as any, shiftId: e.target.value === 'shift' ? (p.shiftId || String(shifts[0]?.id || '')) : p.shiftId })} className={cn(SEL, W)} data-period-select>
          <option value="day">Diario</option><option value="month">Mensual</option><option value="year">Anual</option><option value="custom">Rango</option><option value="shift">Arqueo</option>
        </NiceSelect></div>
      {p.period === 'day' && <div className={W}><label className={LBL}>Día</label><input type="date" value={p.date} onChange={e => e.target.value && set({ ...p, date: e.target.value })} className={cn(SEL, W)} data-period-date /></div>}
      {p.period === 'month' && (
        <div className={cn('flex gap-1.5', W)}>
          <div className="flex-1"><label className={LBL}>Mes</label><NiceSelect value={m} onChange={e => setDate(y, Number(e.target.value), d)} className={cn(SEL, 'w-full')}>{MONTHS.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}</NiceSelect></div>
          <div className="flex-1"><label className={LBL}>Año</label><NiceSelect value={y} onChange={e => setDate(Number(e.target.value), m, d)} className={cn(SEL, 'w-full')}>{years.map(v => <option key={v}>{v}</option>)}</NiceSelect></div>
        </div>
      )}
      {p.period === 'year' && <div className={W}><label className={LBL}>Año</label><NiceSelect value={y} onChange={e => setDate(Number(e.target.value), m, d)} className={cn(SEL, W)}>{years.map(v => <option key={v}>{v}</option>)}</NiceSelect></div>}
      {p.period === 'custom' && (
        <div className={cn('flex flex-wrap gap-1.5 items-end', W)}>
          <div><label className={LBL}>Desde</label><div className="flex gap-1"><input type="date" value={p.from} onChange={e => set({ ...p, from: e.target.value })} className={SEL} /><input type="time" value={p.fromTime} onChange={e => set({ ...p, fromTime: e.target.value })} className={SEL} /></div></div>
          <div><label className={LBL}>Hasta</label><div className="flex gap-1"><input type="date" value={p.to} onChange={e => set({ ...p, to: e.target.value })} className={SEL} /><input type="time" value={p.toTime} onChange={e => set({ ...p, toTime: e.target.value })} className={SEL} /></div></div>
        </div>
      )}
      {p.period === 'shift' && (
        <div className={W}><label className={LBL}>Arqueo de caja · Caja Principal</label>
          <NiceSelect value={p.shiftId} onChange={e => set({ ...p, shiftId: e.target.value })} className={cn(SEL, W)} data-period-shift>
            {shifts.map(s => <option key={s.id} value={s.id}>{dt(s.openedAt)} · {s.cashierName}{s.status === 'open' ? ' (abierto)' : ''}</option>)}
          </NiceSelect></div>
      )}
    </>
  );
};

/* ---------------- Filtros de atributos ---------------- */
export interface FilterField { key: string; label: string; options?: Array<[string, string]>; type?: 'select' | 'text'; placeholder?: string; list?: string[] }
const AttrFields = ({ fields, values, set, stacked }: { fields: FilterField[]; values: Record<string, string>; set: (v: Record<string, string>) => void; stacked?: boolean }) => (
  <>
    {fields.map(f => (
      <div key={f.key} className={stacked ? 'w-full' : ''}>
        <label className={LBL}>{f.label}</label>
        {f.type === 'text' ? (
          <>
            <input value={values[f.key] || ''} onChange={e => set({ ...values, [f.key]: e.target.value })} placeholder={f.placeholder} list={f.list ? `dl-${f.key}` : undefined} className={cn(SEL, stacked ? 'w-full' : 'w-40')} data-filter-field={f.key} />
            {f.list && <datalist id={`dl-${f.key}`}>{f.list.map(x => <option key={x} value={x} />)}</datalist>}
          </>
        ) : (
          <NiceSelect value={values[f.key] || ''} onChange={e => set({ ...values, [f.key]: e.target.value })} className={cn(SEL, stacked ? 'w-full' : 'max-w-[180px]')} data-filter-field={f.key}>
            <option value="">(todos)</option>
            {(f.options || []).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </NiceSelect>
        )}
      </div>
    ))}
  </>
);

/** Panel a pantalla completa (celular) con "Aplicar" y "Volver". */
export const MobileSheet = ({ title, onClose, onApply, children }: { title: string; onClose: () => void; onApply?: () => void; children: any }) => (
  <div className="fixed inset-0 z-[70] bg-background flex flex-col" data-mobile-sheet>
    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
      <p className="font-bold text-brand-dark">{title}</p>
      <button onClick={onClose} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center"><X size={16} /></button>
    </div>
    <div className="flex-1 overflow-y-auto p-4 space-y-3">{children}</div>
    {onApply && (
      <div className="p-3 border-t border-border bg-card grid grid-cols-2 gap-2">
        <button onClick={onClose} className="py-3 rounded-xl border border-border font-semibold">Volver</button>
        <button onClick={onApply} className="py-3 rounded-xl gradient-primary text-primary-foreground font-bold" data-sheet-apply>Aplicar</button>
      </div>
    )}
  </div>
);

/**
 * Barra de filtros estilo Fudo. Escritorio: fila de tiempo (▦) y fila de atributos (▼) que se aplican al instante.
 * Celular: botones Fechas · Filtros · Exportar · Nuevo que abren paneles a pantalla completa con "Aplicar".
 */
export const FilterBar = ({ period, setPeriod, shifts, serviceShifts, fields = [], values = {}, setValues, onExport, onNew, newLabel, rangeLabel, showDateBy = true, extraRight }: {
  period: Period; setPeriod: (p: Period) => void; shifts: any[]; serviceShifts: Array<{ name: string }>; fields?: FilterField[]; values?: Record<string, string>; setValues?: (v: Record<string, string>) => void;
  onExport?: () => void; onNew?: () => void; newLabel?: string; rangeLabel?: string; showDateBy?: boolean; extraRight?: any;
}) => {
  const mobile = useIsMobile();
  const [sheet, setSheet] = useState<null | 'dates' | 'filters'>(null);
  const [draftP, setDraftP] = useState(period);
  const [draftV, setDraftV] = useState(values);
  const active = Object.values(values).filter(Boolean).length;
  const clear = () => setValues && setValues(Object.fromEntries(Object.keys(values).map(k => [k, ''])));
  if (mobile) {
    return (
      <div className="space-y-1.5" data-filter-bar="mobile">
        <div className="flex gap-2">
          <button onClick={() => { setDraftP(period); setSheet('dates'); }} className="flex-1 py-2.5 rounded-xl bg-card border border-border text-sm font-semibold flex items-center justify-center gap-1.5" data-open-dates><Calendar size={16} /> Fechas</button>
          {fields.length > 0 && <button onClick={() => { setDraftV(values); setSheet('filters'); }} className={cn('flex-1 py-2.5 rounded-xl border text-sm font-semibold flex items-center justify-center gap-1.5', active ? 'bg-brand-button text-brand-on-button border-brand-primary' : 'bg-card border-border')} data-open-filters><Filter size={16} /> Filtros{active ? ` (${active})` : ''}</button>}
          {onExport && <button onClick={onExport} className="w-11 rounded-xl bg-card border border-border flex items-center justify-center" title="Exportar"><Download size={16} /></button>}
          {onNew && <button onClick={onNew} className="w-11 rounded-xl gradient-primary text-primary-foreground flex items-center justify-center" title={newLabel}><Plus size={18} /></button>}
        </div>
        {rangeLabel && <p className="text-[11px] text-muted-foreground italic px-1">{rangeLabel}</p>}
        {sheet === 'dates' && (
          <MobileSheet title="Filtros · Fechas" onClose={() => setSheet(null)} onApply={() => { setPeriod(draftP); setSheet(null); }}>
            <PeriodFields p={draftP} set={setDraftP} shifts={shifts} serviceShifts={serviceShifts} showDateBy={showDateBy} stacked />
          </MobileSheet>
        )}
        {sheet === 'filters' && setValues && (
          <MobileSheet title="Filtros" onClose={() => setSheet(null)} onApply={() => { setValues(draftV); setSheet(null); }}>
            <AttrFields fields={fields} values={draftV} set={setDraftV} stacked />
            <button onClick={() => setDraftV(Object.fromEntries(Object.keys(draftV).map(k => [k, ''])))} className="text-sm font-semibold text-red-600 flex items-center gap-1"><Eraser size={14} /> Limpiar filtros</button>
          </MobileSheet>
        )}
      </div>
    );
  }
  return (
    <div className="bg-card rounded-xl border border-border p-3 space-y-2" data-filter-bar="desktop">
      <div className="flex flex-wrap items-end gap-2">
        <Table2 size={16} className="text-muted-foreground mb-2" />
        <PeriodFields p={period} set={setPeriod} shifts={shifts} serviceShifts={serviceShifts} showDateBy={showDateBy} />
        <div className="flex-1" />
        {extraRight}
        {onExport && <button onClick={onExport} className="px-3 py-1.5 rounded-lg border border-brand-primary/30 text-sm font-semibold flex items-center gap-1.5" data-export><Download size={14} /> Exportar</button>}
        {onNew && <button onClick={onNew} className="px-3 py-1.5 rounded-lg gradient-primary text-primary-foreground text-sm font-bold flex items-center gap-1.5" data-new><Plus size={14} /> {newLabel}</button>}
      </div>
      {fields.length > 0 && setValues && (
        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-2">
          <Filter size={15} className="text-muted-foreground mb-2" />
          <AttrFields fields={fields} values={values} set={setValues} />
          {active > 0 && <button onClick={clear} title="Limpiar filtros" className="mb-0.5 p-2 rounded-lg border border-border text-red-600" data-clear><Eraser size={15} /></button>}
        </div>
      )}
      {rangeLabel && <p className="text-[11px] text-muted-foreground italic">{rangeLabel}</p>}
    </div>
  );
};

/* ---------------- KPIs con "?" ---------------- */
export const Help = ({ text }: { text: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block align-middle">
      <button type="button" onClick={e => { e.stopPropagation(); setOpen(o => !o); }} onBlur={() => setOpen(false)} className="text-muted-foreground hover:text-brand-primary" title={text}><HelpCircle size={12} /></button>
      {open && <span className="absolute z-30 left-1/2 -translate-x-1/2 top-5 w-56 p-2 rounded-lg bg-brand-surface text-brand-on-dark text-[11px] font-normal normal-case tracking-normal shadow-xl">{text}</span>}
    </span>
  );
};
export const Kpi = ({ label, value, sub, help, tone, testId }: { label: string; value: string; sub?: string; help?: string; tone?: string; testId?: string }) => (
  <div className={cn('px-4 py-3 border-b sm:border-b-0 sm:border-r border-border last:border-0 flex sm:block items-center justify-between gap-2 min-w-0', tone)} data-kpi={testId}>
    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">{label}{help && <Help text={help} />}</p>
    <div className="text-right sm:text-left">
      <p className="font-display font-bold text-lg sm:text-xl text-brand-dark leading-tight">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  </div>
);

/* ---------------- Maestro / detalle ---------------- */
export const DetailPane = ({ open, onClose, title, tone = 'orange', actions, children, empty }: { open: boolean; onClose?: () => void; title: string; tone?: 'orange' | 'yellow'; actions?: any; children: any; empty?: string }) => {
  const mobile = useIsMobile();
  if (!open) return mobile ? null : <div className="hidden lg:flex bg-card rounded-xl border border-dashed border-border min-h-[260px] items-center justify-center text-sm text-muted-foreground sticky top-3 text-center px-6">{empty || 'Selecciona un ítem del listado'}</div>;
  const body = (
    <div className={cn('bg-card border border-border overflow-hidden', mobile ? 'h-full flex flex-col' : 'rounded-xl sticky top-3 max-h-[calc(100vh-120px)] flex flex-col')} data-detail>
      <div className={cn('px-4 py-2.5 flex items-center justify-between gap-2 shrink-0', tone === 'orange' ? 'bg-orange-500 text-white' : 'bg-amber-300 text-amber-950')}>
        <p className="font-bold tracking-wide truncate">{title}</p>
        <div className="flex items-center gap-1">{actions}{onClose && <button onClick={onClose} className="w-8 h-8 rounded-lg bg-black/15 hover:bg-black/25 flex items-center justify-center" title="Cerrar" data-detail-close><X size={15} /></button>}</div>
      </div>
      <div className="overflow-y-auto flex-1">{children}</div>
    </div>
  );
  return mobile ? <div className="fixed inset-0 z-[65] bg-background">{body}</div> : body;
};
export const ActionBtn = ({ title, onClick, children, testId, disabled }: { title: string; onClick: () => void; children: any; testId?: string; disabled?: boolean }) => (
  <button onClick={onClick} title={title} disabled={disabled} data-action={testId} className="w-8 h-8 rounded-lg bg-black/15 hover:bg-black/25 flex items-center justify-center disabled:opacity-40">{children}</button>
);
export const Row = ({ k, v, strong }: { k: string; v: any; strong?: boolean }) => (
  <div className="flex justify-between gap-3 px-4 py-1.5 text-sm border-b border-border/60 last:border-0"><span className="text-muted-foreground">{k}</span><span className={cn('text-right', strong && 'font-bold text-brand-dark')}>{v ?? '—'}</span></div>
);
export const SectionTitle = ({ children }: { children: any }) => <p className="px-4 py-2 bg-muted/50 text-[11px] font-bold tracking-wide uppercase text-brand-dark">{children}</p>;

export const Empty = ({ title, text }: { title: string; text: string }) => (
  <div className="py-10 text-center text-muted-foreground">
    <div className="mx-auto w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-2"><ChevronDown size={22} className="opacity-40" /></div>
    <p className="font-semibold text-brand-dark text-sm">{title}</p><p className="text-xs">{text}</p>
  </div>
);

/** Paginación de 30 en 30 con "Mostrar más". */
export function usePaged<T>(rows: T[], resetKey: any, size = 30) {
  const [n, setN] = useState(size);
  useEffect(() => { setN(size); }, [resetKey, size]);
  return { shown: rows.slice(0, n), more: rows.length > n, showMore: () => setN(x => x + size), total: rows.length };
}
export const MoreButton = ({ more, onClick, shown, total }: { more: boolean; onClick: () => void; shown: number; total: number }) => (
  <div className="flex items-center justify-between px-3 py-2 border-t border-border text-[11px] text-muted-foreground">
    <span>{shown} de {total}</span>
    {more && <button onClick={onClick} className="px-3 py-1 rounded-lg border border-border bg-white font-semibold text-brand-dark" data-show-more>Mostrar más</button>}
  </div>
);

export const STATUS_STYLE: Record<string, { label: string; chip: string; bar: string }> = {
  delivered: { label: 'Cerrada', chip: 'bg-emerald-100 text-emerald-800', bar: 'border-l-emerald-500' },
  cancelled: { label: 'Eliminada', chip: 'bg-red-100 text-red-700', bar: 'border-l-red-500' },
  shipped: { label: 'Enviado', chip: 'bg-violet-100 text-violet-800', bar: 'border-l-violet-500' },
  billing: { label: 'Pagando', chip: 'bg-amber-100 text-amber-800', bar: 'border-l-amber-500' },
  ready: { label: 'A entregar', chip: 'bg-cyan-100 text-cyan-800', bar: 'border-l-cyan-500' },
  pending: { label: 'Pendiente', chip: 'bg-slate-200 text-slate-700', bar: 'border-l-slate-400' },
  open: { label: 'En curso', chip: 'bg-sky-100 text-sky-800', bar: 'border-l-sky-500' },
  preparing: { label: 'En curso', chip: 'bg-sky-100 text-sky-800', bar: 'border-l-sky-500' },
};
export const statusStyle = (s: string) => STATUS_STYLE[s] || STATUS_STYLE.open;
export const METHOD_OPTS: Array<[string, string]> = [['cash', 'Efectivo'], ['transfer', 'Transferencia bancaria'], ['card', 'Datáfono'], ['platform', 'Plataforma (Rappi/DiDi)'], ['credit', 'A crédito']];
export const METHOD_NAME: Record<string, string> = { cash: 'Efectivo', transfer: 'Transferencia', card: 'Datáfono', card_debit: 'Datáfono débito', card_credit: 'Datáfono crédito', platform: 'Plataforma', credit: 'A crédito', mixed: 'Mixto', payroll: 'Descuento de nómina' };
