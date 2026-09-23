import { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const INPUT = 'w-full px-3 py-2 rounded-lg border border-input bg-card text-sm font-sans outline-none focus:ring-2 focus:ring-primary/20';
export const LABEL = 'text-xs font-medium text-muted-foreground mb-1 block';

export const fmtDate = (d?: string | null) => {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
};

export const fmtTime = (d?: string | null) => (d ? d.slice(11, 16) : '—');

export const Modal = ({ title, onClose, children, wide }: { title: string; onClose: () => void; children: any; wide?: boolean }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className={cn('bg-white rounded-t-3xl sm:rounded-2xl w-full p-5 shadow-2xl space-y-3 max-h-[92vh] overflow-y-auto', wide ? 'max-w-2xl' : 'max-w-md')} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-sm text-brand-dark">{title}</h4>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
};

export const Chip = ({ active, onClick, children, className, disabled }: { active?: boolean; onClick?: () => void; children: any; className?: string; disabled?: boolean }) => (
  <button type="button" onClick={onClick} disabled={disabled}
    className={cn('px-3 py-1.5 rounded-full text-xs font-semibold border transition-all whitespace-nowrap disabled:opacity-40',
      active ? 'bg-brand-button text-brand-on-button border-brand-primary' : 'bg-white text-brand-dark border-border hover:bg-muted/40', className)}>
    {children}
  </button>
);

export const KpiCard = ({ label, value, sub, className }: { label: string; value: string; sub?: string; className?: string }) => (
  <div className={cn('bg-card rounded-xl border border-border p-3.5 shadow-card', className)}>
    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
    <p className="font-display font-bold text-lg leading-tight text-brand-dark">{value}</p>
    {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
  </div>
);

/** Rango de fechas con atajos de quincena y mes (usado en asistencia, propinas y liquidaciones). */
export function periodPresets(todayStr: string) {
  const [y, m, d] = todayStr.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDay = (yy: number, mm: number) => new Date(yy, mm, 0).getDate();
  const prevM = m === 1 ? 12 : m - 1, prevY = m === 1 ? y - 1 : y;
  const thisFortnight = d <= 15
    ? { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-15` }
    : { from: `${y}-${pad(m)}-16`, to: `${y}-${pad(m)}-${pad(lastDay(y, m))}` };
  const prevFortnight = d <= 15
    ? { from: `${prevY}-${pad(prevM)}-16`, to: `${prevY}-${pad(prevM)}-${pad(lastDay(prevY, prevM))}` }
    : { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-15` };
  return [
    { label: 'Esta quincena', ...thisFortnight },
    { label: 'Quincena anterior', ...prevFortnight },
    { label: 'Este mes', from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDay(y, m))}` },
    { label: 'Mes anterior', from: `${prevY}-${pad(prevM)}-01`, to: `${prevY}-${pad(prevM)}-${pad(lastDay(prevY, prevM))}` },
  ];
}
