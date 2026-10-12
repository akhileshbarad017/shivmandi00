import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, icon: Icon, actions }: PageHeaderProps) {
  return (
    <div className="glass-strong glass-card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-4">
        {Icon && (
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-500/15 to-cyan/15 text-brand-500">
            <Icon className="size-6" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="font-display truncate text-xl font-semibold sm:text-2xl">{title}</h1>
          {subtitle && <p className="muted truncate text-sm">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
