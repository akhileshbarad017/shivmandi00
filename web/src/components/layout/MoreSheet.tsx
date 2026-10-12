import { Download, LogOut, X } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { AnimatePresence, m } from 'motion/react';
import { useAuth } from '@/app/auth';
import { NAV_GROUPS } from '@/app/navigation';
import { useInstallPrompt } from '@/lib/offline/useInstallPrompt';
import { cn } from '@/lib/cn';
import { listContainer, listItem } from '@/lib/motion';

interface MoreSheetProps {
  open: boolean;
  onClose: () => void;
}

export default function MoreSheet({ open, onClose }: MoreSheetProps) {
  const { user, logout } = useAuth();
  const { canInstall, install } = useInstallPrompt();
  const groups = NAV_GROUPS;

  return (
    <AnimatePresence>
      {open && (
        <m.div
          key="more-sheet"
          className="fixed inset-0 z-50 lg:hidden"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.16 } }}
        >
          <m.div
            role="button"
            tabIndex={-1}
            aria-label="Close menu"
            onClick={onClose}
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.16 } }}
          />
          <m.div
            role="dialog"
            aria-modal="true"
            aria-label="All modules"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%', transition: { duration: 0.2 } }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-3 shadow-[var(--shadow)] backdrop-blur-2xl"
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[var(--border-strong)]" />
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="font-display text-lg font-semibold">All modules</div>
                <div className="muted text-xs">{user ? user.name : 'Menu'}</div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="glass grid size-11 place-items-center rounded-full"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-5">
              {groups.map((group) => (
                <div key={group.key}>
                  <div className="muted px-1 pb-2 text-xs font-semibold uppercase tracking-wider">
                    {group.label}
                  </div>
                  <m.div
                    className="grid grid-cols-2 gap-2"
                    variants={listContainer}
                    initial="initial"
                    animate="animate"
                  >
                    {group.items.map((item) => (
                      <m.div key={item.key} variants={listItem}>
                        <NavLink
                          to={item.to}
                          end
                          onClick={onClose}
                          className={({ isActive }) =>
                            cn(
                              'flex w-full items-center gap-2.5 rounded-2xl border px-3 py-3 text-sm font-medium transition active:scale-[0.98]',
                              isActive
                                ? 'border-transparent bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow'
                                : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-strong)]',
                            )
                          }
                        >
                          {({ isActive }) => (
                            <>
                              <span
                                className={cn(
                                  'grid size-7 shrink-0 place-items-center rounded-lg',
                                  isActive ? 'bg-white/20 text-white' : 'bg-brand-500/10 text-brand-500',
                                )}
                              >
                                <item.icon className="size-4" />
                              </span>
                              <span className="truncate">{item.label}</span>
                            </>
                          )}
                        </NavLink>
                      </m.div>
                    ))}
                  </m.div>
                </div>
              ))}
            </div>

            {canInstall && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  void install();
                }}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] px-3 py-3 text-sm font-medium text-brand-600"
              >
                <Download className="size-4" />
                Install app
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                onClose();
                void logout();
              }}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] px-3 py-3 text-sm font-medium text-danger',
                canInstall ? 'mt-2' : 'mt-6',
              )}
            >
              <LogOut className="size-4" />
              Sign out
            </button>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
