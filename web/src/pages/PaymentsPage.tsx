import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Plus, Trash2, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';
import { StatCard } from '@/components/ui/StatCard';
import { useToast } from '@/components/ui/Toast';
import { apiDelete, apiGet } from '@/lib/api';
import { offlineWrite } from '@/lib/offline/outbox';
import { cn } from '@/lib/cn';
import { formatDate, formatINR } from '@/lib/format';
import { useDebounce } from '@/lib/useDebounce';
import type { PartyListResponse, PaymentListResponse, PaymentRow } from '@/lib/types';

const FILTERS = [
  { key: 'money', label: 'All' },
  { key: 'receipt', label: 'Receipts' },
  { key: 'payment', label: 'Payouts' },
];

export default function PaymentsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [type, setType] = useState('money');
  const [search, setSearch] = useState('');
  const q = useDebounce(search, 300);
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<PaymentRow | null>(null);

  const payments = useQuery({
    queryKey: ['payments', type, q],
    queryFn: () => apiGet<PaymentListResponse>(`/payments?type=${type}&q=${encodeURIComponent(q)}`),
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiDelete(`/payments/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
      void queryClient.invalidateQueries({ queryKey: ['parties'] });
      toast.notify('Entry deleted', 'success');
      setToDelete(null);
    },
    onError: (error: Error) => toast.notify(error.message, 'error'),
  });

  const summary = payments.data?.summary;

  const columns: Column<PaymentRow>[] = [
    { key: 'date', header: 'Date', render: (row) => formatDate(row.date) },
    {
      key: 'voucher_no',
      header: 'Voucher',
      render: (row) => (
        <div>
          <div className="font-medium">{row.voucher_no}</div>
          <div className="muted text-xs">{row.mode}</div>
        </div>
      ),
    },
    { key: 'party_name', header: 'Party' },
    {
      key: 'type',
      header: 'Type',
      render: (row) => <Badge tone={row.type === 'receipt' ? 'ok' : 'warn'}>{row.type === 'receipt' ? 'Received' : 'Paid'}</Badge>,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (row) => (
        <span className={cn('font-semibold', row.type === 'receipt' ? 'text-ok' : 'text-danger')}>
          {row.type === 'receipt' ? '+' : '−'} {formatINR(row.amount)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <Button size="icon" variant="ghost" title="Delete" onClick={() => setToDelete(row)}>
          <Trash2 className="size-4 text-danger" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Payments & receipts"
        subtitle="Money in, money out and party settlements."
        icon={Wallet}
        actions={
          <Button icon={Plus} onClick={() => setOpen(true)}>
            Record entry
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Entries" value={String(summary?.entries ?? 0)} icon={Wallet} />
        <StatCard label="Received" value={formatINR(summary?.inflow ?? 0)} icon={ArrowDownLeft} tone="text-ok" />
        <StatCard label="Paid out" value={formatINR(summary?.outflow ?? 0)} icon={ArrowUpRight} tone="text-danger" />
        <StatCard label="Net" value={formatINR(summary?.net ?? 0)} icon={Wallet} tone="text-cyan" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={search} onChange={setSearch} placeholder="Search party or voucher…" className="sm:max-w-sm" />
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => setType(filter.key)}
              className={cn(
                'inline-flex min-h-11 items-center rounded-full px-3 py-1.5 text-xs font-semibold transition',
                type === filter.key ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white' : 'glass muted',
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={payments.data?.items ?? []}
        rowKey={(row) => row.id}
        empty={
          payments.isLoading ? (
            <EmptyState icon={Wallet} title="Loading entries…" />
          ) : (
            <EmptyState icon={Wallet} title="No entries yet" description="Record a receipt or payment." />
          )
        }
      />

      {open && <RecordPaymentModal onClose={() => setOpen(false)} />}
      <ConfirmDialog
        open={!!toDelete}
        title="Delete entry?"
        message={`${toDelete?.voucher_no ?? ''} will be removed and the party balance adjusted.`}
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}

function RecordPaymentModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const parties = useQuery({ queryKey: ['parties'], queryFn: () => apiGet<PartyListResponse>('/parties') });

  const [type, setType] = useState<'receipt' | 'payment'>('receipt');
  const [partyId, setPartyId] = useState('');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('Cash');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');

  const save = useMutation({
    mutationFn: () =>
      offlineWrite({
        method: 'POST',
        path: '/payments',
        label: `${type === 'receipt' ? 'Receipt' : 'Payment'} · ₹${amount}`,
        body: {
          type,
          amount: Number(amount),
          party_id: partyId ? Number(partyId) : undefined,
          mode,
          date: date || undefined,
          notes,
        },
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
      void queryClient.invalidateQueries({ queryKey: ['parties'] });
      toast.notify(
        result.queued
          ? 'Saved offline — will sync when online'
          : type === 'receipt'
            ? 'Receipt recorded'
            : 'Payment recorded',
        'success',
      );
      onClose();
    },
    onError: (error: Error) => toast.notify(error.message, 'error'),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Record entry"
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} disabled={!Number(amount) || Number(amount) <= 0} onClick={() => save.mutate()}>
            Save entry
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Type">
          <Select value={type} onChange={(event) => setType(event.target.value as 'receipt' | 'payment')}>
            <option value="receipt">Receipt (money in)</option>
            <option value="payment">Payment (money out)</option>
          </Select>
        </FormField>
        <FormField label="Amount (₹)">
          <Input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" autoFocus />
        </FormField>
        <FormField label="Party" className="sm:col-span-2">
          <Select value={partyId} onChange={(event) => setPartyId(event.target.value)}>
            <option value="">Optional / cash entry</option>
            {(parties.data?.items ?? []).map((party) => (
              <option key={party.id} value={party.id}>
                {party.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Mode">
          <Select value={mode} onChange={(event) => setMode(event.target.value)}>
            <option>Cash</option>
            <option>UPI</option>
            <option>Bank</option>
            <option>Cheque</option>
          </Select>
        </FormField>
        <FormField label="Date">
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </FormField>
        <FormField label="Notes" className="sm:col-span-2">
          <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional" />
        </FormField>
      </div>
    </Modal>
  );
}
