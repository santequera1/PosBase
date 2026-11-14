/** Calendario de un mes con los festivos marcados (Personal → Festivos y Mi cuenta). */
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const WEEK = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/** "lunes", "martes"... de una fecha AAAA-MM-DD */
export const weekday = (date: string, short = false) => new Date(date + 'T12:00:00').toLocaleDateString('es-CO', { weekday: short ? 'short' : 'long' }).replace('.', '');
/** "lunes 2 de noviembre" */
export const longDate = (date: string, withYear = false) => `${weekday(date)} ${Number(date.slice(8, 10))} de ${MONTHS[Number(date.slice(5, 7)) - 1]}${withYear ? ` de ${date.slice(0, 4)}` : ''}`;
/** Días entre hoy y la fecha (positivo = falta) */
export const daysUntil = (date: string, today: string) => Math.round((Date.parse(date + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 86400000);

export type DayMark = { tone: 'paid' | 'pending' | 'auto' | 'missing' | 'info'; title?: string };
const MARK_CLASS: Record<DayMark['tone'], string> = {
  paid: 'bg-emerald-500 text-white',
  pending: 'bg-amber-500 text-white',
  auto: 'bg-sky-500 text-white',
  missing: 'bg-slate-300 text-slate-700',
  info: 'bg-brand-button text-brand-on-button',
};
const MARK_TEXT: Record<DayMark['tone'], string> = { paid: '✓', pending: '•', auto: '✓', missing: '–', info: '' };

const shiftMonth = (month: string, k: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + k, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

export function HolidayCalendar({ month, onMonth, holidays, marks = {}, selected, onSelect, today, min, max }: {
  month: string; onMonth: (m: string) => void; holidays: Record<string, string>; marks?: Record<string, DayMark | undefined>;
  selected?: string; onSelect?: (date: string) => void; today: string; min?: string; max?: string;
}) {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // la semana empieza el lunes
  const cells: Array<string | null> = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  while (cells.length % 7) cells.push(null);
  const prev = shiftMonth(month, -1), next = shiftMonth(month, 1);
  const canPrev = !min || prev >= min, canNext = !max || next <= max;
  return (
    <div className="space-y-2" data-holiday-calendar={month}>
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => canPrev && onMonth(prev)} disabled={!canPrev} className="w-8 h-8 rounded-lg border border-border bg-card flex items-center justify-center disabled:opacity-30" title="Mes anterior" data-cal-prev><ChevronLeft size={16} /></button>
        <p className="text-sm font-bold text-brand-dark capitalize">{MONTHS[m - 1]} {y}</p>
        <button onClick={() => canNext && onMonth(next)} disabled={!canNext} className="w-8 h-8 rounded-lg border border-border bg-card flex items-center justify-center disabled:opacity-30" title="Mes siguiente" data-cal-next><ChevronRight size={16} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEK.map((w, i) => <p key={i} className={cn('text-[10px] font-bold uppercase', i === 6 ? 'text-red-600/70' : 'text-muted-foreground')}>{w}</p>)}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const name = holidays[d];
          const mark = marks[d];
          const isSunday = i % 7 === 6;
          const clickable = Boolean(name && onSelect);
          return (
            <button key={d} type="button" disabled={!clickable} onClick={() => clickable && onSelect!(d)} title={name ? `Festivo: ${name}${mark?.title ? ' · ' + mark.title : ''}` : undefined}
              data-cal-day={d} data-cal-holiday={name ? d : undefined}
              className={cn('relative rounded-lg border min-h-[42px] sm:min-h-[54px] px-0.5 py-1 flex flex-col items-center justify-start text-xs transition-all',
                name ? 'bg-amber-100 border-amber-300 text-amber-900 font-bold hover:bg-amber-200' : 'bg-card border-border/60',
                !name && isSunday && 'text-red-600/80',
                d < today && !name && 'opacity-60',
                d === today && 'ring-2 ring-brand-primary',
                selected === d && 'ring-2 ring-amber-600 bg-amber-200',
                clickable ? 'cursor-pointer' : 'cursor-default')}>
              <span>{Number(d.slice(8, 10))}</span>
              {name && <span className="hidden sm:block text-[9px] leading-tight font-semibold line-clamp-2 px-0.5">{name}</span>}
              {mark && MARK_TEXT[mark.tone] && <span className={cn('absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] leading-4 font-bold shadow', MARK_CLASS[mark.tone])}>{MARK_TEXT[mark.tone]}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
