import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { homePath } from '@/lib/permissions';
import { cn } from '@/lib/utils';

const REMEMBER_KEY = 'pos_login_user';
const readRemembered = () => { try { return localStorage.getItem(REMEMBER_KEY) || ''; } catch { return ''; } };

/** ¿Pantalla de escritorio? (el panel de marca va a la derecha; en celular, arriba y solo si hay modelo) */
const useDesktop = () => {
  const q = '(min-width: 1024px)';
  const [desk, setDesk] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => { const m = window.matchMedia(q); const on = () => setDesk(m.matches); m.addEventListener('change', on); return () => m.removeEventListener('change', on); }, []);
  return desk;
};

/** Panel de marca: modelo 3D girando (si se configuró) o el logo grande sobre el color de la barra lateral. */
const BrandPanel = ({ modelUrl, logo, name, slogan, className }: { modelUrl: string; logo: string; name: string; slogan: string; className?: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>(modelUrl ? 'loading' : 'idle');
  useEffect(() => {
    if (!modelUrl || !ref.current) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    setState('loading');
    // three.js se descarga solo aquí y solo si hay modelo
    import('@/lib/model3d').then(({ mountModel }) => {
      if (cancelled || !ref.current) return;
      try {
        stop = mountModel(ref.current, { src: modelUrl, onLoad: () => setState('ready'), onError: () => setState('error') });
      } catch { setState('error'); }
    }).catch(() => setState('error'));
    return () => { cancelled = true; stop?.(); };
  }, [modelUrl]);
  const showLogo = !modelUrl || state === 'error';
  return (
    <aside className={cn('relative overflow-hidden bg-brand-surface', className)} data-login-panel>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 52%, hsl(var(--brand-accent) / 0.30), transparent 62%)' }} />
      <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(hsl(var(--brand-on-dark)) 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
      {modelUrl && <div ref={ref} className={cn('absolute inset-0 transition-opacity duration-700', state === 'ready' ? 'opacity-100' : 'opacity-0')} data-login-model={state} />}
      {modelUrl && state === 'loading' && <div className="absolute inset-0 flex items-center justify-center"><span className="w-8 h-8 rounded-full border-2 border-brand-on-dark/20 border-t-brand-accent animate-spin" /></div>}
      {showLogo && (
        <div className="absolute inset-0 flex items-center justify-center p-12">
          <img src={logo} alt={name} className="max-w-[70%] max-h-[55%] object-contain drop-shadow-2xl" />
        </div>
      )}
      {slogan && <p className="absolute bottom-6 left-0 right-0 text-center text-sm font-display text-brand-on-dark/70 tracking-wide hidden lg:block">{slogan}</p>}
    </aside>
  );
};

const LoginPage = () => {
  const remembered = readRemembered();
  const [username, setUsername] = useState(remembered);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(!!remembered);
  const [showPassword, setShowPassword] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const desktop = useDesktop();
  const loginWithCredentials = useStore(s => s.loginWithCredentials);
  const businessName = useStore(s => s.businessName);
  const businessSlogan = useStore(s => s.businessSlogan);
  const branding = useStore(s => s.branding);

  const title = branding.loginTitle || businessName;
  const subtitle = branding.loginSubtitle || 'Sistema Punto de Venta POS';
  const lightLogo = branding.logoLoginUrl || branding.logoUrl || '/logo/logo-login.svg';
  const darkLogo = branding.logoUrl || '/logo/logo-dark.svg';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const user = username.trim().toLowerCase();
    try {
      await loginWithCredentials(user, password.trim());
      try { if (remember) localStorage.setItem(REMEMBER_KEY, user); else localStorage.removeItem(REMEMBER_KEY); } catch { /* sin almacenamiento */ }
      const s = useStore.getState();
      navigate(homePath(s.user, s.restaurant?.modules, s.hiddenViews));
    } catch (err: any) {
      setError(err.message || 'Usuario o contraseña incorrectos');
    }
    setLoading(false);
  };

  const FIELD = 'w-full bg-transparent border-0 border-b-2 border-brand-primary/15 px-0 py-3 text-lg text-brand-dark placeholder:text-brand-muted/60 outline-none focus:border-brand-primary transition-colors';
  const LABEL = 'block text-xs font-semibold uppercase tracking-[0.14em] text-brand-muted';

  return (
    <div className="min-h-screen flex flex-col lg:grid lg:grid-cols-[minmax(440px,1fr)_1.1fr] bg-brand-bg" data-login>
      {/* En celular el modelo va arriba, más bajito; sin modelo, solo el formulario */}
      {!desktop && branding.loginModelUrl && <BrandPanel modelUrl={branding.loginModelUrl} logo={darkLogo} name={businessName} slogan="" className="h-[32vh] min-h-[200px] shrink-0" />}

      <main className="flex-1 flex flex-col px-6 sm:px-12 lg:px-16 py-8">
        <img src={lightLogo} alt={businessName} className="h-12 w-auto max-w-[180px] object-contain object-left self-start" data-login-logo />
        <div className="flex-1 flex items-center py-10">
          <div className="w-full max-w-md">
            {branding.loginShowTitle && title && <p className="text-sm font-bold uppercase tracking-[0.18em] text-brand-primary mb-3" data-login-title>{title}</p>}
            <h1 className="font-display font-bold text-5xl sm:text-6xl leading-none text-brand-dark tracking-tight">Iniciar sesión</h1>
            {branding.loginShowSubtitle && subtitle && <p className="mt-3 text-brand-muted" data-login-subtitle>{subtitle}</p>}

            <form onSubmit={handleLogin} className="mt-10 space-y-7">
              <div>
                <label htmlFor="login-user" className={LABEL}>Usuario</label>
                <input id="login-user" value={username} onChange={e => setUsername(e.target.value)} placeholder="Tu usuario" autoComplete="username" autoCapitalize="none" className={FIELD} data-login-user />
              </div>
              <div>
                <label htmlFor="login-pass" className={LABEL}>Contraseña</label>
                <div className="relative">
                  <input id="login-pass" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" className={cn(FIELD, 'pr-24')} data-login-pass />
                  <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-0 top-1/2 -translate-y-1/2 px-3.5 py-1.5 rounded-full border border-brand-primary/15 bg-card text-sm font-medium text-brand-dark hover:border-brand-primary/40">
                    {showPassword ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 text-sm sm:text-[15px] whitespace-nowrap">
                <button type="button" role="checkbox" aria-checked={remember} onClick={() => setRemember(r => !r)} className="flex items-center gap-2.5 text-brand-dark" data-login-remember>
                  <span className={cn('w-5 h-5 rounded-full transition-all', remember ? 'border-[6px] border-brand-accent bg-white' : 'border-2 border-brand-primary/30')} />
                  Recordar usuario
                </button>
                <button type="button" onClick={() => setShowHelp(v => !v)} className="underline underline-offset-2 text-brand-dark hover:text-brand-primary">¿Olvidaste tu contraseña?</button>
              </div>
              {showHelp && <p className="text-sm text-brand-muted bg-brand-card rounded-xl px-4 py-3">Pídele al administrador que te asigne una nueva en Configuración → Usuarios.</p>}

              {error && <p className="text-sm text-red-600 font-medium" role="alert">{error}</p>}

              <button type="submit" disabled={loading}
                className="w-full py-4 rounded-full bg-brand-button text-brand-on-button text-lg font-semibold shadow-lg hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-60">
                {loading ? <span className="inline-flex items-center gap-2"><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> Ingresando...</span> : 'Ingresar'}
              </button>
            </form>
          </div>
        </div>
        <p className="text-[11px] text-brand-muted">🔒 {businessName} · Punto de venta</p>
      </main>

      {desktop && <BrandPanel modelUrl={branding.loginModelUrl} logo={darkLogo} name={businessName} slogan={businessSlogan} />}
    </div>
  );
};

export default LoginPage;
