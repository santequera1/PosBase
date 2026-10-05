import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, Home } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { homePath, VIEWS, type ViewKey } from '@/lib/permissions';

/** Pantalla que ve una persona cuando entra por URL a una sección que no tiene habilitada. */
const NoAccess = ({ view, hidden }: { view?: ViewKey | ViewKey[] | null; hidden?: boolean }) => {
  const navigate = useNavigate();
  const user = useStore(s => s.user);
  const modules = useStore(s => s.restaurant?.modules);
  const keys = Array.isArray(view) ? view : view ? [view] : [];
  const label = keys.map(k => VIEWS.find(v => v.key === k)?.label).filter(Boolean).join(' / ');
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6 font-sans" data-testid="no-access">
      <div className="max-w-md w-full bg-card border border-border rounded-2xl shadow-card p-7 text-center space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto"><ShieldAlert size={28} /></div>
        <h2 className="font-display font-bold text-xl text-brand-dark">{hidden ? 'Esta sección está oculta' : 'No tienes permiso para ver esta sección'}</h2>
        <p className="text-sm text-muted-foreground">
          {hidden ? <>La sección <b className="text-brand-dark">{label}</b> fue ocultada por el administrador. Se puede volver a mostrar en <b>Configuración → Secciones</b>; la información no se ha perdido.</> : <>{label ? <>La sección <b className="text-brand-dark">{label}</b> no está habilitada para tu usuario{user?.name ? ` (${user.name})` : ''}.</> : 'Esta sección no está habilitada para tu usuario.'}
          {' '}Pídele al administrador que te la active en <b>Configuración → Usuarios</b>.</>}
        </p>
        <div className="flex justify-center gap-2 pt-1">
          <button onClick={() => navigate(-1)} className="px-4 py-2 rounded-xl border border-border text-sm font-semibold flex items-center gap-1.5"><ArrowLeft size={15} /> Volver</button>
          <button onClick={() => navigate(homePath(user, modules, useStore.getState().hiddenViews))} className="px-4 py-2 rounded-xl gradient-primary text-primary-foreground text-sm font-bold flex items-center gap-1.5"><Home size={15} /> Ir a mi inicio</button>
        </div>
      </div>
    </div>
  );
};

export default NoAccess;
