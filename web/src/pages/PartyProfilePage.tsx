import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatCard } from '@/components/ui/StatCard';
import { apiGet } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, formatINR, formatQty } from '@/lib/format';
import { PARTY_TYPE_LABEL, type LedgerEntry, type PartyProfileResponse, type PartyType } from '@/lib/types';

const TYPE_TONE: Record<PartyType, BadgeTone> = {
  buyer: 'brand',
  farmer: 'ok',
  supplier: 'cyan',
  agent: 'warn',
};

type Tab = 'overview' | 'purchases' | 'bills' | 'ledger' | 'payments';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'purchases', label: 'Purchases' },
  { key: 'bills', label: 'Bills' },
  { key: 'ledger', label: 'Transactions' },
  { key: 'payments', label: 'Payments' },
];

export default function PartyProfilePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');

  const query = useQuery({
    queryKey: ['party-profile', id],
    queryFn: () => apiGet<PartyProfileResponse>(`/parties/${id}/profile`),
    enabled: !!id,
  });

  const data = query.data;

  if (query.isLoading) {
    return <p className="muted py-16 text-center text-sm">Loading profile…</p>;
  }
  if (!data) {
    return <p className="muted py-16 text-center text-sm">Party not found.</p>;
  }

  const { party, ledger, invoices, purchases, payments, stats } = data;
  const isBuyer = party.type === 'buyer';

  const ledgerColumns: Column<LedgerEntry>[] = [
    { key: 'date', header: 'Date', render: (row) => formatDate(row.date) },
    {
      key: 'label',
      header: 'Particulars',
      render: (row) => (
        <div>
          <div className="font-medium">{row.label}</div>
          <div className="muted text-xs">{row.ref}</div>
        </div>
      ),
    },
    { key: 'debit', header: 'Debit', align: 'right', render: (row) => (row.debit ? formatINR(row.debit) : '—') },
    { key: 'credit', header: 'Credit', align: 'right', render: (row) => (row.credit ? formatINR(row.credit) : '—') },
    { key: 'balance', header: 'Balance', align: 'right', render: (row) => <span className="font-medium">{formatINR(row.balance)}</span> },
  ];

  const invoiceColumns: Column<PartyProfileResponse['invoices'][number]>[] = [
    { key: 'invoice_date', header: 'Date', render: (row) => formatDate(row.invoice_date) },
    { key: 'invoice_no', header: 'Bill', render: (row) => <span className="font-medium">{row.invoice_no}</span> },
    { key: 'total_amount', header: 'Total', align: 'right', render: (row) => formatINR(row.total_amount) },
    { key: 'paid_amount', header: 'Paid', align: 'right', render: (row) => formatINR(row.paid_amount) },
    {
      key: 'balance_due',
      header: 'Pending',
      align: 'right',
      render: (row) => <span className={row.balance_due > 0 ? 'text-warn' : 'muted'}>{formatINR(row.balance_due)}</span>,
    },
    { key: 'status', header: 'Status', align: 'right', render: (row) => <Badge tone={row.status === 'PAID' ? 'ok' : 'warn'}>{row.status}</Badge> },
  ];

  const purchaseColumns: Column<PartyProfileResponse['purchases'][number]>[] = [
    { key: 'date', header: 'Date', render: (row) => formatDate(row.date) },
    { key: 'bill_no', header: 'Bill', render: (row) => <span className="font-medium">{row.bill_no}</span> },
    { key: 'goods_amount', header: 'Goods', align: 'right', render: (row) => formatINR(row.goods_amount) },
    { key: 'commission_amount', header: 'Commission', align: 'right', render: (row) => (row.commission_amount ? `− ${formatINR(row.commission_amount)}` : '—') },
    { key: 'net_amount', header: 'Net', align: 'right', render: (row) => formatINR(row.net_amount) },
    {
      key: 'balance_due',
      header: 'Balance',
      align: 'right',
      render: (row) => <span className={row.balance_due > 0 ? 'text-warn' : 'muted'}>{formatINR(row.balance_due)}</span>,
    },
  ];

  const paymentColumns: Column<PartyProfileResponse['payments'][number]>[] = [
    { key: 'date', header: 'Date', render: (row) => formatDate(row.date) },
    { key: 'voucher_no', header: 'Voucher' },
    { key: 'type', header: 'Type', render: (row) => <Badge tone={row.type === 'receipt' ? 'ok' : row.type === 'expense' ? 'muted' : 'warn'}>{row.type}</Badge> },
    { key: 'mode', header: 'Mode', mobileHidden: true },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (row) => <span className="font-medium">{formatINR(row.amount)}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => navigate('/parties')}
        className="muted inline-flex min-h-11 items-center gap-1 text-sm font-medium hover:text-[var(--text)]"
      >
        <ArrowLeft className="size-4" /> Parties
      </button>

      <header className="glass-strong glass-card flex flex-wrap items-center gap-3">
        <div className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-cyan text-lg font-bold text-white">
          {party.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-display truncate text-xl font-semibold">{party.name}</h1>
          <div className="muted text-xs">
            {party.code} · {PARTY_TYPE_LABEL[party.type]}
          </div>
        </div>
        <Badge tone={TYPE_TONE[party.type]}>{PARTY_TYPE_LABEL[party.type]}</Badge>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total purchases" value={formatINR(isBuyer ? stats.total_billed : stats.purchase_amount)} />
        <StatCard label="Total paid" value={formatINR(stats.total_paid)} tone="text-ok" />
        <StatCard label={isBuyer ? 'Pending' : 'Pending (payable)'} value={formatINR(stats.total_pending)} tone="text-warn" />
        <StatCard label="Current balance" value={formatINR(stats.current_balance)} tone="text-cyan" />
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={cn(
              'inline-flex min-h-11 items-center rounded-full px-3 py-1.5 text-xs font-semibold transition',
              tab === item.key ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white' : 'glass muted',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Detail label="Name" value={party.name} />
          <Detail label="Customer ID" value={party.code ?? '—'} />
          <Detail label="Type" value={PARTY_TYPE_LABEL[party.type]} />
          <Detail label="Mobile" value={party.phone || '—'} />
          <Detail label="GSTIN" value={party.gstin || '—'} />
          <Detail label="Village / City" value={party.address || '—'} />
        </div>
      )}

      {tab === 'purchases' &&
        (invoices.length === 0 ? (
          <EmptyState icon={ArrowLeft} title="No purchases yet" />
        ) : (
          <LoadMore
            items={invoices}
            render={(slice) => (
              <div className="space-y-3">
                {slice.map((invoice) => (
                  <div key={invoice.id} className="glass glass-card">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-sm font-medium">
                        {formatDate(invoice.invoice_date)} · {invoice.invoice_no}
                      </div>
                      <span className="font-semibold tabular-nums">{formatINR(invoice.total_amount)}</span>
                    </div>
                    {invoice.items.length === 0 ? (
                      <p className="muted text-xs">No line items</p>
                    ) : (
                      <div className="space-y-1 text-sm">
                        {invoice.items.map((item, index) => (
                          <div key={index} className="flex items-center justify-between">
                            <span>
                              {item.commodity_name} — {formatQty(item.weight)}{' '}
                              {item.unit === 'CRATE20' ? '(20kg)' : 'kg'} @ {formatINR(item.rate)}
                            </span>
                            <span className="tabular-nums">{formatINR(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          />
        ))}

      {tab === 'bills' &&
        (isBuyer ? (
          <LoadMore
            items={invoices}
            render={(slice) => (
              <DataTable
                columns={invoiceColumns}
                rows={slice}
                rowKey={(row) => row.id}
                empty={<EmptyState icon={ArrowLeft} title="No bills" />}
              />
            )}
          />
        ) : (
          <LoadMore
            items={purchases}
            render={(slice) => (
              <DataTable
                columns={purchaseColumns}
                rows={slice}
                rowKey={(row) => row.id}
                empty={<EmptyState icon={ArrowLeft} title="No bills" />}
              />
            )}
          />
        ))}

      {tab === 'ledger' && (
        <LoadMore
          items={ledger.entries}
          render={(slice) => (
            <DataTable
              columns={ledgerColumns}
              rows={slice}
              rowKey={(row) => `${row.type}-${row.ref}-${row.date}`}
              empty={<EmptyState icon={ArrowLeft} title="No transactions" />}
            />
          )}
        />
      )}

      {tab === 'payments' && (
        <LoadMore
          items={payments}
          render={(slice) => (
            <DataTable
              columns={paymentColumns}
              rows={slice}
              rowKey={(row) => row.id}
              empty={<EmptyState icon={ArrowLeft} title="No payments" />}
            />
          )}
        />
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass glass-card">
      <div className="muted text-xs">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

/** Render a long list in chunks so the page stays short. */
function LoadMore<T>({
  items,
  step = 20,
  render,
}: {
  items: T[];
  step?: number;
  render: (slice: T[]) => ReactNode;
}) {
  const [visible, setVisible] = useState(step);
  return (
    <div className="space-y-3">
      {render(items.slice(0, visible))}
      {visible < items.length && (
        <div className="flex justify-center">
          <Button variant="subtle" onClick={() => setVisible((current) => current + step)}>
            Load more ({items.length - visible} left)
          </Button>
        </div>
      )}
    </div>
  );
}
