import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField, Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { apiGet } from '@/lib/api';
import { formatDate, formatINR } from '@/lib/format';
import type { LedgerEntry, LedgerResponse, Party } from '@/lib/types';

interface LedgerModalProps {
  open: boolean;
  onClose: () => void;
  party: Party | null;
}

export function LedgerModal({ open, onClose, party }: LedgerModalProps) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const query = useQuery({
    queryKey: ['ledger', party?.id, from, to],
    queryFn: () =>
      apiGet<LedgerResponse>(
        `/parties/${party?.id}/ledger?from=${from}&to=${to}`,
      ),
    enabled: open && !!party,
  });

  const data = query.data;
  const columns: Column<LedgerEntry>[] = [
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
    {
      key: 'debit',
      header: 'Debit',
      align: 'right',
      render: (row) => (row.debit ? formatINR(row.debit) : '—'),
    },
    {
      key: 'credit',
      header: 'Credit',
      align: 'right',
      render: (row) => (row.credit ? formatINR(row.credit) : '—'),
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      render: (row) => <span className="font-medium">{formatINR(row.balance)}</span>,
    },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={party ? `${party.name} — khata` : 'Khata'}
      description="Account statement with running balance."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="From">
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </FormField>
        <FormField label="To">
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </FormField>
      </div>

      {data && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Summary label="Opening" value={formatINR(data.opening)} />
          <Summary label="Debit" value={formatINR(data.totals.debit)} />
          <Summary label="Credit" value={formatINR(data.totals.credit)} />
          <Summary label="Closing" value={formatINR(data.totals.balance)} highlight />
        </div>
      )}

      <div className="mt-4">
        {query.isLoading ? (
          <p className="muted py-8 text-center text-sm">Loading statement…</p>
        ) : (
          <DataTable
            columns={columns}
            rows={data?.entries ?? []}
            rowKey={(row) => `${row.type}-${row.ref}-${row.date}`}
            empty={<EmptyState icon={FileText} title="No entries yet" description="Transactions will appear here." />}
          />
        )}
      </div>
    </Modal>
  );
}

function Summary({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="glass glass-card py-3">
      <div className="muted text-xs">{label}</div>
      <div className={`font-display text-base font-semibold ${highlight ? 'text-brand-500' : ''}`}>
        {value}
      </div>
    </div>
  );
}
