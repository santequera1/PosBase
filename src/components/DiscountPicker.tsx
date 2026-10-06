import { useMemo, useState } from 'react';
import { BadgePercent, X } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { allStaff } from '@/lib/restaurant';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface DiscountSel { discountId: number; name: string; amount: number; employeeId?: number; employeeName?: string; value?: number }
type Item = { productId: number; price: number; quantity: number };

/** Mismo cálculo que el servidor: % o valor fijo sobre la cuenta (o sin bebidas). */
export function catalogAmount(d: { kind: string; value: number | null; applyTo: string }, items: Item[], products: Array<{ id: number; categoryId: number }>, excludedCats: number[], freeValue?: number) {
  const excluded = new Set(d.applyTo === 'no_drinks' ? excludedCats.map(Number) : []);
  const catOf = new Map(products.map(p => [p.id, p.categoryId]));
  let base = 0;
  for (const it of items) { const c = catOf.get(it.productId); if (c !== undefined && excluded.has(Number(c))) continue; base += Math.round((Number(it.price) || 0) * (Number(it.quantity) || 0)); }
  const v = d.value !== null ? d.value : Number(freeValue) || 0;
  return { base, amount: d.kind === 'percent' ? Math.round((base * Math.min(100, v)) / 100) : Math.min(base, Math.round(v)) };
}

/**
 * Descuentos del catálogo (Configuración en Caja → Descuentos): Empleados 50 % sin bebidas, Clientes, Pago en efectivo...
 * Si el descuento pide trabajador o tiene importe libre, se piden antes de aplicarlo.
 */
export const DiscountPicker = ({ items, value, onChange }: { items: Item[]; value: DiscountSel | null; onChange: (v: DiscountSel | null) => void }) => {
  const restaurant = useStore(s => s.restaurant);
  const products = useStore(s => s.products);
  const catalog = (restaurant?.discounts || []).filter(d => d.active);
  const staff = allStaff(restaurant);
  const [pending, setPending] = useState<any>(null);
  const [emp, setEmp] = useState(0);
  const [free, setFree] = useState('');
  const excluded = restaurant?.staffDiscountExcluded || [];
  const pendCalc = useMemo(() => (pending ? catalogAmount(pending, items, products, excluded, Number(free)) : null), [pending, items, products, excluded, free]);
  if (!catalog.length) return null;
  const apply = (d: any, employeeId?: number, freeValue?: number) => {
    const c = catalogAmount(d, items, products, excluded, freeValue);
    onChange({ discountId: d.id, name: d.value === null ? `${d.name} ${d.kind === 'percent' ? freeValue + '%' : formatPrice(freeValue || 0)}` : d.name, amount: c.amount, employeeId, employeeName: staff.find(s => s.id === employeeId)?.name, value: freeValue });
    setPending(null); setEmp(0); setFree('');
  };
  const choose = (d: any) => { if (d.requiresEmployee || d.value === null) { setPending(d); setEmp(0); setFree(''); } else apply(d); };
  if (value) {
    return (
      <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-2.5 text-xs" data-discount-applied>
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-emerald-800 flex items-center gap-1.5"><BadgePercent size={14} /> {value.name}{value.employeeName ? `: ${value.employeeName}` : ''}</span>
          <button type="button" onClick={() => onChange(null)} className="p-1 rounded-lg hover:bg-emerald-100 text-emerald-800" title="Quitar descuento"><X size={14} /></button>
        </div>
        <p className="text-emerald-800 mt-0.5">− {formatPrice(value.amount)}</p>
      </div>
    );
  }
  return (
    <div className="space-y-1.5" data-discount-picker>
      <div className="flex flex-wrap gap-1.5">
        {catalog.map(d => (
          <button key={d.id} type="button" onClick={() => choose(d)} data-discount-chip={d.name}
            className={cn('px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1', pending?.id === d.id ? 'bg-brand-button text-brand-on-button border-brand-primary' : 'bg-emerald-50 text-emerald-800 border-emerald-300 border-dashed hover:bg-emerald-100')}>
            <BadgePercent size={12} /> {d.name}{d.value !== null ? ` ${d.kind === 'percent' ? d.value + '%' : formatPrice(d.value)}` : ''}{d.applyTo === 'no_drinks' ? ' (sin bebidas)' : ''}
          </button>
        ))}
      </div>
      {pending && (
        <div className="rounded-xl border border-border p-2.5 space-y-1.5 bg-white">
          {pending.requiresEmployee && (
            <select autoFocus value={emp} onChange={e => setEmp(Number(e.target.value))} className="w-full px-2 py-2 rounded-lg border border-input text-xs" data-staff-select>
              <option value={0}>¿A qué trabajador?</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.name}{s.position ? ` · ${s.position}` : ''}</option>)}
            </select>
          )}
          {pending.value === null && <input type="number" min={0} value={free} onChange={e => setFree(e.target.value)} placeholder={pending.kind === 'percent' ? 'Porcentaje (ej. 15)' : 'Valor en pesos'} className="w-full px-2 py-2 rounded-lg border border-input text-xs font-mono" data-discount-free />}
          <p className="text-[11px] text-muted-foreground">Descuento: − {formatPrice(pendCalc?.amount || 0)}{pending.applyTo === 'no_drinks' ? ` (sobre ${formatPrice(pendCalc?.base || 0)}, sin bebidas)` : ''}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPending(null)} className="flex-1 py-1.5 rounded-lg border border-border text-xs font-semibold">Cancelar</button>
            <button type="button" onClick={() => apply(pending, emp || undefined, pending.value === null ? Number(free) : undefined)} disabled={(pending.requiresEmployee && !emp) || (pending.value === null && !(Number(free) > 0))} className="flex-1 py-1.5 rounded-lg bg-brand-button text-brand-on-button text-xs font-bold disabled:opacity-40" data-discount-apply>Aplicar</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DiscountPicker;
