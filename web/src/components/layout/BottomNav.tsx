import { MoreHorizontal } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { m } from 'motion/react';
import { BOTTOM_NAV } from '@/app/navigation';
import { cn } from '@/lib/cn';

const PILL_TRANSITION = { type: 'spring', stiffness: 420, damping: 34 } as const;

export default function BottomNav({ onMore }: { onMore: () => void }) {
  const { pathname } = useLocation();
  const moreActive = !BOTTOM_NAV.some((item) => item.to === pathname);
  const items = BOTTOM_NAV;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 lg:hidden">
      <div className="mx-3 mb-[max(0.75rem,env(safe-area-inset-bottom))] rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] px-1 py-1.5 shadow-[var(--shadow)] backdrop-blur-2xl">
        <div className="flex items-stretch">
          {items.map((item) => (
            <NavLink
              key={item.key}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'relative flex flex-1 flex-col items-center gap-0.5 rounded-xl px-0.5 py-1.5 text-xs font-medium transition active:scale-95',
                  isActive ? 'text-brand-600' : 'muted',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className="relative grid size-8 place-items-center rounded-xl">
                    {isActive && (
                      <m.span
                        layoutId="nav-pill"
                        className="absolute inset-0 rounded-xl bg-brand-500/12"
                        transition={PILL_TRANSITION}
                      />
                    )}
                    <item.icon className="relative z-10 size-5" strokeWidth={isActive ? 2.4 : 2} />
                  </span>
                  <span className={cn('max-w-full truncate', isActive && 'font-semibold')}>{item.label}</span>
                  <span
                    className={cn(
                      'h-1 w-1 rounded-full transition-opacity',
                      isActive ? 'bg-brand-500 opacity-100' : 'opacity-0',
                    )}
                  />
                </>
              )}
            </NavLink>
          ))}

          <button
            type="button"
            onClick={onMore}
            className={cn(
              'relative flex flex-1 flex-col items-center gap-0.5 rounded-xl px-0.5 py-1.5 text-xs font-medium transition active:scale-95',
              moreActive ? 'text-brand-600' : 'muted',
            )}
          >
            <span className="relative grid size-8 place-items-center rounded-xl">
              {moreActive && (
                <m.span
                  layoutId="nav-pill"
                  className="absolute inset-0 rounded-xl bg-brand-500/12"
                  transition={PILL_TRANSITION}
                />
              )}
              <MoreHorizontal className="relative z-10 size-5" strokeWidth={moreActive ? 2.4 : 2} />
            </span>
            <span className={cn('max-w-full truncate', moreActive && 'font-semibold')}>More</span>
            <span
              className={cn(
                'h-1 w-1 rounded-full transition-opacity',
                moreActive ? 'bg-brand-500 opacity-100' : 'opacity-0',
              )}
            />
          </button>
        </div>
      </div>
    </nav>
  );
}
