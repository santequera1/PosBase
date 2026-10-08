import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, Upload, Trash2, PackagePlus, ClipboardCheck, AlertTriangle, ChefHat, TrendingUp, Download, X, Minus } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { formatPrice, getColombiaTodayStr } from '@/lib/format';
import { cn } from '@/lib/utils';
import { canDo } from '@/lib/permissions';
import { Modal, Chip, KpiCard, INPUT, LABEL, fmtDate } from '@/components/common/Primitives';
import { NiceSelect } from '@/components/ui/nice-select';
import { readSpreadsheet, readAllSheets, normHeader } from '@/lib/xlsxRead';
import { downloadXlsx } from '@/lib/xlsx';

export const UNITS: Array<[string, string]> = [['unid', 'unid.'], ['kg', 'kg'], ['g', 'g'], ['l', 'litro'], ['ml', 'ml'], ['lb', 'lb'], ['oz', 'oz']];
const unitLabel = (u: string) => (UNITS.find(x => x[0] === u) || [u, u])[1];
/** Cantidad legible: hasta 3 decimales, con coma. */
export const fmtQty = (q: number) => (Math.round((q || 0) * 1000) / 1000).toLocaleString('es-CO', { maximumFractionDigits: 3 });
const pct = (n: number) => `${(Math.round((n || 0) * 10) / 10).toLocaleString('es-CO')} %`;
const marginClass = (m: number, hasCost = true) => !hasCost ? 'text-muted-foreground' : m < 30 ? 'text-red-700' : m < 55 ? 'text-amber-700' : 'text-emerald-700';
const KIND_LABEL: Record<string, string> = { compra: 'Compra', venta: 'Venta', devolucion: 'Devolución', ajuste: 'Ajuste', merma: 'Merma', conteo: 'Conteo', inicial: 'Stock inicial' };

/* ======================================================================
 * Ingredientes (como Fudo: categorías a la izquierda, lista, detalle con receta asociada)
 * ====================================================================== */
