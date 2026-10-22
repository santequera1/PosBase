/**
 * Diseño de los recibos (Configuración → Recibos): logo, qué datos del negocio salen y los textos.
 * Lo usan los recibos del navegador (thermalPrint / restaurantPrint) y, en el servidor, la impresión en red (printing.js).
 */
// Sin importar el store (lo importa el store): quien llama pasa el diseño y el logo.

export interface ReceiptDesign {
  showLogo: boolean;
  showSlogan: boolean;
  showNit: boolean;
  showAddress: boolean;
  showPhone: boolean;
  showHours: boolean;
  /** Texto extra debajo del nombre (ej. "Régimen simple · Cartagena"). */
  headerText: string;
  /** Agradecimiento al final; {negocio} se reemplaza por el nombre. */
  thanks: string;
}

export const DEFAULT_RECEIPT_DESIGN: ReceiptDesign = {
  showLogo: true, showSlogan: true, showNit: true, showAddress: true, showPhone: true, showHours: true,
  headerText: '', thanks: '¡Gracias por su visita a {negocio}!',
};

export interface RasterLogo { on?: boolean; w: number; h: number; data: string }

export function parseReceiptDesign(raw: unknown): ReceiptDesign {
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (v && typeof v === 'object') return { ...DEFAULT_RECEIPT_DESIGN, ...(v as any) };
  } catch { /* valor inválido */ }
  return { ...DEFAULT_RECEIPT_DESIGN };
}

export function parseRasterLogo(raw: unknown): RasterLogo | null {
  try {
    const v: any = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return v && v.on && v.w && v.h && v.data ? v : null;
  } catch { return null; }
}

// El logo se guarda como mapa de bits de 1 bit (lo que imprime la térmica); para el navegador se pasa a PNG una sola vez
const pngCache = new Map<string, string>();
export function rasterToPng(r: RasterLogo): string {
  const hit = pngCache.get(r.data);
  if (hit) return hit;
  if (typeof document === 'undefined') return '';
  const c = document.createElement('canvas'); c.width = r.w; c.height = r.h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(r.w, r.h);
  const bin = atob(r.data);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const on = bin.charCodeAt(y * (r.w / 8) + (x >> 3)) & (0x80 >> (x & 7));
    const i = (y * r.w + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = on ? 0 : 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const url = c.toDataURL('image/png');
  pngCache.set(r.data, url);
  return url;
}

/** <img> del logo del recibo con su tamaño real en papel (8 puntos por mm), o '' si no hay o está apagado. */
export function receiptLogoHtml(d: ReceiptDesign, l: RasterLogo | null): string {
  if (!d.showLogo || !l) return '';
  const mm = Math.min(46, l.w / 8);
  return `<div style="text-align:center; margin: 0 0 3px;"><img src="${rasterToPng(l)}" alt="" style="display:block; margin:0 auto; width:${mm}mm; max-width:100%; height:auto; image-rendering: pixelated;"></div>`;
}

export const thanksText = (d: ReceiptDesign, name: string) => (d.thanks || '').replace(/\{negocio\}/gi, name).trim();
