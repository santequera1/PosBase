/**
 * Pago mixto: una cuenta pagada con varios medios (efectivo + Nequi + datáfono...).
 * Formato guardado en orders.payment_split:
 *   nuevo  → { parts: [{ method, amount }, ...] }  (2 o más medios; con 2 también se guardan method1/amount1/method2/amount2)
 *   viejo  → { method1, amount1, method2, amount2 } (ventas anteriores: se siguen leyendo igual)
 * Todo el sistema (arqueo, contabilidad, factura, recibo, informes) lee los medios con splitParts().
 */
const NOT_SPLITTABLE = ['mixed', 'credit', 'payroll'];

function parse(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

/** Medios del pago mixto como lista [{ method, amount }] (vacía si no es mixto). */
function splitParts(raw) {
  const s = parse(raw);
  if (!s) return [];
  if (Array.isArray(s.parts)) return s.parts.map(p => ({ method: String(p.method || ''), amount: Math.round(Number(p.amount) || 0) })).filter(p => p.method && p.amount > 0);
  const out = [];
  if (s.method1 && Number(s.amount1) > 0) out.push({ method: String(s.method1), amount: Math.round(Number(s.amount1)) });
  if (s.method2 && Number(s.amount2) > 0) out.push({ method: String(s.method2), amount: Math.round(Number(s.amount2)) });
  return out;
}

/** Objeto a guardar: siempre parts; con exactamente 2 medios también el formato viejo (compatibilidad). */
function makeSplit(parts) {
  const out = { parts };
  if (parts.length === 2) Object.assign(out, { method1: parts[0].method, amount1: parts[0].amount, method2: parts[1].method, amount2: parts[1].amount });
  else if (parts.length) Object.assign(out, { method1: parts[0].method, amount1: parts[0].amount });
  return out;
}

/**
 * Valida el pago mixto que llega del cobro. Acepta { parts } o el formato viejo. Los medios repetidos se suman.
 * Devuelve { split } o { error }.
 */
function readSplitInput(input, due, allowed) {
  let parts = splitParts(input);
  if (parts.some(p => NOT_SPLITTABLE.includes(p.method) || (allowed && !allowed.includes(p.method)))) return { error: 'Medio de pago inválido en el pago mixto' };
  const merged = [];
  for (const p of parts) { const m = merged.find(x => x.method === p.method); if (m) m.amount += p.amount; else merged.push({ ...p }); }
  parts = merged;
  if (parts.length < 2) return { error: 'El pago mixto necesita al menos dos medios de pago distintos' };
  const sum = parts.reduce((a, p) => a + p.amount, 0);
  if (sum !== due) return { error: `Los medios de pago deben sumar ${due} (van ${sum})` };
  return { split: makeSplit(parts) };
}

/** Parte en efectivo del pago mixto. */
const cashOf = raw => splitParts(raw).filter(p => p.method === 'cash').reduce((a, p) => a + p.amount, 0);
const hasMethod = (raw, m) => splitParts(raw).some(p => p.method === m);

module.exports = { splitParts, makeSplit, readSplitInput, cashOf, hasMethod, NOT_SPLITTABLE };
