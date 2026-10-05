import { useEffect, useMemo, useState } from 'react';
import { Plus, Edit2, Trash2, X, KeyRound, UserX, UserCheck, Check, Info } from 'lucide-react';
import { api } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import { VIEWS, ACTIONS, PROFILES, PROFILE_LABEL, type ViewKey, type ActionKey, type ProfileKey } from '@/lib/permissions';

interface AppUser {
  id: number;
  username: string;
  name: string;
  role: 'admin' | 'cashier' | 'kitchen';
  active: boolean;
  profile: ProfileKey;
  perms: { views: string[]; actions: string[] };
}

const INPUT = 'w-full px-3.5 py-2.5 rounded-lg border border-input bg-card text-sm font-sans outline-none focus:ring-2 focus:ring-primary/20';
const PROFILE_CLASS: Record<string, string> = { admin: 'bg-brand-button/10 text-brand-primary', cashier: 'bg-brand-accent/25 text-brand-dark', waiter: 'bg-sky-100 text-sky-800', kitchen: 'bg-emerald-100 text-emerald-800', courier: 'bg-orange-100 text-orange-800', custom: 'bg-violet-100 text-violet-800' };
const GROUPS = [...new Set(VIEWS.map(v => v.group))];

/** Casilla grande con ícono, título y descripción: se marca con un chulo relleno. */
const PermCheck = ({ checked, disabled, onChange, icon: Icon, label, description, testId }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; icon: any; label: string; description: string; testId?: string }) => (
  <label data-perm={testId} className={cn('flex items-start gap-2.5 p-2.5 rounded-xl border transition-all select-none', disabled ? 'cursor-default' : 'cursor-pointer', checked ? 'border-brand-primary/50 bg-brand-button/5' : 'border-border bg-white hover:bg-muted/30', disabled && 'opacity-70')}>
    <input type="checkbox" className="sr-only" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
    <span className={cn('mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors', checked ? 'bg-brand-button border-brand-button text-brand-on-button' : 'border-border bg-white')}>{checked && <Check size={13} strokeWidth={3} />}</span>
    <span className="min-w-0">
      <span className="flex items-center gap-1.5 text-sm font-semibold text-brand-dark"><Icon size={14} className="shrink-0" /> {label}</span>
      <span className="block text-[11px] text-muted-foreground leading-snug">{description}</span>
    </span>
  </label>
);

