/**
 * Motor de nómina (Colombia): festivos, clasificación de horas trabajadas, horas extras,
 * recargos nocturnos y dominicales, auxilio de transporte y deducciones de ley (salud y pensión).
 *
 * Los parámetros viven en la tabla settings (clave `payrollConfig`, JSON) y tienen valores por defecto
 * según la normativa vigente a 2026:
 *  - Jornada máxima: 42 h/semana (Ley 2101 de 2021, desde el 15 de julio de 2026) → divisor mensual 210 h.
 *  - Trabajo nocturno: de 7:00 p. m. a 6:00 a. m. (Ley 2466 de 2025).
 *  - Recargo dominical/festivo: 80 % (jul-2025), 90 % (jul-2026), 100 % (jul-2027) (Ley 2466 de 2025).
 *  - Horas extra: diurna 25 %, nocturna 75 %. Recargo nocturno 35 %.
 *  - Salario mínimo 2026: $1.750.905; auxilio de transporte 2026: $249.095.
 *  - Deducciones del trabajador: salud 4 % y pensión 4 % sobre salario + extras (no sobre propinas ni auxilio).
 */

const DEFAULT_CONFIG = {
  weeklyHours: 42,          // jornada semanal ordinaria
  hoursPerDay: 8,           // jornada diaria por defecto (cada colaborador puede tener la suya)
  nightStart: 19,           // hora (0-23) en que empieza el recargo nocturno
  nightEnd: 6,              // hora en que termina
  extraDayPct: 25,          // hora extra diurna
  extraNightPct: 75,        // hora extra nocturna
  nightPct: 35,             // recargo nocturno ordinario
  sundayPct: null,          // null = automático según la fecha (80 / 90 / 100)
  healthPct: 4,             // salud (aporte del trabajador)
  pensionPct: 4,            // pensión (aporte del trabajador)
  smmlv: 1750905,           // salario mínimo mensual 2026
  transportAllowance: 249095, // auxilio de transporte mensual 2026 (aplica hasta 2 SMMLV)
};

const CONFIG_KEYS = Object.keys(DEFAULT_CONFIG);

function readConfig(db) {
  let saved = {};
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'payrollConfig'").get();
    if (row && row.value) saved = JSON.parse(row.value) || {};
  } catch { saved = {}; }
  const cfg = { ...DEFAULT_CONFIG };
  for (const k of CONFIG_KEYS) {
    if (saved[k] === undefined || saved[k] === null || saved[k] === '') continue;
    const n = Number(saved[k]);
    if (Number.isFinite(n)) cfg[k] = n;
  }
  return cfg;
}

function saveConfig(db, body) {
  const clean = {};
  for (const k of CONFIG_KEYS) {
    if (body[k] === undefined || body[k] === null || body[k] === '') { if (k === 'sundayPct') clean[k] = null; continue; }
    const n = Number(body[k]);
    if (!Number.isFinite(n) || n < 0) throw new Error(`Valor inválido para ${k}`);
    clean[k] = n;
  }
  if (clean.weeklyHours !== undefined && (clean.weeklyHours < 1 || clean.weeklyHours > 60)) throw new Error('La jornada semanal debe estar entre 1 y 60 horas');
  if (clean.hoursPerDay !== undefined && (clean.hoursPerDay < 1 || clean.hoursPerDay > 16)) throw new Error('La jornada diaria debe estar entre 1 y 16 horas');
  if (clean.nightStart !== undefined && clean.nightStart > 23) throw new Error('Hora de inicio nocturno inválida');
  if (clean.nightEnd !== undefined && clean.nightEnd > 23) throw new Error('Hora de fin nocturno inválida');
  db.prepare("INSERT INTO settings (key, value) VALUES ('payrollConfig', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(clean));
  return readConfig(db);
}

/** Recargo dominical/festivo vigente según la fecha (Ley 2466 de 2025). */
function sundayPctFor(dateStr) {
  if (dateStr < '2025-07-01') return 75;
  if (dateStr < '2026-07-01') return 80;
  if (dateStr < '2027-07-01') return 90;
  return 100;
}

/* ---------- Festivos colombianos (Ley 51 de 1983, "Ley Emiliani") ---------- */
function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const iso = d => d.toISOString().slice(0, 10);
function nextMonday(d) { const dow = d.getUTCDay(); return dow === 1 ? d : addDays(d, (8 - dow) % 7); }

const holidayCache = new Map();
function colombianHolidays(year) {
  if (holidayCache.has(year)) return holidayCache.get(year);
  const set = new Set();
  const fixed = [[1, 1], [5, 1], [7, 20], [8, 7], [12, 8], [12, 25]];
  for (const [m, d] of fixed) set.add(iso(new Date(Date.UTC(year, m - 1, d))));
  const movable = [[1, 6], [3, 19], [6, 29], [8, 15], [10, 12], [11, 1], [11, 11]];
  for (const [m, d] of movable) set.add(iso(nextMonday(new Date(Date.UTC(year, m - 1, d)))));
  const easter = easterSunday(year);
  set.add(iso(addDays(easter, -3))); // Jueves Santo
  set.add(iso(addDays(easter, -2))); // Viernes Santo
  set.add(iso(nextMonday(addDays(easter, 39)))); // Ascensión
  set.add(iso(nextMonday(addDays(easter, 60)))); // Corpus Christi
  set.add(iso(nextMonday(addDays(easter, 68)))); // Sagrado Corazón
  holidayCache.set(year, set);
  return set;
}
function isSundayOrHoliday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  if (d.getUTCDay() === 0) return true;
  return colombianHolidays(d.getUTCFullYear()).has(dateStr);
}

