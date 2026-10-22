import { useEffect, useRef, useState } from 'react';
import { Check, ExternalLink, LogIn, Trash2, Upload, ImageIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { fileToDataUrl } from '@/lib/theme';
import { cn } from '@/lib/utils';

/** Reduce la foto (máx. 1800 px, WebP) para que la pantalla de acceso cargue rápido. */
async function compressPhoto(file: File): Promise<string> {
  const src = await fileToDataUrl(file);
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('No se pudo leer la foto')); i.src = src; });
  const k = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  const out = c.toDataURL('image/webp', 0.82);
  return out.startsWith('data:image/webp') ? out : c.toDataURL('image/jpeg', 0.85);
}

const INPUT = 'w-full px-3 py-2 rounded-lg border border-input bg-card text-sm font-sans outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50';

/** Configuración → Marca → Pantalla de acceso: textos (editables u ocultos) y foto opcional al lado. */
const LoginScreenPanel = () => {
  const branding = useStore(s => s.branding);
  const businessName = useStore(s => s.businessName);
  const setBranding = useStore(s => s.setBranding);
  const [title, setTitle] = useState(branding.loginTitle);
  const [subtitle, setSubtitle] = useState(branding.loginSubtitle);
  const [showTitle, setShowTitle] = useState(branding.loginShowTitle);
  const [showSubtitle, setShowSubtitle] = useState(branding.loginShowSubtitle);
  const [busy, setBusy] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const photoRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setTitle(branding.loginTitle); setSubtitle(branding.loginSubtitle);
    setShowTitle(branding.loginShowTitle); setShowSubtitle(branding.loginShowSubtitle);
  }, [branding.loginTitle, branding.loginSubtitle, branding.loginShowTitle, branding.loginShowSubtitle]);

  const dirty = title !== branding.loginTitle || subtitle !== branding.loginSubtitle || showTitle !== branding.loginShowTitle || showSubtitle !== branding.loginShowSubtitle;

  const save = async () => {
    setBusy('texts'); setError('');
    try {
      await api.updateSettings({ loginTitle: title.trim(), loginSubtitle: subtitle.trim(), loginShowTitle: showTitle ? '1' : '0', loginShowSubtitle: showSubtitle ? '1' : '0' });
      setBranding({ loginTitle: title.trim(), loginSubtitle: subtitle.trim(), loginShowTitle: showTitle, loginShowSubtitle: showSubtitle });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e: any) { setError(e.message || 'No se pudo guardar'); }
    setBusy('');
  };

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy('photo'); setError('');
    try {
      const data = await compressPhoto(file);
      const r = await api.uploadBrandingImage('loginImage', file.name.replace(/\.[^.]+$/, '') + (data.startsWith('data:image/webp') ? '.webp' : '.jpg'), data);
      setBranding({ loginImageUrl: r.url });
    } catch (e: any) { setError(e.message || 'No se pudo subir la foto'); }
    setBusy('');
  };
  const setFocus = async (k: string) => {
    try { await api.updateSettings({ loginImageFocus: k }); setBranding({ loginImageFocus: k }); } catch (e: any) { setError(e.message); }
  };
  const removePhoto = async () => {
    try { await api.removeBrandingImage('loginImage'); setBranding({ loginImageUrl: '' }); } catch (e: any) { setError(e.message); }
  };
  const Toggle = ({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) => (
    <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer shrink-0">
      <input type="checkbox" checked={on} onChange={e => set(e.target.checked)} /> {label}
    </label>
  );

  return (
    <section className="bg-card rounded-xl border border-border p-4 shadow-card space-y-4" data-login-settings>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-bold text-sm flex items-center gap-1.5"><LogIn size={15} /> Pantalla de acceso</h3>
          <p className="text-xs text-muted-foreground">Lo que se ve antes de iniciar sesión. Usa el logo de "Inicio de sesión" y, al lado (en computador), la foto o el logo grande.</p>
        </div>
        <a href="/login" target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand-primary flex items-center gap-1 hover:underline"><ExternalLink size={13} /> Ver cómo queda</a>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-medium text-muted-foreground">Título (arriba de "Iniciar sesión")</label>
            <Toggle on={showTitle} set={setShowTitle} label="Mostrar" />
          </div>
          <input value={title} onChange={e => setTitle(e.target.value)} disabled={!showTitle} placeholder={businessName} maxLength={60} className={INPUT} data-login-title-input />
          <p className="text-[10px] text-muted-foreground">Vacío = el nombre del negocio.</p>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-medium text-muted-foreground">Descripción (debajo)</label>
            <Toggle on={showSubtitle} set={setShowSubtitle} label="Mostrar" />
          </div>
          <input value={subtitle} onChange={e => setSubtitle(e.target.value)} disabled={!showSubtitle} placeholder="Sistema Punto de Venta POS" maxLength={120} className={INPUT} data-login-subtitle-input />
          <p className="text-[10px] text-muted-foreground">Vacío = "Sistema Punto de Venta POS".</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={!dirty || busy === 'texts'} data-login-save
          className="px-4 py-2 rounded-lg bg-brand-button text-brand-on-button text-xs font-semibold disabled:opacity-40 flex items-center gap-1.5">
          {saved ? <><Check size={13} /> Guardado</> : busy === 'texts' ? 'Guardando...' : 'Guardar textos'}
        </button>
      </div>

      <div className="rounded-lg border border-dashed border-border p-3 flex flex-wrap items-center gap-3" data-login-photo>
        {branding.loginImageUrl ? <img src={branding.loginImageUrl} alt="" className="w-10 h-10 rounded-lg object-cover" /> : <span className="w-10 h-10 rounded-lg flex items-center justify-center bg-muted/40 text-muted-foreground"><ImageIcon size={18} /></span>}
        <div className="flex-1 min-w-[180px]">
          <p className="text-xs font-semibold text-brand-dark">Foto al lado (opcional)</p>
          <p className="text-[11px] text-muted-foreground">Llena el panel derecho en computador (en celular solo se ve el formulario). Se comprime sola al subirla.</p>
        </div>
        <input ref={photoRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} data-login-photo-input />
        <button type="button" disabled={busy === 'photo'} onClick={() => photoRef.current?.click()} className="px-3 py-2 rounded-lg bg-brand-button text-brand-on-button text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50">
          <Upload size={13} /> {busy === 'photo' ? 'Subiendo...' : branding.loginImageUrl ? 'Cambiar' : 'Subir foto'}
        </button>
        {branding.loginImageUrl && (
          <span className="flex rounded-lg border border-border overflow-hidden" title="Qué parte de la foto se ve">
            {([['left', 'Izq.'], ['center', 'Centro'], ['right', 'Der.']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setFocus(k)} data-focus={k}
                className={cn('px-2 py-2 text-[11px] font-semibold', branding.loginImageFocus === k ? 'bg-brand-button text-brand-on-button' : 'text-brand-dark hover:bg-brand-card')}>{l}</button>
            ))}
          </span>
        )}
        {branding.loginImageUrl && <button type="button" onClick={removePhoto} title="Quitar la foto" className="px-3 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-red-600"><Trash2 size={13} /></button>}
      </div>

      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
    </section>
  );
};

export default LoginScreenPanel;
