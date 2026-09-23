import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, MapPin, Upload, X, Truck, Edit2, FileText, Image, Eye, UserPlus, MessageCircle } from 'lucide-react';
import { useStore, type OrderStatus, type OrderType, type PaymentMethod, type Driver } from '@/store/useStore';
import { StatusBadge, getDeliveredLabel } from '@/components/StatusBadge';
import { OrderTypeBadge } from '@/components/OrderTypeBadge';
import { formatPrice, formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const getDriverDisplayName = (d: Driver) => {
  const parts = d.name.split(':');
  return parts.length === 2 ? parts[1] : d.name;
};

function getFlowSteps(type: OrderType): { status: OrderStatus; label: string; emoji: string }[] {
  const base = [
    { status: 'pending' as OrderStatus, label: 'Pendiente', emoji: '🟡' },
    { status: 'preparing' as OrderStatus, label: 'En preparación', emoji: '🔵' },
  ];
  if (type === 'delivery') {
    return [
      ...base,
      { status: 'ready', label: 'Listo para enviar', emoji: '🟢' },
      { status: 'shipped', label: 'Enviado', emoji: '🛵' },
      { status: 'delivered', label: 'Entregado', emoji: '📦' },
    ];
  }
  if (type === 'pickup') {
    return [
      ...base,
      { status: 'ready', label: 'Listo para recoger', emoji: '🟢' },
      { status: 'delivered', label: 'Recogido por cliente', emoji: '✅' },
    ];
  }
  // dine-in
  return [
    ...base,
    { status: 'ready', label: 'Listo para servir', emoji: '🟢' },
    { status: 'delivered', label: 'Entregado en mesa', emoji: '🍽️' },
  ];
}

const OrderDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { orders, updateOrderStatus, updatePaymentStatus, updateOrderCustomer, updateOrderNotes, uploadReceipt, drivers, assignDriver, businessName } = useStore();
  const order = orders.find(o => o.id === Number(id));
  const receiptRef = useRef<HTMLDivElement>(null);
  const notesTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showPaymentPicker, setShowPaymentPicker] = useState(false);
  const [showDriverPicker, setShowDriverPicker] = useState(false);
  const [showCustomerEdit, setShowCustomerEdit] = useState(false);
  const [showReceiptViewer, setShowReceiptViewer] = useState(false);
  const [notes, setNotes] = useState('');
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);

  // Customer edit fields
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');

  // Initialize notes from order
  useEffect(() => {
    if (order?.notes) setNotes(order.notes);
  }, [order?.id]);

  // Auto-save notes with debounce
  useEffect(() => {
    if (!order) return;

    if (notesTimeoutRef.current) {
      clearTimeout(notesTimeoutRef.current);
    }

    notesTimeoutRef.current = setTimeout(() => {
      if (notes !== (order.notes || '')) {
        updateOrderNotes(order.id, notes);
      }
    }, 1000);

    return () => {
      if (notesTimeoutRef.current) clearTimeout(notesTimeoutRef.current);
    };
  }, [notes, order, updateOrderNotes]);

  const driver = order?.driverId ? drivers.find(d => d.id === order.driverId) : null;

  const domiciliarios = drivers.filter(d => {
    const parts = d.name.split(':');
    const role = parts.length === 2 ? parts[0] : 'domiciliario';
    return role === 'domiciliario' && d.available;
  });

  const handleReceiptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setReceiptPreview(dataUrl);
        // Persist to server
        if (order) {
          uploadReceipt(order.id, dataUrl);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleMarkPaid = (method: PaymentMethod) => {
    if (order) {
      updatePaymentStatus(order.id, 'paid', method);
      setShowPaymentPicker(false);
    }
  };

  const handleSaveCustomer = () => {
    if (order) {
      updateOrderCustomer(order.id, {
        name: editName || order.customer.name,
        phone: editPhone || undefined,
        address: editAddress || undefined,
      });
      setShowCustomerEdit(false);
    }
  };

  const openCustomerEdit = () => {
    if (order) {
      setEditName(order.customer.name);
      setEditPhone(order.customer.phone || '');
      setEditAddress(order.customer.address || '');
      setShowCustomerEdit(true);
    }
  };

  // Print receipt
  const printReceipt = () => {
    const el = receiptRef.current;
    if (!el) return;
    const w = window.open('', '_blank', 'width=350,height=600');
    if (!w) return;
    w.document.write(`<html><head><title>Recibo #${order!.id}</title><style>
      body{font-family:monospace;padding:16px;max-width:300px;margin:0 auto;font-size:12px}
      h2{text-align:center;margin:0}
      .line{border-top:1px dashed #000;margin:8px 0}
      table{width:100%;border-collapse:collapse}
      td{padding:2px 0}
      .right{text-align:right}
      .bold{font-weight:bold}
      .center{text-align:center}
    </style></head><body>${el.innerHTML}</body></html>`);
    w.document.close();
    w.print();
  };

  // Export receipt as JPG image
  const exportReceiptAsImage = useCallback(() => {
    const el = receiptRef.current;
    if (!el || !order) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = 350;
    const lineHeight = 18;
    const padding = 20;

    const lines: string[] = [];
    lines.push(businessName || 'FRITOP');
    lines.push('Recibo de Pedido');
    lines.push('─'.repeat(35));
    lines.push(`Pedido # ${order.id}`);
    lines.push(`Fecha: ${order.createdAt}`);
    lines.push(`Tipo: ${order.type === 'delivery' ? 'Domicilio' : order.type === 'pickup' ? 'Recoger en restaurante' : 'Comer aquí'}`);
    lines.push(`Cliente: ${order.customer.name}`);
    if (order.customer.phone) lines.push(`Tel: ${order.customer.phone}`);
    if (order.customer.address) lines.push(`Dir: ${order.customer.address}`);
    lines.push('─'.repeat(35));
    order.items.forEach(item => {
      lines.push(`${item.quantity}x ${item.name}${item.notes ? ` (${item.notes})` : ''}`);
      lines.push(`   $${(item.price * item.quantity).toLocaleString()}`);
    });
    lines.push('─'.repeat(35));
    if (order.deliveryFee > 0) lines.push(`Domicilio: $${order.deliveryFee.toLocaleString()}`);
    lines.push(`TOTAL: $${order.total.toLocaleString()}`);
    lines.push(`Pago: ${order.paymentMethod === 'cash' ? 'Efectivo' : order.paymentMethod === 'transfer' ? 'Transferencia' : 'Tarjeta'} - ${order.paymentStatus === 'paid' ? 'PAGADO' : 'PENDIENTE'}`);
    lines.push('─'.repeat(35));
    lines.push('¡Gracias por su compra!');

    canvas.width = width;
    canvas.height = lines.length * lineHeight + padding * 2;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#000000';
    ctx.font = '13px monospace';
    ctx.textBaseline = 'top';

    lines.forEach((line, i) => {
      ctx.fillText(line, padding, padding + i * lineHeight);
    });

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recibo-${order.id}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/jpeg', 0.95);
  }, [order, businessName]);

  if (!order) return (
    <div className="text-center py-16">
      <span className="text-5xl block mb-3">🔍</span>
      <p className="text-muted-foreground">Pedido no encontrado</p>
      <button onClick={() => navigate('/orders')} className="mt-3 text-sm text-primary font-medium">← Volver a pedidos</button>
    </div>
  );

  const flowSteps = getFlowSteps(order.type);
  const currentStepIdx = flowSteps.findIndex(s => s.status === order.status);
  const nextStep = currentStepIdx >= 0 && currentStepIdx < flowSteps.length - 1 ? flowSteps[currentStepIdx + 1] : null;
  const isFinished = order.status === 'delivered' || order.status === 'cancelled';
  const typeLabel = order.type === 'delivery' ? '🛵 Domicilio' : order.type === 'pickup' ? '🛍️ Recoger en restaurante' : '🍽️ Comer aquí - Mesa ' + (order.tableNumber || '');

  // Receipt image (from server or local upload)
  const savedReceipt = order.receiptImage || receiptPreview;

  return (
    <div className="max-w-lg mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/orders')} className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center"><ArrowLeft size={18} /></button>
        <div className="flex-1">
          <h1 className="font-display font-bold text-lg">Pedido #{order.id}</h1>
          <p className="text-xs text-muted-foreground">{formatTime(order.createdAt)} • {typeLabel}</p>
        </div>
        <button onClick={exportReceiptAsImage} className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80" title="Descargar recibo JPG">
          <Image size={18} />
        </button>
        <button onClick={printReceipt} className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80" title="Imprimir recibo">
          <FileText size={18} />
        </button>
      </div>

      {/* Progress flow */}
      <div className="bg-card rounded-xl border border-border p-4 shadow-card">
        <div className="mb-4">
          {/* Circles row with connecting lines */}
          <div className="flex items-center mb-2">
            {flowSteps.map((step, i) => {
              const isCurrent = step.status === order.status;
              const isPast = currentStepIdx >= 0 && i < currentStepIdx;
              const isCancelled = order.status === 'cancelled';
              return (
                <div key={step.status} className="flex items-center flex-1 last:flex-none">
                  <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0',
                    isCancelled ? 'bg-muted' :
                    isCurrent ? 'bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-1' :
                    isPast ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground')}>
                    {isPast ? '✓' : step.emoji}
                  </div>
                  {i < flowSteps.length - 1 && (
                    <div className={cn('flex-1 h-0.5 mx-1', isPast ? 'bg-primary' : 'bg-muted')} />
                  )}
                </div>
              );
            })}
          </div>
          {/* Labels row */}
          <div className="flex">
            {flowSteps.map((step, i) => {
              const isCurrent = step.status === order.status;
              return (
                <div key={step.status} className={cn('text-center', i < flowSteps.length - 1 ? 'flex-1' : 'w-7')} >
                  <span className={cn('text-[9px] leading-tight block',
                    isCurrent ? 'text-primary font-bold' : 'text-muted-foreground')}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Main action */}
        {!isFinished && nextStep && (
          <button onClick={() => updateOrderStatus(order.id, nextStep.status)}
            className="w-full py-3.5 rounded-xl gradient-primary text-primary-foreground font-display font-bold text-sm shadow-fab hover:opacity-90">
            {nextStep.emoji} Marcar como: {nextStep.label}
          </button>
        )}

        {order.status === 'delivered' && (
          <div className="text-center py-2 text-sm font-semibold text-success">
            {getDeliveredLabel(order.type)} ✅
          </div>
        )}
        {order.status === 'cancelled' && (
          <div className="text-center py-2 text-sm font-semibold text-destructive">❌ Pedido cancelado</div>
        )}

        {/* Manual override */}
        <div className="mt-2 text-center">
          <button onClick={() => setShowStatusPicker(!showStatusPicker)}
            className="text-[11px] text-muted-foreground hover:text-foreground underline">
            {showStatusPicker ? 'Ocultar' : 'Cambiar estado manualmente'}
          </button>
        </div>

        {showStatusPicker && (
          <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-border">
            {[...flowSteps, { status: 'cancelled' as OrderStatus, label: 'Cancelar', emoji: '❌' }].map(s => (
              <button key={s.status}
                onClick={() => { updateOrderStatus(order.id, s.status); setShowStatusPicker(false); }}
                disabled={order.status === s.status}
                className={cn('p-2 rounded-lg border text-center text-[10px] font-medium transition-all',
                  order.status === s.status ? 'border-primary bg-primary/10 opacity-50' : 'border-border hover:border-primary/50 hover:bg-muted')}>
                <span className="text-base block">{s.emoji}</span>
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* WhatsApp notification (not for dine-in) */}
      {order.type !== 'dine-in' && order.customer.phone && (
        (order.status === 'delivered' || order.status === 'shipped' || (order.status === 'ready' && order.type === 'pickup')) && (() => {
          const itemsList = order.items.map(i => `${i.quantity}x ${i.name}`).join(', ');
          const msg = order.status === 'shipped'
            ? `¡Hola ${order.customer.name}! Tu pedido (${itemsList}) va en camino. Total: $${order.total.toLocaleString()}. ¡Gracias por tu compra!`
            : order.status === 'ready' && order.type === 'pickup'
            ? `¡Hola ${order.customer.name}! Tu pedido (${itemsList}) está listo para recoger en el restaurante. Total: $${order.total.toLocaleString()}. ¡Te esperamos!`
            : `¡Hola ${order.customer.name}! Tu pedido (${itemsList}) ha sido entregado. Total: $${order.total.toLocaleString()}. ¡Gracias por tu compra!`;
          return (
            <a href={`https://wa.me/57${order.customer.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer"
              className="w-full py-3 rounded-xl bg-[#25D366] text-white font-display font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
              <MessageCircle size={18} />
              {order.status === 'shipped' ? 'Avisar por WhatsApp: En camino' :
               order.status === 'ready' ? 'Avisar por WhatsApp: Listo para recoger' :
               'Avisar por WhatsApp: Entregado'}
            </a>
          );
        })()
      )}

      {/* Customer */}
      <div className="bg-card rounded-xl border border-border p-4 shadow-card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase">Cliente</h3>
          <button onClick={openCustomerEdit}
            className="text-xs text-primary font-medium flex items-center gap-1">
            <UserPlus size={12} /> {order.customer.name.startsWith('Mesa ') ? 'Asignar cliente' : 'Editar'}
          </button>
        </div>
        <p className="font-display font-semibold">{order.customer.name}</p>
        {order.customer.phone && <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1"><Phone size={14} />{order.customer.phone}</p>}
        {order.customer.address && <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5"><MapPin size={14} />{order.customer.address}</p>}

        {/* Customer edit form */}
        {showCustomerEdit && (
          <div className="mt-3 pt-3 border-t border-border space-y-2">
            <div>
              <label className="text-xs font-medium mb-1 block">Nombre</label>
              <input value={editName} onChange={e => setEditName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-input bg-card text-sm outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Teléfono</label>
              <input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="Teléfono"
                className="w-full px-3 py-2 rounded-lg border border-input bg-card text-sm outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            {order.type === 'delivery' && (
              <div>
                <label className="text-xs font-medium mb-1 block">Dirección</label>
                <input value={editAddress} onChange={e => setEditAddress(e.target.value)} placeholder="Dirección"
                  className="w-full px-3 py-2 rounded-lg border border-input bg-card text-sm outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={handleSaveCustomer}
                className="flex-1 py-2 rounded-lg gradient-primary text-primary-foreground text-xs font-semibold">
                Guardar
              </button>
              <button onClick={() => setShowCustomerEdit(false)}
                className="flex-1 py-2 rounded-lg border border-border text-xs font-medium hover:bg-muted">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Driver */}
      {order.type === 'delivery' && (
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase">Domiciliario</h3>
            <button onClick={() => setShowDriverPicker(!showDriverPicker)}
              className="text-xs text-primary font-medium flex items-center gap-1">
              <Edit2 size={12} /> {driver ? 'Cambiar' : 'Asignar'}
            </button>
          </div>
          {driver ? (
            <div className="flex items-center gap-2">
              <Truck size={16} className="text-success" />
              <span className="text-sm font-medium">{getDriverDisplayName(driver)}</span>
              <span className="text-xs text-muted-foreground">• {driver.phone}</span>
            </div>
          ) : (
            <p className="text-sm text-warning">⚠️ Sin domiciliario asignado</p>
          )}
          {showDriverPicker && (
            <div className="mt-3 pt-3 border-t border-border space-y-2">
              {domiciliarios.map(d => (
                <button key={d.id} onClick={() => { assignDriver(order.id, d.id); setShowDriverPicker(false); }}
                  className="w-full p-2.5 rounded-lg border border-border text-left text-sm hover:bg-muted transition-colors flex items-center gap-2">
                  <Truck size={14} className="text-success" />
                  <span className="font-medium">{getDriverDisplayName(d)}</span>
                  <span className="text-xs text-muted-foreground">{d.phone}</span>
                </button>
              ))}
              {domiciliarios.length === 0 && <p className="text-xs text-muted-foreground">No hay domiciliarios disponibles</p>}
            </div>
          )}
        </div>
      )}

      {/* Items */}
      <div className="bg-card rounded-xl border border-border p-4 shadow-card">
        <h3 className="text-xs font-semibold text-muted-foreground mb-2 uppercase">Productos</h3>
        <div className="space-y-2">
          {order.items.map((item, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <div>
                <span className="font-medium">{item.quantity}x {item.name}</span>
                {item.notes && <p className="text-xs text-muted-foreground">📝 {item.notes}</p>}
              </div>
              <span className="font-display font-semibold">{formatPrice(item.price * item.quantity)}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-border mt-3 pt-2 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatPrice(order.subtotal)}</span></div>
          {order.deliveryFee > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Domicilio</span><span>{formatPrice(order.deliveryFee)}</span></div>}
          <div className="flex justify-between font-display font-bold text-base"><span>Total</span><span className="text-primary">{formatPrice(order.total)}</span></div>
        </div>
      </div>

      {/* Payment */}
      <div className="bg-card rounded-xl border border-border p-4 shadow-card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase">Pago</h3>
          {order.paymentStatus === 'pending' ? (
            <button onClick={() => setShowPaymentPicker(!showPaymentPicker)}
              className="text-xs text-primary font-medium flex items-center gap-1">
              <Edit2 size={12} /> Marcar pagado
            </button>
          ) : (
            <button onClick={() => {
              if (window.confirm('¿Marcar este pedido como NO pagado?')) {
                updatePaymentStatus(order.id, 'pending');
              }
            }}
              className="text-xs text-warning font-medium flex items-center gap-1">
              <Edit2 size={12} /> Marcar no pagado
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full',
            order.paymentStatus === 'paid' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning')}>
            {order.paymentStatus === 'paid' ? '✅ Pagado' : '⏳ Pendiente de pago'}
          </span>
          <span className="text-sm text-muted-foreground">
            {order.paymentMethod === 'cash' ? '💵 Efectivo' : order.paymentMethod === 'transfer' ? '📱 Transferencia' : '💳 Tarjeta'}
          </span>
        </div>
        {showPaymentPicker && order.paymentStatus === 'pending' && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground mb-2">¿Cómo pagó el cliente?</p>
            <div className="grid grid-cols-3 gap-2">
              {([
                { method: 'cash' as PaymentMethod, emoji: '💵', label: 'Efectivo' },
                { method: 'transfer' as PaymentMethod, emoji: '📱', label: 'Transferencia' },
                { method: 'card' as PaymentMethod, emoji: '💳', label: 'Tarjeta' },
              ]).map(pm => (
                <button key={pm.method} onClick={() => handleMarkPaid(pm.method)}
                  className="p-2.5 rounded-lg border-2 border-border hover:border-primary/50 text-center text-xs font-medium transition-all">
                  <span className="text-lg block">{pm.emoji}</span>
                  {pm.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Receipt upload / viewer */}
      <div className="bg-card rounded-xl border border-border p-4 shadow-card">
        <h3 className="text-xs font-semibold text-muted-foreground mb-2 uppercase">Comprobante de pago</h3>
        {savedReceipt ? (
          <div className="space-y-2">
            <button onClick={() => setShowReceiptViewer(true)}
              className="w-full py-3 rounded-lg border border-success/30 bg-success/5 text-sm font-medium text-success flex items-center justify-center gap-2 hover:bg-success/10 transition-colors">
              <Eye size={16} /> Ver comprobante
            </button>
            <input type="file" accept="image/*" onChange={handleReceiptUpload} className="hidden" id="detail-receipt-replace" />
            <label htmlFor="detail-receipt-replace"
              className="flex items-center justify-center gap-2 w-full py-2 rounded-lg border border-border text-xs text-muted-foreground cursor-pointer hover:bg-muted/30 transition-all">
              <Upload size={14} /> Reemplazar comprobante
            </label>
          </div>
        ) : (
          <>
            <input type="file" accept="image/*" onChange={handleReceiptUpload} className="hidden" id="detail-receipt" />
            <label htmlFor="detail-receipt"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-lg border-2 border-dashed border-border text-sm text-muted-foreground cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-all">
              <Upload size={18} /> Subir comprobante (foto)
            </label>
          </>
        )}
      </div>

      {/* Receipt viewer modal */}
      {showReceiptViewer && savedReceipt && (
        <div className="fixed inset-0 bg-foreground/60 z-50 flex items-center justify-center p-4" onClick={() => setShowReceiptViewer(false)}>
          <div className="bg-card rounded-2xl max-w-md w-full max-h-[80vh] overflow-y-auto p-4 shadow-elevated" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-bold">Comprobante - Pedido #{order.id}</h3>
              <button onClick={() => setShowReceiptViewer(false)}
                className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                <X size={16} />
              </button>
            </div>
            <img src={savedReceipt} alt="Comprobante de pago" className="w-full rounded-lg border border-border" />
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="bg-card rounded-xl border border-border p-4 shadow-card">
        <h3 className="text-xs font-semibold text-muted-foreground mb-2 uppercase">Novedades / Notas</h3>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Ej: El cliente pidió sin cebolla, llegó tarde..."
          rows={3}
          className="w-full px-4 py-2.5 rounded-lg border border-input bg-card text-sm outline-none focus:ring-2 focus:ring-primary/20 resize-none" />
      </div>

      {/* Printable receipt (hidden) */}
      <div className="hidden">
        <div ref={receiptRef}>
          <h2>{businessName || 'FRITOP'}</h2>
          <p className="center">Recibo de Pedido</p>
          <div className="line"></div>
          <p><b>Pedido #</b>{order.id}</p>
          <p><b>Fecha:</b> {order.createdAt}</p>
          <p><b>Tipo:</b> {order.type === 'delivery' ? 'Domicilio' : order.type === 'pickup' ? 'Recoger en restaurante' : 'Comer aquí'}</p>
          <p><b>Cliente:</b> {order.customer.name}</p>
          {order.customer.phone && <p><b>Tel:</b> {order.customer.phone}</p>}
          {order.customer.address && <p><b>Dir:</b> {order.customer.address}</p>}
          <div className="line"></div>
          <table>
            <thead><tr><td><b>Producto</b></td><td className="right"><b>Total</b></td></tr></thead>
            <tbody>
              {order.items.map((item, i) => (
                <tr key={i}>
                  <td>{item.quantity}x {item.name}{item.notes ? ` (${item.notes})` : ''}</td>
                  <td className="right">${(item.price * item.quantity).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="line"></div>
          {order.deliveryFee > 0 && <p>Domicilio: ${order.deliveryFee.toLocaleString()}</p>}
          <p className="bold">TOTAL: ${order.total.toLocaleString()}</p>
          <p>Pago: {order.paymentMethod === 'cash' ? 'Efectivo' : order.paymentMethod === 'transfer' ? 'Transferencia' : 'Tarjeta'} - {order.paymentStatus === 'paid' ? 'PAGADO' : 'PENDIENTE'}</p>
          <div className="line"></div>
          <p className="center">¡Gracias por su compra!</p>
        </div>
      </div>
    </div>
  );
};

export default OrderDetailPage;
