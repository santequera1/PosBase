import { useEffect, useMemo, useState } from 'react';
import { ListTree, Settings2, Plus, Edit2, Trash2, ChevronDown, ChevronRight, Search, Save, Info, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Chip, Modal, INPUT, LABEL } from '@/components/common/Primitives';
import { downloadXlsx } from '@/lib/xlsx';

interface Account { code: string; name: string; level: number; parentCode: string | null; nature: 'D' | 'C'; active: boolean; isSystem: boolean; used: number }
type View = 'plan' | 'config';

const CLASS_NAME: Record<string, string> = { '1': 'Activo', '2': 'Pasivo', '3': 'Patrimonio', '4': 'Ingresos', '5': 'Gastos', '6': 'Costos de ventas', '7': 'Costos de producción', '8': 'Cuentas de orden deudoras', '9': 'Cuentas de orden acreedoras' };
const LEVEL_LABEL: Record<number, string> = { 1: 'Clase', 2: 'Grupo', 4: 'Cuenta', 6: 'Subcuenta', 8: 'Auxiliar' };

/** Plan de cuentas (PUC) con árbol navegable y configuración de cuentas contables por evento y por categoría de gasto. */
const AccountsTab = () => {
  const [view, setView] = useState<View>('plan');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([api.getAccounts(true), api.getAcctConfig()]).then(([a, c]) => { setAccounts(a); setConfig(c); }).catch(e => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Chip active={view === 'plan'} onClick={() => setView('plan')}><span className="flex items-center gap-1"><ListTree size={13} /> Plan de cuentas (PUC)</span></Chip>
        <Chip active={view === 'config'} onClick={() => setView('config')}><span className="flex items-center gap-1"><Settings2 size={13} /> Configuración de cuentas contables</span></Chip>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {loading ? <p className="text-xs text-muted-foreground">Cargando plan de cuentas...</p> : view === 'plan'
        ? <PlanView accounts={accounts} reload={load} />
        : <ConfigView config={config} accounts={accounts} reload={load} />}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Plan de cuentas                                                      */
/* ------------------------------------------------------------------ */
const PlanView = ({ accounts, reload }: { accounts: Account[]; reload: () => void }) => {
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [modal, setModal] = useState<{ mode: 'new' | 'edit'; account?: Account; parent?: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState('');

  const byParent = useMemo(() => {
    const m = new Map<string, Account[]>();
    for (const a of accounts) { const k = a.parentCode || ''; m.set(k, [...(m.get(k) || []), a]); }
    return m;
  }, [accounts]);
  const q = search.trim().toLowerCase();
  const matches = (a: Account) => !q || a.code.startsWith(q) || a.name.toLowerCase().includes(q);
  const visible = (a: Account): boolean => (showInactive || a.active) && (matches(a) || (byParent.get(a.code) || []).some(visible));
  const hasChildren = (a: Account) => (byParent.get(a.code) || []).length > 0;
  const isOpen = (a: Account) => q ? true : (open[a.code] ?? a.level <= 1);
  const toggle = (code: string) => setOpen(o => ({ ...o, [code]: !(o[code] ?? (code.length <= 1)) }));

  const remove = async (a: Account) => {
    if (confirmDelete !== a.code) { setConfirmDelete(a.code); setTimeout(() => setConfirmDelete(null), 3000); return; }
    try { await api.deleteAccount(a.code); setConfirmDelete(null); reload(); } catch (e: any) { setError(e.message); }
  };
  const exportXlsx = () => downloadXlsx('plan_de_cuentas', [{ name: 'PUC', headers: ['Código', 'Nombre', 'Nivel', 'Naturaleza', 'Activa', 'Movimientos'], rows: accounts.map(a => [a.code, a.name, LEVEL_LABEL[a.level] || a.level, a.nature === 'D' ? 'Débito' : 'Crédito', a.active ? 'Sí' : 'No', a.used]), widths: [12, 48, 12, 12, 8, 12] }]);

  const renderRows = (parent: string, depth: number): any[] => (byParent.get(parent) || []).filter(visible).flatMap(a => {
    const kids = hasChildren(a);
    const row = (
      <tr key={a.code} className={cn('border-t border-border', !a.active && 'opacity-50', a.level <= 2 && 'bg-brand-card/60')}>
        <td className="px-3 py-1.5 whitespace-nowrap font-mono text-[11px]" style={{ paddingLeft: 12 + depth * 16 }}>
          <button type="button" onClick={() => kids && toggle(a.code)} className={cn('inline-flex items-center gap-1', kids ? 'text-brand-dark' : 'text-muted-foreground cursor-default')}>
            {kids ? (isOpen(a) ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : <span className="w-3 inline-block" />}
            {a.code}
          </button>
        </td>
        <td className={cn('px-3 py-1.5', a.level <= 2 ? 'font-bold text-brand-dark' : a.level === 4 ? 'font-semibold' : '')}>{a.name}{a.isSystem && a.level >= 6 && <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">sistema</span>}</td>
        <td className="px-3 py-1.5 text-center text-[10px] text-muted-foreground hidden sm:table-cell">{LEVEL_LABEL[a.level]}</td>
        <td className="px-3 py-1.5 text-center text-[10px]"><span className={cn('px-1.5 py-0.5 rounded-full font-semibold', a.nature === 'D' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800')}>{a.nature === 'D' ? 'Débito' : 'Crédito'}</span></td>
        <td className="px-3 py-1.5 text-right text-[10px] text-muted-foreground hidden sm:table-cell">{a.used || ''}</td>
        <td className="px-2 py-1 whitespace-nowrap text-right">
          {a.level < 8 && <button title="Agregar cuenta hija" onClick={() => setModal({ mode: 'new', parent: a.code })} className="p-1 rounded text-muted-foreground hover:text-brand-primary"><Plus size={13} /></button>}
          <button title="Editar" onClick={() => setModal({ mode: 'edit', account: a })} className="p-1 rounded text-muted-foreground hover:text-brand-primary"><Edit2 size={13} /></button>
          {!a.isSystem && <button title={a.used ? 'Desactivar' : 'Eliminar'} onClick={() => remove(a)} className={cn('p-1 rounded', confirmDelete === a.code ? 'bg-red-600 text-white' : 'text-muted-foreground hover:text-red-600')}><Trash2 size={13} /></button>}
        </td>
      </tr>
    );
    return isOpen(a) ? [row, ...renderRows(a.code, depth + 1)] : [row];
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por código o nombre (ej. 1105, caja, proveedores)" className={cn(INPUT, 'pl-8 py-1.5 text-xs')} /></div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> Ver inactivas</label>
        <button onClick={() => setOpen({})} className="px-3 py-1.5 rounded-lg border border-border text-xs">Contraer</button>
        <button onClick={exportXlsx} className="px-3 py-1.5 rounded-lg border border-border text-xs">Excel</button>
        <button onClick={() => setModal({ mode: 'new' })} className="px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-xs font-semibold flex items-center gap-1.5 shadow-fab"><Plus size={14} /> Nueva cuenta</button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <p className="text-[11px] text-muted-foreground flex items-start gap-1"><Info size={12} className="mt-0.5 shrink-0" /> Plan Único de Cuentas para comerciantes (Decreto 2650) con auxiliares propios del negocio. Los movimientos se registran en subcuentas (6 dígitos) o auxiliares (8 dígitos). Las cuentas con movimientos no se eliminan: se desactivan.</p>
      <div className="bg-card rounded-xl border border-border shadow-card overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-muted-foreground bg-muted/30"><th className="px-3 py-2 text-left font-semibold">Código</th><th className="px-3 py-2 text-left font-semibold">Nombre</th><th className="px-3 py-2 font-semibold hidden sm:table-cell">Nivel</th><th className="px-3 py-2 font-semibold">Naturaleza</th><th className="px-3 py-2 text-right font-semibold hidden sm:table-cell">Mov.</th><th /></tr></thead>
          <tbody>{renderRows('', 0)}</tbody>
        </table>
      </div>
      {modal && <AccountModal modal={modal} accounts={accounts} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
    </div>
  );
};

const AccountModal = ({ modal, accounts, onClose, onSaved }: { modal: { mode: 'new' | 'edit'; account?: Account; parent?: string }; accounts: Account[]; onClose: () => void; onSaved: () => void }) => {
  const editing = modal.mode === 'edit' ? modal.account : undefined;
  const parent = modal.parent ? accounts.find(a => a.code === modal.parent) : undefined;
  const suggested = useMemo(() => {
    if (!parent) return '';
    const kids = accounts.filter(a => a.parentCode === parent.code).map(a => a.code).sort();
    const width = parent.code.length + 2;
    const last = kids.length ? Number(kids[kids.length - 1].slice(parent.code.length)) : 0;
    return `${parent.code}${String(last + 1).padStart(width - parent.code.length, '0')}`;
  }, [parent, accounts]);
  const [code, setCode] = useState(editing?.code || suggested);
  const [name, setName] = useState(editing?.name || '');
  const [nature, setNature] = useState<'D' | 'C'>(editing?.nature || (parent?.nature || (/^[1567]/.test(suggested) ? 'D' : 'C')));
  const [active, setActive] = useState(editing ? editing.active : true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setSaving(true); setError('');
    try {
      if (editing) await api.updateAccount(editing.code, { name, nature, active });
      else await api.addAccount({ code: code.trim(), name: name.trim(), nature });
      onSaved();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };
  return (
    <Modal title={editing ? `Editar cuenta ${editing.code}` : parent ? `Nueva cuenta bajo ${parent.code} · ${parent.name}` : 'Nueva cuenta'} onClose={onClose}>
      <div className="grid grid-cols-3 gap-3">
        <div><label className={LABEL}>Código</label><input value={code} disabled={!!editing} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))} className={cn(INPUT, 'font-mono')} placeholder="110505" /></div>
        <div className="col-span-2"><label className={LABEL}>Nombre</label><input value={name} onChange={e => setName(e.target.value)} className={INPUT} placeholder="Ej: Banco Bancolombia cta. 123" /></div>
        <div className="col-span-3"><label className={LABEL}>Naturaleza</label>
          <div className="flex gap-2"><Chip active={nature === 'D'} onClick={() => setNature('D')}>Débito (activo, costo, gasto)</Chip><Chip active={nature === 'C'} onClick={() => setNature('C')}>Crédito (pasivo, patrimonio, ingreso)</Chip></div></div>
        {editing && <label className="col-span-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Cuenta activa (disponible para registrar movimientos)</label>}
      </div>
      <p className="text-[10px] text-muted-foreground">2 dígitos = grupo · 4 = cuenta · 6 = subcuenta · 8 = auxiliar. La cuenta superior debe existir.</p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button onClick={save} disabled={saving || name.trim().length < 2 || !/^\d{2}$|^\d{4}$|^\d{6}$|^\d{8}$/.test(code)} className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-40">{saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear cuenta'}</button>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Configuración de cuentas contables                                   */
/* ------------------------------------------------------------------ */
const GROUPS: Array<{ title: string; keys: string[] }> = [
  { title: 'Recaudos (dónde entra el dinero)', keys: ['cash', 'bank', 'transfer', 'card', 'cashDepositSource'] },
  { title: 'Ventas', keys: ['salesIncome', 'deliveryIncome', 'salesTaxINC', 'salesTaxIVA', 'tipsPayable', 'customerReceivable', 'platformReceivable'] },
  { title: 'Compras y gastos', keys: ['purchases', 'inventory', 'cogs', 'purchaseIVA', 'retentionPayable', 'supplierPayable', 'expensePayable'] },
  { title: 'Nómina', keys: ['payrollExpense', 'payrollExtras', 'payrollAllowance', 'payrollBonus', 'payrollHealth', 'payrollPension', 'payrollPayable', 'employeeAdvances'] },
  { title: 'Caja', keys: ['cashShortage', 'cashOverage', 'cashWithdrawalOther'] },
  { title: 'Patrimonio', keys: ['ownerEquity', 'retainedEarnings', 'currentEarnings'] },
];

const AccountSelect = ({ value, onChange, accounts, className }: { value: string; onChange: (v: string) => void; accounts: Account[]; className?: string }) => (
  <select value={value} onChange={e => onChange(e.target.value)} className={cn(INPUT, 'py-1.5 text-xs font-mono', className)}>
    {!accounts.some(a => a.code === value) && <option value={value}>{value} (no existe)</option>}
    {accounts.filter(a => a.active && a.level >= 6).map(a => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
  </select>
);

const ConfigView = ({ config, accounts, reload }: { config: any; accounts: Account[]; reload: () => void }) => {
  const [map, setMap] = useState<Record<string, string>>(config?.map || {});
  const [ivaResponsible, setIva] = useState<boolean>(Boolean(config?.ivaResponsible));
  const [inventoryMethod, setInv] = useState<string>(config?.inventoryMethod || 'periodic');
  const [retentionDefaultPct, setRet] = useState<string>(String(config?.retentionDefaultPct ?? 0));
  const [categories, setCategories] = useState<any[]>(config?.categories || []);
  const [saving, setSaving] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { if (config) { setMap(config.map); setIva(Boolean(config.ivaResponsible)); setInv(config.inventoryMethod || 'periodic'); setRet(String(config.retentionDefaultPct ?? 0)); setCategories(config.categories || []); } }, [config]);
  if (!config) return null;
  const labels: Record<string, string> = config.labels || {};

  const save = async () => {
    setSaving(true); setError(''); setMsg('');
    try {
      await api.updateAcctConfig({ map, ivaResponsible, inventoryMethod, retentionDefaultPct: Number(retentionDefaultPct) || 0, categories: categories.map(c => ({ id: c.id, accountCode: c.accountCode })) });
      setMsg('Configuración guardada. Los asientos nuevos usarán estas cuentas; usa "Recontabilizar" para aplicar a lo ya registrado.');
      reload();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };
  const rebuild = async () => {
    if (!window.confirm('Se borran los asientos automáticos y se vuelven a generar con la configuración actual. Los comprobantes manuales no se tocan. ¿Continuar?')) return;
    setRebuilding(true); setError(''); setMsg('');
    try { const r = await api.rebuildLedger({}); setMsg(r.errors?.length ? `Recontabilizado con ${r.errors.length} advertencia(s): ${r.errors.slice(0, 3).join(' · ')}` : 'Contabilidad regenerada con la configuración actual.'); } catch (e: any) { setError(e.message); }
    setRebuilding(false);
  };

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-3">
        <div className="bg-card rounded-xl border border-border p-4 shadow-card space-y-2">
          <p className="text-xs font-bold text-brand-dark">Régimen de IVA</p>
          <div className="flex gap-2"><Chip active={!ivaResponsible} onClick={() => setIva(false)}>No responsable</Chip><Chip active={ivaResponsible} onClick={() => setIva(true)}>Responsable de IVA</Chip></div>
          <p className="text-[10px] text-muted-foreground">Si es responsable, el IVA de las compras va a IVA descontable (240810); si no, se suma al costo o gasto.</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-card space-y-2">
          <p className="text-xs font-bold text-brand-dark">Método de inventario</p>
          <div className="flex gap-2"><Chip active={inventoryMethod === 'periodic'} onClick={() => setInv('periodic')}>Periódico</Chip><Chip active={inventoryMethod === 'perpetual'} onClick={() => setInv('perpetual')}>Permanente</Chip></div>
          <p className="text-[10px] text-muted-foreground">Periódico: las compras de insumos van a la cuenta de compras (62). Permanente: entran a inventario (1435) y cada venta descarga el costo (6140) con el costo unitario del producto.</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-card space-y-2">
          <p className="text-xs font-bold text-brand-dark">Retención en la fuente por defecto</p>
          <div className="flex items-center gap-2"><input type="number" min={0} max={100} step={0.1} value={retentionDefaultPct} onChange={e => setRet(e.target.value)} className={cn(INPUT, 'w-24 font-mono')} /><span className="text-xs text-muted-foreground">% sobre la base</span></div>
          <p className="text-[10px] text-muted-foreground">Se usa cuando el proveedor no tiene su propio porcentaje. 0 = no practica retención.</p>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-brand-card"><p className="text-sm font-bold text-brand-dark">Cuenta contable por evento</p><p className="text-[11px] text-muted-foreground">Qué cuenta usa el sistema al contabilizar automáticamente cada tipo de movimiento.</p></div>
        <div className="grid md:grid-cols-2 gap-x-6 gap-y-1 p-4">
          {GROUPS.map(g => (
            <div key={g.title} className="space-y-1.5 mb-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-brand-primary">{g.title}</p>
              {g.keys.map(k => (
                <div key={k} className="grid grid-cols-5 gap-2 items-center">
                  <span className="col-span-2 text-xs text-brand-dark">{labels[k] || k}</span>
                  <AccountSelect value={map[k] || ''} onChange={v => setMap(m => ({ ...m, [k]: v }))} accounts={accounts} className="col-span-3" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-brand-card"><p className="text-sm font-bold text-brand-dark">Categorías de gasto → cuenta contable</p><p className="text-[11px] text-muted-foreground">Cada gasto o compra se lleva al débito de la cuenta de su categoría (las compras de insumos van a inventario si el método es permanente).</p></div>
        <div className="grid md:grid-cols-2 gap-x-6 gap-y-1.5 p-4">
          {categories.map(c => (
            <div key={c.id} className="grid grid-cols-5 gap-2 items-center">
              <span className="col-span-2 text-xs text-brand-dark">{c.emoji} {c.name}</span>
              <AccountSelect value={c.accountCode || ''} onChange={v => setCategories(cs => cs.map(x => x.id === c.id ? { ...x, accountCode: v } : x))} accounts={accounts} className="col-span-3" />
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
      {msg && <p className="text-xs text-emerald-700">{msg}</p>}
      <div className="flex flex-wrap gap-2">
        <button onClick={save} disabled={saving} className="px-4 py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold flex items-center gap-1.5 disabled:opacity-40"><Save size={15} /> {saving ? 'Guardando...' : 'Guardar configuración'}</button>
        <button onClick={rebuild} disabled={rebuilding} className="px-4 py-2.5 rounded-xl border border-border text-sm font-semibold text-brand-dark flex items-center gap-1.5 disabled:opacity-40"><RefreshCw size={15} className={rebuilding ? 'animate-spin' : ''} /> {rebuilding ? 'Recontabilizando...' : 'Recontabilizar todo con esta configuración'}</button>
      </div>
    </div>
  );
};

export default AccountsTab;
