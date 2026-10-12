import { useSyncExternalStore } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { AnimatePresence, m } from 'motion/react';
import { CloudOff, CloudUpload, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { EASE } from '@/lib/motion';
import { flushOutbox, getSnapshot, retryFailed, subscribe } from '@/lib/offline/outbox';

/** Reactive wrapper around TanStack's online manager. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => onlineManager.subscribe(onChange),
    () => onlineManager.isOnline(),
    () => true,
  );
}

/**
 * Compact connectivity / outbox indicator. Hidden while online with a clean
 * queue, so it never blocks interactive content.
 */
export function SyncStatus() {
  const online = useOnline();
  const { queued, failed, syncing } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const idle = online && queued === 0 && failed === 0 && !syncing;

  const label = !online
    ? queued > 0
      ? `Offline · ${queued} to sync`
      : 'Offline'
    : failed > 0
      ? `${failed} failed to sync`
      : syncing
        ? 'Syncing…'
        : `${queued} to sync`;

  return (
    <AnimatePresence>
      {!idle && (
        <m.div
          key="sync-status"
          className="fixed left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[70] lg:hidden"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2, ease: EASE }}
        >
          <button
            type="button"
            onClick={() => {
              if (failed > 0) void retryFailed();
              else void flushOutbox();
            }}
            className={cn(
              'glass-strong inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-xs font-semibold shadow-[var(--shadow)]',
              !online ? 'text-warn' : failed > 0 ? 'text-danger' : 'text-brand-600',
            )}
          >
            {!online ? (
              <CloudOff className="size-4 shrink-0" />
            ) : failed > 0 ? (
              <CloudUpload className="size-4 shrink-0" />
            ) : (
              <RefreshCw className={cn('size-4 shrink-0', syncing && 'animate-spin')} />
            )}
            <span className="max-w-[10rem] truncate">{label}</span>
          </button>
        </m.div>
      )}
    </AnimatePresence>
  );
}