export const IngredientsTab = () => {
  const user = useStore(s => s.user);
  const canEdit = canDo(user, 'edit_menu');
  const [list, setList] = useState<any[]>([]);
  const [cat, setCat] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<any | null>(null);
  const [detail, setDetail] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const load = () => api.getIngredients().then(setList).catch(e => toast.error(e.message));
  useEffect(() => { load(); }, []);
  const cats = useMemo(() => [...new Set(list.map(i => i.category))].sort(), [list]);
  const shown = list.filter(i => (!cat || i.category === cat) && (!q || i.name.toLowerCase().includes(q.toLowerCase())));
  const exportXlsx = () => downloadXlsx(`ingredientes-${getColombiaTodayStr()}.xlsx`, [{ name: 'Ingredientes', headers: ['Nombre', 'Categoría', 'Unidad', 'Costo', 'Merma %', 'Stock', 'Mínimo'], rows: list.map(i => [i.name, i.category, i.unit, i.cost, i.wastePct, i.stock, i.minStock]) }]);
  return (
    <div className="grid md:grid-cols-[200px_1fr] gap-3" data-ingredients-tab>
      <aside className="bg-brand-surface text-brand-on-dark rounded-xl overflow-hidden h-max">
        <button onClick={() => setCat(null)} className={cn('w-full text-left px-4 py-2.5 text-sm font-semibold', !cat ? 'bg-orange-500 text-white' : 'hover:bg-white/10')}>Todas ({list.length})</button>
        {cats.map(c => <button key={c} onClick={() => setCat(c)} className={cn('w-full text-left px-4 py-2.5 text-sm uppercase', cat === c ? 'bg-orange-500 text-white' : 'hover:bg-white/10')}>{c} <span className="opacity-60">({list.filter(i => i.category === c).length})</span></button>)}
      </aside>
      <div className="space-y-3 min-w-0">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Filtrar por ingrediente" className={cn(INPUT, 'pl-8')} /></div>
          <button onClick={exportXlsx} className="px-3 py-2 rounded-lg border border-border bg-white text-xs font-semibold flex items-center gap-1.5"><Download size={13} /> Excel</button>
          {canEdit && <button onClick={() => setImporting(true)} className="px-3 py-2 rounded-lg border border-border bg-white text-xs font-semibold flex items-center gap-1.5" data-ing-import><Upload size={13} /> Importar</button>}
          {canEdit && <button onClick={() => setEdit({})} className="px-4 py-2 rounded-lg bg-brand-button text-brand-on-button text-xs font-bold flex items-center gap-1.5" data-ing-new><Plus size={14} /> Nuevo ingrediente</button>}
        </div>
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {shown.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">{list.length ? 'Ningún ingrediente coincide.' : 'Aún no hay ingredientes. Créalos uno por uno o impórtalos desde Excel (por ejemplo, la exportación de Fudo).'}</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="bg-brand-card text-xs text-muted-foreground"><tr><th className="text-left px-4 py-2.5">Nombre</th><th className="text-left px-3 py-2.5">Unidad</th><th className="text-right px-3 py-2.5">Merma</th><th className="text-right px-3 py-2.5">Costo</th><th className="text-right px-3 py-2.5">Stock</th><th className="text-right px-4 py-2.5">Usado en</th></tr></thead>
              <tbody>{shown.map(i => (
                <tr key={i.id} onClick={() => setDetail(i.id)} className="border-t border-border hover:bg-brand-card/50 cursor-pointer" data-ing-row={i.name}>
                  <td className="px-4 py-2.5 font-semibold uppercase text-brand-dark">{i.name}</td>
                  <td className="px-3 py-2.5">{unitLabel(i.unit)}</td>
                  <td className="px-3 py-2.5 text-right">{i.wastePct ? `${i.wastePct} %` : '-'}</td>
                  <td className="px-3 py-2.5 text-right">{formatPrice(i.cost)}</td>
                  <td className={cn('px-3 py-2.5 text-right font-semibold', i.trackStock && i.low ? 'text-red-700' : '')}>{i.trackStock ? `${fmtQty(i.stock)} ${unitLabel(i.unit)}` : '—'}{i.trackStock && i.low && <AlertTriangle size={12} className="inline ml-1" />}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{i.usedIn} prod.</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      </div>
      {edit && <IngredientForm ingredient={edit.id ? edit : null} categories={cats} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {detail && <IngredientDetail id={detail} categories={cats} onClose={() => { setDetail(null); load(); }} />}
      {importing && <ImportIngredients onClose={() => setImporting(false)} onDone={() => { setImporting(false); load(); }} />}
    </div>
  );
};

const IngredientForm = ({ ingredient, categories, onClose, onSaved }: { ingredient: any | null; categories: string[]; onClose: () => void; onSaved: (i: any) => void }) => {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [f, setF] = useState<any>(ingredient ? { ...ingredient, cost: String(ingredient.cost), wastePct: String(ingredient.wastePct || ''), minStock: String(ingredient.minStock || '') } : { name: '', category: categories[0] || '', unit: 'unid', cost: '', wastePct: '', stock: '', minStock: '', trackStock: true, supplierId: 0 });
  const set = (p: any) => setF((x: any) => ({ ...x, ...p }));
  useEffect(() => { api.getSuppliers().then(setSuppliers).catch(() => {}); }, []);
  const save = async () => {
    try {
      const body = { ...f, cost: Number(f.cost) || 0, wastePct: Number(f.wastePct) || 0, minStock: Number(f.minStock) || 0, stock: Number(f.stock) || 0, supplierId: Number(f.supplierId) || null };
      const r = ingredient ? await api.updateIngredient(ingredient.id, body) : await api.addIngredient(body);
      toast.success(ingredient ? 'Ingrediente actualizado' : 'Ingrediente creado'); onSaved(r);
    } catch (e: any) { toast.error(e.message); }
  };
  return (
    <Modal title={ingredient ? `Editar ${ingredient.name}` : 'Nuevo ingrediente'} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><label className={LABEL}>Nombre *</label><input value={f.name} onChange={e => set({ name: e.target.value })} placeholder="Ej. Pan brioche grande" className={INPUT} data-ing-name /></div>
        <div><label className={LABEL}>Categoría *</label><input list="ing-cats" value={f.category} onChange={e => set({ category: e.target.value })} placeholder="Ej. Hamburguesas" className={INPUT} data-ing-category /><datalist id="ing-cats">{categories.map(c => <option key={c} value={c} />)}</datalist></div>
        <div><label className={LABEL}>Unidad *</label><NiceSelect value={f.unit} onChange={e => set({ unit: e.target.value })} className={INPUT}>{UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</NiceSelect></div>
        <div><label className={LABEL}>Costo por {unitLabel(f.unit)}</label><input type="number" min={0} value={f.cost} onChange={e => set({ cost: e.target.value })} placeholder="2000" className={cn(INPUT, 'font-mono')} data-ing-cost /></div>
        <div><label className={LABEL}>Merma %</label><input type="number" min={0} max={90} value={f.wastePct} onChange={e => set({ wastePct: e.target.value })} placeholder="0" className={cn(INPUT, 'font-mono')} /></div>
        <div className="col-span-2 border-t border-border pt-2"><p className="text-xs font-bold text-brand-dark">Control de stock</p></div>
        <label className="col-span-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={f.trackStock} onChange={e => set({ trackStock: e.target.checked })} /> Controlar stock (se descuenta con cada venta)</label>
        {!ingredient && f.trackStock && <div><label className={LABEL}>Stock inicial ({unitLabel(f.unit)})</label><input type="number" min={0} value={f.stock} onChange={e => set({ stock: e.target.value })} className={cn(INPUT, 'font-mono')} data-ing-stock /></div>}
        {f.trackStock && <div><label className={LABEL}>Avisar cuando quede menos de</label><input type="number" min={0} value={f.minStock} onChange={e => set({ minStock: e.target.value })} className={cn(INPUT, 'font-mono')} /></div>}
        <div className="col-span-2"><label className={LABEL}>Proveedor</label><NiceSelect value={String(f.supplierId || 0)} onChange={e => set({ supplierId: Number(e.target.value) })} className={INPUT}><option value="0">Sin proveedor</option>{suppliers.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}</NiceSelect></div>
      </div>
      {Number(f.wastePct) > 0 && Number(f.cost) > 0 && <p className="text-[11px] text-muted-foreground">Con {f.wastePct} % de merma, el costo real por {unitLabel(f.unit)} es {formatPrice(Math.round(Number(f.cost) * (1 + Number(f.wastePct) / 100)))}.</p>}
      <button onClick={save} disabled={!f.name.trim() || !String(f.category).trim()} className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-40" data-ing-save>Guardar</button>
    </Modal>
  );
};

const IngredientDetail = ({ id, categories, onClose }: { id: number; categories: string[]; onClose: () => void }) => {
  const user = useStore(s => s.user);
  const canEdit = canDo(user, 'edit_menu');
  const [d, setD] = useState<any>(null);
  const [edit, setEdit] = useState(false);
  const [mv, setMv] = useState<null | 'compra' | 'merma' | 'ajuste'>(null);
  const load = () => api.getIngredient(id).then(setD).catch(e => toast.error(e.message));
  useEffect(() => { load(); }, [id]);
  if (!d) return <Modal title="Ingrediente" onClose={onClose}><p className="text-xs text-muted-foreground">Cargando…</p></Modal>;
  const i = d.ingredient;
  const remove = async () => { if (!window.confirm(`¿Eliminar ${i.name}?`)) return; try { await api.deleteIngredient(i.id); toast.success('Ingrediente eliminado'); onClose(); } catch (e: any) { toast.error(e.message); } };
  return (
    <Modal title={`Ingrediente: ${i.name}`} onClose={onClose} wide>
      <div className="grid sm:grid-cols-4 gap-2" data-ing-detail>
        <KpiCard label="Costo" value={`${formatPrice(i.cost)} / ${unitLabel(i.unit)}`} sub={i.wastePct ? `Merma ${i.wastePct} %` : undefined} />
        <KpiCard label="Stock" value={i.trackStock ? `${fmtQty(i.stock)} ${unitLabel(i.unit)}` : 'Sin control'} className={i.low ? 'bg-red-50 border-red-200' : ''} sub={i.trackStock && i.minStock ? `Mínimo ${fmtQty(i.minStock)}` : undefined} />
        <KpiCard label="Valor en inventario" value={i.trackStock ? formatPrice(Math.round(Math.max(0, i.stock) * i.cost)) : '—'} />
        <KpiCard label="Categoría" value={i.category} sub={i.supplierName || undefined} />
      </div>
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setMv('compra')} className="px-3 py-2 rounded-lg bg-brand-button text-brand-on-button text-xs font-bold flex items-center gap-1.5" data-ing-purchase><PackagePlus size={13} /> Ingresar compra</button>
          <button onClick={() => setMv('merma')} className="px-3 py-2 rounded-lg border border-border text-xs font-semibold flex items-center gap-1.5"><Minus size={13} /> Registrar merma</button>
          <button onClick={() => setMv('ajuste')} className="px-3 py-2 rounded-lg border border-border text-xs font-semibold">Ajustar</button>
          <button onClick={() => setEdit(true)} className="px-3 py-2 rounded-lg border border-border text-xs font-semibold">Editar datos</button>
          <button onClick={remove} className="ml-auto px-3 py-2 rounded-lg border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-1"><Trash2 size={12} /> Eliminar</button>
        </div>
      )}
      {d.components?.items?.length > 0 && (
        <div className="border border-border rounded-xl overflow-hidden" data-ing-components>
          <p className="px-3 py-2 bg-brand-card text-xs font-bold uppercase">Receta del ingrediente (elaboración)</p>
          {d.components.items.map((c: any) => (
            <div key={c.id} className="flex justify-between px-3 py-1.5 text-xs border-t border-border"><span className="uppercase">{c.name}</span><span>{fmtQty(c.quantity)} {unitLabel(c.unit)} · <b>{formatPrice(c.lineCost)}</b></span></div>
          ))}
          <p className="px-3 py-2 text-xs border-t border-border">Costo según la receta: <b>{formatPrice(d.components.cost)}</b> por {unitLabel(i.unit)} · costo registrado <b>{formatPrice(i.cost)}</b>{Math.abs(d.components.cost - i.cost) > 1 && canEdit ? <button onClick={async () => { try { await api.updateIngredient(i.id, { cost: d.components.cost }); toast.success('Costo actualizado'); load(); } catch (e: any) { toast.error(e.message); } }} className="ml-2 text-brand-primary font-semibold underline">usar el de la receta</button> : null}</p>
        </div>
      )}
      {d.usedInIngredients?.length > 0 && <p className="text-[11px] text-muted-foreground">También se usa para elaborar: {d.usedInIngredients.map((u: any) => `${u.name} (${fmtQty(u.quantity)} ${unitLabel(i.unit)})`).join(' · ')}</p>}
      <div className="grid md:grid-cols-2 gap-3">
        <div className="border border-border rounded-xl overflow-hidden">
          <p className="px-3 py-2 bg-brand-card text-xs font-bold uppercase">Productos asociados ({d.products.length})</p>
          {d.products.length === 0 ? <p className="p-3 text-xs text-muted-foreground">Ningún producto lo usa todavía. Agrégalo en la receta de un producto (pestaña Recetas y costos).</p> : d.products.map((p: any) => (
            <div key={p.id} className="flex justify-between px-3 py-1.5 text-xs border-t border-border"><span className="uppercase">{p.name}</span><span className="font-semibold">{fmtQty(p.quantity)} {unitLabel(i.unit)}</span></div>
          ))}
        </div>
        <div className="border border-border rounded-xl overflow-hidden">
          <p className="px-3 py-2 bg-brand-card text-xs font-bold uppercase">Movimientos</p>
          <div className="max-h-72 overflow-y-auto">
            {d.movements.length === 0 ? <p className="p-3 text-xs text-muted-foreground">Sin movimientos.</p> : d.movements.map((m: any) => (
              <div key={m.id} className="flex justify-between gap-2 px-3 py-1.5 text-xs border-t border-border">
                <span><b>{KIND_LABEL[m.kind] || m.kind}</b> · {fmtDate(m.date)}{m.orderId ? ` · venta #${m.orderId}` : ''}{m.supplierName ? ` · ${m.supplierName}` : ''}{m.notes ? ` · ${m.notes}` : ''}</span>
                <span className={cn('font-semibold whitespace-nowrap', m.quantity < 0 ? 'text-red-700' : 'text-emerald-700')}>{m.quantity > 0 ? '+' : ''}{fmtQty(m.quantity)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {edit && <IngredientForm ingredient={i} categories={categories} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); load(); }} />}
      {mv === 'compra' && <PurchaseModal preset={i} onClose={() => setMv(null)} onSaved={() => { setMv(null); load(); }} />}
      {(mv === 'merma' || mv === 'ajuste') && <AdjustModal ingredient={i} kind={mv} onClose={() => setMv(null)} onSaved={() => { setMv(null); load(); }} />}
    </Modal>
  );
};

const ImportIngredients = ({ onClose, onDone }: { onClose: () => void; onDone: () => void }) => {
  const [rows, setRows] = useState<any[] | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [components, setComponents] = useState<any[]>([]);
  const COLS: Record<string, string[]> = { name: ['nombre', 'ingrediente', 'name'], category: ['categoria', 'category'], unit: ['unidad', 'unit'], cost: ['costo', 'cost', 'precio'], wastePct: ['merma', 'mermapct', 'merma%'], stock: ['stock', 'cantidad', 'existencia'], trackStock: ['controldestock', 'controlarstock', 'controlstock'] };
  const pick = async (file?: File | null) => {
    if (!file) return;
    try {
      const table = await readSpreadsheet(file);
      const head = (table[0] || []).map(h => normHeader(h));
      const idx: Record<string, number> = {};
      for (const [k, names] of Object.entries(COLS)) idx[k] = head.findIndex(h => names.includes(h));
      if (idx.name < 0) { toast.error('No encontré la columna "Nombre"'); return; }
      const parsed = table.slice(1).filter(r => r.some(c => String(c || '').trim())).map(r => {
        const o: any = {}; for (const k of Object.keys(COLS)) if (idx[k] >= 0) o[k] = String(r[idx[k]] ?? '').trim();
        if (o.cost) o.cost = o.cost.replace(/[$\s.]/g, '').replace(',', '.');
        if (o.wastePct) o.wastePct = o.wastePct.replace(/[%\s-]/g, '').replace(',', '.');
        return o;
      });
      // Segunda hoja (exportación de Fudo): Ingrediente · Subingrediente · Cantidad
      let comps: any[] = [];
      try {
        const sheets = await readAllSheets(file);
        const sub = sheets.find(t => (t[0] || []).map(h => normHeader(h)).includes('subingrediente'));
        if (sub) { const h = sub[0].map(x => normHeader(x)); const a = h.indexOf('ingrediente'), b = h.indexOf('subingrediente'), q = h.indexOf('cantidad'); comps = sub.slice(1).filter(r => r[a] && r[b]).map(r => ({ ingredient: r[a], component: r[b], quantity: String(r[q] ?? '').replace(',', '.') })); }
      } catch { /* sin hoja de sub-recetas */ }
      setComponents(comps);
      setRows(parsed);
      setPreview(await api.importIngredients(parsed, true, comps));
    } catch (e: any) { toast.error(e.message || 'No se pudo leer el archivo'); }
  };
  const go = async () => {
    if (!rows) return; setBusy(true);
    try { const r = await api.importIngredients(rows, false, components); toast.success(`${r.created} creados · ${r.updated} actualizados${r.components ? ` · ${r.components} sub-recetas` : ''}`); onDone(); } catch (e: any) { toast.error(e.message); }
    setBusy(false);
  };
  return (
    <Modal title="Importar ingredientes desde Excel" onClose={onClose} wide>
      <p className="text-xs text-muted-foreground">Columnas: <b>Nombre</b>, Categoría, Unidad (unid, kg, g, l, ml), Costo, Merma y Stock. Sirve el archivo que exporta Fudo en Ingredientes. Si el ingrediente ya existe, se actualiza su costo.</p>
      <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={e => pick(e.target.files?.[0])} />
      <button onClick={() => fileRef.current?.click()} className="px-4 py-2 rounded-lg border border-border text-xs font-semibold flex items-center gap-1.5"><Upload size={13} /> Elegir archivo</button>
      {preview && (
        <>
          <div className="max-h-72 overflow-y-auto border border-border rounded-lg"><table className="w-full text-xs">
            <thead className="bg-brand-card"><tr><th className="text-left px-2 py-1.5">Nombre</th><th className="text-left px-2">Categoría</th><th className="text-left px-2">Unidad</th><th className="text-right px-2">Costo</th><th className="text-left px-2">Acción</th></tr></thead>
            <tbody>{preview.preview.map((r: any, k: number) => <tr key={k} className="border-t border-border"><td className="px-2 py-1">{r.name}</td><td className="px-2">{r.category}</td><td className="px-2">{r.unit}</td><td className="px-2 text-right">{formatPrice(r.cost)}</td><td className="px-2">{r.action}</td></tr>)}</tbody>
          </table></div>
          {preview.skipped.length > 0 && <p className="text-[11px] text-amber-700">Se omiten {preview.skipped.length} fila(s) sin nombre.</p>}
          {preview.ignoredStock?.length > 0 && <p className="text-[11px] text-amber-700">Stock no confiable, queda en 0 para hacer conteo: {preview.ignoredStock.map((s: any) => `${s.name} (${s.stock})`).join(', ')}</p>}
          {components.length > 0 && <p className="text-[11px] text-muted-foreground">También se cargan {preview.components} sub-receta(s) de ingredientes elaborados{preview.componentErrors?.length ? ` (${preview.componentErrors.length} sin coincidencia)` : ''}.</p>}
          <button onClick={go} disabled={busy} className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-40">Importar {preview.preview.length} ingrediente(s)</button>
        </>
      )}
    </Modal>
  );
};

/* ======================================================================
 * Compras, mermas, ajustes y conteos
 * ====================================================================== */
export const PurchaseModal = ({ preset, onClose, onSaved }: { preset?: any; onClose: () => void; onSaved: () => void }) => {
  const [ings, setIngs] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supplierId, setSupplierId] = useState(preset?.supplierId || 0);
  const [date, setDate] = useState(getColombiaTodayStr());
  const [notes, setNotes] = useState('');
  const [updateCost, setUpdateCost] = useState(true);
  const [lines, setLines] = useState<any[]>([{ ingredientId: preset?.id || 0, quantity: '', totalCost: '' }]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.getIngredients().then(setIngs).catch(() => {}); api.getSuppliers().then(setSuppliers).catch(() => {}); }, []);
  const setLine = (k: number, p: any) => setLines(ls => ls.map((l, i) => (i === k ? { ...l, ...p } : l)));
  const valid = lines.filter(l => l.ingredientId && Number(l.quantity) > 0);
  const total = valid.reduce((a, l) => a + (Number(l.totalCost) || 0), 0);
  const save = async () => {
    setBusy(true);
    try {
      const r = await api.addPurchase({ supplierId: supplierId || null, date, notes, updateCost, lines: valid.map(l => ({ ingredientId: Number(l.ingredientId), quantity: Number(l.quantity), totalCost: l.totalCost === '' ? undefined : Number(l.totalCost) })) });
      toast.success(`Compra registrada: ${r.lines.length} ingrediente(s) · ${formatPrice(r.total)}`); onSaved();
    } catch (e: any) { toast.error(e.message); }
    setBusy(false);
  };
  return (
    <Modal title="Ingresar compra (entrada de mercancía)" onClose={onClose} wide>
      <div className="grid sm:grid-cols-3 gap-2">
        <div><label className={LABEL}>Proveedor</label><NiceSelect value={String(supplierId)} onChange={e => setSupplierId(Number(e.target.value))} className={INPUT}><option value="0">Sin proveedor</option>{suppliers.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}</NiceSelect></div>
        <div><label className={LABEL}>Fecha</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className={INPUT} /></div>
        <div><label className={LABEL}>Factura / nota</label><input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej. factura 1234" className={INPUT} /></div>
      </div>
      <div className="space-y-2" data-purchase-lines>
        {lines.map((l, k) => {
          const ing = ings.find(i => i.id === Number(l.ingredientId));
          const unit = ing ? Number(l.totalCost) / (Number(l.quantity) || 1) : 0;
          return (
            <div key={k} className="grid grid-cols-[1fr_90px_110px_28px] gap-2 items-end">
              <div><label className={LABEL}>Ingrediente</label><NiceSelect value={String(l.ingredientId || 0)} onChange={e => setLine(k, { ingredientId: Number(e.target.value) })} className={INPUT} data-purchase-ing={k}><option value="0">Elige…</option>{ings.map(i => <option key={i.id} value={String(i.id)}>{i.name} ({unitLabel(i.unit)})</option>)}</NiceSelect></div>
              <div><label className={LABEL}>Cantidad{ing ? ` (${unitLabel(ing.unit)})` : ''}</label><input type="number" min={0} value={l.quantity} onChange={e => setLine(k, { quantity: e.target.value })} className={cn(INPUT, 'font-mono')} data-purchase-qty={k} /></div>
              <div><label className={LABEL}>Valor total</label><input type="number" min={0} value={l.totalCost} onChange={e => setLine(k, { totalCost: e.target.value })} placeholder={ing && Number(l.quantity) ? String(Math.round(ing.cost * Number(l.quantity))) : ''} className={cn(INPUT, 'font-mono')} data-purchase-total={k} />{ing && Number(l.totalCost) > 0 && Number(l.quantity) > 0 && <span className="text-[10px] text-muted-foreground">{formatPrice(Math.round(unit))} / {unitLabel(ing.unit)}</span>}</div>
              <button onClick={() => setLines(ls => ls.filter((_, i) => i !== k))} disabled={lines.length === 1} className="h-9 text-muted-foreground disabled:opacity-30" title="Quitar"><X size={15} /></button>
            </div>
          );
        })}
        <button onClick={() => setLines(ls => [...ls, { ingredientId: 0, quantity: '', totalCost: '' }])} className="text-xs font-semibold text-brand-primary flex items-center gap-1"><Plus size={12} /> Otro ingrediente</button>
      </div>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={updateCost} onChange={e => setUpdateCost(e.target.checked)} /> Actualizar el costo de cada ingrediente con el de esta compra (recalcula el costo de los productos)</label>
      <p className="text-[11px] text-muted-foreground">Esto suma al inventario. El pago al proveedor se sigue registrando en Finanzas → Gastos.</p>
      <button onClick={save} disabled={busy || valid.length === 0} className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-40" data-purchase-save>Registrar compra{total ? ` · ${formatPrice(total)}` : ''}</button>
    </Modal>
  );
};

const AdjustModal = ({ ingredient, kind, onClose, onSaved }: { ingredient: any; kind: 'merma' | 'ajuste'; onClose: () => void; onSaved: () => void }) => {
  const [qty, setQty] = useState('');
  const [sign, setSign] = useState<1 | -1>(kind === 'merma' ? -1 : 1);
  const [notes, setNotes] = useState('');
  const save = async () => { try { await api.adjustIngredient({ ingredientId: ingredient.id, kind, quantity: sign * Math.abs(Number(qty) || 0), notes }); toast.success('Inventario actualizado'); onSaved(); } catch (e: any) { toast.error(e.message); } };
  return (
    <Modal title={`${kind === 'merma' ? 'Merma' : 'Ajuste'} · ${ingredient.name}`} onClose={onClose}>
      {kind === 'ajuste' && <div className="flex gap-1.5"><Chip active={sign === 1} onClick={() => setSign(1)}>Sumar</Chip><Chip active={sign === -1} onClick={() => setSign(-1)}>Restar</Chip></div>}
      <div><label className={LABEL}>Cantidad ({unitLabel(ingredient.unit)})</label><input type="number" min={0} value={qty} onChange={e => setQty(e.target.value)} className={cn(INPUT, 'font-mono')} autoFocus /></div>
      <div><label className={LABEL}>Motivo</label><input value={notes} onChange={e => setNotes(e.target.value)} placeholder={kind === 'merma' ? 'Ej. se dañó, se venció, se cayó' : 'Ej. corrección'} className={INPUT} /></div>
      <button onClick={save} disabled={!(Number(qty) > 0)} className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-40">Guardar</button>
    </Modal>
  );
};

/** Inventario: stock actual, alertas, compras, conteo y movimientos. */
export const StockTab = () => {
  const user = useStore(s => s.user);
  const canEdit = canDo(user, 'edit_menu');
  const [ings, setIngs] = useState<any[]>([]);
  const [mov, setMov] = useState<any[]>([]);
  const [kind, setKind] = useState('');
  const [purchase, setPurchase] = useState(false);
  const [counting, setCounting] = useState(false);
  const [counts, setCounts] = useState<Record<number, string>>({});
  const load = () => { api.getIngredients().then(setIngs).catch(e => toast.error(e.message)); api.getIngredientMovements(kind ? { kind } : {}).then(r => setMov(r.movements)).catch(() => {}); };
  useEffect(() => { load(); }, [kind]);
  const tracked = ings.filter(i => i.trackStock);
  const low = tracked.filter(i => i.low);
  const value = tracked.reduce((a, i) => a + Math.max(0, i.stock) * i.cost, 0);
  const saveCount = async () => {
    try { const r = await api.countInventory(Object.entries(counts).filter(([, v]) => v !== '').map(([id, v]) => ({ ingredientId: Number(id), counted: Number(v) }))); toast.success(`Conteo guardado: ${r.adjusted} ingrediente(s) ajustado(s)`); setCounting(false); setCounts({}); load(); }
    catch (e: any) { toast.error(e.message); }
  };
  return (
    <div className="space-y-3" data-stock-tab>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <KpiCard label="Ingredientes con stock" value={String(tracked.length)} />
        <KpiCard label="Valor del inventario" value={formatPrice(Math.round(value))} />
        <KpiCard label="Bajo el mínimo" value={String(low.length)} className={low.length ? 'bg-red-50 border-red-200' : ''} />
        <KpiCard label="Agotados" value={String(tracked.filter(i => i.stock <= 0).length)} />
      </div>
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setPurchase(true)} className="px-4 py-2 rounded-lg bg-brand-button text-brand-on-button text-xs font-bold flex items-center gap-1.5" data-stock-purchase><PackagePlus size={14} /> Ingresar compra</button>
          <button onClick={() => setCounting(c => !c)} className={cn('px-4 py-2 rounded-lg border text-xs font-bold flex items-center gap-1.5', counting ? 'bg-brand-card border-brand-primary' : 'border-border bg-white')} data-stock-count><ClipboardCheck size={14} /> Conteo de inventario</button>
        </div>
      )}
      {low.length > 0 && <p className="text-xs bg-red-50 border border-red-200 text-red-800 rounded-lg px-3 py-2 flex items-center gap-1.5"><AlertTriangle size={13} /> Por pedir: {low.map(i => `${i.name} (${fmtQty(i.stock)} ${unitLabel(i.unit)})`).join(' · ')}</p>}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-brand-card text-xs text-muted-foreground"><tr><th className="text-left px-4 py-2">Ingrediente</th><th className="text-left px-3 py-2">Categoría</th><th className="text-right px-3 py-2">Stock</th><th className="text-right px-3 py-2">Mínimo</th><th className="text-right px-3 py-2">Valor</th>{counting && <th className="text-right px-4 py-2">Contado</th>}</tr></thead>
          <tbody>{tracked.map(i => (
            <tr key={i.id} className={cn('border-t border-border', i.low && 'bg-red-50/40')}>
              <td className="px-4 py-2 font-semibold uppercase">{i.name}</td><td className="px-3 py-2 text-xs text-muted-foreground uppercase">{i.category}</td>
              <td className={cn('px-3 py-2 text-right font-semibold', i.low && 'text-red-700')}>{fmtQty(i.stock)} {unitLabel(i.unit)}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{i.minStock ? fmtQty(i.minStock) : '-'}</td>
              <td className="px-3 py-2 text-right">{formatPrice(Math.round(Math.max(0, i.stock) * i.cost))}</td>
              {counting && <td className="px-4 py-1.5 text-right"><input type="number" min={0} value={counts[i.id] ?? ''} onChange={e => setCounts(c => ({ ...c, [i.id]: e.target.value }))} placeholder={fmtQty(i.stock)} className="w-24 px-2 py-1 rounded border border-border text-right font-mono text-sm" data-count-input={i.name} /></td>}
            </tr>
          ))}</tbody>
        </table></div>
        {tracked.length === 0 && <p className="p-6 text-center text-xs text-muted-foreground">No hay ingredientes con control de stock.</p>}
        {counting && <div className="p-3 border-t border-border flex flex-wrap items-center gap-2"><p className="text-xs text-muted-foreground flex-1">Escribe lo que hay físicamente; solo se ajustan los que llenes. La diferencia queda como movimiento "Conteo".</p><button onClick={saveCount} className="px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-xs font-bold" data-count-save>Guardar conteo</button></div>}
      </div>
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-3 py-2 bg-brand-card flex items-center justify-between gap-2 flex-wrap"><p className="text-xs font-bold uppercase">Movimientos</p>
          <div className="flex gap-1 flex-wrap">{[['', 'Todos'], ['compra', 'Compras'], ['venta', 'Ventas'], ['merma', 'Mermas'], ['conteo', 'Conteos'], ['ajuste', 'Ajustes']].map(([k, l]) => <Chip key={k} active={kind === k} onClick={() => setKind(k)}>{l}</Chip>)}</div></div>
        <div className="max-h-96 overflow-y-auto">
          {mov.length === 0 ? <p className="p-4 text-xs text-muted-foreground">Sin movimientos.</p> : mov.map(m => (
            <div key={m.id} className="flex justify-between gap-2 px-3 py-1.5 text-xs border-t border-border">
              <span><b className="uppercase">{m.ingredient}</b> · {KIND_LABEL[m.kind] || m.kind} · {fmtDate(m.date)}{m.orderId ? ` · venta #${m.orderId}` : ''}{m.supplierName ? ` · ${m.supplierName}` : ''}{m.notes ? ` · ${m.notes}` : ''}</span>
              <span className={cn('font-semibold whitespace-nowrap', m.quantity < 0 ? 'text-red-700' : 'text-emerald-700')}>{m.quantity > 0 ? '+' : ''}{fmtQty(m.quantity)} {unitLabel(m.unit)}{m.totalCost ? ` · ${formatPrice(Math.abs(m.totalCost))}` : ''}</span>
            </div>
          ))}
        </div>
      </div>
      {purchase && <PurchaseModal onClose={() => setPurchase(false)} onSaved={() => { setPurchase(false); load(); }} />}
    </div>
  );
};

