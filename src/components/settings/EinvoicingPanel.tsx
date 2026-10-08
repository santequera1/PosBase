import { useEffect, useState } from 'react';
import { FileCheck2, ShieldCheck, Link2, Save, RefreshCw, AlertTriangle, CheckCircle2, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Chip, INPUT, LABEL } from '@/components/common/Primitives';
import { NiceSelect } from '@/components/ui/nice-select';

/** Facturación electrónica: elección del proveedor (pruebas o Factus), credenciales, rango de numeración y prueba de conexión. */
const EinvoicingPanel = () => {
  const [cfg, setCfg] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<any>(null);
  const [muniQuery, setMuniQuery] = useState('');
  const [munis, setMunis] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = () => api.getFeConfig().then(c => { setCfg(c); setForm({ provider: c.provider, env: c.env, clientId: c.clientId, clientSecret: c.clientSecret, email: c.email, password: c.password, numberingRangeId: c.numberingRangeId || '', municipalityId: c.municipalityId || '', municipalityCode: c.municipalityCode || '' }); }).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);
  const set = (patch: any) => setForm((f: any) => ({ ...f, ...patch }));

  const save = async () => {
    setSaving(true); setError(''); setMsg('');
    try { const c = await api.updateFeConfig(form); setCfg(c); set({ clientSecret: c.clientSecret, password: c.password }); setMsg('Configuración guardada.'); } catch (e: any) { setError(e.message); }
    setSaving(false);
  };
  const runTest = async () => {
    setTesting(true); setError(''); setTest(null);
    try { await api.updateFeConfig(form); const r = await api.testFeConnection(); setTest(r); const inv = (r.ranges || []).filter((x: any) => /factura/i.test(x.document || '') && x.isActive !== false); if (r.ok && (inv[0] || r.ranges?.[0]) && !form.numberingRangeId) set({ numberingRangeId: (inv[0] || r.ranges[0]).id }); } catch (e: any) { setTest({ ok: false, error: e.message }); }
    setTesting(false);
  };
  const searchMuni = async () => { try { setMunis(await api.getFeMunicipalities(muniQuery)); } catch (e: any) { setError(e.message); } };

  if (!cfg) return <p className="text-xs text-muted-foreground">Cargando...</p>;
  const isFactus = form.provider === 'factus';
  return (
    <section className="max-w-2xl bg-white rounded-2xl border border-brand-primary/15 p-5 shadow-sm space-y-4 font-sans text-left">
      <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
        <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-700 border border-sky-200 flex items-center justify-center"><FileCheck2 size={22} /></div>
        <div>
          <h3 className="font-bold text-sm text-brand-dark flex items-center gap-1.5">Facturación electrónica
            <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold', isFactus && cfg.configured ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800')}>{isFactus ? (cfg.configured ? `Factus · ${form.env === 'production' ? 'producción' : 'sandbox'}` : 'Factus · sin credenciales') : 'Modo pruebas'}</span>
          </h3>
          <p className="text-xs text-gray-400">Emisión de facturas electrónicas validadas por la DIAN a través de Factus (proveedor tecnológico).</p>
        </div>
      </div>

      <div className="space-y-1">
        <label className={LABEL}>Proveedor</label>
        <div className="flex flex-wrap gap-2">
          <Chip active={!isFactus} onClick={() => set({ provider: 'test' })}>Pruebas internas (documento simulado)</Chip>
          <Chip active={isFactus} onClick={() => set({ provider: 'factus' })}>Factus (factura real)</Chip>
        </div>
        <p className="text-[11px] text-gray-500">{isFactus ? 'Las ventas marcadas como F.E. se envían a Factus, que las valida ante la DIAN y devuelve número, CUFE y QR oficiales.' : 'Las ventas marcadas como F.E. generan un documento de prueba (prefijo FEP, sin validez fiscal) para demostraciones.'}</p>
      </div>

      <div className={cn('space-y-3 rounded-xl border p-4', isFactus ? 'border-sky-200 bg-sky-50/40' : 'border-gray-200 bg-gray-50/60')}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-brand-dark flex items-center gap-1"><ShieldCheck size={14} className="text-sky-700" /> Credenciales de Factus</p>
          <div className="flex gap-1"><Chip active={form.env === 'sandbox'} onClick={() => set({ env: 'sandbox' })}>Sandbox (pruebas)</Chip><Chip active={form.env === 'production'} onClick={() => set({ env: 'production' })}>Producción</Chip></div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className={LABEL}>Client ID</label><input value={form.clientId} onChange={e => set({ clientId: e.target.value })} className={cn(INPUT, 'font-mono text-xs')} autoComplete="off" /></div>
          <div><label className={LABEL}>Client Secret</label><input type="password" value={form.clientSecret} onChange={e => set({ clientSecret: e.target.value })} className={cn(INPUT, 'font-mono text-xs')} autoComplete="new-password" /></div>
          <div><label className={LABEL}>Correo de la cuenta</label><input value={form.email} onChange={e => set({ email: e.target.value })} className={INPUT} autoComplete="off" /></div>
          <div><label className={LABEL}>Contraseña</label><input type="password" value={form.password} onChange={e => set({ password: e.target.value })} className={INPUT} autoComplete="new-password" /></div>
        </div>
        <p className="text-[10px] text-gray-500">Las credenciales se guardan en el servidor y solo las ve el administrador. Factus ofrece 15 días de prueba; el sandbox usa las credenciales de prueba que entrega Factus al registrarse.</p>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={runTest} disabled={testing || !form.clientId || !form.email} className="px-3 py-2 rounded-xl border border-sky-300 bg-white text-sky-800 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40"><Link2 size={14} className={testing ? 'animate-pulse' : ''} /> {testing ? 'Conectando...' : 'Probar conexión y cargar rangos'}</button>
          {test && (test.ok
            ? <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1"><CheckCircle2 size={13} /> Conectado a Factus ({test.env}{test.apiVersion ? ` · API ${test.apiVersion}` : ''}) · {test.ranges.length} rango(s) de numeración</span>
            : <span className="text-xs text-red-600 font-semibold flex items-center gap-1"><AlertTriangle size={13} /> {test.error}</span>)}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Rango de numeración (resolución DIAN)</label>
            {test?.ok && test.ranges?.length ? (
              <NiceSelect value={form.numberingRangeId} onChange={e => set({ numberingRangeId: e.target.value })} className={cn(INPUT, 'text-xs')}>
                <option value="">Selecciona…</option>
                {test.ranges.filter((r: any) => !r.document || /factura/i.test(r.document)).map((r: any) => <option key={r.id} value={r.id}>#{r.id} · {r.document} {r.prefix}{r.from ? ` ${r.from}–${r.to}` : ''}{r.end ? ` · vence ${r.end}` : ''} {r.isActive === false ? '(inactivo)' : ''}</option>)}
              </NiceSelect>
            ) : <input type="number" value={form.numberingRangeId} onChange={e => set({ numberingRangeId: e.target.value })} placeholder="ID del rango en Factus" className={cn(INPUT, 'font-mono text-xs')} />}
          </div>
          {(test?.apiVersion || cfg.apiVersion) === 'v2' ? (
          <div>
            <label className={LABEL}>Municipio del negocio (código DIVIPOLA)</label>
            <input value={form.municipalityCode || ''} onChange={e => set({ municipalityCode: e.target.value.replace(/\D/g, '').slice(0, 5) })} placeholder="Ej: 13001 (Cartagena)" className={cn(INPUT, 'font-mono text-xs')} data-fe-muni-code />
            <p className="text-[10px] text-muted-foreground mt-1">La API v2 usa el código DANE del municipio: Cartagena 13001, Bogotá 11001, Barranquilla 08001, Medellín 05001.</p>
          </div>
          ) : (
          <div>
            <label className={LABEL}>Municipio del negocio (ID Factus)</label>
            <div className="flex gap-1.5">
              <input type="number" value={form.municipalityId} onChange={e => set({ municipalityId: e.target.value })} placeholder="Ej: 980" className={cn(INPUT, 'font-mono text-xs')} />
              <input value={muniQuery} onChange={e => setMuniQuery(e.target.value)} placeholder="Buscar ciudad" className={cn(INPUT, 'text-xs')} />
              <button onClick={searchMuni} disabled={!cfg.configured && !test?.ok} className="px-2.5 rounded-lg border border-border text-xs disabled:opacity-40" title="Requiere conexión"><Search size={13} /></button>
            </div>
            {munis.length > 0 && <div className="mt-1 max-h-28 overflow-y-auto rounded-lg border border-border bg-white text-xs">{munis.map(m => <button key={m.id} onClick={() => { set({ municipalityId: m.id }); setMunis([]); }} className="block w-full text-left px-2 py-1 hover:bg-brand-button/5">{m.name} ({m.department}) · #{m.id}</button>)}</div>}
          </div>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
      {msg && <p className="text-xs text-emerald-700">{msg}</p>}
      <div className="flex flex-wrap gap-2">
        <button onClick={save} disabled={saving} className="px-4 py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold flex items-center gap-1.5 disabled:opacity-40"><Save size={15} /> {saving ? 'Guardando...' : 'Guardar'}</button>
        <button onClick={load} className="px-3 py-2.5 rounded-xl border border-border text-sm font-semibold flex items-center gap-1.5"><RefreshCw size={14} /> Recargar</button>
      </div>
      <div className="text-[11px] text-gray-500 space-y-1 border-t border-gray-100 pt-3">
        <p className="font-semibold text-gray-700">Cómo funciona</p>
        <p>1. Regístrate en Factus y obtén Client ID, Client Secret, usuario y contraseña (sandbox para probar, producción con la resolución DIAN real).</p>
        <p>2. Prueba la conexión, elige el rango de numeración y guarda. Cambia el proveedor a <b>Factus</b> cuando quieras emitir facturas reales.</p>
        <p>3. En cada venta con "Factura electrónica", el POS envía los ítems, el impuesto ({'INC o IVA'}) y los datos del cliente (NIT/CC, dirección, correo). Factus valida ante la DIAN y devuelve CUFE, QR y el PDF oficial, que se imprime y se puede enviar por correo o WhatsApp.</p>
        <p>4. El documento soporte a no obligados a facturar se numera internamente (DSP) mientras se habilita su emisión electrónica.</p>
      </div>
    </section>
  );
};

export default EinvoicingPanel;
