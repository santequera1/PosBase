import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, X, KeyRound, ShieldCheck, Store, ChefHat, UserX, UserCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';

interface AppUser {
  id: number;
  username: string;
  name: string;
  role: 'admin' | 'cashier' | 'kitchen';
  active: boolean;
}

const ROLE_META: Record<AppUser['role'], { label: string; description: string; icon: any; className: string }> = {
  admin: { label: 'Administrador', description: 'Acceso total: ajustes, finanzas, personal y reportes', icon: ShieldCheck, className: 'bg-brand-primary/10 text-brand-primary' },
  cashier: { label: 'Cajero', description: 'Punto de venta, caja, pedidos y clientes', icon: Store, className: 'bg-brand-accent/25 text-brand-dark' },
  kitchen: { label: 'Cocina / Despacho', description: 'Solo pantalla de pedidos en preparación', icon: ChefHat, className: 'bg-emerald-100 text-emerald-800' },
};

const INPUT = 'w-full px-3.5 py-2.5 rounded-lg border border-input bg-card text-sm font-sans outline-none focus:ring-2 focus:ring-primary/20';

const UsersPanel = () => {
  const me = useStore(s => s.user);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [form, setForm] = useState({ username: '', name: '', role: 'cashier' as AppUser['role'], password: '' });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    api.getUsers().then(setUsers).catch(e => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ username: '', name: '', role: 'cashier', password: '' });
    setError('');
    setShowForm(true);
  };

  const openEdit = (u: AppUser) => {
    setEditing(u);
    setForm({ username: u.username, name: u.name, role: u.role, password: '' });
    setError('');
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      if (editing) {
        const updated = await api.updateUser(editing.id, { name: form.name, role: form.role, password: form.password || undefined });
        setUsers(us => us.map(u => (u.id === updated.id ? updated : u)));
      } else {
        const created = await api.createUser(form);
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
    } catch (e: any) {
      setError(e.message);
    }
  };

  const remove = async (u: AppUser) => {
    if (confirmDelete !== u.id) {
      setConfirmDelete(u.id);
      setTimeout(() => setConfirmDelete(null), 3000);
      return;
    }
    try {
      const r = await api.deleteUser(u.id);
      if (r.deactivated) setUsers(us => us.map(x => (x.id === u.id ? { ...x, active: false } : x)));
      else setUsers(us => us.filter(x => x.id !== u.id));
      setConfirmDelete(null);
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-4 font-sans">
      <section className="bg-card rounded-xl border border-border p-4 shadow-card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm">👥 Usuarios y accesos</h3>
            <p className="text-xs text-muted-foreground">Cada persona entra con su propio usuario. Los turnos de caja quedan a su nombre.</p>
          </div>
          <button onClick={openCreate} className="px-3 py-2 rounded-lg gradient-primary text-primary-foreground text-xs font-semibold flex items-center gap-1 shadow-fab hover:opacity-90">
            <Plus size={14} /> Nuevo usuario
          </button>
        </div>

        {error && !showForm && <p className="text-xs text-red-600 font-medium">{error}</p>}

        {loading ? (
          <p className="text-xs text-muted-foreground">Cargando usuarios...</p>
        ) : (
          <div className="space-y-2">
            {users.map(u => {
              const meta = ROLE_META[u.role];
              const Icon = meta.icon;
              const isMe = me?.name === u.name;
              return (
                <div key={u.id} className={cn('flex items-center gap-3 p-3 rounded-xl border border-border bg-white', !u.active && 'opacity-55')}>
                  <div className={cn('w-9 h-9 rounded-full flex items-center justify-center shrink-0', meta.className)}>
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-brand-dark truncate">
                      {u.name} {isMe && <span className="text-[10px] text-muted-foreground font-normal">(tú)</span>}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      <span className="font-mono">@{u.username}</span> · {meta.label}{!u.active && ' · Desactivado'}
                    </p>
                  </div>
                  <button onClick={() => openEdit(u)} title="Editar / cambiar contraseña" className="p-2 rounded-lg text-muted-foreground hover:text-brand-primary hover:bg-brand-primary/5">
                    <Edit2 size={15} />
                  </button>
                  {!isMe && (
                    <>
                      <button onClick={() => toggleActive(u)} title={u.active ? 'Desactivar acceso' : 'Reactivar acceso'} className="p-2 rounded-lg text-muted-foreground hover:text-brand-primary hover:bg-brand-primary/5">
                        {u.active ? <UserX size={15} /> : <UserCheck size={15} />}
                      </button>
                      <button onClick={() => remove(u)} title="Eliminar" className={cn('p-2 rounded-lg', confirmDelete === u.id ? 'bg-red-600 text-white' : 'text-muted-foreground hover:text-red-600 hover:bg-red-50')}>
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {confirmDelete !== null && <p className="text-[11px] text-red-600">Pulsa de nuevo el ícono de eliminar para confirmar.</p>}
      </section>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm text-brand-dark">{editing ? `Editar a ${editing.name}` : 'Nuevo usuario'}</h4>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><X size={16} /></button>
            </div>

            {!editing && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Usuario (para iniciar sesión)</label>
                <input value={form.username} onChange={e => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s+/g, '') })} placeholder="ej: maria" className={INPUT} />
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Nombre completo</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="María Pérez" className={INPUT} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Rol</label>
              <div className="grid grid-cols-1 gap-2">
                {(Object.keys(ROLE_META) as AppUser['role'][]).map(r => {
                  const meta = ROLE_META[r];
                  const Icon = meta.icon;
                  return (
                    <button key={r} type="button" onClick={() => setForm({ ...form, role: r })}
                      className={cn('flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all', form.role === r ? 'border-brand-primary bg-brand-primary/5' : 'border-border hover:bg-muted/30')}>
                      <span className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0', meta.className)}><Icon size={16} /></span>
                      <span>
                        <span className="block text-sm font-semibold text-brand-dark">{meta.label}</span>
                        <span className="block text-[11px] text-muted-foreground">{meta.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                <KeyRound size={12} /> {editing ? 'Nueva contraseña (dejar vacío para no cambiarla)' : 'Contraseña'}
              </label>
              <input type="text" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Mínimo 6 caracteres" className={INPUT} />
            </div>

            {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

            <button onClick={save} disabled={saving || form.name.length < 2 || (!editing && (form.username.length < 3 || form.password.length < 6))}
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
