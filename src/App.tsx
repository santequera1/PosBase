import { useEffect, lazy, Suspense, type ComponentType } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { UpdateNotifier } from "@/components/UpdateNotifier";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useStore } from "@/store/useStore";
import { AppLayout } from "@/components/AppLayout";
import LoginPage from "@/pages/LoginPage";
import SetupPage from "@/pages/SetupPage";
import NotFound from "@/pages/NotFound";
import NoAccess from "@/pages/NoAccess";

/**
 * Cada pantalla se baja solo cuando se abre (la de acceso va en el archivo principal, que así queda liviano).
 * Si justo se publicó una versión nueva y el archivo de una pantalla ya no existe, se recarga la página una vez.
 */
const RECARGA = 'pos-recarga-por-version';
const pagina = (cargar: () => Promise<{ default: ComponentType<any> }>) => lazy(() =>
  cargar().then(m => { sessionStorage.removeItem(RECARGA); return m; }).catch(err => {
    if (!sessionStorage.getItem(RECARGA)) { sessionStorage.setItem(RECARGA, '1'); window.location.reload(); }
    throw err;
  })
);
const POSPage = pagina(() => import("@/pages/POSPage"));
const CashShiftPage = pagina(() => import("@/pages/CashShiftPage"));
const DashboardPage = pagina(() => import("@/pages/DashboardPage"));
const OrdersPage = pagina(() => import("@/pages/OrdersPage"));
const NewOrderPage = pagina(() => import("@/pages/NewOrderPage"));
const OrderDetailPage = pagina(() => import("@/pages/OrderDetailPage"));
const KitchenPage = pagina(() => import("@/pages/KitchenPage"));
const MenuModulePage = pagina(() => import("@/pages/MenuModulePage"));
const CustomersPage = pagina(() => import("@/pages/CustomersPage"));
const CustomerDetailPage = pagina(() => import("@/pages/CustomerDetailPage"));
const ReportsPage = pagina(() => import("@/pages/ReportsPage"));
const MyAccountPage = pagina(() => import("@/pages/MyAccountPage"));
const SettingsPage = pagina(() => import("@/pages/SettingsPage"));
const StaffPage = pagina(() => import("@/pages/StaffPage"));
const FinancePage = pagina(() => import("@/pages/FinancePage"));
const TablesPage = pagina(() => import("@/pages/TablesPage"));
const CounterPage = pagina(() => import("@/pages/CounterPage"));
const DeliveryPage = pagina(() => import("@/pages/DeliveryPage"));
const OpenOrderPage = pagina(() => import("@/pages/OpenOrderPage"));
const CourierPage = pagina(() => import("@/pages/CourierPage"));
const CajaPage = pagina(() => import("@/pages/CajaPage"));
import { can, homePath, type ViewKey } from "@/lib/permissions";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { io } from "socket.io-client";

const queryClient = new QueryClient();

const SOCKET_URL = typeof window !== 'undefined' ? window.location.origin : (import.meta.env.VITE_API_URL?.replace('/api', '') || '');

/** Protección por sección: si la persona entra por URL a algo que no tiene habilitado, ve el aviso en lugar de la pantalla. */
const Guard = ({ view, children }: { view: ViewKey | ViewKey[]; children: any }) => {
  const user = useStore(s => s.user);
  const refreshMe = useStore(s => s.refreshMe);
  const location = useLocation();
  useEffect(() => { refreshMe(); }, [location.pathname, refreshMe]);
  const hidden = useStore(s => s.hiddenViews);
  const views = Array.isArray(view) ? view : [view];
  if (views.every(v => hidden.includes(v))) return <NoAccess view={view} hidden />;
  return can(user, view) ? children : <NoAccess view={view} />;
};
const Home = () => {
  const user = useStore(s => s.user);
  const modules = useStore(s => s.restaurant?.modules);
  const hidden = useStore(s => s.hiddenViews);
  return <Navigate to={homePath(user, modules, hidden)} replace />;
};

const Cargando = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="text-center">
      <div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
      <p className="text-sm text-muted-foreground">Cargando...</p>
    </div>
  </div>
);

