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
import ProductsPage from "@/pages/ProductsPage";
import CustomersPage from "@/pages/CustomersPage";
import CustomerDetailPage from "@/pages/CustomerDetailPage";
import ReportsPage from "@/pages/ReportsPage";
import SettingsPage from "@/pages/SettingsPage";
import StaffPage from "@/pages/StaffPage";
import TablesPage from "@/pages/TablesPage";
import NotFound from "@/pages/NotFound";
import { io } from "socket.io-client";

const queryClient = new QueryClient();

const SOCKET_URL = typeof window !== 'undefined' ? window.location.origin : (import.meta.env.VITE_API_URL?.replace('/api', '') || '');

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

const SessionRestorer = () => {
  const restoreSession = useStore(s => s.restoreSession);
  useEffect(() => { restoreSession(); }, [restoreSession]);
  return null;
};

const SocketProvider = () => {
  const handleOrderEvent = useStore(s => s.handleOrderEvent);
  const user = useStore(s => s.user);

  useEffect(() => {
    if (!user) return;
    const socket = io(SOCKET_URL);
    socket.on('order:new', handleOrderEvent);
    socket.on('order:updated', handleOrderEvent);
    return () => { socket.disconnect(); };
  }, [user, handleOrderEvent]);

  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <SessionRestorer />
      <SocketProvider />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoutes />}>
            <Route path="/" element={<Navigate to="/pos" replace />} />
            <Route path="/pos" element={<POSPage />} />
            <Route path="/shift" element={<CashShiftPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/orders/new" element={<NewOrderPage />} />
            <Route path="/orders/:id" element={<OrderDetailPage />} />
            <Route path="/kitchen" element={<KitchenPage />} />
            <Route path="/tables" element={<TablesPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/customers/:id" element={<CustomerDetailPage />} />
            <Route path="/staff" element={<StaffPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
