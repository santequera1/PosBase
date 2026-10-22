import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/** Horario de un día: abre/cierra en "HH:MM" (24 h) o cerrado. */
export interface DayHours { open: string; close: string; closed: boolean }
export type WeekSchedule = DayHours[]; // 0 = lunes … 6 = domingo

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
type Mode = 'same' | 'weekWeekend' | 'weekSatSun' | 'daily';
const GROUPS: Record<Mode, Array<{ label: string; days: number[] }>> = {
  same: [{ label: 'Todos los días', days: [0, 1, 2, 3, 4, 5, 6] }],
  weekWeekend: [{ label: 'Lunes a viernes', days: [0, 1, 2, 3, 4] }, { label: 'Sábado y domingo', days: [5, 6] }],
  weekSatSun: [{ label: 'Lunes a viernes', days: [0, 1, 2, 3, 4] }, { label: 'Sábado', days: [5] }, { label: 'Domingo', days: [6] }],
  daily: DAYS.map((d, i) => ({ label: d, days: [i] })),
};
const MODE_LABEL: Record<Mode, string> = { same: 'Igual todos los días', weekWeekend: 'Lun–Vie y fin de semana', weekSatSun: 'Lun–Vie, sábado y domingo', daily: 'Cada día distinto' };

export const DEFAULT_SCHEDULE: WeekSchedule = DAYS.map(() => ({ open: '17:00', close: '22:00', closed: false }));

/** Lo guardado: la lista de 7 días, o { days, holidays } cuando los festivos van con el horario del domingo. */
export function parseHolidays(raw: unknown): boolean {
  try { const v: any = typeof raw === 'string' ? JSON.parse(raw) : raw; return !!(v && !Array.isArray(v) && v.holidays); } catch { return false; }
}
export function parseSchedule(raw: unknown): WeekSchedule | null {
  try {
    let v: any = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (v && !Array.isArray(v) && Array.isArray(v.days)) v = v.days;
    if (Array.isArray(v) && v.length === 7) return v.map((d: any) => ({ open: String(d?.open || '17:00'), close: String(d?.close || '22:00'), closed: !!d?.closed }));
  } catch { /* texto viejo */ }
  return null;
}

