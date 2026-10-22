import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Store, ShieldCheck, Sparkles, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const INPUT = 'w-full px-3 py-2.5 rounded-xl border border-gray-300 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/20';
const LABEL = 'block text-xs font-semibold text-gray-600 mb-1';

/** Configuración inicial de una instalación nueva: negocio, tipo, catálogo y administrador. */
const SetupPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [status, setStatus] = useState<{ pending: boolean; tokenRequired: boolean; types: Array<{ id: string; label: string }> } | null>(null);
  const [f, setF] = useState({ businessName: '', nit: '', address: '', phone: '', businessType: 'restaurant', catalog: 'sample', adminName: '', adminUsername: 'admin', adminPassword: '', adminPassword2: '', token: params.get('token') || '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const set = (p: Partial<typeof f>) => setF(x => ({ ...x, ...p }));
  useEffect(() => { api.getSetupStatus().then(setStatus).catch(e => setError(e.message)); }, []);

  if (status && !status.pending && !done) return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50"><div className="text-center space-y-3"><CheckCircle2 className="mx-auto text-emerald-600" size={40} /><p className="font-bold text-gray-900">Este sistema ya está configurado.</p><button onClick={() => navigate('/login')} className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold">Ir a iniciar sesión</button></div></div>
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (f.adminPassword !== f.adminPassword2) { setError('Las dos contraseñas no coinciden'); return; }
    setSaving(true);
    try { const r = await api.runSetup(f); setDone(r.username); } catch (err: any) { setError(err.message); }
    setSaving(false);
  };

  if (done) return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-6 text-center space-y-3" data-setup-done>
        <CheckCircle2 className="mx-auto text-emerald-600" size={44} />
        <h1 className="text-xl font-bold text-gray-900">¡Listo! {f.businessName} ya está configurado</h1>
        <p className="text-sm text-gray-600">Inicia sesión con el usuario <b>{done}</b> y la contraseña que acabas de crear. Después completa en Configuración el logo, los colores, los impuestos y la factura electrónica.</p>
        <button onClick={() => { window.location.href = '/login'; }} className="w-full py-3 rounded-xl bg-gray-900 text-white font-bold">Iniciar sesión</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <form onSubmit={submit} className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl p-6 space-y-5" data-setup>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500 flex items-center gap-1.5"><Sparkles size={13} /> Configuración inicial</p>
          <h1 className="text-2xl font-bold text-gray-900">Bienvenido a tu sistema POS</h1>
          <p className="text-sm text-gray-600">Unos datos básicos y queda listo para vender. Todo se puede cambiar después en Configuración.</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><Store size={15} /> El negocio</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2"><label className={LABEL}>Nombre del negocio *</label><input autoFocus value={f.businessName} onChange={e => set({ businessName: e.target.value })} className={INPUT} placeholder="Ej. Hamburguesas Don Pepe" data-setup-name /></div>
            <div><label className={LABEL}>NIT</label><input value={f.nit} onChange={e => set({ nit: e.target.value })} className={INPUT} placeholder="900123456-7" /></div>
            <div><label className={LABEL}>Teléfono</label><input value={f.phone} onChange={e => set({ phone: e.target.value })} className={INPUT} placeholder="300 000 0000" /></div>
            <div className="sm:col-span-2"><label className={LABEL}>Dirección</label><input value={f.address} onChange={e => set({ address: e.target.value })} className={INPUT} placeholder="Calle 10 # 20-30, Cartagena" /></div>
          </div>
          <div>
            <label className={LABEL}>Tipo de negocio</label>
            <div className="grid sm:grid-cols-2 gap-2">
              {(status?.types || []).map(t => (
                <button type="button" key={t.id} onClick={() => set({ businessType: t.id })} className={cn('text-left px-3 py-2.5 rounded-xl border text-sm', f.businessType === t.id ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50')} data-setup-type={t.id}>{t.label}</button>
              ))}
            </div>
          </div>
          <div>
            <label className={LABEL}>Menú</label>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => set({ catalog: 'sample' })} className={cn('px-3 py-2 rounded-xl border text-sm', f.catalog === 'sample' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200')}>Con productos de ejemplo</button>
              <button type="button" onClick={() => set({ catalog: 'empty' })} className={cn('px-3 py-2 rounded-xl border text-sm', f.catalog === 'empty' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200')} data-setup-empty>Vacío (cargo mi menú)</button>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><ShieldCheck size={15} /> El administrador</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className={LABEL}>Nombre</label><input value={f.adminName} onChange={e => set({ adminName: e.target.value })} className={INPUT} placeholder="Nombre del dueño o administrador" /></div>
            <div><label className={LABEL}>Usuario *</label><input value={f.adminUsername} onChange={e => set({ adminUsername: e.target.value.toLowerCase().replace(/\s/g, '') })} className={INPUT} data-setup-user /></div>
            <div><label className={LABEL}>Contraseña * (mínimo 8)</label><input type="password" value={f.adminPassword} onChange={e => set({ adminPassword: e.target.value })} className={INPUT} data-setup-pass /></div>
            <div><label className={LABEL}>Repite la contraseña *</label><input type="password" value={f.adminPassword2} onChange={e => set({ adminPassword2: e.target.value })} className={INPUT} data-setup-pass2 /></div>
            {status?.tokenRequired && <div className="sm:col-span-2"><label className={LABEL}>Código de instalación *</label><input value={f.token} onChange={e => set({ token: e.target.value.trim() })} className={cn(INPUT, 'font-mono')} placeholder="Lo entrega quien instaló el sistema" /></div>}
          </div>
        </section>

        {error && <p className="text-sm text-red-600" data-setup-error>{error}</p>}
        <button type="submit" disabled={saving || !status} className="w-full py-3 rounded-xl bg-gray-900 text-white font-bold disabled:opacity-40" data-setup-submit>{saving ? 'Configurando...' : 'Terminar configuración'}</button>
      </form>
    </div>
  );
};

export default SetupPage;
