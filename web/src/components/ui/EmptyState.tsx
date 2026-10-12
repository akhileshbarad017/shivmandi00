import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="grid place-items-center gap-3 px-4 py-14 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-brand-500/10 text-brand-500">
        <Icon className="size-6" />
      </div>
      <div>
        <p className="font-display font-semibold">{title}</p>
        {description && <p className="muted mt-1 text-sm">{description}</p>}
      </div>
      {action}
    </div>
  );
}
