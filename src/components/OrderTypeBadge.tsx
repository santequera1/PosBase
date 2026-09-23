import { cn } from '@/lib/utils';
import type { OrderType } from '@/store/useStore';

const typeConfig: Record<OrderType, { label: string; emoji: string; className: string }> = {
  delivery: { label: 'Domicilio', emoji: '🛵', className: 'bg-destructive/15 text-destructive' },
  pickup: { label: 'Recoger', emoji: '🛍️', className: 'bg-warning/15 text-warning' },
  'dine-in': { label: 'Comer aquí', emoji: '🍽️', className: 'bg-success/15 text-success' },
};

export const OrderTypeBadge = ({ type }: { type: OrderType }) => {
  const config = typeConfig[type];
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap', config.className)}>
      {config.emoji} {config.label}
    </span>
  );
};
