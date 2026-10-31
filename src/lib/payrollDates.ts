/**
 * Cortes de nómina: el 15 y el 30 de cada mes (o el último día si el mes tiene menos, como febrero). Una cuota de
 * préstamo "cada quincena" se descuenta en cada corte; una "cada mes" solo en el corte del 30.
 */
const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate(); // m: 1-12
const endCut = (y: number, m: number) => `${y}-${pad(m)}-${pad(Math.min(30, lastDay(y, m)))}`;

/** Corte del período en curso para una fecha: hasta el 15 → el 15; después → el 30 (o fin de mes). */
export function currentCut(dateStr: string, monthly = false): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!monthly && d <= 15) return `${y}-${pad(m)}-15`;
  return endCut(y, m);
}

/** El corte que sigue a uno dado. */
export function nextCut(cut: string, monthly = false): string {
  const [y, m, d] = cut.split('-').map(Number);
  if (!monthly && d <= 15) return endCut(y, m);
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  return monthly ? endCut(ny, nm) : `${ny}-${pad(nm)}-15`;
}

/**
 * Próximos `count` cortes en los que se descontaría una cuota, empezando por el corte del período en curso (la
 * liquidación que aún no se ha hecho). Si se sabe hasta qué fecha ya se pagó, se salta lo anterior a esa fecha.
 */
export function upcomingCuts(todayStr: string, count: number, monthly = false, paidUntil?: string): string[] {
  let cut = currentCut(todayStr, monthly);
  while (paidUntil && cut <= paidUntil) cut = nextCut(cut, monthly);
  const out: string[] = [];
  for (let i = 0; i < count && i < 500; i++) { out.push(cut); cut = nextCut(cut, monthly); }
  return out;
}
