/** Permisos por usuario (vistas y acciones). El administrador siempre tiene todo; el resto depende de su perfil o de su lista personalizada. */
import { Store, LayoutGrid, ShoppingBag, Bike, ChefHat, Wallet, ClipboardList, BarChart3, Package, Users, Landmark, UsersRound, Settings, Ban, Percent, Pencil, HandCoins, ShieldCheck, ConciergeBell } from 'lucide-react';

export type ViewKey = 'pos' | 'tables' | 'counter' | 'delivery' | 'kitchen' | 'courier' | 'shift' | 'orders' | 'reports' | 'menu' | 'customers' | 'finance' | 'staff' | 'settings';
export type ActionKey = 'cancel_orders' | 'discounts' | 'edit_menu' | 'cash_withdrawals';
export type ProfileKey = 'admin' | 'cashier' | 'waiter' | 'kitchen' | 'courier' | 'custom';
export interface Perms { views: string[]; actions: string[] }
export interface PermUser { name: string; role: string; profile?: string; perms?: Perms }

export const VIEWS: Array<{ key: ViewKey; label: string; description: string; path: string; group: string; icon: any }> = [
  { key: 'pos', label: 'Punto de venta', description: 'Vender en caja, cobrar e imprimir recibos.', path: '/pos', group: 'Ventas', icon: Store },
  { key: 'tables', label: 'Mesas', description: 'Abrir mesas, tomar pedidos, precuenta y cobro.', path: '/tables', group: 'Ventas', icon: LayoutGrid },
  { key: 'counter', label: 'Para llevar', description: 'Pedidos a nombre del cliente en mostrador.', path: '/counter', group: 'Ventas', icon: ShoppingBag },
  { key: 'delivery', label: 'Domicilios', description: 'Pedidos a domicilio y repartidores.', path: '/delivery', group: 'Ventas', icon: Bike },
  { key: 'kitchen', label: 'Cocina (monitor)', description: 'Pantalla de comandas de cocina y barra.', path: '/kitchen', group: 'Ventas', icon: ChefHat },
  { key: 'courier', label: 'Mis domicilios (repartidor)', description: 'El repartidor ve sus pedidos asignados, cliente, dirección y cuánto cobrar.', path: '/mis-domicilios', group: 'Ventas', icon: Bike },
  { key: 'shift', label: 'Cierre de caja', description: 'Abrir y cerrar turnos, arqueo y reporte Z.', path: '/shift', group: 'Caja y pedidos', icon: Wallet },
  { key: 'orders', label: 'Historial de pedidos', description: 'Ver pedidos, reimprimir y cambiar estados.', path: '/orders', group: 'Caja y pedidos', icon: ClipboardList },
  { key: 'reports', label: 'Ventas e ingresos', description: 'Estadísticas de ventas, productos y horas.', path: '/reports', group: 'Caja y pedidos', icon: BarChart3 },
  { key: 'menu', label: 'Menú', description: 'Ver el catálogo y la disponibilidad.', path: '/products', group: 'Catálogo y clientes', icon: Package },
  { key: 'customers', label: 'Clientes y F.E.', description: 'Directorio de clientes y factura electrónica.', path: '/customers', group: 'Catálogo y clientes', icon: Users },
  { key: 'finance', label: 'Finanzas', description: 'Gastos, proveedores, cartera y contabilidad.', path: '/finance', group: 'Administración', icon: Landmark },
  { key: 'staff', label: 'Personal y nómina', description: 'Colaboradores, asistencia, propinas y liquidaciones.', path: '/staff', group: 'Administración', icon: UsersRound },
  { key: 'settings', label: 'Configuración', description: 'Datos del negocio, marca, usuarios e integraciones.', path: '/settings', group: 'Administración', icon: Settings },
];
export const ACTIONS: Array<{ key: ActionKey; label: string; description: string; icon: any }> = [
  { key: 'cancel_orders', label: 'Anular pedidos y cuentas', description: 'Puede anular ventas, mesas y pedidos.', icon: Ban },
  { key: 'discounts', label: 'Aplicar descuentos', description: 'Puede dar descuentos al cobrar (con motivo).', icon: Percent },
  { key: 'edit_menu', label: 'Editar el menú', description: 'Crear y editar productos, precios y categorías.', icon: Pencil },
  { key: 'cash_withdrawals', label: 'Retiros de caja', description: 'Registrar retiros o gastos desde la caja abierta.', icon: HandCoins },
];
export const PROFILES: Array<{ key: ProfileKey; label: string; description: string; icon: any; views: ViewKey[]; actions: ActionKey[] }> = [
  { key: 'admin', label: 'Administrador', description: 'Acceso total a todo el sistema.', icon: ShieldCheck, views: VIEWS.map(v => v.key), actions: ACTIONS.map(a => a.key) },
  { key: 'cashier', label: 'Cajero', description: 'Vende, cobra, cierra caja y registra gastos.', icon: Store, views: ['pos', 'tables', 'counter', 'delivery', 'kitchen', 'shift', 'orders', 'reports', 'menu', 'customers', 'finance', 'settings'], actions: ['cancel_orders', 'discounts', 'edit_menu', 'cash_withdrawals'] },
  { key: 'waiter', label: 'Mesero', description: 'Toma pedidos en mesas, para llevar y domicilios.', icon: ConciergeBell, views: ['tables', 'counter', 'delivery', 'kitchen', 'orders'], actions: [] },
  { key: 'kitchen', label: 'Cocina', description: 'Solo la pantalla de comandas.', icon: ChefHat, views: ['kitchen'], actions: [] },
  { key: 'courier', label: 'Domiciliario', description: 'Ve sus pedidos asignados y los marca entregados.', icon: Bike, views: ['courier'], actions: [] },
  { key: 'custom', label: 'Personalizado', description: 'Elige a mano qué ve y qué puede hacer.', icon: Settings, views: [], actions: [] },
];
export const PROFILE_LABEL: Record<string, string> = Object.fromEntries(PROFILES.map(p => [p.key, p.label]));

export const can = (user: PermUser | null | undefined, view: ViewKey | ViewKey[]): boolean => {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const views = user.perms?.views || [];
  return (Array.isArray(view) ? view : [view]).some(v => views.includes(v));
};
export const canDo = (user: PermUser | null | undefined, action: ActionKey): boolean => {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return (user.perms?.actions || []).includes(action);
};
/** Primera sección permitida: a dónde entra la persona al iniciar sesión o cuando una URL no le corresponde. */
export const homePath = (user: PermUser | null | undefined, modules?: { tables?: boolean; counter?: boolean; delivery?: boolean; kitchen?: boolean } | null): string => {
  if (!user) return '/login';
  const enabled = (k: ViewKey) => !modules || !(['tables', 'counter', 'delivery', 'kitchen'] as ViewKey[]).includes(k) || Boolean(modules[k as keyof typeof modules]);
  const first = VIEWS.find(v => can(user, v.key) && enabled(v.key));
  return first ? first.path : '/pos';
};
/** Vista que corresponde a una ruta (para la protección por URL). */
export const viewForPath = (pathname: string): ViewKey | ViewKey[] | null => {
  if (pathname.startsWith('/cuenta/')) return ['tables', 'counter', 'delivery', 'pos'];
  if (pathname.startsWith('/orders')) return 'orders';
  if (pathname.startsWith('/customers')) return 'customers';
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/reports')) return 'reports';
  if (pathname.startsWith('/products')) return 'menu';
  const v = VIEWS.find(x => pathname === x.path || pathname.startsWith(x.path + '/'));
  return v ? v.key : null;
};
