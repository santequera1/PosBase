import { useEffect, useState } from 'react';
import { Search, Download, FileCode2, MessageCircle, Mail, Share2, ExternalLink, FileCheck2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { formatPrice, getColombiaTodayStr } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Chip, KpiCard, INPUT, fmtDate } from '@/components/common/Primitives';
import { downloadInvoiceFile, openInvoicePdf, shareInvoicePdf, canShareFiles, invoiceMessage, whatsappLink, mailtoLink } from '@/lib/einvoiceShare';

/** Caja → Facturas electrónicas: todas las facturas emitidas, guardadas para descargarlas o enviarlas cuando se necesite. */
export const FacturasTab = () => {
  const businessName = useStore(s => s.businessName) || 'nuestro negocio';
  const [range, setRange] = useState<'month' | 'prev' | 'all'>('month');
  const [q, setQ] = useState('');
  const [data, setData] = useState<{ invoices: any[]; total: number } | null>(null);
  const [busy, setBusy] = useState<string>('');
  const today = getColombiaTodayStr();
  const params = () => {
    if (range === 'all') return {};
    if (range === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
    const d = new Date(`${today.slice(0, 7)}-01T12:00:00`); d.setMonth(d.getMonth() - 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const ym = d.toISOString().slice(0, 7);
    return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` };
  };
  const load = () => { setData(null); api.getInvoices({ ...params(), q: q.trim() || undefined }).then(setData).catch(e => toast.error(e.message)); };
  useEffect(() => { load(); }, [range]);
  useEffect(() => { const t = setTimeout(load, 350); return () => clearTimeout(t); }, [q]);
  const run = async (key: string, fn: () => Promise<any>) => { setBusy(key); try { await fn(); } catch (e: any) { if (e?.name !== 'AbortError') toast.error(e.message || 'No se pudo completar'); } setBusy(''); };
  const share = typeof window !== 'undefined' && canShareFiles();
  const list = data?.invoices || [];
  return (
    <div className="space-y-3" data-facturas-tab>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1"><Chip active={range === 'month'} onClick={() => setRange('month')}>Este mes</Chip><Chip active={range === 'prev'} onClick={() => setRange('prev')}>Mes anterior</Chip><Chip active={range === 'all'} onClick={() => setRange('all')}>Todas</Chip></div>
        <div className="relative flex-1 min-w-[200px] max-w-md"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Número de factura, cliente, documento o venta #" className={cn(INPUT, 'pl-8')} data-facturas-search /></div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
        <KpiCard label="Facturas emitidas" value={data ? String(list.length) : '…'} />
        <KpiCard label="Total facturado" value={data ? formatPrice(data.total) : '…'} />
        <KpiCard label="Guardadas (PDF)" value={data ? `${list.filter(i => i.pdfSaved).length} de ${list.filter(i => i.real).length}` : '…'} sub="Copia en el sistema, lista para enviar" />
      </div>
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {!data ? <p className="p-6 text-sm text-muted-foreground">Cargando…</p> : list.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No hay facturas electrónicas{range !== 'all' ? ' en este período' : ''}. Se emiten desde <b>Caja → Ventas</b> → abrir la venta → Factura electrónica.</p>
        ) : (
          <ul className="divide-y divide-border">
            {list.map(inv => {
              const msg = invoiceMessage(inv, businessName);
              return (
                <li key={inv.id} className="p-3 sm:px-4 flex flex-col lg:flex-row lg:items-center gap-2" data-factura={inv.number}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-brand-dark flex items-center gap-2 flex-wrap">
                      <FileCheck2 size={15} className={inv.real ? 'text-emerald-600' : 'text-amber-600'} /> {inv.number}
                      {!inv.real && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">{inv.provider === 'factus' ? 'pendiente' : 'documento de prueba'}</span>}
                      {inv.real && inv.pdfSaved && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold">guardada</span>}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{fmtDate(inv.issuedAt || inv.createdAt)} {String(inv.issuedAt || '').slice(11, 16)} · {inv.customerName || 'Consumidor final'}{inv.customerDoc && inv.customerDoc !== '222222222222' ? ` · ${inv.customerDoc}` : ''} · venta #{inv.id}</p>
                  </div>
                  <p className="text-sm font-bold lg:w-28 lg:text-right">{formatPrice(inv.total)}</p>
                  <div className="flex flex-wrap gap-1.5 lg:justify-end">
                    {inv.real ? (
                      <>
                        <button onClick={() => run(inv.number + 'v', () => openInvoicePdf(inv.number))} className="px-2.5 py-1.5 rounded-lg border border-border text-xs font-semibold flex items-center gap-1" title="Ver PDF"><Eye size={13} /> Ver</button>
                        <button onClick={() => run(inv.number + 'p', () => downloadInvoiceFile(inv.number, 'pdf'))} disabled={busy === inv.number + 'p'} className="px-2.5 py-1.5 rounded-lg border border-border text-xs font-semibold flex items-center gap-1 disabled:opacity-40" data-factura-pdf><Download size={13} /> PDF</button>
                        <button onClick={() => run(inv.number + 'x', () => downloadInvoiceFile(inv.number, 'xml'))} disabled={busy === inv.number + 'x'} className="px-2.5 py-1.5 rounded-lg border border-border text-xs font-semibold flex items-center gap-1 disabled:opacity-40" title="XML para el contador"><FileCode2 size={13} /> XML</button>
                        {share && <button onClick={() => run(inv.number + 's', () => shareInvoicePdf(inv.number, msg))} disabled={busy === inv.number + 's'} className="px-2.5 py-1.5 rounded-lg bg-brand-button text-brand-on-button text-xs font-semibold flex items-center gap-1 disabled:opacity-40" title="Adjuntar el PDF a WhatsApp, correo..."><Share2 size={13} /> Compartir PDF</button>}
                        <a href={whatsappLink(inv.phone, msg)} target="_blank" rel="noreferrer" className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1" data-factura-whatsapp><MessageCircle size={13} /> WhatsApp</a>
                        <a href={mailtoLink(inv.email, inv.number, msg)} className="px-2.5 py-1.5 rounded-lg border border-border text-xs font-semibold flex items-center gap-1"><Mail size={13} /> Correo</a>
                        {inv.publicUrl && <a href={inv.publicUrl} target="_blank" rel="noreferrer" className="px-2.5 py-1.5 rounded-lg border border-border text-xs font-semibold flex items-center gap-1" title="Consulta oficial"><ExternalLink size={13} /> DIAN</a>}
                      </>
                    ) : <span className="text-[11px] text-muted-foreground">Documento de prueba: no tiene PDF oficial.</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">Cada factura queda guardada en el sistema (PDF y XML) apenas se emite. WhatsApp y Correo envían el enlace oficial para ver y descargar la factura; en el celular, <b>Compartir PDF</b> adjunta el archivo directamente al chat.</p>
    </div>
  );
};
