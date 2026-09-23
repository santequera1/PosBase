import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { api } from '@/lib/api';
import { Save, Check, Plus, X, Edit2, Trash2, Bot, Key, Copy, MessageCircle, Sparkles, Store, Palette, Users, FolderOpen, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';
import BrandingPanel from '@/components/settings/BrandingPanel';
import UsersPanel from '@/components/settings/UsersPanel';

type Tab = 'negocio' | 'marca' | 'usuarios' | 'categorias' | 'integracion';

const INPUT = 'w-full px-4 py-2.5 rounded-lg border border-input bg-card text-sm font-sans outline-none focus:ring-2 focus:ring-primary/20';

// Capacidades del asistente de IA por WhatsApp. La conexión del número la hace el equipo técnico en la instalación;
// aquí solo se elige qué debe hacer el asistente para este negocio.
const AI_CAPABILITIES: Array<{ id: string; label: string; desc: string; group: string }> = [
  { id: 'dailyReport', group: 'Reportes automáticos', label: 'Reporte diario de ventas', desc: 'Al cerrar caja: total del día, métodos de pago y ticket promedio.' },
  { id: 'weeklyReport', group: 'Reportes automáticos', label: 'Reporte semanal', desc: 'Cada lunes: ventas de la semana, sabores más vendidos y comparación con la anterior.' },
  { id: 'monthlyReport', group: 'Reportes automáticos', label: 'Reporte mensual', desc: 'Primer día del mes: ventas, gastos, nómina y utilidad del mes.' },
  { id: 'shiftCloseNotify', group: 'Notificaciones', label: 'Aviso de cierre de caja', desc: 'Envía el cierre Z con arqueo y diferencias cuando el cajero cierra el turno.' },
  { id: 'lowStockAlert', group: 'Notificaciones', label: 'Alerta de stock bajo o agotado', desc: 'Aviso cuando un producto con inventario llega al mínimo o se agota.' },
  { id: 'payablesReminder', group: 'Notificaciones', label: 'Recordatorio de cuentas por pagar', desc: 'Aviso dos días antes del vencimiento de facturas de proveedores.' },
  { id: 'bigSaleNotify', group: 'Notificaciones', label: 'Aviso de ventas grandes o anuladas', desc: 'Notifica pedidos por encima de un monto y cualquier anulación.' },
  { id: 'salesQuery', group: 'Consultas por chat', label: 'Consultar ventas', desc: 'Responde preguntas como "¿cuánto vendimos hoy?" o "¿cómo va la semana?".' },
  { id: 'catalogControl', group: 'Consultas por chat', label: 'Controlar el catálogo', desc: 'Cambiar precios y pausar o reanudar sabores agotados desde el chat.' },
  { id: 'ordersQuery', group: 'Consultas por chat', label: 'Consultar pedidos y clientes', desc: 'Buscar comprobantes recientes y datos de clientes registrados.' },
];
const AI_DEFAULTS: Record<string, boolean> = { dailyReport: true, weeklyReport: true, monthlyReport: false, shiftCloseNotify: true, lowStockAlert: true, payablesReminder: false, bigSaleNotify: false, salesQuery: true, catalogControl: true, ordersQuery: true };
const parseCaps = (raw: any): Record<string, boolean> => {
  try { const o = typeof raw === 'string' ? JSON.parse(raw) : raw; return o && typeof o === 'object' ? { ...AI_DEFAULTS, ...o } : { ...AI_DEFAULTS }; } catch { return { ...AI_DEFAULTS }; }
};

const SettingsPage = () => {
  const { deliveryFee, tableCount, categories, user, addCategory, updateCategory, deleteCategory } = useStore();
  const isAdmin = user?.role === 'admin';
  const [tab, setTab] = useState<Tab>('negocio');

  const [businessName, setBusinessName] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [businessSlogan, setBusinessSlogan] = useState('');
  const [businessNit, setBusinessNit] = useState('');
  const [invoicePrefix, setInvoicePrefix] = useState('');
  const [editDeliveryFee, setEditDeliveryFee] = useState('');
  const [editTableCount, setEditTableCount] = useState('');
  const [taxType, setTaxType] = useState('none');
  const [taxRate, setTaxRate] = useState('');
  const [dianResolution, setDianResolution] = useState('');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [whatsappKey, setWhatsappKey] = useState('');
  const [aiCaps, setAiCaps] = useState<Record<string, boolean>>({ ...AI_DEFAULTS });
  const [aiSaved, setAiSaved] = useState(false);
  const webhookUrl = `${window.location.origin}/api/whatsapp-ai/webhook`;

  const toggleCap = (id: string) => {
    const next = { ...aiCaps, [id]: !aiCaps[id] };
    setAiCaps(next);
    api.updateSettings({ aiCapabilities: JSON.stringify(next) })
      .then(() => { setAiSaved(true); setTimeout(() => setAiSaved(false), 1500); })
      .catch(() => setAiCaps(aiCaps));
  };

  // Category form
  const [showCatForm, setShowCatForm] = useState(false);
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [catName, setCatName] = useState('');
  const [catEmoji, setCatEmoji] = useState('');
  const [catColor, setCatColor] = useState('#6B7280');

  useEffect(() => {
    if (isAdmin) api.getIntegration().then(i => setWhatsappKey(i.whatsappApiKey || '')).catch(() => {});
    api.getSettings().then(s => {
      setBusinessName(s.businessName || 'Mi Heladería');
      setBusinessSlogan(s.businessSlogan ? String(s.businessSlogan) : '');
      setBusinessPhone(s.businessPhone ? String(s.businessPhone) : '');
      setBusinessAddress(s.businessAddress ? String(s.businessAddress) : '');
      setBusinessNit(s.businessNit ? String(s.businessNit) : '');
      setInvoicePrefix(s.invoicePrefix ? String(s.invoicePrefix) : 'POS');
      setEditDeliveryFee(String(s.deliveryFee || deliveryFee));
      setEditTableCount(String(s.tableCount || tableCount));
      setTaxType(s.taxType ? String(s.taxType) : 'none');
      setTaxRate(s.taxRate !== undefined && s.taxRate !== '' && s.taxRate !== null ? String(s.taxRate) : '');
      setDianResolution(s.dianResolution ? String(s.dianResolution) : '');
      setAiCaps(parseCaps(s.aiCapabilities));
    }).catch(() => {
      setEditDeliveryFee(String(deliveryFee));
      setEditTableCount(String(tableCount));
    });
  }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      const payload = {
        businessName,
        businessSlogan,
        businessPhone,
        businessAddress,
        businessNit,
        invoicePrefix: invoicePrefix.trim().toUpperCase() || 'POS',
        deliveryFee: Number(editDeliveryFee),
        tableCount: Number(editTableCount),
        taxType,
        taxRate: taxType === 'none' ? 0 : Number(taxRate) || 0,
        dianResolution: dianResolution.trim(),
      };
      await api.updateSettings(payload);
      useStore.setState(payload);
      if (typeof document !== 'undefined') document.title = `${businessName} — Punto de Venta`;
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Error saving settings:', err);
    }
    setLoading(false);
  };

  const openEditCat = (id: number) => {
    const c = categories.find(cat => cat.id === id);
    if (!c) return;
    setCatName(c.name);
    setCatEmoji(c.emoji);
    setCatColor(c.color);
    setEditingCatId(id);
    setShowCatForm(true);
  };

  const handleSaveCat = () => {
    if (!catName || !catEmoji) return;
    if (editingCatId) {
      updateCategory(editingCatId, { name: catName, emoji: catEmoji, color: catColor });
    } else {
      addCategory({ name: catName, emoji: catEmoji, color: catColor });
    }
    setShowCatForm(false);
    setEditingCatId(null);
    setCatName('');
    setCatEmoji('');
    setCatColor('#6B7280');
  };

  const handleDeleteCat = (id: number, name: string) => {
    if (window.confirm(`¿Eliminar la categoría "${name}"? Solo se puede eliminar si no tiene productos.`)) {
      deleteCategory(id);
    }
  };

  const tabs: Array<{ id: Tab; label: string; icon: any; adminOnly?: boolean }> = [
    { id: 'negocio', label: 'Negocio', icon: Store },
    { id: 'marca', label: 'Marca', icon: Palette, adminOnly: true },
    { id: 'usuarios', label: 'Usuarios', icon: Users, adminOnly: true },
    { id: 'categorias', label: 'Categorías', icon: FolderOpen },
    { id: 'integracion', label: 'IA WhatsApp', icon: Bot, adminOnly: true },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-4 font-sans">
      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {tabs.filter(t => !t.adminOnly || isAdmin).map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn('px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all border',
                tab === t.id ? 'bg-brand-button text-brand-on-button border-brand-primary shadow-card' : 'bg-card text-brand-dark border-border hover:bg-muted/40')}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* ---------- Negocio ---------- */}
      {tab === 'negocio' && (
        <div className="max-w-lg space-y-4">
          <section className="bg-card rounded-xl border border-border p-4 shadow-card space-y-3">
            <h3 className="font-sans font-bold text-sm">🏪 Negocio</h3>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Nombre del negocio / evento</label>
              <input value={businessName} onChange={e => setBusinessName(e.target.value)} className={INPUT} />
              <p className="text-[10px] text-muted-foreground mt-1 font-sans">Este nombre aparece en el header, la pantalla de acceso y los recibos</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Teléfono</label>
              <input value={businessPhone} onChange={e => setBusinessPhone(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Dirección</label>
              <input value={businessAddress} onChange={e => setBusinessAddress(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Eslogan (segunda línea del recibo)</label>
              <input value={businessSlogan} onChange={e => setBusinessSlogan(e.target.value)} className={INPUT} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">NIT / Documento</label>
                <input value={businessNit} onChange={e => setBusinessNit(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Prefijo de comprobante</label>
                <input value={invoicePrefix} onChange={e => setInvoicePrefix(e.target.value.toUpperCase())} placeholder="POS" className={INPUT} />
                <p className="text-[10px] text-muted-foreground mt-1 font-sans">Ej: POS → POS-1001</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Costo de domicilio</label>
                <input type="number" value={editDeliveryFee} onChange={e => setEditDeliveryFee(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Número de mesas</label>
                <input type="number" value={editTableCount} onChange={e => setEditTableCount(e.target.value)} className={INPUT} />
              </div>
            </div>
          </section>

          <section className="bg-card rounded-xl border border-border p-4 shadow-card space-y-3">
            <h3 className="font-sans font-bold text-sm">🧾 Impuestos y facturación</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Impuesto en ventas</label>
                <select value={taxType} onChange={e => { const v = e.target.value; setTaxType(v); if (v === 'inc' && !taxRate) setTaxRate('8'); if (v === 'iva' && !taxRate) setTaxRate('19'); }} className={INPUT}>
                  <option value="none">Sin impuesto (no responsable)</option>
                  <option value="inc">INC · Impuesto al consumo</option>
                  <option value="iva">IVA</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Tarifa (%)</label>
                <input type="number" min={0} max={100} step="0.1" disabled={taxType === 'none'} value={taxRate} onChange={e => setTaxRate(e.target.value)} className={INPUT} />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">Los precios del POS ya incluyen el impuesto. El sistema desglosa base e impuesto en los recibos térmicos y en Finanzas → Contabilidad.</p>
            <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">Facturación electrónica: <b>modo de pruebas</b>. Las ventas marcadas como F.E. generan un documento simulado (prefijo FEP, sin validez fiscal) para demostración. La conexión con el proveedor tecnológico (Factus) se activa después.</p>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Resolución DIAN / leyenda del comprobante (opcional)</label>
              <textarea value={dianResolution} onChange={e => setDianResolution(e.target.value)} rows={2} placeholder="Ej: Resolución DIAN No. 18764... del 01/01/2026, numeración POS-1 a POS-50000" className={INPUT} />
            </div>
          </section>

          <section className="bg-card rounded-xl border border-border p-4 shadow-card font-sans">
            <h3 className="font-sans font-bold text-sm mb-2">👤 Usuario actual</h3>
            <p className="text-sm">{user?.name} <span className="text-xs text-muted-foreground capitalize">({user?.role})</span></p>
          </section>

          {isAdmin && (
            <button onClick={handleSave} disabled={loading}
              className="w-full py-3 rounded-xl gradient-primary text-primary-foreground font-sans font-bold text-sm shadow-fab hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2">
              {saved ? <><Check size={16} /> Guardado</> : loading ? 'Guardando...' : <><Save size={16} /> Guardar configuración</>}
            </button>
          )}
        </div>
      )}

      {/* ---------- Marca ---------- */}
      {tab === 'marca' && isAdmin && <BrandingPanel />}

      {/* ---------- Usuarios ---------- */}
      {tab === 'usuarios' && isAdmin && <UsersPanel />}

      {/* ---------- Categorías ---------- */}
      {tab === 'categorias' && (
        <section className="max-w-lg bg-card rounded-xl border border-border p-4 shadow-card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-sans font-bold text-sm">📂 Categorías</h3>
            <button onClick={() => { setEditingCatId(null); setCatName(''); setCatEmoji(''); setCatColor('#6B7280'); setShowCatForm(true); }}
              className="text-xs text-primary font-medium flex items-center gap-1 font-sans">
              <Plus size={14} /> Agregar
            </button>
          </div>
          <div className="space-y-2">
            {categories.map(c => (
              <div key={c.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                <span className="text-lg">{c.emoji}</span>
                <span className="text-sm font-medium flex-1 font-sans">{c.name}</span>
                <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                <button onClick={() => openEditCat(c.id)} className="text-muted-foreground hover:text-primary"><Edit2 size={14} /></button>
                <button onClick={() => handleDeleteCat(c.id, c.name)} className="text-muted-foreground hover:text-destructive"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>

          {showCatForm && (
            <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-2 font-sans">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold">{editingCatId ? 'Editar' : 'Nueva'} categoría</p>
                <button onClick={() => setShowCatForm(false)}><X size={14} /></button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground mb-0.5 block">Emoji</label>
                  <input value={catEmoji} onChange={e => setCatEmoji(e.target.value)} placeholder="🍨"
                    className="w-full px-3 py-2 rounded-lg border border-input bg-card text-sm text-center outline-none font-sans" />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] text-muted-foreground mb-0.5 block">Nombre</label>
                  <input value={catName} onChange={e => setCatName(e.target.value)} placeholder="Nombre"
                    className="w-full px-3 py-2 rounded-lg border border-input bg-card text-sm outline-none font-sans" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground mb-0.5 block">Color</label>
                <input type="color" value={catColor} onChange={e => setCatColor(e.target.value)}
                  className="w-full h-8 rounded-lg border border-input cursor-pointer" />
              </div>
              <button onClick={handleSaveCat} disabled={!catName || !catEmoji}
                className="w-full py-2 rounded-lg gradient-primary text-primary-foreground text-xs font-semibold disabled:opacity-40 font-sans">
                {editingCatId ? 'Guardar cambios' : 'Crear categoría'}
              </button>
            </div>
          )}
        </section>
      )}

      {/* ---------- Integración IA WhatsApp ---------- */}
      {tab === 'integracion' && isAdmin && (
        <section className="max-w-xl bg-white rounded-2xl border border-brand-primary/15 p-5 shadow-sm space-y-4 font-sans text-left">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center">
                <Bot size={22} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-brand-dark flex items-center gap-1.5">
                  Integración Asistente IA WhatsApp
                  <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold', whatsappKey ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800')}>
                    {whatsappKey ? 'Activo' : 'Sin clave'}
                  </span>
                </h3>
                <p className="text-xs text-gray-400">Control de productos, ventas y pedidos desde WhatsApp</p>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-700 flex items-center gap-1">
              <MessageCircle size={13} className="text-emerald-600" /> Webhook Universal IA (POST)
            </label>
            <div className="flex items-center gap-2">
              <input readOnly value={webhookUrl} className="flex-1 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs font-mono text-gray-700 select-all outline-none" />
              <button type="button" onClick={() => { navigator.clipboard.writeText(webhookUrl); setCopiedWebhook(true); setTimeout(() => setCopiedWebhook(false), 2000); }}
                className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-xs font-semibold text-brand-primary transition-colors flex items-center gap-1 shrink-0">
                {copiedWebhook ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                <span>{copiedWebhook ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-700 flex items-center gap-1">
              <Key size={13} className="text-amber-600" /> Clave de Seguridad (API Key)
            </label>
            <div className="flex items-center gap-2">
              <input readOnly value={whatsappKey || 'Define WHATSAPP_AI_API_KEY en server/.env'} className="flex-1 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs font-mono text-gray-700 select-all outline-none" />
              <button type="button" onClick={() => { navigator.clipboard.writeText(whatsappKey); setCopiedKey(true); setTimeout(() => setCopiedKey(false), 2000); }}
                className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-xs font-semibold text-brand-primary transition-colors flex items-center gap-1 shrink-0">
                {copiedKey ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                <span>{copiedKey ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>
            <p className="text-[10px] text-gray-400">Incluir en la cabecera HTTP: <code>x-api-key: {whatsappKey || 'TU_CLAVE'}</code></p>
          </div>

          <div className="bg-brand-card p-3 rounded-xl border border-brand-accent/30 text-xs text-brand-primary space-y-1.5">
            <span className="font-bold block flex items-center gap-1 text-[11px]">
              <Sparkles size={12} className="text-amber-600" /> Capacidades soportadas por la API de IA:
            </span>
            <ul className="list-disc list-inside text-[11px] space-y-0.5 text-gray-700">
              <li><strong>Consultar ventas:</strong> hoy, ayer, semana o mes con desglose de métodos de pago.</li>
              <li><strong>Catálogo:</strong> buscar productos, precios y disponibilidad actual.</li>
              <li><strong>Cambiar precios:</strong> actualizar valor de productos en vivo vía WhatsApp.</li>
              <li><strong>Disponibilidad:</strong> pausar o reanudar sabores agotados al instante.</li>
              <li><strong>Consultar comprobantes y clientes:</strong> buscar órdenes recientes o datos fiscales.</li>
            </ul>
          </div>

          <div className="space-y-3 pt-2 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm text-brand-dark flex items-center gap-1.5"><ListChecks size={15} className="text-emerald-600" /> Qué debe hacer el asistente</h4>
                <p className="text-[11px] text-gray-400">Marca lo que quieres recibir por WhatsApp. La conexión del número la configura el equipo técnico en la instalación.</p>
              </div>
              <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full transition-opacity', aiSaved ? 'opacity-100 bg-emerald-100 text-emerald-800' : 'opacity-0')}>Guardado ✓</span>
            </div>
            {['Reportes automáticos', 'Notificaciones', 'Consultas por chat'].map(group => (
              <div key={group} className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{group}</p>
                {AI_CAPABILITIES.filter(c => c.group === group).map(c => (
                  <label key={c.id} className={cn('flex items-start gap-3 p-2.5 rounded-xl border cursor-pointer transition-colors', aiCaps[c.id] ? 'border-emerald-200 bg-emerald-50/60' : 'border-gray-200 bg-gray-50/50 hover:bg-gray-50')}>
                    <input type="checkbox" checked={!!aiCaps[c.id]} onChange={() => toggleCap(c.id)} data-cap={c.id}
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 accent-emerald-600 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-brand-dark">{c.label}</span>
                      <span className="block text-[11px] text-gray-500 leading-snug">{c.desc}</span>
                    </span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="text-center text-xs text-muted-foreground font-sans">Sistema POS v2.1</p>
    </div>
  );
};

export default SettingsPage;
