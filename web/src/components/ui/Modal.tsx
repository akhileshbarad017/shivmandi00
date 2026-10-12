import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { EASE } from '@/lib/motion';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <m.div
          key="modal"
          className="modal-root fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.16, ease: EASE } }}
        >
          <m.button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="absolute inset-0 bg-black/45 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.16 } }}
          />
          <m.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.22, ease: EASE } }}
            exit={{ opacity: 0, y: 16, scale: 0.98, transition: { duration: 0.15, ease: EASE } }}
            className={cn(
              'relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-[var(--border-strong)] bg-[var(--surface-solid)] shadow-[var(--shadow)] sm:rounded-3xl',
              size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-lg',
            )}
          >
            <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-[var(--border-strong)] sm:hidden" />
            {title && (
              <div className="flex items-start justify-between gap-4 px-4 pb-2 pt-4 sm:px-6">
                <div>
                  <h2 className="font-display text-lg font-semibold">{title}</h2>
                  {description && <p className="muted text-sm">{description}</p>}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="glass grid size-11 shrink-0 place-items-center rounded-full"
                >
                  <X className="size-4" />
                </button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-6">{children}</div>
            {footer && (
              <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-4 py-3 sm:px-6">
                {footer}
              </div>
            )}
          </m.div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
