import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Reemplazo directo del <select> nativo con el diseño de shadcn/ui (Radix Select).
 * Se usa igual que un <select>: value, onChange(e => e.target.value), <option> y <optgroup> como hijos.
 * Por dentro deja un <select> nativo invisible con los mismos atributos data-* (accesibilidad, formularios y pruebas).
 */
type Opt = { value: string; label: React.ReactNode; text: string; disabled?: boolean };
type Group = { label: string | null; options: Opt[] };
const EMPTY = '__vacio__';

const textOf = (n: React.ReactNode): string => {
  if (n === null || n === undefined || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(textOf).join('');
  if (React.isValidElement(n)) return textOf((n.props as any).children);
  return '';
};

function collect(children: React.ReactNode, groups: Group[], current: Group) {
  React.Children.forEach(children, child => {
    if (!React.isValidElement(child)) return;
    const p: any = child.props;
    if (child.type === React.Fragment) { collect(p.children, groups, current); return; }
    if (child.type === 'optgroup') {
      const g: Group = { label: String(p.label ?? ''), options: [] };
      groups.push(g);
      collect(p.children, groups, g);
      return;
    }
    if (child.type === 'option') {
      const text = textOf(p.children);
      current.options.push({ value: p.value === undefined || p.value === null ? text : String(p.value), label: p.children, text, disabled: Boolean(p.disabled) });
    }
  });
}

export interface NiceSelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value' | 'defaultValue'> {
  value?: string | number | null;
  defaultValue?: string | number | null;
  onChange?: (e: { target: { value: string; name?: string }; currentTarget: { value: string } }) => void;
  placeholder?: string;
  children?: React.ReactNode;
}

export const NiceSelect = React.forwardRef<HTMLButtonElement, NiceSelectProps>(({ value, defaultValue, onChange, className, children, disabled, placeholder, autoFocus, name, id, title, ...rest }, ref) => {
  const groups: Group[] = [];
  const root: Group = { label: null, options: [] };
  groups.push(root);
  collect(children, groups, root);
  const all = groups.flatMap(g => g.options);
  const controlled = value !== undefined;
  const [inner, setInner] = React.useState<string>(defaultValue === undefined || defaultValue === null ? '' : String(defaultValue));
  const cur = controlled ? (value === null ? '' : String(value)) : inner;
  const match = all.find(o => o.value === cur);
  // Radix no admite valores vacíos: el "" de un <option value=""> se mapea a un valor centinela
  const radixValue = match ? (match.value === '' ? EMPTY : match.value) : undefined;
  const ph = placeholder ?? (all.find(o => o.disabled && (o.value === '' || o.value === '0'))?.text || all[0]?.text || '');
  const emit = (v: string) => {
    if (!controlled) setInner(v);
    onChange?.({ target: { value: v, name }, currentTarget: { value: v } });
  };
  const dataAttrs = Object.fromEntries(Object.entries(rest).filter(([k]) => k.startsWith('data-') || k.startsWith('aria-')));
  return (
    <span className="relative contents">
      <SelectPrimitive.Root value={radixValue} onValueChange={v => emit(v === EMPTY ? '' : v)} disabled={disabled}>
        <SelectPrimitive.Trigger ref={ref} id={id} title={title} autoFocus={autoFocus}
          className={cn('inline-flex h-auto min-w-[7rem] max-w-full items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 py-2 text-sm text-left outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground [&>span]:line-clamp-1', className)}>
          <SelectPrimitive.Value placeholder={ph} />
          <SelectPrimitive.Icon asChild><ChevronDown className="h-4 w-4 shrink-0 opacity-60" /></SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content position="popper" sideOffset={4}
            className="relative z-[300] max-h-[min(22rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
            <SelectPrimitive.Viewport className="p-1 max-h-[min(22rem,var(--radix-select-content-available-height))] overflow-y-auto">
              {groups.map((g, gi) => (g.options.length === 0 ? null : (
                <SelectPrimitive.Group key={gi}>
                  {g.label && <SelectPrimitive.Label className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{g.label}</SelectPrimitive.Label>}
                  {g.options.map(o => (
                    <SelectPrimitive.Item key={o.value + '|' + o.text} value={o.value === '' ? EMPTY : o.value} disabled={o.disabled}
                      className="relative flex w-full cursor-pointer select-none items-center rounded-lg py-2 pl-8 pr-3 text-sm outline-none data-[highlighted]:bg-brand-card data-[highlighted]:text-brand-dark data-[state=checked]:font-semibold data-[disabled]:pointer-events-none data-[disabled]:opacity-50">
                      <span className="absolute left-2 flex h-4 w-4 items-center justify-center"><SelectPrimitive.ItemIndicator><Check className="h-4 w-4 text-brand-primary" /></SelectPrimitive.ItemIndicator></span>
                      <SelectPrimitive.ItemText>{o.text || o.label}</SelectPrimitive.ItemText>
                    </SelectPrimitive.Item>
                  ))}
                </SelectPrimitive.Group>
              )))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
      {/* Select nativo invisible: mismos data-* para formularios, lectores y pruebas automáticas */}
      <select aria-hidden="true" tabIndex={-1} name={name} value={cur} disabled={disabled} onChange={e => emit(e.target.value)} {...dataAttrs}
        style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0, opacity: 0.01 }}>
        {!match && <option value={cur}>{cur}</option>}
        {all.map(o => <option key={o.value + '|' + o.text} value={o.value} disabled={o.disabled}>{o.text}</option>)}
      </select>
    </span>
  );
});
NiceSelect.displayName = 'NiceSelect';

export default NiceSelect;
