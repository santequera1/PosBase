/**
 * Importación de colaboradores desde Excel. El navegador lee el archivo y envía filas con estas claves:
 * name, document, phone, email, position, payMode, baseAmount, startDate, hoursPerDay, overtime, legalDeductions,
 * transportAllowance, tipPoints, notes. Aquí se normalizan los valores escritos a mano en la hoja.
 */
const PAY_MODES = ['monthly', 'biweekly', 'per_shift', 'per_day', 'hourly'];
const PAY_ALIASES = [[/quinc/i, 'biweekly'], [/mens|mes/i, 'monthly'], [/turno/i, 'per_shift'], [/hora/i, 'hourly'], [/d[ií]a|diar|jornal/i, 'per_day']];

const isYes = v => /^(s[ií]|x|1|true|verdadero|yes|aplica)$/i.test(String(v ?? '').trim());
const isDateStr = s => /^\d{4}-\d{2}-\d{2}$/.test(s);
const present = v => v !== undefined && v !== null && String(v).trim() !== '';

/** "$1.750.905" · "1750905" · "1.750.905,50" → 1750906 */
function parseMoney(v) {
  if (typeof v === 'number') return Math.round(v);
  let s = String(v).replace(/[^0-9.,-]/g, '');
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.');
  return Math.round(Number(s) || 0);
}

/** 2026-03-01 · 01/03/2026 · número de serie de Excel (46082) */
function parseDate(v) {
  const s = String(v).trim();
  if (isDateStr(s)) return s;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (/^\d{5}(\.\d+)?$/.test(s)) return new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000).toISOString().slice(0, 10);
  return null;
}

function parsePayMode(v) {
  const s = String(v).trim();
  if (PAY_MODES.includes(s)) return s;
  const hit = PAY_ALIASES.find(([re]) => re.test(s));
  return hit ? hit[1] : undefined;
}

/** Convierte una fila cruda en un cuerpo compatible con employeePayload. Devuelve { body, error }. */
function normalizeRow(raw) {
  const r = raw || {};
  const body = {};
  body.name = String(r.name ?? '').trim();
  for (const k of ['document', 'phone', 'email', 'position', 'notes']) if (present(r[k])) body[k] = String(r[k]).replace(/\.0$/, '').trim();
  if (present(r.payMode)) {
    body.payMode = parsePayMode(r.payMode);
    if (!body.payMode) return { body, error: `Forma de pago no reconocida: "${r.payMode}" (usa mensual, quincenal, por día, por turno o por hora)` };
  }
  if (present(r.baseAmount)) body.baseAmount = parseMoney(r.baseAmount);
  if (present(r.startDate)) { const d = parseDate(r.startDate); if (d) body.startDate = d; }
  if (present(r.hoursPerDay)) body.hoursPerDay = Number(String(r.hoursPerDay).replace(',', '.'));
  for (const k of ['overtime', 'legalDeductions', 'transportAllowance']) if (present(r[k])) body[k] = isYes(r[k]);
  if (present(r.tipPoints)) body.tipPoints = Number(String(r.tipPoints).replace(',', '.'));
  if (!body.name || body.name.length < 2) return { body, error: 'Falta el nombre' };
  return { body, error: null };
}

const isEmptyRow = raw => !Object.entries(raw || {}).some(([k, v]) => !k.startsWith('_') && present(v));

module.exports = { normalizeRow, isEmptyRow, parseMoney, parseDate, parsePayMode };
