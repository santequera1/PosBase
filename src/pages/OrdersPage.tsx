import { orderNumber } from '@/lib/orderNumber';
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, LayoutGrid, List, Plus, Trash2, Printer, Eye, CheckCircle2, X } from 'lucide-react';
import { useStore, type OrderStatus, type Order } from '@/store/useStore';
import { formatPrice, getColombiaTodayStr, getColombiaYesterdayStr, getColombiaNow, getOrderDateStr } from '@/lib/format';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { PrintModal } from '@/components/PrintModal';

const statusTabs: { label: string; status: OrderStatus | 'all' }[] = [
  { label: 'Todos', status: 'all' },
  { label: '✅ Entregados', status: 'delivered' },
  { label: '🟡 Pendientes', status: 'pending' },
  { label: '❌ Cancelados', status: 'cancelled' },
];

export const OrdersPage: React.FC = () => {
  const navigate = useNavigate();
  const { orders, deleteOrder, currentShift, user } = useStore();
  const [activeTab, setActiveTab] = useState<OrderStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [dateFilter, setDateFilter] = useState<'today' | 'yesterday' | 'week' | 'month' | 'all' | 'custom'>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<Order | null>(null);

  const filtered = useMemo(() => {
    const todayStr = getColombiaTodayStr();
    const yesterdayStr = getColombiaYesterdayStr();
    const nowColombia = getColombiaNow();

    return orders.filter(o => {
      // Date filter
      if (dateFilter !== 'all') {
        const orderDate = getOrderDateStr(o.createdAt);
        if (dateFilter === 'today' && orderDate !== todayStr) return false;
        if (dateFilter === 'yesterday' && orderDate !== yesterdayStr) return false;
        if (dateFilter === 'week') {
          const w = new Date(nowColombia); w.setDate(w.getDate() - 7);
          const wStr = w.toISOString().split('T')[0];
          if (orderDate < wStr) return false;
        }
        if (dateFilter === 'month') {
          const m = new Date(nowColombia); m.setDate(m.getDate() - 30);
          const mStr = m.toISOString().split('T')[0];
          if (orderDate < mStr) return false;
        }
        if (dateFilter === 'custom') {
          if (customFrom && orderDate < customFrom) return false;
          if (customTo && orderDate > customTo) return false;
        }
      }
      if (activeTab !== 'all' && o.status !== activeTab) return false;
      if (search && !`#${o.id} ${orderNumber(o.id)} ${o.customer.name} ${o.customer.doc}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [orders, dateFilter, customFrom, customTo, activeTab, search]);

  const summarySales = filtered.filter(o => o.status !== 'cancelled').reduce((sum, o) => sum + o.total, 0);

  const handleDeleteOrder = async (orderId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`¿Estás seguro de eliminar permanentemente el pedido ${orderNumber(orderId)}?`)) {
      return;
    }
    try {
      await deleteOrder(orderId);
      toast.success(`Pedido ${orderNumber(orderId)} eliminado`);
      if (selectedInvoice?.id === orderId) setSelectedInvoice(null);
    } catch (err) {
      toast.error('Error al eliminar el pedido');
    }
  };

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-5 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-sans font-bold text-2xl lg:text-3xl text-brand-dark">
            Historial de Pedidos
          </h1>
          <p className="text-xs text-brand-muted mt-0.5 font-sans">
            Registro de ventas de mostrador y órdenes despachadas
          </p>
        </div>

        <button
          onClick={() => navigate('/pos')}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-brand-primary text-brand-bg font-semibold text-xs hover:bg-brand-dark shadow-md transition-all self-start sm:self-auto font-sans"
        >
          <Plus size={15} />
          <span>Nueva Venta POS</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl p-3 border border-brand-primary/10 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 font-sans">
        {/* Search */}
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por # pedido (ej. POS-1003), cliente o documento..."
            className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-gray-50 border border-gray-200 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-primary font-sans"
          />
        </div>

        {/* Date Filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {[
            { id: 'today', label: 'Hoy' },
            { id: 'yesterday', label: 'Ayer' },
            { id: 'week', label: 'Semana' },
            { id: 'all', label: 'Todos' },
          ].map(df => (
            <button
              key={df.id}
              onClick={() => setDateFilter(df.id as any)}
              className={cn(
                'px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all font-sans',
                dateFilter === df.id
                  ? 'bg-brand-primary text-brand-bg shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              {df.label}
            </button>
          ))}

          {/* View toggle */}
          <div className="flex bg-gray-100 p-0.5 rounded-xl border border-gray-200 ml-2">
            <button
              onClick={() => setViewMode('cards')}
              className={cn('p-1.5 rounded-lg text-xs', viewMode === 'cards' ? 'bg-white text-brand-primary shadow-sm' : 'text-gray-500')}
              title="Vista Tarjetas"
            >
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn('p-1.5 rounded-lg text-xs', viewMode === 'list' ? 'bg-white text-brand-primary shadow-sm' : 'text-gray-500')}
              title="Vista Lista"
            >
              <List size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar font-sans">
        {statusTabs.map(t => (
          <button
            key={t.status}
            onClick={() => setActiveTab(t.status)}
            className={cn(
              'px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all font-sans',
              activeTab === t.status
                ? 'bg-brand-card text-brand-dark border border-brand-accent shadow-sm'
                : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-100'
            )}
          >
            {t.label}
          </button>
        ))}
        <span className="text-xs text-gray-500 ml-auto font-semibold font-sans">
          {filtered.length} pedidos • Total: <strong className="text-brand-dark">{formatPrice(summarySales)}</strong>
        </span>
      </div>

      {/* CARDS VIEW */}
      {viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 font-sans">
          {filtered.length === 0 ? (
            <div className="col-span-full py-12 text-center text-gray-400 bg-white rounded-2xl border border-gray-100 font-sans">
              No hay pedidos registrados para este filtro.
            </div>
          ) : (
            filtered.map(order => (
              <div
                key={order.id}
                className="bg-white rounded-2xl p-4 border border-brand-primary/10 shadow-sm hover:border-brand-accent transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2 pb-2 border-b border-gray-100">
                    <div>
                      <span className="font-bold text-sm text-brand-primary font-sans">{orderNumber(order.id)}</span>
                      <p className="text-[11px] text-gray-500 font-sans">{order.createdAt}</p>
                    </div>
                    <span className={cn(
                      'px-2 py-0.5 rounded-md text-[10px] font-bold uppercase font-sans',
                      order.status === 'delivered' ? 'bg-emerald-100 text-emerald-800' :
                      order.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
                    )}>
                      {order.status === 'delivered' ? 'Entregado' : order.status}
                    </span>
                  </div>

                  {/* Customer */}
                  <div className="py-2 text-xs text-brand-dark font-sans">
                    <p className="font-semibold">{order.customer.name}</p>
                    <p className="text-[11px] text-gray-500 font-mono">Doc: {order.customer.doc || '222222222222'}</p>
                  </div>

                  {/* Items */}
                  <div className="py-2 border-t border-dashed border-gray-200 space-y-1 text-xs font-sans">
                    {order.items.map((it, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span className="text-gray-700">{it.quantity}x {it.name}</span>
                        <span className="font-bold text-brand-primary">{formatPrice(it.price * it.quantity)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer */}
                <div className="pt-3 border-t border-gray-100 flex items-center justify-between mt-2">
                  <div>
                    <span className="text-[10px] text-gray-500 uppercase block font-bold font-sans">
                      {order.paymentMethod === 'cash' ? 'Efectivo' :
                       order.paymentMethod === 'card_debit' ? 'Tarjeta Débito' :
                       order.paymentMethod === 'card_credit' ? 'Tarjeta Crédito' : 'QR Transferencia'}
                    </span>
                    <span className="font-bold text-base text-brand-dark font-sans">{formatPrice(order.total)}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setSelectedInvoice(order)}
                      className="p-2 rounded-xl bg-gray-100 hover:bg-brand-card text-brand-primary transition-colors"
                      title="Ver Factura"
                    >
                      <Eye size={15} />
                    </button>
                    <button
                      onClick={() => {
                        setSelectedInvoice(order);
                        
                      }}
                      className="p-2 rounded-xl bg-brand-primary text-brand-bg hover:bg-brand-dark transition-colors shadow-sm"
                      title="Imprimir"
                    >
                      <Printer size={15} />
                    </button>
                    {user?.role === 'admin' && (
                      <button
                        onClick={(e) => handleDeleteOrder(order.id, e)}
                        className="p-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                        title="Eliminar Pedido (Admin)"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* LIST VIEW */
        <div className="bg-white rounded-2xl border border-brand-primary/10 shadow-sm overflow-hidden font-sans">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-brand-card text-brand-primary font-bold border-b border-brand-primary/10">
                  <th className="py-3 px-4"># Pedido</th>
                  <th className="py-3 px-4">Fecha y Hora</th>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Sabores / Ítems</th>
                  <th className="py-3 px-4">Método de Pago</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(order => (
                  <tr key={order.id} className="hover:bg-brand-card/50 transition-colors">
                    <td className="py-3 px-4 font-bold text-brand-primary font-sans">{orderNumber(order.id)}</td>
                    <td className="py-3 px-4 text-gray-500 font-sans">{order.createdAt}</td>
                    <td className="py-3 px-4 font-semibold text-brand-dark font-sans">{order.customer.name}</td>
                    <td className="py-3 px-4 text-gray-600 truncate max-w-xs font-sans">
                      {order.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}
                    </td>
                    <td className="py-3 px-4 font-sans">
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-brand-card text-brand-primary border border-brand-accent/40">
                        {order.paymentMethod === 'cash' ? 'Efectivo' :
                         order.paymentMethod === 'card_debit' ? 'Tarjeta Débito' :
                         order.paymentMethod === 'card_credit' ? 'Tarjeta Crédito' : 'QR Transferencia'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-brand-dark font-sans">{formatPrice(order.total)}</td>
                    <td className="py-3 px-4 font-sans">
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-[11px]">
                        <CheckCircle2 size={13} className="text-emerald-600" />
                        Entregado
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-sans">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setSelectedInvoice(order)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-brand-primary"
                          title="Ver Factura"
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedInvoice(order);
                            
                          }}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
                          title="Imprimir"
                        >
                          <Printer size={15} />
                        </button>
                        {user?.role === 'admin' && (
                          <button
                            onClick={(e) => handleDeleteOrder(order.id, e)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-600"
                            title="Eliminar Pedido (Admin)"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Official Thermal Invoice Print Modal */}
      <PrintModal
        isOpen={!!selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
        order={selectedInvoice}
      />
    </div>
  );
};

export default OrdersPage;
