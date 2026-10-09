/**
 * Pago mixto con varios medios. El servidor guarda { parts: [{ method, amount }] } y, para ventas anteriores,
 * { method1, amount1, method2, amount2 }: splitParts() entiende los dos formatos.
 */
export interface SplitPart { method: string; amount: number }

export function splitParts(s: any): SplitPart[] {
  if (!s) return [];
  if (Array.isArray(s.parts)) return s.parts.map((p: any) => ({ method: String(p.method || ''), amount: Math.round(Number(p.amount) || 0) })).filter((p: SplitPart) => p.method && p.amount > 0);
  const out: SplitPart[] = [];
  if (s.method1 && Number(s.amount1) > 0) out.push({ method: s.method1, amount: Math.round(Number(s.amount1)) });
  if (s.method2 && Number(s.amount2) > 0) out.push({ method: s.method2, amount: Math.round(Number(s.amount2)) });
  return out;
}

export const PAY_NAMES: Record<string, string> = { cash: 'Efectivo', card_debit: 'T. Débito', card_credit: 'T. Crédito', card: 'Datáfono', transfer: 'Transferencia / Nequi', platform: 'Plataforma' };
export const splitLabel = (s: any) => splitParts(s).map(p => PAY_NAMES[p.method] || p.method).join(' + ');
