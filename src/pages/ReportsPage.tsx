import { ElectronicInvoiceModal } from '@/components/ElectronicInvoiceModal';
import { downloadXlsx, xlsxDate, xlsxTime } from '@/lib/xlsx';
import { BRAND } from '@/lib/theme';
import { orderNumber } from '@/lib/orderNumber';
import React, { useState, useMemo } from 'react';
import { useStore, type Order } from '@/store/useStore';
import { RestaurantStats } from '@/components/restaurant/RestaurantStats';
import { formatPrice, getColombiaTodayStr, getColombiaYesterdayStr, getColombiaNow, getOrderDateStr } from '@/lib/format';
import {
  Search,
  Download,
  Printer,
  Calendar,
  Eye,
  CheckCircle2,
  X,
  FileText,
  BarChart3,
  Trash2,
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Legend } from 'recharts';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { PrintModal } from '@/components/PrintModal';
import { DailySalesChart } from '@/components/DailySalesChart';

type PeriodKey = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

export const ReportsPage: React.FC = () => {
  const { orders, currentShift, user, deleteOrder } = useStore();

  const [activeTab, setActiveTab] = useState<'ventas' | 'graficas'>('ventas');
  const [feOrderId, setFeOrderId] = useState<number | null>(null);
  const [period, setPeriod] = useState<PeriodKey>('today');
  const [search, setSearch] = useState('');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [selectedInvoice, setSelectedInvoice] = useState<Order | null>(null);
  const [formatFilter, setFormatFilter] = useState<'all' | 'cups' | '4oz' | '6oz' | 'cono' | 'litro'>('all');

  // Helper to categorize format/presentation of an item
  const getFormatKey = (item: { name?: string; size?: string }): '4oz' | '6oz' | 'cono' | 'litro' | 'otros' => {
    const n = (item.name || '').toLowerCase();
    const s = (item.size || '').toLowerCase();
    if (n.includes('4 oz') || s.includes('4 oz') || s.includes('pequeño') || s.includes('pequeno')) return '4oz';
    if (n.includes('6 oz') || s.includes('6 oz') || s.includes('grande')) return '6oz';
    if (n.includes('cono') || s.includes('cono')) return 'cono';
    if (n.includes('litro') || s.includes('litro') || s.includes('1000 ml')) return 'litro';
    return 'otros';
  };

  const filtered = useMemo(() => {
    const todayStr = getColombiaTodayStr();
    const yesterdayStr = getColombiaYesterdayStr();
    const nowColombia = getColombiaNow();

    return orders.filter(o => {
      const orderDate = getOrderDateStr(o.createdAt);
      if (period === 'today' && orderDate !== todayStr) return false;
      if (period === 'yesterday' && orderDate !== yesterdayStr) return false;
      if (period === 'week') {
        const weekAgo = new Date(nowColombia);
        weekAgo.setDate(weekAgo.getDate() - 7);
        const wStr = weekAgo.toISOString().split('T')[0];
        if (orderDate < wStr) return false;
      }
      if (period === 'month') {
        const monthAgo = new Date(nowColombia);
        monthAgo.setDate(monthAgo.getDate() - 30);
        const mStr = monthAgo.toISOString().split('T')[0];
        if (orderDate < mStr) return false;
      }
      if (period === 'custom') {
        if (customFrom && orderDate < customFrom) return false;
        if (customTo && orderDate > customTo) return false;
      }

      if (paymentFilter !== 'all' && o.paymentMethod !== paymentFilter) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const docId = `${orderNumber(o.id)} #${o.id}`.toLowerCase();
        const clientName = (o.customer?.name || '').toLowerCase();
        const clientDoc = (o.customer?.doc || '').toLowerCase();
        const cashier = (o.cashierName || '').toLowerCase();
        if (!docId.includes(q) && !clientName.includes(q) && !clientDoc.includes(q) && !cashier.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [orders, period, customFrom, customTo, paymentFilter, search, currentShift, user]);
  // Rango del período para las estadísticas del restaurante (mesas, domicilios, meseros, repartidores)
  const statsRange = useMemo(() => {
    const dates = filtered.map(o => o.createdAt.slice(0, 10)).sort();
    return dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null;
  }, [filtered]);

  const metrics = useMemo(() => {
    const validOrders = filtered.filter(o => o.status !== 'cancelled');
    const cash = validOrders.filter(o => o.paymentMethod === 'cash').reduce((s, o) => s + o.total, 0);
    const debit = validOrders.filter(o => o.paymentMethod === 'card_debit').reduce((s, o) => s + o.total, 0);
    const credit = validOrders.filter(o => o.paymentMethod === 'card_credit').reduce((s, o) => s + o.total, 0);
    const cards = debit + credit;
    const transfer = validOrders.filter(o => o.paymentMethod === 'transfer').reduce((s, o) => s + o.total, 0);
    const totalSales = validOrders.reduce((s, o) => s + o.total, 0);
    const totalCount = validOrders.length;

    return {
      cash,
      debit,
      credit,
      cards,
      transfer,
      creditSales: 0,
      others: 0,
      refunds: 0,
      totalSales,
      totalCount,
    };
  }, [filtered]);

  // Statistics by container/presentation format
  const presentationStats = useMemo(() => {
    const res = {
      '4oz': { key: '4oz', label: 'Vaso 4 oz', qty: 0, revenue: 0, emoji: '🍨', color: BRAND.primary },
      '6oz': { key: '6oz', label: 'Vaso 6 oz', qty: 0, revenue: 0, emoji: '🍨', color: BRAND.dark },
      'cono': { key: 'cono', label: 'Conos', qty: 0, revenue: 0, emoji: '🍦', color: '#B0892E' },
      'litro': { key: 'litro', label: 'Litro Familiar', qty: 0, revenue: 0, emoji: '🧊', color: BRAND.accent },
      'otros': { key: 'otros', label: 'Bebidas & Otros', qty: 0, revenue: 0, emoji: '☕', color: BRAND.muted },
    };

    filtered.forEach(o => {
      if (o.status === 'cancelled') return;
      o.items.forEach(i => {
        const fmt = getFormatKey(i);
        res[fmt].qty += i.quantity;
        res[fmt].revenue += (i.price * i.quantity);
      });
    });

    const totalCups = res['4oz'].qty + res['6oz'].qty;
    const totalCupsRevenue = res['4oz'].revenue + res['6oz'].revenue;
    const totalCupsAndCones = totalCups + res['cono'].qty + res['litro'].qty;
    const totalCupsAndConesRevenue = totalCupsRevenue + res['cono'].revenue + res['litro'].revenue;
    const totalAll = totalCupsAndCones + res['otros'].qty;
    const totalAllRevenue = totalCupsAndConesRevenue + res['otros'].revenue;

    return {
      ...res,
      totalCups,
      totalCupsRevenue,
      totalCupsAndCones,
      totalCupsAndConesRevenue,
      totalAll,
      totalAllRevenue,
    };
  }, [filtered]);

  // Detailed flavor stats with presentation breakdown and format filter
  const flavorStats = useMemo(() => {
    const counts: Record<string, {
      qty: number;
      revenue: number;
      breakdown: { '4oz': number; '6oz': number; cono: number; litro: number; otros: number };
    }> = {};

    filtered.forEach(o => {
      if (o.status === 'cancelled') return;
      o.items.forEach(i => {
        const fmt = getFormatKey(i);
        // Apply presentation filter if selected
        if (formatFilter === 'cups' && fmt !== '4oz' && fmt !== '6oz') return;
        if (formatFilter !== 'all' && formatFilter !== 'cups' && fmt !== formatFilter) return;

        const processFlavor = (flavorName: string, portionPrice: number) => {
          if (!counts[flavorName]) {
            counts[flavorName] = {
              qty: 0,
              revenue: 0,
              breakdown: { '4oz': 0, '6oz': 0, cono: 0, litro: 0, otros: 0 },
            };
          }
          counts[flavorName].qty += i.quantity;
          counts[flavorName].revenue += portionPrice;
          counts[flavorName].breakdown[fmt] += i.quantity;
        };

        if (i.flavors) {
          const splitFlavors = i.flavors.split(',').map(s => s.trim()).filter(Boolean);
          const pricePerFlavor = Math.round((i.price * i.quantity) / Math.max(1, splitFlavors.length));
          splitFlavors.forEach(f => {
            processFlavor(f, pricePerFlavor);
          });
        } else if (i.name && i.name.includes('—')) {
          const parts = i.name.split('—');
          const cleanName = parts[parts.length - 1].trim();
          processFlavor(cleanName, i.price * i.quantity);
        } else {
          const name = i.name.trim();
          processFlavor(name, i.price * i.quantity);
        }
      });
    });

    return Object.entries(counts)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);
  }, [filtered, formatFilter]);

  const handleDeleteOrder = async (orderId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`¿Estás seguro de eliminar permanentemente la orden ${orderNumber(orderId)}?`)) {
      return;
    }
    try {
      await deleteOrder(orderId);
      toast.success(`Orden ${orderNumber(orderId)} eliminada correctamente`);
      if (selectedInvoice?.id === orderId) {
        setSelectedInvoice(null);
      }
    } catch (err) {
      toast.error('Error al eliminar la orden');
    }
  };

  // Excel real (.xlsx): fecha y hora en columnas separadas, totales numéricos para que Excel los sume
  const PM_LABEL: Record<string, string> = { cash: 'Efectivo', card_debit: 'Tarjeta débito', card_credit: 'Tarjeta crédito', card: 'Tarjeta', transfer: 'Transferencia / QR', platform: 'Plataforma (Rappi/DiDi)', credit: 'A crédito', mixed: 'Mixto' };
  // Cómo se pagó realmente: para pagos mixtos, cada medio con su valor
  const paymentDetail = (o: any): string => {
    const s = o.paymentSplit;
    if (o.paymentMethod === 'mixed' && s && s.method1) return `${PM_LABEL[s.method1] || s.method1} ${formatPrice(Number(s.amount1) || 0)} + ${PM_LABEL[s.method2] || s.method2} ${formatPrice(Number(s.amount2) || 0)}`;
    return PM_LABEL[o.paymentMethod] || o.paymentMethod;
  };
  const partsOf = (o: any): number[] => {
    const p = { cash: 0, debit: 0, credit: 0, transfer: 0, platform: 0 };
    const add = (m: string, amt: number) => { if (m === 'cash') p.cash += amt; else if (m === 'card_debit') p.debit += amt; else if (m === 'card_credit' || m === 'card') p.credit += amt; else if (m === 'transfer') p.transfer += amt; else if (m === 'platform') p.platform += amt; };
    const s = o.paymentSplit;
    if (o.paymentMethod === 'mixed' && s && s.method1) { add(s.method1, Number(s.amount1) || 0); if (s.method2) add(s.method2, Number(s.amount2) || 0); }
    else add(o.paymentMethod, o.total);
    return [p.cash, p.debit, p.credit, p.transfer, p.platform];
  };
  const handleExportCSV = () => {
    const pm = PM_LABEL;
    const headers = ['Fecha', 'Hora', 'Comprobante', 'Tipo', 'Turno', 'Vendedor', 'Cliente', 'Doc Cliente', 'Método de pago', 'Detalle del pago', 'Efectivo', 'Tarjeta débito', 'Tarjeta crédito', 'Transferencia', 'Plataforma', 'Estado', 'Total'];
    const rows = filtered.map(o => [
      xlsxDate(o.createdAt),
      xlsxTime(o.createdAt),
      orderNumber(o.id),
      o.type === 'dine-in' ? `Mesa ${o.tableLabel || o.tableNumber || ''}` : o.type === 'delivery' ? 'Domicilio' : 'Para llevar / mostrador',
      o.shiftId ? `#${o.shiftId}` : '',
      o.cashierName || '',
      o.customer?.name || 'Consumidor Final',
      o.customer?.doc || '222222222222',
      pm[o.paymentMethod] || o.paymentMethod,
      paymentDetail(o),
      ...partsOf(o),
      o.status === 'cancelled' ? 'Anulado' : 'Guardado',
      o.total,
    ]);
    downloadXlsx(`ventas_${period}_${getColombiaTodayStr()}`, [{ name: 'Ventas', headers, rows }]);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5 font-sans">
      {/* Header & Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-sans font-bold text-2xl lg:text-3xl text-brand-dark">
            Ventas e ingresos
          </h1>
          <p className="text-xs text-brand-muted mt-0.5 font-sans">
            Registro de comprobantes, facturas de ingreso y balances de venta
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-brand-card p-1 rounded-2xl border border-brand-primary/10">
            <button
              onClick={() => setActiveTab('ventas')}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all',
                activeTab === 'ventas' ? 'bg-brand-button text-brand-on-button shadow-sm' : 'text-brand-primary hover:bg-white/60'
              )}
            >
              <FileText size={14} />
              <span>Comprobantes</span>
            </button>
            <button
              onClick={() => setActiveTab('graficas')}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all',
                activeTab === 'graficas' ? 'bg-brand-button text-brand-on-button shadow-sm' : 'text-brand-primary hover:bg-white/60'
              )}
            >
              <BarChart3 size={14} />
              <span>Estadísticas</span>
            </button>
          </div>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-brand-primary/20 text-xs font-bold text-brand-primary hover:bg-brand-card shadow-sm transition-all"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Descargar Excel</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl p-3 border border-brand-primary/10 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search input */}
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por N° comprobante (ej. POS-1003), cliente o vendedor..."
            className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-gray-50 border border-gray-200 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-primary font-sans"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Period Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {(['today', 'yesterday', 'week', 'month'] as PeriodKey[]).map((p) => {
            const labels: Record<PeriodKey, string> = {
              today: 'Hoy',
              yesterday: 'Ayer',
              week: 'Esta semana',
              month: 'Este mes',
              custom: 'Personalizado',
            };
            const isSelected = period === p;
            return (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  'px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all font-sans',
                  isSelected
                    ? 'bg-brand-button text-brand-on-button shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                {labels[p]}
              </button>
            );
          })}

          <button
            onClick={() => setPeriod('custom')}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1 font-sans',
              period === 'custom'
                ? 'bg-brand-button text-brand-on-button shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            <Calendar size={13} />
            <span>Rango</span>
          </button>

          {/* Payment Method Filter */}
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-gray-100 border border-gray-200 text-gray-700 font-sans"
          >
            <option value="all">Todos los pagos</option>
            <option value="cash">Efectivo</option>
            <option value="card_debit">Tarjeta Débito</option>
            <option value="card_credit">Tarjeta Crédito</option>
            <option value="transfer">QR / Transferencia</option>
          </select>
        </div>
      </div>

      {/* Custom Date Range Picker */}
      {period === 'custom' && (
        <div className="bg-brand-card p-3 rounded-2xl border border-brand-accent/40 flex items-center gap-3 text-xs font-sans">
          <span className="font-bold text-brand-primary">Desde:</span>
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="p-1.5 rounded-lg border border-gray-300 bg-white"
          />
          <span className="font-bold text-brand-primary">Hasta:</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="p-1.5 rounded-lg border border-gray-300 bg-white"
          />
        </div>
      )}

      {/* Top KPI Metrics Bar */}
      <div className="bg-white rounded-2xl p-4 border border-brand-primary/10 shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-left">
          {/* Efectivo */}
          <div className="p-2 border-r border-gray-100 last:border-r-0">
            <span className="text-[11px] font-medium text-gray-500 block font-sans">Efectivo</span>
            <span className="text-sm lg:text-base font-bold font-sans text-brand-dark block mt-0.5">
              {formatPrice(metrics.cash)}
            </span>
          </div>

          {/* Tarjetas */}
          <div className="p-2 border-r border-gray-100 last:border-r-0">
            <span className="text-[11px] font-medium text-gray-500 block font-sans">Tarjetas</span>
            <span className="text-sm lg:text-base font-bold font-sans text-brand-dark block mt-0.5">
              {formatPrice(metrics.cards)}
            </span>
            <span className="text-[10px] text-gray-400 font-sans block">(Déb: {formatPrice(metrics.debit)})</span>
          </div>

          {/* Pagos en línea / QR */}
          <div className="p-2 border-r border-gray-100 last:border-r-0">
            <span className="text-[11px] font-medium text-gray-500 block font-sans">Pagos QR / Transferencia</span>
            <span className="text-sm lg:text-base font-bold font-sans text-brand-dark block mt-0.5">
              {formatPrice(metrics.transfer)}
            </span>
          </div>

          {/* Crédito */}
          <div className="p-2 border-r border-gray-100 last:border-r-0">
            <span className="text-[11px] font-medium text-gray-500 block font-sans">Crédito</span>
            <span className="text-sm lg:text-base font-bold font-sans text-gray-400 block mt-0.5">
              $0,00
            </span>
          </div>

          {/* Otros */}
          <div className="p-2 border-r border-gray-100 last:border-r-0">
            <span className="text-[11px] font-medium text-gray-500 block font-sans">Otros</span>
            <span className="text-sm lg:text-base font-bold font-sans text-gray-400 block mt-0.5">
              $0,00
            </span>
          </div>

          {/* Devoluciones */}
          <div className="p-2 border-r border-gray-100 last:border-r-0">
            <span className="text-[11px] font-medium text-gray-500 block font-sans">Devoluciones</span>
            <span className="text-sm lg:text-base font-bold font-sans text-gray-400 block mt-0.5">
              $0,00
            </span>
          </div>

          {/* Total Ventas */}
          <div className="p-2 relative col-span-2 sm:col-span-1">
            <span className="text-[11px] font-bold font-sans text-brand-dark block">Total ventas</span>
            <span className="text-base lg:text-lg font-extrabold font-sans text-brand-dark block mt-0.5">
              {formatPrice(metrics.totalSales)}
            </span>
            <div className="w-full h-1 bg-brand-button rounded-full mt-1.5" />
          </div>
        </div>
      </div>

      {/* TAB 1: Comprobantes Table (Brand Palette) */}
      {activeTab === 'ventas' && (
        <div className="bg-white rounded-2xl border border-brand-primary/10 shadow-sm overflow-hidden font-sans">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-brand-surface text-brand-on-dark font-semibold">
                  <th className="py-3 px-4">Fecha</th>
                  <th className="py-3 px-4">Nro. Comprobante</th>
                  <th className="py-3 px-4">Tipo Comprobante</th>
                  <th className="py-3 px-4">Vendedor</th>
                  <th className="py-3 px-4">Turno</th>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4 text-right">Total Ventas</th>
                  <th className="py-3 px-4">Método de Pago</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-gray-400">
                      No se encontraron comprobantes para el período seleccionado.
                    </td>
                  </tr>
                ) : (
                  filtered.map((order) => {
                    const formattedDate = new Date(order.createdAt).toLocaleDateString('es-CO', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    });

                    return (
                      <tr
                        key={order.id}
                        className="hover:bg-brand-card/60 transition-colors group cursor-pointer"
                        onClick={() => setSelectedInvoice(order)}
                      >
                        {/* Fecha */}
                        <td className="py-3.5 px-4 text-gray-700 font-medium whitespace-nowrap font-sans">
                          {formattedDate}
                        </td>

                        {/* Nro Comprobante */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="text-brand-primary font-bold font-sans hover:underline">
                            {orderNumber(order.id)}
                          </span>
                          {(order.customer?.isElectronicInvoice || order.electronicInvoice) && (
                            <button onClick={() => setFeOrderId(order.id)} className="ml-1.5 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold" title="Factura electrónica (modo pruebas)">F.E.</button>
                          )}
                          {feOrderId === order.id && <ElectronicInvoiceModal order={order} onClose={() => setFeOrderId(null)} />}
                        </td>

                        {/* Tipo */}
                        <td className="py-3.5 px-4 text-gray-600 whitespace-nowrap font-sans">
                          {order.type === 'dine-in' ? `Mesa ${order.tableLabel || order.tableNumber || ''}` : order.type === 'delivery' ? 'Domicilio' : 'Para llevar'}
                          {order.paymentStatus === 'pending' && order.status !== 'cancelled' && <span className="ml-1 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold">Por cobrar</span>}
                        </td>

                        {/* Vendedor */}
                        <td className="py-3.5 px-4 text-gray-700 font-medium whitespace-nowrap font-sans">
                          {order.cashierName || '—'}
                        </td>

                        {/* Turno */}
                        <td className="py-3.5 px-4 text-gray-500 whitespace-nowrap font-sans">
                          {order.shiftId ? `#${order.shiftId}` : '—'}
                        </td>

                        {/* Cliente */}
                        <td className="py-3.5 px-4 text-brand-dark font-semibold truncate max-w-[150px] font-sans">
                          {order.customer?.name || 'Consumidor Final'}
                        </td>

                        {/* Total Ventas */}
                        <td className="py-3.5 px-4 text-right font-bold font-sans text-brand-dark whitespace-nowrap">
                          {formatPrice(order.total)}
                        </td>

                        {/* Métodos de Pago */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-brand-card text-brand-primary border border-brand-accent/40 font-sans">
                            {order.paymentMethod === 'cash' ? 'Efectivo' :
                             order.paymentMethod === 'card_debit' ? 'Tarjeta Débito' :
                             order.paymentMethod === 'card_credit' ? 'Tarjeta Crédito' :
                             order.paymentMethod === 'mixed' ? 'Mixto' :
                             order.paymentMethod === 'platform' ? 'Plataforma' :
                             order.paymentMethod === 'credit' ? 'A crédito' : 'Transferencia QR'}
                          </span>
                          {order.paymentMethod === 'mixed' && <p className="text-[10px] text-muted-foreground mt-0.5 font-sans">{paymentDetail(order)}</p>}
                        </td>

                        {/* Estado */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-[11px] font-sans">
                            <CheckCircle2 size={13} className="text-emerald-600" />
                            Guardado
                          </span>
                        </td>

                        {/* Acciones */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setSelectedInvoice(order)}
                              className="p-1.5 rounded-lg hover:bg-brand-card text-brand-primary transition-colors"
                              title="Ver Factura"
                            >
                              <Eye size={15} />
                            </button>
                            <button
                              onClick={() => {
                                setSelectedInvoice(order);
                                
                              }}
                              className="p-1.5 rounded-lg hover:bg-brand-card text-brand-primary transition-colors"
                              title="Imprimir"
                            >
                              <Printer size={15} />
                            </button>
                            {user?.role === 'admin' && (
                              <button
                                onClick={(e) => handleDeleteOrder(order.id, e)}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 transition-colors"
                                title="Eliminar Comprobante (Admin)"
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500 font-sans">
            <span>Mostrando {filtered.length} registro(s)</span>
            <span>Total Filtrado: <strong>{formatPrice(metrics.totalSales)}</strong></span>
          </div>
        </div>
      )}

      {/* TAB 2: Gráficas y Estadísticas */}
      {activeTab === 'graficas' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 font-sans">
          {statsRange && <RestaurantStats from={statsRange.from} to={statsRange.to} />}
          {/* Tarjetas de Presentaciones / Envases Vendidos en el Período */}
          <div className="col-span-1 lg:col-span-12">
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-brand-primary/10 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="font-bold text-base text-brand-dark flex items-center gap-2">
                    <span>🍨</span> Envases y Presentaciones Vendidas en el Período
                  </h3>
                  <p className="text-xs text-gray-500">
                    Cantidades exactas de vasos de 4 oz, 6 oz, conos y litros comercializados (haz clic en una tarjeta para filtrar los sabores abajo)
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                  <div className="text-xs font-semibold text-brand-primary bg-brand-card px-3 py-1.5 rounded-xl border border-brand-accent/30">
                    Total Vasos (4 y 6 oz): <strong>{presentationStats.totalCups} unidades</strong>
                  </div>
                  <div className="text-xs font-semibold text-gray-600 bg-gray-100 px-3 py-1.5 rounded-xl">
                    Total helados: <strong>{presentationStats.totalCupsAndCones} unidades</strong>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
                {/* Total Vasos Físicos (4 oz + 6 oz) */}
                <div
                  onClick={() => setFormatFilter(formatFilter === 'cups' ? 'all' : 'cups')}
                  className={cn(
                    'p-3.5 rounded-2xl border transition-all cursor-pointer text-left relative overflow-hidden',
                    formatFilter === 'cups'
                      ? 'bg-brand-button text-brand-on-button border-brand-primary shadow-md ring-2 ring-brand-primary/30'
                      : 'bg-brand-card/80 hover:bg-brand-card border-brand-accent/40 text-brand-dark'
                  )}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xl">📦</span>
                    <span className={cn(
                      'text-[10px] font-bold px-2 py-0.5 rounded-full',
                      formatFilter === 'cups' ? 'bg-white/20 text-white' : 'bg-brand-button/10 text-brand-primary'
                    )}>
                      Total Vasos
                    </span>
                  </div>
                  <span className={cn('text-[11px] font-medium block', formatFilter === 'cups' ? 'text-gray-300' : 'text-gray-600')}>
                    Vasos 4 oz + 6 oz
                  </span>
                  <span className="text-2xl font-black block mt-0.5">
                    {presentationStats.totalCups} <span className="text-xs font-normal">vasos</span>
                  </span>
                  <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-black/5">
                    <span className={cn('text-xs font-bold', formatFilter === 'cups' ? 'text-emerald-300' : 'text-emerald-700')}>
                      {formatPrice(presentationStats.totalCupsRevenue)}
                    </span>
                    <span className={cn('text-[10px]', formatFilter === 'cups' ? 'text-gray-300' : 'text-gray-500')}>
                      {presentationStats.totalCupsAndCones > 0 ? `${Math.round((presentationStats.totalCups / presentationStats.totalCupsAndCones) * 100)}%` : '0%'}
                    </span>
                  </div>
                </div>

                {/* Vaso 4 oz */}
                <div
                  onClick={() => setFormatFilter(formatFilter === '4oz' ? 'all' : '4oz')}
                  className={cn(
                    'p-3.5 rounded-2xl border transition-all cursor-pointer text-left relative overflow-hidden',
                    formatFilter === '4oz'
                      ? 'bg-brand-button text-brand-on-button border-brand-primary shadow-md ring-2 ring-brand-primary/30'
                      : 'bg-gray-50/80 hover:bg-brand-card border-gray-200 text-brand-dark'
                  )}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xl">🍨</span>
                    <span className={cn(
                      'text-[10px] font-bold px-2 py-0.5 rounded-full',
                      formatFilter === '4oz' ? 'bg-white/20 text-white' : 'bg-gray-200/80 text-gray-700'
                    )}>
                      4 oz
                    </span>
                  </div>
                  <span className={cn('text-[11px] font-medium block', formatFilter === '4oz' ? 'text-gray-300' : 'text-gray-500')}>
                    Vaso 4 oz (1 sabor)
                  </span>
                  <span className="text-2xl font-black block mt-0.5">
                    {presentationStats['4oz'].qty} <span className="text-xs font-normal">uds</span>
                  </span>
                  <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-black/5">
                    <span className={cn('text-xs font-bold', formatFilter === '4oz' ? 'text-emerald-300' : 'text-emerald-700')}>
                      {formatPrice(presentationStats['4oz'].revenue)}
                    </span>
                    <span className={cn('text-[10px]', formatFilter === '4oz' ? 'text-gray-300' : 'text-gray-400')}>
                      {presentationStats.totalCupsAndCones > 0 ? `${Math.round((presentationStats['4oz'].qty / presentationStats.totalCupsAndCones) * 100)}%` : '0%'}
                    </span>
                  </div>
                </div>

                {/* Vaso 6 oz */}
                <div
                  onClick={() => setFormatFilter(formatFilter === '6oz' ? 'all' : '6oz')}
                  className={cn(
                    'p-3.5 rounded-2xl border transition-all cursor-pointer text-left relative overflow-hidden',
                    formatFilter === '6oz'
                      ? 'bg-brand-button text-brand-on-button border-brand-primary shadow-md ring-2 ring-brand-primary/30'
                      : 'bg-gray-50/80 hover:bg-brand-card border-gray-200 text-brand-dark'
                  )}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xl">🍨</span>
                    <span className={cn(
                      'text-[10px] font-bold px-2 py-0.5 rounded-full',
                      formatFilter === '6oz' ? 'bg-white/20 text-white' : 'bg-gray-200/80 text-gray-700'
                    )}>
                      6 oz
                    </span>
                  </div>
                  <span className={cn('text-[11px] font-medium block', formatFilter === '6oz' ? 'text-gray-300' : 'text-gray-500')}>
                    Vaso 6 oz (2 sabores)
                  </span>
                  <span className="text-2xl font-black block mt-0.5">
                    {presentationStats['6oz'].qty} <span className="text-xs font-normal">uds</span>
                  </span>
                  <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-black/5">
                    <span className={cn('text-xs font-bold', formatFilter === '6oz' ? 'text-emerald-300' : 'text-emerald-700')}>
                      {formatPrice(presentationStats['6oz'].revenue)}
                    </span>
                    <span className={cn('text-[10px]', formatFilter === '6oz' ? 'text-gray-300' : 'text-gray-400')}>
                      {presentationStats.totalCupsAndCones > 0 ? `${Math.round((presentationStats['6oz'].qty / presentationStats.totalCupsAndCones) * 100)}%` : '0%'}
                    </span>
                  </div>
                </div>

                {/* Conos */}
                <div
                  onClick={() => setFormatFilter(formatFilter === 'cono' ? 'all' : 'cono')}
                  className={cn(
                    'p-3.5 rounded-2xl border transition-all cursor-pointer text-left relative overflow-hidden',
                    formatFilter === 'cono'
                      ? 'bg-brand-button text-brand-on-button border-brand-primary shadow-md ring-2 ring-brand-primary/30'
                      : 'bg-gray-50/80 hover:bg-brand-card border-gray-200 text-brand-dark'
                  )}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xl">🍦</span>
                    <span className={cn(
                      'text-[10px] font-bold px-2 py-0.5 rounded-full',
                      formatFilter === 'cono' ? 'bg-white/20 text-white' : 'bg-gray-200/80 text-gray-700'
                    )}>
                      Conos
                    </span>
                  </div>
                  <span className={cn('text-[11px] font-medium block', formatFilter === 'cono' ? 'text-gray-300' : 'text-gray-500')}>
                    Conos Waffle
                  </span>
                  <span className="text-2xl font-black block mt-0.5">
                    {presentationStats['cono'].qty} <span className="text-xs font-normal">uds</span>
                  </span>
                  <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-black/5">
                    <span className={cn('text-xs font-bold', formatFilter === 'cono' ? 'text-emerald-300' : 'text-emerald-700')}>
                      {formatPrice(presentationStats['cono'].revenue)}
                    </span>
                    <span className={cn('text-[10px]', formatFilter === 'cono' ? 'text-gray-300' : 'text-gray-400')}>
                      {presentationStats.totalCupsAndCones > 0 ? `${Math.round((presentationStats['cono'].qty / presentationStats.totalCupsAndCones) * 100)}%` : '0%'}
                    </span>
                  </div>
                </div>

                {/* Litros */}
                <div
                  onClick={() => setFormatFilter(formatFilter === 'litro' ? 'all' : 'litro')}
                  className={cn(
                    'p-3.5 rounded-2xl border transition-all cursor-pointer text-left relative overflow-hidden',
                    formatFilter === 'litro'
                      ? 'bg-brand-button text-brand-on-button border-brand-primary shadow-md ring-2 ring-brand-primary/30'
                      : 'bg-gray-50/80 hover:bg-brand-card border-gray-200 text-brand-dark'
                  )}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xl">🧊</span>
                    <span className={cn(
                      'text-[10px] font-bold px-2 py-0.5 rounded-full',
                      formatFilter === 'litro' ? 'bg-white/20 text-white' : 'bg-gray-200/80 text-gray-700'
                    )}>
                      Litro
                    </span>
                  </div>
                  <span className={cn('text-[11px] font-medium block', formatFilter === 'litro' ? 'text-gray-300' : 'text-gray-500')}>
                    Litro Familiar
                  </span>
                  <span className="text-2xl font-black block mt-0.5">
                    {presentationStats['litro'].qty} <span className="text-xs font-normal">uds</span>
                  </span>
                  <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-black/5">
                    <span className={cn('text-xs font-bold', formatFilter === 'litro' ? 'text-emerald-300' : 'text-emerald-700')}>
                      {formatPrice(presentationStats['litro'].revenue)}
                    </span>
                    <span className={cn('text-[10px]', formatFilter === 'litro' ? 'text-gray-300' : 'text-gray-400')}>
                      {presentationStats.totalCupsAndCones > 0 ? `${Math.round((presentationStats['litro'].qty / presentationStats.totalCupsAndCones) * 100)}%` : '0%'}
                    </span>
                  </div>
                </div>

                {/* Bebidas & Otros */}
                <div className="p-3.5 rounded-2xl border border-gray-200 bg-gray-50/80 text-brand-dark text-left">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xl">☕</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-200/80 text-gray-700">
                      Otros
                    </span>
                  </div>
                  <span className="text-[11px] font-medium text-gray-500 block">
                    Bebidas, Café & Adic.
                  </span>
                  <span className="text-2xl font-black block mt-0.5">
                    {presentationStats['otros'].qty} <span className="text-xs font-normal">uds</span>
                  </span>
                  <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-black/5">
                    <span className="text-xs font-bold text-emerald-700">
                      {formatPrice(presentationStats['otros'].revenue)}
                    </span>
                    <span className="text-[10px] text-gray-400">Café/Agua</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Top Flavors Sold - With interactive format filter */}
          <div className="col-span-1 lg:col-span-8 bg-white rounded-2xl p-5 border border-brand-primary/10 shadow-sm flex flex-col justify-between">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="font-bold text-base text-brand-dark">Sabores más vendidos en el período</h3>
                <span className="text-xs text-gray-500">
                  {formatFilter === 'all'
                    ? 'Mostrando ranking general (todas las presentaciones combinadas)'
                    : formatFilter === 'cups'
                    ? 'Filtrado por: Todos los Vasos (4 oz y 6 oz combinados)'
                    : `Filtrado por: ${
                        formatFilter === '4oz'
                          ? 'Solo Vaso 4 oz'
                          : formatFilter === '6oz'
                          ? 'Solo Vaso 6 oz'
                          : formatFilter === 'cono'
                          ? 'Solo Conos'
                          : 'Solo Litro Familiar'
                      }`}
                </span>
              </div>

              {/* Format Filter Pills */}
              <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl self-start sm:self-auto overflow-x-auto max-w-full">
                {[
                  { id: 'all', label: 'Todos' },
                  { id: 'cups', label: 'Todos los Vasos' },
                  { id: '4oz', label: 'Vaso 4 oz' },
                  { id: '6oz', label: 'Vaso 6 oz' },
                  { id: 'cono', label: 'Conos' },
                  { id: 'litro', label: 'Litros' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setFormatFilter(tab.id as any)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all',
                      formatFilter === tab.id
                        ? 'bg-brand-button text-brand-on-button shadow-xs'
                        : 'text-gray-600 hover:text-gray-900'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-[420px] w-full">
              {flavorStats.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 text-xs">
                  <span className="text-3xl mb-1">🍨</span>
                  No se registraron ventas con el formato seleccionado en este período.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={flavorStats} layout="vertical" margin={{ left: 10, right: 30, top: 10, bottom: 10 }}>
                    <XAxis type="number" tick={{ fontSize: 11, fill: BRAND.muted }} />
                    <YAxis dataKey="name" type="category" width={150} tick={{ fontSize: 12, fill: BRAND.dark, fontWeight: 500 }} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const item = payload[0].payload;
                        return (
                          <div className="bg-brand-surface text-white p-3.5 rounded-xl shadow-xl border border-gray-700 text-xs font-sans min-w-[210px]">
                            <div className="font-bold text-sm text-brand-on-dark border-b border-gray-600/60 pb-1.5 mb-1.5 flex items-center justify-between">
                              <span>{item.name}</span>
                              <span className="text-emerald-400 font-extrabold">{formatPrice(item.revenue || 0)}</span>
                            </div>
                            <div className="space-y-1">
                              <div className="flex justify-between text-gray-300">
                                <span>Porciones vendidas:</span>
                                <strong className="text-white text-sm">{item.qty}</strong>
                              </div>
                              {(formatFilter === 'all' || formatFilter === 'cups') && item.breakdown && (
                                <div className="pt-2 mt-2 border-t border-gray-600/60 space-y-1 text-[11px] text-gray-300">
                                  <span className="font-bold text-brand-accent block">Desglose por envase:</span>
                                  {item.breakdown['4oz'] > 0 && (
                                    <div className="flex justify-between">
                                      <span>• Vaso 4 oz (1 sabor):</span>
                                      <strong className="text-white">{item.breakdown['4oz']} uds.</strong>
                                    </div>
                                  )}
                                  {item.breakdown['6oz'] > 0 && (
                                    <div className="flex justify-between">
                                      <span>• Vaso 6 oz (2 sabores):</span>
                                      <strong className="text-white">{item.breakdown['6oz']} porc.</strong>
                                    </div>
                                  )}
                                  {item.breakdown['cono'] > 0 && (
                                    <div className="flex justify-between">
                                      <span>• Conos:</span>
                                      <strong className="text-white">{item.breakdown['cono']} uds.</strong>
                                    </div>
                                  )}
                                  {item.breakdown['litro'] > 0 && (
                                    <div className="flex justify-between">
                                      <span>• Litro Familiar:</span>
                                      <strong className="text-white">{item.breakdown['litro']} uds.</strong>
                                    </div>
                                  )}
                                  {item.breakdown['otros'] > 0 && (
                                    <div className="flex justify-between">
                                      <span>• Affogato / Especial:</span>
                                      <strong className="text-white">{item.breakdown['otros']} uds.</strong>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="qty" fill={BRAND.primary} radius={[0, 8, 8, 0]} barSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Payment Methods Distribution - Compact width (4 cols on lg) */}
          <div className="col-span-1 lg:col-span-4 bg-white rounded-2xl p-5 border border-brand-primary/10 shadow-sm flex flex-col justify-between">
            <h3 className="font-bold text-base text-brand-dark mb-4">Distribución por Método de Pago</h3>
            <div className="h-[420px] flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Efectivo', value: metrics.cash, color: BRAND.primary },
                      { name: 'T. Débito', value: metrics.debit, color: BRAND.dark },
                      { name: 'T. Crédito', value: metrics.credit, color: BRAND.accent },
                      { name: 'QR / Transferencia', value: metrics.transfer, color: BRAND.muted },
                      { name: 'Plataforma (Rappi/DiDi)', value: filtered.filter(o => o.status !== 'cancelled' && o.paymentMethod === 'platform').reduce((s, o) => s + o.total, 0), color: '#0ea5e9' },
                      { name: 'Por cobrar', value: filtered.filter(o => o.status !== 'cancelled' && o.paymentStatus === 'pending').reduce((s, o) => s + o.total, 0), color: '#f59e0b' },
                    ].filter(d => d.value > 0)}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="45%"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={3}
                  >
                    {[
                      { color: BRAND.primary },
                      { color: BRAND.dark },
                      { color: BRAND.accent },
                      { color: BRAND.muted },
                      { color: '#0ea5e9' },
                      { color: '#f59e0b' },
                    ].map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val: any) => formatPrice(Number(val))} />
                  <Legend verticalAlign="bottom" height={40} iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Daily Sales Bar Chart with Interactive Hover (Historical Trend) */}
          <div className="col-span-1 lg:col-span-12">
            <DailySalesChart orders={orders} defaultDays={14} />
          </div>
        </div>
      )}

      {/* Thermal Invoice Print Modal */}
      <PrintModal
        isOpen={!!selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
        order={selectedInvoice}
      />
    </div>
  );
};

export default ReportsPage;
