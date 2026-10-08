/**
 * Facturas electrónicas guardadas: descargar PDF/XML, compartir el PDF (en el celular se adjunta directo a WhatsApp)
 * y armar los mensajes de WhatsApp y correo con el enlace oficial de consulta.
 */
const API_URL = import.meta.env.VITE_API_URL || '/api';

async function fetchFile(number: string, ext: 'pdf' | 'xml'): Promise<Blob> {
  const token = localStorage.getItem('token');
  const r = await fetch(`${API_URL}/einvoicing/invoices/${encodeURIComponent(number)}/${ext}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `No se pudo obtener el ${ext.toUpperCase()}`); }
  return r.blob();
}

/** Descarga el PDF o el XML guardado de la factura. */
export async function downloadInvoiceFile(number: string, ext: 'pdf' | 'xml' = 'pdf') {
  const blob = await fetchFile(number, ext);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `Factura-${number}.${ext}`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Abre el PDF en una pestaña nueva (para verlo o imprimirlo). */
export async function openInvoicePdf(number: string) {
  const w = window.open('', '_blank');
  const blob = await fetchFile(number, 'pdf');
  const url = URL.createObjectURL(blob);
  if (w) w.location.href = url; else window.location.href = url;
}

export const canShareFiles = () => typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [new File([''], 'x.pdf', { type: 'application/pdf' })] });

/** Compartir el PDF con el menú del celular (WhatsApp, correo, Drive...). */
export async function shareInvoicePdf(number: string, text: string) {
  const blob = await fetchFile(number, 'pdf');
  const file = new File([blob], `Factura-${number}.pdf`, { type: 'application/pdf' });
  await navigator.share({ files: [file], title: `Factura ${number}`, text });
}

export function invoiceMessage(inv: { number: string; customerName?: string; total?: number; publicUrl?: string }, business: string) {
  const name = inv.customerName && !/consumidor final/i.test(inv.customerName) ? ` ${inv.customerName}` : '';
  const total = inv.total ? ` por $${Math.round(inv.total).toLocaleString('es-CO')}` : '';
  return `Hola${name}, te enviamos tu factura electrónica ${inv.number}${total} de ${business}.${inv.publicUrl ? `\nPuedes verla y descargarla aquí: ${inv.publicUrl}` : ''}\n¡Gracias por tu compra!`;
}

/** Enlace de WhatsApp (con el número del cliente si lo tiene; los celulares de 10 dígitos se toman como Colombia). */
export function whatsappLink(phone: string | undefined, text: string) {
  let p = String(phone || '').replace(/\D/g, '');
  if (p.length === 10) p = '57' + p;
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

export const mailtoLink = (email: string | undefined, number: string, text: string) =>
  `mailto:${encodeURIComponent(email || '')}?subject=${encodeURIComponent(`Factura electrónica ${number}`)}&body=${encodeURIComponent(text)}`;
