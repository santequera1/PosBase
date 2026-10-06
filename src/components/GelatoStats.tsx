import { useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import type { Order } from '@/store/useStore';
import { BRAND } from '@/lib/theme';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Estadísticas propias de heladería (envases y sabores). Solo se muestra si el menú tiene categorías de helado. */
export const GelatoStats = ({ filtered }: { filtered: Order[] }) => {
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

  return (
    <>
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
    </>
  );
};

export default GelatoStats;
