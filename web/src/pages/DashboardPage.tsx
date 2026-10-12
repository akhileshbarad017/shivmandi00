import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { m } from 'motion/react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  ChevronRight,
  ReceiptText,
  ShoppingBasket,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '@/app/auth';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { apiGet } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, formatINR, formatQty } from '@/lib/format';
import { listContainer, listItem, EASE } from '@/lib/motion';
import type { DashboardResponse } from '@/lib/types';

const STATUS_TONE: Record<string, BadgeTone> = {
  PAID: 'ok',
  PARTIAL: 'warn',
  PENDING: 'danger',
  CANCELLED: 'muted',
};

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardPage() {
  const { user } = useAuth();
  const dashboard = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiGet<DashboardResponse>('/dashboard'),
  });

  const data = dashboard.data;
  const firstName = user?.name.split(' ')[0] ?? 'there';
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });

  if (dashboard.isLoading) return <DashboardSkeleton />;

  const kpis = data?.kpis;
  const money = data?.money;
  const bills = data?.recent_bills ?? [];

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-3 pr-12">
        <div>
          <p className="muted text-sm">{greeting()}, {firstName} 👋</p>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Today at the mandi</h1>
        </div>
        <span className="muted hidden text-sm sm:block">{today}</span>
      </header>

      {/* Hero: today's sales */}
      <section className="relative overflow-hidden rounded-[1.25rem] bg-gradient-to-br from-brand-500 to-cyan p-5 text-white shadow-[var(--shadow)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-white/80">Today&apos;s Sales</p>
            <p className="font-display text-3xl font-semibold tabular-nums sm:text-4xl">
              <AnimatedNumber value={kpis?.today_sales ?? 0} />
            </p>
            <div className="mt-2 flex items-center gap-2 text-sm">
              <DeltaChip delta={kpis?.sales_delta ?? null} />
              <span className="text-white/80">{kpis?.bills_today ?? 0} bills today</span>
            </div>
          </div>
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/20">
            <ReceiptText className="size-6" />
          </div>
        </div>
        <Sparkline points={data?.weekly ?? []} />
      </section>

      {/* Secondary stats */}
      <m.section
        className="grid grid-cols-3 gap-3"
        variants={listContainer}
        initial="initial"
        animate="animate"
      >
        <m.div variants={listItem}>
          <StatTile
            icon={ShoppingBasket}
            tone="text-warn"
            label="Purchases"
            value={kpis?.today_purchases ?? 0}
          />
        </m.div>
        <m.div variants={listItem}>
          <StatTile
            icon={TrendingUp}
            tone="text-ok"
            label="Est. profit"
            value={kpis?.estimated_profit ?? 0}
          />
        </m.div>
        <m.div variants={listItem}>
          <StatTile
            icon={Boxes}
            tone="text-brand-500"
            label="Stock"
            value={kpis?.stock_value ?? 0}
            hint={`${formatQty(kpis?.stock_qty ?? 0)} kg`}
          />
        </m.div>
      </m.section>

      {/* Money pair — highlighted */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-base font-semibold">Money</h2>
          <span className="muted text-xs">Collections &amp; payouts</span>
        </div>
        <m.div
          className="grid grid-cols-2 gap-3"
          variants={listContainer}
          initial="initial"
          animate="animate"
        >
          <m.div variants={listItem}>
            <MoneyCard
              label="To receive"
              value={money?.to_receive ?? 0}
              parties={money?.receive_parties ?? 0}
              variant="receive"
              to="/sales"
              icon={ArrowDownRight}
            />
          </m.div>
          <m.div variants={listItem}>
            <MoneyCard
              label="To pay"
              value={money?.to_pay ?? 0}
              parties={money?.pay_parties ?? 0}
              variant="pay"
              to="/purchases"
              icon={ArrowUpRight}
            />
          </m.div>
        </m.div>
      </section>

      {/* 7-day chart */}
      <section className="glass glass-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold">Sales — last 7 days</h2>
        </div>
        <WeeklyChart points={data?.weekly ?? []} />
      </section>

      {/* Recent bills */}
      <section className="glass glass-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold">Recent bills</h2>
          <Link to="/sales" className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-brand-500">
            View all <ChevronRight className="size-3.5" />
          </Link>
        </div>

        {bills.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title="No bills yet"
            description="Create your first sale to see it here."
            action={
              <Link
                to="/sales/new"
                className="inline-flex min-h-11 items-center rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-4 text-sm font-semibold text-white"
              >
                New sale
              </Link>
            }
          />
        ) : (
          <m.div className="divide-y divide-[var(--border)]" variants={listContainer} initial="initial" animate="animate">
            {bills.map((bill) => (
              <m.div key={bill.invoice_no} variants={listItem} className="flex items-center gap-3 py-2.5">
                <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-500">
                  <ReceiptText className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{bill.buyer_name}</div>
                  <div className="muted text-xs">
                    {bill.invoice_no} · {formatDate(bill.invoice_date)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold tabular-nums">{formatINR(bill.total_amount)}</div>
                  <Badge tone={STATUS_TONE[bill.status] ?? 'muted'}>{bill.status}</Badge>
                </div>
              </m.div>
            ))}
          </m.div>
        )}
      </section>
    </div>
  );
}

