import { useSearchParams } from 'react-router-dom';
import { UtensilsCrossed, Carrot, ChefHat, Boxes, TrendingUp } from 'lucide-react';
import ProductsPage from '@/pages/ProductsPage';
import { IngredientsTab, RecipesTab, StockTab, ProfitTab } from '@/components/inventory/InventoryModule';
import { useStore } from '@/store/useStore';
import { can } from '@/lib/permissions';
import { cn } from '@/lib/utils';

/** Menú al estilo de Fudo: productos, ingredientes, recetas y costos, inventario y rentabilidad. */
const MenuModulePage = () => {
  const user = useStore(s => s.user);
  const [params, setParams] = useSearchParams();
  const tabs = [
    { id: 'productos', label: 'Productos', icon: UtensilsCrossed },
    { id: 'ingredientes', label: 'Ingredientes', icon: Carrot },
    { id: 'recetas', label: 'Recetas y costos', icon: ChefHat },
    { id: 'inventario', label: 'Inventario', icon: Boxes },
    // La ganancia es información sensible: solo quien ve informes
    ...(can(user, 'reports') ? [{ id: 'rentabilidad', label: 'Rentabilidad', icon: TrendingUp }] : []),
  ];
  const tab = tabs.some(t => t.id === params.get('tab')) ? (params.get('tab') as string) : 'productos';
  return (
    <div className="space-y-3">
      <div className="bg-brand-surface text-brand-on-dark rounded-xl flex overflow-x-auto no-scrollbar" data-menu-tabs>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setParams(p => { p.set('tab', t.id); return p; }, { replace: true })}
            className={cn('px-4 py-2.5 text-sm font-semibold whitespace-nowrap flex items-center gap-1.5 transition-colors', tab === t.id ? 'bg-white/15 text-white' : 'text-brand-on-dark/70 hover:text-white')} data-menu-tab={t.id}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>
      {tab === 'productos' && <ProductsPage />}
      {tab === 'ingredientes' && <IngredientsTab />}
      {tab === 'recetas' && <RecipesTab />}
      {tab === 'inventario' && <StockTab />}
      {tab === 'rentabilidad' && <ProfitTab />}
    </div>
  );
};

export default MenuModulePage;
