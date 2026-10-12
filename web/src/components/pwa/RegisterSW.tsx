import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { AnimatePresence, m } from 'motion/react';
import { RefreshCw, X } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { EASE } from '@/lib/motion';

/** Handles service-worker registration, offline-ready notice and update prompt. */
export function RegisterSW() {
  const toast = useToast();
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (offlineReady) {
      toast.notify('App is ready to work offline', 'success');
      setOfflineReady(false);
    }
  }, [offlineReady, setOfflineReady, toast]);

  return (
    <AnimatePresence>
      {needRefresh && (
        <m.div
          key="sw-update"
          className="fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[90] flex justify-center px-3"
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.22, ease: EASE }}
        >
          <div className="glass-strong flex w-full max-w-sm items-center gap-3 rounded-2xl px-4 py-3 shadow-[var(--shadow)]">
            <RefreshCw className="size-5 shrink-0 text-brand-500" />
            <span className="min-w-0 flex-1 text-sm">A new version is available.</span>
            <button
              type="button"
              onClick={() => void updateServiceWorker(true)}
              className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-3 text-xs font-semibold text-white"
            >
              Reload
            </button>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setNeedRefresh(false)}
              className="muted grid size-11 shrink-0 place-items-center rounded-full"
            >
              <X className="size-4" />
            </button>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
