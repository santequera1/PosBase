import { useEffect, useMemo, useState } from 'react';
import { X, Printer, FileCheck2, AlertTriangle } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { formatPrice } from '@/lib/format';
import { orderNumber } from '@/lib/orderNumber';
import { cn } from '@/lib/utils';

const PAYMENT: Record<string, string> = { cash: 'Efectivo', card_debit: 'Tarjeta débito', card_credit: 'Tarjeta crédito', card: 'Tarjeta', transfer: 'Transferencia / QR', mixed: 'Mixto' };

/** Cuadrícula tipo QR generada a partir del CUFE (solo ilustrativa: es un documento de prueba). */
const PseudoQr = ({ seed, size = 21 }: { seed: string; size?: number }) => {
  const cells = useMemo(() => {
    const bits: number[] = [];
    const s = seed || 'PRUEBA';
    for (let i = 0; bits.length < size * size; i++) {
      const c = parseInt(s[i % s.length], 16);
      const v = Number.isNaN(c) ? s.charCodeAt(i % s.length) : c;
      bits.push((v >> (i % 4)) & 1);
    }
    return bits;
  }, [seed, size]);
  const finder = (x: number, y: number) => {
    const inBox = (px: number, py: number, s0: number, e: number) => px >= s0 && px < e && py >= s0 && py < e;
    const corners: Array<[number, number]> = [[0, 0], [size - 7, 0], [0, size - 7]];
    for (const [cx, cy] of corners) {
      if (inBox(x - cx, y - cy, 0, 7)) {
        const lx = x - cx, ly = y - cy;
        const ring = lx === 0 || ly === 0 || lx === 6 || ly === 6;
        const core = lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4;
        return ring || core ? 1 : 0;
      }
    }
    return null;
  };
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={96} height={96} shapeRendering="crispEdges" aria-label="Código QR de prueba">
      <rect width={size} height={size} fill="#fff" />
      {cells.map((b, i) => {
        const x = i % size, y = Math.floor(i / size);
        const f = finder(x, y);
        const on = f === null ? b === 1 : f === 1;
        return on ? <rect key={i} x={x} y={y} width={1} height={1} fill="#111" /> : null;
      })}
    </svg>
  );
};

