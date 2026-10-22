import { useEffect, useState } from 'react';
import { Sparkles, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type Pack = { id: string; label: string; businessName: string; slogan: string; theme: any; products: number; sample: string[]; logo: string | null; current: boolean; modules: Record<string, boolean> };
const MODULE_LABEL: Record<string, string> = { tables: 'Mesas', counter: 'Para llevar', delivery: 'Domicilios', kitchen: 'Cocina' };

/** Modo demostración: convierte la instalación en un negocio ficticio (marca, colores, menú, mesas y ventas). */
const DemoPacksPanel = () => {
  const [packs, setPacks] = useState<Pack[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { api.getDemoPacks().then(r => setPacks(r.enabled ? r.packs : [])).catch(() => setPacks([])); }, []);

  const apply = async (p: Pack) => {
    if (!window.confirm(`¿Convertir esta demo en "${p.businessName}" (${p.label})?\n\nSe reemplazan el menú, la marca, los colores, las mesas y las ventas por los del ejemplo. Los usuarios se conservan.`)) return;
    setBusy(p.id);
    try { await api.applyDemoPack(p.id); toast.success(`Listo: ahora es ${p.businessName}`); setTimeout(() => window.location.reload(), 600); }
    catch (e: any) { toast.error(e.message); setBusy(null); }
  };

  if (!packs) return <p className="text-sm text-muted-foreground">Cargando...</p>;
  return (
    <div className="space-y-4" data-demo-packs>
      <div>
        <h2 className="font-bold text-brand-dark flex items-center gap-2"><Sparkles size={16} /> Modo demostración</h2>
        <p className="text-xs text-muted-foreground">Cambia esta demo al tipo de negocio del prospecto: marca ficticia, colores, tipografías, menú con precios reales, mesas y una semana de ventas. Solo existe en las instalaciones de demostración.</p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {packs.map(p => (
          <div key={p.id} className={cn('rounded-2xl border overflow-hidden bg-white shadow-sm flex flex-col', p.current ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-border')} data-demo-pack={p.id}>
            <div className="h-20 flex items-center justify-center relative" style={{ background: p.theme.background }}>
              {p.logo ? <img src={p.logo} alt={p.businessName} className="max-h-16 max-w-[70%] object-contain" /> : (
                <p className="text-2xl font-bold" style={{ color: p.theme.primary, fontFamily: p.theme.fontHeading }}>{p.businessName}</p>
              )}
              <div className="absolute bottom-1.5 right-2 flex gap-1">{[p.theme.primary, p.theme.accent, p.theme.card, p.theme.wine].map((c, i) => <span key={i} className="w-3.5 h-3.5 rounded-full border border-black/10" style={{ background: c }} />)}</div>
            </div>
            <div className="p-3 flex-1 flex flex-col gap-1.5">
              <p className="text-sm font-bold text-brand-dark">{p.label}</p>
              <p className="text-[11px] text-muted-foreground">{p.businessName} · {p.slogan} · {p.theme.fontHeading} + {p.theme.fontBody}</p>
              <p className="text-[11px] text-muted-foreground">{p.products} productos: {p.sample.join(', ')}…</p>
              <p className="text-[11px] text-muted-foreground">{Object.entries(p.modules).filter(([, v]) => v).map(([k]) => MODULE_LABEL[k] || k).join(' · ')}</p>
              <div className="mt-auto pt-1.5">
                {p.current ? <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1"><CheckCircle2 size={14} /> Es la demo actual</p> : (
                  <button onClick={() => apply(p)} disabled={!!busy} className="w-full py-2 rounded-xl bg-brand-button text-brand-on-button text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1.5" data-apply-pack={p.id}>
                    {busy === p.id ? <><Loader2 size={13} className="animate-spin" /> Aplicando...</> : 'Usar esta demo'}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DemoPacksPanel;
