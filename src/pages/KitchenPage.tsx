import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const KitchenPage = () => {
  const navigate = useNavigate();
  const { orders, updateOrderStatus } = useStore();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const activeOrders = orders.filter(o => o.status === 'pending' || o.status === 'preparing');

  const formatTimer = (createdAt: string) => {
    const elapsed = Math.floor((now - new Date(createdAt).getTime()) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const getTimerColor = (createdAt: string) => {
    const elapsed = (now - new Date(createdAt).getTime()) / 60000;
    if (elapsed < 10) return 'text-success';
    if (elapsed < 20) return 'text-warning';
    return 'text-destructive';
  };

  const typeEmoji = { delivery: '🏠', pickup: '🛍️', 'dine-in': '🍽️' };

  return (
    <div className="kitchen-dark min-h-screen p-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-2xl" style={{ color: '#F8FAFC' }}>👨‍🍳 Cocina</h1>
          <p className="text-sm" style={{ color: 'rgba(248,250,252,0.5)' }}>{activeOrders.length} {activeOrders.length === 1 ? 'pedido activo' : 'pedidos activos'}</p>
        </div>
        <button onClick={() => navigate('/dashboard')} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(248,250,252,0.7)' }}>
          ← Volver
        </button>
      </div>

      {activeOrders.length === 0 ? (
        <div className="text-center py-20">
          <span className="text-6xl block mb-4">✨</span>
          <p className="text-xl font-display" style={{ color: 'rgba(248,250,252,0.6)' }}>Todo al día</p>
          <p className="text-sm" style={{ color: 'rgba(248,250,252,0.3)' }}>No hay pedidos pendientes</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <AnimatePresence>
            {activeOrders.map(order => (
              <motion.div key={order.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="rounded-xl p-5 border"
                style={{
                  background: order.status === 'pending' ? 'rgba(245,158,11,0.08)' : 'rgba(59,130,246,0.08)',
                  borderColor: order.status === 'pending' ? 'rgba(245,158,11,0.2)' : 'rgba(59,130,246,0.2)',
                }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-display font-bold text-xl" style={{ color: '#F8FAFC' }}>#{order.id}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{typeEmoji[order.type]}</span>
                    <span className="text-sm font-medium" style={{ color: 'rgba(248,250,252,0.7)' }}>
                      {order.type === 'dine-in' ? `Mesa ${order.tableNumber}` : order.customer.name}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5 mb-4">
                  {order.items.map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="font-display font-bold text-lg" style={{ color: '#F8FAFC' }}>{item.quantity}x</span>
                      <span className="text-sm" style={{ color: 'rgba(248,250,252,0.85)' }}>{item.name}</span>
                      {item.notes && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.2)', color: '#F59E0B' }}>📝 {item.notes}</span>}
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between">
                  <div className={cn('font-display font-bold text-2xl', getTimerColor(order.createdAt))}>
                    ⏱️ {formatTimer(order.createdAt)}
                  </div>
                  {order.status === 'pending' ? (
                    <button onClick={() => updateOrderStatus(order.id, 'preparing')}
                      className="px-5 py-2.5 rounded-xl font-display font-bold text-sm gradient-primary text-primary-foreground shadow-fab hover:opacity-90">
                      🍳 Preparar
                    </button>
                  ) : (
                    <button onClick={() => updateOrderStatus(order.id, 'ready')}
                      className="px-5 py-2.5 rounded-xl font-display font-bold text-sm bg-success text-success-foreground hover:opacity-90">
                      ✅ LISTO
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

export default KitchenPage;
