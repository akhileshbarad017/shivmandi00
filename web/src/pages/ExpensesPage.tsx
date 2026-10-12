import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Plus, Receipt, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { StatCard } from '@/components/ui/StatCard';
import { useToast } from '@/components/ui/Toast';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import { formatDate, formatINR } from '@/lib/format';
import type { ExpenseListResponse, ExpenseRow } from '@/lib/types';

const EXPENSE_HEADS = [
  'Hamali / Labour',
  'Transport',
  'Commission',
  'Bardana',
  'APMC Cess',
  'Tea / Refreshment',
  'Rent',
  'Electricity',
  'Salary',
  'Other',
];

export default function ExpensesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<ExpenseRow | null>(null);

  const expenses = useQuery({ queryKey: ['expenses'], queryFn: () => apiGet<ExpenseListResponse>('/expenses') });

  const remove = useMutation({
    mutationFn: (id: number) => apiDelete(`/expenses/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.notify('Expense deleted', 'success');
      setToDelete(null);
    },
    onError: (error: Error) => toast.notify(error.message, 'error'),
  });

  const summary = expenses.data?.summary;

  const columns: Column<ExpenseRow>[] = [
    { key: 'date', header: 'Date', render: (row) => formatDate(row.date) },
    { key: 'head', header: 'Head', render: (row) => <span className="font-medium">{row.head ?? row.party_name}</span> },
    { key: 'voucher_no', header: 'Voucher', mobileHidden: true },
    { key: 'mode', header: 'Mode', mobileHidden: true },
    { key: 'amount', header: 'Amount', align: 'right', render: (row) => formatINR(row.amount) },
    { key: 'notes', header: 'Notes', mobileHidden: true, render: (row) => row.notes || '—' },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) =>
        row.editable ? (
          <Button size="icon" variant="ghost" title="Delete" onClick={() => setToDelete(row)}>
            <Trash2 className="size-4 text-danger" />
          </Button>
        ) : (
          <span title="Linked to a purchase bill">
            <Lock className="size-4 opacity-40" />
          </span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Expenses"
        subtitle="Operating costs and mandi charges."
        icon={Receipt}
        actions={
          <Button icon={Plus} onClick={() => setOpen(true)}>
            Add expense
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Entries" value={String(summary?.entries ?? 0)} icon={Receipt} />
        <StatCard label="Total" value={formatINR(summary?.total ?? 0)} icon={Receipt} tone="text-danger" />
        <StatCard label="Today" value={formatINR(summary?.today ?? 0)} icon={Receipt} tone="text-warn" />
      </div>

      {(summary?.by_head.length ?? 0) > 0 && (
        <div className="glass glass-card">
          <div className="muted mb-2 text-xs font-semibold uppercase tracking-wider">By head</div>
          <div className="flex flex-wrap gap-2">
            {summary?.by_head.map((row) => (
              <span key={row.head} className="glass rounded-full px-3 py-1.5 text-xs">
                {row.head}: <strong>{formatINR(row.total)}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={expenses.data?.items ?? []}
        rowKey={(row) => row.id}
        empty={
          expenses.isLoading ? (
            <EmptyState icon={Receipt} title="Loading expenses…" />
          ) : (
            <EmptyState icon={Receipt} title="No expenses yet" description="Add your first cost head." />
          )
        }
      />

      {open && <ExpenseModal onClose={() => setOpen(false)} />}
      <ConfirmDialog
        open={!!toDelete}
        title="Delete expense?"
        message={`${toDelete?.voucher_no ?? ''} will be removed.`}
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}

function ExpenseModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [head, setHead] = useState(EXPENSE_HEADS[0]!);
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('Cash');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');

  const save = useMutation({
    mutationFn: () => apiPost('/expenses', { head, amount: Number(amount), mode, date: date || undefined, notes }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.notify('Expense recorded', 'success');
      onClose();
    },
    onError: (error: Error) => toast.notify(error.message, 'error'),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Add expense"
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} disabled={!Number(amount) || Number(amount) <= 0} onClick={() => save.mutate()}>
            Save expense
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Head">
          <Select value={head} onChange={(event) => setHead(event.target.value)}>
            {EXPENSE_HEADS.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Amount (₹)">
          <Input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" autoFocus />
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
      <p className="muted mt-3 flex items-center gap-1 text-xs">
        <Badge tone="muted">Purchase charges</Badge> are logged automatically and locked here.
      </p>
    </Modal>
  );
}
