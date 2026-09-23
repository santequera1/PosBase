interface EmptyStateProps {
  emoji: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export const EmptyState = ({ emoji, title, description, action }: EmptyStateProps) => (
  <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
    <span className="text-6xl mb-4">{emoji}</span>
    <h3 className="font-display text-lg font-semibold text-foreground mb-1">{title}</h3>
    <p className="text-sm text-muted-foreground mb-4 max-w-xs">{description}</p>
    {action}
  </div>
);
