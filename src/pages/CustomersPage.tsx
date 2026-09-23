import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Phone, MapPin, Plus, Edit2, Trash2, X, LayoutGrid,
  Table as TableIcon, MessageCircle, Building2, User, Star,
  TrendingUp, Users, ArrowUpRight, Mail, FileText, CheckCircle2
} from 'lucide-react';
import { useStore, type Customer } from '@/store/useStore';
import { formatPrice, plural } from '@/lib/format';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

type ViewMode = 'table' | 'cards';
type FilterTab = 'all' | 'frequent' | 'companies' | 'new';

const CustomersPage = () => {
  const navigate = useNavigate();
  const { customers, addCustomer, updateCustomer, deleteCustomer } = useStore();

  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  // Form states
  const [formIsCompany, setFormIsCompany] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDocType, setFormDocType] = useState('CC');
  const [formDocumentId, setFormDocumentId] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  // Computed KPIs
  const stats = useMemo(() => {
    const total = customers.length;
    const frequent = customers.filter(c => c.tag === 'frequent' || c.totalOrders > 5).length;
    const companies = customers.filter(c => c.isCompany || (c.documentId && c.documentId !== '222222222222' && c.documentId.length >= 9)).length;
    const totalRevenue = customers.reduce((acc, c) => acc + (c.totalSpent || 0), 0);
    const totalOrders = customers.reduce((acc, c) => acc + (c.totalOrders || 0), 0);
    const avgTicket = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
    return { total, frequent, companies, totalRevenue, totalOrders, avgTicket };
  }, [customers]);

  // Filtering
  const filtered = useMemo(() => {
    return customers.filter(c => {
      const matchesSearch = !search ||
        `${c.name} ${c.phone} ${c.documentId || ''} ${c.email || ''}`.toLowerCase().includes(search.toLowerCase());

      if (!matchesSearch) return false;

      if (activeTab === 'frequent') return c.tag === 'frequent' || c.totalOrders > 5;
      if (activeTab === 'companies') return c.isCompany || (c.documentId && c.documentId !== '222222222222' && c.documentId.length >= 9);
      if (activeTab === 'new') return c.tag === 'new' || c.totalOrders <= 1;

      return true;
    });
  }, [customers, search, activeTab]);

  const openAdd = () => {
    setEditingCustomer(null);
    setFormIsCompany(false);
    setFormName('');
    setFormDocType('CC');
    setFormDocumentId('');
    setFormEmail('');
    setFormPhone('');
    setFormAddress('');
    setFormNotes('');
    setShowModal(true);
  };

  const openEdit = (c: Customer, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCustomer(c);
    setFormIsCompany(Boolean(c.isCompany));
    setFormName(c.name || '');
    setFormDocType(c.isCompany ? 'NIT' : 'CC');
    setFormDocumentId(c.documentId === '222222222222' ? '' : (c.documentId || ''));
    setFormEmail(c.email || '');
    setFormPhone(c.phone || '');
    setFormAddress(c.address || '');
    setFormNotes(c.notes || '');
    setShowModal(true);
  };

  const handleSave = () => {
    if (!formName.trim() || !formPhone.trim()) return;

    const doc = formDocumentId.trim() || '222222222222';
    const payload = {
      name: formName.trim(),
      documentId: doc,
      email: formEmail.trim(),
      phone: formPhone.trim(),
      address: formAddress.trim(),
      notes: formNotes.trim(),
      isCompany: formIsCompany,
    };

    if (editingCustomer) {
      updateCustomer(editingCustomer.id, payload);
    } else {
      addCustomer(payload);
    }
    setShowModal(false);
  };

  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDelete === id) {
      deleteCustomer(id);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete(null), 3500);
    }
  };

  return (
    <div className="space-y-5 font-sans pb-10">
      {/* Header & Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-bold text-xl sm:text-2xl text-[#242D49] tracking-tight flex items-center gap-2">
            <Users size={24} className="text-[#364266]" />
            Directorio de Clientes & F.E.
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Gestión de clientes, perfiles de fidelización y datos para Facturación Electrónica DIAN
          </p>
        </div>

        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#364266] text-[#FEF3DE] font-semibold text-xs shadow-md hover:bg-[#242D49] hover:shadow-lg transition-all self-start sm:self-auto"
        >
          <Plus size={16} />
          <span>Registrar Cliente / Empresa</span>
        </button>
      </div>

      {/* KPI Metrics Summary Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white rounded-2xl p-4 border border-[#364266]/10 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-gray-500 block">Total Clientes</span>
            <span className="text-xl lg:text-2xl font-black text-[#242D49] block mt-0.5">{stats.total}</span>
            <span className="text-[10px] text-gray-400 mt-0.5 block">{stats.totalOrders} pedidos totales</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-[#FAF8EA] border border-[#C6BF81]/30 flex items-center justify-center text-[#364266]">
            <Users size={20} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-[#364266]/10 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-gray-500 block">Clientes VIP / Frecuentes</span>
            <span className="text-xl lg:text-2xl font-black text-[#B0892E] block mt-0.5">{stats.frequent}</span>
            <span className="text-[10px] text-gray-400 mt-0.5 block">&gt; 5 compras registradas</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200/50 flex items-center justify-center text-amber-600">
            <Star size={20} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-[#364266]/10 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-gray-500 block">Facturación Electrónica</span>
            <span className="text-xl lg:text-2xl font-black text-[#364266] block mt-0.5">{stats.companies}</span>
            <span className="text-[10px] text-gray-400 mt-0.5 block">Empresas o NIT registrados</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-200/50 flex items-center justify-center text-[#364266]">
            <Building2 size={20} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-[#364266]/10 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-gray-500 block">Ticket Promedio</span>
            <span className="text-xl lg:text-2xl font-black text-[#242D49] block mt-0.5">{formatPrice(stats.avgTicket)}</span>
            <span className="text-[10px] text-emerald-600 font-semibold mt-0.5 block flex items-center gap-0.5">
              <TrendingUp size={11} /> {formatPrice(stats.totalRevenue)} acumulados
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200/50 flex items-center justify-center text-emerald-700">
            <ArrowUpRight size={20} />
          </div>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="bg-white rounded-2xl p-3 border border-[#364266]/10 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, razón social, teléfono, NIT o correo..."
            className="w-full pl-9 pr-8 py-2 rounded-xl text-xs bg-gray-50 border border-gray-200 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#364266] transition-all"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Tab Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('all')}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all',
              activeTab === 'all'
                ? 'bg-[#364266] text-[#FEF3DE] shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            Todos ({customers.length})
          </button>
          <button
            onClick={() => setActiveTab('frequent')}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1',
              activeTab === 'frequent'
                ? 'bg-[#364266] text-[#FEF3DE] shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            <Star size={12} className={activeTab === 'frequent' ? 'text-amber-300' : 'text-amber-500'} />
            <span>VIP / Frecuentes</span>
          </button>
          <button
            onClick={() => setActiveTab('companies')}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1',
              activeTab === 'companies'
                ? 'bg-[#364266] text-[#FEF3DE] shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            <Building2 size={12} />
            <span>Facturación Electrónica (NIT)</span>
          </button>
          <button
            onClick={() => setActiveTab('new')}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all',
              activeTab === 'new'
                ? 'bg-[#364266] text-[#FEF3DE] shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            Nuevos
          </button>

          {/* View Toggle */}
          <div className="flex items-center gap-0.5 bg-gray-100 p-0.5 rounded-xl ml-1 border border-gray-200">
            <button
              onClick={() => setViewMode('table')}
              className={cn('p-1.5 rounded-lg transition-all', viewMode === 'table' ? 'bg-white text-[#364266] shadow-sm' : 'text-gray-400 hover:text-gray-600')}
              title="Vista Tabla Ejecutiva"
            >
              <TableIcon size={14} />
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={cn('p-1.5 rounded-lg transition-all', viewMode === 'cards' ? 'bg-white text-[#364266] shadow-sm' : 'text-gray-400 hover:text-gray-600')}
              title="Vista Tarjetas"
            >
              <LayoutGrid size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content: Table View or Cards View */}
      {viewMode === 'table' ? (
        <div className="bg-white rounded-2xl border border-[#364266]/10 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#242D49] text-[#FEF3DE] font-semibold">
                  <th className="py-3 px-4">Cliente / Razón Social</th>
                  <th className="py-3 px-4">Identificación (NIT / CC)</th>
                  <th className="py-3 px-4">Contacto Directo</th>
                  <th className="py-3 px-4">Email Facturación</th>
                  <th className="py-3 px-4 text-center">Pedidos</th>
                  <th className="py-3 px-4 text-right">Total Acumulado</th>
                  <th className="py-3 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-400">
                      <Users size={32} className="mx-auto mb-2 opacity-40 text-[#364266]" />
                      No se encontraron clientes con el filtro seleccionado.
                    </td>
                  </tr>
                ) : (
                  filtered.map(c => {
                    const isCompany = c.isCompany || (c.documentId && c.documentId.length >= 9 && c.documentId !== '222222222222');
                    const isVIP = c.tag === 'frequent' || c.totalOrders > 5;
                    const cleanPhone = c.phone ? c.phone.replace(/\D/g, '') : '';

                    return (
                      <tr
                        key={c.id}
                        onClick={() => navigate(`/customers/${c.id}`)}
                        className="hover:bg-[#FAF8EA]/50 transition-colors group cursor-pointer"
                      >
                        {/* Name & Avatar */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              'w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 shadow-xs',
                              isCompany
                                ? 'bg-blue-50 text-[#364266] border border-blue-200'
                                : isVIP
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-[#FAF8EA] text-[#364266] border border-[#C6BF81]/40'
                            )}>
                              {isCompany ? <Building2 size={16} /> : (c.name ? c.name[0].toUpperCase() : 'C')}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-[#242D49] text-xs truncate hover:underline">
                                  {c.name}
                                </span>
                                {isVIP && (
                                  <span className="px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-200 flex items-center gap-0.5 shrink-0">
                                    <Star size={10} className="fill-amber-500 text-amber-500" /> VIP
                                  </span>
                                )}
                                {isCompany && (
                                  <span className="px-1.5 py-0.2 rounded-full bg-blue-100 text-[#364266] text-[10px] font-bold border border-blue-200 shrink-0">
                                    F.E. DIAN
                                  </span>
                                )}
                              </div>
                              {c.notes && (
                                <p className="text-[11px] text-gray-400 truncate max-w-[200px]">
                                  {c.notes}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Document ID */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {c.documentId && c.documentId !== '222222222222' ? (
                            <span className="font-mono text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-md border border-gray-200">
                              {c.documentId}
                            </span>
                          ) : (
                            <span className="text-[11px] text-gray-400 italic">Consumidor final</span>
                          )}
                        </td>

                        {/* Phone & WhatsApp */}
                        <td className="py-3.5 px-4 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs text-gray-700">{c.phone || '—'}</span>
                            {cleanPhone && (
                              <a
                                href={`https://wa.me/57${cleanPhone}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1 rounded-lg hover:bg-emerald-50 text-emerald-600 transition-colors"
                                title="Abrir WhatsApp"
                              >
                                <MessageCircle size={14} />
                              </a>
                            )}
                          </div>
                        </td>

                        {/* Email */}
                        <td className="py-3.5 px-4">
                          {c.email ? (
                            <span className="text-gray-600 truncate max-w-[160px] block font-mono text-[11px]">
                              {c.email}
                            </span>
                          ) : (
                            <span className="text-gray-300 text-[11px]">—</span>
                          )}
                        </td>

                        {/* Orders count */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <span className="inline-block px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700 font-bold text-[11px]">
                            {c.totalOrders || 0}
                          </span>
                        </td>

                        {/* Total Spent */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <span className="font-extrabold text-[#242D49] text-xs block">
                            {formatPrice(c.totalSpent || 0)}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => navigate(`/customers/${c.id}`)}
                              className="p-1.5 rounded-lg hover:bg-[#FAF8EA] text-[#364266] transition-colors"
                              title="Ver Perfil 360°"
                            >
                              <ArrowUpRight size={15} />
                            </button>
                            <button
                              onClick={e => openEdit(c, e)}
                              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-[#364266] transition-colors"
                              title="Editar Datos"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={e => handleDelete(c.id, e)}
                              className={cn(
                                'p-1.5 rounded-lg transition-colors',
                                confirmDelete === c.id
                                  ? 'bg-red-500 text-white shadow-xs'
                                  : 'hover:bg-red-50 text-gray-400 hover:text-red-600'
                              )}
                              title={confirmDelete === c.id ? '¿Confirmar eliminación?' : 'Eliminar'}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>Mostrando {filtered.length} de {customers.length} cliente(s)</span>
            <span>Volumen Total Registrado: <strong>{formatPrice(stats.totalRevenue)}</strong></span>
          </div>
        </div>
      ) : (
        /* Cards View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {filtered.map(c => {
            const isCompany = c.isCompany || (c.documentId && c.documentId.length >= 9 && c.documentId !== '222222222222');
            const isVIP = c.tag === 'frequent' || c.totalOrders > 5;
            const cleanPhone = c.phone ? c.phone.replace(/\D/g, '') : '';

            return (
              <div
                key={c.id}
                onClick={() => navigate(`/customers/${c.id}`)}
                className="bg-white rounded-2xl border border-[#364266]/10 p-4 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0',
                        isCompany
                          ? 'bg-blue-50 text-[#364266] border border-blue-200'
                          : isVIP
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : 'bg-[#FAF8EA] text-[#364266] border border-[#C6BF81]/40'
                      )}>
                        {isCompany ? <Building2 size={18} /> : (c.name ? c.name[0].toUpperCase() : 'C')}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-sm text-[#242D49] truncate group-hover:text-[#364266]">
                          {c.name}
                        </h4>
                        <span className="text-[11px] text-gray-500 font-mono block">
                          {c.documentId && c.documentId !== '222222222222' ? `NIT/CC: ${c.documentId}` : 'Consumidor Final'}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {isVIP && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-200 flex items-center gap-0.5">
                          <Star size={10} className="fill-amber-500 text-amber-500" /> VIP
                        </span>
                      )}
                      {isCompany && (
                        <span className="px-2 py-0.5 rounded-full bg-blue-100 text-[#364266] text-[10px] font-bold border border-blue-200">
                          Empresa
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1 text-xs text-gray-600 bg-gray-50/70 p-2.5 rounded-xl border border-gray-100">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 flex items-center gap-1"><Phone size={12} /> Tel:</span>
                      <span className="font-mono font-medium">{c.phone || '—'}</span>
                    </div>
                    {c.email && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 flex items-center gap-1"><Mail size={12} /> Email:</span>
                        <span className="font-mono text-[11px] truncate max-w-[140px]">{c.email}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-gray-400 block">{plural(c.totalOrders || 0, 'pedido')}</span>
                    <span className="text-xs font-extrabold text-[#242D49]">{formatPrice(c.totalSpent || 0)}</span>
                  </div>

                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    {cleanPhone && (
                      <a
                        href={`https://wa.me/57${cleanPhone}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-7 h-7 rounded-lg hover:bg-emerald-50 flex items-center justify-center text-emerald-600 transition-colors"
                        title="WhatsApp"
                      >
                        <MessageCircle size={14} />
                      </a>
                    )}
                    <button
                      onClick={e => openEdit(c, e)}
                      className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors"
                      title="Editar"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={e => handleDelete(c.id, e)}
                      className={cn(
                        'w-7 h-7 rounded-lg flex items-center justify-center transition-colors',
                        confirmDelete === c.id ? 'bg-red-500 text-white' : 'hover:bg-red-50 text-gray-400 hover:text-red-600'
                      )}
                      title={confirmDelete === c.id ? 'Confirmar' : 'Eliminar'}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modern Modal Add / Edit Customer */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl border border-gray-100 my-8 text-left"
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-gray-100">
                <div>
                  <h2 className="font-bold text-lg text-[#242D49]">
                    {editingCustomer ? 'Editar Ficha del Cliente' : 'Nuevo Cliente & Facturación'}
                  </h2>
                  <p className="text-xs text-gray-400">Datos personales y fiscales para emisión de comprobantes</p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Company / Natural Person Switcher */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-xl mb-4 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setFormIsCompany(false)}
                  className={cn(
                    'py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all',
                    !formIsCompany ? 'bg-white text-[#242D49] shadow-xs' : 'text-gray-500 hover:text-gray-800'
                  )}
                >
                  <User size={14} /> Persona Natural
                </button>
                <button
                  type="button"
                  onClick={() => setFormIsCompany(true)}
                  className={cn(
                    'py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all',
                    formIsCompany ? 'bg-white text-[#242D49] shadow-xs' : 'text-gray-500 hover:text-gray-800'
                  )}
                >
                  <Building2 size={14} /> Empresa (NIT)
                </button>
              </div>

              <div className="space-y-3.5 text-xs">
                {/* Name / Razón Social */}
                <div>
                  <label className="font-semibold text-gray-700 mb-1 block">
                    {formIsCompany ? 'Razón Social / Nombre Comercial' : 'Nombre Completo'} *
                  </label>
                  <input
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder={formIsCompany ? 'Ej: Mi Empresa SAS' : 'Ej: Juan Pérez'}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#364266] text-xs font-medium"
                  />
                </div>

                {/* Identification Document */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1">
                    <label className="font-semibold text-gray-700 mb-1 block">Tipo Doc.</label>
                    <select
                      value={formDocType}
                      onChange={e => setFormDocType(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#364266] text-xs font-medium"
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
                      placeholder={formIsCompany ? '900000000-1' : '1000000000'}
                      className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#364266] text-xs font-mono"
                    />
                  </div>
                </div>

                {/* Phone & Email */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="font-semibold text-gray-700 mb-1 block">Teléfono / WhatsApp *</label>
                    <input
                      value={formPhone}
                      onChange={e => setFormPhone(e.target.value)}
                      placeholder="300 123 4567"
                      className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#364266] text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-gray-700 mb-1 block">Correo Factura Electrónica</label>
                    <input
                      type="email"
                      value={formEmail}
                      onChange={e => setFormEmail(e.target.value)}
                      placeholder="facturacion@empresa.com"
                      className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#364266] text-xs"
                    />
                  </div>
                </div>

                {/* Address */}
                <div>
                  <label className="font-semibold text-gray-700 mb-1 block">Dirección Fiscal / Entrega</label>
                  <input
                    value={formAddress}
                    onChange={e => setFormAddress(e.target.value)}
                    placeholder="Ej: Centro Histórico, Calle Santo Domingo #33-40"
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#364266] text-xs"
                  />
                </div>

                {/* Preferences / Notes */}
                <div>
                  <label className="font-semibold text-gray-700 mb-1 block">Notas / Sabores Preferidos de Gelato</label>
                  <input
                    value={formNotes}
                    onChange={e => setFormNotes(e.target.value)}
                    placeholder="Ej: Amante del pistacho y avellana, pide siempre sin azúcar..."
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#364266] text-xs"
                  />
                </div>

                {/* Actions */}
                <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!formName.trim() || !formPhone.trim()}
                    className="px-5 py-2 rounded-xl bg-[#364266] text-[#FEF3DE] text-xs font-bold hover:bg-[#242D49] shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {editingCustomer ? 'Guardar Cambios' : 'Registrar Cliente'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CustomersPage;
