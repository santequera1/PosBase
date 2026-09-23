import { useState } from 'react';
import { Search, Plus, Grid3X3, List, X, Trash2, Edit3, Image as ImageIcon } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { MediaManagerModal } from '@/components/MediaManagerModal';

const ProductsPage = () => {
  const { categories, products, toggleProductAvailability, addProduct, updateProduct, deleteProduct, addCategory } = useStore();
  const [showCatForm, setShowCatForm] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatEmoji, setNewCatEmoji] = useState('');
  const [newCatColor, setNewCatColor] = useState('#364266');
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '', price: '', categoryId: 1, image: '', available: true, sizes: [] as { name: string; price: number }[] });
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  const [mediaTarget, setMediaTarget] = useState<{ mode: 'form' | 'product'; id?: number; name?: string; currentImage?: string } | null>(null);

  const filtered = products.filter(p => {
    if (selectedCategory && p.categoryId !== selectedCategory) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const openEdit = (id: number) => {
    const p = products.find(pr => pr.id === id)!;
    setFormData({ name: p.name, description: p.description || '', price: String(p.price), categoryId: p.categoryId, image: p.image || '', available: p.available, sizes: p.sizes ? [...p.sizes] : [] });
    setEditingId(id);
    setShowForm(true);
  };

  const handleSave = () => {
    const data: any = { name: formData.name, description: formData.description, price: Number(formData.price), categoryId: formData.categoryId, image: formData.image, available: formData.available };
    data.sizes = formData.sizes.length > 0 ? formData.sizes : null;
    if (editingId) {
      updateProduct(editingId, data);
    } else {
      addProduct(data);
    }
    setShowForm(false);
    setEditingId(null);
    setFormData({ name: '', description: '', price: '', categoryId: 1, image: '', available: true, sizes: [] });
  };

  const addSize = () => {
    setFormData({ ...formData, sizes: [...formData.sizes, { name: '', price: 0 }] });
  };
  const updateSize = (idx: number, field: 'name' | 'price', value: string) => {
    const newSizes = [...formData.sizes];
    if (field === 'price') newSizes[idx] = { ...newSizes[idx], price: Number(value) };
    else newSizes[idx] = { ...newSizes[idx], name: value };
    setFormData({ ...formData, sizes: newSizes, price: newSizes.length > 0 ? String(Math.min(...newSizes.map(s => s.price).filter(p => p > 0))) : formData.price });
  };
  const removeSize = (idx: number) => {
    const newSizes = formData.sizes.filter((_, i) => i !== idx);
    setFormData({ ...formData, sizes: newSizes, price: newSizes.length > 0 ? String(Math.min(...newSizes.map(s => s.price).filter(p => p > 0))) : formData.price });
  };

  return (
    <div className="space-y-4 font-sans p-4 lg:p-6 max-w-7xl mx-auto">
      {/* Header controls */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar producto o sabor..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#364266]/15 bg-white text-sm outline-none focus:ring-2 focus:ring-[#364266]"
          />
        </div>
        <button
          onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
          className="w-10 h-10 rounded-xl border border-[#364266]/15 bg-white flex items-center justify-center text-[#364266] hover:bg-[#FAF8EA]"
        >
          {viewMode === 'grid' ? <List size={18} /> : <Grid3X3 size={18} />}
        </button>
        <button
          onClick={() => {
            setMediaTarget(null);
            setMediaModalOpen(true);
          }}
          className="h-10 px-3 sm:px-4 rounded-xl border border-[#364266]/20 bg-white hover:bg-[#FAF8EA] text-[#364266] text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
          title="Abrir explorador de fotos y subir imágenes"
        >
          <ImageIcon size={15} className="text-[#897863]" />
          <span className="hidden sm:inline">Galería de Fotos</span>
        </button>
        <button
          onClick={() => { setEditingId(null); setFormData({ name: '', description: '', price: '', categoryId: 1, image: '', available: true, sizes: [] }); setShowForm(true); }}
          className="h-10 px-4 rounded-xl bg-[#364266] text-[#FEF3DE] hover:bg-[#242D49] text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all shrink-0"
        >
          <Plus size={16} /> Agregar Producto
        </button>
      </div>

      {/* Category Pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        <button
          onClick={() => setSelectedCategory(null)}
          className={cn(
            'px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all shadow-sm',
            !selectedCategory ? 'bg-[#364266] text-[#FEF3DE]' : 'bg-white text-[#364266] border border-[#364266]/10 hover:bg-[#FAF8EA]'
          )}
        >
          Todas las categorías
        </button>
        {categories.map(c => (
          <button
            key={c.id}
            onClick={() => setSelectedCategory(c.id)}
            className={cn(
              'px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all shadow-sm flex items-center gap-1',
              selectedCategory === c.id ? 'bg-[#364266] text-[#FEF3DE]' : 'bg-white text-[#364266] border border-[#364266]/10 hover:bg-[#FAF8EA]'
            )}
          >
            <span>{c.emoji}</span>
            <span>{c.name}</span>
          </button>
        ))}
        <button
          onClick={() => setShowCatForm(!showCatForm)}
          className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-white text-[#364266] border border-[#364266]/10 hover:bg-[#FAF8EA] shrink-0"
        >
          <Plus size={14} />
        </button>
      </div>

      {showCatForm && (
        <div className="flex gap-2 items-end flex-wrap bg-[#FAF8EA] rounded-2xl border border-[#C6BF81]/50 p-3 shadow-sm">
          <div>
            <label className="text-[10px] text-[#897863] font-bold block mb-0.5">Emoji</label>
            <input value={newCatEmoji} onChange={e => setNewCatEmoji(e.target.value)} placeholder="🍦"
              className="w-14 px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-center outline-none" />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="text-[10px] text-[#897863] font-bold block mb-0.5">Nombre</label>
            <input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Nueva categoría"
              className="w-full px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm outline-none" />
          </div>
          <div>
            <label className="text-[10px] text-[#897863] font-bold block mb-0.5">Color</label>
            <input type="color" value={newCatColor} onChange={e => setNewCatColor(e.target.value)}
              className="w-10 h-8 rounded border border-gray-200 cursor-pointer bg-white" />
          </div>
          <button onClick={() => {
            if (newCatName && newCatEmoji) {
              addCategory({ name: newCatName, emoji: newCatEmoji, color: newCatColor });
              setNewCatName(''); setNewCatEmoji(''); setNewCatColor('#364266'); setShowCatForm(false);
            }
          }} disabled={!newCatName || !newCatEmoji}
            className="px-4 py-2 rounded-xl bg-[#364266] text-[#FEF3DE] text-xs font-bold disabled:opacity-40 shadow-sm">
            Crear
          </button>
          <button onClick={() => setShowCatForm(false)} className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs hover:bg-gray-50">
            <X size={14} />
          </button>
        </div>
      )}

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {filtered.map(p => {
            const cat = categories.find(c => c.id === p.categoryId);
            return (
              <div key={p.id} className={cn('bg-white rounded-2xl border border-[#364266]/10 shadow-sm p-3 flex flex-col justify-between group', !p.available && 'opacity-50')}>
                <div>
                  <div
                    className="relative cursor-pointer group/img overflow-hidden rounded-xl mb-2"
                    onClick={() => {
                      setMediaTarget({ mode: 'product', id: p.id, name: p.name, currentImage: p.image });
                      setMediaModalOpen(true);
                    }}
                    title="Haz clic para cambiar la foto del producto"
                  >
                    {p.image ? (
                      <img src={p.image} alt={p.name} className="w-full aspect-square object-contain bg-[#FAF8EA]/60 p-1.5 transition-transform duration-300 group-hover/img:scale-105" />
                    ) : (
                      <div className="w-full h-24 flex items-center justify-center text-3xl bg-[#FAF8EA] transition-transform duration-300 group-hover/img:scale-105">
                        {cat?.emoji || '🍨'}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity text-white text-[11px] font-bold gap-1 rounded-xl">
                      <ImageIcon size={14} /> Cambiar Foto
                    </div>
                  </div>
                  <p className="text-xs font-bold text-[#242D49] truncate">{p.name}</p>
                  <p className="text-[11px] text-[#897863] truncate">{cat?.name}</p>
                  <p className="text-sm font-bold text-[#344268] mt-1">{p.sizes ? `Desde ${formatPrice(p.price)}` : formatPrice(p.price)}</p>
                </div>
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEdit(p.id)} className="text-xs text-[#364266] hover:underline font-bold flex items-center gap-0.5">
                      <Edit3 size={11} /> Editar
                    </button>
                    <button
                      onClick={() => {
                        setMediaTarget({ mode: 'product', id: p.id, name: p.name, currentImage: p.image });
                        setMediaModalOpen(true);
                      }}
                      className="text-xs text-[#364266] hover:underline font-bold flex items-center gap-0.5"
                      title="Cambiar foto del producto"
                    >
                      <ImageIcon size={11} /> Foto
                    </button>
                    <button onClick={() => { if (window.confirm(`¿Eliminar el producto "${p.name}"?`)) deleteProduct(p.id); }}
                      className="text-xs text-red-600 hover:underline font-semibold flex items-center gap-0.5">
                      <Trash2 size={11} />
                    </button>
                  </div>
                  <button onClick={() => toggleProductAvailability(p.id)}
                    title={p.available ? 'Disponible' : 'Agotado'}
                    className={cn('w-8 h-4 rounded-full relative transition-colors', p.available ? 'bg-emerald-500' : 'bg-gray-300')}>
                    <div className={cn('absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform', p.available ? 'left-4' : 'left-0.5')} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(p => {
            const cat = categories.find(c => c.id === p.categoryId);
            return (
              <div key={p.id} className={cn('bg-white rounded-2xl border border-[#364266]/10 shadow-sm p-3 flex items-center gap-3', !p.available && 'opacity-50')}>
                <div
                  className="relative cursor-pointer group/listimg shrink-0 overflow-hidden rounded-xl"
                  onClick={() => {
                    setMediaTarget({ mode: 'product', id: p.id, name: p.name, currentImage: p.image });
                    setMediaModalOpen(true);
                  }}
                  title="Haz clic para cambiar la foto"
                >
                  {p.image ? (
                    <img src={p.image} alt={p.name} className="w-12 h-12 object-contain bg-[#FAF8EA] p-1 transition-transform group-hover/listimg:scale-105" />
                  ) : (
                    <div className="w-12 h-12 flex items-center justify-center text-xl shrink-0 bg-[#FAF8EA] transition-transform group-hover/listimg:scale-105">
                      {cat?.emoji || '🍨'}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/listimg:opacity-100 flex items-center justify-center transition-opacity text-white rounded-xl">
                    <ImageIcon size={13} />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[#242D49] truncate">{p.name}</p>
                  <p className="text-xs text-[#897863]">{cat?.name}</p>
                </div>
                <span className="font-bold text-sm text-[#344268]">{p.sizes ? `Desde ${formatPrice(p.price)}` : formatPrice(p.price)}</span>
                <button
                  onClick={() => {
                    setMediaTarget({ mode: 'product', id: p.id, name: p.name, currentImage: p.image });
                    setMediaModalOpen(true);
                  }}
                  className="text-xs text-[#364266] font-bold px-2 py-1 rounded-lg hover:bg-gray-100 flex items-center gap-1"
                  title="Cambiar foto del producto"
                >
                  <ImageIcon size={12} /> Foto
                </button>
                <button onClick={() => openEdit(p.id)} className="text-xs text-[#364266] font-bold px-2 py-1 rounded-lg hover:bg-gray-100">Editar</button>
                <button onClick={() => { if (window.confirm(`¿Eliminar "${p.name}"?`)) deleteProduct(p.id); }}
                  className="text-red-500 p-1 rounded-lg hover:bg-red-50"><Trash2 size={15} /></button>
                <button onClick={() => toggleProductAvailability(p.id)}
                  className={cn('w-8 h-4 rounded-full relative transition-colors shrink-0', p.available ? 'bg-emerald-500' : 'bg-gray-300')}>
                  <div className={cn('absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform', p.available ? 'left-4' : 'left-0.5')} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white rounded-3xl w-full max-w-md p-6 max-h-[85vh] overflow-y-auto shadow-2xl border border-[#364266]/10" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-lg text-[#364266]">{editingId ? 'Editar' : 'Nuevo'} Producto</h2>
                <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200"><X size={16} /></button>
              </div>
              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-[#364266] mb-1 block">Nombre</label>
                  <input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ej. Gelato de Maracuyá"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[#364266]" />
                </div>
                <div>
                  <label className="font-bold text-[#364266] mb-1 block">Descripción</label>
                  <input value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Ej. Notas cítricas y tropicales"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[#364266]" />
                </div>
                {formData.sizes.length === 0 && (
                  <div>
                    <label className="font-bold text-[#364266] mb-1 block">Precio (COP)</label>
                    <input type="number" value={formData.price} onChange={e => setFormData({ ...formData, price: e.target.value })}
                      placeholder="15000"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-base font-bold text-[#344268] outline-none focus:ring-2 focus:ring-[#364266]" />
                  </div>
                )}
                {/* Sizes editor */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-[#364266]">Tamaños / Presentaciones (Opcional)</label>
                    <button type="button" onClick={addSize} className="text-xs text-[#364266] font-bold flex items-center gap-1">
                      <Plus size={12} /> Agregar
                    </button>
                  </div>
                  {formData.sizes.length === 0 ? (
                    <p className="text-[10px] text-gray-500">Precio único fijado arriba. Agrega tamaños si el producto maneja varias presentaciones.</p>
                  ) : (
                    <div className="space-y-2">
                      {formData.sizes.map((s, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <input value={s.name} onChange={e => updateSize(i, 'name', e.target.value)} placeholder="Ej: Pequeño (1 sabor)"
                            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-xs outline-none" />
                          <input type="number" value={s.price || ''} onChange={e => updateSize(i, 'price', e.target.value)} placeholder="Precio"
                            className="w-24 px-3 py-2 rounded-lg border border-gray-200 text-xs font-bold text-[#344268] outline-none" />
                          <button type="button" onClick={() => removeSize(i)} className="text-red-500 shrink-0"><Trash2 size={14} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="font-bold text-[#364266] mb-1 block">Categoría</label>
                  <select value={formData.categoryId} onChange={e => setFormData({ ...formData, categoryId: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[#364266] bg-white">
                    {categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-[#364266]">Imagen del Producto</label>
                    <button
                      type="button"
                      onClick={() => {
                        setMediaTarget({ mode: 'form', name: formData.name, currentImage: formData.image });
                        setMediaModalOpen(true);
                      }}
                      className="text-xs px-2.5 py-1 rounded-lg bg-[#364266] text-[#FEF3DE] hover:bg-[#242D49] font-bold flex items-center gap-1.5 shadow-sm transition-all"
                    >
                      <ImageIcon size={13} /> 🖼️ Explorador / Subir Foto
                    </button>
                  </div>
                  <div className="flex gap-2 items-center">
                    <input
                      value={formData.image}
                      onChange={e => setFormData({ ...formData, image: e.target.value })}
                      placeholder="/images/gelatos/conos/chocolate.webp o URL"
                      className="flex-1 px-3.5 py-2 rounded-xl border border-gray-200 text-xs outline-none focus:ring-2 focus:ring-[#364266]"
                    />
                    {formData.image && (
                      <div className="w-10 h-10 rounded-lg border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center bg-gray-50 p-0.5">
                        <img src={formData.image} alt="Preview" className="max-h-full max-w-full object-contain" />
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1.5 mt-1.5 flex-wrap">
                    {[
                      { label: '🍨 Vaso 4oz', path: '/images/products/cup-4oz.webp' },
                      { label: '🍨 Vaso 6oz', path: '/images/products/cup-6oz.webp' },
                      { label: '🍦 Cono 1 Sabor', path: '/images/products/cone-small.webp' },
                      { label: '🍦 Cono 2 Sabores', path: '/images/products/cone-large.webp' },
                      { label: '☕ Affogato', path: '/images/products/affogato.webp' },
                      { label: '🍨 Litro', path: '/images/products/tub-1l.webp' },
                    ].map(p => (
                      <button
                        key={p.path}
                        type="button"
                        onClick={() => setFormData({ ...formData, image: p.path })}
                        className="px-2 py-0.5 rounded-md bg-gray-100 hover:bg-gray-200 text-[10px] text-gray-700 font-medium"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={handleSave} disabled={!formData.name || (!formData.price && formData.sizes.length === 0)}
                  className="w-full mt-2 py-3 rounded-xl bg-[#364266] text-[#FEF3DE] hover:bg-[#242D49] font-bold text-sm disabled:opacity-40 shadow-md">
                  {editingId ? 'Guardar Cambios' : 'Crear Producto'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Media Manager / File Explorer Modal */}
      <MediaManagerModal
        isOpen={mediaModalOpen}
        onClose={() => {
          setMediaModalOpen(false);
          setMediaTarget(null);
        }}
        currentImageUrl={mediaTarget?.currentImage || formData.image}
        productName={mediaTarget?.name || (mediaTarget?.mode === 'form' ? formData.name : undefined)}
        productId={mediaTarget?.mode === 'product' ? mediaTarget.id : undefined}
        onSelectImage={(url) => {
          if (mediaTarget?.mode === 'form' || showForm) {
            setFormData(prev => ({ ...prev, image: url }));
          }
        }}
        onImageSavedToProduct={(productId, newImageUrl) => {
          updateProduct(productId, { image: newImageUrl });
        }}
      />
    </div>
  );
};

export default ProductsPage;
