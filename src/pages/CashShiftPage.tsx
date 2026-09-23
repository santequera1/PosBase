import React, { useState, useEffect, useMemo } from 'react';
import {
  Wallet,
  Coins,
  CreditCard,
  QrCode,
  Printer,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  RotateCcw,
  Calendar,
  User,
  ShoppingBag,
  TrendingUp,
  History,
  ArrowDownRight,
  MinusCircle,
  Receipt,
  Plus,
} from 'lucide-react';
import { useStore, type CashShift } from '@/store/useStore';
import { api } from '@/lib/api';
import { formatPrice, formatFullDate, formatTime } from '@/lib/format';
import { printThermal, generateZReportHtml } from '@/lib/thermalPrint';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

export const CashShiftPage: React.FC = () => {
  const { currentShift, refreshCurrentShift, closeShift, openShift, addCashMovement, businessName, businessSlogan } = useStore();

  const [actualCashInput, setActualCashInput] = useState<string>('');
  const [closureNotes, setClosureNotes] = useState<string>('');
  const [isClosing, setIsClosing] = useState(false);

  // New shift opening modal state
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [initialBaseInput, setInitialBaseInput] = useState<string>('100000');
  const [cashierNameInput, setCashierNameInput] = useState<string>('');

  // Cash withdrawal / Expense modal state
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false);
  const [withdrawalAmount, setWithdrawalAmount] = useState<string>('');
  const [withdrawalReason, setWithdrawalReason] = useState<string>('');
  const [isSubmittingWithdrawal, setIsSubmittingWithdrawal] = useState(false);

  // Shift History
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Closed Ticket Modal for printing
  const [closedTicket, setClosedTicket] = useState<any | null>(null);

  useEffect(() => {
    refreshCurrentShift();
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const rows = await api.getShiftsHistory();
      setHistory(rows);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHistory(false);
    }
  };

  const expectedCash = currentShift?.expectedCash || 0;
  const countedCash = Number(actualCashInput) || 0;
  const difference = countedCash - expectedCash;

  const handlePrintZReport = async (shiftData: any, isReportX = false) => {
    if (!shiftData) return;
    try {
      const html = generateZReportHtml(shiftData, { paperSize: "80mm", isReportX });
      await printThermal(html, `Reporte-${isReportX ? "X" : "Z"}-Turno-${shiftData.id || 1}`);
    } catch (err) {
      console.error("Error printing report:", err);
      toast.error("Error al imprimir el reporte térmico");
    }
  };

  const handleCloseShift = async () => {
    if (!currentShift) {
      toast.error('No hay un turno abierto para cerrar');
      return;
    }

    if (!actualCashInput && actualCashInput !== '0') {
      toast.error('Por favor ingresa el dinero físico contado en la gaveta');
      return;
    }

    setIsClosing(true);
    try {
      const closed = await closeShift(countedCash, closureNotes);
      toast.success('Turno de caja cerrado exitosamente');
      setClosedTicket(closed);
      setActualCashInput('');
      setClosureNotes('');
      loadHistory();
      // Auto-launch thermal printing
      if (closed) handlePrintZReport(closed);
    } catch (err) {
      console.error(err);
      toast.error('Error al cerrar el turno de caja');
    } finally {
      setIsClosing(false);
    }
  };

  const handleOpenNewShift = async () => {
    const base = Number(initialBaseInput) || 0;
    try {
      await openShift(base, cashierNameInput || 'Cajero Principal', 'Apertura de turno');
      toast.success('Nuevo turno de caja abierto con éxito');
      setShowOpenModal(false);
      refreshCurrentShift();
      loadHistory();
    } catch (err) {
      console.error(err);
      toast.error('Error al abrir nuevo turno');
    }
  };

  const handleCreateWithdrawal = async () => {
    const amt = Number(withdrawalAmount) || 0;
    if (amt <= 0) {
      toast.error('Ingresa un monto válido para el retiro');
      return;
    }
    if (!withdrawalReason.trim()) {
      toast.error('Ingresa el motivo del retiro (ej. Compra de agua, frutas, insumos)');
      return;
    }
    setIsSubmittingWithdrawal(true);
    try {
      await addCashMovement(amt, withdrawalReason.trim(), 'withdrawal');
      toast.success(`Retiro de ${formatPrice(amt)} registrado exitosamente`);
      setShowWithdrawalModal(false);
      setWithdrawalAmount('');
      setWithdrawalReason('');
      refreshCurrentShift();
    } catch (err) {
      console.error(err);
      toast.error('Error al registrar el retiro');
    } finally {
      setIsSubmittingWithdrawal(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 lg:p-6 rounded-3xl border border-brand-primary/10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-brand-card border border-brand-accent/50 flex items-center justify-center text-brand-primary">
            <Wallet size={24} />
          </div>
          <div>
            <h1 className="font-serif font-bold text-xl lg:text-2xl text-brand-primary">
              Cierre de Caja & Arqueo
            </h1>
            <p className="text-xs text-brand-muted">
              Control de efectivo, datáfonos y ventas del turno
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {currentShift?.status === 'open' ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
              Turno Abierto #{currentShift.id} ({currentShift.cashierName})
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
              <Lock size={13} />
              Caja Cerrada
            </span>
          )}

          {currentShift?.status === 'open' && (
            <>
              <button
                onClick={() => handlePrintZReport(currentShift, true)}
                className="px-3.5 py-2 rounded-xl bg-gray-100 text-brand-primary hover:bg-gray-200 border border-gray-300 text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
                title="Imprimir reporte parcial de turno (Reporte X)"
              >
                <Printer size={14} />
                <span>Imprimir Reporte X</span>
              </button>

              <button
                onClick={() => setShowWithdrawalModal(true)}
                className="px-3.5 py-2 rounded-xl bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
              >
                <MinusCircle size={14} className="text-red-600" />
                <span>Registrar Retiro / Gasto</span>
              </button>
            </>
          )}

          <button
            onClick={() => setShowOpenModal(true)}
            className="px-4 py-2 rounded-xl bg-brand-primary text-brand-bg hover:bg-brand-dark text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
          >
            <Unlock size={14} /> Abrir Nuevo Turno
          </button>
        </div>
      </div>

      {/* Main Stats Grid */}
      {currentShift && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {/* Base Inicial */}
          <div className="p-4 rounded-2xl bg-white border border-brand-primary/10 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-brand-muted">
              <span className="text-[11px] font-bold uppercase tracking-wider">Base Inicial</span>
              <Coins size={16} className="text-brand-accent" />
            </div>
            <div className="mt-2">
              <p className="text-base lg:text-lg font-bold font-serif text-brand-primary">
                {formatPrice(currentShift.initialCash)}
              </p>
              <p className="text-[10px] text-brand-muted mt-0.5">Efectivo en base</p>
            </div>
          </div>

          {/* Ventas Efectivo */}
          <div className="p-4 rounded-2xl bg-white border border-brand-primary/10 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-brand-muted">
              <span className="text-[11px] font-bold uppercase tracking-wider">Ventas Efectivo</span>
              <Wallet size={16} className="text-emerald-600" />
            </div>
            <div className="mt-2">
              <p className="text-base lg:text-lg font-bold font-serif text-emerald-700">
                +{formatPrice(currentShift.cashSales)}
              </p>
              <p className="text-[10px] text-brand-muted mt-0.5">Ingreso efectivo</p>
            </div>
          </div>

          {/* Retiros / Gastos Registrados */}
          <div className="p-4 rounded-2xl bg-red-50/70 border border-red-200/80 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-red-800">
              <span className="text-[11px] font-bold uppercase tracking-wider">Retiros / Gastos</span>
              <MinusCircle size={16} className="text-red-600" />
            </div>
            <div className="mt-2">
              <p className="text-base lg:text-lg font-bold font-serif text-red-700">
                -{formatPrice(currentShift.totalWithdrawals || 0)}
              </p>
              <p className="text-[10px] text-red-600 mt-0.5">Salidas registradas</p>
            </div>
          </div>

          {/* Datáfono / Tarjetas (Débito + Crédito Unificado) */}
          <div className="p-4 rounded-2xl bg-white border border-brand-primary/10 shadow-sm flex flex-col justify-between sm:col-span-2 lg:col-span-2">
            <div className="flex items-center justify-between text-brand-muted">
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-primary flex items-center gap-1">
                💳 Datáfono / Tarjetas
              </span>
              <CreditCard size={16} className="text-blue-600" />
            </div>
            <div className="mt-2">
              <p className="text-base lg:text-lg font-bold font-serif text-brand-dark">
                {formatPrice((currentShift.debitSales || 0) + (currentShift.creditSales || 0))}
              </p>
              <div className="flex items-center gap-2 text-[10px] text-brand-muted mt-0.5 font-medium">
                <span>Débito: {formatPrice(currentShift.debitSales || 0)}</span>
                <span>•</span>
                <span>Crédito: {formatPrice(currentShift.creditSales || 0)}</span>
              </div>
            </div>
          </div>

          {/* Transferencias */}
          <div className="p-4 rounded-2xl bg-white border border-brand-primary/10 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-brand-muted">
              <span className="text-[11px] font-bold uppercase tracking-wider">QR / Nequi</span>
              <QrCode size={16} className="text-purple-600" />
            </div>
            <div className="mt-2">
              <p className="text-base lg:text-lg font-bold font-serif text-brand-primary">
                {formatPrice(currentShift.transferSales)}
              </p>
              <p className="text-[10px] text-brand-muted mt-0.5">Transferencias</p>
            </div>
          </div>

          {/* Total Ventas */}
          <div className="p-4 rounded-2xl bg-brand-card border-2 border-brand-accent shadow-md flex flex-col justify-between">
            <div className="flex items-center justify-between text-brand-muted">
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-primary">Total Ventas</span>
              <TrendingUp size={16} className="text-brand-primary" />
            </div>
            <div className="mt-2">
              <p className="text-base lg:text-lg font-extrabold font-serif text-brand-dark">
                {formatPrice(currentShift.totalSales)}
              </p>
              <p className="text-[10px] text-brand-muted mt-0.5">{currentShift.totalOrders} pedidos</p>
            </div>
          </div>
        </div>
      )}

      {/* Arqueo de Caja & Conteo Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cash Reconciliation Form (Left 1 col) */}
        <div className="bg-white p-6 rounded-3xl border border-brand-primary/10 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <Coins size={20} className="text-brand-accent" />
            <h2 className="font-serif font-bold text-lg text-brand-primary">
              Cuadre & Arqueo Físico
            </h2>
          </div>

          <div className="p-4 rounded-2xl bg-brand-card border border-brand-accent/30 space-y-2">
            <div className="flex justify-between text-xs text-brand-muted">
              <span>Base inicial:</span>
              <span className="font-semibold">{formatPrice(currentShift?.initialCash || 0)}</span>
            </div>
            <div className="flex justify-between text-xs text-brand-muted">
              <span>+ Ventas en efectivo:</span>
              <span className="font-semibold text-emerald-700">+{formatPrice(currentShift?.cashSales || 0)}</span>
            </div>
            {(currentShift?.totalWithdrawals || 0) > 0 && (
              <div className="flex justify-between text-xs text-red-600">
                <span>- Retiros / Gastos de caja:</span>
                <span className="font-semibold">-{formatPrice(currentShift?.totalWithdrawals || 0)}</span>
              </div>
            )}
            <div className="pt-2 border-t border-brand-primary/10 flex justify-between font-bold text-sm text-brand-primary">
              <span>Efectivo Esperado en Gaveta:</span>
              <span className="text-base font-serif">{formatPrice(expectedCash)}</span>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-brand-primary block mb-1">
                Efectivo Físico Contado ($)
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={actualCashInput}
                  onChange={(e) => setActualCashInput(e.target.value)}
                  placeholder={String(expectedCash)}
                  className="w-full p-3 text-lg font-bold bg-brand-card/50 rounded-2xl border-2 border-brand-primary/20 focus:border-brand-primary focus:outline-none focus:ring-0"
                />
                <button
                  type="button"
                  onClick={() => setActualCashInput(String(expectedCash))}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-xl bg-white border border-brand-primary/20 hover:bg-gray-50 text-[11px] font-bold text-brand-primary"
                >
                  Cuadrar Exacto
                </button>
              </div>
              {countedCash > 0 && (
                <p className="text-xs font-bold text-emerald-700 mt-1 font-mono">
                  = {formatPrice(countedCash)}
                </p>
              )}
            </div>

            {/* Difference Box */}
            {actualCashInput !== '' && (
              <div className={cn(
                'p-3.5 rounded-2xl border text-sm font-semibold flex items-center justify-between',
                difference === 0
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : difference > 0
                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                  : 'bg-red-50 text-red-800 border-red-300'
              )}>
                <div className="flex items-center gap-2">
                  {difference === 0 ? (
                    <CheckCircle2 size={18} className="text-emerald-600" />
                  ) : (
                    <AlertTriangle size={18} className={difference > 0 ? 'text-amber-600' : 'text-red-600'} />
                  )}
                  <span>
                    {difference === 0 ? 'Caja Cuadrada Exacta' : difference > 0 ? 'Sobrante de Caja' : 'Faltante de Caja'}
                  </span>
                </div>
                <span className="font-bold font-serif text-base">
                  {difference >= 0 ? `+${formatPrice(difference)}` : formatPrice(difference)}
                </span>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-brand-muted block mb-1">
                Notas del Cierre (Opcional)
              </label>
              <textarea
                value={closureNotes}
                onChange={(e) => setClosureNotes(e.target.value)}
                placeholder="Observaciones sobre el turno, novedades de datáfono, etc."
                rows={2}
                className="w-full p-2.5 rounded-xl border border-brand-primary/20 text-xs focus:ring-1 focus:ring-brand-primary"
              />
            </div>

            <button
              onClick={handleCloseShift}
              disabled={isClosing || !currentShift}
              className="w-full py-3.5 rounded-2xl bg-brand-primary text-brand-bg hover:bg-brand-dark font-serif font-bold text-base flex items-center justify-center gap-2 shadow-lg transition-all"
            >
              <Lock size={18} />
              <span>Realizar Cierre de Turno (Z)</span>
            </button>
          </div>
        </div>

        {/* Flavors Sold Breakdown in this Shift (Right 2 cols) */}
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-brand-primary/10 shadow-sm flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
            <div className="flex items-center gap-2">
              <ShoppingBag size={20} className="text-brand-accent" />
              <h2 className="font-serif font-bold text-lg text-brand-primary">
                Sabores y Productos Despachados en este Turno
              </h2>
            </div>
            <span className="text-xs font-semibold text-brand-muted">
              {currentShift?.flavorStats?.length || 0} ítems
            </span>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[350px]">
            {(!currentShift?.flavorStats || currentShift.flavorStats.length === 0) ? (
              <div className="h-48 flex flex-col items-center justify-center text-center text-brand-muted">
                <p className="font-serif font-bold text-sm text-brand-primary">Sin ventas registradas en este turno aún</p>
                <p className="text-xs mt-1">Las ventas procesadas en el POS se reflejarán aquí en tiempo real.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {currentShift.flavorStats.map((item, idx) => (
                  <div key={idx} className="py-2.5 flex items-center justify-between hover:bg-brand-card/50 px-2 rounded-xl transition-colors">
                    <div>
                      <p className="font-serif font-bold text-sm text-brand-primary">{item.name}</p>
                      {item.flavors && (
                        <p className="text-xs text-brand-muted">{item.flavors}</p>
                      )}
                    </div>

                    <div className="text-right">
                      <p className="font-bold text-sm text-brand-primary">
                        {item.qty} {item.qty === 1 ? 'unidad' : 'unidades'}
                      </p>
                      <p className="text-xs font-semibold text-brand-primary-strong">
                        {formatPrice(item.revenue)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cash Movements / Withdrawals Table */}
      {currentShift && currentShift.movements && currentShift.movements.length > 0 && (
        <div className="bg-white p-6 rounded-3xl border border-brand-primary/10 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <MinusCircle size={20} className="text-red-600" />
              <h2 className="font-serif font-bold text-lg text-brand-primary">
                Retiros y Gastos de Caja Menor (del Turno Actual)
              </h2>
            </div>
            <span className="text-xs font-bold text-red-600 bg-red-50 px-2.5 py-1 rounded-full border border-red-200">
              Total salidas: -{formatPrice(currentShift.totalWithdrawals || 0)}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b text-brand-muted uppercase tracking-wider font-semibold">
                  <th className="py-2 px-3">Hora</th>
                  <th className="py-2 px-3">Responsable</th>
                  <th className="py-2 px-3">Concepto / Motivo</th>
                  <th className="py-2 px-3 text-right">Monto Retirado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-brand-primary">
                {currentShift.movements.map(m => (
                  <tr key={m.id} className="hover:bg-red-50/30">
                    <td className="py-2.5 px-3 font-mono">{formatTime(m.created_at)}</td>
                    <td className="py-2.5 px-3 font-medium">{m.cashier_name || 'Cajero'}</td>
                    <td className="py-2.5 px-3">{m.reason}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-red-600 font-serif">
                      -{formatPrice(m.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Shift History Table with REPRINT Buttons */}
      <div className="bg-white p-6 rounded-3xl border border-brand-primary/10 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <History size={20} className="text-brand-primary" />
            <h2 className="font-serif font-bold text-lg text-brand-primary">
              Historial de Cierres de Caja (Reportes Z Anteriores)
            </h2>
          </div>
          <button
            onClick={loadHistory}
            className="text-xs text-brand-primary font-bold hover:underline flex items-center gap-1"
          >
            <RotateCcw size={13} /> Actualizar
          </button>
        </div>

        {history.length === 0 ? (
          <p className="text-xs text-brand-muted py-4">No hay turnos cerrados registrados previamente.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b text-brand-muted uppercase tracking-wider font-semibold">
                  <th className="py-2.5 px-3"># Turno</th>
                  <th className="py-2.5 px-3">Cajero</th>
                  <th className="py-2.5 px-3">Apertura</th>
                  <th className="py-2.5 px-3">Cierre</th>
                  <th className="py-2.5 px-3">Total Ventas</th>
                  <th className="py-2.5 px-3">Efectivo Físico</th>
                  <th className="py-2.5 px-3">Diferencia</th>
                  <th className="py-2.5 px-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-brand-primary">
                {history.map(s => (
                  <tr key={s.id} className="hover:bg-brand-card/50">
                    <td className="py-3 px-3 font-bold">#{s.id}</td>
                    <td className="py-3 px-3 font-medium">{s.cashier_name}</td>
                    <td className="py-3 px-3">{s.opened_at ? formatTime(s.opened_at) : '-'}</td>
                    <td className="py-3 px-3">{s.closed_at ? formatTime(s.closed_at) : 'En curso'}</td>
                    <td className="py-3 px-3 font-bold font-serif">{formatPrice(s.total_sales || 0)}</td>
                    <td className="py-3 px-3 font-medium">{formatPrice(s.actual_cash || 0)}</td>
                    <td className="py-3 px-3 font-semibold">
                      {s.difference === 0 ? (
                        <span className="text-emerald-700">Cuadrada ($0)</span>
                      ) : s.difference > 0 ? (
                        <span className="text-amber-700">+{formatPrice(s.difference)}</span>
                      ) : (
                        <span className="text-red-600">{formatPrice(s.difference)}</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => handlePrintZReport(s)}
                        className="px-2.5 py-1 rounded-xl bg-white border border-brand-primary/20 hover:bg-brand-card text-brand-primary text-xs font-bold inline-flex items-center gap-1 shadow-sm transition-all"
                        title="Reimprimir Reporte Z en impresora térmica"
                      >
                        <Printer size={13} />
                        <span>Reimprimir Cierre</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Register Cash Withdrawal / Expense Modal */}
      <AnimatePresence>
        {showWithdrawalModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-red-200 space-y-4"
            >
              <div className="flex items-center gap-2 text-red-700">
                <div className="w-10 h-10 rounded-2xl bg-red-100 flex items-center justify-center">
                  <MinusCircle size={22} />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-lg text-brand-primary">
                    Registrar Retiro / Gasto de Caja
                  </h3>
                  <p className="text-xs text-brand-muted">
                    Salida de dinero menor (agua, frutas, aseo, compras de emergencia)
                  </p>
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-brand-primary">Monto a Retirar (COP) *</label>
                    <div className="flex gap-1">
                      {['10000', '20000', '50000', '100000'].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setWithdrawalAmount(amt)}
                          className={cn(
                            "px-2 py-0.5 rounded-lg border text-[10px] font-bold transition-all",
                            withdrawalAmount === amt
                              ? "bg-brand-dark text-brand-bg border-brand-dark"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          )}
                        >
                          {formatPrice(Number(amt))}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="number"
                    value={withdrawalAmount}
                    onChange={(e) => setWithdrawalAmount(e.target.value)}
                    placeholder="Ej. 20000"
                    className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-base font-bold text-red-700 focus:ring-2 focus:ring-red-400"
                  />
                  {Number(withdrawalAmount) > 0 && (
                    <p className="text-xs font-bold text-red-600 mt-1 font-mono">
                      = {formatPrice(Number(withdrawalAmount))}
                    </p>
                  )}
                </div>

                <div>
                  <label className="font-bold text-brand-primary">Motivo / Concepto del Gasto *</label>
                  <input
                    type="text"
                    value={withdrawalReason}
                    onChange={(e) => setWithdrawalReason(e.target.value)}
                    placeholder="Ej. Compra de agua para el local, frutas, insumos..."
                    className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-red-400"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowWithdrawalModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateWithdrawal}
                  disabled={isSubmittingWithdrawal}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700 shadow-md disabled:opacity-50"
                >
                  {isSubmittingWithdrawal ? 'Guardando...' : 'Confirmar Retiro'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Open New Shift Modal */}
      <AnimatePresence>
        {showOpenModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-brand-primary/10 space-y-4"
            >
              <h3 className="font-serif font-bold text-xl text-brand-primary">
                Abrir Nuevo Turno de Caja
              </h3>
              <p className="text-xs text-brand-muted">
                Define la base inicial en efectivo para cambio en la gaveta.
              </p>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-brand-primary">Nombre del Cajero / Responsable</label>
                  <input
                    type="text"
                    value={cashierNameInput}
                    onChange={(e) => setCashierNameInput(e.target.value)}
                    placeholder="Ej. Cajero Principal"
                    className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-brand-primary">Base Inicial en Efectivo (COP)</label>
                    <div className="flex gap-1 overflow-x-auto">
                      {['100000', '200000', '300000', '400000', '500000'].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setInitialBaseInput(amt)}
                          className={cn(
                            "px-2 py-0.5 rounded-lg border text-[10px] font-bold transition-all",
                            initialBaseInput === amt
                              ? "bg-brand-dark text-brand-bg border-brand-dark"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          )}
                        >
                          {formatPrice(Number(amt))}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="number"
                    value={initialBaseInput}
                    onChange={(e) => setInitialBaseInput(e.target.value)}
                    placeholder="100000"
                    className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-base font-bold text-brand-primary"
                  />
                  {Number(initialBaseInput) > 0 && (
                    <p className="text-xs font-bold text-emerald-700 mt-1 font-mono">
                      = {formatPrice(Number(initialBaseInput))}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowOpenModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleOpenNewShift}
                  className="flex-1 py-2.5 rounded-xl bg-brand-primary text-brand-bg text-xs font-semibold hover:bg-brand-dark"
                >
                  Confirmar Apertura
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Closed Shift Ticket Modal (Thermal Report Z) */}
      <AnimatePresence>
        {closedTicket && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4"
            >
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto text-2xl font-bold">
                ✓
              </div>
              <h3 className="font-serif font-bold text-xl text-brand-primary">Tirilla de Cierre (Reporte Z)</h3>

              <div className="p-4 rounded-2xl bg-brand-card border border-dashed border-brand-primary/25 text-left font-mono text-xs text-brand-primary space-y-2">
                <div className="text-center pb-2 border-b border-dashed border-brand-primary/20">
                  <p className="font-bold text-sm font-serif">{businessName}</p>
                  <p className="text-[10px] text-brand-muted">CIERRE DE CAJA — REPORTE Z</p>
                  <p className="text-[10px] text-brand-muted">{formatFullDate(new Date().toISOString())}</p>
                </div>

                <div className="text-[11px] space-y-0.5">
                  <p><strong>Cajero:</strong> {closedTicket.cashierName || closedTicket.cashier_name}</p>
                  <p><strong>Total Pedidos:</strong> {closedTicket.totalOrders || closedTicket.total_orders}</p>
                </div>

                <div className="py-2 border-t border-b border-dashed border-brand-primary/20 space-y-1">
                  <div className="flex justify-between">
                    <span>Base Inicial:</span>
                    <span>{formatPrice(closedTicket.initialCash || closedTicket.initial_cash || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Ventas Efectivo:</span>
                    <span>+{formatPrice(closedTicket.cashSales || closedTicket.cash_sales || 0)}</span>
                  </div>
                  {(closedTicket.totalWithdrawals || closedTicket.total_withdrawals || 0) > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>Retiros / Gastos:</span>
                      <span>-{formatPrice(closedTicket.totalWithdrawals || closedTicket.total_withdrawals || 0)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Ventas Débito:</span>
                    <span>{formatPrice(closedTicket.debitSales || closedTicket.debit_sales || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Ventas Crédito:</span>
                    <span>{formatPrice(closedTicket.creditSales || closedTicket.credit_sales || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Ventas QR/Nequi:</span>
                    <span>{formatPrice(closedTicket.transferSales || closedTicket.transfer_sales || 0)}</span>
                  </div>
                </div>

                <div className="space-y-0.5 pt-1 font-bold">
                  <div className="flex justify-between text-sm">
                    <span>GRAN TOTAL:</span>
                    <span>{formatPrice(closedTicket.totalSales || closedTicket.total_sales || 0)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-brand-muted">
                    <span>Esperado Gaveta:</span>
                    <span>{formatPrice(closedTicket.expectedCash || closedTicket.expected_cash || 0)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-emerald-700">
                    <span>Contado Gaveta:</span>
                    <span>{formatPrice(closedTicket.actualCash || closedTicket.actual_cash || 0)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Diferencia:</span>
                    <span className={(closedTicket.difference || 0) === 0 ? 'text-emerald-700' : 'text-red-600'}>
                      {(closedTicket.difference || 0) >= 0 ? `+${formatPrice(closedTicket.difference || 0)}` : formatPrice(closedTicket.difference || 0)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handlePrintZReport(closedTicket)}
                  className="flex-1 py-2.5 rounded-xl bg-[#0091FF] hover:bg-[#0080E6] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md"
                >
                  <Printer size={15} /> Imprimir de Nuevo
                </button>
                <button
                  onClick={() => setClosedTicket(null)}
                  className="flex-1 py-2.5 rounded-xl bg-brand-primary text-brand-bg font-semibold text-xs hover:bg-brand-dark"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CashShiftPage;