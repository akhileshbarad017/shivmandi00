import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'brand' | 'ok' | 'warn' | 'danger' | 'muted' | 'cyan';

const TONES: Record<BadgeTone, string> = {
  brand: 'bg-brand-500/15 text-brand-600',
  ok: 'bg-ok/15 text-ok',
  warn: 'bg-warn/15 text-warn',
  danger: 'bg-danger/15 text-danger',
  muted: 'bg-[var(--surface-strong)] text-[var(--muted)]',
  cyan: 'bg-cyan/15 text-cyan',
};

export function Badge({ tone = 'muted', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}