/** "17:30" → "5:30 p.m."; "12:00" → "12 m." */
function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  if (!Number.isFinite(h)) return t;
  if (h === 12 && !m) return '12 m.';
  const ampm = h < 12 || h === 24 ? 'a.m.' : 'p.m.';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? ':' + String(m).padStart(2, '0') : ''} ${ampm}`;
}
const dayText = (d: DayHours) => (d.closed ? 'cerrado' : `${fmtTime(d.open)} – ${fmtTime(d.close)}`);

/** Texto para los recibos: agrupa los días seguidos con el mismo horario ("Lun a Vie 5 p.m. – 10 p.m. · Sáb y Dom …"). */
/** holidays: los festivos se atienden con el horario del domingo ("Sáb, Dom y festivos …"). */
export function scheduleText(s: WeekSchedule, holidays = false): string {
  const parts: string[] = [];
  let i = 0;
  while (i < 7) {
    let j = i;
    while (j + 1 < 7 && dayText(s[j + 1]) === dayText(s[i])) j++;
    let days = i === j ? SHORT[i] : j === i + 1 ? `${SHORT[i]} y ${SHORT[j]}` : `${SHORT[i]} a ${SHORT[j]}`;
    if (holidays && j === 6) days = i === j ? `${days} y festivos` : j === i + 1 ? `${SHORT[i]}, ${SHORT[j]} y festivos` : `${days} y festivos`;
    parts.push(i === 0 && j === 6 ? `Todos los días${holidays ? ' (también festivos)' : ''} ${dayText(s[i])}` : `${days} ${dayText(s[i])}`);
    i = j + 1;
  }
  // Los días cerrados se nombran al final en una sola frase
  const open = parts.filter(p => !p.endsWith('cerrado'));
  const closed = parts.filter(p => p.endsWith('cerrado')).map(p => p.replace(/ cerrado$/, ''));
  return [...open, closed.length ? `${closed.join(', ')}: cerrado` : ''].filter(Boolean).join(' · ');
}

function guessMode(s: WeekSchedule): Mode {
  const eq = (a: number[]) => a.every(i => dayText(s[i]) === dayText(s[a[0]]));
  if (eq([0, 1, 2, 3, 4, 5, 6])) return 'same';
  if (eq([0, 1, 2, 3, 4]) && eq([5, 6])) return 'weekWeekend';
  if (eq([0, 1, 2, 3, 4])) return 'weekSatSun';
  return 'daily';
}

/**
 * Editor del horario de atención: atajos (igual todos los días, Lun–Vie + fin de semana, Lun–Vie + sábado + domingo,
 * cada día) y horas por grupo. Devuelve el horario por día y el texto que sale en los recibos.
 */
export const BusinessHoursEditor = ({ value, holidays = false, legacyText, onChange }: {
  value: WeekSchedule | null; holidays?: boolean; legacyText?: string; onChange: (schedule: WeekSchedule, text: string, holidays: boolean) => void;
}) => {
  const schedule = value || DEFAULT_SCHEDULE;
  const [mode, setMode] = useState<Mode>(() => (value ? guessMode(value) : 'weekWeekend'));
  const text = useMemo(() => scheduleText(schedule, holidays), [schedule, holidays]);
  // El horario guardado llega después de montar: el atajo se deduce la primera vez que aparece
  const guessed = useRef(!!value);
  useEffect(() => { if (value && !guessed.current) { guessed.current = true; setMode(guessMode(value)); } }, [value]);

  const setGroup = (days: number[], patch: Partial<DayHours>) => {
    guessed.current = true; // lo que edita la persona manda sobre la deducción
    const next = schedule.map((d, i) => (days.includes(i) ? { ...d, ...patch } : d));
    onChange(next, scheduleText(next, holidays), holidays);
  };
  // Al cambiar de atajo, cada grupo toma el horario de su primer día
  const changeMode = (m: Mode) => {
    guessed.current = true;
    setMode(m);
    const next = [...schedule];
    for (const g of GROUPS[m]) for (const i of g.days) next[i] = { ...schedule[g.days[0]] };
    onChange(next, scheduleText(next, holidays), holidays);
  };
  const INPUT = 'px-2 py-1.5 rounded-lg border border-input bg-card text-sm outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-40';

  return (
    <div className="space-y-2" data-hours-editor>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(GROUPS) as Mode[]).map(m => (
          <button key={m} type="button" onClick={() => changeMode(m)} data-hours-mode={m}
            className={cn('px-2.5 py-1 rounded-full border text-[11px] font-semibold', mode === m ? 'bg-brand-button text-brand-on-button border-transparent' : 'border-border text-brand-dark hover:bg-brand-card')}>
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>
      <div className="rounded-lg border border-border divide-y divide-border">
        {GROUPS[mode].map(g => {
          const d = schedule[g.days[0]];
          return (
            <div key={g.label} className="flex flex-wrap items-center gap-2 px-3 py-2" data-hours-row={g.label}>
              <span className="text-xs font-semibold text-brand-dark w-32 shrink-0">{g.label}</span>
              <input type="time" value={d.open} disabled={d.closed} onChange={e => setGroup(g.days, { open: e.target.value })} className={INPUT} aria-label={`${g.label}: abre`} />
              <span className="text-xs text-muted-foreground">a</span>
              <input type="time" value={d.close} disabled={d.closed} onChange={e => setGroup(g.days, { close: e.target.value })} className={INPUT} aria-label={`${g.label}: cierra`} />
              <label className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={d.closed} onChange={e => setGroup(g.days, { closed: e.target.checked })} /> Cerrado
              </label>
            </div>
          );
        })}
      </div>
      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
        <input type="checkbox" checked={holidays} onChange={e => onChange(schedule, scheduleText(schedule, e.target.checked), e.target.checked)} data-hours-holidays /> Los festivos se atienden con el horario del domingo
      </label>
      <p className="text-[11px] text-muted-foreground">
        En el recibo sale: <span className="font-semibold text-brand-dark" data-hours-text>{value ? text : (legacyText || 'sin horario')}</span>
      </p>
    </div>
  );
};

export default BusinessHoursEditor;
