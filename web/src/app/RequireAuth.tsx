import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Leaf } from 'lucide-react';
import { useAuth } from './auth';

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="glass-strong flex items-center gap-3 rounded-2xl px-6 py-4">
        <div className="grid size-10 animate-pulse place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-cyan text-white">
          <Leaf className="size-5" />
        </div>
        <span className="muted text-sm">Loading workspace…</span>
      </div>
    </div>
  );
}

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}
