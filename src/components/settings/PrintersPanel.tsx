import { useEffect, useState } from 'react';
import { Printer, Wifi, WifiOff, Plus, Edit2, Trash2, Download, Search, RotateCcw, CheckCircle2, AlertTriangle, Clock, Monitor, Copy, Info, Zap, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { ReceiptLogoSection } from './ReceiptLogo';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import { Modal, Chip, INPUT, LABEL } from '@/components/common/Primitives';
import { buildInstaller } from '@/lib/printInstaller';
import { NiceSelect } from '@/components/ui/nice-select';

const ROLE_OPTS = [
  { id: 'cocina', label: 'Cocina', hint: 'Comandas de comida' },
  { id: 'barra', label: 'Barra', hint: 'Comandas de bebidas' },
  { id: 'caja', label: 'Caja', hint: 'Recibos, precuentas y cierres' },
];
const STATUS: Record<string, { label: string; cls: string; icon: any }> = {
  done: { label: 'Impreso', cls: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2 },
  error: { label: 'Error', cls: 'bg-red-50 text-red-700', icon: AlertTriangle },
  pending: { label: 'En cola', cls: 'bg-amber-50 text-amber-800', icon: Clock },
  sent: { label: 'Enviando', cls: 'bg-sky-50 text-sky-700', icon: Clock },
};

function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/octet-stream' }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const ago = (ts?: string | null) => {
  if (!ts) return 'nunca';
  const d = new Date(ts.replace(' ', 'T') + '-05:00');
  const s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  return s < 60 ? `hace ${s} s` : s < 3600 ? `hace ${Math.round(s / 60)} min` : `hace ${Math.round(s / 3600)} h`;
};