function DeltaChip({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  const up = delta >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold')}>
      <Icon className="size-3.5" />
      {up ? '+' : ''}
      {delta}%
    </span>
  );
}

function Sparkline({ points }: { points: Array<{ date: string; sales: number }> }) {
  if (points.length < 2) return null;
  const max = Math.max(...points.map((p) => p.sales), 1);
  const stepX = 100 / (points.length - 1);
  const coords = points.map((point, index) => {
    const x = index * stepX;
    const y = 38 - (point.sales / max) * 34;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = coords.join(' ');
  const area = `0,40 ${line} 100,40`;

  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="mt-3 h-12 w-full" aria-hidden="true">
      <polygon points={area} fill="rgba(255,255,255,0.22)" />
      <polyline points={line} fill="none" stroke="white" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Boxes;
  label: string;
  value: number;
  hint?: string;
  tone: string;
}) {
  return (
    <div className="glass glass-card flex flex-col gap-2 p-3 sm:p-4">
      <span className={cn('grid size-8 place-items-center rounded-lg bg-[var(--surface-strong)]', tone)}>
        <Icon className="size-4" />
      </span>
      <div>
        <div className="muted text-xs">{label}</div>
        <div className="font-display text-sm font-semibold tabular-nums sm:text-base">
          <AnimatedNumber value={value} />
        </div>
        {hint && <div className="muted text-xs">{hint}</div>}
      </div>
    </div>
  );
}

const MONEY_VARIANTS = {
  receive: {
    card: 'bg-ok/10 border-ok/25 border-l-ok',
    badge: 'bg-ok/15 text-ok',
    value: 'text-ok',
    pill: 'bg-ok/15 text-ok',
  },
  pay: {
    card: 'bg-danger/10 border-danger/25 border-l-danger',
    badge: 'bg-danger/15 text-danger',
    value: 'text-danger',
    pill: 'bg-danger/15 text-danger',
  },
} as const;

function MoneyCard({
  label,
  value,
  parties,
  variant,
  to,
  icon: Icon,
}: {
  label: string;
  value: number;
  parties: number;
  variant: keyof typeof MONEY_VARIANTS;
  to: string;
  icon: typeof Boxes;
}) {
  const style = MONEY_VARIANTS[variant];
  const partyLabel = `${parties} ${parties === 1 ? 'party' : 'parties'}`;

  return (
    <Link
      to={to}
      aria-label={`${label}, ${formatINR(value)}, ${partyLabel}`}
      className={cn(
        'flex h-full flex-col gap-2 rounded-[1.25rem] border border-l-4 p-4 shadow-[var(--shadow-soft)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:shadow-[var(--shadow)] active:scale-[0.99]',
        style.card,
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cn('grid size-8 place-items-center rounded-lg', style.badge)}>
          <Icon className="size-4" />
        </span>
        <ChevronRight className="muted size-4" />
      </div>
      <div>
        <div className="muted text-xs">{label}</div>
        <div className={cn('font-display text-xl font-semibold tabular-nums sm:text-2xl', style.value)}>
          <AnimatedNumber value={value} />
        </div>
      </div>
      <span className={cn('w-fit rounded-full px-2 py-0.5 text-xs font-medium', style.pill)}>{partyLabel}</span>
    </Link>
  );
}

function WeeklyChart({ points }: { points: Array<{ date: string; sales: number }> }) {
  const max = Math.max(...points.map((p) => p.sales), 1);
  return (
    <div className="flex h-36 items-end justify-between gap-2">
      {points.map((point, index) => {
        const heightPct = Math.max(4, (point.sales / max) * 100);
        const day = new Date(point.date).toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 2);
        return (
          <div key={point.date} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex h-28 w-full items-end">
              <m.div
                className="w-full origin-bottom rounded-t-lg bg-gradient-to-t from-brand-500/70 to-brand-400"
                style={{ height: `${heightPct}%` }}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.45, ease: EASE, delay: index * 0.05 }}
                title={formatINR(point.sales)}
              />
            </div>
            <span className="muted text-xs font-medium uppercase">{day}</span>
          </div>
        );
      })}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-10 w-56 animate-pulse rounded-xl bg-[var(--surface-strong)]" />
      <div className="h-36 animate-pulse rounded-[1.25rem] bg-[var(--surface-strong)]" />
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((key) => (
          <div key={key} className="h-24 animate-pulse rounded-2xl bg-[var(--surface-strong)]" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[0, 1].map((key) => (
          <div key={key} className="h-24 animate-pulse rounded-2xl bg-[var(--surface-strong)]" />
        ))}
      </div>
      <div className="h-48 animate-pulse rounded-2xl bg-[var(--surface-strong)]" />
    </div>
  );
}
