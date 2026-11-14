/** Personal → Festivos: calendario del año y, por festivo, quién trabajó y a quién ya se le sumó el recargo (en grupo). */
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Info } from 'lucide-react';
import { api } from '@/lib/api';
import { formatPrice, getColombiaTodayStr } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Chip, fmtDate } from '@/components/common/Primitives';
import { HolidayCalendar, longDate, weekday, daysUntil, type DayMark } from './HolidayCalendar';

export const HolidaysTab = () => {
  const today = getColombiaTodayStr();
  const thisYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const [data, setData] = useState<any>(null);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState('');
  const [day, setDay] = useState<any>(null);
  const [checked, setChecked] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; err?: string; skipped?: any[] }>({});

  const loadYear = (y: number) => api.getHolidays(y).then(d => { setData(d); return d; }).catch(e => { setMsg({ err: e.message }); return null; });
  useEffect(() => {
    loadYear(year).then(d => {
      if (!d || (selected && selected.startsWith(String(year)))) return;
      // Por defecto: el último festivo que ya pasó (este año) o el próximo
      const past = d.holidays.filter((h: any) => h.past);
      const pick = (year === thisYear && past[past.length - 1]) || d.holidays.find((h: any) => !h.past) || d.holidays[0];
      if (pick) { setSelected(pick.date); setMonth(pick.date.slice(0, 7)); }
    });
  }, [year]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadDay = (date: string) => api.getHolidayDay(date).then(setDay).catch(e => setMsg({ err: e.message }));
  useEffect(() => { if (!selected) return; setDay(null); setChecked([]); setMsg({}); loadDay(selected); }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const holidays: any[] = data?.holidays || [];
  const names = useMemo(() => Object.fromEntries(holidays.map(h => [h.date, h.name])), [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const marks = useMemo(() => Object.fromEntries(holidays.map(h => [h.date, h.paidCount ? { tone: 'paid', title: `${h.paidCount} con recargo` } : h.past && !h.beforeSystem ? { tone: 'missing', title: 'Nadie tiene el recargo registrado' } : undefined])) as Record<string, DayMark | undefined>, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const hhmm = (v?: string | null) => (!v ? '' : v.length > 8 ? v.slice(11, 16) : v.slice(0, 5));
  const changeMonth = (m: string) => { setMonth(m); const y = Number(m.slice(0, 4)); if (y !== year) setYear(y); };
  const pickHoliday = (date: string) => { setSelected(date); setMonth(date.slice(0, 7)); };

  const staff: any[] = day?.staff || [];
  const selectable = (s: any) => day?.past && !s.novelty && !s.autoPaid && s.suggested > 0 && s.active !== false;
  const toggle = (id: number) => setChecked(c => (c.includes(id) ? c.filter(x => x !== id) : [...c, id]));
  const pickAll = (filter: (s: any) => boolean) => setChecked(staff.filter(s => selectable(s) && filter(s)).map(s => s.employeeId));
  const totalChecked = staff.filter(s => checked.includes(s.employeeId)).reduce((a, s) => a + s.suggested, 0);
  const counts = { paid: staff.filter(s => s.novelty).length, auto: staff.filter(s => s.autoPaid).length, attended: staff.filter(s => s.attendance).length };

  const save = async () => {
    if (!checked.length || !selected) return;
    setSaving(true); setMsg({});
    try {
      const r = await api.markHolidayWorked(selected, checked);
      setDay((d: any) => ({ ...d, staff: r.staff }));
      setChecked([]);
      const later = r.created.filter((c: any) => c.periodSettled).length;
      setMsg({
        ok: r.created.length ? `Listo: se sumó el recargo del festivo a ${r.created.length} persona(s) por ${formatPrice(r.created.reduce((a: number, c: any) => a + c.amount, 0))}.${later ? ` ${later} ya tenía(n) hecha la liquidación de ese período: a esa(s) le(s) entra en la próxima.` : ' Sale en su liquidación de ese período.'}` : '',
        skipped: r.skipped,
      });
      loadYear(year);
    } catch (e: any) { setMsg({ err: e.message }); }
    setSaving(false);
  };

  return (
    <div className="space-y-4" data-holidays-tab>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-bold text-brand-dark flex items-center gap-1.5"><CalendarDays size={15} /> Festivos de Colombia</h3>
          <p className="text-[11px] text-muted-foreground">Toca un festivo para ver quién trabajó y sumarle el recargo de ley a varios a la vez. El recargo entra solo en la liquidación.</p>
        </div>
        <div className="flex gap-1.5">
          {[thisYear - 1, thisYear, thisYear + 1].map(y => <Chip key={y} active={year === y} onClick={() => { setYear(y); setSelected(''); setMonth(y === thisYear ? today.slice(0, 7) : `${y}-01`); }}>{y}</Chip>)}
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          <div className="bg-card rounded-2xl border border-border shadow-card p-3 sm:p-4">
            <HolidayCalendar month={month} onMonth={changeMonth} holidays={names} marks={marks} selected={selected} onSelect={pickHoliday} today={today} min={`${thisYear - 1}-01`} max={`${thisYear + 1}-12`} />
            <div className="flex flex-wrap gap-3 mt-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-100 border border-amber-300" /> Festivo</span>
              <span className="flex items-center gap-1"><span className="w-3.5 h-3.5 rounded-full bg-emerald-500 text-white text-[9px] leading-[14px] text-center font-bold">✓</span> Ya tiene recargos registrados</span>
              <span className="flex items-center gap-1"><span className="w-3.5 h-3.5 rounded-full bg-slate-300 text-slate-700 text-[9px] leading-[14px] text-center font-bold">–</span> Pasó y nadie tiene el recargo</span>
            </div>
          </div>

          {selected && (
            <div className="bg-card rounded-2xl border border-border shadow-card overflow-hidden" data-holiday-day={selected}>
              <div className="px-4 py-3 border-b border-border bg-amber-50">
                <p className="text-sm font-bold text-amber-900 first-letter:uppercase">{longDate(selected, true)}{names[selected] ? ` · ${names[selected]}` : ''}</p>
                <p className="text-[11px] text-amber-900/80">Recargo de ley: {day?.pct ?? '…'}% del valor del día. El día en sí ya está en el sueldo fijo, o se paga con los días trabajados.</p>
              </div>
              {!day ? <p className="p-4 text-xs text-muted-foreground">Cargando...</p> : (
                <>
                  {!day.past && <p className="px-4 pt-3 text-xs text-muted-foreground" data-holiday-future>Este festivo todavía no llega ({daysUntil(selected, today) === 1 ? 'mañana' : `en ${daysUntil(selected, today)} días`}). Desde ese día podrás marcar quién trabajó.</p>}
                  {day.past && (
                    <div className="px-4 pt-3 flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold" data-holiday-count-paid>{counts.paid} con recargo</span>
                      {counts.auto > 0 && <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 font-semibold">{counts.auto} por asistencia</span>}
                      <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold">{counts.attended} marcaron asistencia</span>
                      <span className="flex-1" />
                      <button onClick={() => pickAll(() => true)} className="text-brand-primary font-semibold underline" data-holiday-pick-all>Seleccionar todos los que faltan</button>
                      {staff.some(s => s.attendance && selectable(s)) && <button onClick={() => pickAll(s => Boolean(s.attendance))} className="text-brand-primary font-semibold underline">Solo los que marcaron asistencia</button>}
                    </div>
                  )}
                  <ul className="divide-y divide-border mt-2">
                    {staff.map(s => {
                      const can = selectable(s);
                      return (
                        <li key={s.employeeId} className={cn('px-4 py-2 flex items-start gap-3 text-xs', can && 'cursor-pointer hover:bg-muted/30')} onClick={() => can && toggle(s.employeeId)} data-holiday-emp={s.employeeId}>
                          <input type="checkbox" className="mt-0.5" checked={checked.includes(s.employeeId) || Boolean(s.novelty)} disabled={!can} onChange={() => toggle(s.employeeId)} onClick={e => e.stopPropagation()} />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-brand-dark">{s.name}{s.active === false ? ' (inactivo)' : ''}</p>
                            <p className="text-[11px] text-muted-foreground">{s.position || 'Sin cargo'} · {s.payModeLabel}{s.attendance ? ` · marcó asistencia ${hhmm(s.attendance.checkIn)}${s.attendance.checkOut ? '–' + hhmm(s.attendance.checkOut) : ''}` : ''}</p>
                            {!s.novelty && s.periodSettlement && day.past && <p className="text-[10px] text-amber-700">Su liquidación de ese período ya se hizo: el recargo le entraría en la próxima.</p>}
                          </div>
                          <div className="text-right shrink-0">
                            {s.novelty ? (
                              <p className="font-bold text-emerald-700" data-holiday-emp-ok>✓ {formatPrice(s.novelty.amount)}<span className="block text-[10px] font-semibold">{s.novelty.settlementId ? (s.novelty.settlementStatus === 'paid' ? 'pagado' : 'en su liquidación') : 'entra en la próxima liquidación'}</span></p>
                            ) : s.autoPaid ? (
                              <p className="text-[11px] font-semibold text-sky-700">Sale solo por<br />la asistencia</p>
                            ) : s.suggested > 0 ? (
                              <p className={cn('font-semibold', checked.includes(s.employeeId) ? 'text-brand-dark' : 'text-muted-foreground')}>{formatPrice(s.suggested)}</p>
                            ) : <p className="text-[10px] text-muted-foreground">Sin valor base<br />en su ficha</p>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {day.past && (
                    <div className="px-4 py-3 border-t border-border space-y-2">
                      {msg.ok && <p className="text-xs font-semibold text-emerald-800 bg-emerald-50 rounded-lg px-2.5 py-1.5 flex items-start gap-1.5" data-holiday-saved><CheckCircle2 size={14} className="shrink-0 mt-0.5" /> {msg.ok}</p>}
                      {msg.skipped?.length ? <p className="text-[11px] text-amber-800">No se sumó a: {msg.skipped.map((x: any) => `${x.name || '#' + x.employeeId} (${x.reason})`).join(' · ')}</p> : null}
                      <button onClick={save} disabled={!checked.length || saving} className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-40" data-holiday-save>
                        {saving ? 'Guardando...' : checked.length ? `Trabajaron: sumar el recargo a ${checked.length} (${formatPrice(totalChecked)})` : 'Marca quién trabajó ese día'}
                      </button>
                    </div>
                  )}
                </>
              )}
              {msg.err && <p className="px-4 pb-3 text-xs text-red-600">{msg.err}</p>}
            </div>
          )}
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-card overflow-hidden">
          <p className="px-4 py-2.5 border-b border-border bg-brand-card text-xs font-bold text-brand-dark">Festivos de {year} ({holidays.length})</p>
          <ul className="divide-y divide-border max-h-[640px] overflow-y-auto" data-holidays-list>
            {holidays.map(h => {
              const n = daysUntil(h.date, today);
              return (
                <li key={h.date}>
                  <button onClick={() => pickHoliday(h.date)} className={cn('w-full px-4 py-2 text-left text-xs flex items-start justify-between gap-2 hover:bg-muted/30', selected === h.date && 'bg-amber-50')} data-holiday-row={h.date}>
                    <span className="min-w-0"><b className="text-brand-dark capitalize">{weekday(h.date, true)} {fmtDate(h.date).slice(0, 5)}</b><span className="block text-[11px] text-muted-foreground truncate">{h.name}</span></span>
                    <span className="shrink-0 text-right text-[10px] font-semibold">
                      {h.past
                        ? (h.paidCount ? <span className="text-emerald-700">{h.paidCount} con recargo</span> : <span className="text-muted-foreground">{h.beforeSystem ? 'antes del sistema' : 'sin recargos'}</span>)
                        : <span className="text-brand-primary">{n === 0 ? 'hoy' : n === 1 ? 'mañana' : `en ${n} días`}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="px-4 py-2 border-t border-border text-[10px] text-muted-foreground flex items-start gap-1"><Info size={11} className="shrink-0 mt-0.5" /> Los festivos que caen en domingo o se corren al lunes (Ley Emiliani) ya están calculados.</p>
        </div>
      </div>
    </div>
  );
};
