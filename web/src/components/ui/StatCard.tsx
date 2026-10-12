import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

interface StatCardProps {
  label: string;
  value: string;
  icon?: LucideIcon;
  tone?: string;
  hint?: string;
}

export function StatCard({ label, value, icon: Icon, tone = 'text-brand-500', hint }: StatCardProps) {
  return (
    <div className="glass glass-card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        {Icon ? <Icon className={cn('size-5', tone)} /> : <span />}
        {hint && <span className="muted text-xs font-medium">{hint}</span>}
      </div>
      <div>
        <div className="muted text-xs">{label}</div>
        <div className="font-display text-lg font-semibold sm:text-xl">{value}</div>
      </div>
    </div>
  );
}
