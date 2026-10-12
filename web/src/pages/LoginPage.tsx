import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { m } from 'motion/react';
import { Leaf, Loader2, Lock, User } from 'lucide-react';
import { useAuth } from '@/app/auth';
import { EASE } from '@/lib/motion';

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();

  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(identity.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center px-4 py-10">
      <m.div
        className="w-full min-w-0 max-w-sm"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE }}
      >
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-cyan text-white shadow-lg">
            <Leaf className="size-7" strokeWidth={2.2} />
          </div>
          <div className="min-w-0 text-left">
            <h1 className="font-display text-xl font-semibold leading-tight">
              Vijay Pandey <span className="text-gradient">&amp; Company</span>
            </h1>
            <p className="muted text-sm">Sign in to your mandi</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="glass-strong glass-card space-y-4 p-6">
          <label className="block">
            <span className="muted mb-1 block text-xs font-medium">Username or mobile</span>
            <div className="flex h-12 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-400/30">
              <User className="size-4 shrink-0 opacity-60" />
              <input
                value={identity}
                onChange={(event) => setIdentity(event.target.value)}
                autoComplete="username"
                className="h-full flex-1 bg-transparent text-base leading-none outline-none placeholder:opacity-50"
                placeholder="admin"
                required
                autoFocus
              />
            </div>
          </label>

          <label className="block">
            <span className="muted mb-1 block text-xs font-medium">Password</span>
            <div className="flex h-12 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-400/30">
              <Lock className="size-4 shrink-0 opacity-60" />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                className="h-full flex-1 bg-transparent text-base leading-none outline-none placeholder:opacity-50"
                placeholder="••••••••"
                required
              />
            </div>
          </label>

          {error && (
            <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </m.div>
    </div>
  );
}
