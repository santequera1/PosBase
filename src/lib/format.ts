// Colombia timezone helper: returns current date string in YYYY-MM-DD format for UTC-5
export function getColombiaNow(): Date {
  // Use Intl to get the actual Colombia time reliably
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const get = (type: string) => parts.find(p => p.type === type)?.value || '0';
  return new Date(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`);
}

export function getColombiaTodayStr(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return formatter.format(new Date());
}

export function getColombiaYesterdayStr(): string {
  const yesterday = new Date(Date.now() - 86400000);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return formatter.format(yesterday);
}

// Extract date part from a createdAt string (handles both "YYYY-MM-DD HH:MM:SS" and ISO format)
export function getOrderDateStr(createdAt: string): string {
  return (createdAt || '').split('T')[0].split(' ')[0];
}

// Pluralization helper
export const plural = (count: number, singular: string, pluralForm?: string): string => {
  return count === 1 ? `${count} ${singular}` : `${count} ${pluralForm || singular + 's'}`;
};

export const formatPrice = (price: number): string => {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(price);
};

export const formatTime = (dateStr: string): string => {
  // Parse the date and display in Colombia time
  const date = new Date(dateStr);
  return date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' });
};

export const formatDate = (dateStr: string): string => {
  const orderDateStr = getOrderDateStr(dateStr);
  const todayStr = getColombiaTodayStr();
  const yesterdayStr = getColombiaYesterdayStr();
  if (orderDateStr === todayStr) return 'Hoy';
  if (orderDateStr === yesterdayStr) return 'Ayer';
  const diff = Math.floor((new Date(todayStr).getTime() - new Date(orderDateStr).getTime()) / 86400000);
  return `Hace ${diff}d`;
};

export const formatFullDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};
