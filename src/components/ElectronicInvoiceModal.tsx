import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, FileCheck2, AlertTriangle, Download, MessageCircle, Mail, Share2, ExternalLink } from 'lucide-react';
import { downloadInvoiceFile, openInvoicePdf, shareInvoicePdf, canShareFiles, invoiceMessage, whatsappLink, mailtoLink } from '@/lib/einvoiceShare';
import { useStore } from '@/store/useStore';
import { api } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { orderNumber } from '@/lib/orderNumber';
import { cn } from '@/lib/utils';

const PAYMENT: Record<string, string> = { cash: 'Efectivo', card_debit: 'Tarjeta débito', card_credit: 'Tarjeta crédito', card: 'Datáfono', transfer: 'Transferencia / QR', mixed: 'Mixto' };

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

/** Dígito de verificación de un NIT (algoritmo de la DIAN). */
export const nitDv = (nit: string) => {
  const d = nit.replace(/\D/g, '');
  if (!d) return '';
  const primes = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  let sum = 0;
  for (let i = 0; i < d.length && i < primes.length; i++) sum += Number(d[d.length - 1 - i]) * primes[i];
  const r = sum % 11;
  return String(r > 1 ? 11 - r : r);
};

const FIELD = 'w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-primary/30';
const FLABEL = 'block text-[11px] font-semibold text-gray-500 mb-1';

