import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FilterOption { value: string; label: string; hint?: string; group?: string }

/**
 * Botón de filtro con lista desplegable de selección múltiple (con buscador cuando hay muchas opciones).
 * Vacío = "Todos". Se cierra al tocar fuera.
 */
export const FilterSelect = ({ label, options, value, onChange, icon: Icon, testId, single }: {
  label: string; options: FilterOption[]; value: string[]; onChange: (v: string[]) => void; icon?: any; testId?: string; single?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('touchstart', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close); };
  }, [open]);
  const shown = useMemo(() => { const s = q.trim().toLowerCase(); return s ? options.filter(o => o.label.toLowerCase().includes(s) || (o.group || '').toLowerCase().includes(s)) : options; }, [options, q]);
  const toggle = (v: string) => {
    if (single) { onChange(value[0] === v ? [] : [v]); setOpen(false); return; }
    onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
  };
  const selectedLabel = value.length === 0 ? 'Todos' : value.length === 1 ? (options.find(o => o.value === value[0])?.label || value[0]) : `${value.length} seleccionados`;
  let lastGroup = '';
  return (
    <div className="relative" ref={ref} data-filter={testId}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className={cn('flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 rounded-xl text-xs border transition-all whitespace-nowrap max-w-[230px]',
          value.length ? 'bg-brand-button text-brand-on-button border-brand-primary font-bold' : 'bg-white text-brand-dark border-border hover:bg-muted/40 font-semibold')}>
        {Icon && <Icon size={13} className="shrink-0" />}
        <span className="opacity-80">{label}:</span>
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown size={13} className={cn('shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute z-40 mt-1 left-0 w-[260px] max-w-[calc(100vw-32px)] bg-white rounded-xl border border-border shadow-xl p-1.5">
          {options.length > 7 && (
            <div className="relative mb-1">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar..." className="w-full pl-7 pr-2 py-1.5 rounded-lg text-xs bg-gray-50 border border-gray-200 outline-none focus:ring-1 focus:ring-brand-primary" />
            </div>
          )}
          <div className="max-h-[280px] overflow-y-auto">
            {shown.length === 0 && <p className="text-[11px] text-muted-foreground px-2 py-3 text-center">Sin opciones en este período.</p>}
            {shown.map(o => {
              const header = o.group && o.group !== lastGroup ? o.group : '';
              if (o.group) lastGroup = o.group;
              const on = value.includes(o.value);
              return (
                <div key={o.value}>
                  {header && <p className="px-2 pt-2 pb-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{header}</p>}
                  <button type="button" onClick={() => toggle(o.value)} className={cn('w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left hover:bg-muted/50', on && 'bg-brand-card font-semibold')}>
                    <span className={cn('w-4 h-4 rounded border flex items-center justify-center shrink-0', on ? 'bg-brand-button border-brand-primary text-brand-on-button' : 'border-gray-300 bg-white')}>{on && <Check size={11} />}</span>
                    <span className="flex-1 truncate">{o.label}</span>
                    {o.hint && <span className="text-[10px] text-muted-foreground">{o.hint}</span>}
                  </button>
                </div>
              );
            })}
          </div>
          {value.length > 0 && !single && (
            <button type="button" onClick={() => onChange([])} className="w-full mt-1 py-1.5 rounded-lg text-[11px] font-semibold text-red-600 hover:bg-red-50">Quitar este filtro</button>
          )}
        </div>
      )}
    </div>
  );
};

export default FilterSelect;