const ProtectedRoutes = () => {
  const user = useStore(s => s.user);
  const restoring = useStore(s => s.restoring);

  // While restoring session, show loading
  if (restoring) return <Cargando />;

  if (!user) return <Navigate to="/login" replace />;
  return <AppLayout />;
};

// Carga tema, logos y nombre del negocio antes de iniciar sesión (pantalla de acceso)
const BrandingLoader = () => {
  const loadPublicBranding = useStore(s => s.loadPublicBranding);
  useEffect(() => { loadPublicBranding(); }, [loadPublicBranding]);
  return null;
};

const SessionRestorer = () => {
  const restoreSession = useStore(s => s.restoreSession);
  useEffect(() => { restoreSession(); }, [restoreSession]);
  return null;
};

const SocketProvider = () => {
  const handleOrderEvent = useStore(s => s.handleOrderEvent);
  const handleProductEvent = useStore(s => s.handleProductEvent);
  const user = useStore(s => s.user);

  useEffect(() => {
    if (!user) return;
    const socket = io(SOCKET_URL);
    socket.on('order:new', handleOrderEvent);
    socket.on('order:updated', handleOrderEvent);
    socket.on('product:updated', handleProductEvent);
    // Personal nuevo o cambiado en otro equipo: refresca las listas de meseros, domiciliarios y empleados (cobro por nómina)
    socket.on('staff:updated', () => { useStore.getState().loadRestaurantConfig(); });
    return () => { socket.disconnect(); };
  }, [user, handleOrderEvent, handleProductEvent]);

  return null;
};

// Instalación nueva sin configurar: lleva al asistente de configuración inicial
const SetupGate = () => {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (location.pathname === '/setup') return;
    api.getSetupStatus().then(s => { if (s?.pending) navigate('/setup' + window.location.search, { replace: true }); }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrandingLoader />
      <SessionRestorer />
      <SocketProvider />
      <UpdateNotifier />
      <BrowserRouter>
        <SetupGate />
        <Suspense fallback={<Cargando />}>
        <Routes>
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoutes />}>
            <Route path="/" element={<Home />} />
            <Route path="/pos" element={<Guard view="pos"><POSPage /></Guard>} />
            <Route path="/shift" element={<Guard view="shift"><CajaPage /></Guard>} />
            <Route path="/shift/classic" element={<Guard view="shift"><CashShiftPage /></Guard>} />
            <Route path="/dashboard" element={<Guard view="reports"><DashboardPage /></Guard>} />
            <Route path="/orders" element={<Guard view="orders"><OrdersPage /></Guard>} />
            <Route path="/orders/new" element={<Guard view={['orders', 'pos']}><NewOrderPage /></Guard>} />
            <Route path="/orders/:id" element={<Guard view="orders"><OrderDetailPage /></Guard>} />
            <Route path="/kitchen" element={<Guard view="kitchen"><KitchenPage /></Guard>} />
            <Route path="/mis-domicilios" element={<Guard view="courier"><CourierPage /></Guard>} />
            <Route path="/tables" element={<Guard view="tables"><TablesPage /></Guard>} />
            <Route path="/counter" element={<Guard view="counter"><CounterPage /></Guard>} />
            <Route path="/delivery" element={<Guard view="delivery"><DeliveryPage /></Guard>} />
            <Route path="/cuenta/:id" element={<Guard view={['tables', 'counter', 'delivery', 'pos']}><OpenOrderPage /></Guard>} />
            <Route path="/products" element={<Guard view="menu"><MenuModulePage /></Guard>} />
            <Route path="/customers" element={<Guard view="customers"><CustomersPage /></Guard>} />
            <Route path="/customers/:id" element={<Guard view="customers"><CustomerDetailPage /></Guard>} />
            <Route path="/staff" element={<Guard view="staff"><StaffPage /></Guard>} />
            {/* Mi cuenta: cualquier usuario ve solo sus propios datos de nómina */}
            <Route path="/mi-cuenta" element={<MyAccountPage />} />
            <Route path="/finance" element={<Guard view="finance"><FinancePage /></Guard>} />
            <Route path="/reports" element={<Guard view="reports"><ReportsPage /></Guard>} />
            <Route path="/settings" element={<Guard view="settings"><SettingsPage /></Guard>} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
