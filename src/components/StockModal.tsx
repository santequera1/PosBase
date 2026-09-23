import { useEffect, useState } from 'react';
import { PackagePlus, PackageMinus, ClipboardCheck, History } from 'lucide-react';
import { api } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import { Modal, Chip, INPUT, LABEL } from '@/components/common/Primitives';

type Mode = 'add' | 'remove' | 'set';
const REASONS: Record<Mode, Array<[string, string]>> = {
  add: [['compra', 'Compra / reposición'], ['correccion', 'Corrección'], ['inventario', 'Inventario físico']],
  remove: [['merma', 'Merma / daño'], ['correccion', 'Corrección'], ['inventario', 'Inventario físico']],
  set: [['inventario', 'Inventario físico'], ['correccion', 'Corrección']],
};
const REASON_LABEL: Record<string, string> = { venta: 'Venta', devolucion: 'Devolución (pedido anulado)', compra: 'Compra', merma: 'Merma', correccion: 'Corrección', inventario: 'Inventario', ajuste: 'Ajuste' };

const fmt = (d: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)} ${d.slice(11, 16)}` : '');

export const StockModal = ({ productId, onClose }: { productId: number; onClose: () => void }) => {
  const product = useStore(s => s.products.find(p => p.id === productId));
  const adjustStock = useStore(s => s.adjustStock);
  const [mode, setMode] = useState<Mode>('add');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('compra');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [movements, setMovements] = useState<any[]>([]);

  const loadMovements = () => api.getStockMovements(productId).then(setMovements).catch(() => {});
  useEffect(() => { loadMovements(); }, [productId]);
  useEffect(() => { setReason(REASONS[mode][0][0]); }, [mode]);

  if (!product) return null;
  const current = Number(product.stock) || 0;
  const n = Math.max(0, Math.round(Number(qty) || 0));
  const preview = mode === 'add' ? current + n : mode === 'remove' ? Math.max(0, current - n) : n;

  const save = async () => {
    if (!qty && mode !== 'set') return;
    setSaving(true);
    setError('');
    try {
      await adjustStock(productId, mode === 'set' ? { set: n, reason } : { delta: mode === 'add' ? n : -n, reason });
      setQty('');
      loadMovements();
    } catch (e: any) { setError(e.message || 'No se pudo ajustar el stock'); }
    setSaving(false);
  };

  return (
    <Modal title={`Inventario · ${product.name}`} onClose={onClose}>
      <div className="flex items-center justify-between p-3 rounded-xl bg-brand-card border border-border">
        <div>
          <p className="text-[11px] text-muted-foreground uppercase font-semibold">Stock actual</p>
          <p className={cn('font-display font-bold text-2xl', current <= 0 ? 'text-red-600' : current <= (Number(product.minStock) || 0) ? 'text-amber-700' : 'text-brand-dark')}>{current} <span className="text-sm font-sans font-normal text-muted-foreground">und</span></p>
        </div>
        <div className="text-right text-[11px] text-muted-foreground">
          <p>Alerta de stock bajo: {Number(product.minStock) || 0} und</p>
          <p>{product.available ? 'Visible en el POS' : 'Oculto en el POS (agotado)'}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {([['add', 'Agregar', PackagePlus], ['remove', 'Restar', PackageMinus], ['set', 'Fijar cantidad', ClipboardCheck]] as Array<[Mode, string, any]>).map(([m, label, Icon]) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={cn('py-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1', mode === m ? 'border-brand-primary bg-brand-button/5 text-brand-primary' : 'border-border text-brand-dark')}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>{mode === 'set' ? 'Cantidad contada' : 'Unidades'}</label>
          <input type="number" min={0} value={qty} onChange={e => setQty(e.target.value)} placeholder="0" className={cn(INPUT, 'font-mono text-base')} autoFocus />
        </div>
        <div>
          <label className={LABEL}>Motivo</label>
          <div className="flex flex-wrap gap-1">{REASONS[mode].map(([k, l]) => <Chip key={k} active={reason === k} onClick={() => setReason(k)}>{l}</Chip>)}</div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Quedará en <b className="text-brand-dark">{preview} und</b>{preview <= 0 ? ' · el producto se marcará como agotado' : current <= 0 && preview > 0 ? ' · volverá a estar disponible' : ''}.</p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button onClick={save} disabled={saving || (mode !== 'set' && n <= 0)} className="w-full py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-40">{saving ? 'Guardando...' : 'Aplicar ajuste'}</button>

      <div className="pt-2 border-t border-border">
        <p className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1 mb-1.5"><History size={12} /> Últimos movimientos</p>
        {movements.length === 0 ? <p className="text-xs text-muted-foreground">Sin movimientos registrados.</p> : (
          <ul className="max-h-40 overflow-y-auto divide-y divide-border text-xs">
            {movements.slice(0, 30).map(m => (
              <li key={m.id} className="py-1 flex items-center gap-2">
                <span className="text-muted-foreground w-24 shrink-0">{fmt(m.createdAt)}</span>
                <span className="flex-1 truncate">{REASON_LABEL[m.reason] || m.reason}{m.orderId ? ` · pedido #${m.orderId}` : ''}{m.userName ? ` · ${m.userName}` : ''}</span>
                <span className={cn('font-bold', m.delta < 0 ? 'text-red-600' : 'text-emerald-700')}>{m.delta > 0 ? '+' : ''}{m.delta}</span>
                <span className="text-muted-foreground w-12 text-right">= {m.stockAfter}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
};

export default StockModal;
