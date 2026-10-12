import { Leaf, LogOut } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/app/auth';
import { NAV_GROUPS } from '@/app/navigation';
import { cn } from '@/lib/cn';

export default function Sidebar() {
  const { user, logout } = useAuth();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r border-[var(--border)] bg-[var(--surface)] backdrop-blur-xl lg:flex">
      <div className="flex items-center gap-3 px-6 py-5">
        <div className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-cyan text-white shadow-lg">
          <Leaf className="size-6" strokeWidth={2.2} />
        </div>
        <div className="min-w-0">
          <div className="font-display truncate text-base font-semibold leading-tight">Vijay Pandey</div>
          <div className="muted text-xs">&amp; Company</div>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
        {NAV_GROUPS.map((group) => (
          <div key={group.key}>
            <div className="muted px-3 pb-1 text-xs font-semibold uppercase tracking-wider">
              {group.label}
            </div>
            <div className="space-y-1">
              {group.items.map((item) => (
                <NavLink
                  key={item.key}
                  to={item.to}
                  end
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                      isActive
                        ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow'
                        : 'muted hover:bg-[var(--surface-strong)] hover:text-[var(--text)]',
                    )
                  }
                >
                  <item.icon className="size-4 shrink-0" />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {user && (
        <div className="border-t border-[var(--border)] px-5 py-4">
          <div className="muted text-xs uppercase tracking-wider">Signed in as</div>
          <div className="truncate text-sm font-medium">{user.name}</div>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-2 inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-danger transition hover:bg-[var(--surface-strong)]"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </div>
      )}
    </aside>
  );
}