const PrinterModal = ({ printer, prefillIp, onClose, onSaved }: { printer: any | null; prefillIp?: string; onClose: () => void; onSaved: () => void }) => {
  const branches = useStore(s => s.branches);
  const branchId = useStore(s => s.branchId);
  const [f, setF] = useState<any>(printer ? { ...printer } : { name: '', ip: prefillIp || '', port: 9100, roles: [], paper: 80, codepage: 'cp850', copies: 1, drawer: false, beep: false, active: true, branchId });
  const [error, setError] = useState('');
  const set = (p: any) => setF((x: any) => ({ ...x, ...p }));
  const save = async () => {
    setError('');
    try { if (printer) await api.updatePrinter(printer.id, f); else await api.addPrinter(f); onSaved(); } catch (e: any) { setError(e.message); }
  };
  return (
    <Modal title={printer ? `Editar ${printer.name}` : 'Nueva impresora'} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><label className={LABEL}>Nombre</label><input value={f.name} onChange={e => set({ name: e.target.value })} placeholder="Ej. Cocina, Barra, Caja" className={INPUT} data-printer-name /></div>
        <div><label className={LABEL}>IP de la impresora</label><input value={f.ip} onChange={e => set({ ip: e.target.value.trim() })} placeholder="192.168.1.100" className={cn(INPUT, 'font-mono')} data-printer-ip /></div>
        <div><label className={LABEL}>Puerto</label><input type="number" value={f.port} onChange={e => set({ port: Number(e.target.value) })} className={cn(INPUT, 'font-mono')} /></div>
        <div className="col-span-2">
          <label className={LABEL}>¿Qué imprime?</label>
          <div className="grid grid-cols-3 gap-1.5">
            {ROLE_OPTS.map(r => { const on = f.roles.includes(r.id); return (
              <button key={r.id} type="button" onClick={() => set({ roles: on ? f.roles.filter((x: string) => x !== r.id) : [...f.roles, r.id] })} data-role={r.id}
                className={cn('p-2 rounded-lg border text-left', on ? 'border-brand-primary bg-brand-button/5' : 'border-border')}>
                <span className="block text-xs font-semibold text-brand-dark">{on ? '✓ ' : ''}{r.label}</span><span className="block text-[10px] text-muted-foreground">{r.hint}</span>
              </button>
            ); })}
          </div>
        </div>
        <div><label className={LABEL}>Papel</label><div className="flex gap-1.5">{[80, 58].map(p => <Chip key={p} active={f.paper === p} onClick={() => set({ paper: p })}>{p} mm</Chip>)}</div></div>
        <div><label className={LABEL}>Copias</label><div className="flex gap-1.5">{[1, 2, 3].map(c => <Chip key={c} active={f.copies === c} onClick={() => set({ copies: c })}>{c}</Chip>)}</div></div>
        <div className="col-span-2"><label className={LABEL}>Tildes y ñ</label><div className="flex gap-1.5"><Chip active={f.codepage === 'cp850'} onClick={() => set({ codepage: 'cp850' })}>Con tildes (PC850)</Chip><Chip active={f.codepage === 'ascii'} onClick={() => set({ codepage: 'ascii' })}>Sin tildes (si salen símbolos raros)</Chip></div></div>
        {branches.length > 1 && (
          <div className="col-span-2"><label className={LABEL}>Sede</label>
            <NiceSelect value={f.branchId === null || f.branchId === undefined ? '' : String(f.branchId)} onChange={e => set({ branchId: e.target.value === '' ? null : Number(e.target.value) })} className={INPUT} data-printer-branch>
              <option value="">Todas las sedes</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </NiceSelect>
          </div>
        )}
        <label className="col-span-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={f.drawer} onChange={e => set({ drawer: e.target.checked })} /> Abrir el cajón monedero al imprimir un recibo pagado en efectivo</label>
        <label className="col-span-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={f.beep} onChange={e => set({ beep: e.target.checked })} /> Pitido al llegar una comanda (si la impresora lo soporta)</label>
        {printer && <label className="col-span-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={f.active} onChange={e => set({ active: e.target.checked })} /> Activa</label>}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {!f.roles.length && <p className="text-xs text-amber-700">Marca qué imprime (Cocina, Barra o Caja): sin eso no le llega nada.</p>}
      <button onClick={save} disabled={!f.name || !f.ip || !f.roles.length} data-printer-save className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-40">Guardar</button>
    </Modal>
  );
};

const ManualIdentify = ({ onSend }: { onSend: (ip: string) => void }) => {
  const [ip, setIp] = useState('');
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="font-semibold text-brand-dark">Probar una IP:</span>
      <input value={ip} onChange={e => setIp(e.target.value.trim())} placeholder="192.168.1.100" className={cn(INPUT, 'w-40 py-1.5 font-mono')} data-manual-ip />
      <button onClick={() => onSend(ip)} disabled={!/^\d+\.\d+\.\d+\.\d+$/.test(ip)} className="px-3 py-1.5 rounded-lg border border-border font-semibold disabled:opacity-40" data-manual-identify>Identificar</button>
      <span className="text-muted-foreground">Imprime una hoja con la IP en la impresora que la tenga.</span>
    </div>
  );
};

