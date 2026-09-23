import React, { useState } from 'react';
import {
  X,
  CreditCard,
  Banknote,
  QrCode,
  Shuffle,
  Tag,
  ArrowLeft,
  Sparkles,
  ShoppingBag,
} from 'lucide-react';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import type { Customer, OrderItem, PaymentMethod, PaymentSplit, TabOrder } from '@/store/useStore';

const QUICK_CASH_AMOUNTS = [20000, 50000, 100000, 200000];

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  tabName: string;
  cart: OrderItem[];
  customer: Customer;
  subtotal: number;
  discountAmount: number;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentSplit: PaymentSplit;
  cashReceived: string;
  orderNotes: string;
  isSubmitting: boolean;
  onUpdateTab: (updates: Partial<TabOrder>) => void;
  onConfirmCheckout: () => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  tabName,
  cart,
  customer,
  subtotal,
  discountAmount,
  discountType,
  discountValue,
  total,
  paymentMethod,
  paymentSplit,
  cashReceived,
  orderNotes,
  isSubmitting,
  onUpdateTab,
  onConfirmCheckout,
}) => {
  const [showDiscountInput, setShowDiscountInput] = useState(false);

  if (!isOpen) return null;

  const numericCash = Number(cashReceived) || 0;
  const change = numericCash > 0 ? numericCash - total : 0;
  const isCashInvalid = paymentMethod === 'cash' && numericCash > 0 && numericCash < total;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 font-sans">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-[#FAF8EA] rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl border border-[#364266]/15 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-[#242D49] text-[#FEF3DE] flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-[#FEF3DE] transition-colors"
              title="Volver al pedido"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h2 className="font-bold text-lg leading-tight flex items-center gap-2">
                <span>Cobro de Pedido</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#C6BF81]/30 text-[#FAF8EA] font-medium">
                  {tabName}
                </span>
              </h2>
              <p className="text-xs text-[#FEF3DE]/70">
                Cliente: <strong className="text-white">{customer.name}</strong> • Doc: {customer.doc}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-[#FEF3DE] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body: Split View (Payment on Left, Order Summary on Right) */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto">
          {/* LEFT: Payment Methods & Options */}
          <div className="flex-1 p-5 sm:p-6 space-y-5 border-b lg:border-b-0 lg:border-r border-[#364266]/10 overflow-y-auto">
            {/* Big Total Banner */}
            <div className="p-4 rounded-2xl bg-[#364266] text-[#FEF3DE] flex items-center justify-between shadow-md">
              <div>
                <p className="text-xs text-[#FEF3DE]/70 uppercase tracking-wider font-semibold">Total a Cobrar</p>
                <p className="text-2xl sm:text-3xl font-extrabold text-[#FAF8EA]">{formatPrice(total)}</p>
              </div>
              <div className="text-right text-xs text-[#FEF3DE]/80">
                <p>{cart.reduce((a, b) => a + b.quantity, 0)} productos</p>
                {discountAmount > 0 && (
                  <p className="text-emerald-300 font-bold">Ahorro: {formatPrice(discountAmount)}</p>
                )}
              </div>
            </div>

            {/* Payment Method Selector */}
            <div>
              <label className="text-xs font-bold text-[#364266] uppercase tracking-wider block mb-2">
                Selecciona Método de Pago
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <button
                  onClick={() => onUpdateTab({ paymentMethod: 'cash' })}
                  className={cn(
                    'py-3 px-2 rounded-2xl text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all',
                    paymentMethod === 'cash'
                      ? 'bg-[#364266] text-[#FEF3DE] ring-2 ring-[#364266] shadow-md scale-[1.02]'
                      : 'bg-white text-[#364266] border border-[#364266]/15 hover:bg-[#FAF8EA]'
                  )}
                >
                  <Banknote size={20} />
                  <span>Efectivo</span>
                </button>

                <button
                  onClick={() => onUpdateTab({ paymentMethod: 'card_debit' })}
                  className={cn(
                    'py-3 px-2 rounded-2xl text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all',
                    paymentMethod === 'card_debit'
                      ? 'bg-[#364266] text-[#FEF3DE] ring-2 ring-[#364266] shadow-md scale-[1.02]'
                      : 'bg-white text-[#364266] border border-[#364266]/15 hover:bg-[#FAF8EA]'
                  )}
                >
                  <CreditCard size={20} />
                  <span>T. Débito</span>
                </button>

                <button
                  onClick={() => onUpdateTab({ paymentMethod: 'card_credit' })}
                  className={cn(
                    'py-3 px-2 rounded-2xl text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all',
                    paymentMethod === 'card_credit'
                      ? 'bg-[#364266] text-[#FEF3DE] ring-2 ring-[#364266] shadow-md scale-[1.02]'
                      : 'bg-white text-[#364266] border border-[#364266]/15 hover:bg-[#FAF8EA]'
                  )}
                >
                  <CreditCard size={20} />
                  <span>T. Crédito</span>
                </button>

                <button
                  onClick={() => onUpdateTab({ paymentMethod: 'transfer' })}
                  className={cn(
                    'py-3 px-2 rounded-2xl text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all',
                    paymentMethod === 'transfer'
                      ? 'bg-[#364266] text-[#FEF3DE] ring-2 ring-[#364266] shadow-md scale-[1.02]'
                      : 'bg-white text-[#364266] border border-[#364266]/15 hover:bg-[#FAF8EA]'
                  )}
                >
                  <QrCode size={20} />
                  <span>QR / Nequi</span>
                </button>

                <button
                  onClick={() => {
                    const half = Math.round(total / 2);
                    const currentSplit = paymentSplit || { method1: 'cash', amount1: half, method2: 'card_debit', amount2: total - half };
                    const validSplit = (currentSplit.amount1 + currentSplit.amount2 === total && currentSplit.amount1 > 0)
                      ? currentSplit
                      : { method1: currentSplit.method1 || 'cash', amount1: half, method2: currentSplit.method2 || 'card_debit', amount2: total - half };
                    onUpdateTab({
                      paymentMethod: 'mixed',
                      paymentSplit: validSplit,
                    });
                  }}
                  className={cn(
                    'py-3 px-2 rounded-2xl text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all',
                    paymentMethod === 'mixed'
                      ? 'bg-[#242D49] text-[#C6BF81] ring-2 ring-[#C6BF81] shadow-md scale-[1.02]'
                      : 'bg-white text-[#364266] border border-[#364266]/15 hover:bg-[#FAF8EA]'
                  )}
                >
                  <Shuffle size={20} />
                  <span>Pago Mixto</span>
                </button>
              </div>
            </div>

            {/* CASH CALCULATOR */}
            {paymentMethod === 'cash' && (
              <div className="p-4 rounded-2xl bg-white border border-[#364266]/15 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#364266]">Billetes Rápidos:</span>
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                    <button
                      type="button"
                      onClick={() => onUpdateTab({ cashReceived: String(total) })}
                      className={cn(
                        'px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-xs flex items-center gap-1',
                        numericCash === total && cashReceived === String(total)
                          ? 'bg-[#242D49] text-[#FEF3DE] border-[#242D49] ring-2 ring-[#C6BF81] font-extrabold shadow-md scale-105'
                          : 'bg-white text-[#364266] border-gray-200 hover:bg-[#FAF8EA]'
                      )}
                    >
                      {numericCash === total && cashReceived === String(total) && <span>✓</span>}
                      Exacto ({formatPrice(total)})
                    </button>
                    {QUICK_CASH_AMOUNTS.map((amt) => {
                      const isSelected = numericCash === amt;
                      return (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => onUpdateTab({ cashReceived: String(amt) })}
                          className={cn(
                            'px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-xs flex items-center gap-1',
                            isSelected
                              ? 'bg-[#242D49] text-[#FEF3DE] border-[#242D49] ring-2 ring-[#C6BF81] font-extrabold shadow-md scale-105'
                              : 'bg-white text-[#364266] border-gray-200 hover:bg-[#FAF8EA]'
                          )}
                        >
                          {isSelected && <span>✓</span>}
                          {formatPrice(amt)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-xs font-bold text-[#897863] block mb-1">Efectivo Recibido</label>
                    <input
                      type="number"
                      value={cashReceived}
                      onChange={(e) => onUpdateTab({ cashReceived: e.target.value })}
                      placeholder={String(total)}
                      className="w-full p-2.5 text-base font-bold bg-[#FAF8EA] rounded-xl border border-[#364266]/20 focus:ring-2 focus:ring-[#364266] outline-none"
                    />
                    {numericCash > 0 && (
                      <p className="text-xs font-bold text-emerald-700 mt-1 font-mono">
                        = {formatPrice(numericCash)}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[#897863] block mb-1">Cambio / Vueltos</label>
                    <div
                      className={cn(
                        'p-2.5 text-base font-extrabold rounded-xl border text-right truncate flex items-center justify-end h-[46px]',
                        change >= 0
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : 'bg-red-50 text-red-600 border-red-200'
                      )}
                    >
                      {change >= 0 ? formatPrice(change) : 'Faltan ' + formatPrice(Math.abs(change))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SPLIT / MIXED PAYMENT */}
            {paymentMethod === 'mixed' && (
              <div className="p-4 rounded-2xl bg-white border border-[#C6BF81]/60 space-y-3 shadow-sm text-xs">
                <div className="flex items-center justify-between font-bold text-[#364266] pb-1.5 border-b border-gray-100">
                  <span className="flex items-center gap-1.5">
                    <Shuffle size={15} className="text-[#C6BF81]" /> Desglose de Pago Combinado
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const half = Math.round(total / 2);
                        onUpdateTab({
                          paymentSplit: {
                            method1: paymentSplit?.method1 || 'cash',
                            amount1: half,
                            method2: paymentSplit?.method2 || 'card_debit',
                            amount2: total - half,
                          },
                        });
                      }}
                      className="px-2 py-0.5 rounded-lg bg-[#FAF8EA] hover:bg-[#EFEDD8] border border-[#C6BF81]/50 text-[11px] font-bold text-[#364266]"
                    >
                      Dividir 50% / 50%
                    </button>
                    <span className="text-[#242D49] font-extrabold text-sm">{formatPrice(total)}</span>
                  </div>
                </div>

                {/* Method 1 */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-[#897863] font-bold block mb-1">1er Método</label>
                    <select
                      value={paymentSplit?.method1 || 'cash'}
                      onChange={(e) =>
                        onUpdateTab({
                          paymentSplit: {
                            method1: e.target.value as PaymentMethod,
                            amount1: paymentSplit?.amount1 || Math.round(total / 2),
                            method2: paymentSplit?.method2 || 'card_debit',
                            amount2: paymentSplit?.amount2 || (total - Math.round(total / 2)),
                          },
                        })
                      }
                      className="w-full p-2 rounded-xl border border-gray-200 bg-[#FAF8EA] text-xs font-semibold"
                    >
                      <option value="cash">💵 Efectivo</option>
                      <option value="card_debit">💳 T. Débito</option>
                      <option value="card_credit">💳 T. Crédito</option>
                      <option value="transfer">📱 QR / Nequi</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-[#897863] font-bold block mb-1">Monto 1 (COP)</label>
                    <input
                      type="number"
                      value={paymentSplit?.amount1 !== undefined ? paymentSplit.amount1 : ''}
                      onChange={(e) => {
                        const a1 = Number(e.target.value) || 0;
                        const a2 = Math.max(0, total - a1);
                        onUpdateTab({
                          paymentSplit: {
                            method1: paymentSplit?.method1 || 'cash',
                            amount1: a1,
                            method2: paymentSplit?.method2 || 'card_debit',
                            amount2: a2,
                          },
                        });
                      }}
                      placeholder="0"
                      className="w-full p-2 text-xs font-bold rounded-xl border border-gray-200 bg-[#FAF8EA]"
                    />
                    {Number(paymentSplit?.amount1) > 0 && (
                      <p className="text-[10px] font-bold text-emerald-700 mt-0.5 font-mono">
                        = {formatPrice(Number(paymentSplit?.amount1))}
                      </p>
                    )}
                  </div>
                </div>

                {/* Method 2 */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-[#897863] font-bold block mb-1">2do Método</label>
                    <select
                      value={paymentSplit?.method2 || 'card_debit'}
                      onChange={(e) =>
                        onUpdateTab({
                          paymentSplit: {
                            method1: paymentSplit?.method1 || 'cash',
                            amount1: paymentSplit?.amount1 || Math.round(total / 2),
                            method2: e.target.value as PaymentMethod,
                            amount2: paymentSplit?.amount2 || (total - Math.round(total / 2)),
                          },
                        })
                      }
                      className="w-full p-2 rounded-xl border border-gray-200 bg-[#FAF8EA] text-xs font-semibold"
                    >
                      <option value="card_debit">💳 T. Débito</option>
                      <option value="card_credit">💳 T. Crédito</option>
                      <option value="transfer">📱 QR / Nequi</option>
                      <option value="cash">💵 Efectivo</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-[#897863] font-bold block mb-1">Monto 2 (Restante)</label>
                    <input
                      type="number"
                      value={paymentSplit?.amount2 !== undefined ? paymentSplit.amount2 : ''}
                      onChange={(e) => {
                        const a2 = Number(e.target.value) || 0;
                        const a1 = Math.max(0, total - a2);
                        onUpdateTab({
                          paymentSplit: {
                            method1: paymentSplit?.method1 || 'cash',
                            amount1: a1,
                            method2: paymentSplit?.method2 || 'card_debit',
                            amount2: a2,
                          },
                        });
                      }}
                      placeholder="0"
                      className="w-full p-2 text-xs font-bold rounded-xl border border-gray-200 bg-[#FAF8EA]"
                    />
                    {Number(paymentSplit?.amount2) > 0 && (
                      <p className="text-[10px] font-bold text-emerald-700 mt-0.5 font-mono">
                        = {formatPrice(Number(paymentSplit?.amount2))}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Discount Section */}
            <div className="pt-2">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowDiscountInput(!showDiscountInput)}
                  className={cn(
                    'text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all shadow-xs',
                    discountValue > 0
                      ? 'bg-amber-100 text-amber-900 border border-amber-300'
                      : 'bg-white text-[#364266] border border-[#364266]/15 hover:bg-[#FAF8EA]'
                  )}
                >
                  <Tag size={13} />
                  <span>
                    {discountValue > 0
                      ? `Descuento: ${discountType === 'percent' ? discountValue + '%' : formatPrice(discountValue)}`
                      : '+ Aplicar Descuento Especial'}
                  </span>
                </button>

                {discountValue > 0 && (
                  <button
                    type="button"
                    onClick={() => onUpdateTab({ discountValue: 0 })}
                    className="text-xs text-red-600 hover:underline flex items-center gap-0.5"
                  >
                    <X size={12} /> Quitar
                  </button>
                )}
              </div>

              {showDiscountInput && (
                <div className="mt-2 p-3 rounded-2xl bg-white border border-[#C6BF81]/50 space-y-2">
                  <div className="flex gap-1.5">
                    {[5, 10, 15, 20, 50].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => {
                          onUpdateTab({ discountType: 'percent', discountValue: pct });
                          setShowDiscountInput(false);
                        }}
                        className={cn(
                          'flex-1 py-1.5 text-xs font-bold rounded-xl border transition-all',
                          discountType === 'percent' && discountValue === pct
                            ? 'bg-[#364266] text-[#FEF3DE] border-[#364266]'
                            : 'bg-gray-50 hover:bg-[#FAF8EA] text-[#364266] border-gray-200'
                        )}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-2 items-center pt-1">
                    <select
                      value={discountType}
                      onChange={(e) => onUpdateTab({ discountType: e.target.value as 'percent' | 'fixed' })}
                      className="p-1.5 text-xs font-bold rounded-xl border border-gray-200 bg-white"
                    >
                      <option value="percent">% Porc.</option>
                      <option value="fixed">$ COP</option>
                    </select>
                    <input
                      type="number"
                      value={discountValue || ''}
                      onChange={(e) => onUpdateTab({ discountValue: Number(e.target.value) || 0 })}
                      placeholder={discountType === 'percent' ? 'Ej. 10 (%)' : 'Ej. 5000 ($)'}
                      className="flex-1 p-1.5 text-xs font-bold rounded-xl border border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={() => setShowDiscountInput(false)}
                      className="px-3 py-1.5 rounded-xl bg-[#364266] text-[#FEF3DE] text-xs font-bold"
                    >
                      OK
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="text-[10px] font-bold text-[#897863] block mb-1">Notas del Pedido (Opcional)</label>
              <input
                value={orderNotes}
                onChange={(e) => onUpdateTab({ notes: e.target.value })}
                placeholder="Ej. Sin pitillo, servilletas extra, mesa 3..."
                className="w-full px-3 py-2 text-xs bg-white rounded-xl border border-gray-200 outline-none focus:ring-1 focus:ring-[#364266]"
              />
            </div>
          </div>

          {/* RIGHT: Compact Order Summary */}
          <div className="w-full lg:w-80 bg-white p-5 sm:p-6 flex flex-col justify-between shrink-0">
            <div>
              <h3 className="font-bold text-xs text-[#897863] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <ShoppingBag size={14} /> Resumen de la Venta
              </h3>

              {/* Items List */}
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {cart.map((item, idx) => (
                  <div key={idx} className="p-2.5 rounded-xl bg-[#FAF8EA] border border-[#364266]/10 text-xs space-y-1">
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-bold text-[#242D49]">
                        {item.quantity}x {item.size || item.name.replace(/—.*$/, '').trim()}
                      </span>
                      <span className="font-bold text-[#344268] shrink-0">{formatPrice(item.price * item.quantity)}</span>
                    </div>
                    {item.flavors && (
                      <p className="text-[11px] text-[#6B5E4F] font-medium font-sans pl-1">
                        🍨 {item.flavors.split(',').map(f => f.trim()).join(' + ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Totals Breakdown */}
              <div className="mt-4 pt-3 border-t border-gray-200 space-y-1 text-xs">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal:</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-red-600 font-bold">
                    <span>Descuento:</span>
                    <span>-{formatPrice(discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-extrabold text-[#242D49] pt-2 border-t border-gray-200">
                  <span>TOTAL:</span>
                  <span>{formatPrice(total)}</span>
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="mt-6 pt-4 border-t border-gray-200 space-y-2">
              <button
                onClick={onConfirmCheckout}
                disabled={isSubmitting || isCashInvalid}
                className={cn(
                  'w-full py-3.5 px-4 rounded-2xl font-bold text-sm text-[#FEF3DE] flex items-center justify-center gap-2 shadow-lg transition-all',
                  !isSubmitting && !isCashInvalid
                    ? 'bg-gradient-to-r from-[#364266] to-[#242D49] hover:shadow-xl hover:scale-[1.01] active:scale-[0.99]'
                    : 'bg-gray-400 cursor-not-allowed'
                )}
              >
                {isSubmitting ? (
                  <span>Procesando...</span>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>CONFIRMAR Y FACTURAR {formatPrice(total)}</span>
                  </>
                )}
              </button>

              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-[#364266] text-xs font-bold transition-all"
              >
                Volver / Modificar Sabores
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
