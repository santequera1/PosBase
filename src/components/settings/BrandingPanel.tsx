import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Upload, Trash2, Wand2, AlertTriangle, CheckCircle2, RefreshCw, Type, Palette, ImageIcon, Sun, Moon, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import {
  DEFAULT_THEME, BASE_THEME, THEME_PRESETS, FONT_PAIRINGS,
  type ThemeInput, type ThemeMode,
  resolveTheme, applyTheme, autoFixTheme, contrastChecks, normalizeHex,
  loadGoogleFont, generateIconFromImage, fileToDataUrl, hexToHsl,
} from '@/lib/theme';
import { FontPicker } from '@/components/settings/FontPicker';

const INPUT = 'w-full px-3 py-2 rounded-lg border border-input bg-card text-sm font-sans outline-none focus:ring-2 focus:ring-primary/20';

/* ---------- Campo de color (selector + hex) ---------- */
const ColorField = ({ label, hint, value, onChange, auto, onAutoChange }: {
  label: string; hint?: string; value: string; onChange: (v: string) => void;
  auto?: boolean; onAutoChange?: (auto: boolean) => void;
}) => {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = (v: string) => { const n = normalizeHex(v, ''); if (n) onChange(n); };
  return (
    <div className={cn('space-y-1', auto && 'opacity-60')}>
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        {onAutoChange && (
          <label className="text-[10px] text-muted-foreground flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={!!auto} onChange={e => onAutoChange(e.target.checked)} /> Automático
          </label>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input type="color" value={value} disabled={auto} onChange={e => onChange(e.target.value.toUpperCase())}
          className="w-11 h-10 rounded-lg border border-input cursor-pointer bg-transparent p-0.5 disabled:cursor-not-allowed" />
        <input value={text} disabled={auto} onChange={e => setText(e.target.value)} onBlur={() => commit(text)}
          onKeyDown={e => e.key === 'Enter' && commit(text)} className={cn(INPUT, 'font-mono uppercase')} maxLength={7} />
      </div>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
};

/* ---------- Vista previa en miniatura ---------- */
const ThemePreview = ({ theme }: { theme: ThemeInput }) => {
  const t = useMemo(() => resolveTheme(theme), [theme]);
  return (
    <div className="rounded-xl overflow-hidden border border-border shadow-card flex h-56" style={{ background: t.background, fontFamily: `"${t.fontBody}", system-ui, sans-serif` }}>
      <div className="w-24 shrink-0 p-3 space-y-2" style={{ background: t.surface, color: t.onDark }}>
        <div className="h-6 rounded-md mb-3 flex items-center justify-center text-[9px] font-bold" style={{ background: t.accent, color: t.onAccent }}>LOGO</div>
        {['Venta', 'Caja', 'Reportes', 'Ajustes'].map((it, i) => (
          <div key={it} className="text-[10px] px-2 py-1 rounded-md" style={i === 0 ? { background: `${t.accent}33`, color: t.accent, fontWeight: 700 } : { opacity: 0.85 }}>{it}</div>
        ))}
      </div>
      <div className="flex-1 p-3 space-y-2 overflow-hidden">
        <p className="text-sm font-bold leading-tight" style={{ color: t.dark, fontFamily: `"${t.fontHeading}", Georgia, serif` }}>Punto de Venta</p>
        <p className="text-[10px]" style={{ color: t.muted }}>Texto secundario y descripciones</p>
        <div className="rounded-lg p-2 space-y-1 border" style={{ background: t.card, borderColor: `${t.primary}33` }}>
          <p className="text-[11px] font-semibold" style={{ color: t.dark }}>Vaso 4 oz · Pistacho</p>
          <p className="text-[10px]" style={{ color: t.muted }}>1 sabor · <span style={{ color: t.primary }}>ver detalle</span></p>
          <span className="inline-block text-[9px] px-2 py-0.5 rounded-full font-semibold" style={{ background: t.pill, color: t.dark }}>$ 15.000</span>
        </div>
        <div className="flex gap-2">
          <button className="text-[10px] px-3 py-1.5 rounded-lg font-bold" style={{ background: t.button, color: t.onButton }}>Cobrar</button>
          <button className="text-[10px] px-3 py-1.5 rounded-lg font-bold" style={{ background: t.accent, color: t.onAccent }}>Imprimir</button>
          <button className="text-[10px] px-3 py-1.5 rounded-lg font-bold" style={{ background: t.wine, color: '#fff' }}>Anular</button>
        </div>
        <p className="text-base leading-none" style={{ color: t.primary, fontFamily: `"${t.fontScript}", cursive` }}>Gracias por su visita</p>
      </div>
    </div>
  );
};

/* ---------- Panel principal ---------- */
const BrandingPanel = () => {
  const branding = useStore(s => s.branding);
  const businessName = useStore(s => s.businessName);
  const setBranding = useStore(s => s.setBranding);

  const savedTheme = useMemo<ThemeInput>(() => ({ ...BASE_THEME, ...(branding.theme || {}) }), [branding.theme]);
  const [theme, setTheme] = useState<ThemeInput>(savedTheme);
  const [advanced, setAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string>('');
  const [fontFamilyName, setFontFamilyName] = useState('');
  const [faviconBg, setFaviconBg] = useState<'transparent' | 'dark'>('dark');
  const fontFileRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const logoLightRef = useRef<HTMLInputElement>(null);
  const faviconRef = useRef<HTMLInputElement>(null);

  const resolved = useMemo(() => resolveTheme(theme), [theme]);
  const checks = useMemo(() => contrastChecks(resolved), [resolved]);
  const allOk = checks.every(c => c.ok);
  const dirty = JSON.stringify(theme) !== JSON.stringify(savedTheme);
  const mode: ThemeMode = theme.mode === 'dark' ? 'dark' : 'light';

  // Vista previa en vivo en toda la interfaz; al salir sin guardar se restaura el tema guardado.
  useEffect(() => { applyTheme(resolved, branding.customFonts); }, [resolved, branding.customFonts]);
  useEffect(() => () => { useStore.getState().setBranding({}); }, []);
  useEffect(() => { setTheme(savedTheme); }, [savedTheme]);
  useEffect(() => { FONT_PAIRINGS.forEach(p => { loadGoogleFont(p.heading); loadGoogleFont(p.body); }); }, []);

  const update = (patch: Partial<ThemeInput>) => setTheme(t => ({ ...t, ...patch }));

  const saveTheme = async () => {
    setSaving(true);
    setError('');
    try {
      const clean: ThemeInput = { ...theme, mode };
      if (!advanced) { delete clean.dark; delete clean.card; delete clean.muted; }
      const r = await api.saveTheme(clean);
      setBranding({ theme: r.theme });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError(e.message || 'No se pudo guardar el tema');
    }
    setSaving(false);
  };

  const uploadImage = async (kind: 'logo' | 'logoLogin' | 'favicon' | 'appleIcon', file: File) => {
    const data = await fileToDataUrl(file);
    const r = await api.uploadBrandingImage(kind, file.name, data);
    return { url: r.url, data };
  };

  const onLogoFile = async (file: File | undefined, kind: 'logo' | 'logoLogin') => {
    if (!file) return;
    setBusy(kind);
    setError('');
    try {
      const { url, data } = await uploadImage(kind, file);
      const patch: any = { [kind === 'logo' ? 'logoUrl' : 'logoLoginUrl']: url };
      if (kind === 'logo') {
        const bg = faviconBg === 'dark' ? resolved.surface : undefined;
        const fav = await generateIconFromImage(data, 64, bg);
        const apple = await generateIconFromImage(data, 180, resolved.surface);
        const favR = await api.uploadBrandingImage('favicon', 'favicon.png', fav);
        const appleR = await api.uploadBrandingImage('appleIcon', 'apple-icon.png', apple);
        patch.faviconUrl = favR.url;
        patch.appleIconUrl = appleR.url;
      }
      setBranding(patch);
    } catch (e: any) {
      setError(e.message || 'No se pudo subir la imagen');
    }
    setBusy('');
  };

  const regenerateFavicon = async () => {
    const src = branding.logoUrl;
    if (!src) { setError('Primero sube el logo principal'); return; }
    setBusy('favicon');
    setError('');
    try {
      const bg = faviconBg === 'dark' ? resolved.surface : undefined;
      const fav = await generateIconFromImage(src, 64, bg);
      const apple = await generateIconFromImage(src, 180, resolved.surface);
      const favR = await api.uploadBrandingImage('favicon', 'favicon.png', fav);
      const appleR = await api.uploadBrandingImage('appleIcon', 'apple-icon.png', apple);
      setBranding({ faviconUrl: favR.url, appleIconUrl: appleR.url });
    } catch (e: any) {
      setError(e.message || 'No se pudo generar el favicon');
    }
    setBusy('');
  };

  const onFaviconFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy('favicon');
    try {
      const data = await fileToDataUrl(file);
      const fav = await generateIconFromImage(data, 64);
      const apple = await generateIconFromImage(data, 180);
      const favR = await api.uploadBrandingImage('favicon', 'favicon.png', fav);
      const appleR = await api.uploadBrandingImage('appleIcon', 'apple-icon.png', apple);
      setBranding({ faviconUrl: favR.url, appleIconUrl: appleR.url });
    } catch (e: any) {
      setError(e.message || 'No se pudo subir el favicon');
    }
    setBusy('');
  };

  const removeImage = async (kind: 'logo' | 'logoLogin' | 'favicon') => {
    try {
      await api.removeBrandingImage(kind);
      if (kind === 'favicon') { await api.removeBrandingImage('appleIcon'); setBranding({ faviconUrl: '', appleIconUrl: '' }); }
      else setBranding({ [kind === 'logo' ? 'logoUrl' : 'logoLoginUrl']: '' } as any);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const onFontFile = async (file: File | undefined) => {
    if (!file) return;
    const family = fontFamilyName.trim() || file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
    setBusy('font');
    setError('');
    try {
      const data = await fileToDataUrl(file);
      const r = await api.uploadFont(family, file.name, data);
      setBranding({ customFonts: r.customFonts });
      setFontFamilyName('');
      update({ fontHeading: r.font.family });
    } catch (e: any) {
      setError(e.message || 'No se pudo subir la fuente');
    }
    setBusy('');
  };

  const deleteFont = async (family: string) => {
    try {
      const r = await api.deleteFont(family);
      setBranding({ customFonts: r.customFonts });
    } catch (e: any) {
      setError(e.message);
    }
  };

  const primaryDark = hexToHsl(theme.primary).l <= 42;
  const bgLight = hexToHsl(theme.background).l >= 84;
  const currentPairing = FONT_PAIRINGS.find(p => p.heading === theme.fontHeading && p.body === theme.fontBody);
  const presets = THEME_PRESETS.filter(p => (p.theme.mode || 'light') === mode);

  return (
    <div className="space-y-4 font-sans">
      {/* ---------- Colores ---------- */}
      <section className="bg-card rounded-xl border border-border p-4 shadow-card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-sm flex items-center gap-1.5"><Palette size={15} /> Colores de la marca</h3>
            <p className="text-xs text-muted-foreground">Elige el modo y 2 o 3 colores. El sistema deriva el resto y verifica que todos los textos se lean bien.</p>
          </div>
          <div className="flex rounded-xl border border-border bg-brand-card p-0.5">
            {([['light', 'Claro', Sun], ['dark', 'Oscuro', Moon]] as Array<[ThemeMode, string, any]>).map(([m, label, Icon]) => (
              <button key={m} type="button" onClick={() => update({ mode: m })}
                className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all', mode === m ? 'bg-brand-button text-brand-on-button shadow-card' : 'text-brand-dark hover:bg-card')}>
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {presets.map(p => {
            const pt = resolveTheme(p.theme);
            const active = p.theme.primary === theme.primary && p.theme.accent === theme.accent && (p.theme.background === theme.background || mode === 'dark');
            return (
              <button key={p.name} type="button" onClick={() => update({ primary: p.theme.primary, accent: p.theme.accent, background: p.theme.background, mode: p.theme.mode || 'light', dark: undefined, card: undefined, muted: undefined })}
                className={cn('rounded-lg border p-2 text-left transition-all hover:shadow-card', active ? 'border-brand-primary ring-2 ring-brand-primary/20' : 'border-border')}>
                <div className="flex gap-1 mb-1.5">
                  {[pt.surface, pt.button, pt.accent, pt.background].map((c, i) => <span key={i} className="w-5 h-5 rounded-full border border-black/10" style={{ background: c }} />)}
                </div>
                <p className="text-xs font-semibold text-brand-dark">{p.name}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{p.description}</p>
              </button>
            );
          })}
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <ColorField label="Color principal" hint={mode === 'dark' ? 'Define el tono de fondos, botones y textos del modo oscuro' : 'Botones, títulos y barra lateral (siempre oscuro)'} value={theme.primary} onChange={v => update({ primary: v })} />
          <ColorField label="Color de acento" hint="Detalles, resaltados y botón secundario" value={theme.accent} onChange={v => update({ accent: v })} />
          {mode === 'light' ? (
            <ColorField label="Fondo" hint="Fondo general de la app (siempre claro)" value={theme.background} onChange={v => update({ background: v })} />
          ) : (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Fondo (modo oscuro)</label>
              <div className="flex items-center gap-2">
                <span className="w-11 h-10 rounded-lg border border-input" style={{ background: resolved.background }} />
                <div className="text-[11px] text-muted-foreground leading-tight">Se deriva del tono del color principal para que todo combine. Afínalo en ajustes avanzados.</div>
              </div>
            </div>
          )}
        </div>

        {mode === 'light' && (!bgLight || !primaryDark) && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-1.5">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span>{!bgLight && 'El fondo elegido es oscuro; se aclarará automáticamente. '}{!primaryDark && 'El color principal es muy claro; se oscurecerá automáticamente. '}Así se garantiza que la interfaz siga siendo legible.</span>
          </p>
        )}

        <button type="button" onClick={() => setAdvanced(a => !a)} className="text-xs text-brand-primary font-semibold hover:underline">
          {advanced ? 'Ocultar ajustes avanzados' : 'Ajustes avanzados (barra lateral, tarjetas, texto secundario)'}
        </button>
        {advanced && (
          <div className="grid sm:grid-cols-3 gap-3">
            <ColorField label="Barra lateral y encabezados" hint="Superficies oscuras" value={theme.dark || resolved.surface}
              auto={!theme.dark} onAutoChange={a => update({ dark: a ? undefined : resolved.surface })} onChange={v => update({ dark: v })} />
            <ColorField label="Tarjetas" hint="Fondo de tarjetas y paneles" value={theme.card || resolved.card}
              auto={!theme.card} onAutoChange={a => update({ card: a ? undefined : resolved.card })} onChange={v => update({ card: v })} />
            <ColorField label="Texto secundario" hint="Descripciones y ayudas" value={theme.muted || resolved.muted}
              auto={!theme.muted} onAutoChange={a => update({ muted: a ? undefined : resolved.muted })} onChange={v => update({ muted: v })} />
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Vista previa</p>
            <ThemePreview theme={theme} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Verificación de legibilidad</p>
              {!allOk && (
                <button type="button" onClick={() => setTheme(autoFixTheme(theme))} className="text-xs font-semibold text-brand-primary flex items-center gap-1 hover:underline">
                  <Wand2 size={13} /> Ajustar automáticamente
                </button>
              )}
            </div>
            <ul className="space-y-1">
              {checks.map(c => (
                <li key={c.label} className={cn('flex items-center gap-2 text-[11px] px-2.5 py-1.5 rounded-lg border', c.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700')}>
                  {c.ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                  <span className="flex-1">{c.label}</span>
                  <span className="flex items-center gap-1">
                    <span className="w-4 h-4 rounded border border-black/10 flex items-center justify-center text-[9px] font-bold" style={{ background: c.bg, color: c.fg }}>A</span>
                    <span className="font-mono">{c.ratio.toFixed(1)}:1</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-muted-foreground">Mínimo recomendado 4.5:1 para texto normal (WCAG AA) y 3:1 para íconos y texto grande. Cada persona puede además alternar claro/oscuro desde el ícono del encabezado, solo para su pantalla.</p>
          </div>
        </div>
      </section>

      {/* ---------- Tipografía ---------- */}
      <section className="bg-card rounded-xl border border-border p-4 shadow-card space-y-4">
        <div>
          <h3 className="font-bold text-sm flex items-center gap-1.5"><Type size={15} /> Tipografía</h3>
          <p className="text-xs text-muted-foreground">Elige una combinación recomendada o arma la tuya con el buscador. Las fuentes de Google se descargan la primera vez.</p>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1"><Sparkles size={12} /> Combinaciones recomendadas</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {FONT_PAIRINGS.map(p => {
              const active = currentPairing?.name === p.name;
              return (
                <button key={p.name} type="button" onClick={() => update({ fontHeading: p.heading, fontBody: p.body, fontScript: p.script })}
                  className={cn('flex items-center justify-between gap-3 p-3 rounded-xl border text-left transition-all hover:shadow-card', active ? 'border-brand-primary bg-brand-button/5 ring-2 ring-brand-primary/20' : 'border-border')}>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-bold text-brand-dark" style={{ fontFamily: `"${p.heading}", Georgia, serif` }}>{p.name}{active && <Check size={13} className="text-brand-primary" />}{active && <span className="text-[10px] font-sans font-normal text-muted-foreground">(actual)</span>}</span>
                    <span className="block text-[11px] text-muted-foreground leading-snug" style={{ fontFamily: `"${p.body}", system-ui, sans-serif` }}>{p.description}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-2xl leading-none text-brand-dark" style={{ fontFamily: `"${p.heading}", Georgia, serif` }}>Aa</span>
                    <span className="block text-[11px] text-muted-foreground" style={{ fontFamily: `"${p.body}", system-ui, sans-serif` }}>Texto</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <FontPicker label="Títulos" value={theme.fontHeading || DEFAULT_THEME.fontHeading} onChange={v => update({ fontHeading: v })} customFonts={branding.customFonts} sample={businessName} />
          <FontPicker label="Texto general" value={theme.fontBody || DEFAULT_THEME.fontBody} onChange={v => update({ fontBody: v })} customFonts={branding.customFonts} sample="Vaso 4 oz · $15.000" />
          <FontPicker label="Decorativa (recibos y detalles)" value={theme.fontScript || DEFAULT_THEME.fontScript} onChange={v => update({ fontScript: v })} customFonts={branding.customFonts} sample="Gracias por su visita" size={22} />
        </div>

        <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
          <p className="text-xs font-semibold text-brand-dark">Subir una fuente propia (TTF, OTF, WOFF, WOFF2)</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input value={fontFamilyName} onChange={e => setFontFamilyName(e.target.value)} placeholder="Nombre de la fuente (ej: Lapture Display)" className={INPUT} />
            <input ref={fontFileRef} type="file" accept=".ttf,.otf,.woff,.woff2" className="hidden" onChange={e => { onFontFile(e.target.files?.[0]); e.target.value = ''; }} />
            <button type="button" disabled={busy === 'font'} onClick={() => fontFileRef.current?.click()}
              className="px-4 py-2 rounded-lg bg-brand-button text-brand-on-button text-xs font-semibold flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-50">
              <Upload size={14} /> {busy === 'font' ? 'Subiendo...' : 'Elegir archivo'}
            </button>
          </div>
          {branding.customFonts.length > 0 && (
            <ul className="flex flex-wrap gap-2 pt-1">
              {branding.customFonts.map(f => (
                <li key={f.family} className="flex items-center gap-2 pl-3 pr-1 py-1 rounded-full bg-card border border-border text-xs">
                  <span style={{ fontFamily: `"${f.family}", system-ui` }}>{f.family}</span>
                  <button type="button" onClick={() => deleteFont(f.family)} className="w-6 h-6 rounded-full hover:bg-red-50 text-muted-foreground hover:text-red-600 flex items-center justify-center"><Trash2 size={12} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ---------- Logo y favicon ---------- */}
      <section className="bg-card rounded-xl border border-border p-4 shadow-card space-y-4">
        <div>
          <h3 className="font-bold text-sm flex items-center gap-1.5"><ImageIcon size={15} /> Logo y favicon</h3>
          <p className="text-xs text-muted-foreground">Al subir el logo principal, el sistema genera automáticamente el favicon y el ícono para móviles.</p>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Logo principal (barra lateral)</p>
            <div className="h-28 rounded-lg flex items-center justify-center p-3" style={{ background: resolved.surface }}>
              <img src={branding.logoUrl || '/logo/logo-dark.svg'} alt="Logo" className="max-h-full max-w-full object-contain" />
            </div>
            <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={e => { onLogoFile(e.target.files?.[0], 'logo'); e.target.value = ''; }} />
            <div className="flex gap-2">
              <button type="button" disabled={busy === 'logo'} onClick={() => logoRef.current?.click()} className="flex-1 px-3 py-2 rounded-lg bg-brand-button text-brand-on-button text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50">
                <Upload size={13} /> {busy === 'logo' ? 'Subiendo...' : 'Subir'}
              </button>
              {branding.logoUrl && <button type="button" onClick={() => removeImage('logo')} className="px-3 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-red-600"><Trash2 size={13} /></button>}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Logo para fondos claros (acceso)</p>
            <div className="h-28 rounded-lg flex items-center justify-center p-3 border border-border bg-white paper">
              <img src={branding.logoLoginUrl || branding.logoUrl || '/logo/logo-login.svg'} alt="Logo claro" className="max-h-full max-w-full object-contain" />
            </div>
            <input ref={logoLightRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={e => { onLogoFile(e.target.files?.[0], 'logoLogin'); e.target.value = ''; }} />
            <div className="flex gap-2">
              <button type="button" disabled={busy === 'logoLogin'} onClick={() => logoLightRef.current?.click()} className="flex-1 px-3 py-2 rounded-lg bg-brand-button text-brand-on-button text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50">
                <Upload size={13} /> {busy === 'logoLogin' ? 'Subiendo...' : 'Subir'}
              </button>
              {branding.logoLoginUrl && <button type="button" onClick={() => removeImage('logoLogin')} className="px-3 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-red-600"><Trash2 size={13} /></button>}
            </div>
            <p className="text-[10px] text-muted-foreground">Si no subes uno, se usa el logo principal.</p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Favicon (pestaña del navegador)</p>
            <div className="h-28 rounded-lg border border-border bg-white paper flex items-center justify-center gap-4">
              <img src={branding.faviconUrl || '/logo.svg'} alt="Favicon" className="w-8 h-8 object-contain" />
              <img src={branding.appleIconUrl || branding.faviconUrl || '/logo.svg'} alt="Ícono app" className="w-14 h-14 object-contain rounded-xl" />
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>Fondo:</span>
              <button type="button" onClick={() => setFaviconBg('dark')} className={cn('px-2 py-0.5 rounded-full border', faviconBg === 'dark' ? 'border-brand-primary text-brand-primary font-semibold' : 'border-border')}>Color oscuro</button>
              <button type="button" onClick={() => setFaviconBg('transparent')} className={cn('px-2 py-0.5 rounded-full border', faviconBg === 'transparent' ? 'border-brand-primary text-brand-primary font-semibold' : 'border-border')}>Transparente</button>
            </div>
            <input ref={faviconRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={e => { onFaviconFile(e.target.files?.[0]); e.target.value = ''; }} />
            <div className="flex gap-2">
              <button type="button" disabled={busy === 'favicon' || !branding.logoUrl} onClick={regenerateFavicon} className="flex-1 px-3 py-2 rounded-lg bg-brand-button text-brand-on-button text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50">
                <RefreshCw size={13} /> {busy === 'favicon' ? 'Generando...' : 'Generar del logo'}
              </button>
              <button type="button" onClick={() => faviconRef.current?.click()} className="px-3 py-2 rounded-lg border border-border text-xs text-brand-dark hover:bg-muted/30" title="Subir favicon propio"><Upload size={13} /></button>
              {branding.faviconUrl && <button type="button" onClick={() => removeImage('favicon')} className="px-3 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-red-600"><Trash2 size={13} /></button>}
            </div>
          </div>
        </div>
      </section>

      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

      <div className="sticky bottom-20 lg:bottom-4 flex items-center gap-3 bg-card/95 backdrop-blur rounded-xl border border-border p-3 shadow-elevated">
        <p className="text-xs text-muted-foreground flex-1">
          {dirty ? 'Estás viendo una vista previa. Guarda para aplicarlo a todos los usuarios.' : 'Tema guardado y aplicado.'}
          {!allOk && ' Hay verificaciones de legibilidad pendientes.'}
        </p>
        <button onClick={saveTheme} disabled={saving || !dirty}
          className="px-5 py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold shadow-fab hover:opacity-90 disabled:opacity-40 flex items-center gap-2">
          {saved ? <><Check size={16} /> Guardado</> : saving ? 'Guardando...' : 'Guardar colores y fuentes'}
        </button>
      </div>
    </div>
  );
};

export default BrandingPanel;
