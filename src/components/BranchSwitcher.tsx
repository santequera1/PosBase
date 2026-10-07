import { useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';

/**
 * Selector de sede en el encabezado (solo aparece si hay más de una sede activa).
 * Al cambiar, la caja, las mesas, la cocina y las ventas pasan a ser las de esa sede.
 */
export const BranchSwitcher = ({ compact }: { compact?: boolean }) => {
  const branches = useStore(s => s.branches);
  const branchId = useStore(s => s.branchId);
  const setBranch = useStore(s => s.setBranch);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  if (branches.length < 2) return null;
  const cur = branches.find(b => b.id === branchId) || branches[0];
  const choose = async (id: number) => {
    setOpen(false);
    if (id === branchId) return;
    await setBranch(id);
    toast.success(`Ahora estás en ${branches.find(b => b.id === id)?.name}`);
  };
  return (
    <div className="relative" ref={ref} data-branch-switcher>
      <button onClick={() => setOpen(o => !o)} className={cn('flex items-center gap-1.5 rounded-xl border border-brand-primary/20 bg-brand-card text-brand-dark font-semibold hover:bg-brand-card-2', compact ? 'px-2 py-1.5 text-xs' : 'px-3 py-1.5 text-sm')} title="Cambiar de sede" data-branch-current={cur?.id}>
        <Building2 size={compact ? 14 : 16} className="text-brand-primary shrink-0" />
        <span className="truncate max-w-[110px] sm:max-w-[160px]">{cur?.name}</span>
        <ChevronDown size={14} className={cn('shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-60 bg-white border border-border rounded-2xl shadow-elevated z-50 p-1" data-branch-menu>
          <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Sede activa</p>
          {branches.map(b => (
            <button key={b.id} onClick={() => choose(b.id)} data-branch-option={b.id} className={cn('w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-left hover:bg-brand-card', b.id === branchId && 'font-bold text-brand-dark')}>
              <span className="w-4">{b.id === branchId && <Check size={14} className="text-brand-primary" />}</span>
              <span className="flex-1 truncate">{b.name}</span>
            </button>
          ))}
          <p className="px-3 py-1.5 text-[10px] text-muted-foreground">Cada sede tiene su caja, mesas, cocina e impresoras. El menú es compartido.</p>
        </div>
      )}
    </div>
  );
};

export default BranchSwitcher;
