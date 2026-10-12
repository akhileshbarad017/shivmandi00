import type { LucideIcon } from 'lucide-react';
import { Loader2, Save } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { formatINR } from '@/lib/format';
import { EASE } from '@/lib/motion';

interface SaveFabProps {
  total: number;
  label?: string;
  onSave: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: LucideIcon;
  /** When set (e.g. nothing selected yet), shows helper text instead of the ₹0 total. */
  hint?: string;
}

/** Compact floating action bar (mobile) — total/hint pill + rounded action button. */
export function SaveFab({
  total,
  label = 'Save',
  onSave,
  loading,
  disabled,
  icon: Icon = Save,
  hint,
}: SaveFabProps) {
  return (
    <m.div
      className="fixed right-3 bottom-[var(--bottom-offset)] z-40 flex max-w-[calc(100vw-1.5rem)] items-center gap-2 lg:hidden"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: EASE }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {hint ? (
          <m.span
            key="hint"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="glass-strong muted max-w-[55vw] truncate rounded-full px-3 py-2.5 text-xs leading-snug shadow-[var(--shadow)]"
          >
            {hint}
          </m.span>
        ) : (
          <m.span
            key="total"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="glass-strong font-display rounded-full px-3 py-2.5 text-sm font-bold tabular-nums shadow-[var(--shadow)]"
          >
            {formatINR(total)}
          </m.span>
        )}
      </AnimatePresence>
      <button
        type="button"
        onClick={onSave}
        disabled={disabled || loading}
        className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-gradient-to-r from-brand-500 to-brand-600 px-4 text-sm font-semibold text-white shadow-[var(--shadow)] transition active:scale-95 disabled:opacity-60"
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
        {label}
      </button>
    </m.div>
  );
}