export const ElectronicInvoiceModal = ({ order, onClose }: { order: any; onClose: () => void }) => {
  const { businessName, businessNit, businessAddress, businessPhone, businessSlogan, dianResolution, taxType, taxRate } = useStore();
  const customers = useStore(s => s.customers);
  // La venta puede no estar en la lista del día (p. ej. una venta de días anteriores): se lleva una copia local al día
  const storeOrder = useStore(s => s.orders.find(o => o.id === order?.id));
  const [cur, setCur] = useState<any>(order);
  useEffect(() => { if (storeOrder) setCur((c: any) => ({ ...c, ...storeOrder })); }, [storeOrder]);
  const live = cur;
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState('');

  // Datos del adquiriente: se completan aquí mismo antes de emitir
  const c0 = order?.customer || {};
  const dirC0: any = order?.customerId ? customers.find((x: any) => x.id === order.customerId) : null;
  const [customerId, setCustomerId] = useState<number>(order?.customerId || 0);
  const [isCompany, setIsCompany] = useState<boolean>(Boolean(dirC0?.isCompany));
  const [cf, setCf] = useState({
    name: c0.name && c0.name !== 'Consumidor Final' ? c0.name : '',
    doc: c0.doc && c0.doc !== '222222222222' ? c0.doc : '',
    dv: dirC0?.dv || '', email: c0.email || '', phone: c0.phone || '', address: c0.address || '',
  });
  const setC = (p: Partial<typeof cf>) => setCf(x => ({ ...x, ...p }));
  const [search, setSearch] = useState('');
  const matches = search.trim().length >= 2 ? customers.filter((x: any) => `${x.name} ${x.documentId || ''} ${x.phone || ''}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 6) : [];
  const pick = (x: any) => {
    setCustomerId(x.id); setIsCompany(Boolean(x.isCompany));
    setCf({ name: x.name || '', doc: x.documentId && x.documentId !== '222222222222' ? x.documentId : '', dv: x.dv || '', email: x.email || '', phone: x.phone || '', address: x.address || '' });
    setSearch('');
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!live) return null;
  const fe = live.electronicInvoice && live.electronicInvoice.number ? live.electronicInvoice : undefined;
  const feError = live.electronicInvoice?.error;
  const real = Boolean(fe && fe.test === false);
  const items = live.items || [];
  const subtotal = live.subtotal ?? items.reduce((a: number, i: any) => a + (i.price || 0) * (i.quantity || 1), 0);
  const discount = live.discount || 0;
  const total = live.total ?? Math.max(0, subtotal - discount);
  const rate = taxType !== 'none' ? Number(taxRate) || 0 : 0;
  const base = rate > 0 ? Math.round(total / (1 + rate / 100)) : total;
  const tax = total - base;
  const taxLabel = taxType === 'iva' ? 'IVA' : taxType === 'inc' ? 'INC' : 'Impuesto';
  const issued = fe?.issuedAt || live.createdAt || '';
  // Antes de emitir, la vista previa muestra lo que se está escribiendo
  const cust = fe ? (live.customer || {}) : { name: cf.name || 'Consumidor Final', doc: cf.doc ? cf.doc + (isCompany && cf.dv ? '-' + cf.dv : '') : '', isCompany, email: cf.email, phone: cf.phone, address: cf.address };

  const issue = async () => {
    setError('');
    const doc = cf.doc.replace(/[^0-9A-Za-z]/g, '');
    if (isCompany && !doc) { setError('Escribe el NIT de la empresa'); return; }
    if (doc && cf.name.trim().length < 2) { setError(isCompany ? 'Escribe la razón social de la empresa' : 'Escribe el nombre del cliente'); return; }
    if (doc && !isCompany && doc.length < 5) { setError('Revisa la cédula: parece incompleta'); return; }
    if (cf.email.trim() && !/^\S+@\S+\.\S+$/.test(cf.email.trim())) { setError('Revisa el correo del cliente'); return; }
    setIssuing(true);
    try {
      // 1) Se guardan los datos del cliente en la venta (y en el directorio, si tiene documento)
      const fresh = await api.editSaleDetails(live.id, {
        customerName: doc ? cf.name.trim() : 'Consumidor Final', customerDoc: doc, customerEmail: cf.email.trim(), customerPhone: cf.phone.trim(), customerAddress: cf.address.trim(),
        customerId: doc && customerId ? customerId : undefined, saveCustomer: Boolean(doc), isCompany, dv: isCompany ? (cf.dv || nitDv(doc)) : '',
      });
      setCur((c: any) => ({ ...c, ...fresh }));
      // 2) Se emite la factura con esos datos
      const updated = await api.issueTestInvoice(live.id);
      setCur((c: any) => ({ ...c, ...updated }));
      useStore.setState(s => ({ orders: s.orders.map(o => (o.id === live.id ? { ...o, ...updated } : o)) }));
      if (doc) { try { useStore.setState({ customers: await api.getCustomers() }); } catch { /* el directorio se recarga al entrar a Clientes */ } }
    } catch (e: any) { setError(e.message || 'No se pudo generar el documento'); }
    setIssuing(false);
  };
  const print = () => {
    document.body.classList.add('print-invoice');
    const cleanup = () => { document.body.classList.remove('print-invoice'); window.removeEventListener('afterprint', cleanup); };
    window.addEventListener('afterprint', cleanup);
    setTimeout(() => window.print(), 50);
    setTimeout(cleanup, 60000);
  };

  // Se dibuja directo en <body>: así el encabezado y las pestañas de la página no tapan la barra de botones
  return createPortal(
    <div className="print-overlay fixed inset-0 !m-0 z-[200] bg-black/60 backdrop-blur-sm flex items-start justify-center p-2 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-4xl" onClick={e => e.stopPropagation()}>
        {/* Barra de acciones: estado de la factura a la izquierda, acciones a la derecha (siempre visible) */}
        <div className="sticky top-0 z-10 mb-3 print:hidden" data-fe-toolbar>
          <div className="bg-white rounded-2xl shadow-xl border border-black/5 px-3 py-2.5 flex flex-wrap sm:flex-nowrap items-center gap-3">
            <div className="min-w-0 flex items-center gap-2 shrink-0">
              <span className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0', real ? 'bg-emerald-100 text-emerald-700' : fe ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600')}><FileCheck2 size={16} /></span>
              <div className="min-w-0 leading-tight">
                <p className="text-sm font-bold text-gray-900 truncate">{fe ? `Factura ${fe.number}` : 'Factura electrónica'}</p>
                <p className={cn('text-[11px] font-semibold', real ? 'text-emerald-700' : feError ? 'text-red-600' : 'text-gray-500')}>{real ? 'Validada por la DIAN' : fe ? 'Documento de prueba' : feError ? 'Rechazada: revisa el detalle' : 'Sin emitir'}</p>
              </div>
            </div>
            <div className="flex-1 flex flex-wrap items-center justify-end gap-1.5" data-fe-actions>
              {!fe && (
                <button onClick={issue} disabled={issuing} className="h-9 px-4 rounded-xl bg-brand-button text-brand-on-button text-xs font-bold flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50" data-fe-issue>
                  <FileCheck2 size={14} /> {issuing ? 'Emitiendo…' : feError ? 'Reintentar emisión' : 'Emitir factura electrónica'}
                </button>
              )}
              {real && fe?.number && (() => {
                const msg = invoiceMessage({ number: fe.number, customerName: live.customer?.name, total: live.total, publicUrl: fe.publicUrl }, businessName || 'nuestro negocio');
                const btn = 'h-9 px-3 rounded-xl border border-gray-200 bg-white text-gray-800 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap hover:bg-gray-50';
                return (
                  <>
                    <button onClick={() => openInvoicePdf(fe.number).catch((e: any) => setError(e.message))} className={btn} title="Abrir el PDF oficial para imprimir"><Printer size={14} /> Imprimir</button>
                    <button onClick={() => downloadInvoiceFile(fe.number, 'pdf').catch((e: any) => setError(e.message))} className={btn} data-fe-download><Download size={14} /> PDF</button>
                    {canShareFiles() && <button onClick={() => shareInvoicePdf(fe.number, msg).catch((e: any) => e?.name !== 'AbortError' && setError(e.message))} className={btn}><Share2 size={14} /> Compartir</button>}
                    <a href={mailtoLink(live.customer?.email, fe.number, msg)} className={btn}><Mail size={14} /> Correo</a>
                    {fe.publicUrl && <a href={fe.publicUrl} target="_blank" rel="noreferrer" className={btn} title="Consulta oficial"><ExternalLink size={14} /> DIAN</a>}
                    <a href={whatsappLink(live.customer?.phone, msg)} target="_blank" rel="noreferrer" className="h-9 px-3.5 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap hover:bg-emerald-700"><MessageCircle size={14} /> WhatsApp</a>
                  </>
                );
              })()}
              {fe && !real && <button onClick={print} className="h-9 px-3 rounded-xl border border-gray-200 bg-white text-gray-800 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"><Printer size={14} /> Imprimir</button>}
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center shrink-0" title="Cerrar"><X size={16} /></button>
          </div>
        </div>
        {(error || feError) && <p className="text-xs text-red-800 mb-3 bg-red-50 border border-red-200 rounded-xl px-3 py-2 print:hidden">{error || `El proveedor rechazó la factura: ${feError}`}</p>}

        {/* Datos del cliente: se llenan aquí antes de emitir (sin documento sale a Consumidor Final) */}
        {!fe && (
          <div className="mb-3 bg-white rounded-2xl shadow-xl border border-black/5 p-4 space-y-3 print:hidden" data-fe-customer>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold text-gray-900">¿A nombre de quién sale la factura?</p>
              <div className="inline-flex rounded-xl border border-gray-200 p-0.5 text-xs font-semibold">
                <button type="button" onClick={() => setIsCompany(false)} className={cn('px-3 py-1.5 rounded-lg', !isCompany ? 'bg-brand-button text-brand-on-button' : 'text-gray-700')}>Persona (cédula)</button>
                <button type="button" onClick={() => setIsCompany(true)} className={cn('px-3 py-1.5 rounded-lg', isCompany ? 'bg-brand-button text-brand-on-button' : 'text-gray-700')} data-fe-company>Empresa (NIT)</button>
              </div>
            </div>
            <div className="relative">
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente guardado: nombre, cédula/NIT o celular" className={FIELD} data-fe-search />
              {matches.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
                  {matches.map((x: any) => (
                    <button key={x.id} type="button" onClick={() => pick(x)} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex justify-between gap-2">
                      <span className="font-semibold truncate">{x.name}{x.isCompany ? ' · empresa' : ''}</span><span className="text-gray-500 shrink-0">{x.documentId && x.documentId !== '222222222222' ? x.documentId : x.phone || ''}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
              <div className={isCompany ? 'col-span-1 sm:col-span-2' : 'col-span-2 sm:col-span-2'}>
                <label className={FLABEL}>{isCompany ? 'NIT (sin dígito de verificación)' : 'Cédula'}</label>
                <input inputMode="numeric" value={cf.doc} onChange={e => setC({ doc: e.target.value.replace(/[^0-9A-Za-z]/g, ''), ...(isCompany ? { dv: '' } : {}) })} placeholder={isCompany ? '900123456' : '1047123456'} className={cn(FIELD, 'font-mono')} data-fe-doc />
              </div>
              {isCompany && (
                <div className="col-span-1">
                  <label className={FLABEL}>DV</label>
                  <input inputMode="numeric" value={cf.dv || nitDv(cf.doc)} onChange={e => setC({ dv: e.target.value.replace(/\D/g, '').slice(0, 1) })} className={cn(FIELD, 'font-mono text-center')} data-fe-dv />
                </div>
              )}
              <div className={isCompany ? 'col-span-2 sm:col-span-3' : 'col-span-2 sm:col-span-4'}>
                <label className={FLABEL}>{isCompany ? 'Razón social' : 'Nombre completo'}</label>
                <input value={cf.name} onChange={e => setC({ name: e.target.value })} placeholder={isCompany ? 'Empresa S.A.S.' : 'Nombre y apellido'} className={FIELD} data-fe-name />
              </div>
              <div className="col-span-2 sm:col-span-3">
                <label className={FLABEL}>Correo (le llega la factura)</label>
                <input type="email" value={cf.email} onChange={e => setC({ email: e.target.value })} placeholder="cliente@correo.com" className={FIELD} data-fe-email />
              </div>
              <div className="col-span-1 sm:col-span-1">
                <label className={FLABEL}>Celular</label>
                <input inputMode="tel" value={cf.phone} onChange={e => setC({ phone: e.target.value })} className={FIELD} data-fe-phone />
              </div>
              <div className="col-span-1 sm:col-span-2">
                <label className={FLABEL}>Dirección</label>
                <input value={cf.address} onChange={e => setC({ address: e.target.value })} className={FIELD} data-fe-address />
              </div>
            </div>
            <p className="text-[11px] text-gray-500">{cf.doc ? 'Al emitir, el cliente queda guardado en el directorio para la próxima vez.' : 'Sin cédula ni NIT la factura sale a nombre de Consumidor Final (222222222222).'}</p>
          </div>
        )}

        {/* Documento */}
        <div className="print-area paper bg-white rounded-2xl shadow-2xl p-6 sm:p-8 text-[12px] text-gray-800 font-sans relative overflow-hidden">
          {/* Marca de agua / aviso de pruebas */}
          {!real && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <span className="text-5xl sm:text-7xl font-black tracking-widest -rotate-[24deg] text-red-500/10 select-none">PRUEBA</span>
            </div>
          )}
          {real ? (
            <div className="mb-4 rounded-xl border-2 border-emerald-300 bg-emerald-50 text-emerald-800 px-3 py-2 text-[11px] font-semibold flex items-start gap-2">
              <FileCheck2 size={16} className="shrink-0 mt-0.5" />
              <span>Factura electrónica validada por la DIAN a través de Factus. El PDF y XML oficiales están disponibles en el portal del proveedor y en el enlace de consulta.</span>
            </div>
          ) : (
            <div className="mb-4 rounded-xl border-2 border-red-300 bg-red-50 text-red-800 px-3 py-2 text-[11px] font-semibold flex items-start gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>DOCUMENTO DE PRUEBA · SIN VALIDEZ FISCAL. Generado en ambiente de pruebas para demostración; no ha sido transmitido ni validado por la DIAN. Al activar la facturación electrónica (Factus), este documento será reemplazado por la factura validada con CUFE y QR oficiales.</span>
            </div>
          )}

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
              <p className={cn('inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold', real ? 'bg-emerald-100 text-emerald-800' : fe ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600')}>{real ? 'VALIDADA POR LA DIAN' : fe ? 'AMBIENTE DE PRUEBAS' : 'PENDIENTE DE GENERAR'}</p>
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
              <p>Medio: {live.paymentStatus && live.paymentStatus !== 'paid' ? 'crédito' : 'contado'}</p>
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
                <p className="font-semibold text-gray-700">CUFE {fe && !real ? '(simulado)' : ''}</p>
                <p className="font-mono break-all leading-tight">{fe ? fe.cufe : 'Se genera al emitir la factura electrónica.'}</p>
                {real ? <p className="mt-1 break-all">{fe?.qr || fe?.publicUrl ? `Consulta: ${fe?.publicUrl || fe?.qr}` : 'Consulte el documento en el catálogo de la DIAN con el CUFE.'}</p> : <p className="mt-1">QR ilustrativo de pruebas. No enlaza al catálogo de la DIAN.</p>}
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

          <p className="mt-6 text-[10px] text-gray-400 text-center">{real ? 'Representación gráfica de la factura electrónica de venta. Proveedor tecnológico: Factus.' : 'Representación gráfica de prueba generada por el POS.'} {businessName} · {new Date().getFullYear()}</p>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ElectronicInvoiceModal;
