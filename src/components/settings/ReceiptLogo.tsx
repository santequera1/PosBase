import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Upload, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import { Chip } from '@/components/common/Primitives';

export interface RasterLogo { w: number; h: number; data: string }

const SIZES: Array<[number, string]> = [[192, 'Pequeño'], [256, 'Mediano'], [320, 'Grande']];

/**
 * Convierte una imagen a mapa de bits de 1 bit (negro / blanco) del ancho en puntos de la impresora térmica.
 * Lo transparente cuenta como blanco. Cada fila ocupa ancho/8 bytes; el bit más alto es el punto de la izquierda.
 */
export function imageToRaster(img: HTMLImageElement, width: number, threshold = 150): RasterLogo {
  const w = Math.max(8, Math.round(width / 8) * 8);
  const h = Math.max(1, Math.min(600, Math.round((img.naturalHeight / img.naturalWidth) * w)));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const bytes = new Uint8Array((w / 8) * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      if (lum < threshold) bytes[y * (w / 8) + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return { w, h, data: btoa(bin) };
}

/** Dibuja el mapa de bits tal como lo imprimiría la térmica. */
function drawRaster(canvas: HTMLCanvasElement, r: RasterLogo) {
  canvas.width = r.w; canvas.height = r.h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(r.w, r.h);
  const bin = atob(r.data);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const on = bin.charCodeAt(y * (r.w / 8) + (x >> 3)) & (0x80 >> (x & 7));
    const i = (y * r.w + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = on ? 0 : 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

const loadImage = (src: string) => new Promise<HTMLImageElement>((ok, fail) => {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => ok(img);
  img.onerror = () => fail(new Error('No se pudo leer la imagen'));
  img.src = src;
});

/** Configuración → Impresoras: logo que sale arriba en precuentas y recibos impresos por red. */
export const ReceiptLogoSection = ({ logo, onSaved }: { logo: (RasterLogo & { on: boolean }) | null; onSaved: () => void }) => {
  const branding = useStore(s => s.branding);
  const [src, setSrc] = useState<string>('');
  const [width, setWidth] = useState<number>(logo?.w || 256);
  const [preview, setPreview] = useState<RasterLogo | null>(logo && logo.on ? logo : null);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (preview && canvasRef.current) drawRaster(canvasRef.current, preview); }, [preview]);
  useEffect(() => {
    if (!src) return;
    loadImage(src).then(img => setPreview(imageToRaster(img, width))).catch(e => toast.error(e.message));
  }, [src, width]);

  const pickFile = (f?: File | null) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setSrc(String(reader.result));
    reader.readAsDataURL(f);
  };
  const brandLogo = (branding as any)?.logoLoginUrl || (branding as any)?.logoUrl || '';
  const save = async () => {
    if (!preview) return;
    setBusy(true);
    try { await api.saveReceiptLogo({ on: true, ...preview }); toast.success('Logo guardado: saldrá en precuentas y recibos'); onSaved(); }
    catch (e: any) { toast.error(e.message); }
    setBusy(false);
  };
  const remove = async () => {
    setBusy(true);
    try { await api.saveReceiptLogo({ on: false }); setPreview(null); setSrc(''); toast.success('Logo quitado de los recibos'); onSaved(); }
    catch (e: any) { toast.error(e.message); }
    setBusy(false);
  };

  return (
    <section className="bg-card rounded-xl border border-border p-4 shadow-card space-y-3" data-receipt-logo>
      <h3 className="font-bold text-sm text-brand-dark flex items-center gap-1.5"><ImageIcon size={15} /> Logo en precuentas y recibos</h3>
      <p className="text-xs text-muted-foreground">Usa un logo <b>negro sobre fondo blanco o transparente</b> (PNG). La impresora térmica solo imprime negro: aquí ves cómo quedará.</p>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden" onChange={e => pickFile(e.target.files?.[0])} data-logo-file />
        <button onClick={() => fileRef.current?.click()} className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold flex items-center gap-1.5"><Upload size={13} /> Elegir imagen</button>
        {brandLogo && <button onClick={() => setSrc(brandLogo)} className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold">Usar el logo de la marca</button>}
        <span className="text-xs text-muted-foreground ml-1">Tamaño:</span>
        {SIZES.map(([w, l]) => <Chip key={w} active={width === w} onClick={() => setWidth(w)}>{l}</Chip>)}
      </div>
      {preview ? (
        <div className="flex flex-col items-center gap-2">
          <div className="bg-white border border-dashed border-border rounded-lg p-3 w-full max-w-[300px] flex justify-center">
            <canvas ref={canvasRef} className="max-w-full h-auto" style={{ width: Math.min(220, preview.w * 0.55), imageRendering: 'pixelated' }} />
          </div>
          <p className="text-[11px] text-muted-foreground">{Math.round(preview.w / 8)} mm de ancho aprox. en el papel</p>
        </div>
      ) : <p className="text-xs text-muted-foreground">Sin logo: los recibos empiezan con el nombre del negocio.</p>}
      <div className="flex gap-2">
        {src && preview && <button onClick={save} disabled={busy} className="px-4 py-2 rounded-xl gradient-primary text-primary-foreground text-xs font-bold disabled:opacity-40" data-logo-save>Guardar logo</button>}
        {logo?.on && <button onClick={remove} disabled={busy} className={cn('px-3 py-2 rounded-xl border border-border text-xs font-semibold flex items-center gap-1 text-red-700')}><Trash2 size={12} /> Quitar logo</button>}
      </div>
    </section>
  );
};
