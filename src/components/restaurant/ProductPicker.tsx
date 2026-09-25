import { useMemo, useState } from 'react';
import { Search, Plus, X } from 'lucide-react';
import { useStore, type OrderItem, type Product } from '@/store/useStore';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Catálogo compacto para armar una cuenta (mesa, para llevar, domicilio): categorías, búsqueda, tamaños. */
export const ProductPicker = ({ onAdd }: { onAdd: (item: OrderItem) => void }) => {
  const { categories, products } = useStore();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<number | null>(null);
  const [sizing, setSizing] = useState<Product | null>(null);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(p => (!category || p.categoryId === category) && (!q || p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)));
  }, [products, category, search]);

  const add = (p: Product, size?: { name: string; price: number }) => {
    onAdd({ productId: p.id, name: size ? `${p.name} - ${size.name}` : p.name, size: size?.name, quantity: 1, price: size ? size.price : p.price, notes: '' });
    setSizing(null);
  };
  const pick = (p: Product) => {
    if (!p.available) return;
    if (p.sizes && p.sizes.length > 0) setSizing(p); else add(p);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-3 space-y-2 border-b border-brand-primary/10 bg-white/60">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto..." className="w-full pl-9 pr-3 py-2 rounded-xl border border-brand-primary/15 bg-white text-sm outline-none focus:ring-2 focus:ring-brand-primary/20" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          <button onClick={() => setCategory(null)} className={cn('px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap border', !category ? 'bg-brand-button text-brand-on-button border-brand-primary' : 'bg-white text-brand-primary border-brand-primary/10')}>Todo</button>
          {categories.map(c => (
            <button key={c.id} onClick={() => setCategory(category === c.id ? null : c.id)} className={cn('px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap border flex items-center gap-1', category === c.id ? 'bg-brand-button text-brand-on-button border-brand-primary' : 'bg-white text-brand-primary border-brand-primary/10')}>
              <span>{c.emoji}</span>{c.name}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {list.length === 0 && <p className="text-xs text-brand-muted text-center py-10">Ningún producto coincide.</p>}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
          {list.map(p => (
            <button key={p.id} onClick={() => pick(p)} disabled={!p.available} title={p.available ? `Agregar ${p.name}` : 'No disponible'}
              className={cn('text-left rounded-2xl border bg-white shadow-sm overflow-hidden transition-all hover:shadow-md active:scale-[0.98]', p.available ? 'border-brand-primary/10' : 'border-gray-200 opacity-50 cursor-not-allowed')}>
              <div className="aspect-[4/3] bg-brand-card flex items-center justify-center overflow-hidden">
                {p.image ? <img src={p.image} alt={p.name} className="w-full h-full object-cover" loading="lazy" /> : <span className="text-3xl">🍽️</span>}
              </div>
              <div className="p-2.5">
                <p className="text-xs font-bold text-brand-dark leading-tight line-clamp-2">{p.name}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[11px] font-semibold text-brand-primary">{p.sizes && p.sizes.length ? `Desde ${formatPrice(Math.min(...p.sizes.map(s => s.price)))}` : formatPrice(p.price)}</span>
                  <span className="w-6 h-6 rounded-full bg-brand-button text-brand-on-button flex items-center justify-center"><Plus size={13} /></span>
                </div>
                {!p.available && <span className="text-[10px] text-red-600 font-semibold">Agotado</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {sizing && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setSizing(null)}>
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-sm p-5 shadow-2xl space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm text-brand-dark">{sizing.name} · tamaño</h4>
              <button onClick={() => setSizing(null)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><X size={16} /></button>
            </div>
            <div className="grid gap-2">
              {(sizing.sizes || []).map(s => (
                <button key={s.name} onClick={() => add(sizing, s)} className="flex items-center justify-between px-4 py-3 rounded-xl border border-brand-primary/15 bg-brand-card hover:bg-brand-button hover:text-brand-on-button transition-colors text-sm font-semibold">
                  <span>{s.name}</span><span>{formatPrice(s.price)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductPicker;