/* ---------- Clasificación de horas de una asistencia ---------- */
const EMPTY_BUCKETS = () => ({ ordDay: 0, ordNight: 0, extDay: 0, extNight: 0, sunOrdDay: 0, sunOrdNight: 0, sunExtDay: 0, sunExtNight: 0 });

function parseTs(ts) {
  if (!ts) return null;
  const s = String(ts).replace('T', ' ');
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
}

/**
 * Reparte los minutos trabajados en ordinarios/extra, diurnos/nocturnos y domingo-festivo.
 * Las primeras `hoursPerDay` horas son ordinarias; el resto, extra (en orden cronológico).
 */
function classifyAttendance(att, cfg, hoursPerDay) {
  const b = EMPTY_BUCKETS();
  const hours = Number(att.hours) || 0;
  let start = parseTs(att.checkIn);
  let end = parseTs(att.checkOut);
  if (start && end && end <= start) end = null;
  if (!start && hours > 0) start = parseTs(`${att.date} 08:00`);
  if (start && !end && hours > 0) end = new Date(start.getTime() + Math.round(hours * 60) * 60000);
  if (!start || !end) {
    // Sin horario: se asume trabajo diurno ordinario; solo se marca extra lo que exceda la jornada.
    const ordinary = Math.min(hours, hoursPerDay);
    const sun = isSundayOrHoliday(att.date);
    if (sun) { b.sunOrdDay += ordinary; b.sunExtDay += Math.max(0, hours - ordinary); }
    else { b.ordDay += ordinary; b.extDay += Math.max(0, hours - ordinary); }
    return finish(b);
  }
  const totalMin = Math.min(Math.round((end - start) / 60000), 24 * 60 * 2);
  const ordinaryMin = Math.round(hoursPerDay * 60);
  for (let i = 0; i < totalMin; i++) {
    const t = new Date(start.getTime() + i * 60000);
    const h = t.getUTCHours();
    const night = cfg.nightStart > cfg.nightEnd ? (h >= cfg.nightStart || h < cfg.nightEnd) : (h >= cfg.nightStart && h < cfg.nightEnd);
    const sun = isSundayOrHoliday(iso(t));
    const extra = i >= ordinaryMin;
    const key = (sun ? 'sun' : '') + (extra ? 'Ext' : 'Ord') + (night ? 'Night' : 'Day');
    b[sun ? key : key.charAt(0).toLowerCase() + key.slice(1)] += 1 / 60;
  }
  return finish(b);
}
function finish(b) { for (const k of Object.keys(b)) b[k] = Math.round(b[k] * 100) / 100; return b; }

/* ---------- Valor hora y liquidación de extras/recargos ---------- */
function hourlyValue(emp, cfg, hoursPerDay) {
  const divisor = Math.round((cfg.weeklyHours / 6) * 30); // 42 h → 210 h/mes
  switch (emp.payMode) {
    case 'monthly': return emp.baseAmount / divisor;
    case 'biweekly': return (emp.baseAmount * 2) / divisor;
    case 'hourly': return emp.baseAmount;
    case 'per_day':
    case 'per_shift':
    default: return emp.baseAmount / (hoursPerDay || 8);
  }
}

/**
 * Calcula extras y recargos del período. Para colaboradores por hora la base ya paga cada hora al 100 %,
 * así que solo se suma el recargo; para los demás, las horas extra se pagan completas (100 % + recargo).
 */
