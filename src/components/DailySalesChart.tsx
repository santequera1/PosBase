import { BRAND } from '@/lib/theme';
import React, { useState, useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { formatPrice, getColombiaNow, getOrderDateStr } from '@/lib/format';
import { type Order } from '@/store/useStore';
import { Calendar, TrendingUp, DollarSign, Receipt, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DailySalesChartProps {
  orders: Order[];
  className?: string;
  defaultDays?: 7 | 14 | 30;
}

interface DayData {
  dateStr: string; // YYYY-MM-DD
  dayLabel: string; // "Lun 08"
  fullDateLabel: string; // "Lunes, 8 de septiembre de 2026"
  totalSales: number;
  ordersCount: number;
  cashSales: number;
  cardSales: number;
  transferSales: number;
  avgTicket: number;
}

export const DailySalesChart: React.FC<DailySalesChartProps> = ({
  orders,
  className,
  defaultDays = 7,
}) => {
  const [rangeDays, setRangeDays] = useState<7 | 14 | 30>(defaultDays);
  const [hoveredDay, setHoveredDay] = useState<DayData | null>(null);

  // Group and compute data for each of the last N days
  const chartData = useMemo(() => {
    const nowColombia = getColombiaNow();
    const daysArray: DayData[] = [];

    // Filter out cancelled orders
    const validOrders = orders.filter(o => o.status !== 'cancelled');

    // Build day-by-day continuous range so days with 0 sales also appear
    for (let i = rangeDays - 1; i >= 0; i--) {
      const d = new Date(nowColombia);
      d.setDate(d.getDate() - i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;

      // Labels
      const dayName = d.toLocaleDateString('es-CO', { weekday: 'short' });
      const dayNum = d.getDate();
      const dayLabel = `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${dayNum}`;

      const fullDateLabel = d.toLocaleDateString('es-CO', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });

      // Filter orders for this day
      const dayOrders = validOrders.filter(o => getOrderDateStr(o.createdAt) === dateStr);

      let totalSales = 0;
      let cashSales = 0;
      let cardSales = 0;
      let transferSales = 0;

      dayOrders.forEach(o => {
        totalSales += (o.total || 0);

        if (o.paymentMethod === 'mixed' && o.paymentSplit) {
          const s = o.paymentSplit;
          const a1 = Number(s.amount1) || 0;
          const a2 = Number(s.amount2) || 0;
          if (s.method1 === 'cash') cashSales += a1;
          else if (s.method1 === 'card_debit' || s.method1 === 'card_credit') cardSales += a1;
          else if (s.method1 === 'transfer') transferSales += a1;

          if (s.method2 === 'cash') cashSales += a2;
          else if (s.method2 === 'card_debit' || s.method2 === 'card_credit') cardSales += a2;
          else if (s.method2 === 'transfer') transferSales += a2;
        } else {
          if (o.paymentMethod === 'cash') cashSales += (o.total || 0);
          else if (o.paymentMethod === 'card_debit' || o.paymentMethod === 'card_credit') cardSales += (o.total || 0);
          else if (o.paymentMethod === 'transfer') transferSales += (o.total || 0);
        }
      });

      const ordersCount = dayOrders.length;
      const avgTicket = ordersCount > 0 ? Math.round(totalSales / ordersCount) : 0;

      daysArray.push({
        dateStr,
        dayLabel,
        fullDateLabel: fullDateLabel.charAt(0).toUpperCase() + fullDateLabel.slice(1),
        totalSales,
        ordersCount,
        cashSales,
        cardSales,
        transferSales,
        avgTicket,
      });
    }

    return daysArray;
  }, [orders, rangeDays]);

  // High-level statistics of the visible range
  const summary = useMemo(() => {
    const totalRevenue = chartData.reduce((acc, d) => acc + d.totalSales, 0);
    const totalOrders = chartData.reduce((acc, d) => acc + d.ordersCount, 0);
    const dailyAverage = Math.round(totalRevenue / rangeDays);

    let peakDay = chartData[0];
    chartData.forEach(d => {
      if (d.totalSales > (peakDay?.totalSales || 0)) {
        peakDay = d;
      }
    });

    return {
      totalRevenue,
      totalOrders,
      dailyAverage,
      peakDay,
    };
  }, [chartData, rangeDays]);

  return (
    <div className={cn("bg-white rounded-3xl p-4 sm:p-6 border border-brand-primary/10 shadow-sm font-sans space-y-4", className)}>
      {/* Header with Title and Range Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-brand-card border border-brand-accent/40 flex items-center justify-center text-brand-primary shadow-xs">
            <TrendingUp size={20} className="text-brand-primary" />
          </div>
          <div>
            <h2 className="font-bold text-base sm:text-lg text-brand-dark leading-tight">
              Ventas por Día (Histórico Interactivo)
            </h2>
            <p className="text-xs text-brand-muted">
              Pasa el cursor sobre cualquier barra para ver el total y detalle de ese día
            </p>
          </div>
        </div>

        {/* Range Buttons */}
        <div className="flex items-center gap-1 bg-brand-card p-1 rounded-2xl border border-brand-accent/30 self-start sm:self-auto">
          {([
            { days: 7 as const, label: '7 días' },
            { days: 14 as const, label: '14 días' },
            { days: 30 as const, label: '30 días' },
          ]).map((r) => (
            <button
              key={r.days}
              onClick={() => setRangeDays(r.days)}
              className={cn(
                'px-3 py-1.5 rounded-xl text-xs font-bold transition-all',
                rangeDays === r.days
                  ? 'bg-brand-surface text-brand-on-dark shadow-xs'
                  : 'text-brand-muted hover:text-brand-dark hover:bg-white/60'
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Quick Summary Cards (Period Stats) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-3 rounded-2xl bg-brand-card/70 border border-brand-accent/30">
          <span className="text-[10px] font-bold uppercase tracking-wider text-brand-muted block">
            Ventas en {rangeDays} días
          </span>
          <p className="text-base sm:text-lg font-bold font-serif text-brand-dark mt-0.5">
            {formatPrice(summary.totalRevenue)}
          </p>
          <span className="text-[10.5px] text-brand-muted">{summary.totalOrders} pedidos</span>
        </div>

        <div className="p-3 rounded-2xl bg-emerald-50/60 border border-emerald-200/50">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
            Promedio Diario
          </span>
          <p className="text-base sm:text-lg font-bold font-serif text-emerald-700 mt-0.5">
            {formatPrice(summary.dailyAverage)}
          </p>
          <span className="text-[10.5px] text-emerald-600">Por día calendario</span>
        </div>

        <div className="p-3 rounded-2xl bg-amber-50/60 border border-amber-200/50 col-span-2 sm:col-span-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 block flex items-center justify-between">
            <span>Día con Mayor Venta</span>
            {summary.peakDay && summary.peakDay.totalSales > 0 && (
              <span className="text-[10px] font-semibold text-amber-700">{summary.peakDay.dayLabel}</span>
            )}
          </span>
          <div className="flex items-baseline justify-between mt-0.5">
            <p className="text-base sm:text-lg font-bold font-serif text-amber-900">
              {summary.peakDay && summary.peakDay.totalSales > 0 ? formatPrice(summary.peakDay.totalSales) : '$0'}
            </p>
            {summary.peakDay && summary.peakDay.totalSales > 0 && (
              <span className="text-[10.5px] text-amber-800 font-medium truncate max-w-[180px]">
                {summary.peakDay.ordersCount} pedidos
              </span>
            )}
          </div>
          <span className="text-[10.5px] text-amber-800 truncate block">
            {summary.peakDay && summary.peakDay.totalSales > 0 ? summary.peakDay.fullDateLabel : 'Sin ventas'}
          </span>
        </div>
      </div>

      {/* Main Interactive Bar Chart */}
      <div className="h-64 sm:h-72 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 10, right: 10, left: -10, bottom: 20 }}
            onMouseMove={(state) => {
              if (state && state.activePayload && state.activePayload.length > 0) {
                setHoveredDay(state.activePayload[0].payload as DayData);
              }
            }}
            onMouseLeave={() => setHoveredDay(null)}
          >
            <XAxis
              dataKey="dayLabel"
              tick={{ fontSize: 11, fill: '#6B5E4F', fontWeight: 600 }}
              axisLine={{ stroke: '#E5E7EB' }}
              tickLine={false}
              interval={rangeDays === 30 ? 2 : 0}
            />
            <YAxis
              tick={{ fontSize: 10, fill: BRAND.muted }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(val) => {
                if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
                if (val >= 1000) return `$${Math.round(val / 1000)}k`;
                return `$${val}`;
              }}
            />
            <Tooltip
              content={<CustomBarTooltip />}
              cursor={{ fill: 'rgba(198, 191, 129, 0.18)', radius: 8 }}
            />
            <Bar
              dataKey="totalSales"
              radius={[8, 8, 0, 0]}
              animationDuration={500}
            >
              {chartData.map((entry, index) => {
                const isHovered = hoveredDay?.dateStr === entry.dateStr;
                const isPeak = summary.peakDay?.dateStr === entry.dateStr && entry.totalSales > 0;

                // Gold for hovered, navy or accent for standard
                let fillColor = BRAND.dark;
                if (isHovered) fillColor = BRAND.accent;
                else if (isPeak) fillColor = '#4B587E';

                return (
                  <Cell
                    key={`cell-${index}`}
                    fill={fillColor}
                    className="transition-colors duration-150 cursor-pointer"
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Hover Info Banner (Extra clear feedback for mobile or desktop) */}
      <div className="p-3 rounded-2xl bg-brand-card/80 border border-brand-accent/30 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-brand-accent" />
          <span className="text-brand-muted font-medium">
            {hoveredDay ? hoveredDay.fullDateLabel : 'Pasa sobre una barra para ver detalles:'}
          </span>
        </div>
        {hoveredDay ? (
          <div className="flex items-center gap-3 font-bold">
            <span className="text-brand-dark font-serif text-sm">
              Total: {formatPrice(hoveredDay.totalSales)}
            </span>
            <span className="text-brand-muted font-normal">
              ({hoveredDay.ordersCount} pedidos)
            </span>
          </div>
        ) : (
          <span className="text-[11px] text-brand-muted italic">
            Ej: Ventas de hace 3 días, ayer o fines de semana
          </span>
        )}
      </div>
    </div>
  );
};

// Custom Floating Tooltip Component
const CustomBarTooltip: React.FC<any> = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;

  const data: DayData = payload[0].payload;

  return (
    <div className="bg-brand-surface text-brand-on-dark p-3.5 rounded-2xl shadow-2xl border border-brand-accent/50 text-xs min-w-[220px] font-sans animate-in fade-in zoom-in-95 duration-100">
      {/* Date Header */}
      <div className="pb-2 border-b border-white/10 mb-2">
        <p className="font-semibold text-[11px] text-brand-on-dark/70 uppercase tracking-wider">
          {data.dayLabel}
        </p>
        <p className="font-bold text-xs text-white leading-tight">
          {data.fullDateLabel}
        </p>
      </div>

      {/* Main Revenue */}
      <div className="mb-2.5">
        <span className="text-[10px] uppercase text-brand-accent font-bold tracking-wider">
          Ventas Totales
        </span>
        <p className="text-xl font-serif font-extrabold text-brand-card leading-none mt-0.5">
          {formatPrice(data.totalSales)}
        </p>
        <p className="text-[11px] text-white/80 mt-1 flex items-center justify-between">
          <span>Pedidos registrados:</span>
          <strong className="text-white">{data.ordersCount}</strong>
        </p>
        {data.ordersCount > 0 && (
          <p className="text-[11px] text-white/80 flex items-center justify-between">
            <span>Ticket promedio:</span>
            <strong className="text-brand-accent">{formatPrice(data.avgTicket)}</strong>
          </p>
        )}
      </div>

      {/* Payment Breakdown (if sales exist) */}
      {data.totalSales > 0 ? (
        <div className="pt-2 border-t border-white/10 space-y-1 text-[10.5px]">
          <span className="text-[9px] uppercase font-bold text-brand-on-dark/60 block mb-1">
            Desglose por Medio de Pago:
          </span>
          <div className="flex justify-between items-center text-emerald-300">
            <span>💵 Efectivo:</span>
            <span className="font-mono font-semibold">{formatPrice(data.cashSales)}</span>
          </div>
          <div className="flex justify-between items-center text-blue-300">
            <span>💳 Tarjetas / Datáfono:</span>
            <span className="font-mono font-semibold">{formatPrice(data.cardSales)}</span>
          </div>
          <div className="flex justify-between items-center text-purple-300">
            <span>📱 QR / Nequi:</span>
            <span className="font-mono font-semibold">{formatPrice(data.transferSales)}</span>
          </div>
        </div>
      ) : (
        <p className="text-[10.5px] text-gray-400 italic pt-1 border-t border-white/10 text-center">
          Sin ventas registradas en este día
        </p>
      )}
    </div>
  );
};

export default DailySalesChart;
