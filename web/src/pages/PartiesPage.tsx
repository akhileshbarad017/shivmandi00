import { useMemo, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  ChevronRight,
  IndianRupee,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { LedgerModal } from '@/components/parties/LedgerModal';
import { PartyFormModal } from '@/components/parties/PartyFormModal';
import { PaymentModal } from '@/components/parties/PaymentModal';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { SearchInput } from '@/components/ui/SearchInput';
import { useToast } from '@/components/ui/Toast';
import { apiDelete, apiGet } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatINR, initials } from '@/lib/format';
import { useDebounce } from '@/lib/useDebounce';
import { PARTY_TYPE_LABEL, type Party, type PartyListResponse, type PartyType } from '@/lib/types';

const PAGE_SIZE = 25;

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'buyer', label: 'Buyers' },
  { key: 'farmer', label: 'Farmers' },
  { key: 'agent', label: 'Agents' },
  { key: 'supplier', label: 'Suppliers' },
];

const SORTS: Array<{ key: string; label: string }> = [
  { key: 'balance', label: 'Outstanding' },
  { key: 'name', label: 'Name (A–Z)' },
  { key: 'frequent', label: 'Most used' },
  { key: 'recent', label: 'Recent' },
];

const TYPE_TONE: Record<PartyType, BadgeTone> = {
  buyer: 'brand',
  farmer: 'ok',
  supplier: 'cyan',
  agent: 'warn',
};

