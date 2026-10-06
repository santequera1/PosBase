import { useState } from 'react';
import { Eye, EyeOff, Info, Save } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import { VIEWS } from '@/lib/permissions';

/** Configuración → Secciones: el administrador oculta o muestra secciones del sistema sin eliminarlas (los datos se conservan). */
const SectionsPanel = () => {
  const restaurant = useStore(s => s.restaurant);
  const loadRestaurantConfig = useStore(s => s.loadRestaurantConfig);
  const setMobileNav = async (v: 'top' | 'bottom') => { try { await api.updateRestaurantConfig({ mobileNav: v }); await loadRestaurantConfig(); toast.success(v === 'top' ? 'Menú del celular arriba' : 'Menú del celular abajo'); } catch (e: any) { toast.error(e.message); } };
  const hiddenViews = useStore(s => s.hiddenViews);
  const setHiddenViews = useStore(s => s.setHiddenViews);
  const [hidden, setHidden] = useState<string[]>(hiddenViews);
  const [saving, setSaving] = useState(false);
  const groups = [...new Set(VIEWS.map(v => v.group))];
  const toggle = (k: string) => setHidden(h => (h.includes(k) ? h.filter(x => x !== k) : [...h, k]));
  const save = async () => {
    setSaving(true);
    try { await api.updateSettings({ hiddenViews: JSON.stringify(hidden) }); setHiddenViews(hidden); toast.success('Secciones actualizadas'); } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };
  return (
    <div className="space-y-4">
    <section className="bg-card rounded-xl border border-border p-4 shadow-card space-y-3 font-sans" data-mobile-nav-setting>
      <div>
        <h3 className="font-bold text-sm text-brand-dark">Menú en el celular</h3>
        <p className="text-xs text-muted-foreground">Arriba: un botón con el módulo actual que despliega todos los demás (como Fudo). Abajo: barra de íconos en la parte inferior.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {([['top', 'Arriba (como Fudo)'], ['bottom', 'Abajo (barra inferior)']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setMobileNav(k)} data-mobile-nav={k} className={cn('p-3 rounded-xl border text-sm font-semibold text-left', (restaurant?.mobileNav || 'bottom') === k ? 'border-brand-primary bg-brand-button/5 text-brand-dark' : 'border-border text-muted-foreground')}>{(restaurant?.mobileNav || 'bottom') === k ? '✓ ' : ''}{l}</button>
        ))}
      </div>
    </section>
    <section className="bg-card rounded-xl border border-border p-4 shadow-card space-y-4 font-sans">
      <div>
        <h3 className="font-bold text-sm text-brand-dark">Secciones visibles del sistema</h3>
        <p className="text-xs text-muted-foreground">Oculta las secciones que el negocio no usa por ahora. No se elimina nada: la información se conserva y puedes volver a mostrarlas cuando quieras. Aplica para todos los usuarios, incluido el administrador.</p>
      </div>
      {groups.map(g => (
        <div key={g}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-brand-primary mb-1.5">{g}</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {VIEWS.filter(v => v.group === g).map(v => {
              const locked = v.key === 'settings';
              const off = hidden.includes(v.key) && !locked;
              return (
                <button key={v.key} type="button" disabled={locked} onClick={() => toggle(v.key)} data-section={v.key}
                  className={cn('flex items-start gap-3 p-3 rounded-xl border text-left transition-all', off ? 'border-border bg-muted/40 opacity-70' : 'border-brand-primary/40 bg-brand-button/5', locked && 'cursor-default')}>
                  <span className={cn('mt-0.5 w-10 h-6 rounded-full relative shrink-0 transition-colors', off ? 'bg-gray-300' : 'bg-emerald-500')}>
                    <span className={cn('absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all', off ? 'left-0.5' : 'left-[18px]')} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-brand-dark"><v.icon size={14} /> {v.label} {off ? <EyeOff size={13} className="text-muted-foreground" /> : <Eye size={13} className="text-emerald-600" />}</span>
                    <span className="block text-[11px] text-muted-foreground">{locked ? 'Siempre visible para poder volver a activar secciones.' : off ? 'Oculta: no aparece en el menú y su dirección muestra "sección oculta".' : v.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-[11px] text-muted-foreground flex items-start gap-1.5"><Info size={12} className="mt-0.5 shrink-0" /> Mesas, Para llevar, Domicilios y Cocina además dependen de que el módulo esté activo en Configuración → Restaurante.</p>
      <button onClick={save} disabled={saving} className="px-5 py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold flex items-center gap-1.5 disabled:opacity-40" data-save-sections><Save size={15} /> {saving ? 'Guardando...' : 'Guardar secciones'}</button>
    </section>
    </div>
  );
};

export default SectionsPanel;
