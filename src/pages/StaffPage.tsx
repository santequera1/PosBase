import { useState } from 'react';
import { Phone, Plus, Edit2, Trash2, X, ChefHat, Truck, Crown, UtensilsCrossed, Wrench } from 'lucide-react';
import { useStore, type Driver } from '@/store/useStore';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

type StaffRole = 'mesero' | 'cocinero' | 'domiciliario' | 'administrador' | 'ayudante';

const roleConfig: Record<StaffRole, { label: string; emoji: string; icon: any; color: string }> = {
  mesero: { label: 'Mesero(a)', emoji: '🍽️', icon: UtensilsCrossed, color: '#3B82F6' },
  cocinero: { label: 'Cocinero(a)', emoji: '👨‍🍳', icon: ChefHat, color: '#EF4444' },
  domiciliario: { label: 'Domiciliario', emoji: '🛵', icon: Truck, color: '#10B981' },
  administrador: { label: 'Administrador', emoji: '👑', icon: Crown, color: '#8B5CF6' },
  ayudante: { label: 'Ayudante', emoji: '🤝', icon: Wrench, color: '#F59E0B' },
};

const allRoles = Object.keys(roleConfig) as StaffRole[];

// We extend Driver to include a 'role' field stored in the name as prefix or use the API
// For now we'll store role info in a convention: we use the drivers table but add a "role" concept

interface StaffMember {
  id: number;
  name: string;
  phone: string;
  role: StaffRole;
  available: boolean;
}