export default function PartiesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [type, setType] = useState('all');
  const [sort, setSort] = useState('balance');
  const [search, setSearch] = useState('');
  const [openActions, setOpenActions] = useState<number | null>(null);
  const q = useDebounce(search, 300);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Party | null>(null);
  const [payParty, setPayParty] = useState<Party | null>(null);
  const [ledgerParty, setLedgerParty] = useState<Party | null>(null);
  const [toDelete, setToDelete] = useState<Party | null>(null);

  const list = useInfiniteQuery({
    queryKey: ['parties', 'list', type, q, sort],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      apiGet<PartyListResponse>(
        `/parties?type=${type}&q=${encodeURIComponent(q)}&sort=${sort}&limit=${PAGE_SIZE}&offset=${pageParam}`,
      ),
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.items.length, 0);
      return loaded < (lastPage.total ?? 0) ? loaded : undefined;
    },
  });

  // Frequently used parties (for quick access at the top).
  const frequent = useQuery({
    queryKey: ['parties', 'frequent', type],
    queryFn: () => apiGet<PartyListResponse>(`/parties?type=${type}&sort=frequent&limit=8`),
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiDelete(`/parties/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['parties'] });
      toast.notify('Party removed', 'success');
      setToDelete(null);
    },
    onError: (error: Error) => toast.notify(error.message, 'error'),
  });

  const parties = useMemo(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data]);
  const total = list.data?.pages[0]?.total ?? 0;
  const counts = list.data?.pages[0]?.counts;
  const frequentItems = (frequent.data?.items ?? []).filter((party) => (party.usage_count ?? 0) > 0);
  const showFrequent = !q && frequentItems.length > 0;

  function openProfile(party: Party) {
    navigate(`/party/${party.id}`);
  }

  function rowActions(party: Party, withLabels = false) {
    const items = [
      { icon: BookOpen, label: 'Khata', run: () => setLedgerParty(party), danger: false },
      { icon: IndianRupee, label: 'Settle', run: () => setPayParty(party), danger: false },
      {
        icon: Pencil,
        label: 'Edit',
        run: () => {
          setEditing(party);
          setFormOpen(true);
        },
        danger: false,
      },
      { icon: Trash2, label: 'Delete', run: () => setToDelete(party), danger: true },
    ];
    if (!withLabels) {
      return (
        <div className="flex justify-end gap-0.5" onClick={(event) => event.stopPropagation()}>
          {items.map((item) => (
            <Button key={item.label} size="icon" variant="ghost" title={item.label} onClick={item.run}>
              <item.icon className={cn('size-4', item.danger && 'text-danger')} />
            </Button>
          ))}
        </div>
      );
    }
    return (
      <div className="grid grid-cols-2 gap-2" onClick={(event) => event.stopPropagation()}>
        {items.map((item) => (
          <Button key={item.label} size="sm" variant="subtle" icon={item.icon} onClick={item.run}>
            {item.label}
          </Button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Parties"
        subtitle="Farmers, buyers, suppliers and agents with live khata balances."
        icon={Users}
        actions={
          <Button
            icon={Plus}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            Add party
          </Button>
        }
      />

      {counts && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <MiniStat label="Farmers" value={counts.farmer ?? 0} tone="text-ok" />
          <MiniStat label="Buyers" value={counts.buyer ?? 0} tone="text-brand-500" />
          <MiniStat label="Suppliers" value={counts.supplier ?? 0} tone="text-cyan" />
          <MiniStat label="Agents" value={counts.agent ?? 0} tone="text-warn" />
        </div>
      )}

      {/* Sticky search / filters */}
      <div className="sticky top-0 z-30 -mx-4 space-y-3 border-b border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search name, mobile, village…"
            className="sm:max-w-sm"
          />
          <label className="glass flex items-center gap-2 rounded-xl px-3 py-2 text-sm">
            <span className="muted whitespace-nowrap text-xs font-semibold uppercase tracking-wide">Sort</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              className="bg-transparent text-sm font-medium outline-none"
            >
              {SORTS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => setType(filter.key)}
              className={cn(
                'inline-flex min-h-9 items-center rounded-full px-3 py-1.5 text-xs font-semibold transition',
                type === filter.key
                  ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white'
                  : 'glass muted hover:text-[var(--text)]',
              )}
            >
              {filter.label}
              {counts && filter.key !== 'all' ? ` · ${counts[filter.key] ?? 0}` : ''}
            </button>
          ))}
        </div>
      </div>

      {showFrequent && (
        <section className="space-y-2">
          <h2 className="muted text-xs font-semibold uppercase tracking-wide">Frequently used</h2>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {frequentItems.map((party) => (
              <button
                key={party.id}
                type="button"
                onClick={() => openProfile(party)}
                className="glass inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-xs font-semibold transition active:scale-95 hover:border-brand-400"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-cyan text-xs font-bold text-white">
                  {initials(party.name)}
                </span>
                <span className="max-w-[8rem] truncate">{party.name}</span>
                {party.balance > 0 && (
                  <span className="font-semibold tabular-nums text-warn">{formatINR(party.balance)}</span>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {list.isLoading ? (
        <div className="glass glass-card">
          <EmptyState icon={Users} title="Loading parties…" />
        </div>
      ) : parties.length === 0 ? (
        <div className="glass glass-card">
          <EmptyState
            icon={Users}
            title={q ? 'No matches' : 'No parties yet'}
            description={q ? `Nothing found for “${q}”.` : 'Add farmers and buyers to start tracking khata.'}
            action={
              !q ? (
                <Button
                  icon={Plus}
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                >
                  Add party
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="glass hidden overflow-hidden rounded-2xl sm:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left">
                  <th className="muted px-4 py-2.5 text-xs font-semibold uppercase tracking-wider">Party</th>
                  <th className="muted px-4 py-2.5 text-xs font-semibold uppercase tracking-wider">Mobile</th>
                  <th className="muted px-4 py-2.5 text-xs font-semibold uppercase tracking-wider">Village / City</th>
                  <th className="muted px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider">
                    Outstanding
                  </th>
                  <th className="muted px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider" />
                </tr>
              </thead>
              <tbody>
                {parties.map((party) => (
                  <tr
                    key={party.id}
                    onClick={() => openProfile(party)}
                    className="cursor-pointer border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-strong)]"
                  >
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-3">
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-cyan text-xs font-bold text-white">
                          {initials(party.name)}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium">{party.name}</span>
                            <Badge tone={TYPE_TONE[party.type]}>{PARTY_TYPE_LABEL[party.type]}</Badge>
                          </div>
                          {party.code && <div className="muted text-xs">{party.code}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2">{party.phone || '—'}</td>
                    <td className="muted max-w-[12rem] truncate px-4 py-2">{party.address || '—'}</td>
                    <td className="px-4 py-2 text-right">
                      <BalanceBadge party={party} />
                    </td>
                    <td className="px-4 py-2">{rowActions(party)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile compact rows */}
          <div className="space-y-2 sm:hidden">
            {parties.map((party) => (
              <div key={party.id} className="glass glass-card !py-2.5">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => openProfile(party)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-cyan text-xs font-bold text-white">
                      {initials(party.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{party.name}</span>
                      <span className="muted block truncate text-xs">
                        {[party.code, party.phone].filter(Boolean).join(' · ') || PARTY_TYPE_LABEL[party.type]}
                      </span>
                    </span>
                    <BalanceBadge party={party} />
                    <ChevronRight className="size-4 shrink-0 opacity-40" />
                  </button>
                  <button
                    type="button"
                    aria-label="Actions"
                    onClick={() => setOpenActions(openActions === party.id ? null : party.id)}
                    className="muted grid size-9 shrink-0 place-items-center rounded-full hover:text-[var(--text)]"
                  >
                    <MoreVertical className="size-4" />
                  </button>
                </div>
                {openActions === party.id && (
                  <div className="mt-2 border-t border-[var(--border)] pt-2">{rowActions(party, true)}</div>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-col items-center gap-2">
            <p className="muted text-xs">
              Showing {parties.length} of {total}
            </p>
            {list.hasNextPage && (
              <Button
                variant="subtle"
                loading={list.isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}
              >
                Load more ({Math.max(0, total - parties.length)} left)
              </Button>
            )}
          </div>
        </>
      )}

      <PartyFormModal open={formOpen} onClose={() => setFormOpen(false)} party={editing} />
      <PaymentModal open={!!payParty} onClose={() => setPayParty(null)} party={payParty} />
      <LedgerModal open={!!ledgerParty} onClose={() => setLedgerParty(null)} party={ledgerParty} />
      <ConfirmDialog
        open={!!toDelete}
        title="Remove party?"
        message={`${toDelete?.name ?? ''} and their history will be hidden from lists.`}
        confirmLabel="Remove"
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}

function BalanceBadge({ party }: { party: Party }) {
  const payable = party.type !== 'buyer';
  const has = party.balance > 0;
  return (
    <span className="inline-flex flex-col items-end">
      <span
        className={cn(
          'rounded-full px-2 py-0.5 text-sm font-semibold tabular-nums',
          has ? (payable ? 'bg-danger/10 text-danger' : 'bg-brand-500/10 text-brand-600') : 'muted',
        )}
      >
        {formatINR(party.balance)}
      </span>
      {has && <span className="muted text-[10px]">{payable ? 'Payable' : 'Receivable'}</span>}
    </span>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="glass glass-card flex items-center justify-between py-2.5">
      <span className="muted text-xs font-medium uppercase tracking-wide">{label}</span>
      <span className={`font-display text-lg font-bold tabular-nums ${tone}`}>{value}</span>
    </div>
  );
}
