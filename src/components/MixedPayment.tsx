import { Plus, X } from 'lucide-react';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NiceSelect } from '@/components/ui/nice-select';
import { INPUT } from '@/components/common/Primitives';

export interface MixedLine { method: string; amount: string }
const OPTIONS: Array<[string, string]> = [['cash', 'Efectivo'], ['transfer', 'Transferencia / Nequi'], ['card', 'Datáfono'], ['platform', 'Plataforma']];

/** Valida las líneas del pago mixto: al menos dos medios con valor y que sumen el total. */
export function mixedState(lines: MixedLine[], due: number) {
  const valid = lines.filter(l => l.method && Number(l.amount) > 0);
  const sum = valid.reduce((a, l) => a + Math.round(Number(l.amount) || 0), 0);
  return { sum, rest: due - sum, ok: valid.length >= 2 && sum === due, parts: valid.map(l => ({ method: l.method, amount: Math.round(Number(l.amount)) })) };
}

/**
 * Pago con varios medios: tantas líneas como hagan falta (efectivo + Nequi + datáfono...).
 * La última línea se completa sola con lo que falta al escribir las anteriores.
 */
export const MixedPayment = ({ due, lines, setLines }: { due: number; lines: MixedLine[]; setLines: (l: MixedLine[]) => void }) => {
  const st = mixedState(lines, due);
  const update = (k: number, p: Partial<MixedLine>) => {
    const next = lines.map((l, i) => (i === k ? { ...l, ...p } : l));
    // Al escribir un valor, la última línea toma lo que falta (si no es la que se está editando)
    if (p.amount !== undefined && k < next.length - 1) {
      const before = next.slice(0, -1).reduce((a, l) => a + (Math.round(Number(l.amount)) || 0), 0);
      next[next.length - 1] = { ...next[next.length - 1], amount: String(Math.max(0, due - before)) };
    }
    setLines(next);
  };
  const add = () => {
    const used = new Set(lines.map(l => l.method));
    const method = (OPTIONS.find(([m]) => !used.has(m)) || OPTIONS[0])[0];
    setLines([...lines, { method, amount: st.rest > 0 ? String(st.rest) : '' }]);
  };
  return (
    <div className="space-y-2" data-mixed-payment>
      {lines.map((l, k) => (
        <div key={k} className="grid grid-cols-[1fr_120px_28px] gap-2 items-center" data-mixed-line={k}>
          <NiceSelect value={l.method} onChange={e => update(k, { method: e.target.value })} className={INPUT} data-mixed-method={k}>{OPTIONS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</NiceSelect>
          <input type="number" min={0} value={l.amount} onChange={e => update(k, { amount: e.target.value })} placeholder="Valor" className={cn(INPUT, 'font-mono')} data-mixed-amount={k} />
          <button type="button" onClick={() => setLines(lines.filter((_, i) => i !== k))} disabled={lines.length <= 2} className="h-9 text-muted-foreground hover:text-red-600 disabled:opacity-30" title="Quitar este medio"><X size={15} /></button>
        </div>
      ))}
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={add} className="text-xs font-semibold text-brand-primary flex items-center gap-1" data-mixed-add><Plus size={13} /> Agregar otro medio de pago</button>
        <span className={cn('text-[11px] font-semibold', st.ok ? 'text-emerald-700' : 'text-red-600')}>{st.ok ? `Suma ${formatPrice(st.sum)} ✓` : st.rest > 0 ? `Faltan ${formatPrice(st.rest)}` : st.rest < 0 ? `Sobran ${formatPrice(-st.rest)}` : 'Usa al menos dos medios'}</span>
      </div>
    </div>
  );
};
