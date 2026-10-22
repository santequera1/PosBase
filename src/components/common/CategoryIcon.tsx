import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { fileToDataUrl } from '@/lib/theme';
import { cn } from '@/lib/utils';

/** Ícono de una categoría: su foto si tiene, si no su emoji. */
export const CategoryIcon = ({ cat, size = 18, className }: { cat?: { emoji?: string; image?: string | null; name?: string } | null; size?: number; className?: string }) => {
  if (!cat) return null;
  if (cat.image) return <img src={cat.image} alt={cat.name || ''} className={cn('rounded-md object-cover shrink-0 inline-block', className)} style={{ width: size, height: size }} />;
  if (!cat.emoji) return null;
  return <span className={cn('leading-none', className)} style={{ fontSize: Math.round(size * 0.85) }}>{cat.emoji}</span>;
};

const EMOJI_GROUPS: Array<{ title: string; list: string[] }> = [
  { title: 'Comidas', list: ['🍔', '🍟', '🌭', '🍕', '🌮', '🌯', '🥙', '🥪', '🍗', '🍖', '🥩', '🥓', '🍳', '🥚', '🧀', '🥗', '🥘', '🍲', '🍝', '🍜', '🍛', '🍚', '🍱', '🍣', '🍤', '🦐', '🦞', '🦀', '🐟', '🦑', '🫓', '🥟', '🫔', '🥞', '🧇', '🥐', '🥖', '🍞', '🥯', '🌽', '🥔', '🍠', '🥑', '🍅', '🥦', '🍄'] },
  { title: 'Postres y helados', list: ['🍦', '🍨', '🍧', '🍰', '🎂', '🧁', '🍮', '🍩', '🍪', '🍫', '🍬', '🍭', '🥧', '🍯', '🍓', '🍒', '🍑', '🥭', '🍍', '🥥', '🍌', '🍋', '🍊', '🍎', '🍉', '🍇', '🫐', '🥝'] },
  { title: 'Bebidas', list: ['🥤', '🧃', '🧋', '☕', '🍵', '🥛', '🍼', '💧', '🧊', '🍺', '🍻', '🍷', '🥂', '🍸', '🍹', '🥃', '🍾', '🧉'] },
  { title: 'Otros', list: ['🍽️', '🥡', '🛍️', '🎁', '⭐', '🔥', '🌶️', '🌱', '🧂', '🥫', '🏷️', '👶', '🎉', '❤️', '✨', '🆕'] },
];

/**
 * Selector del ícono de una categoría: lista de emojis por grupo, escribir uno propio o subir una foto.
 * value: { emoji, image } — al elegir foto el emoji queda vacío y viceversa.
 */
export const CategoryIconPicker = ({ emoji, image, onChange, className }: {
  emoji: string; image?: string | null; onChange: (v: { emoji: string; image: string | null }) => void; className?: string;
}) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [custom, setCustom] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const pickEmoji = (e: string) => { onChange({ emoji: e, image: null }); setOpen(false); setCustom(''); };
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { setError('La foto supera 4 MB'); return; }
    setBusy(true); setError('');
    try {
      const data = await fileToDataUrl(file);
      const r = await api.uploadMedia(file.name, data);
      onChange({ emoji: '', image: r.url });
      setOpen(false);
    } catch (e: any) { setError(e?.message || 'No se pudo subir la foto'); }
    setBusy(false);
  };

  return (
    <div className={cn('relative', className)} ref={wrapRef}>
      <button type="button" onClick={() => setOpen(o => !o)} title="Elegir emoji o foto" data-cat-icon-button
        className="w-14 h-10 rounded-lg border border-input bg-card flex items-center justify-center hover:border-brand-primary/50">
        {image ? <img src={image} alt="" className="w-8 h-8 rounded-md object-cover" /> : emoji ? <span className="text-xl leading-none">{emoji}</span> : <ImagePlus size={16} className="text-muted-foreground" />}
      </button>
      {open && (
        <div className="absolute z-50 left-0 mt-1 w-[300px] max-w-[85vw] rounded-xl border border-border bg-card shadow-elevated" data-cat-icon-picker>
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <p className="text-xs font-bold text-brand-dark">Ícono de la categoría</p>
            <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground"><X size={14} /></button>
          </div>
          <div className="p-2 flex gap-2 border-b border-border">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
            <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} data-cat-upload
              className="flex-1 px-2 py-1.5 rounded-lg bg-brand-button text-brand-on-button text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50">
              <ImagePlus size={13} /> {busy ? 'Subiendo...' : image ? 'Cambiar foto' : 'Subir foto'}
            </button>
            {image && <button type="button" onClick={() => onChange({ emoji: '🍽️', image: null })} title="Quitar la foto" className="px-2 rounded-lg border border-border text-muted-foreground hover:text-red-600"><Trash2 size={13} /></button>}
          </div>
          {error && <p className="px-3 pt-2 text-[11px] text-red-600">{error}</p>}
          <div className="max-h-60 overflow-y-auto p-2 space-y-2">
            {EMOJI_GROUPS.map(g => (
              <div key={g.title}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground px-1 mb-1">{g.title}</p>
                <div className="grid grid-cols-8 gap-0.5">
                  {g.list.map(e => (
                    <button key={e} type="button" onClick={() => pickEmoji(e)} data-emoji={e}
                      className={cn('h-8 rounded-md text-lg leading-none hover:bg-brand-card', !image && emoji === e && 'bg-brand-card ring-1 ring-brand-primary/40')}>{e}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="p-2 border-t border-border flex gap-2">
            <input value={custom} onChange={e => setCustom(e.target.value)} placeholder="O pega otro emoji" maxLength={8}
              onKeyDown={e => { if (e.key === 'Enter' && custom.trim()) { e.preventDefault(); pickEmoji(custom.trim()); } }}
              className="flex-1 px-2 py-1.5 rounded-lg border border-input bg-card text-sm outline-none" />
            <button type="button" disabled={!custom.trim()} onClick={() => pickEmoji(custom.trim())} className="px-3 rounded-lg border border-border text-xs font-semibold disabled:opacity-40">Usar</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoryIcon;
