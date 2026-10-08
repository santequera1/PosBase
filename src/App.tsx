import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useStore } from "@/store/useStore";
import { AppLayout } from "@/components/AppLayout";
import POSPage from "@/pages/POSPage";
import CashShiftPage from "@/pages/CashShiftPage";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import OrdersPage from "@/pages/OrdersPage";
import NewOrderPage from "@/pages/NewOrderPage";
import OrderDetailPage from "@/pages/OrderDetailPage";
import KitchenPage from "@/pages/KitchenPage";
import MenuModulePage from "@/pages/MenuModulePage";
import CustomersPage from "@/pages/CustomersPage";
import CustomerDetailPage from "@/pages/CustomerDetailPage";
import ReportsPage from "@/pages/ReportsPage";
import SettingsPage from "@/pages/SettingsPage";
import StaffPage from "@/pages/StaffPage";
import FinancePage from "@/pages/FinancePage";
import TablesPage from "@/pages/TablesPage";
import CounterPage from "@/pages/CounterPage";
import DeliveryPage from "@/pages/DeliveryPage";
import OpenOrderPage from "@/pages/OpenOrderPage";
import NotFound from "@/pages/NotFound";
import NoAccess from "@/pages/NoAccess";
import CourierPage from "@/pages/CourierPage";
import CajaPage from "@/pages/CajaPage";
import { can, homePath, type ViewKey } from "@/lib/permissions";
import { useLocation } from "react-router-dom";
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

const ProtectedRoutes = () => {
  const user = useStore(s => s.user);
  const restoring = useStore(s => s.restoring);

  // While restoring session, show loading
  if (restoring) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Cargando...</p>
      </div>
    </div>
  );

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
    return () => { socket.disconnect(); };
  }, [user, handleOrderEvent, handleProductEvent]);

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
      <BrowserRouter>
        <Routes>
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
            <Route path="/finance" element={<Guard view="finance"><FinancePage /></Guard>} />
            <Route path="/reports" element={<Guard view="reports"><ReportsPage /></Guard>} />
            <Route path="/settings" element={<Guard view="settings"><SettingsPage /></Guard>} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
