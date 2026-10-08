import { useState, useRef, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  BarChart3,
  Settings,
  Package,
  Bell,
  LogOut,
  Plus,
  UsersRound,
  PanelLeftClose,
  PanelLeft,
  X,
  Wallet,
  Store,
  Landmark,
  Sun,
  Moon,
  LayoutGrid, ShoppingBag, Bike, ChefHat, ChevronDown,
} from 'lucide-react';
import { useStore } from '@/store/useStore';
import { BranchSwitcher } from '@/components/BranchSwitcher';
import { formatPrice, formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { can, type ViewKey, type PermUser } from '@/lib/permissions';

type NavItem = { path: string; label: string; icon: any; view?: ViewKey };

const navFor = (modules?: { tables?: boolean; counter?: boolean; delivery?: boolean; kitchen?: boolean } | null): NavItem[] => [
  { path: '/mis-domicilios', label: 'Mis domicilios', icon: Bike, view: 'courier' },
  { path: '/pos', label: 'Punto de Venta', icon: Store, view: 'pos' },
  ...(modules?.tables ? [{ path: '/tables', label: 'Mesas', icon: LayoutGrid, view: 'tables' as ViewKey }] : []),
  ...(modules?.counter ? [{ path: '/counter', label: 'Para llevar', icon: ShoppingBag, view: 'counter' as ViewKey }] : []),
  ...(modules?.delivery ? [{ path: '/delivery', label: 'Domicilios', icon: Bike, view: 'delivery' as ViewKey }] : []),
  ...(modules?.kitchen ? [{ path: '/kitchen', label: 'Cocina', icon: ChefHat, view: 'kitchen' as ViewKey }] : []),
  { path: '/shift', label: 'Caja', icon: Wallet, view: 'shift' },
  { path: '/reports', label: 'Ventas e Ingresos', icon: BarChart3, view: 'reports' },
  { path: '/orders', label: 'Historial Pedidos', icon: ClipboardList, view: 'orders' },
  { path: '/products', label: 'Menú', icon: Package, view: 'menu' },
  { path: '/customers', label: 'Clientes & F.E.', icon: Users, view: 'customers' },
  { path: '/finance', label: 'Finanzas', icon: Landmark, view: 'finance' },
  { path: '/staff', label: 'Personal & Nómina', icon: UsersRound, view: 'staff' },
  { path: '/settings', label: 'Configuración', icon: Settings, view: 'settings' },
];

const visibleFor = (items: NavItem[], user?: PermUser | null) => {
  const hidden = useStore.getState().hiddenViews || [];
  return items.filter(i => !i.view || (can(user, i.view) && !hidden.includes(i.view) && !(i.view === 'courier' && user?.role === 'admin')));
};

export const AppLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, orders, sidebarCollapsed, toggleSidebar, businessName, branding, modeOverride, setModeOverride, restaurant, hiddenViews } = useStore();
  void hiddenViews; // re-render del menú al cambiar las secciones visibles
  const isDark = (modeOverride ?? branding.theme?.mode ?? 'light') === 'dark';
  // El personal de cocina solo ve el monitor de cocina
  const visibleNav = visibleFor(navFor(restaurant?.modules), user);
  const pendingCount = orders.filter(o => o.status === 'pending').length;
  const [showNotifs, setShowNotifs] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showModules, setShowModules] = useState(false);
  // Celular: menú arriba con selector de módulo (como Fudo) o barra inferior; se elige en Configuración → Secciones
  const topNav = restaurant?.mobileNav === 'top';
  const currentModule = visibleNav.find(i => location.pathname.startsWith(i.path));
  useEffect(() => { setShowModules(false); }, [location.pathname]);
  const notifRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifs(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setShowUserMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const pendingOrders = orders.filter(o => o.status === 'pending').slice(0, 5);

  const isKitchen = location.pathname === '/kitchen';
  if (isKitchen) return <Outlet />;

  const isPOS = location.pathname.startsWith('/pos') || location.pathname.startsWith('/cuenta/');
  const sideW = sidebarCollapsed ? 'w-16' : 'w-64';
  const mainML = sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64';
  const headerML = sidebarCollapsed ? 'lg:left-16' : 'lg:left-64';

  return (
    <div className="min-h-screen bg-brand-bg text-brand-dark font-sans">
      {/* Desktop Sidebar */}
      <aside className={cn('hidden lg:flex flex-col fixed left-0 top-0 bottom-0 bg-brand-surface text-brand-on-dark z-40 transition-all duration-300 shadow-2xl', sideW)}>
        {/* Sidebar Header with Logo (No background, logo only) */}
        <div className={cn('p-3.5 border-b border-white/10 flex items-center justify-between gap-2', sidebarCollapsed && 'flex-col justify-center')}>
          <button
            onClick={() => navigate('/pos')}
            className="flex items-center justify-center flex-1 py-1 hover:opacity-90 transition-opacity"
            title={businessName}
          >
            <img src={branding.logoUrl || '/logo/logo-dark.svg'} alt={businessName} className={cn('w-auto object-contain transition-all', sidebarCollapsed ? 'h-8' : 'h-14')} />
          </button>

          <button
            onClick={toggleSidebar}
            className={cn('w-7 h-7 rounded-xl hover:bg-white/10 flex items-center justify-center text-brand-on-dark/70 hover:text-white shrink-0 transition-colors', sidebarCollapsed && 'mt-1')}
            title={sidebarCollapsed ? 'Expandir menú' : 'Contraer menú'}
          >
            {sidebarCollapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        {/* Sidebar Navigation */}
        <nav className="flex-1 px-3 py-3 space-y-1.5 overflow-y-auto">
          {visibleNav.map(item => {
            const active = location.pathname.startsWith(item.path);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  'w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-sm font-semibold transition-all select-none',
                  active
                    ? 'bg-brand-card text-brand-dark shadow-md font-bold scale-[1.01]'
                    : 'text-brand-on-dark/80 hover:text-white hover:bg-white/10',
                  sidebarCollapsed && 'justify-center px-0'
                )}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <item.icon size={20} className={active ? 'text-brand-primary-strong' : 'text-brand-accent'} />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                {!sidebarCollapsed && item.path === '/orders' && pendingCount > 0 && (
                  <span className="ml-auto bg-brand-accent text-brand-on-accent text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">{pendingCount}</span>
                )}
                {sidebarCollapsed && item.path === '/orders' && pendingCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-brand-accent text-brand-on-accent text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{pendingCount}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer User Info */}
        <div className="p-3 border-t border-white/10 bg-brand-surface">
          <div className={cn('flex items-center gap-3 px-2 py-1', sidebarCollapsed && 'flex-col gap-2 px-0')}>
            <div className="w-9 h-9 rounded-2xl bg-brand-accent text-brand-on-accent flex items-center justify-center text-sm font-bold shrink-0 shadow-sm" title={sidebarCollapsed ? `${user?.name || ''} · ${user?.role || ''}` : undefined}>
              {user?.name?.[0] || 'G'}
            </div>
            {!sidebarCollapsed && (
              <div className="flex-1 min-w-0 text-left">
                <p className="text-xs font-bold text-white truncate font-sans">{user?.name || 'Administrador'}</p>
                <p className="text-[11px] text-brand-accent capitalize font-sans">{user?.role || 'Admin'}</p>
              </div>
            )}
            <button
              onClick={() => { logout(); navigate('/login'); }}
              className="text-white/60 hover:text-red-400 p-1.5 rounded-lg hover:bg-white/10 transition-colors shrink-0"
              title="Cerrar sesión"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Tablet Sidebar (icons only) */}
      <aside className="hidden md:flex lg:hidden flex-col fixed left-0 top-0 bottom-0 w-16 bg-brand-surface text-brand-on-dark z-40 items-center border-r border-white/10 shadow-2xl">
        <div className="p-3 mt-2 flex items-center justify-center">
          <img src={branding.logoUrl || '/logo/logo-dark.svg'} alt={businessName} className="h-7 w-auto object-contain" />
        </div>
        <nav className="flex-1 flex flex-col items-center gap-1.5 mt-4">
          {visibleNav.map(item => {
            const active = location.pathname.startsWith(item.path);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  'w-11 h-11 flex items-center justify-center rounded-2xl transition-all relative',
                  active ? 'bg-brand-card text-brand-dark shadow-md' : 'text-brand-on-dark/80 hover:bg-white/10 hover:text-white'
                )}
                title={item.label}
              >
                <item.icon size={20} className={active ? 'text-brand-dark' : 'text-brand-accent'} />
                {item.path === '/orders' && pendingCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-brand-accent text-brand-on-accent text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{pendingCount}</span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Topbar (Hidden on POS to avoid double header) */}
      {(!isPOS || topNav) && (
        <header className={cn('fixed top-0 right-0 left-0 h-14 bg-white/90 backdrop-blur border-b border-brand-primary/10 z-30 flex items-center px-4 gap-3', 'md:left-16', headerML, isPOS && 'md:hidden')}>
          {topNav ? (
            <div className="flex-1 md:hidden flex items-center gap-2 min-w-0" data-top-nav>
              {/* Encabezado claro: logo para fondo claro (en modo oscuro, el de fondo oscuro) */}
              <img src={(isDark ? branding.logoUrl : branding.logoLoginUrl || branding.logoUrl) || '/logo/logo-login.svg'} alt={businessName} className="h-9 w-auto max-w-[56px] object-contain shrink-0" data-header-logo />
              <div className="relative min-w-0">
                <button onClick={() => setShowModules(v => !v)} className="flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 rounded-xl bg-orange-500 text-white text-sm font-bold max-w-[190px]" data-module-switch>
                  {currentModule ? <currentModule.icon size={16} className="shrink-0" /> : null}<span className="truncate">{currentModule ? currentModule.label : 'Menú'}</span><ChevronDown size={15} className={cn('shrink-0 transition-transform', showModules && 'rotate-180')} />
                </button>
                {showModules && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowModules(false)} />
                    <div className="absolute left-0 top-full mt-1 w-64 max-h-[75vh] overflow-y-auto bg-white rounded-2xl border border-border shadow-elevated z-50 py-1" data-module-menu>
                      {visibleNav.filter(i => i !== currentModule).map(i => (
                        <button key={i.path} onClick={() => navigate(i.path)} className="w-full px-3 py-2.5 flex items-center gap-3 text-sm font-semibold text-brand-dark hover:bg-brand-card text-left">
                          <i.icon size={18} className="text-brand-primary" /> {i.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
          <button onClick={() => navigate('/pos')} className="font-serif font-bold text-base tracking-wide flex-1 md:hidden flex items-center gap-2 text-brand-primary">
            <img src={branding.logoUrl || '/logo/logo-dark.svg'} alt={businessName} className="h-7 w-auto object-contain" /> {businessName}
          </button>
          )}
          {/* En escritorio el encabezado muestra el nombre del negocio; el título de cada sección lo pone la propia página */}
          <div className="flex-1 hidden md:flex items-center min-w-0">
            <span className="font-serif font-bold text-lg text-brand-primary truncate" data-testid="header-business-name">{businessName}</span>
          </div>
        <BranchSwitcher />
        {/* Modo claro / oscuro (preferencia de este dispositivo) */}
        <button onClick={() => setModeOverride(isDark ? 'light' : 'dark')}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-muted transition-colors" title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}>
          {isDark ? <Sun size={19} className="text-brand-primary" /> : <Moon size={19} className="text-brand-primary" />}
        </button>
        {/* Notifications bell */}
        <div className="relative" ref={notifRef}>
          <button onClick={() => { setShowNotifs(!showNotifs); setShowUserMenu(false); }}
            className="relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-muted transition-colors" title="Notificaciones">
            <Bell size={20} className="text-brand-primary" />
            {pendingCount > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />}
          </button>
          {showNotifs && (
            <div className="absolute right-0 top-full mt-1 w-72 bg-card border border-border rounded-xl shadow-elevated z-50 overflow-hidden">
              <div className="px-3 py-2 border-b border-border">
                <p className="text-xs font-semibold">Pedidos pendientes ({pendingCount})</p>
              </div>
              {pendingOrders.length > 0 ? (
                <div className="max-h-60 overflow-y-auto">
                  {pendingOrders.map(o => (
                    <button key={o.id} onClick={() => { navigate(`/orders/${o.id}`); setShowNotifs(false); }}
                      className="w-full px-3 py-2 text-left hover:bg-muted transition-colors border-b border-border/50 last:border-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">#{o.id}</span>
                        <span className="text-xs text-muted-foreground">{formatTime(o.createdAt)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{o.customer.name} • {formatPrice(o.total)}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-3 py-4 text-center">
                  <p className="text-xs text-muted-foreground">No hay pedidos pendientes</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* User avatar menu */}
        <div className="relative" ref={userMenuRef}>
          <button onClick={() => { setShowUserMenu(!showUserMenu); setShowNotifs(false); }}
            className="w-8 h-8 rounded-full bg-brand-button text-brand-on-button flex items-center justify-center text-sm font-bold cursor-pointer" title={user?.name}>
            {user?.name?.[0]}
          </button>
          {showUserMenu && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-brand-primary/10 rounded-2xl shadow-elevated z-50 overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-100">
                <p className="text-sm font-bold font-serif text-brand-primary">{user?.name}</p>
                <p className="text-xs text-brand-muted capitalize">{user?.role}</p>
              </div>
              <button onClick={() => { navigate('/settings'); setShowUserMenu(false); }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-brand-card transition-colors flex items-center gap-2 text-brand-primary">
                <Settings size={14} /> Configuración
              </button>
              <button onClick={() => { logout(); navigate('/login'); setShowUserMenu(false); }}
                className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2 border-t border-gray-100">
                <LogOut size={14} /> Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </header>
      )}

      {/* Main content */}
      <main className={cn(isPOS ? (topNav ? 'fixed inset-x-0 top-14 bottom-0 overflow-hidden md:static md:h-[100dvh]' : cn('pt-0 md:pb-0 h-[100dvh] overflow-hidden', location.pathname.startsWith('/cuenta/') ? 'pb-0' : 'pb-16')) : (topNav ? 'pt-14 pb-4 min-h-screen' : 'pt-14 pb-20 md:pb-4 min-h-screen'), 'md:ml-16 transition-all duration-300', mainML)}>
        <div className={cn('max-w-full h-full', isPOS ? 'p-0' : 'p-4 lg:p-6')}>
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      {/* En la cuenta abierta la página tiene su propia barra inferior (Productos / Cuenta): no se superpone la navegación general */}
      {!topNav && !location.pathname.startsWith('/cuenta/') && <MobileNav navigate={navigate} location={location} pendingCount={pendingCount} logout={logout} />}
    </div>
  );
};

const MobileNav = ({ navigate, location, pendingCount, logout }: { navigate: any; location: any; pendingCount: number; logout: () => void }) => {
  const [showMore, setShowMore] = useState(false);
  const businessName = useStore(s => s.businessName);

  const modules = useStore(s => s.restaurant?.modules);
  const user = useStore(s => s.user);
  const mainItems = visibleFor([
    { path: '/mis-domicilios', label: 'Mis pedidos', icon: Bike, view: 'courier' },
    { path: '/pos', label: 'POS Caja', icon: Store, view: 'pos' },
    ...(modules?.tables ? [{ path: '/tables', label: 'Mesas', icon: LayoutGrid, view: 'tables' as ViewKey }] : []),
    ...(modules?.counter ? [{ path: '/counter', label: 'Llevar', icon: ShoppingBag, view: 'counter' as ViewKey }] : []),
    ...(modules?.delivery ? [{ path: '/delivery', label: 'Domicilios', icon: Bike, view: 'delivery' as ViewKey }] : []),
    ...(modules?.kitchen ? [{ path: '/kitchen', label: 'Cocina', icon: ChefHat, view: 'kitchen' as ViewKey }] : []),
    { path: '/shift', label: 'Caja', icon: Wallet, view: 'shift' },
    { path: '/orders', label: 'Pedidos', icon: ClipboardList, view: 'orders' },
    ...(!modules?.tables && !modules?.delivery ? [{ path: '/reports', label: 'Reportes', icon: BarChart3, view: 'reports' as ViewKey }] : []),
  ], user).slice(0, 5);

  const moreItems = visibleFor([
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, view: 'reports' },
    { path: '/reports', label: 'Ventas', icon: BarChart3, view: 'reports' },
    { path: '/products', label: 'Menú', icon: Package, view: 'menu' },
    { path: '/customers', label: 'Clientes', icon: Users, view: 'customers' },
    { path: '/finance', label: 'Finanzas', icon: Landmark, view: 'finance' },
    { path: '/staff', label: 'Personal', icon: UsersRound, view: 'staff' },
    { path: '/settings', label: 'Config', icon: Settings, view: 'settings' },
  ], user);

  return (
    <>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-brand-primary/10 z-40 flex items-center justify-around px-2 safe-area-bottom shadow-lg">
        {mainItems.map(item => {
          const active = location.pathname.startsWith(item.path);
          return (
            <button key={item.path} onClick={() => navigate(item.path)}
              className={cn('flex flex-col items-center gap-0.5 min-w-[48px] py-1', active ? 'text-brand-primary font-bold' : 'text-brand-muted')}>
              <div className="relative">
                <item.icon size={22} />
                {item.path === '/orders' && pendingCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-warning text-warning-foreground text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">{pendingCount}</span>
                )}
              </div>
              <span className="text-[10px]">{item.label}</span>
            </button>
          );
        })}

        <button onClick={() => setShowMore(true)}
          className={cn('flex flex-col items-center gap-0.5 min-w-[48px] py-1', showMore ? 'text-brand-primary font-bold' : 'text-brand-muted')}>
          <Settings size={22} />
          <span className="text-[10px]">Más</span>
        </button>
      </nav>

      {/* More menu overlay */}
      {showMore && (
        <div className="md:hidden fixed inset-0 !m-0 bg-black/50 backdrop-blur-sm z-50" onClick={() => setShowMore(false)}>
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl p-5 pb-8 safe-area-bottom shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif font-bold text-base text-brand-primary">Menú {businessName}</h3>
              <button onClick={() => setShowMore(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <X size={16} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {moreItems.map(item => {
                const active = location.pathname.startsWith(item.path);
                return (
                  <button key={item.path} onClick={() => { navigate(item.path); setShowMore(false); }}
                    className={cn('flex items-center gap-2.5 p-3 rounded-2xl transition-all',
                      active ? 'bg-brand-button text-brand-on-button' : 'bg-brand-card hover:bg-brand-card-2 text-brand-primary')}>
                    <item.icon size={20} />
                    <span className="text-xs font-semibold">{item.label}</span>
                  </button>
                );
              })}
            </div>
            <button onClick={() => { logout(); navigate('/login'); setShowMore(false); }}
              className="w-full mt-4 py-2.5 rounded-xl border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50 flex items-center justify-center gap-2">
              <LogOut size={16} /> Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </>
  );
};
