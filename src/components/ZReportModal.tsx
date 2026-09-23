import { useMemo } from 'react';
import { Printer } from 'lucide-react';
import { Modal } from '@/components/common/Primitives';
import { generateZReportHtml, printThermal } from '@/lib/thermalPrint';

/** Muestra en pantalla el cierre de caja (Reporte Z) tal como se imprime, sin descargar nada. */
export const ZReportModal = ({ shift, onClose, isReportX = false }: { shift: any; onClose: () => void; isReportX?: boolean }) => {
  const html = useMemo(() => generateZReportHtml(shift, { paperSize: '80mm', isReportX }), [shift, isReportX]);
  const title = isReportX ? 'Corte parcial (Reporte X)' : `Cierre de caja · Turno #${shift?.id ?? ''}`;
  return (
    <Modal title={title} onClose={onClose}>
      <div className="flex justify-center bg-gray-100 rounded-xl p-4 max-h-[65vh] overflow-y-auto">
        <div className="ticket-preview paper bg-white shadow-md rounded-lg p-3" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border bg-white text-sm font-semibold text-brand-dark">Cerrar</button>
        <button onClick={() => printThermal(html, `Reporte-${isReportX ? 'X' : 'Z'}-Turno-${shift?.id || 1}`)} className="flex-1 py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-1.5">
          <Printer size={15} /> Imprimir
        </button>
      </div>
    </Modal>
  );
};

export default ZReportModal;
