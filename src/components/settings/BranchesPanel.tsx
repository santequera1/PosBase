import { useEffect, useState } from 'react';
import { Building2, Plus, Save, Info } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import { Modal, INPUT, LABEL } from '@/components/common/Primitives';
import { NiceSelect } from '@/components/ui/nice-select';

/** Configuración → Sedes: locales del negocio (restaurante, heladería…) y sede de origen de cada categoría del menú. */
export const BranchesPanel = () => {
  const loadBranches = useStore(s => s.loadBranches);
  const [data, setData] = useState<any>(null);
  const [edit, setEdit] = useState<any>(null);
  const [assign, setAssign] = useState<Record<number, number | null>>({});
  const load = () => api.getBranches(true).then(d => { setData(d); setAssign(Object.fromEntries(d.categories.map((c: any) => [c.id, c.branchId ?? null]))); }).catch(e => toast.error(e.message));
  useEffect(() => { load(); }, []);
  if (!data) return <p className="text-xs text-muted-foreground">Cargando...</p>;
  const save = async () => {
    try {
      if (edit.id) await api.updateBranch(edit.id, edit); else await api.addBranch(edit);
      toast.success('Sede guardada'); setEdit(null); load(); loadBranches();
    } catch (e: any) { toast.error(e.message); }
  };
  const saveAssign = async () => { try { await api.assignCategoryBranches(assign); toast.success('Categorías asignadas'); load(); } catch (e: any) { toast.error(e.message); } };
  const active = data.branches.filter((b: any) => b.active);
  return (
    <div className="space-y-4" data-branches-panel>
      <section className="bg-card rounded-xl border border-border p-4 shadow-card space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-bold text-sm text-brand-dark flex items-center gap-1.5"><Building2 size={15} /> Sedes del negocio</h3>
          <button onClick={() => setEdit({ name: '', address: '', phone: '', active: true })} className="px-3 py-1.5 rounded-lg gradient-primary text-primary-foreground text-xs font-semibold flex items-center gap-1.5" data-branch-new><Plus size={13} /> Nueva sede</button>
        </div>
        <p className="text-[11px] text-muted-foreground flex gap-1"><Info size={12} className="shrink-0 mt-0.5" /> Cada sede tiene su propia caja (arqueos), salones y mesas, pedidos, cocina e impresoras. El menú es compartido: desde el restaurante se pueden vender productos de la heladería en la misma cuenta y al revés. Con más de una sede, arriba aparece el selector para cambiar de sede.</p>
        <ul className="divide-y divide-border border border-border rounded-lg">
          {data.branches.map((b: any) => (
            <li key={b.id} className={cn('flex items-center gap-3 px-3 py-2.5', !b.active && 'opacity-50')} data-branch-row={b.name}>
              <Building2 size={16} className="text-brand-primary" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-brand-dark">{b.name}{b.id === data.current ? <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">Activa en este equipo</span> : null}{!b.active && ' · inactiva'}</p>
                <p className="text-[11px] text-muted-foreground">{[b.address, b.phone].filter(Boolean).join(' · ') || 'Usa la dirección y el teléfono del negocio'}</p>
              </div>
              <button onClick={() => setEdit({ ...b })} className="px-2.5 py-1 rounded-lg border border-border text-xs font-semibold">Editar</button>
            </li>
          ))}
        </ul>
      </section>

      {active.length > 1 && (
        <section className="bg-card rounded-xl border border-border p-4 shadow-card space-y-3" data-category-branches>
          <h3 className="font-bold text-sm text-brand-dark">Sede de origen de cada categoría</h3>
          <p className="text-[11px] text-muted-foreground">Sirve para ordenar el catálogo y para saber cuánto vende cada sede de sus propios productos. No limita la venta: cualquier sede puede vender cualquier producto.</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {data.categories.map((c: any) => (
              <div key={c.id} className="flex items-center gap-2 text-xs">
                <span className="flex-1 truncate font-semibold">{c.name}</span>
                <NiceSelect value={assign[c.id] === null || assign[c.id] === undefined ? '' : String(assign[c.id])} onChange={e => setAssign(a => ({ ...a, [c.id]: e.target.value === '' ? null : Number(e.target.value) }))} className="w-44 py-1.5 text-xs">
                  <option value="">Todas</option>
                  {active.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </NiceSelect>
              </div>
            ))}
          </div>
          <button onClick={saveAssign} className="px-4 py-2 rounded-lg bg-brand-button text-brand-on-button text-xs font-semibold flex items-center gap-1.5"><Save size={13} /> Guardar categorías</button>
        </section>
      )}

      {edit && (
        <Modal title={edit.id ? `Editar ${edit.name}` : 'Nueva sede'} onClose={() => setEdit(null)}>
          <div className="space-y-3">
            <div><label className={LABEL}>Nombre</label><input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} placeholder="Ej. Heladería" className={INPUT} data-branch-name /></div>
            <div><label className={LABEL}>Dirección (para los recibos de esta sede)</label><input value={edit.address} onChange={e => setEdit({ ...edit, address: e.target.value })} placeholder="Vacío = la del negocio" className={INPUT} /></div>
            <div><label className={LABEL}>Teléfono</label><input value={edit.phone} onChange={e => setEdit({ ...edit, phone: e.target.value })} placeholder="Vacío = el del negocio" className={INPUT} /></div>
            {edit.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.active} onChange={e => setEdit({ ...edit, active: e.target.checked })} /> Sede activa</label>}
            {!edit.id && <p className="text-[11px] text-muted-foreground">La sede nueva arranca con un salón vacío para crear sus mesas, sin caja abierta y sin impresoras.</p>}
          </div>
          <button onClick={save} disabled={!edit.name || edit.name.trim().length < 2} className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-40" data-branch-save>Guardar sede</button>
        </Modal>
      )}
    </div>
  );
};

export default BranchesPanel;
