import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, Check, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FONT_CATALOG, FONT_CATEGORY_LABEL, loadAllCatalogFonts, loadGoogleFont, type CustomFont, type FontOption } from '@/lib/theme';

interface Props {
  label: string;
  value: string;
  onChange: (family: string) => void;
  customFonts: CustomFont[];
  sample: string;
  size?: number;
}

/** Selector de fuente con búsqueda, agrupación y vista previa de cada familia en su propia tipografía. */
export const FontPicker = ({ label, value, onChange, customFonts, sample, size = 20 }: Props) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadGoogleFont(value); }, [value]);
  useEffect(() => {
    if (!open) return;
    loadAllCatalogFonts();
    setTimeout(() => inputRef.current?.focus(), 30);
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (f: string) => !q || f.toLowerCase().includes(q);
    const out: Array<{ title: string; icon?: any; fonts: Array<FontOption | CustomFont> }> = [];
    const custom = customFonts.filter(f => match(f.family));
    if (custom.length) out.push({ title: 'Fuentes propias (subidas)', icon: Upload, fonts: custom });
    const bundled = FONT_CATALOG.filter(f => f.source === 'bundled' && match(f.family));
    if (bundled.length) out.push({ title: 'Incluidas en el sistema', fonts: bundled });
    (['serif', 'sans', 'display', 'script'] as FontOption['category'][]).forEach(cat => {
      const list = FONT_CATALOG.filter(f => f.source === 'google' && f.category === cat && match(f.family));
      if (list.length) out.push({ title: FONT_CATEGORY_LABEL[cat], fonts: list });
    });
    return out;
  }, [query, customFonts]);

  const pick = (family: string) => { onChange(family); setOpen(false); setQuery(''); };
  const total = groups.reduce((a, g) => a + g.fonts.length, 0);

  return (
    <div className="space-y-1" ref={wrapRef}>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="relative">
        <button type="button" onClick={() => setOpen(o => !o)} title={`Elegir fuente: ${label}`}
          className={cn('w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border bg-card text-left text-sm transition-all', open ? 'border-brand-primary ring-2 ring-brand-primary/20' : 'border-input hover:border-brand-primary/40')}>
          <span className="truncate" style={{ fontFamily: `"${value}", system-ui, sans-serif`, fontSize: 16 }}>{value}</span>
          <ChevronDown size={15} className={cn('shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </button>

        {open && (
          <div className="absolute z-50 mt-1 w-full min-w-[260px] rounded-xl border border-border bg-card shadow-elevated overflow-hidden">
            <div className="p-2 border-b border-border bg-brand-card">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar fuente..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-input bg-card text-sm outline-none focus:ring-2 focus:ring-brand-primary/20" />
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {total === 0 && <p className="px-3 py-4 text-xs text-muted-foreground text-center">Ninguna fuente coincide con "{query}".</p>}
              {groups.map(g => (
                <div key={g.title}>
                  <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1">{g.icon && <g.icon size={10} />} {g.title}</p>
                  {g.fonts.map(f => {
                    const active = f.family === value;
                    return (
                      <button key={f.family} type="button" onClick={() => pick(f.family)}
                        className={cn('w-full flex items-center justify-between gap-3 px-3 py-1.5 text-left hover:bg-brand-button/10 transition-colors', active && 'bg-brand-button/10')}>
                        <span className="truncate text-brand-dark" style={{ fontFamily: `"${f.family}", system-ui, sans-serif`, fontSize: 17 }}>{f.family}</span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] text-muted-foreground" style={{ fontFamily: `"${f.family}", system-ui, sans-serif` }}>Aa Bb 123</span>
                          {active && <Check size={14} className="text-brand-primary" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="rounded-lg border border-border bg-card px-3 py-2 text-brand-dark truncate" style={{ fontFamily: `"${value}", system-ui, sans-serif`, fontSize: size }}>
        {sample}
      </div>
    </div>
  );
};

export default FontPicker;
