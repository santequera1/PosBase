import React, { useState } from 'react';
import { X, Printer, FileCheck2 } from 'lucide-react';
import { ElectronicInvoiceModal } from '@/components/ElectronicInvoiceModal';
import { formatPrice } from '@/lib/format';
import { printThermal, generateSalesTicketHtml } from '@/lib/thermalPrint';
import { useStore } from '@/store/useStore';
import { orderNumber } from '@/lib/orderNumber';

interface PrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any;
}

export const PrintModal: React.FC<PrintModalProps> = ({ isOpen, onClose, order }) => {
  const [paperSize, setPaperSize] = useState<'80mm' | '58mm'>('80mm');
  const [isPrinting, setIsPrinting] = useState(false);
  const [showFe, setShowFe] = useState(false);
  const { businessName, businessSlogan, businessAddress, businessPhone, businessNit, taxType, taxRate } = useStore();

  if (!isOpen || !order) return null;

  const items = order.items || [];
  const subtotal = order.subtotal || items.reduce((a: number, i: any) => a + (i.price || 0) * (i.quantity || 1), 0);
  const discount = order.discount || 0;
  const total = order.total !== undefined ? order.total : Math.max(0, subtotal - discount);
  const docNumber = orderNumber(order.id || 1001);
  const orderDate = order.createdAt ? new Date(order.createdAt) : new Date();

  const formattedDate = orderDate.toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const formattedTime = orderDate.toLocaleTimeString('es-CO', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
  });

  const handlePrint = async () => {
    setIsPrinting(true);
    try {
      const html = generateSalesTicketHtml(order, { paperSize });
      await printThermal(html, `Factura-${docNumber}`);
    } catch (e) {
      console.error('Print error:', e);
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[92vh] font-sans animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-gray-200 flex items-center justify-between shrink-0 bg-white">
          <h2 className="font-bold text-base sm:text-lg text-brand-dark">Configuración de impresión</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Paper Size Selector */}
        <div className="p-3.5 bg-gray-50 border-b border-gray-200 shrink-0">
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">
            Tamaño de impresión (Optimizado para rollo térmico)
          </label>
          <div className="relative">
            <select
              value={paperSize}
              onChange={(e) => setPaperSize(e.target.value as any)}
              className="w-full px-3.5 py-2 rounded-xl bg-white border border-gray-300 text-xs sm:text-sm font-semibold text-brand-dark focus:outline-none focus:ring-2 focus:ring-[#0091FF]"
            >
              <option value="80mm">80 mm (Estándar Térmica - Corto Ahorro Papel)</option>
              <option value="58mm">58 mm (Mini Térmica 58mm)</option>
            </select>
          </div>
        </div>

        {/* Live Visual Preview (Compact Ticket) */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-100 flex justify-center items-start">
          <div
            className="bg-white p-3.5 rounded-xl shadow-md border border-gray-300 text-left font-mono text-[10.5px] text-[#111] space-y-2 transition-all"
            style={{ width: paperSize === '58mm' ? '220px' : '260px' }}
          >
            {/* Header */}
            <div className="text-center pb-1.5 border-b border-gray-300">
              <p className="font-bold text-[10.5px] tracking-tight text-brand-dark">{businessName}</p>
              <p className="font-bold text-[10px] text-brand-dark">{businessSlogan.toUpperCase()}</p>
              <p className="text-[9px] text-gray-600">NIT: {businessNit} • {businessAddress}</p>
              <p className="text-[9px] text-gray-600">Tel: {businessPhone}</p>
            </div>

            {/* Document Info */}
            <div className="text-center py-0.5 border-b border-gray-300">
              <p className="font-bold text-[11px] text-brand-dark">Doc. Ingreso No. {docNumber}</p>
              <p className="text-[9px] text-gray-500">{formattedDate} {formattedTime}</p>
            </div>

            {/* Customer Info */}
            <div className="text-[9.5px] space-y-0.5 border-b border-dashed border-gray-300 pb-1.5">
              <p><span className="font-bold">Cliente:</span> {order.customerName || order.customer?.name || 'Consumidor Final'}</p>
              <p><span className="font-bold">C.C / NIT:</span> {order.customerDoc || order.customer?.documentId || order.customer?.doc || '222222222222'}</p>
              {order.electronicInvoice && <p className="text-amber-700 font-bold">F.E. PRUEBA {order.electronicInvoice.number} · sin validez fiscal</p>}
            </div>

            {/* Items Table */}
            <div className="py-1 border-b border-dashed border-gray-300">
              <div className="flex justify-between font-bold text-[9px] border-b border-dashed border-gray-300 pb-0.5 mb-1">
                <span className="w-8">Cant.</span>
                <span className="flex-1">Producto</span>
                <span className="w-16 text-right">Total</span>
              </div>
              <div className="space-y-1">
                {items.map((item: any, idx: number) => (
                  <div key={idx} className="text-[9.5px]">
                    <div className="flex justify-between">
                      <span className="w-8 font-bold">{item.quantity || 1}x</span>
                      <span className="flex-1 truncate">{item.name}</span>
                      <span className="w-16 text-right font-bold">{formatPrice((item.price || 0) * (item.quantity || 1))}</span>
                    </div>
                    {item.flavors && (
                      <div className="text-[8.5px] text-gray-600 pl-4 truncate">
                        • {item.flavors}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="space-y-0.5 pt-1 text-[10px]">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between font-bold text-red-600">
                  <span>Descuento:</span>
                  <span>-{formatPrice(discount)}</span>
                </div>
              )}
              {taxType !== 'none' && taxRate > 0 && (
                <>
                  <div className="flex justify-between text-[9px] text-gray-600"><span>Base gravable:</span><span>{formatPrice(Math.round(total / (1 + taxRate / 100)))}</span></div>
                  <div className="flex justify-between text-[9px] text-gray-600"><span>{taxType.toUpperCase()} {taxRate}% (incluido):</span><span>{formatPrice(total - Math.round(total / (1 + taxRate / 100)))}</span></div>
                </>
              )}
              <div className="flex justify-between font-bold text-xs pt-1 border-t border-gray-300 text-brand-dark">
                <span>TOTAL:</span>
                <span>{formatPrice(total)}</span>
              </div>
              <div className="pt-0.5 text-[9px] text-gray-600">
                <div className="flex justify-between">
                  <span>Pago:</span>
                  <span className="font-semibold text-gray-800">
                    {order.paymentMethod === 'mixed' || order.paymentSplit
                      ? 'Mixto / Combinado'
                      : order.paymentMethod === 'cash'
                      ? 'Efectivo'
                      : order.paymentMethod === 'card_debit'
                      ? 'T. Débito'
                      : order.paymentMethod === 'card_credit'
                      ? 'T. Crédito'
                      : order.paymentMethod === 'transfer'
                      ? 'QR / Nequi'
                      : 'Tarjeta'}
                  </span>
                </div>
                {order.paymentSplit && (
                  <div className="text-[8.5px] text-gray-500 pl-2">
                    <div>• {order.paymentSplit.method1 === 'cash' ? 'Efectivo' : order.paymentSplit.method1 === 'card_debit' ? 'T. Débito' : order.paymentSplit.method1 === 'card_credit' ? 'T. Crédito' : 'Transferencia'}: {formatPrice(order.paymentSplit.amount1)}</div>
                    <div>• {order.paymentSplit.method2 === 'cash' ? 'Efectivo' : order.paymentSplit.method2 === 'card_debit' ? 'T. Débito' : order.paymentSplit.method2 === 'card_credit' ? 'T. Crédito' : 'Transferencia'}: {formatPrice(order.paymentSplit.amount2)}</div>
                  </div>
                )}
              </div>
            </div>

            <div className="text-center pt-1 border-t border-dashed border-gray-300 text-[8.5px] text-gray-500">
              ¡Gracias por su compra en Gia!
            </div>
          </div>
        </div>

        {/* Footer Action Buttons */}
        <div className="p-3.5 bg-white border-t border-gray-200 shrink-0 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-brand-primary font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all"
          >
            <span>✓ Siguiente Venta</span>
          </button>
          {(order.customer?.isElectronicInvoice || order.electronicInvoice) && (
            <button onClick={() => setShowFe(true)} className="flex-1 py-3 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all" title="Factura electrónica en modo pruebas">
              <FileCheck2 size={15} /> <span>F.E. (prueba)</span>
            </button>
          )}
          <button
            onClick={handlePrint}
            disabled={isPrinting}
            className="flex-1 py-3 rounded-xl bg-brand-primary hover:bg-brand-dark text-brand-bg font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all active:scale-[0.99] disabled:opacity-50"
          >
            <Printer size={16} />
            <span>{isPrinting ? 'Imprimiendo...' : '🖨️ Imprimir Factura'}</span>
          </button>
        </div>
        {showFe && <ElectronicInvoiceModal order={order} onClose={() => setShowFe(false)} />}
      </div>
    </div>
  );
};
export default PrintModal;
