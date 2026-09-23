import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { StatusBadge } from '@/components/StatusBadge';
import { formatPrice, formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { X, Plus, Eye } from 'lucide-react';

const TablesPage = () => {
  const navigate = useNavigate();
  const { orders, tableCount, updateOrderStatus } = useStore();
  const [selectedTable, setSelectedTable] = useState<number | null>(null);

  // Active table orders (not delivered/cancelled)
  const tableOrders = orders.filter(o => o.type === 'dine-in' && o.tableNumber && !['delivered', 'cancelled'].includes(o.status));
  const occupiedTables = new Set(tableOrders.map(o => o.tableNumber!));

  // All orders for selected table (including history)
  const selectedTableOrders = selectedTable
    ? orders.filter(o => o.type === 'dine-in' && o.tableNumber === selectedTable)
    : [];
  const activeTableOrder = selectedTable
    ? tableOrders.find(o => o.tableNumber === selectedTable)
    : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display font-bold text-lg">Mesas</h2>
          <p className="text-xs text-muted-foreground">
            <span className="text-success font-semibold">{tableCount - occupiedTables.size} libres</span>
            {' • '}
            <span className="text-warning font-semibold">{occupiedTables.size} ocupadas</span>
            {' • '}
            {tableCount} total
          </p>
        </div>
        <button onClick={() => navigate('/orders/new')}
          className="px-4 py-2.5 rounded-lg gradient-primary text-primary-foreground text-sm font-semibold shadow-fab hover:opacity-90 flex items-center gap-2 shrink-0">
          <Plus size={16} /> <span className="hidden sm:inline">Nuevo pedido</span><span className="sm:hidden">Nuevo</span>
        </button>
      </div>

      {/* Table grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {Array.from({ length: tableCount }, (_, i) => i + 1).map(n => {
          const isOccupied = occupiedTables.has(n);
          const order = isOccupied ? tableOrders.find(o => o.tableNumber === n) : null;
          const isSelected = selectedTable === n;

          return (
            <button key={n}
              onClick={() => setSelectedTable(isSelected ? null : n)}
              className={cn(
                'rounded-2xl p-4 text-center transition-all border-2 hover:shadow-md relative',
                isSelected ? 'ring-2 ring-primary ring-offset-2' : '',
                isOccupied
                  ? 'bg-warning/10 border-warning/40 hover:border-warning'
                  : 'bg-card border-border hover:border-success'
              )}>
              <p className="text-3xl mb-1">{isOccupied ? '🍽️' : '🪑'}</p>
              <p className={cn('font-display font-bold text-lg', isOccupied ? 'text-warning' : 'text-muted-foreground')}>
                Mesa {n}
              </p>
              {order ? (
                <div className="mt-1 flex flex-col items-center">
                  <StatusBadge status={order.status} orderType={order.type} />
                  <p className="text-[10px] text-muted-foreground mt-1">#{order.id} • {formatPrice(order.total)}</p>
                </div>
              ) : (
                <p className="text-xs text-success mt-1">Disponible</p>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected table detail */}
      {selectedTable && (
        <div className="bg-card rounded-2xl border border-border p-5 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-bold text-lg">Mesa {selectedTable}</h3>
            <button onClick={() => setSelectedTable(null)}
              className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
              <X size={16} />
            </button>
          </div>

          {activeTableOrder ? (
            <div className="space-y-4">
              {/* Active order */}
              <div className="p-4 rounded-xl bg-warning/5 border border-warning/20">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-bold">#{activeTableOrder.id}</span>
                    <StatusBadge status={activeTableOrder.status} orderType="dine-in" />
                  </div>
                  <span className="text-xs text-muted-foreground">{formatTime(activeTableOrder.createdAt)}</span>
                </div>

                <div className="space-y-1 mb-3">
                  {activeTableOrder.items.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span>{item.quantity}x {item.name}{item.notes ? ` (${item.notes})` : ''}</span>
                      <span className="font-display font-semibold">{formatPrice(item.price * item.quantity)}</span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-warning/20 pt-2 mb-3">
                  <div className="flex justify-between font-display font-bold">
                    <span>Total</span>
                    <span className="text-primary">{formatPrice(activeTableOrder.total)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full',
                      activeTableOrder.paymentStatus === 'paid' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning')}>
                      {activeTableOrder.paymentStatus === 'paid' ? '✅ Pagado' : '⏳ Sin pagar'}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button onClick={() => navigate(`/orders/${activeTableOrder.id}`)}
                    className="flex-1 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-muted flex items-center justify-center gap-1">
                    <Eye size={14} /> Ver pedido
                  </button>
                  {activeTableOrder.status === 'pending' && (
                    <button onClick={() => updateOrderStatus(activeTableOrder.id, 'preparing')}
                      className="flex-1 py-2.5 rounded-lg gradient-primary text-primary-foreground text-sm font-semibold">
                      🔵 Preparar
                    </button>
                  )}
                  {activeTableOrder.status === 'preparing' && (
                    <button onClick={() => updateOrderStatus(activeTableOrder.id, 'ready')}
                      className="flex-1 py-2.5 rounded-lg bg-success text-success-foreground text-sm font-semibold">
                      🟢 Listo
                    </button>
                  )}
                  {activeTableOrder.status === 'ready' && (
                    <button onClick={() => updateOrderStatus(activeTableOrder.id, 'delivered')}
                      className="flex-1 py-2.5 rounded-lg bg-muted text-foreground text-sm font-semibold border border-border">
                      🍽️ Entregado en mesa
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-3xl mb-2">🪑</p>
              <p className="text-sm text-muted-foreground mb-3">Mesa disponible</p>
              <button onClick={() => navigate(`/orders/new?table=${selectedTable}&type=dine-in`)}
                className="px-6 py-2.5 rounded-lg gradient-primary text-primary-foreground text-sm font-semibold">
                <Plus size={14} className="inline mr-1" /> Crear pedido para esta mesa
              </button>
            </div>
          )}

          {/* Order history for this table */}
          {selectedTableOrders.filter(o => o.id !== activeTableOrder?.id).length > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Historial de esta mesa</h4>
              <div className="space-y-1">
                {selectedTableOrders.filter(o => o.id !== activeTableOrder?.id).slice(0, 5).map(o => (
                  <button key={o.id} onClick={() => navigate(`/orders/${o.id}`)}
                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-muted text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-display font-semibold">#{o.id}</span>
                      <StatusBadge status={o.status} orderType="dine-in" />
                    </div>
                    <span className="font-display font-semibold">{formatPrice(o.total)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TablesPage;