function computeExtras(emp, attendance, cfg, periodEnd) {
  const hoursPerDay = Number(emp.hoursPerDay) > 0 ? Number(emp.hoursPerDay) : cfg.hoursPerDay;
  const total = EMPTY_BUCKETS();
  const days = [];
  for (const a of attendance) {
    const b = classifyAttendance(a, cfg, hoursPerDay);
    for (const k of Object.keys(b)) total[k] += b[k];
    days.push({ date: a.date, hours: Number(a.hours) || 0, ...b, sundayOrHoliday: isSundayOrHoliday(a.date) });
  }
  finish(total);
  const hv = hourlyValue(emp, cfg, hoursPerDay);
  const sundayPct = cfg.sundayPct !== null && cfg.sundayPct !== undefined ? cfg.sundayPct : sundayPctFor(periodEnd);
  const extraIncludesBase = emp.payMode !== 'hourly';
  const baseFactor = extraIncludesBase ? 1 : 0;
  const lines = [];
  const add = (key, label, hours, factor, pct) => {
    if (hours <= 0) return;
    const amount = Math.round(hours * hv * factor);
    lines.push({ key, label, hours, pct, amount });
  };
  add('nightSurcharge', `Recargo nocturno (${cfg.nightPct}%)`, total.ordNight, cfg.nightPct / 100, cfg.nightPct);
  add('sundaySurcharge', `Recargo dominical/festivo (${sundayPct}%)`, total.sunOrdDay, sundayPct / 100, sundayPct);
  add('sundayNightSurcharge', `Recargo nocturno dominical/festivo (${cfg.nightPct + sundayPct}%)`, total.sunOrdNight, (cfg.nightPct + sundayPct) / 100, cfg.nightPct + sundayPct);
  add('extraDay', `Horas extra diurnas (${cfg.extraDayPct}%)`, total.extDay, baseFactor + cfg.extraDayPct / 100, cfg.extraDayPct);
  add('extraNight', `Horas extra nocturnas (${cfg.extraNightPct}%)`, total.extNight, baseFactor + cfg.extraNightPct / 100, cfg.extraNightPct);
  add('extraSundayDay', `Horas extra diurnas dominicales/festivas (${cfg.extraDayPct + sundayPct}%)`, total.sunExtDay, baseFactor + (cfg.extraDayPct + sundayPct) / 100, cfg.extraDayPct + sundayPct);
  add('extraSundayNight', `Horas extra nocturnas dominicales/festivas (${cfg.extraNightPct + sundayPct}%)`, total.sunExtNight, baseFactor + (cfg.extraNightPct + sundayPct) / 100, cfg.extraNightPct + sundayPct);
  const extrasTotal = lines.reduce((a, l) => a + l.amount, 0);
  const summary = {
    ordinary: Math.round((total.ordDay + total.ordNight + total.sunOrdDay + total.sunOrdNight) * 100) / 100,
    extra: Math.round((total.extDay + total.extNight + total.sunExtDay + total.sunExtNight) * 100) / 100,
    night: Math.round((total.ordNight + total.extNight + total.sunOrdNight + total.sunExtNight) * 100) / 100,
    sunday: Math.round((total.sunOrdDay + total.sunOrdNight + total.sunExtDay + total.sunExtNight) * 100) / 100,
    total: Math.round(Object.values(total).reduce((a, v) => a + v, 0) * 100) / 100,
  };
  return { hoursPerDay, hourlyValue: Math.round(hv), sundayPct, buckets: total, hoursSummary: summary, lines, extrasTotal, days };
}

/** Auxilio de transporte proporcional al período (solo hasta 2 SMMLV de sueldo mensual equivalente). */
function computeAllowance(emp, cfg, from, to, attendanceCount) {
  if (!emp.transportAllowance) return { amount: 0, reason: 'no aplica' };
  const monthlyEq = emp.payMode === 'monthly' ? emp.baseAmount : emp.payMode === 'biweekly' ? emp.baseAmount * 2 : null;
  if (monthlyEq !== null && monthlyEq > cfg.smmlv * 2) return { amount: 0, reason: 'sueldo mayor a 2 SMMLV' };
  if (emp.payMode === 'monthly' || emp.payMode === 'biweekly') {
    const days = Math.min(30, Math.round((new Date(to + 'T00:00:00Z') - new Date(from + 'T00:00:00Z')) / 86400000) + 1);
    return { amount: Math.round((cfg.transportAllowance * days) / 30), days, reason: `${days} día(s) del período` };
  }
  return { amount: Math.round((cfg.transportAllowance * attendanceCount) / 30), days: attendanceCount, reason: `${attendanceCount} día(s) trabajados` };
}

function computeLegalDeductions(emp, cfg, salaryBase) {
  if (!emp.legalDeductions || salaryBase <= 0) return { lines: [], total: 0 };
  const lines = [
    { key: 'health', label: `Salud (${cfg.healthPct}%)`, pct: cfg.healthPct, amount: Math.round((salaryBase * cfg.healthPct) / 100) },
    { key: 'pension', label: `Pensión (${cfg.pensionPct}%)`, pct: cfg.pensionPct, amount: Math.round((salaryBase * cfg.pensionPct) / 100) },
  ].filter(l => l.amount > 0);
  return { lines, total: lines.reduce((a, l) => a + l.amount, 0) };
}

module.exports = { DEFAULT_CONFIG, CONFIG_KEYS, readConfig, saveConfig, sundayPctFor, colombianHolidays, isSundayOrHoliday, classifyAttendance, hourlyValue, computeExtras, computeAllowance, computeLegalDeductions };
