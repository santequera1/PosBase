import { useCallback, useState } from 'react';
import type React from 'react';

/**
 * Anchos de columna ajustables (arrastrando el borde del encabezado). Se recuerdan en este equipo.
 * Doble clic en el borde devuelve esa columna a su ancho original.
 */
export function useColumnWidths(storageKey: string, defaults: number[], min = 48) {
  const [widths, setWidths] = useState<number[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (Array.isArray(saved) && saved.length === defaults.length && saved.every(n => typeof n === 'number')) return saved;
    } catch { /* sin almacenamiento */ }
    return defaults;
  });
  const persist = (w: number[]) => { try { localStorage.setItem(storageKey, JSON.stringify(w)); } catch { /* sin almacenamiento */ } };

  const startResize = useCallback((i: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const start = widths[i];
    let last = widths;
    const move = (ev: PointerEvent) => {
      last = widths.map((w, j) => (j === i ? Math.max(min, Math.round(start + ev.clientX - startX)) : w));
      setWidths(last);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      persist(last);
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [widths, min]);

  const resetOne = (i: number) => { const w = widths.map((x, j) => (j === i ? defaults[i] : x)); setWidths(w); persist(w); };
  const resetAll = () => { setWidths(defaults); try { localStorage.removeItem(storageKey); } catch { /* sin almacenamiento */ } };
  const changed = widths.some((w, i) => w !== defaults[i]);
  const total = widths.reduce((a, b) => a + b, 0);
  return { widths, startResize, resetOne, resetAll, changed, total };
}
