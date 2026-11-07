import React, { useState } from 'react';
import { X, Printer, FileCheck2 } from 'lucide-react';
import { ElectronicInvoiceModal } from '@/components/ElectronicInvoiceModal';
import { printThermal, generateSalesTicketHtml } from '@/lib/thermalPrint';
import { printReceipt, netPrintOn } from '@/lib/netPrint';
import { useStore } from '@/store/useStore';
import { orderNumber } from '@/lib/orderNumber';
import { NiceSelect } from '@/components/ui/nice-select';

interface PrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any;
}

export const PrintModal: React.FC<PrintModalProps> = ({ isOpen, onClose, order }) => {
  const [paperSize, setPaperSize] = useState<'80mm' | '58mm'>('80mm');
  const [isPrinting, setIsPrinting] = useState(false);
  const [showFe, setShowFe] = useState(false);
  const design = useStore(s => s.receiptDesign);
  const logo = useStore(s => s.receiptLogo);
  const footer = useStore(s => s.receiptFooter);
  useStore(s => s.businessName); // el recibo toma los datos del negocio del store: se repinta si cambian

  if (!isOpen || !order) return null;

  const docNumber = orderNumber(order.id || 1001);
  // La vista previa es el mismo recibo que sale en el papel: logo, textos y datos según Configuración → Recibos
  const ticketHtml = generateSalesTicketHtml(order, { paperSize, design, logo, footer });

  const handlePrint = async () => {
    setIsPrinting(true);
    try {
      if (netPrintOn()) await printReceipt(order);
      else await printThermal(ticketHtml, `Factura-${docNumber}`);
    } catch (e) {
      console.error('Print error:', e);
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div className="fixed inset-0 !m-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
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
            <NiceSelect
              value={paperSize}
              onChange={(e) => setPaperSize(e.target.value as any)}
              className="w-full px-3.5 py-2 rounded-xl bg-white border border-gray-300 text-xs sm:text-sm font-semibold text-brand-dark focus:outline-none focus:ring-2 focus:ring-[#0091FF]"
            >
              <option value="80mm">80 mm (Estándar Térmica - Corto Ahorro Papel)</option>
              <option value="58mm">58 mm (Mini Térmica 58mm)</option>
            </NiceSelect>
          </div>
        </div>

        {/* Live Visual Preview (Compact Ticket) */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-100 flex justify-center items-start">
          <div
            className="ticket-preview paper bg-white p-3.5 rounded-xl shadow-md border border-gray-300 text-left transition-all"
            style={{ width: paperSize === '58mm' ? '240px' : '300px', maxWidth: '100%' }}
            data-print-preview
            dangerouslySetInnerHTML={{ __html: ticketHtml }}
          />
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
            <button onClick={() => setShowFe(true)} className="flex-1 py-3 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all" title="Factura electrónica">
              <FileCheck2 size={15} /> <span>Factura electrónica</span>
            </button>
          )}
          <button
            onClick={handlePrint}
            disabled={isPrinting}
            className="flex-1 py-3 rounded-xl bg-brand-button hover:bg-brand-surface text-brand-on-button font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all active:scale-[0.99] disabled:opacity-50"
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
