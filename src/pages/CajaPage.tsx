import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import { defaultPeriod, type Period } from '@/components/caja/common';
import { VentasTab } from '@/components/caja/VentasTab';
import { MovimientosTab, PropinasTab } from '@/components/caja/MovTipsTabs';
import { ArqueosTab } from '@/components/caja/ArqueosTab';
import { DescuentosTab } from '@/components/caja/DescuentosTab';

type Tab = 'ventas' | 'movimientos' | 'arqueos' | 'propinas' | 'descuentos';
const TABS: Array<[Tab, string]> = [['ventas', 'Ventas'], ['movimientos', 'Movimientos de caja'], ['arqueos', 'Arqueos de Caja'], ['propinas', 'Propinas'], ['descuentos', 'Descuentos']];
const KEY = 'caja-period-v2';

/**
 * Caja / Ventas (como Fudo): sub-menú de 5 pestañas con el estado de la caja siempre visible, período compartido
 * (Diario, Mensual, Anual, Rango, Arqueo + Fecha por + Turno) y enlace directo a cada venta (?tab=ventas&venta=ID).
 */
const CajaPage = () => {
  const currentShift = useStore(s => s.currentShift);
  const restaurant = useStore(s => s.restaurant);
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some(t => t[0] === params.get('tab')) ? params.get('tab') : 'ventas') as Tab;
  const selected = params.get('venta') ? Number(params.get('venta')) : null;
  const [period, setPeriodState] = useState<Period>(() => {
    try { const raw = sessionStorage.getItem(KEY); if (raw) return { ...defaultPeriod(), ...JSON.parse(raw) }; } catch { /* sin almacenamiento */ }
    return defaultPeriod();
  });
  const setPeriod = (p: Period) => { setPeriodState(p); try { sessionStorage.setItem(KEY, JSON.stringify(p)); } catch { /* sin almacenamiento */ } };
  const [shifts, setShifts] = useState<any[]>([]);
  const loadShifts = useCallback(() => { api.getCajaShifts({ limit: 120 }).then(setShifts).catch(() => {}); }, []);
  useEffect(() => { loadShifts(); }, [loadShifts, currentShift?.id, currentShift?.status]);
  const go = (t: Tab) => { const p = new URLSearchParams(params); p.set('tab', t); p.delete('venta'); setParams(p, { replace: true }); };
  const selectSale = (id: number | null) => { const p = new URLSearchParams(params); p.set('tab', 'ventas'); if (id) p.set('venta', String(id)); else p.delete('venta'); setParams(p, { replace: true }); };
  const serviceShifts = restaurant?.serviceShifts || [];
  return (
    <div className="-m-4 lg:-m-6 min-h-full font-sans" data-testid="caja-page">
      <div className="bg-brand-surface text-brand-on-dark px-2 sm:px-4 flex items-stretch overflow-x-auto no-scrollbar sticky top-0 z-20" data-caja-tabs>
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => go(k)} data-caja-tab={k} className={cn('px-4 py-3 text-sm whitespace-nowrap flex items-center gap-2 transition-colors border-b-2', tab === k ? 'bg-white/15 font-bold border-brand-accent' : 'opacity-80 hover:opacity-100 border-transparent')}>
            {l}
            {k === 'arqueos' && <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-full', currentShift ? 'bg-emerald-400 text-emerald-950' : 'bg-white/20')} data-caja-chip>{currentShift ? 'Abierto' : 'Cerrado'}</span>}
          </button>
        ))}
      </div>
      <div className="p-3 lg:p-5 space-y-3">
        {tab === 'ventas' && <VentasTab period={period} setPeriod={setPeriod} shifts={shifts} selectedId={selected} onSelect={selectSale} />}
        {tab === 'movimientos' && <MovimientosTab period={period} setPeriod={setPeriod} shifts={shifts} serviceShifts={serviceShifts} />}
        {tab === 'arqueos' && <ArqueosTab onShiftsChanged={loadShifts} />}
        {tab === 'propinas' && <PropinasTab period={period} setPeriod={setPeriod} shifts={shifts} serviceShifts={serviceShifts} />}
        {tab === 'descuentos' && <DescuentosTab period={period} setPeriod={setPeriod} shifts={shifts} serviceShifts={serviceShifts} />}
      </div>
    </div>
  );
};

export default CajaPage;
