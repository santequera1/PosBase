/** Descarga un CSV listo para Excel en español (BOM UTF-8 y separador ;). */
export function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>): void {
  const esc = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [headers.map(esc).join(';'), ...rows.map(r => r.map(esc).join(';'))];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const csvDate = (d?: string | null) => {
  if (!d) return '';
  const [y, m, day] = d.slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
};