/* ======================================================================
 * Recetas y costos: costo, ganancia y margen de cada producto; editor de receta
 * ====================================================================== */
export const RecipesTab = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [only, setOnly] = useState<'all' | 'with' | 'without'>('all');
  const [open, setOpen] = useState<any | null>(null);
  const load = () => api.getRecipes().then(setRows).catch(e => toast.error(e.message));
  useEffect(() => { load(); }, []);
  const cats = [...new Set(rows.map(r => r.category).filter(Boolean))];
  const shown = rows.filter(r => (!q || r.name.toLowerCase().includes(q.toLowerCase())) && (!cat || r.category === cat) && (only === 'all' || (only === 'with' ? r.hasRecipe : !r.hasRecipe)));
  const withCost = rows.filter(r => r.cost > 0);
  const avgMargin = withCost.length ? withCost.reduce((a, r) => a + r.margin, 0) / withCost.length : 0;
  return (
    <div className="space-y-3" data-recipes-tab>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <KpiCard label="Productos con receta" value={`${rows.filter(r => r.hasRecipe).length} de ${rows.length}`} />
        <KpiCard label="Margen promedio" value={pct(avgMargin)} sub="de los que tienen costo" />
        <KpiCard label="Margen bajo (< 30 %)" value={String(withCost.filter(r => r.margin < 30).length)} className={withCost.some(r => r.margin < 30) ? 'bg-red-50 border-red-200' : ''} />
        <KpiCard label="Sin costo" value={String(rows.filter(r => !r.cost).length)} sub="no se sabe cuánto ganan" />
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar producto" className={cn(INPUT, 'pl-8')} /></div>
        <NiceSelect value={cat} onChange={e => setCat(e.target.value)} className="py-2 text-xs"><option value="">Todas las categorías</option>{cats.map(c => <option key={c} value={c}>{c}</option>)}</NiceSelect>
        <div className="flex gap-1"><Chip active={only === 'all'} onClick={() => setOnly('all')}>Todos</Chip><Chip active={only === 'with'} onClick={() => setOnly('with')}>Con receta</Chip><Chip active={only === 'without'} onClick={() => setOnly('without')}>Sin receta</Chip></div>
      </div>
      <div className="bg-card rounded-xl border border-border overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm">
        <thead className="bg-brand-card text-xs text-muted-foreground"><tr><th className="text-left px-4 py-2">Producto</th><th className="text-right px-3 py-2">Precio</th><th className="text-right px-3 py-2">Costo</th><th className="text-right px-3 py-2">Ganancia</th><th className="text-right px-3 py-2">Margen</th><th className="text-right px-4 py-2">Receta</th></tr></thead>
        <tbody>{shown.map(r => (
          <tr key={r.id} onClick={() => setOpen(r)} className="border-t border-border hover:bg-brand-card/50 cursor-pointer" data-recipe-row={r.name}>
            <td className="px-4 py-2"><span className="font-semibold uppercase">{r.name}</span><span className="block text-[10px] text-muted-foreground">{r.category}</span></td>
            <td className="px-3 py-2 text-right">{formatPrice(r.price)}</td>
            <td className="px-3 py-2 text-right">{r.cost ? formatPrice(r.cost) : <span className="text-muted-foreground">—</span>}</td>
            <td className="px-3 py-2 text-right">{r.cost ? formatPrice(r.profit) : '—'}</td>
            <td className={cn('px-3 py-2 text-right font-bold', marginClass(r.margin, r.cost > 0))}>{r.cost ? pct(r.margin) : '—'}</td>
            <td className="px-4 py-2 text-right text-xs">{r.hasRecipe ? <span className="text-emerald-700 font-semibold">{r.recipeItems} ingr.</span> : <span className="text-brand-primary font-semibold">+ Crear</span>}</td>
          </tr>
        ))}</tbody>
      </table></div></div>
      {open && <RecipeEditor product={open} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); }} />}
    </div>
  );
};

