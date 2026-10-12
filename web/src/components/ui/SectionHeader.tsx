import type { LucideIcon } from 'lucide-react';

export function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-500">
        <Icon className="size-4" />
      </span>
      <div>
        <h2 className="font-display text-base font-semibold leading-tight">{title}</h2>
        {subtitle && <p className="muted text-xs">{subtitle}</p>}
      </div>
    </div>
  );
}
