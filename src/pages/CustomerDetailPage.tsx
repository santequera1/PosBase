import { orderNumber } from '@/lib/orderNumber';
import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Phone, MapPin, Mail, FileText, MessageCircle,
  Building2, User, Star, TrendingUp, ShoppingBag, Clock,
  Printer, Edit2, Calendar, CreditCard, CheckCircle2,
  ChevronRight, Heart, Sparkles, X
} from 'lucide-react';
import { useStore, type Customer } from '@/store/useStore';
import { formatPrice, formatDate, formatTime, plural } from '@/lib/format';
import { StatusBadge } from '@/components/StatusBadge';
import { PrintModal } from '@/components/PrintModal';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const CustomerDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { customers, orders, updateCustomer } = useStore();

  const customer = customers.find(c => c.id === Number(id));

  // Modal print state
  const [selectedOrderForPrint, setSelectedOrderForPrint] = useState<any>(null);

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [formIsCompany, setFormIsCompany] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDocType, setFormDocType] = useState('CC');
  const [formDocumentId, setFormDocumentId] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Orders of this customer
  const customerOrders = useMemo(() => {
    if (!customer) return [];
    const phoneClean = customer.phone ? customer.phone.replace(/\D/g, '') : '';
    const docClean = customer.documentId && customer.documentId !== '222222222222' ? customer.documentId : '';

    return orders.filter(o => {
      const oPhoneClean = o.customer?.phone ? o.customer.phone.replace(/\D/g, '') : '';
      const oDocClean = o.customer?.doc || '';
      const oNameMatch = o.customer?.name && customer.name && o.customer.name.toLowerCase() === customer.name.toLowerCase();

      if (phoneClean && oPhoneClean === phoneClean) return true;
      if (docClean && oDocClean === docClean) return true;
      if (oNameMatch && customer.name !== 'Consumidor Final') return true;
      return false;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [customer, orders]);

  // Analytics
  const stats = useMemo(() => {
    const totalOrders = customerOrders.length;
    const nonCancelled = customerOrders.filter(o => o.status !== 'cancelled');
    const totalSpent = nonCancelled.reduce((sum, o) => sum + (o.total || 0), 0);
    const avgTicket = totalOrders > 0 ? Math.round(totalSpent / totalOrders) : 0;
    const lastOrder = customerOrders.length > 0 ? customerOrders[0].createdAt : null;

    // Favorite flavors calculation
    const flavorMap: Record<string, number> = {};
    for (const ord of nonCancelled) {
      for (const item of ord.items || []) {
        if (item.flavors) {
          const parts = item.flavors.split(/[,+y/]/).map(s => s.trim()).filter(Boolean);
          for (const f of parts) {
            flavorMap[f] = (flavorMap[f] || 0) + (item.quantity || 1);
          }
        } else if (item.name) {
          const cleanName = item.name.replace(/^Gelato\s*(en\s*Vaso|en\s*Cono|de\s*Litro)?\s*(\(.*?\))?\s*[-—]?\s*/i, '').trim();
          flavorMap[cleanName] = (flavorMap[cleanName] || 0) + (item.quantity || 1);
        }
      }
    }

    const topFlavors = Object.entries(flavorMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return { totalOrders, totalSpent, avgTicket, lastOrder, topFlavors };
  }, [customerOrders]);

  if (!customer) {
    return (
      <div className="text-center py-20 font-sans">
        <div className="w-16 h-16 rounded-2xl bg-brand-card border border-brand-accent/30 flex items-center justify-center text-brand-primary mx-auto mb-3">
          <User size={30} />
        </div>
        <h2 className="text-lg font-bold text-brand-dark">Cliente no encontrado</h2>
        <p className="text-xs text-gray-500 mt-1">El cliente solicitado no existe o fue eliminado.</p>
        <button
          onClick={() => navigate('/customers')}
          className="mt-4 px-4 py-2 rounded-xl bg-brand-button text-brand-on-button text-xs font-semibold shadow-sm hover:bg-brand-surface transition-all"
        >
          ← Volver al Directorio
        </button>
      </div>
    );
  }

  const isCompany = customer.isCompany || (customer.documentId && customer.documentId.length >= 9 && customer.documentId !== '222222222222');
  const isVIP = customer.tag === 'frequent' || stats.totalOrders > 5;
  const cleanPhone = customer.phone ? customer.phone.replace(/\D/g, '') : '';

  const openEdit = () => {
    setFormIsCompany(Boolean(customer.isCompany));
    setFormName(customer.name || '');
    setFormDocType(customer.isCompany ? 'NIT' : 'CC');
    setFormDocumentId(customer.documentId === '222222222222' ? '' : (customer.documentId || ''));
    setFormEmail(customer.email || '');
    setFormPhone(customer.phone || '');
    setFormAddress(customer.address || '');
    setFormNotes(customer.notes || '');
    setShowEditModal(true);
  };

  const handleSaveEdit = () => {
    if (!formName.trim() || !formPhone.trim()) return;

    updateCustomer(customer.id, {
      name: formName.trim(),
      documentId: formDocumentId.trim() || '222222222222',
      email: formEmail.trim(),
      phone: formPhone.trim(),
      address: formAddress.trim(),
      notes: formNotes.trim(),
      isCompany: formIsCompany,
    });

    setShowEditModal(false);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5 font-sans pb-12">
      {/* Top Breadcrumb & Actions */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate('/customers')}
            className="w-9 h-9 rounded-xl bg-white border border-brand-primary/15 hover:bg-brand-card flex items-center justify-center text-brand-primary shadow-xs transition-all"
            title="Volver"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <span className="hover:underline cursor-pointer" onClick={() => navigate('/customers')}>Directorio</span>
              <span>/</span>
              <span className="text-brand-primary font-semibold">Perfil del Cliente</span>
            </div>
            <h1 className="text-xl font-bold text-brand-dark tracking-tight mt-0.5">
              Ficha 360° del Cliente
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {cleanPhone && (
            <a
              href={`https://wa.me/57${cleanPhone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-all"
            >
              <MessageCircle size={14} />
              <span className="hidden sm:inline">WhatsApp</span>
            </a>
          )}
          <button
            onClick={openEdit}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-brand-primary/20 text-brand-primary hover:bg-brand-card text-xs font-semibold shadow-xs transition-all"
          >
            <Edit2 size={13} />
            <span>Editar Ficha</span>
          </button>
        </div>
      </div>

      {/* Main 2-Column Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column (Identity & F.E. details) - 4 cols on lg */}
        <div className="lg:col-span-4 space-y-4">
          {/* Identity Card */}
          <div className="bg-white rounded-2xl p-5 border border-brand-primary/10 shadow-sm relative overflow-hidden">
            {/* Top decorative stripe */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-brand-button" />

            <div className="flex items-start gap-3.5 mb-4 mt-1">
              <div className={cn(
                'w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-xl shrink-0 shadow-xs',
                isCompany
                  ? 'bg-blue-50 text-brand-primary border border-blue-200'
                  : isVIP
                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                  : 'bg-brand-card text-brand-primary border border-brand-accent/40'
              )}>
                {isCompany ? <Building2 size={24} /> : (customer.name ? customer.name[0].toUpperCase() : 'C')}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-extrabold text-base text-brand-dark leading-snug">
                  {customer.name}
                </h2>
                <div className="flex items-center gap-1.5 flex-wrap mt-1">
                  {isVIP && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-200 flex items-center gap-1">
                      <Star size={10} className="fill-amber-500 text-amber-500" /> Cliente VIP
                    </span>
                  )}
                  {isCompany ? (
                    <span className="px-2 py-0.5 rounded-full bg-blue-100 text-brand-primary text-[10px] font-bold border border-blue-200">
                      Empresa
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-medium border border-gray-200">
                      Persona Natural
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Direct Contact info */}
            <div className="space-y-2.5 pt-3 border-t border-gray-100 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 flex items-center gap-1.5">
                  <Phone size={13} className="text-gray-400" /> Celular:
                </span>
                <span className="font-mono font-semibold text-gray-800">
                  {customer.phone || 'No registrado'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-400 flex items-center gap-1.5">
                  <Mail size={13} className="text-gray-400" /> Correo:
                </span>
                <span className="font-mono text-[11px] text-gray-700 truncate max-w-[170px]">
                  {customer.email || 'No registrado'}
                </span>
              </div>

              <div className="flex items-start justify-between gap-2">
                <span className="text-gray-400 flex items-center gap-1.5 shrink-0 mt-0.5">
                  <MapPin size={13} className="text-gray-400" /> Dirección:
                </span>
                <span className="text-[11px] text-gray-700 text-right">
                  {customer.address || 'Colombia'}
                </span>
              </div>
            </div>
          </div>

          {/* Facturación Electrónica (DIAN) Card */}
          <div className="bg-white rounded-2xl p-4 border border-brand-primary/10 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-xs text-brand-dark flex items-center gap-1.5">
                <Building2 size={14} className="text-brand-primary" />
                Datos de Facturación Electrónica
              </h3>
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60 flex items-center gap-0.5">
                <CheckCircle2 size={11} /> DIAN
              </span>
            </div>

            <div className="bg-gray-50/80 rounded-xl p-3 border border-gray-200/60 space-y-2 text-xs">
              <div>
                <span className="text-[10px] text-gray-400 font-medium block">Razón Social o Nombre DIAN:</span>
                <span className="font-semibold text-gray-800 block text-xs mt-0.5">{customer.name}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-gray-100">
                <div>
                  <span className="text-[10px] text-gray-400 font-medium block">NIT / Cédula:</span>
                  <span className="font-mono font-bold text-gray-800 block text-xs mt-0.5">
                    {customer.documentId && customer.documentId !== '222222222222' ? customer.documentId : '222222222222'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 font-medium block">Tipo Persona:</span>
                  <span className="text-gray-700 block text-xs mt-0.5">
                    {isCompany ? 'Jurídica' : 'Natural'}
                  </span>
                </div>
              </div>

              <div className="pt-1.5 border-t border-gray-100">
                <span className="text-[10px] text-gray-400 font-medium block">Email Radicación DIAN:</span>
                <span className="font-mono text-gray-700 block text-[11px] mt-0.5 truncate">
                  {customer.email || 'consumidorfinal@ejemplo.com'}
                </span>
              </div>
            </div>
          </div>

          {/* Preferences & Notes Card */}
          <div className="bg-white rounded-2xl p-4 border border-brand-primary/10 shadow-sm space-y-2.5">
            <h3 className="font-bold text-xs text-brand-dark flex items-center gap-1.5">
              <Heart size={14} className="text-brand-primary" />
              Notas de Servicio & Preferencias
            </h3>
            {customer.notes ? (
              <div className="p-3 bg-brand-card/70 rounded-xl border border-brand-accent/30 text-xs text-gray-700 leading-relaxed">
                {customer.notes}
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic py-1">
                Sin notas registradas. Haz clic en "Editar Ficha" para agregar gustos o especificaciones.
              </p>
            )}
          </div>
        </div>

        {/* Right Column (Analytics & Order History) - 8 cols on lg */}
        <div className="lg:col-span-8 space-y-4">
          {/* KPI Summary Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl p-3.5 border border-brand-primary/10 shadow-sm">
              <span className="text-[11px] font-medium text-gray-500 block">Total Comprado</span>
              <span className="text-lg lg:text-xl font-black text-brand-dark block mt-0.5">
                {formatPrice(stats.totalSpent)}
              </span>
              <span className="text-[10px] text-gray-400 mt-0.5 block">Histórico acumulado</span>
            </div>

            <div className="bg-white rounded-2xl p-3.5 border border-brand-primary/10 shadow-sm">
              <span className="text-[11px] font-medium text-gray-500 block">Pedidos Realizados</span>
              <span className="text-lg lg:text-xl font-black text-brand-primary block mt-0.5">
                {stats.totalOrders}
              </span>
              <span className="text-[10px] text-gray-400 mt-0.5 block">{stats.totalOrders === 1 ? 'comprobante' : 'comprobantes'}</span>
            </div>

            <div className="bg-white rounded-2xl p-3.5 border border-brand-primary/10 shadow-sm">
              <span className="text-[11px] font-medium text-gray-500 block">Ticket Promedio</span>
              <span className="text-lg lg:text-xl font-black text-brand-dark block mt-0.5">
                {formatPrice(stats.avgTicket)}
              </span>
              <span className="text-[10px] text-emerald-600 font-semibold mt-0.5 block">por compra</span>
            </div>

            <div className="bg-white rounded-2xl p-3.5 border border-brand-primary/10 shadow-sm">
              <span className="text-[11px] font-medium text-gray-500 block">Última Visita</span>
              <span className="text-sm lg:text-base font-bold text-brand-dark block mt-1 truncate">
                {stats.lastOrder ? formatDate(stats.lastOrder) : '—'}
              </span>
              <span className="text-[10px] text-gray-400 mt-0.5 block">
                {stats.lastOrder ? formatTime(stats.lastOrder) : 'Sin visitas'}
              </span>
            </div>
          </div>

          {/* Favorite Flavors Section */}
          {stats.topFlavors.length > 0 && (
            <div className="bg-white rounded-2xl p-4 border border-brand-primary/10 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-xs text-brand-dark flex items-center gap-1.5">
                  <Sparkles size={14} className="text-amber-500" />
                  Sabores & Productos Favoritos del Cliente
                </h3>
                <span className="text-[10px] text-gray-400 font-medium">Basado en sus compras</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {stats.topFlavors.map(([flavor, count], idx) => (
                  <span
                    key={flavor}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-brand-card text-brand-primary border border-brand-accent/40"
                  >
                    <span className="text-amber-600 font-bold">#{idx + 1}</span>
                    <span>{flavor}</span>
                    <span className="px-1.5 py-0.2 rounded-md bg-brand-button text-brand-on-button text-[10px] font-bold">
                      {count}x
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Order History */}
          <div className="bg-white rounded-2xl border border-brand-primary/10 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-white">
              <div>
                <h3 className="font-bold text-sm text-brand-dark">Historial de Comprobantes</h3>
                <p className="text-xs text-gray-400">Todos los comprobantes y facturas emitidos a este cliente</p>
              </div>
              <span className="text-xs font-semibold text-gray-600 bg-gray-100 px-2.5 py-1 rounded-lg">
                {customerOrders.length} registro(s)
              </span>
            </div>

            {customerOrders.length === 0 ? (
              <div className="py-14 text-center text-gray-400">
                <ShoppingBag size={36} className="mx-auto mb-2 opacity-30 text-brand-primary" />
                <p className="text-xs">No hay pedidos registrados para este cliente.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {customerOrders.map(order => {
                  const formattedDate = new Date(order.createdAt).toLocaleDateString('es-CO', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  });
                  const formattedTime = new Date(order.createdAt).toLocaleTimeString('es-CO', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={order.id}
                      className="p-4 hover:bg-brand-card/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                    >
                      {/* Left: Invoice info */}
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs text-brand-primary font-mono">
                            {orderNumber(order.id)}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-brand-card text-brand-primary border border-brand-accent/40">
                            {order.paymentMethod === 'cash' ? 'Efectivo' :
                             order.paymentMethod === 'card_debit' ? 'T. Débito' :
                             order.paymentMethod === 'card_credit' ? 'T. Crédito' : 'Transferencia QR'}
                          </span>
                          <span className="text-[11px] text-gray-400 flex items-center gap-1">
                            <Calendar size={11} /> {formattedDate} — {formattedTime}
                          </span>
                        </div>

                        {/* Items summary */}
                        <p className="text-xs text-gray-600 truncate max-w-xl">
                          {(order.items || []).map(i => `${i.quantity}x ${i.name}${i.flavors ? ` (${i.flavors})` : ''}`).join(', ')}
                        </p>
                      </div>

                      {/* Right: Total & Actions */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                        <div className="text-left sm:text-right">
                          <span className="text-[10px] text-gray-400 block">Total Comprobante</span>
                          <span className="font-black text-sm text-brand-dark block">
                            {formatPrice(order.total)}
                          </span>
                        </div>

                        <button
                          onClick={() => setSelectedOrderForPrint(order)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-brand-primary/20 text-brand-primary hover:bg-brand-card text-xs font-semibold shadow-xs transition-all"
                          title="Imprimir Factura Térmica"
                        >
                          <Printer size={13} />
                          <span>Reimprimir</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Customer Modal */}
      <AnimatePresence>
        {showEditModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
            onClick={() => setShowEditModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl border border-gray-100 my-8 text-left"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-gray-100">
                <div>
                  <h2 className="font-bold text-lg text-brand-dark">Editar Ficha del Cliente</h2>
                  <p className="text-xs text-gray-400">Actualiza los datos personales y de facturación</p>
                </div>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Company Switcher */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-xl mb-4 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setFormIsCompany(false)}
                  className={cn(
                    'py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all',
                    !formIsCompany ? 'bg-white text-brand-dark shadow-xs' : 'text-gray-500 hover:text-gray-800'
                  )}
                >
                  <User size={14} /> Persona Natural
                </button>
                <button
                  type="button"
                  onClick={() => setFormIsCompany(true)}
                  className={cn(
                    'py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all',
                    formIsCompany ? 'bg-white text-brand-dark shadow-xs' : 'text-gray-500 hover:text-gray-800'
                  )}
                >
                  <Building2 size={14} /> Empresa (NIT)
                </button>
              </div>

              <div className="space-y-3.5 text-xs">
                <div>
                  <label className="font-semibold text-gray-700 mb-1 block">
                    {formIsCompany ? 'Razón Social / Nombre' : 'Nombre Completo'} *
                  </label>
                  <input
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-primary text-xs font-medium"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1">
                    <label className="font-semibold text-gray-700 mb-1 block">Tipo Doc.</label>
                    <select
                      value={formDocType}
                      onChange={e => setFormDocType(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-brand-primary text-xs font-medium"
                    >
                      <option value="CC">Cédula (CC)</option>
                      <option value="NIT">NIT</option>
                      <option value="CE">Cédula Ext. (CE)</option>
                      <option value="PP">Pasaporte</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="font-semibold text-gray-700 mb-1 block">Número de Documento</label>
                    <input
                      value={formDocumentId}
                      onChange={e => setFormDocumentId(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-primary text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="font-semibold text-gray-700 mb-1 block">Teléfono / WhatsApp *</label>
                    <input
                      value={formPhone}
                      onChange={e => setFormPhone(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-primary text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-gray-700 mb-1 block">Correo F.E. DIAN</label>
                    <input
                      type="email"
                      value={formEmail}
                      onChange={e => setFormEmail(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-primary text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-gray-700 mb-1 block">Dirección Fiscal / Entrega</label>
                  <input
                    value={formAddress}
                    onChange={e => setFormAddress(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-primary text-xs"
                  />
                </div>

                <div>
                  <label className="font-semibold text-gray-700 mb-1 block">Notas / Sabores Preferidos</label>
                  <input
                    value={formNotes}
                    onChange={e => setFormNotes(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-primary text-xs"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={!formName.trim() || !formPhone.trim()}
                    className="px-5 py-2 rounded-xl bg-brand-button text-brand-on-button text-xs font-bold hover:bg-brand-surface shadow-md transition-all disabled:opacity-40"
                  >
                    Guardar Cambios
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Thermal Invoice Print Modal */}
      <PrintModal
        isOpen={!!selectedOrderForPrint}
        onClose={() => setSelectedOrderForPrint(null)}
        order={selectedOrderForPrint}
      />
    </div>
  );
};

export default CustomerDetailPage;
