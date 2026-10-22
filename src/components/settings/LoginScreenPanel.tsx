import { useEffect, useRef, useState } from 'react';
import { Check, ExternalLink, LogIn, Trash2, Upload, Box } from 'lucide-react';
import { api } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { fileToDataUrl } from '@/lib/theme';
import { cn } from '@/lib/utils';

const INPUT = 'w-full px-3 py-2 rounded-lg border border-input bg-card text-sm font-sans outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50';

/** Configuración → Marca → Pantalla de acceso: textos (editables u ocultos) y modelo 3D opcional que gira al lado. */
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
  const fileRef = useRef<HTMLInputElement>(null);
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

  const onModel = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.glb$/i.test(file.name)) { setError('El modelo debe ser un archivo .glb (expórtalo desde Blender como glTF binario)'); return; }
    if (file.size > 15 * 1024 * 1024) { setError('El modelo supera 15 MB'); return; }
    setBusy('model'); setError('');
    try {
      const r = await api.uploadBrandingImage('loginModel', file.name, await fileToDataUrl(file));
      setBranding({ loginModelUrl: r.url });
    } catch (e: any) { setError(e.message || 'No se pudo subir el modelo'); }
    setBusy('');
  };
  const removeModel = async () => {
    try { await api.removeBrandingImage('loginModel'); setBranding({ loginModelUrl: '' }); } catch (e: any) { setError(e.message); }
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
          <p className="text-xs text-muted-foreground">Lo que se ve antes de iniciar sesión. Usa el logo de "Inicio de sesión" y, al lado, el modelo 3D o el logo grande.</p>
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

      <div className="rounded-lg border border-dashed border-border p-3 flex flex-wrap items-center gap-3">
        <span className={cn('w-10 h-10 rounded-lg flex items-center justify-center', branding.loginModelUrl ? 'bg-brand-button text-brand-on-button' : 'bg-muted/40 text-muted-foreground')}><Box size={18} /></span>
        <div className="flex-1 min-w-[180px]">
          <p className="text-xs font-semibold text-brand-dark">Modelo 3D (opcional)</p>
          <p className="text-[11px] text-muted-foreground">{branding.loginModelUrl ? 'Gira suavemente al lado del formulario (en celular, arriba).' : 'Archivo .glb de hasta 15 MB (Blender → Exportar → glTF binario). Sin modelo se muestra el logo.'}</p>
        </div>
        <input ref={fileRef} type="file" accept=".glb,model/gltf-binary" className="hidden" onChange={e => { onModel(e.target.files?.[0]); e.target.value = ''; }} data-login-model-input />
        <button type="button" disabled={busy === 'model'} onClick={() => fileRef.current?.click()} className="px-3 py-2 rounded-lg bg-brand-button text-brand-on-button text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50">
          <Upload size={13} /> {busy === 'model' ? 'Subiendo...' : branding.loginModelUrl ? 'Cambiar' : 'Subir modelo'}
        </button>
        {branding.loginModelUrl && <button type="button" onClick={removeModel} title="Quitar el modelo" className="px-3 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-red-600"><Trash2 size={13} /></button>}
      </div>
      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
    </section>
  );
};

export default LoginScreenPanel;