/** Configuración → Impresoras: impresión por red con el agente propio (comandas por estación, recibos, cierres). */
export const PrintersPanel = () => {
  const loadRestaurantConfig = useStore(s => s.loadRestaurantConfig);
  const restaurant = useStore(s => s.restaurant);
  const branchesAll = useStore(s => s.branches);
  const [cfg, setCfg] = useState<any>(null);
  const [edit, setEdit] = useState<{ open: boolean; printer: any | null; ip?: string }>({ open: false, printer: null });
  const [newAgent, setNewAgent] = useState<{ token: string; name: string } | null>(null);
  const load = () => api.getPrintingConfig().then(setCfg).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);
  if (!cfg) return <p className="text-xs text-muted-foreground">Cargando...</p>;

  const setMode = async (mode: 'browser' | 'agent') => { await api.setPrintingMode(mode); await loadRestaurantConfig(); load(); toast.success(mode === 'agent' ? 'Impresión en red activada' : 'Se imprime desde el navegador'); };
  const setRest = async (p: any) => { await api.updateRestaurantConfig(p); await loadRestaurantConfig(); };
  const createAgent = async () => {
    const name = window.prompt('Nombre del computador donde vas a instalar el agente', 'Computador de la caja');
    if (!name) return;
    try { const a = await api.createPrintAgent(name); setNewAgent({ token: a.token, name }); load(); } catch (e: any) { toast.error(e.message); }
  };
  const removeAgent = async (a: any) => { if (!window.confirm(`¿Quitar el agente "${a.name}"? Dejará de imprimir hasta que instales uno nuevo.`)) return; await api.deletePrintAgent(a.id); load(); };
  const removePrinter = async (p: any) => { if (!window.confirm(`¿Eliminar la impresora ${p.name}?`)) return; await api.deletePrinter(p.id); load(); };
  const samples = async (p: any) => { try { const r = await api.samplePrinter(p.id); toast.success(`${r.queued} impresión(es) de ejemplo enviadas a ${p.name}`); setTimeout(load, 1500); } catch (e: any) { toast.error(e.message); } };
  const test = async (p: any) => { try { await api.testPrinter(p.id); toast.success(`Página de prueba enviada a ${p.name}`); setTimeout(load, 1500); } catch (e: any) { toast.error(e.message); } };
  const scan = async (a: any) => { await api.scanPrinters(a.id); toast.info('Buscando impresoras en la red del restaurante (unos segundos)...'); setTimeout(load, 4000); };
  const anyOnline = cfg.agents.some((a: any) => a.online);
  const identify = async (ip: string) => { try { await api.identifyPrinter(ip); toast.success(`Hoja de identificación enviada a ${ip}: mira cuál impresora la imprime`); setTimeout(load, 2500); } catch (e: any) { toast.error(e.message); } };
  const knownIps = new Set(cfg.printers.map((p: any) => p.ip));

  return (
    <div className="space-y-4" data-printers-panel>
      <section className="bg-card rounded-xl border border-border p-4 shadow-card space-y-3">
        <h3 className="font-bold text-sm text-brand-dark flex items-center gap-1.5"><Printer size={15} /> ¿Cómo se imprime?</h3>
        <div className="grid sm:grid-cols-2 gap-2">
          <button onClick={() => setMode('browser')} className={cn('p-3 rounded-xl border text-left', cfg.mode === 'browser' ? 'border-brand-primary bg-brand-button/5' : 'border-border')} data-mode="browser">
            <span className="block text-sm font-bold text-brand-dark">{cfg.mode === 'browser' ? '✓ ' : ''}Desde el navegador</span>
            <span className="block text-[11px] text-muted-foreground">Sale el cuadro de impresión de Windows y se elige la impresora. Sirve con impresoras USB instaladas en el computador.</span>
          </button>
          <button onClick={() => setMode('agent')} className={cn('p-3 rounded-xl border text-left', cfg.mode === 'agent' ? 'border-brand-primary bg-brand-button/5' : 'border-border')} data-mode="agent">
            <span className="block text-sm font-bold text-brand-dark">{cfg.mode === 'agent' ? '✓ ' : ''}Por red (impresoras con IP)</span>
            <span className="block text-[11px] text-muted-foreground">Las comandas salen solas en cocina y barra, aunque el mesero las envíe desde el celular. Recibos y cierres en la impresora de caja, sin cuadros de diálogo.</span>
          </button>
        </div>
        {cfg.mode === 'agent' && (
          <div className="grid sm:grid-cols-2 gap-2 text-xs">
            <label className="flex items-center gap-2 p-2.5 rounded-lg border border-border"><input type="checkbox" checked={!!restaurant?.autoPrintKitchen} onChange={e => setRest({ autoPrintKitchen: e.target.checked })} data-auto-kitchen /> Imprimir la comanda apenas se envía a cocina</label>
            <div className="flex items-center gap-1.5 p-2.5 rounded-lg border border-border flex-wrap"><span>Comandas:</span><Chip active={restaurant?.kitchenPrintMode !== 'station'} onClick={() => setRest({ kitchenPrintMode: 'single' })}>Una con todo</Chip><Chip active={restaurant?.kitchenPrintMode === 'station'} onClick={() => setRest({ kitchenPrintMode: 'station' })}>Separadas cocina / barra</Chip></div>
          </div>
        )}
      </section>

      <section className="bg-card rounded-xl border border-border p-4 shadow-card space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-bold text-sm text-brand-dark flex items-center gap-1.5"><Monitor size={15} /> 1. Agente de impresión (computador del restaurante)</h3>
          <button onClick={createAgent} data-agent-new className="px-3 py-1.5 rounded-lg bg-brand-button text-brand-on-button text-xs font-semibold flex items-center gap-1.5"><Download size={13} /> Instalar agente en un computador</button>
        </div>
        <p className="text-[11px] text-muted-foreground flex gap-1"><Info size={12} className="shrink-0 mt-0.5" /> Se instala una sola vez en el computador de la caja (Windows), conectado a la misma red de las impresoras. Debe estar encendido durante el servicio. No necesita programas adicionales. Ese computador hace de puente: se puede imprimir desde cualquier lugar (celular, casa) porque el servidor le pasa los trabajos.</p>
        {anyOnline && <ManualIdentify onSend={identify} />}
        <details className="text-[11px] rounded-lg bg-muted/30 p-2.5">
          <summary className="font-semibold text-brand-dark cursor-pointer">¿No aparece una impresora?</summary>
          <ol className="list-decimal pl-4 mt-1.5 space-y-1 text-muted-foreground">
            <li>Revisa que tenga el cable de red conectado y la luz del puerto encendida.</li>
            <li>Imprime su hoja de autoprueba: apágala, mantén oprimido el botón FEED y enciéndela. Ahí sale su IP (IP Address).</li>
            <li>Escribe esa IP arriba en "Probar una IP" y toca Identificar. Si imprime, agrégala.</li>
            <li>Si su IP es de otra red (por ejemplo 192.168.123.100 y el computador está en 192.168.1.x), hay que cambiarle la IP a una de la red del computador con la herramienta del fabricante (Printer Tool / Ethernet setting) o desde su página web, o configurarla en el router.</li>
            <li>Lo ideal es dejarle una IP fija (reservada en el router) para que no cambie.</li>
          </ol>
        </details>
        {cfg.agents.length === 0 ? <p className="text-xs text-amber-700">Aún no hay agente instalado.</p> : (
          <ul className="divide-y divide-border border border-border rounded-lg">
            {cfg.agents.map((a: any) => (
              <li key={a.id} className="px-3 py-2.5 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  {a.online ? <Wifi size={15} className="text-emerald-600" /> : <WifiOff size={15} className="text-red-500" />}
                  <span className="text-sm font-semibold text-brand-dark">{a.name}</span>
                  <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-bold', a.online ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700')} data-agent-status={a.online ? 'online' : 'offline'}>{a.online ? 'En línea' : 'Desconectado'}</span>
                  <span className="text-[11px] text-muted-foreground">{a.info?.hostname ? `${a.info.hostname} · v${a.info.version} · ` : ''}{a.info?.localIps?.length ? `red del computador: ${a.info.localIps.join(', ')} · ` : ''}visto {ago(a.lastSeen)}</span>
                  <span className="ml-auto flex gap-1">
                    <button onClick={() => scan(a)} disabled={!a.online} className="px-2 py-1 rounded-lg border border-border text-[11px] font-semibold flex items-center gap-1 disabled:opacity-40"><Search size={12} /> Buscar impresoras</button>
                    <button onClick={() => removeAgent(a)} className="p-1.5 text-muted-foreground hover:text-red-600"><Trash2 size={13} /></button>
                  </span>
                </div>
                {a.scanRequested && <p className="text-[11px] text-sky-700">Buscando impresoras...</p>}
                {Array.isArray(a.scanResult) && (
                  <div className="text-[11px] flex flex-wrap items-center gap-1.5">
                    <span className="text-muted-foreground">Impresoras encontradas en la red:</span>
                    {a.scanResult.length === 0 && <span className="text-amber-700">ninguna (revisa que estén encendidas y en la misma red)</span>}
                    {a.scanResult.map((ip: string) => (
                      <span key={ip} className={cn('inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full font-mono', knownIps.has(ip) ? 'bg-emerald-50 text-emerald-800' : 'bg-brand-card border border-brand-accent/40')} data-found-ip={ip}>
                        {ip}{knownIps.has(ip) ? ' ✓' : ''}
                        <button onClick={() => identify(ip)} className="px-1.5 rounded-full bg-white border border-border font-sans font-semibold" title="Imprime una hoja con esta IP para saber qué impresora es" data-identify={ip}>identificar</button>
                        {!knownIps.has(ip) && <button onClick={() => setEdit({ open: true, printer: null, ip })} className="px-1.5 rounded-full bg-brand-button text-brand-on-button font-sans font-semibold">+ agregar</button>}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-card rounded-xl border border-border p-4 shadow-card space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-bold text-sm text-brand-dark flex items-center gap-1.5"><Printer size={15} /> 2. Impresoras</h3>
          <button onClick={() => setEdit({ open: true, printer: null })} data-printer-new className="px-3 py-1.5 rounded-lg gradient-primary text-primary-foreground text-xs font-semibold flex items-center gap-1.5"><Plus size={13} /> Agregar impresora</button>
        </div>
        {cfg.printers.length === 0 ? <p className="text-xs text-muted-foreground">Agrega cada impresora con su IP (se ve en la hoja de prueba de la impresora: apágala, mantén oprimido FEED y enciéndela).</p> : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {cfg.printers.map((p: any) => (
              <div key={p.id} className={cn('rounded-xl border border-border p-3 space-y-1.5', !p.active && 'opacity-50')} data-printer-card={p.name}>
                <div className="flex items-center gap-2">
                  <span className={cn('w-2.5 h-2.5 rounded-full', p.online === true ? 'bg-emerald-500' : p.online === false ? 'bg-red-500' : 'bg-gray-300')} title={p.online === true ? 'Responde' : p.online === false ? 'No responde' : 'Sin revisar'} />
                  <p className="text-sm font-bold text-brand-dark flex-1 truncate">{p.name}</p>
                  <button onClick={() => setEdit({ open: true, printer: p })} className="p-1 text-muted-foreground hover:text-brand-primary"><Edit2 size={13} /></button>
                  <button onClick={() => removePrinter(p)} className="p-1 text-muted-foreground hover:text-red-600"><Trash2 size={13} /></button>
                </div>
                <p className="text-[11px] font-mono text-muted-foreground">{p.ip}:{p.port} · {p.paper} mm{p.copies > 1 ? ` · ${p.copies} copias` : ''}{branchesAll.length > 1 ? ` · ${p.branchId ? (branchesAll.find(b => b.id === p.branchId)?.name || 'Sede') : 'Todas las sedes'}` : ''}</p>
                <div className="flex flex-wrap gap-1">{p.roles.length ? p.roles.map((r: string) => <span key={r} className="text-[10px] px-2 py-0.5 rounded-full bg-brand-card border border-brand-accent/40 font-semibold">{cfg.roles[r] || r}</span>) : <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-bold">Sin función: no imprime nada. Edítala y marca Cocina o Caja</span>}</div>
                <p className="text-[10px] text-muted-foreground">{p.online === false ? 'No responde: revisa que esté encendida y conectada' : p.online ? `Responde · ${ago(p.checkedAt)}` : 'El agente aún no la ha revisado'}</p>
                <button onClick={() => test(p)} disabled={!anyOnline} data-printer-test className="w-full py-1.5 rounded-lg border border-border text-[11px] font-semibold flex items-center justify-center gap-1 disabled:opacity-40"><Zap size={12} /> Imprimir prueba</button>
                <button onClick={() => samples(p)} disabled={!anyOnline} data-printer-samples className="w-full py-1.5 rounded-lg bg-brand-button text-brand-on-button text-[11px] font-semibold flex items-center justify-center gap-1 disabled:opacity-40" title="Comanda, precuenta y recibo de ejemplo según la función de la impresora (no crea ventas)"><Receipt size={12} /> Imprimir ejemplos</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <ReceiptLogoSection logo={cfg.logo} onSaved={load} />

      <section className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-brand-card"><p className="text-xs font-bold text-brand-dark">3. Últimas impresiones</p></div>
        {cfg.jobs.length === 0 ? <p className="p-4 text-xs text-muted-foreground">Todavía no se ha impreso nada por red.</p> : (
          <ul className="divide-y divide-border max-h-80 overflow-y-auto">
            {cfg.jobs.map((j: any) => { const s = STATUS[j.status] || STATUS.pending; return (
              <li key={j.id} className="flex items-center gap-2 px-4 py-2 text-xs">
                <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1', s.cls)}><s.icon size={10} /> {s.label}</span>
                <span className="font-semibold text-brand-dark">{j.title}</span>
                <span className="text-muted-foreground">→ {j.printer || '—'} · {String(j.createdAt).slice(11, 16)}{j.createdBy ? ` · ${j.createdBy}` : ''}</span>
                {j.error && <span className="text-red-700 truncate">{j.error}</span>}
                {j.status === 'error' && <button onClick={async () => { await api.retryPrintJob(j.id); load(); }} className="ml-auto px-2 py-0.5 rounded-lg border border-border font-semibold flex items-center gap-1"><RotateCcw size={11} /> Reintentar</button>}
              </li>
            ); })}
          </ul>
        )}
      </section>

      {edit.open && <PrinterModal printer={edit.printer} prefillIp={edit.ip} onClose={() => setEdit({ open: false, printer: null })} onSaved={() => { setEdit({ open: false, printer: null }); load(); }} />}
      {newAgent && (
        <Modal title={`Instalar el agente en "${newAgent.name}"`} onClose={() => setNewAgent(null)}>
          <ol className="text-xs space-y-2 list-decimal pl-4">
            <li>En el computador de la caja (Windows), abre el POS y descarga el instalador:
              <button onClick={() => downloadText('instalar-agente-impresion.bat', buildInstaller(window.location.origin, newAgent.token))} data-agent-download className="mt-1.5 w-full py-2 rounded-lg gradient-primary text-primary-foreground text-xs font-bold flex items-center justify-center gap-1.5"><Download size={14} /> Descargar instalador (.bat)</button>
            </li>
            <li>Ábrelo con doble clic. Si Windows avisa "Windows protegió su PC", toca <b>Más información → Ejecutar de todas formas</b>.</li>
            <li>Al terminar, aquí el agente aparece <b>En línea</b>. Luego toca <b>Buscar impresoras</b> o agrégalas con su IP y prueba cada una.</li>
          </ol>
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-900 space-y-1">
            <p>Esta clave solo se muestra ahora. Si la pierdes, quita el agente y crea otro.</p>
            <div className="flex items-center gap-1.5"><code className="font-mono text-[10px] break-all flex-1">{newAgent.token}</code><button onClick={() => { navigator.clipboard?.writeText(newAgent.token); toast.success('Copiada'); }} className="p-1"><Copy size={12} /></button></div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default PrintersPanel;
