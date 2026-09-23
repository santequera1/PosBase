import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DollarSign, Package, Truck, Plus, BarChart3, Calendar } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { StatusBadge } from '@/components/StatusBadge';
import { OrderTypeBadge } from '@/components/OrderTypeBadge';
import { DailySalesChart } from '@/components/DailySalesChart';
import { formatPrice, formatTime, plural, getColombiaTodayStr, getColombiaYesterdayStr, getColombiaNow, getOrderDateStr } from '@/lib/format';
import { cn } from '@/lib/utils';

type DashPeriod = 'today' | 'week' | 'month' | 'all';

const DashboardPage = () => {
  const navigate = useNavigate();
  const { orders, products, tableCount } = useStore();
  const [period, setPeriod] = useState<DashPeriod>('today');

  const filteredOrders = useMemo(() => {
    if (period === 'all') return orders;
    const todayStr = getColombiaTodayStr();
    const nowColombia = getColombiaNow();

    return orders.filter(o => {
      const orderDate = getOrderDateStr(o.createdAt);
      if (period === 'today') return orderDate === todayStr;
      if (period === 'week') {
        const w = new Date(nowColombia); w.setDate(w.getDate() - 7);
        return orderDate >= w.toISOString().split('T')[0];
      }
      if (period === 'month') {
        const m = new Date(nowColombia); m.setDate(m.getDate() - 30);
        return orderDate >= m.toISOString().split('T')[0];
      }
      return true;
    });
  }, [orders, period]);

  const activeOrders = filteredOrders.filter(o => !['delivered', 'cancelled'].includes(o.status));
  const validOrders = filteredOrders.filter(o => o.status !== 'cancelled');
  const deliveryFeeTotal = validOrders.reduce((s, o) => s + o.deliveryFee, 0);
  const todaySales = validOrders.reduce((s, o) => s + o.total - o.deliveryFee, 0);
  const deliveryActive = filteredOrders.filter(o => o.type === 'delivery' && !['delivered', 'cancelled'].includes(o.status)).length;
  const urgentOrders = filteredOrders.filter(o => o.status === 'pending').length;
  const avgTicket = validOrders.length > 0 ? Math.round(todaySales / validOrders.length) : 0;

  // Top product
  const productCounts: Record<string, number> = {};
  validOrders.forEach(o => o.items.forEach(i => { productCounts[i.name] = (productCounts[i.name] || 0) + i.quantity; }));
  const topProduct = Object.entries(productCounts).sort((a, b) => b[1] - a[1])[0];

  // By payment method — ONLY count paid orders, exclude delivery fees
  const paidOrders = validOrders.filter(o => o.paymentStatus === 'paid');
  const cashTotal = paidOrders.filter(o => o.paymentMethod === 'cash').reduce((s, o) => s + o.total - o.deliveryFee, 0);
  const transferTotal = paidOrders.filter(o => o.paymentMethod === 'transfer').reduce((s, o) => s + o.total - o.deliveryFee, 0);
  const pendingPayment = validOrders.filter(o => o.paymentStatus === 'pending').reduce((s, o) => s + o.total - o.deliveryFee, 0);

  // Tables
  const tableOrders = orders.filter(o => o.type === 'dine-in' && o.tableNumber && !['delivered', 'cancelled'].includes(o.status));
  const occupiedTables = tableOrders.map(o => o.tableNumber!);

  const kpis = [
    { label: 'Ventas (sin domicilio)', value: formatPrice(todaySales), sub: plural(validOrders.length, 'pedido'), icon: DollarSign, color: 'text-success' },
    { label: 'Pedidos activos', value: activeOrders.length.toString(), sub: plural(urgentOrders, 'pendiente'), icon: Package, color: 'text-info' },
    { label: 'Venta promedio', value: formatPrice(avgTicket), sub: 'por pedido', icon: BarChart3, color: 'text-primary' },
    { label: 'Domicilios cobrados', value: formatPrice(deliveryFeeTotal), sub: 'va para el domiciliario', icon: Truck, color: 'text-warning' },
  ];

  const periodLabel = period === 'today' ? 'Hoy' : period === 'week' ? 'Esta semana' : period === 'month' ? 'Este mes' : 'Todos';

  return (
    <div className="space-y-5">
      {/* Period filter (Bug #19) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Calendar size={14} className="text-muted-foreground shrink-0" />
        {([
          { key: 'today' as const, label: 'Hoy' },
          { key: 'week' as const, label: 'Esta semana' },
          { key: 'month' as const, label: 'Este mes' },
          { key: 'all' as const, label: 'Todo' },
        ]).map(d => (
          <button key={d.key} onClick={() => setPeriod(d.key)}
            className={cn('px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors',
              period === d.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>
            {d.label}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map(kpi => (
          <div key={kpi.label} className="bg-card rounded-xl p-4 shadow-card border border-border">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-8 h-8 rounded-lg bg-muted flex items-center justify-center ${kpi.color}`}>
                <kpi.icon size={16} />
              </div>
              <span className="text-xs text-muted-foreground">{kpi.label}</span>
            </div>
            <p className="font-display font-bold text-lg truncate">{kpi.value}</p>
            <p className="text-xs text-muted-foreground">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Mini reports: payment methods (only PAID) + pending */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card rounded-xl p-3 shadow-card border border-border">
          <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1">💵 Efectivo</p>
          <p className="font-display font-bold text-sm">{formatPrice(cashTotal)}</p>
        </div>
        <div className="bg-card rounded-xl p-3 shadow-card border border-border">
          <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1">📱 Transferencias</p>
          <p className="font-display font-bold text-sm">{formatPrice(transferTotal)}</p>
        </div>
        <div className="bg-card rounded-xl p-3 shadow-card border border-border">
          <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1">⏳ Pendiente cobro</p>
          <p className="font-display font-bold text-sm text-warning">{formatPrice(pendingPayment)}</p>
        </div>
        <div className="bg-card rounded-xl p-3 shadow-card border border-border">
          <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1">🛵 Domicilios activos</p>
          <p className="font-display font-bold text-sm">{deliveryActive}</p>
        </div>
      </div>

      {/* Interactive Daily Sales Chart with Hover & Details */}
      <DailySalesChart orders={orders} defaultDays={7} />

      {/* Tables summary - links to /tables */}
      <button onClick={() => navigate('/tables')}
        className="w-full bg-card rounded-xl border border-border p-4 shadow-card hover:shadow-elevated transition-shadow text-left">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🍽️</span>
            <div>
              <h2 className="font-display font-semibold text-sm">Mesas</h2>
              <p className="text-xs text-muted-foreground">
                <span className="text-success font-semibold">{tableCount - occupiedTables.length} libres</span>
                {' • '}
                <span className="text-warning font-semibold">{occupiedTables.length} ocupadas</span>
              </p>
            </div>
          </div>
          <span className="text-xs text-primary font-medium">Ver mesas →</span>
        </div>
      </button>

      {/* Quick Actions */}
      <div>
        <h2 className="font-display font-semibold text-sm mb-3">Acceso rápido</h2>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Pedidos', path: '/orders', emoji: '📦' },
            { label: 'Menú', path: '/products', emoji: '🍔' },
            { label: 'Clientes', path: '/customers', emoji: '👥' },
            { label: 'Reportes', path: '/reports', emoji: '📊' },
          ].map(a => (
            <button key={a.path} onClick={() => navigate(a.path)}
              className="bg-card rounded-xl p-3 shadow-card border border-border flex flex-col items-center gap-1.5 hover:shadow-elevated transition-shadow">
              <span className="text-2xl">{a.emoji}</span>
              <span className="text-xs font-medium">{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Recent Orders - filtered by period (Bug #20) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-semibold text-sm">Pedidos recientes — {periodLabel}</h2>
          <button onClick={() => navigate('/orders')} className="text-xs text-primary font-medium">Ver todos →</button>
        </div>
        {filteredOrders.length === 0 ? (
          <div className="bg-card rounded-xl border border-border shadow-card p-8 text-center">
            <span className="text-3xl block mb-2">📋</span>
            <p className="text-sm text-muted-foreground">No hay pedidos en este período</p>
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border shadow-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">#</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Cliente</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Tipo</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Estado</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Pago</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Total</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Hora</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.slice(0, 10).map(order => (
                  <tr key={order.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/orders/${order.id}`)}>
                    <td className="px-3 py-2 font-display font-bold">{order.id}</td>
                    <td className="px-3 py-2 truncate max-w-[120px]">{order.customer.name}</td>
                    <td className="px-3 py-2"><OrderTypeBadge type={order.type} /></td>
                    <td className="px-3 py-2"><StatusBadge status={order.status} orderType={order.type} /></td>
                    <td className="px-3 py-2">
                      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full',
                        order.paymentStatus === 'paid' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning')}>
                        {order.paymentStatus === 'paid' ? 'Pagado' : 'Pendiente'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-display font-semibold">{formatPrice(order.total)}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground text-xs">{formatTime(order.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* FAB - only desktop, mobile has bottom nav */}
      <button onClick={() => navigate('/orders/new')}
        className="hidden md:flex fixed bottom-6 right-6 w-14 h-14 rounded-full gradient-primary shadow-fab items-center justify-center text-primary-foreground z-30 hover:scale-105 transition-transform">
        <Plus size={24} />
      </button>
    </div>
  );
};

export default DashboardPage;
