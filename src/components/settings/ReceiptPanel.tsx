import { useMemo, useState } from 'react';
import { Check, Printer, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { generateSalesTicketHtml, printThermal } from '@/lib/thermalPrint';
import { type ReceiptDesign } from '@/lib/receiptDesign';
import { ReceiptLogoSection } from './ReceiptLogo';

const INPUT = 'w-full px-3 py-2 rounded-lg border border-input bg-card text-sm font-sans outline-none focus:ring-2 focus:ring-primary/20';

const SHOW: Array<[keyof ReceiptDesign, string]> = [
  ['showLogo', 'Logo'], ['showSlogan', 'Eslogan'], ['showNit', 'NIT'], ['showAddress', 'Dirección'], ['showPhone', 'Teléfono'], ['showHours', 'Horario'],
];

/** Configuración → Recibos: logo, qué datos del negocio salen y los textos, con vista previa en vivo. */
const ReceiptPanel = () => {
  const saved = useStore(s => s.receiptDesign);
  const savedFooter = useStore(s => s.receiptFooter);
  const logo = useStore(s => s.receiptLogo);
  const products = useStore(s => s.products);
  const [design, setDesign] = useState<ReceiptDesign>(saved);
  const [footer, setFooter] = useState(savedFooter);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const dirty = JSON.stringify(design) !== JSON.stringify(saved) || footer !== savedFooter;
  const set = (p: Partial<ReceiptDesign>) => setDesign(d => ({ ...d, ...p }));

  // Venta de ejemplo con productos del menú (o genéricos si aún no hay)
  const sample = useMemo(() => {
    const pick = products.filter(p => p.available).slice(0, 3);
    const items = (pick.length ? pick : [{ name: 'Producto de ejemplo', price: 18000 }, { name: 'Bebida', price: 6000 }] as any[])
      .map((p: any, i: number) => ({ name: p.name, price: p.price, quantity: i === 0 ? 2 : 1 }));
    const total = items.reduce((a, i) => a + i.price * i.quantity, 0);
    return { id: 1234, type: 'dine-in', tableLabel: '4', people: 2, items, subtotal: total, total, paymentMethod: 'cash', cashReceived: Math.ceil(total / 10000) * 10000, createdAt: new Date().toISOString() };
  }, [products]);
  const html = useMemo(() => generateSalesTicketHtml(sample, { design, logo, footer }), [sample, design, logo, footer]);

  const save = async () => {
    setBusy(true);
    try {
      await api.updateSettings({ receiptDesign: JSON.stringify(design), receiptFooter: footer.trim() });
      useStore.setState({ receiptDesign: design, receiptFooter: footer.trim() });
      setOk(true); setTimeout(() => setOk(false), 2000);
    } catch (e: any) { toast.error(e.message || 'No se pudo guardar'); }
    setBusy(false);
  };

  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-4 items-start font-sans" data-receipt-panel>
      <div className="space-y-4">
        <ReceiptLogoSection logo={logo ? { ...logo, on: true } : null} onSaved={l => useStore.setState({ receiptLogo: l })} />

        <section className="bg-card rounded-xl border border-border p-4 shadow-card space-y-4">
          <div>
            <h3 className="font-bold text-sm text-brand-dark flex items-center gap-1.5"><Receipt size={15} /> Qué sale en el recibo</h3>
            <p className="text-xs text-muted-foreground">Los datos (eslogan, NIT, dirección, teléfono, horario) se escriben en Configuración → Negocio. Aplica a recibos y precuentas, impresos en red o desde el navegador.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {SHOW.map(([k, l]) => (
              <label key={k} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-xs font-semibold cursor-pointer has-[:checked]:bg-brand-button has-[:checked]:text-brand-on-button has-[:checked]:border-transparent" data-receipt-show={k}>
                <input type="checkbox" className="sr-only" checked={!!design[k]} onChange={e => set({ [k]: e.target.checked } as any)} /> {l}
              </label>
            ))}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Texto debajo del nombre (opcional)</label>
              <textarea value={design.headerText} onChange={e => set({ headerText: e.target.value })} rows={2} maxLength={160} placeholder="Ej: Régimen simple · Cartagena" className={INPUT} data-receipt-header />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Mensaje al final (opcional)</label>
              <textarea value={footer} onChange={e => setFooter(e.target.value)} rows={2} maxLength={240} placeholder="Ej: Síguenos en Instagram @minegocio · WiFi: clave123" className={INPUT} data-receipt-footer />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Agradecimiento (vacío = no sale)</label>
              <input value={design.thanks} onChange={e => set({ thanks: e.target.value })} maxLength={100} className={INPUT} data-receipt-thanks />
              <p className="text-[10px] text-muted-foreground">{'{negocio}'} se cambia por el nombre del negocio.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={save} disabled={!dirty || busy} data-receipt-save className="px-4 py-2 rounded-xl gradient-primary text-primary-foreground text-xs font-bold disabled:opacity-40 flex items-center gap-1.5">
              {ok ? <><Check size={13} /> Guardado</> : busy ? 'Guardando...' : 'Guardar recibo'}
            </button>
            {dirty && <span className="text-[11px] text-muted-foreground">Cambios sin guardar: la vista previa ya los muestra.</span>}
          </div>
        </section>
      </div>

      <aside className="bg-card rounded-xl border border-border p-4 shadow-card space-y-3 lg:sticky lg:top-20">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-brand-dark">Vista previa</p>
          <button onClick={() => printThermal(html, 'Recibo de prueba')} className="text-[11px] font-semibold text-brand-primary flex items-center gap-1 hover:underline" title="Imprime este ejemplo desde el navegador"><Printer size={12} /> Imprimir ejemplo</button>
        </div>
        <div className="rounded-lg border border-dashed border-border p-3 flex justify-center shadow-inner" style={{ background: '#fff', color: '#111' }}>
          <div className="ticket-preview" dangerouslySetInnerHTML={{ __html: html }} data-receipt-preview />
        </div>
        <p className="text-[10px] text-muted-foreground">Venta de ejemplo (no se guarda). En la térmica todo sale en negro.</p>
      </aside>
    </div>
  );
};

export default ReceiptPanel;