const RecipeEditor = ({ product, onClose, onSaved }: { product: any; onClose: () => void; onSaved: () => void }) => {
  const user = useStore(s => s.user);
  const canEdit = canDo(user, 'edit_menu');
  const [ings, setIngs] = useState<any[]>([]);
  const [items, setItems] = useState<Array<{ ingredientId: number; quantity: string }>>([]);
  const [target, setTarget] = useState('65');
  const [newIng, setNewIng] = useState(false);
  const [busy, setBusy] = useState(false);
  const loadIngs = () => api.getIngredients().then(setIngs).catch(() => {});
  useEffect(() => {
    loadIngs();
    api.getRecipe(product.id).then(r => setItems(r.items.map((i: any) => ({ ingredientId: i.ingredientId, quantity: String(i.quantity) })))).catch(() => {});
  }, [product.id]);
  const lineCost = (l: { ingredientId: number; quantity: string }) => { const i = ings.find(x => x.id === l.ingredientId); return i ? Number(l.quantity || 0) * i.cost * (1 + (i.wastePct || 0) / 100) : 0; };
  const cost = Math.round(items.reduce((a, l) => a + lineCost(l), 0));
  const profit = product.price - cost;
  const margin = product.price ? (profit / product.price) * 100 : 0;
  const suggested = Number(target) > 0 && Number(target) < 100 ? Math.ceil(cost / (1 - Number(target) / 100) / 100) * 100 : 0;
  const setItem = (k: number, p: any) => setItems(xs => xs.map((x, i) => (i === k ? { ...x, ...p } : x)));
  const save = async () => {
    setBusy(true);
    try { const r = await api.saveRecipe(product.id, items.filter(i => i.ingredientId && Number(i.quantity) > 0).map(i => ({ ingredientId: i.ingredientId, quantity: Number(i.quantity) }))); toast.success(`Receta guardada · costo ${formatPrice(r.recipeCost)}`); onSaved(); }
    catch (e: any) { toast.error(e.message); }
    setBusy(false);
  };
  return (
    <Modal title={`Receta · ${product.name}`} onClose={onClose} wide>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-recipe-editor>
        <KpiCard label="Precio de venta" value={formatPrice(product.price)} />
        <KpiCard label="Costo (receta)" value={formatPrice(cost)} />
        <KpiCard label="Ganancia por unidad" value={formatPrice(profit)} className={profit < 0 ? 'bg-red-50 border-red-200' : ''} />
        <KpiCard label="Margen" value={pct(margin)} sub={`Costo de comida ${pct(product.price ? (cost / product.price) * 100 : 0)}`} className={cn(margin < 30 ? 'bg-red-50 border-red-200' : margin < 55 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200')} />
      </div>
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1fr_110px_90px_28px] gap-2 px-3 py-2 bg-brand-card text-[11px] font-bold text-muted-foreground uppercase"><span>Ingrediente</span><span>Cantidad</span><span className="text-right">Costo</span><span /></div>
        {items.length === 0 && <p className="px-3 py-3 text-xs text-muted-foreground">Agrega los ingredientes que lleva una unidad de este producto (por ejemplo: 1 pan brioche, 0,15 kg de carne, 2 lonjas de queso).</p>}
        {items.map((l, k) => {
          const ing = ings.find(x => x.id === l.ingredientId);
          return (
            <div key={k} className="grid grid-cols-[1fr_110px_90px_28px] gap-2 px-3 py-1.5 items-center border-t border-border">
              <NiceSelect value={String(l.ingredientId || 0)} onChange={e => setItem(k, { ingredientId: Number(e.target.value) })} className="text-xs py-1.5" data-recipe-ing={k} disabled={!canEdit}>
                <option value="0">Elige ingrediente…</option>{ings.map(i => <option key={i.id} value={String(i.id)}>{i.name} · {formatPrice(i.cost)}/{unitLabel(i.unit)}</option>)}
              </NiceSelect>
              <div className="flex items-center gap-1"><input type="number" min={0} step="any" value={l.quantity} onChange={e => setItem(k, { quantity: e.target.value })} className="w-full px-2 py-1.5 rounded border border-border text-xs font-mono" data-recipe-qty={k} disabled={!canEdit} /><span className="text-[10px] text-muted-foreground w-8">{ing ? unitLabel(ing.unit) : ''}</span></div>
              <span className="text-right text-xs font-semibold">{formatPrice(Math.round(lineCost(l)))}</span>
              {canEdit ? <button onClick={() => setItems(xs => xs.filter((_, i) => i !== k))} className="text-muted-foreground hover:text-red-600" title="Quitar"><X size={14} /></button> : <span />}
            </div>
          );
        })}
        {canEdit && <div className="px-3 py-2 border-t border-border flex gap-3"><button onClick={() => setItems(xs => [...xs, { ingredientId: 0, quantity: '1' }])} className="text-xs font-semibold text-brand-primary flex items-center gap-1" data-recipe-add><Plus size={12} /> Agregar ingrediente</button><button onClick={() => setNewIng(true)} className="text-xs font-semibold text-muted-foreground">Crear ingrediente nuevo</button></div>}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs bg-brand-card rounded-lg px-3 py-2">
        <TrendingUp size={14} className="text-brand-primary" /> Para ganar el <input type="number" min={1} max={95} value={target} onChange={e => setTarget(e.target.value)} className="w-14 px-1.5 py-0.5 rounded border border-border font-mono text-center" /> % el precio debería ser <b>{suggested ? formatPrice(suggested) : '—'}</b>{suggested > 0 && product.price < suggested ? <span className="text-amber-700">(hoy está por debajo)</span> : suggested > 0 ? <span className="text-emerald-700">(el precio actual lo cumple)</span> : null}
      </div>
      <p className="text-[11px] text-muted-foreground">La merma de cada ingrediente ya está incluida en el costo. Al vender, el inventario descuenta estas cantidades por cada unidad.</p>
      {canEdit && <button onClick={save} disabled={busy} className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-40" data-recipe-save><ChefHat size={14} className="inline mr-1" /> Guardar receta</button>}
      {newIng && <IngredientForm ingredient={null} categories={[...new Set(ings.map(i => i.category))]} onClose={() => setNewIng(false)} onSaved={i => { setNewIng(false); loadIngs().then(() => setItems(xs => [...xs, { ingredientId: i.id, quantity: '1' }])); }} />}
    </Modal>
  );
};

/* ======================================================================
 * Rentabilidad: cuánto se vende, cuánto cuesta y cuánto se gana
 * ====================================================================== */
function periodRange(k: string, custom: { from: string; to: string }) {
  const t = getColombiaTodayStr();
  const d = new Date(`${t}T12:00:00`);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  if (k === 'today') return { from: t, to: t };
  if (k === 'week') { const s = new Date(d); s.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return { from: iso(s), to: t }; }
  if (k === 'month') return { from: `${t.slice(0, 7)}-01`, to: t };
  if (k === 'prev') { const s = new Date(d.getFullYear(), d.getMonth() - 1, 1, 12); const e = new Date(d.getFullYear(), d.getMonth(), 0, 12); return { from: iso(s), to: iso(e) }; }
  return custom;
}

export const ProfitTab = () => {
  const branches = useStore(s => s.branches);
  const [period, setPeriod] = useState('month');
  const [custom, setCustom] = useState({ from: `${getColombiaTodayStr().slice(0, 7)}-01`, to: getColombiaTodayStr() });
  const [branch, setBranch] = useState('');
  const [data, setData] = useState<any>(null);
  const [sort, setSort] = useState<'profit' | 'revenue' | 'margin' | 'units'>('profit');
  const range = periodRange(period, custom);
  useEffect(() => { setData(null); api.getProfitability({ ...range, branch: branch || undefined }).then(setData).catch(e => toast.error(e.message)); }, [range.from, range.to, branch]);
  const products = data ? [...data.products].sort((a: any, b: any) => (b[sort] || 0) - (a[sort] || 0)) : [];
  const exportXlsx = () => data && downloadXlsx(`rentabilidad-${range.from}-${range.to}.xlsx`, [
    { name: 'Productos', headers: ['Producto', 'Categoría', 'Unidades', 'Venta', 'Costo', 'Ganancia', 'Margen %', 'Tiene receta'], rows: products.map((p: any) => [p.name, p.category, p.units, p.revenue, p.cost, p.profit, p.margin, p.hasRecipe ? 'Sí' : 'No']) },
    { name: 'Categorías', headers: ['Categoría', 'Unidades', 'Venta', 'Costo', 'Ganancia', 'Margen %'], rows: data.categories.map((c: any) => [c.category, c.units, c.revenue, c.cost, c.profit, c.margin]) },
  ]);
  return (
    <div className="space-y-3" data-profit-tab>
      <div className="flex flex-wrap items-center gap-1.5">
        {[['today', 'Hoy'], ['week', 'Esta semana'], ['month', 'Este mes'], ['prev', 'Mes anterior'], ['custom', 'Personalizado']].map(([k, l]) => <Chip key={k} active={period === k} onClick={() => setPeriod(k)}>{l}</Chip>)}
        {period === 'custom' && <><input type="date" value={custom.from} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} className="px-2 py-1 rounded-lg border border-border text-xs" /><input type="date" value={custom.to} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} className="px-2 py-1 rounded-lg border border-border text-xs" /></>}
        {branches.length > 1 && <NiceSelect value={branch} onChange={e => setBranch(e.target.value)} className="py-1.5 text-xs"><option value="">Sede actual</option><option value="all">Todas las sedes</option>{branches.map(b => <option key={b.id} value={String(b.id)}>{b.name}</option>)}</NiceSelect>}
        <button onClick={exportXlsx} disabled={!data} className="ml-auto px-3 py-1.5 rounded-lg border border-border bg-white text-xs font-semibold flex items-center gap-1 disabled:opacity-40"><Download size={12} /> Excel</button>
      </div>
      {!data ? <p className="text-xs text-muted-foreground">Calculando…</p> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2" data-profit-kpis>
            <KpiCard label="Ventas" value={formatPrice(data.totals.revenue)} sub={`${fmtDate(data.from)} – ${fmtDate(data.to)}`} />
            <KpiCard label="Costo de lo vendido" value={formatPrice(data.totals.cost)} sub={`Costo de comida ${pct(data.totals.foodCost)}`} />
            <KpiCard label="Ganancia bruta" value={formatPrice(data.totals.profit)} className="bg-emerald-50 border-emerald-200" />
            <KpiCard label="Margen" value={pct(data.totals.margin)} />
            <KpiCard label="Descuentos dados" value={formatPrice(data.totals.discounts)} sub={`Ganancia tras descuentos ${formatPrice(data.totals.profitAfterDiscounts)}`} />
          </div>
          {data.withoutCost.count > 0 && <p className="text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2 flex items-center gap-1.5"><AlertTriangle size={13} /> {data.withoutCost.count} producto(s) vendidos no tienen costo ({formatPrice(data.withoutCost.revenue)} en ventas): su ganancia aparece como el 100 %. Crea su receta en <b>Recetas y costos</b>.</p>}
          <div className="grid lg:grid-cols-[2fr_1fr] gap-3">
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="px-3 py-2 bg-brand-card flex items-center justify-between gap-2 flex-wrap"><p className="text-xs font-bold uppercase">Por producto</p>
                <div className="flex gap-1">{[['profit', 'Ganancia'], ['revenue', 'Venta'], ['margin', 'Margen'], ['units', 'Unidades']].map(([k, l]) => <Chip key={k} active={sort === k} onClick={() => setSort(k as any)}>{l}</Chip>)}</div></div>
              <div className="overflow-x-auto"><table className="w-full text-xs">
                <thead className="text-muted-foreground"><tr><th className="text-left px-3 py-1.5">Producto</th><th className="text-right px-2">Unid.</th><th className="text-right px-2">Venta</th><th className="text-right px-2">Costo</th><th className="text-right px-2">Ganancia</th><th className="text-right px-3">Margen</th></tr></thead>
                <tbody>{products.map((p: any) => (
                  <tr key={p.productId} className="border-t border-border" data-profit-row={p.name}>
                    <td className="px-3 py-1.5 uppercase font-semibold">{p.name}{!p.hasCost && <span className="ml-1 text-[9px] px-1 rounded bg-amber-100 text-amber-800 normal-case">sin costo</span>}</td>
                    <td className="px-2 text-right">{fmtQty(p.units)}</td><td className="px-2 text-right">{formatPrice(p.revenue)}</td><td className="px-2 text-right">{formatPrice(p.cost)}</td>
                    <td className="px-2 text-right font-bold">{formatPrice(p.profit)}</td><td className={cn('px-3 text-right font-bold', marginClass(p.margin, p.hasCost))}>{pct(p.margin)}</td>
                  </tr>
                ))}</tbody>
              </table></div>
              {products.length === 0 && <p className="p-4 text-xs text-muted-foreground text-center">Sin ventas cerradas en el período.</p>}
            </div>
            <div className="bg-card rounded-xl border border-border overflow-hidden h-max">
              <p className="px-3 py-2 bg-brand-card text-xs font-bold uppercase">Por categoría</p>
              {data.categories.map((c: any) => (
                <div key={c.category} className="px-3 py-2 border-t border-border text-xs">
                  <div className="flex justify-between"><span className="font-semibold uppercase">{c.category}</span><span className="font-bold">{formatPrice(c.profit)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>{fmtQty(c.units)} unid. · venta {formatPrice(c.revenue)}</span><span className={marginClass(c.margin)}>{pct(c.margin)}</span></div>
                  <div className="h-1.5 bg-gray-100 rounded mt-1"><div className="h-1.5 rounded bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, c.margin))}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">La venta es el precio de cada producto antes de los descuentos de la cuenta; el costo es el de la receta en el momento de la venta. Para ver la utilidad final (con gastos, nómina e impuestos) usa Finanzas → Estado de resultados.</p>
        </>
      )}
    </div>
  );
};