const StaffPage = () => {
  const { drivers, addDriver, updateDriver, deleteDriver } = useStore();
  const [showModal, setShowModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formRole, setFormRole] = useState<StaffRole>('mesero');
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [filterRole, setFilterRole] = useState<StaffRole | 'all'>('all');

  // Parse staff from drivers - we store role in a special convention
  // Driver name format: "role:Name" internally, displayed as "Name"
  const staff: StaffMember[] = drivers.map(d => {
    const parts = d.name.split(':');
    if (parts.length === 2 && allRoles.includes(parts[0] as StaffRole)) {
      return { id: d.id, name: parts[1], phone: d.phone, role: parts[0] as StaffRole, available: d.available };
    }
    // Legacy drivers without role prefix → default to domiciliario
    return { id: d.id, name: d.name, phone: d.phone, role: 'domiciliario', available: d.available };
  });

  const filtered = filterRole === 'all' ? staff : staff.filter(s => s.role === filterRole);

  // Counts per role
  const roleCounts = allRoles.reduce((acc, r) => {
    acc[r] = staff.filter(s => s.role === r).length;
    return acc;
  }, {} as Record<StaffRole, number>);

  const openAdd = () => {
    setEditingStaff(null);
    setFormName(''); setFormPhone(''); setFormRole('mesero');
    setShowModal(true);
  };

  const openEdit = (s: StaffMember) => {
    setEditingStaff(s);
    setFormName(s.name); setFormPhone(s.phone); setFormRole(s.role);
    setShowModal(true);
  };

  const handleSave = () => {
    if (!formName || !formPhone) return;
    const storedName = `${formRole}:${formName}`;
    if (editingStaff) {
      updateDriver(editingStaff.id, { name: storedName, phone: formPhone });
    } else {
      addDriver({ name: storedName, phone: formPhone, available: true });
    }
    setShowModal(false);
  };

  const handleDelete = (id: number) => {
    if (confirmDelete === id) {
      deleteDriver(id);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  };

  const toggleAvailability = (s: StaffMember) => {
    updateDriver(s.id, { available: !s.available });
  };

  return (
    <div className="space-y-4">
      {/* Header with role summary */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-display font-bold text-lg">Personal</h2>
          <p className="text-xs text-muted-foreground">{staff.length} personas registradas</p>
        </div>
        <button onClick={openAdd}
          className="px-4 py-2.5 rounded-lg gradient-primary text-primary-foreground text-sm font-semibold shadow-fab hover:opacity-90 flex items-center gap-2">
          <Plus size={16} /> Agregar persona
        </button>
      </div>

      {/* Role summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {allRoles.map(r => {
          const cfg = roleConfig[r];
          const count = roleCounts[r];
          const activeCount = staff.filter(s => s.role === r && s.available).length;
          return (
            <button key={r} onClick={() => setFilterRole(filterRole === r ? 'all' : r)}
              className={cn('p-3 rounded-xl border text-center transition-all',
                filterRole === r ? 'border-primary bg-primary/5 shadow-md' : 'border-border bg-card hover:shadow-card')}>
              <span className="text-2xl block mb-1">{cfg.emoji}</span>
              <p className="text-xs font-semibold" style={{ color: cfg.color }}>{cfg.label}</p>
              <p className="font-display font-bold text-lg">{count}</p>
              {count > 0 && (
                <p className="text-[10px] text-muted-foreground">{activeCount} activos</p>
              )}
            </button>
          );
        })}
      </div>

      {/* Filter indicator */}
      {filterRole !== 'all' && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Filtrando por: <strong>{roleConfig[filterRole].label}</strong></span>
          <button onClick={() => setFilterRole('all')} className="text-xs text-primary hover:underline">Ver todos</button>
        </div>
      )}

      {/* Staff list */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(s => {
          const cfg = roleConfig[s.role];
          const Icon = cfg.icon;
          return (
            <div key={s.id} className={cn('bg-card rounded-xl border shadow-card p-4 transition-all',
              s.available ? 'border-border' : 'border-border opacity-50')}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: cfg.color + '15' }}>
                  <Icon size={20} style={{ color: cfg.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-semibold text-sm truncate">{s.name}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: cfg.color + '15', color: cfg.color }}>
                      {cfg.emoji} {cfg.label}
                    </span>
                  </div>
                </div>
              </div>
              <p className="flex items-center gap-1 text-xs text-muted-foreground mb-3">
                <Phone size={12} />{s.phone}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleAvailability(s)}
                  className={cn('flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                    s.available ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground')}>
                  {s.available ? '✅ Activo' : '⛔ Inactivo'}
                </button>
                <button onClick={() => openEdit(s)}
                  className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground">
                  <Edit2 size={14} />
                </button>
                <button onClick={() => handleDelete(s.id)}
                  className={cn('w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                    confirmDelete === s.id ? 'bg-destructive text-destructive-foreground' : 'hover:bg-muted text-muted-foreground hover:text-destructive')}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-12">
            <span className="text-4xl block mb-2">👥</span>
            <p className="text-sm text-muted-foreground">
              {filterRole !== 'all' ? `No hay ${roleConfig[filterRole].label.toLowerCase()}s registrados` : 'No hay personal registrado'}
            </p>
            <button onClick={openAdd} className="mt-3 px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm font-semibold">
              Agregar el primero
            </button>
          </div>
        )}
      </div>

      {/* Modal add/edit */}
      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-foreground/40 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card rounded-2xl w-full max-w-md p-5 shadow-elevated" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-bold text-lg">{editingStaff ? 'Editar Personal' : 'Agregar Personal'}</h2>
                <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"><X size={16} /></button>
              </div>
              <div className="space-y-4">
                {/* Role selector */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Cargo</label>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {allRoles.map(r => {
                      const cfg = roleConfig[r];
                      return (
                        <button key={r} onClick={() => setFormRole(r)}
                          className={cn('p-2 rounded-lg border-2 text-center transition-all',
                            formRole === r ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30')}>
                          <span className="text-xl block">{cfg.emoji}</span>
                          <p className="text-[10px] font-medium mt-0.5">{cfg.label}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-1 block">Nombre completo</label>
                  <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ej: Juan Pérez"
                    className="w-full px-4 py-2.5 rounded-lg border border-input bg-card text-sm outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Teléfono</label>
                  <input value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="300 123 4567"
                    className="w-full px-4 py-2.5 rounded-lg border border-input bg-card text-sm outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                <button onClick={handleSave} disabled={!formName || !formPhone}
                  className="w-full py-2.5 rounded-lg gradient-primary text-primary-foreground font-display font-semibold text-sm shadow-fab disabled:opacity-40 hover:opacity-90">
                  {editingStaff ? 'Guardar cambios' : 'Agregar persona'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default StaffPage;
