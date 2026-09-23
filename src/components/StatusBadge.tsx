import { cn } from '@/lib/utils';
import type { OrderStatus, OrderType } from '@/store/useStore';

const statusConfig: Record<OrderStatus, { label: string; className: string }> = {
  pending: { label: 'Pendiente', className: 'bg-warning/15 text-warning' },
  preparing: { label: 'En preparación', className: 'bg-info/15 text-info' },
  ready: { label: 'Listo', className: 'bg-success/15 text-success' },
  shipped: { label: 'Enviado', className: 'bg-purple-100 text-purple-600' },
  delivered: { label: 'Entregado', className: 'bg-muted text-muted-foreground' },
  cancelled: { label: 'Cancelado', className: 'bg-destructive/15 text-destructive' },
};

// Context-aware label for 'delivered' based on order type
export function getDeliveredLabel(type?: OrderType): string {
  if (type === 'delivery') return 'Entregado';
  if (type === 'pickup') return 'Recogido por cliente';
  if (type === 'dine-in') return 'Entregado en mesa';
  return 'Entregado';
}

export const StatusBadge = ({ status, orderType }: { status: OrderStatus; orderType?: OrderType }) => {
  const config = statusConfig[status];
  let label = config.label;
  if (status === 'delivered' && orderType) {
    label = getDeliveredLabel(orderType);
  }
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold', config.className)}>
      {label}
    </span>
  );
};
