/** Comprobante de pago de nómina (desprendible) de una liquidación: se abre en una ventana para imprimir o guardar en PDF. */
import { useStore } from '@/store/useStore';
import { formatPrice } from '@/lib/format';

const esc = (s: any) => String(s ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] as string));
const d = (s?: string) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');
const UNIT: Record<string, string> = { monthly: 'mes', biweekly: 'quincena', per_shift: 'turnos', per_day: 'días', hourly: 'horas' };

export function payslipHtml(s: any, emp?: { name?: string; document?: string; position?: string }) {
  const st = useStore.getState();
  const det = s.details || {};
  const earn: Array<[string, number]> = [
    [`Básico${s.units ? ` (${s.units} ${UNIT[s.payMode] || ''} × ${formatPrice(s.unitAmount || 0)})` : ''}`, s.baseTotal || 0],
    ['Horas extra y recargos', s.extrasTotal || 0],
    ['Auxilio de transporte', s.allowanceTotal || 0],
    ['Propinas', s.tipsTotal || 0],
    ['Novedades (extras y bonificaciones)', (s.noveltiesExtras || 0) + (s.noveltiesBonus || 0)],
    ['Bonificación', s.bonuses || 0],
  ];
  const ded: Array<[string, number]> = [
    ['Salud y pensión', s.legalDeductionsTotal || 0],
    ['Anticipos', s.advancesTotal || 0],
    ['Préstamos y consumos', s.loansTotal || 0],
    ['Ausencias', s.noveltiesAbsence || 0],
    ['Otras deducciones (novedades)', s.noveltiesDeductions || 0],
    ['Descuentos', s.deductions || 0],
  ];
  const rows = (list: Array<[string, number]>) => list.filter(([, v]) => v).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${formatPrice(v)}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">—</td></tr>';
  const totalEarn = earn.reduce((a, [, v]) => a + v, 0);
  const totalDed = ded.reduce((a, [, v]) => a + v, 0);
  const loanLines = (det.loans || []).map((l: any) => `<li>${esc(l.notes || (l.number ? 'Préstamo #' + l.number : 'Préstamo / consumo'))}: ${formatPrice(l.amount)}${l.balance > 0 ? ` · queda ${formatPrice(l.balance)}` : ''}</li>`).join('');
  const legalLines = (det.legalDeductions || []).map((l: any) => `<li>${esc(l.label)}: ${formatPrice(l.amount)}</li>`).join('');
  const novLines = (det.novelties || []).map((n: any) => `<li>${esc(n.label || n.type)}${n.notes && !String(n.label || '').includes(n.notes) ? ' · ' + esc(n.notes) : ''}: ${['absence', 'deduction'].includes(n.group) ? '−' : '+'}${formatPrice(n.amount)}</li>`).join('');
  const name = emp?.name || s.employeeName || '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Comprobante de nómina · ${esc(name)} · ${d(s.periodStart)} a ${d(s.periodEnd)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;padding:24px;font-size:13px}
  .box{max-width:720px;margin:0 auto;border:1px solid #ccc;border-radius:10px;padding:22px}
  h1{font-size:18px;margin:0} h2{font-size:13px;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.04em;color:#444}
  .head{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #111;padding-bottom:10px}
  .muted{color:#666} .grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 18px;margin-top:10px}
  table{width:100%;border-collapse:collapse} td{padding:5px 0;border-bottom:1px solid #eee} td.n{text-align:right;white-space:nowrap}
  .tot td{font-weight:bold;border-bottom:none} .neto{margin-top:16px;padding:12px 14px;background:#f3f3f3;border-radius:8px;display:flex;justify-content:space-between;font-size:17px;font-weight:bold}
  ul{margin:4px 0 0;padding-left:18px;color:#444;font-size:12px} .sign{display:flex;gap:40px;margin-top:46px} .sign div{flex:1;border-top:1px solid #111;padding-top:4px;font-size:12px;color:#444}
  .bar{max-width:720px;margin:0 auto 12px;display:flex;gap:8px;justify-content:flex-end} .bar button{padding:8px 14px;border-radius:8px;border:1px solid #111;background:#111;color:#fff;font-weight:bold;cursor:pointer}
  @media print{.bar{display:none} body{padding:0} .box{border:none}}
</style></head><body>
<div class="bar"><button onclick="window.print()">Imprimir / Guardar PDF</button></div>
<div class="box">
  <div class="head">
    <div><h1>${esc(st.businessName || '')}</h1><div class="muted">${st.businessNit ? 'NIT ' + esc(st.businessNit) : ''}${st.businessAddress ? ' · ' + esc(st.businessAddress) : ''}</div></div>
    <div style="text-align:right"><div style="font-weight:bold">COMPROBANTE DE PAGO DE NÓMINA</div><div class="muted">N.º ${esc(s.id)} · ${s.status === 'paid' ? 'Pagado' + (s.paidAt ? ' el ' + d(String(s.paidAt)) : '') : 'Pendiente de pago'}</div></div>
  </div>
  <div class="grid">
    <div><b>Colaborador:</b> ${esc(name)}</div><div><b>Documento:</b> ${esc(emp?.document || '')}</div>
    <div><b>Cargo:</b> ${esc(emp?.position || s.position || '')}</div><div><b>Período:</b> ${d(s.periodStart)} al ${d(s.periodEnd)}</div>
  </div>
  <h2>Devengado</h2><table>${rows(earn)}<tr class="tot"><td>Total devengado</td><td class="n">${formatPrice(totalEarn)}</td></tr></table>
  <h2>Deducciones</h2><table>${rows(ded)}<tr class="tot"><td>Total deducciones</td><td class="n">${formatPrice(totalDed)}</td></tr></table>
  ${legalLines ? `<ul>${legalLines}</ul>` : ''}${loanLines ? `<ul>${loanLines}</ul>` : ''}${novLines ? `<ul>${novLines}</ul>` : ''}
  ${det.tipsSeparate ? '<p class="muted" style="font-size:12px;margin-top:8px">Las propinas se pagan aparte (no van en este comprobante).</p>' : ''}
  <div class="neto"><span>NETO A PAGAR</span><span>${formatPrice(s.total || 0)}</span></div>
  ${s.notes ? `<p class="muted" style="margin-top:8px">Nota: ${esc(s.notes)}</p>` : ''}
  <div class="sign"><div>Firma del empleador</div><div>Recibí conforme: ${esc(name)}</div></div>
</div></body></html>`;
}

/** Abre el comprobante en una pestaña nueva (desde ahí se imprime o se guarda en PDF). */
export function openPayslip(s: any, emp?: { name?: string; document?: string; position?: string }) {
  const w = window.open('', '_blank');
  if (!w) { alert('Permite las ventanas emergentes para ver el comprobante'); return; }
  w.document.open(); w.document.write(payslipHtml(s, emp)); w.document.close();
}
