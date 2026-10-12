import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, ReceiptText, Trash2 } from 'lucide-react';
import { InvoiceView } from '@/components/invoices/InvoiceView';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { SearchInput } from '@/components/ui/SearchInput';
import { StatCard } from '@/components/ui/StatCard';
import { useToast } from '@/components/ui/Toast';
import { apiDelete, apiGet } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, formatINR, formatQty } from '@/lib/format';
import { useDebounce } from '@/lib/useDebounce';
import type { CreditResponse, CreditRow, SaleListItem, SaleListResponse, SaleStatus } from '@/lib/types';

const STATUS_TONE: Record<SaleStatus, BadgeTone> = {
  PAID: 'ok',
  PARTIAL: 'warn',
  PENDING: 'danger',
  CANCELLED: 'muted',
};

type Tab = 'bills' | 'credit';

export default function SalesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('bills');
  const [search, setSearch] = useState('');
  const q = useDebounce(search, 300);
  const [invoiceNo, setInvoiceNo] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<SaleListItem | null>(null);

  const sales = useQuery({
    queryKey: ['sales', q],
    queryFn: () => apiGet<SaleListResponse>(`/sales?q=${encodeURIComponent(q)}`),
    enabled: tab === 'bills',
  });
  const credit = useQuery({
    queryKey: ['sales', 'credit'],
    queryFn: () => apiGet<CreditResponse>('/sales/credit'),
    enabled: tab === 'credit',
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiDelete(`/sales/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sales'] });
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
      void queryClient.invalidateQueries({ queryKey: ['parties'] });
      toast.notify('Invoice deleted', 'success');
      setToDelete(null);
    },
    onError: (error: Error) => toast.notify(error.message, 'error'),
  });

  const summary = sales.data?.summary;

  const billColumns: Column<SaleListItem>[] = [
    { key: 'invoice_date', header: 'Date', render: (row) => formatDate(row.invoice_date) },
    { key: 'invoice_no', header: 'Invoice', render: (row) => <span className="font-medium">{row.invoice_no}</span> },
    { key: 'buyer_name', header: 'Buyer' },
    { key: 'weight', header: 'Weight', align: 'right', mobileHidden: true, render: (row) => formatQty(row.weight) },
    { key: 'total_amount', header: 'Total', align: 'right', render: (row) => formatINR(row.total_amount) },
    {
      key: 'balance_due',
      header: 'Balance',
      align: 'right',
      render: (row) => <span className={cn(row.balance_due > 0 ? 'text-warn' : 'muted')}>{formatINR(row.balance_due)}</span>,
    },
    { key: 'status', header: 'Status', align: 'right', render: (row) => <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
          <Button size="icon" variant="ghost" title="View" onClick={() => setInvoiceNo(row.invoice_no)}>
            <Eye className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" title="Delete" onClick={() => setToDelete(row)}>
            <Trash2 className="size-4 text-danger" />
          </Button>
        </div>
      ),
    },
  ];

  const creditColumns: Column<CreditRow>[] = [
    { key: 'buyer_name', header: 'Customer', render: (row) => <span className="font-medium">{row.buyer_name}</span> },
    { key: 'bills', header: 'Bills', align: 'right', render: (row) => String(row.bills) },
    { key: 'billed', header: 'Billed', align: 'right', mobileHidden: true, render: (row) => formatINR(row.billed) },
    { key: 'paid', header: 'Paid', align: 'right', mobileHidden: true, render: (row) => formatINR(row.paid) },
    { key: 'due', header: 'Outstanding', align: 'right', render: (row) => <span className="font-semibold text-warn">{formatINR(row.due)}</span> },
    { key: 'age_days', header: 'Age', align: 'right', render: (row) => `${row.age_days}d` },
    { key: 'last_date', header: 'Last bill', mobileHidden: true, render: (row) => formatDate(row.last_date) },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Sales history" subtitle="Invoices, udhaar and customer credit." icon={ReceiptText} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Bills" value={String(summary?.bills ?? 0)} icon={ReceiptText} />
        <StatCard label="Total sales" value={formatINR(summary?.total ?? 0)} icon={ReceiptText} tone="text-cyan" />
        <StatCard label="Received" value={formatINR(summary?.paid ?? 0)} icon={ReceiptText} tone="text-ok" />
        <StatCard label="Outstanding" value={formatINR(summary?.due ?? 0)} icon={ReceiptText} tone="text-warn" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          {(['bills', 'credit'] as Tab[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                'inline-flex min-h-11 items-center rounded-full px-4 py-2 text-xs font-semibold transition',
                tab === key ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white' : 'glass muted',
              )}
            >
              {key === 'bills' ? 'Bills' : 'Customer credit'}
            </button>
          ))}
        </div>
        {tab === 'bills' && <SearchInput value={search} onChange={setSearch} placeholder="Search invoice or buyer…" className="sm:max-w-sm" />}
      </div>

      {tab === 'bills' ? (
        <DataTable
          columns={billColumns}
          rows={sales.data?.items ?? []}
          rowKey={(row) => row.id}
          onRowClick={(row) => setInvoiceNo(row.invoice_no)}
          empty={
            sales.isLoading ? (
              <EmptyState icon={ReceiptText} title="Loading sales…" />
            ) : (
              <EmptyState icon={ReceiptText} title="No sales yet" description="Create your first bill." />
            )
          }
        />
      ) : (
        <DataTable
          columns={creditColumns}
          rows={credit.data?.items ?? []}
          rowKey={(row) => row.buyer_id}
          empty={<EmptyState icon={ReceiptText} title="No customer credit" description="All settled up." />}
        />
      )}

      <InvoiceView open={!!invoiceNo} onClose={() => setInvoiceNo(null)} invoiceNo={invoiceNo} />
      <ConfirmDialog
        open={!!toDelete}
        title="Delete invoice?"
        message={`${toDelete?.invoice_no ?? ''} will be removed and stock/buyer balance reversed.`}
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