export const ElectronicInvoiceModal = ({ order, onClose }: { order: any; onClose: () => void }) => {
  const { businessName, businessNit, businessAddress, businessPhone, businessSlogan, dianResolution, taxType, taxRate, issueTestInvoice } = useStore();
  const live = useStore(s => s.orders.find(o => o.id === order?.id)) || order;
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!live) return null;
  const fe = live.electronicInvoice;
  const items = live.items || [];
  const subtotal = live.subtotal ?? items.reduce((a: number, i: any) => a + (i.price || 0) * (i.quantity || 1), 0);
  const discount = live.discount || 0;
  const total = live.total ?? Math.max(0, subtotal - discount);
  const rate = taxType !== 'none' ? Number(taxRate) || 0 : 0;
  const base = rate > 0 ? Math.round(total / (1 + rate / 100)) : total;
  const tax = total - base;
  const taxLabel = taxType === 'iva' ? 'IVA' : taxType === 'inc' ? 'INC' : 'Impuesto';
  const issued = fe?.issuedAt || live.createdAt || '';
  const cust = live.customer || {};

  const issue = async () => {
    setIssuing(true);
    setError('');
    try { await issueTestInvoice(live.id); } catch (e: any) { setError(e.message || 'No se pudo generar el documento'); }
    setIssuing(false);
  };
  const print = () => {
    document.body.classList.add('print-report');
    const cleanup = () => { document.body.classList.remove('print-report'); window.removeEventListener('afterprint', cleanup); };
    window.addEventListener('afterprint', cleanup);
    setTimeout(() => window.print(), 50);
    setTimeout(cleanup, 60000);
  };

  return (
    <div className="print-overlay fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-start justify-center p-2 sm:p-6 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-3xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2 print:hidden">
          <div className="flex gap-2">
            {!fe && (
              <button onClick={issue} disabled={issuing} className="px-3 py-2 rounded-xl bg-white text-brand-dark text-xs font-bold flex items-center gap-1.5 shadow disabled:opacity-50">
                <FileCheck2 size={14} /> {issuing ? 'Generando...' : 'Generar factura electrónica de prueba'}
              </button>
            )}
            {fe && (
              <button onClick={print} className="px-3 py-2 rounded-xl bg-white text-brand-dark text-xs font-bold flex items-center gap-1.5 shadow">
                <Printer size={14} /> Imprimir / PDF
              </button>
            )}
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/90 flex items-center justify-center shadow"><X size={16} /></button>
        </div>
        {error && <p className="text-xs text-red-200 mb-2">{error}</p>}

        {/* Documento */}
        <div className="print-area bg-white rounded-2xl shadow-2xl p-6 sm:p-8 text-[12px] text-gray-800 font-sans relative overflow-hidden">
          {/* Marca de agua / aviso de pruebas */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <span className="text-5xl sm:text-7xl font-black tracking-widest -rotate-[24deg] text-red-500/10 select-none">PRUEBA</span>
          </div>
          <div className="mb-4 rounded-xl border-2 border-red-300 bg-red-50 text-red-800 px-3 py-2 text-[11px] font-semibold flex items-start gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>DOCUMENTO DE PRUEBA · SIN VALIDEZ FISCAL. Generado en ambiente de pruebas para demostración; no ha sido transmitido ni validado por la DIAN. Al activar la facturación electrónica (proveedor tecnológico), este documento será reemplazado por la factura validada con CUFE y QR oficiales.</span>
          </div>

          <div className="flex flex-wrap justify-between gap-4 border-b border-gray-200 pb-4">
            <div>
              <p className="font-display font-bold text-xl text-brand-dark">{businessName}</p>
              {businessSlogan && <p className="text-gray-500">{businessSlogan}</p>}
              <p>NIT {businessNit || '—'}</p>
              <p>{businessAddress}</p>
              {businessPhone && <p>Tel. {businessPhone}</p>}
              {dianResolution && <p className="text-[10px] text-gray-500 mt-1 max-w-xs">{dianResolution}</p>}
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Factura electrónica de venta</p>
              <p className="font-mono font-bold text-lg text-brand-dark">{fe ? fe.number : 'Sin emitir'}</p>
              <p className="text-gray-500">Comprobante POS {orderNumber(live.id)}</p>
              <p className="text-gray-500">Fecha: {String(issued).slice(0, 16).replace('T', ' ')}</p>
              <p className={cn('inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold', fe ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600')}>{fe ? 'AMBIENTE DE PRUEBAS' : 'PENDIENTE DE GENERAR'}</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 py-4 border-b border-gray-200">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-1">Adquiriente</p>
              <p className="font-bold text-brand-dark">{cust.name || 'Consumidor Final'}</p>
              <p>{cust.isCompany ? 'NIT' : 'C.C. / NIT'}: {cust.doc || '222222222222'}</p>
              {cust.email && <p>{cust.email}</p>}
              {cust.phone && <p>Tel. {cust.phone}</p>}
              {cust.address && <p>{cust.address}</p>}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-1">Pago</p>
              <p>Forma de pago: <b>{PAYMENT[live.paymentMethod] || live.paymentMethod}</b></p>
              <p>Medio: contado</p>
              <p>Moneda: COP</p>
            </div>
          </div>

          <table className="w-full mt-4 text-[11.5px]">
            <thead>
              <tr className="text-gray-500 border-b border-gray-200">
                <th className="text-left py-1.5 font-semibold w-10">#</th>
                <th className="text-left py-1.5 font-semibold">Descripción</th>
                <th className="text-right py-1.5 font-semibold w-14">Cant.</th>
                <th className="text-right py-1.5 font-semibold w-24">Vr. unitario</th>
                <th className="text-right py-1.5 font-semibold w-24">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it: any, i: number) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-1.5 text-gray-500">{i + 1}</td>
                  <td className="py-1.5">{it.name}{it.size ? ` · ${it.size}` : ''}{it.flavors ? <span className="text-gray-500"> ({it.flavors})</span> : ''}</td>
                  <td className="py-1.5 text-right">{it.quantity || 1}</td>
                  <td className="py-1.5 text-right">{formatPrice(it.price || 0)}</td>
                  <td className="py-1.5 text-right font-semibold">{formatPrice((it.price || 0) * (it.quantity || 1))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex flex-wrap justify-between gap-6 mt-4">
            <div className="flex items-start gap-3">
              <div className="border border-gray-200 rounded-lg p-1.5 bg-white">
                <PseudoQr seed={fe?.cufe || String(live.id)} />
              </div>
              <div className="text-[10px] text-gray-500 max-w-xs">
                <p className="font-semibold text-gray-700">CUFE {fe ? '(simulado)' : ''}</p>
                <p className="font-mono break-all leading-tight">{fe ? fe.cufe : 'Se genera al emitir el documento de prueba.'}</p>
                <p className="mt-1">QR ilustrativo de pruebas. No enlaza al catálogo de la DIAN.</p>
              </div>
            </div>
            <div className="w-full sm:w-64 space-y-1">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatPrice(subtotal)}</span></div>
              {discount > 0 && <div className="flex justify-between text-red-600"><span>Descuento</span><span>−{formatPrice(discount)}</span></div>}
              {rate > 0 && (
                <>
                  <div className="flex justify-between"><span>Base gravable</span><span>{formatPrice(base)}</span></div>
                  <div className="flex justify-between"><span>{taxLabel} {rate}%</span><span>{formatPrice(tax)}</span></div>
                </>
              )}
              <div className="flex justify-between text-base font-bold text-brand-dark border-t border-gray-300 pt-1.5 mt-1"><span>Total</span><span>{formatPrice(total)}</span></div>
            </div>
          </div>

          <p className="mt-6 text-[10px] text-gray-400 text-center">Representación gráfica de prueba generada por el POS. {businessName} · {new Date().getFullYear()}</p>
        </div>
      </div>
    </div>
  );
};

export default ElectronicInvoiceModal;
