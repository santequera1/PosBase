import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Search, Upload, Check, Image as ImageIcon, Sparkles, Folder, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export interface MediaItem {
  id: string;
  name: string;
  filename: string;
  url: string;
  group: string;
}

interface MediaManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentImageUrl?: string;
  onSelectImage: (imageUrl: string) => void;
  productName?: string;
  productId?: number;
  onImageSavedToProduct?: (productId: number, newImageUrl: string) => void;
}

export const MediaManagerModal: React.FC<MediaManagerModalProps> = ({
  isOpen,
  onClose,
  currentImageUrl,
  onSelectImage,
  productName,
  productId,
  onImageSavedToProduct,
}) => {
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState<string>(currentImageUrl || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync initial selected URL
  useEffect(() => {
    if (isOpen) {
      setSelectedUrl(currentImageUrl || '');
      loadMedia();
    }
  }, [isOpen, currentImageUrl]);

  const loadMedia = async () => {
    setLoading(true);
    try {
      const res = await api.getMedia();
      if (res && res.media) {
        setMediaList(res.media);
      }
    } catch (err) {
      console.error('Error loading media:', err);
      toast.error('No se pudo cargar la galería de imágenes');
    } finally {
      setLoading(false);
    }
  };

  // Get unique groups for filter pills
  const groups = useMemo(() => {
    const set = new Set<string>();
    mediaList.forEach(m => set.add(m.group));
    return Array.from(set);
  }, [mediaList]);

  // Filtered media
  const filteredMedia = useMemo(() => {
    return mediaList.filter(item => {
      if (selectedGroup !== 'all' && item.group !== selectedGroup) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return item.name.toLowerCase().includes(q) || item.filename.toLowerCase().includes(q);
      }
      return true;
    });
  }, [mediaList, selectedGroup, searchQuery]);

  // Handle local file upload (converts to base64 and uploads to backend)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Por favor selecciona un archivo de imagen válido (PNG, JPG, WebP)');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      toast.error('La imagen no debe superar los 15 MB');
      return;
    }

    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Data = reader.result as string;
        const res = await api.uploadMedia(file.name, base64Data);
        if (res && res.success) {
          toast.success('¡Imagen subida exitosamente!');
          setSelectedUrl(res.url);
          // Reload list and switch to Mis Fotos Subidas
          await loadMedia();
          setSelectedGroup('Mis Fotos Subidas');
        } else {
          toast.error('No se pudo guardar la imagen');
        }
      } catch (err) {
        console.error(err);
        toast.error('Error al subir la imagen al servidor');
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const handleApply = async () => {
    if (!selectedUrl) {
      toast.error('Selecciona una imagen primero');
      return;
    }

    onSelectImage(selectedUrl);

    // If productId is provided, update DB directly
    if (productId) {
      try {
        const res = await api.updateProductImage(productId, selectedUrl);
        if (res && res.success) {
          toast.success(`Foto de ${productName || 'producto'} actualizada correctamente`);
          if (onImageSavedToProduct) {
            onImageSavedToProduct(productId, selectedUrl);
          }
        }
      } catch (err) {
        console.error(err);
        toast.error('Error al guardar la foto en el producto');
      }
    }

    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 font-sans">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          className="bg-brand-card rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl border border-brand-primary/15 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-5 sm:px-6 py-4 bg-brand-dark text-brand-bg flex items-center justify-between shrink-0 shadow-md">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-brand-accent">
                <ImageIcon size={22} />
              </div>
              <div>
                <h2 className="font-bold text-base sm:text-lg leading-tight flex items-center gap-2">
                  <span>Administrador de Imágenes</span>
                  {productName && (
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-brand-accent/30 text-brand-card font-medium truncate max-w-[200px]">
                      {productName}
                    </span>
                  )}
                </h2>
                <p className="text-xs text-brand-bg/70">
                  Selecciona una foto del catálogo o sube una imagen propia desde tu equipo
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-brand-bg transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Controls Bar: Search, Upload Button, Refresh */}
          <div className="p-4 bg-white border-b border-brand-primary/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
            {/* Search */}
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar imagen por sabor o nombre..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-brand-card border border-brand-primary/20 focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Actions: Upload & Refresh */}
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="px-3.5 py-2 rounded-xl bg-brand-primary hover:bg-brand-dark text-brand-bg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
              >
                <Upload size={14} />
                <span>{uploading ? 'Subiendo...' : 'Subir Foto Propia'}</span>
              </button>

              <button
                type="button"
                onClick={loadMedia}
                disabled={loading}
                className="p-2 rounded-xl border border-gray-200 hover:bg-gray-100 text-gray-600 transition-colors"
                title="Recargar galería"
              >
                <RefreshCw size={15} className={cn(loading && 'animate-spin')} />
              </button>
            </div>
          </div>

          {/* Category Pills Bar */}
          <div className="px-4 py-2 bg-brand-card border-b border-brand-primary/10 flex items-center gap-1.5 overflow-x-auto shrink-0">
            <button
              onClick={() => setSelectedGroup('all')}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all',
                selectedGroup === 'all'
                  ? 'bg-brand-dark text-brand-bg shadow-xs'
                  : 'bg-white text-brand-primary border border-brand-primary/15 hover:bg-white/80'
              )}
            >
              Todos ({mediaList.length})
            </button>

            {groups.map((grp) => {
              const count = mediaList.filter(m => m.group === grp).length;
              return (
                <button
                  key={grp}
                  onClick={() => setSelectedGroup(grp)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all',
                    selectedGroup === grp
                      ? 'bg-brand-dark text-brand-bg shadow-xs'
                      : 'bg-white text-brand-primary border border-brand-primary/15 hover:bg-white/80'
                  )}
                >
                  {grp} ({count})
                </button>
              );
            })}
          </div>

          {/* Media Grid */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            {loading ? (
              <div className="h-64 flex flex-col items-center justify-center gap-2 text-brand-muted">
                <RefreshCw size={24} className="animate-spin text-brand-primary" />
                <span className="text-xs font-semibold">Cargando catálogo de imágenes...</span>
              </div>
            ) : filteredMedia.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center gap-3 text-center p-6 text-gray-400">
                <Folder size={36} className="text-brand-accent/70" />
                <p className="text-sm font-semibold text-gray-600">No se encontraron imágenes en este grupo</p>
                <p className="text-xs text-gray-400 max-w-sm">
                  Prueba cambiando de filtro o usa el botón "Subir Foto Propia" para agregar una nueva desde tu dispositivo.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {filteredMedia.map((item) => {
                  const isSelected = selectedUrl === item.url;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedUrl(item.url)}
                      className={cn(
                        'group relative bg-white rounded-2xl p-2.5 flex flex-col justify-between cursor-pointer border-2 transition-all select-none shadow-xs',
                        isSelected
                          ? 'border-brand-primary ring-2 ring-brand-primary/30 bg-blue-50/20 shadow-md scale-[1.02]'
                          : 'border-transparent hover:border-brand-accent hover:shadow-sm'
                      )}
                    >
                      {/* Checkmark when selected */}
                      {isSelected && (
                        <div className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full bg-brand-primary text-white flex items-center justify-center shadow-md">
                          <Check size={12} strokeWidth={3} />
                        </div>
                      )}

                      {/* Image Thumbnail */}
                      <div className="w-full h-24 sm:h-28 rounded-xl bg-brand-card/40 flex items-center justify-center overflow-hidden mb-1.5 p-1">
                        <img
                          src={item.url}
                          alt={item.name}
                          className="max-h-full max-w-full object-contain transition-transform duration-200 group-hover:scale-105"
                          loading="lazy"
                        />
                      </div>

                      {/* Title & Group */}
                      <div className="pt-1 border-t border-gray-100">
                        <p className="text-xs font-bold text-brand-dark truncate leading-tight">
                          {item.name}
                        </p>
                        <span className="text-[10px] text-brand-muted truncate block mt-0.5">
                          {item.group}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer with Selected Preview & Confirm Button */}
          <div className="px-5 py-3.5 bg-white border-t border-brand-primary/10 flex items-center justify-between shrink-0 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {selectedUrl ? (
                <>
                  <div className="w-10 h-10 rounded-xl border border-brand-primary/20 bg-brand-card overflow-hidden shrink-0 flex items-center justify-center p-0.5">
                    <img src={selectedUrl} alt="Seleccionada" className="max-h-full max-w-full object-contain" />
                  </div>
                  <div className="truncate">
                    <span className="text-[10px] uppercase font-bold text-brand-muted block">Imagen Seleccionada</span>
                    <span className="text-xs font-bold text-brand-dark font-mono truncate block">{selectedUrl}</span>
                  </div>
                </>
              ) : (
                <span className="text-xs text-brand-muted italic">Ninguna imagen seleccionada</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-gray-200 hover:bg-gray-100 text-xs font-semibold text-gray-700"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleApply}
                disabled={!selectedUrl}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-primary to-brand-dark text-brand-bg font-bold text-xs shadow-md hover:shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <Sparkles size={14} />
                <span>Aplicar a este Producto</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default MediaManagerModal;
