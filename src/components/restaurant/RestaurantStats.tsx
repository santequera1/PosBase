import { useEffect, useState } from 'react';
import { Utensils, Bike, ShoppingBag, Users, HandCoins } from 'lucide-react';
import { api } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import { KpiCard } from '@/components/common/Primitives';

const TYPE_ICON: Record<string, any> = { 'dine-in': Utensils, pickup: ShoppingBag, delivery: Bike };

/** Bloque de estadísticas del restaurante para Ventas e ingresos: por tipo, canal, mesero y repartidor. */
export const RestaurantStats = ({ from, to }: { from: string; to: string }) => {
  const [data, setData] = useState<any>(null);
  useEffect(() => { if (from && to) api.getRestaurantStats(from, to).then(setData).catch(() => setData(null)); }, [from, to]);
  if (!data || !data.summary.orders) return null;
  const s = data.summary;
  const Table = ({ headers, rows }: { headers: string[]; rows: any[][] }) => (
    <table className="w-full text-[11px]">
      <thead><tr className="text-muted-foreground bg-muted/30">{headers.map((h, i) => <th key={h} className={cn('px-3 py-1.5 font-semibold', i === 0 ? 'text-left' : 'text-right')}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-border">{r.map((c, j) => <td key={j} className={cn('px-3 py-1.5', j === 0 ? 'text-left font-semibold text-brand-dark' : 'text-right')}>{c}</td>)}</tr>)}</tbody>
    </table>
  );
  return (
    <div className="col-span-1 lg:col-span-12 space-y-4" data-testid="restaurant-stats">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {data.byType.map((t: any) => { const Icon = TYPE_ICON[t.type] || Utensils; return <KpiCard key={t.type} label={t.label} value={formatPrice(t.total)} sub={`${t.count} venta(s)${t.people ? ` · ${t.people} personas` : ''}${t.deliveryFees ? ` · envíos ${formatPrice(t.deliveryFees)}` : ''}`} className="relative" />; })}
        {s.people > 0 && <KpiCard label="Promedio por persona" value={formatPrice(s.avgPerPerson)} sub={`${s.people} personas en mesas`} />}
        {(s.tips > 0 || s.deliveryFees > 0) && <KpiCard label="Propinas · envíos" value={`${formatPrice(s.tips)} · ${formatPrice(s.deliveryFees)}`} sub={`ticket promedio ${formatPrice(s.avgTicket)}`} />}
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-brand-primary/10 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-brand-card"><p className="text-xs font-bold text-brand-dark">Por canal</p></div>
          <Table headers={['Canal', 'Ventas', 'Total']} rows={data.byChannel.map((c: any) => [c.label, c.count, formatPrice(c.total)])} />
        </div>
        <div className="bg-white rounded-2xl border border-brand-primary/10 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-brand-card"><p className="text-xs font-bold text-brand-dark flex items-center gap-1.5"><Users size={13} /> Por mesero</p></div>
          {data.byWaiter.length ? <Table headers={['Mesero', 'Mesas', 'Personas', 'Total', 'Por persona', 'Propinas']} rows={data.byWaiter.map((w: any) => [w.waiter, w.orders, w.people, formatPrice(w.total), formatPrice(w.avgPerPerson), formatPrice(w.tips)])} /> : <p className="p-4 text-xs text-muted-foreground">Sin ventas en mesa.</p>}
        </div>
        <div className="bg-white rounded-2xl border border-brand-primary/10 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-brand-card"><p className="text-xs font-bold text-brand-dark flex items-center gap-1.5"><HandCoins size={13} /> Por repartidor</p></div>
          {data.byCourier.length ? <Table headers={['Repartidor', 'Pedidos', 'Total', 'Envíos', 'Efectivo']} rows={data.byCourier.map((c: any) => [c.courier, c.orders, formatPrice(c.total), formatPrice(c.deliveryFees), formatPrice(c.cashCollected)])} /> : <p className="p-4 text-xs text-muted-foreground">Sin domicilios.</p>}
        </div>
      </div>
    </div>
  );
};

export default RestaurantStats;