const UsersPanel = () => {
  const me = useStore(s => s.user);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [form, setForm] = useState({ username: '', name: '', password: '', profile: 'cashier' as ProfileKey, views: [] as string[], actions: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    api.getUsers().then(setUsers).catch(e => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const applyProfile = (p: ProfileKey) => {
    const t = PROFILES.find(x => x.key === p)!;
    setForm(f => ({ ...f, profile: p, views: p === 'custom' ? f.views : [...t.views], actions: p === 'custom' ? f.actions : [...t.actions] }));
  };
  const toggleView = (k: ViewKey, on: boolean) => setForm(f => ({ ...f, profile: 'custom', views: on ? [...new Set([...f.views, k])] : f.views.filter(v => v !== k) }));
  const toggleAction = (k: ActionKey, on: boolean) => setForm(f => ({ ...f, profile: 'custom', actions: on ? [...new Set([...f.actions, k])] : f.actions.filter(a => a !== k) }));

  const openCreate = () => {
    setEditing(null);
    const t = PROFILES.find(x => x.key === 'cashier')!;
    setForm({ username: '', name: '', password: '', profile: 'cashier', views: [...t.views], actions: [...t.actions] });
    setError('');
    setShowForm(true);
  };
  const openEdit = (u: AppUser) => {
    setEditing(u);
    setForm({ username: u.username, name: u.name, password: '', profile: u.profile, views: [...(u.perms?.views || [])], actions: [...(u.perms?.actions || [])] });
    setError('');
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const payload: any = { name: form.name, profile: form.profile, permissions: { views: form.views, actions: form.actions } };
      if (editing) {
        const updated = await api.updateUser(editing.id, { ...payload, password: form.password || undefined });
        setUsers(us => us.map(u => (u.id === updated.id ? updated : u)));
      } else {
        const created = await api.createUser({ ...payload, username: form.username, password: form.password });
        setUsers(us => [...us, created]);
      }
      setShowForm(false);
    } catch (e: any) {
      setError(e.message || 'No se pudo guardar');
    }
    setSaving(false);
  };

  const toggleActive = async (u: AppUser) => {
    try {
      const updated = await api.updateUser(u.id, { active: !u.active });
      setUsers(us => us.map(x => (x.id === updated.id ? updated : x)));
    } catch (e: any) { setError(e.message); }
  };
  const remove = async (u: AppUser) => {
    if (confirmDelete !== u.id) { setConfirmDelete(u.id); setTimeout(() => setConfirmDelete(null), 3000); return; }
    try {
      const r = await api.deleteUser(u.id);
      if (r.deactivated) setUsers(us => us.map(x => (x.id === u.id ? { ...x, active: false } : x)));
      else setUsers(us => us.filter(x => x.id !== u.id));
      setConfirmDelete(null);
    } catch (e: any) { setError(e.message); }
  };

  const isAdminForm = form.profile === 'admin';
  const summary = useMemo(() => `${form.views.length} de ${VIEWS.length} secciones · ${form.actions.length} de ${ACTIONS.length} acciones`, [form.views, form.actions]);

  return (
    <div className="space-y-4 font-sans">
      <section className="bg-card rounded-xl border border-border p-4 shadow-card space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-sm">👥 Usuarios y permisos</h3>
            <p className="text-xs text-muted-foreground">Cada persona entra con su usuario. Tú decides qué secciones ve y qué puede hacer (anular, descuentos, menú, retiros de caja). Los usuarios con perfil Domiciliario aparecen solos como repartidores para asignarles pedidos.</p>
          </div>
          <button onClick={openCreate} className="px-3 py-2 rounded-lg gradient-primary text-primary-foreground text-xs font-semibold flex items-center gap-1 shadow-fab hover:opacity-90 whitespace-nowrap">
            <Plus size={14} /> Nuevo usuario
          </button>
        </div>

        {error && !showForm && <p className="text-xs text-red-600 font-medium">{error}</p>}

        {loading ? <p className="text-xs text-muted-foreground">Cargando usuarios...</p> : (
          <div className="space-y-2">
            {users.map(u => {
              const prof = PROFILES.find(p => p.key === u.profile) || PROFILES[1];
              const Icon = prof.icon;
              const isMe = me?.name === u.name;
              const viewLabels = u.role === 'admin' ? 'Acceso total' : VIEWS.filter(v => u.perms?.views.includes(v.key)).map(v => v.label).join(', ') || 'Sin secciones';
              return (
                <div key={u.id} className={cn('flex items-center gap-3 p-3 rounded-xl border border-border bg-white', !u.active && 'opacity-55')}>
                  <div className={cn('w-9 h-9 rounded-full flex items-center justify-center shrink-0', PROFILE_CLASS[u.profile] || PROFILE_CLASS.custom)}><Icon size={18} /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-brand-dark truncate">{u.name} {isMe && <span className="text-[10px] text-muted-foreground font-normal">(tú)</span>}</p>
                    <p className="text-[11px] text-muted-foreground truncate"><span className="font-mono">@{u.username}</span> · <span className="font-semibold">{PROFILE_LABEL[u.profile] || u.profile}</span>{!u.active && ' · Desactivado'}</p>
                    <p className="text-[10px] text-muted-foreground truncate" title={viewLabels}>{viewLabels}{u.role !== 'admin' && u.perms?.actions.length ? ` · puede: ${ACTIONS.filter(a => u.perms.actions.includes(a.key)).map(a => a.label.toLowerCase()).join(', ')}` : ''}</p>
                  </div>
                  <button onClick={() => openEdit(u)} title="Editar permisos / contraseña" className="p-2 rounded-lg text-muted-foreground hover:text-brand-primary hover:bg-brand-button/5"><Edit2 size={15} /></button>
                  {!isMe && (
                    <>
                      <button onClick={() => toggleActive(u)} title={u.active ? 'Desactivar acceso' : 'Reactivar acceso'} className="p-2 rounded-lg text-muted-foreground hover:text-brand-primary hover:bg-brand-button/5">{u.active ? <UserX size={15} /> : <UserCheck size={15} />}</button>
                      <button onClick={() => remove(u)} title="Eliminar" className={cn('p-2 rounded-lg', confirmDelete === u.id ? 'bg-red-600 text-white' : 'text-muted-foreground hover:text-red-600 hover:bg-red-50')}><Trash2 size={15} /></button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {confirmDelete !== null && <p className="text-[11px] text-red-600">Pulsa de nuevo el ícono de eliminar para confirmar.</p>}
        <p className="text-[11px] text-muted-foreground flex items-start gap-1.5"><Info size={12} className="mt-0.5 shrink-0" /> Si alguien entra por la dirección de una sección que no tiene habilitada, verá el aviso "No tienes permiso para ver esta sección". Los cambios de permisos aplican al instante, sin que la persona vuelva a entrar.</p>
      </section>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-2xl p-5 shadow-2xl space-y-3 max-h-[94vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm text-brand-dark">{editing ? `Editar a ${editing.name}` : 'Nuevo usuario'}</h4>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><X size={16} /></button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {!editing && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Usuario (para iniciar sesión)</label>
                  <input value={form.username} onChange={e => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s+/g, '') })} placeholder="ej: maria" className={INPUT} />
                </div>
              )}
              <div className={cn(editing && 'sm:col-span-2')}>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Nombre completo</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="María Pérez" className={INPUT} />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Perfil (plantilla de permisos)</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {PROFILES.map(p => {
                  const Icon = p.icon;
                  const active = form.profile === p.key;
                  return (
                    <button key={p.key} type="button" onClick={() => applyProfile(p.key)} data-profile={p.key}
                      className={cn('flex flex-col items-center gap-1 p-2.5 rounded-xl border text-center transition-all', active ? 'border-brand-primary bg-brand-button/5 shadow-card' : 'border-border hover:bg-muted/30')}>
                      <span className={cn('w-8 h-8 rounded-full flex items-center justify-center', PROFILE_CLASS[p.key])}><Icon size={16} /></span>
                      <span className="text-xs font-semibold text-brand-dark">{p.label}</span>
                      <span className="text-[10px] text-muted-foreground leading-tight">{p.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-border p-3 space-y-3 bg-muted/20">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <p className="text-xs font-bold text-brand-dark">Secciones que puede ver</p>
                <span className="text-[11px] text-muted-foreground">{isAdminForm ? 'El administrador ve y puede todo' : summary}</span>
              </div>
              {GROUPS.map(g => (
                <div key={g}>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-brand-primary mb-1.5">{g}</p>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {VIEWS.filter(v => v.group === g).map(v => (
                      <PermCheck key={v.key} testId={`view-${v.key}`} checked={isAdminForm || form.views.includes(v.key)} disabled={isAdminForm} onChange={on => toggleView(v.key, on)} icon={v.icon} label={v.label} description={v.description} />
                    ))}
                  </div>
                </div>
              ))}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-brand-primary mb-1.5">Acciones permitidas</p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {ACTIONS.map(a => (
                    <PermCheck key={a.key} testId={`action-${a.key}`} checked={isAdminForm || form.actions.includes(a.key)} disabled={isAdminForm} onChange={on => toggleAction(a.key, on)} icon={a.icon} label={a.label} description={a.description} />
                  ))}
                </div>
              </div>
              {form.profile === 'custom' && <p className="text-[11px] text-violet-800 bg-violet-50 rounded-lg px-2 py-1">Perfil personalizado: se guardan exactamente las casillas marcadas.</p>}
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><KeyRound size={12} /> {editing ? 'Nueva contraseña (dejar vacío para no cambiarla)' : 'Contraseña'}</label>
              <input type="text" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Mínimo 6 caracteres" className={INPUT} />
            </div>

            {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

            <button onClick={save} disabled={saving || form.name.length < 2 || (!editing && (form.username.length < 3 || form.password.length < 6)) || (!isAdminForm && form.views.length === 0)}
              className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-40">
              {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear usuario'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPanel;
