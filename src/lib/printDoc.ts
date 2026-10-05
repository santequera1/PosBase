/** Impresión de documentos en hoja carta/media carta (comprobantes de gasto, egresos) usando un iframe aislado. */
export function printDocument(bodyHtml: string, title = 'Documento'): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) { iframe.remove(); return; }
  doc.open();
  doc.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title}</title><style>
    @page { size: letter; margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; color: #111; font-size: 11px; margin: 0; }
    h1 { font-size: 16px; margin: 0; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 10px; }
    .muted { color: #555; }
    .num { text-align: right; }
    .num .big { font-size: 18px; font-weight: 800; letter-spacing: .5px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; margin-bottom: 10px; }
    .box { border: 1px solid #ccc; border-radius: 6px; padding: 7px 9px; }
    .lbl { font-size: 9px; text-transform: uppercase; letter-spacing: .6px; color: #666; font-weight: 700; margin-bottom: 2px; }
    table { width: 100%; border-collapse: collapse; margin: 6px 0 10px; }
    th { text-align: left; background: #f1f1f1; padding: 5px 7px; font-size: 10px; text-transform: uppercase; letter-spacing: .4px; }
    td { padding: 5px 7px; border-bottom: 1px solid #e3e3e3; }
    td.r, th.r { text-align: right; }
    tr.tot td { font-weight: 800; border-top: 2px solid #111; border-bottom: 0; }
    .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 46px; }
    .sign div { border-top: 1px solid #111; padding-top: 4px; text-align: center; font-size: 10px; }
    .foot { margin-top: 18px; font-size: 9px; color: #777; text-align: center; }
  </style></head><body>${bodyHtml}</body></html>`);
  doc.close();
  const go = () => {
    try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); } catch { /* sin impresora */ }
    setTimeout(() => iframe.remove(), 60000);
  };
  setTimeout(go, 250);
}

export const escHtml = (s: any) => String(s ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] as string));
export const expenseNumber = (n?: number | null) => (n ? String(n).padStart(6, '0') : '—');
