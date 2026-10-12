import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, IndianRupee, ShoppingBasket, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { PayPurchaseModal } from '@/components/purchases/PayPurchaseModal';
import { PurchaseDetailModal } from '@/components/purchases/PurchaseDetailModal';
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
import { formatDate, formatINR } from '@/lib/format';
import { useDebounce } from '@/lib/useDebounce';
import type { PurchaseListItem, PurchaseListResponse, PurchaseStatus } from '@/lib/types';

const STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: '', label: 'All' },
  { key: 'UNPAID', label: 'Unpaid' },
  { key: 'PARTIAL', label: 'Partial' },
  { key: 'PAID', label: 'Paid' },
];

const STATUS_TONE: Record<PurchaseStatus, BadgeTone> = {
  PAID: 'ok',
  PARTIAL: 'warn',
  UNPAID: 'danger',
};

export default function PurchasesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const q = useDebounce(search, 300);
  const [status, setStatus] = useState('');
  const [detailBill, setDetailBill] = useState<string | null>(null);
  const [payBill, setPayBill] = useState<PurchaseListItem | null>(null);
  const [toDelete, setToDelete] = useState<PurchaseListItem | null>(null);

  const purchases = useQuery({
    queryKey: ['purchases', q, status],
    queryFn: () =>
      apiGet<PurchaseListResponse>(`/purchases?q=${encodeURIComponent(q)}&status=${status}`),
  });

  const remove = useMutation({
    mutationFn: (billNo: string) => apiDelete(`/purchases/${billNo}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchases'] });
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
      void queryClient.invalidateQueries({ queryKey: ['parties'] });
      toast.notify('Purchase deleted', 'success');
      setToDelete(null);
    },
    onError: (error: Error) => toast.notify(error.message, 'error'),
  });

  const summary = purchases.data?.summary;

  const columns: Column<PurchaseListItem>[] = [
    { key: 'date', header: 'Date', render: (row) => formatDate(row.date) },
    { key: 'bill_no', header: 'Bill', render: (row) => <span className="font-medium">{row.bill_no}</span> },
    { key: 'supplier_name', header: 'Supplier' },
    { key: 'vehicle_no', header: 'Vehicle', mobileHidden: true, render: (row) => row.vehicle_no || '—' },
    {
      key: 'net_amount',
      header: 'Net',
      align: 'right',
      render: (row) => formatINR(row.net_amount),
    },
    {
      key: 'balance_due',
      header: 'Balance',
      align: 'right',
      render: (row) => (
        <span className={cn(row.balance_due > 0 ? 'text-warn' : 'muted')}>
          {formatINR(row.balance_due)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      render: (row) => <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
          <Button size="icon" variant="ghost" title="View" onClick={() => setDetailBill(row.bill_no)}>
            <Eye className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" title="Pay" onClick={() => setPayBill(row)}>
            <IndianRupee className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" title="Delete" onClick={() => setToDelete(row)}>
            <Trash2 className="size-4 text-danger" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Purchase history"
        subtitle="Inward bills, expenses and supplier payments."
        icon={ShoppingBasket}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Bills" value={String(summary?.bills ?? 0)} icon={ShoppingBasket} />
        <StatCard label="Net purchased" value={formatINR(summary?.net ?? 0)} icon={ShoppingBasket} tone="text-cyan" />
        <StatCard label="Paid" value={formatINR(summary?.paid ?? 0)} icon={ShoppingBasket} tone="text-ok" />
        <StatCard label="Balance due" value={formatINR(summary?.due ?? 0)} icon={ShoppingBasket} tone="text-warn" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={search} onChange={setSearch} placeholder="Search bill or supplier…" className="sm:max-w-sm" />
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.key || 'all'}
              type="button"
              onClick={() => setStatus(filter.key)}
              className={cn(
                'inline-flex min-h-11 items-center rounded-full px-3 py-1.5 text-xs font-semibold transition',
                status === filter.key
                  ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white'
                  : 'glass muted hover:text-[var(--text)]',
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={purchases.data?.items ?? []}
        rowKey={(row) => row.bill_no}
        onRowClick={(row) => setDetailBill(row.bill_no)}
        empty={
          purchases.isLoading ? (
            <EmptyState icon={ShoppingBasket} title="Loading purchases…" />
          ) : (
            <EmptyState icon={ShoppingBasket} title="No purchases yet" description="Record your first inward bill." />
          )
        }
      />

      <PurchaseDetailModal open={!!detailBill} onClose={() => setDetailBill(null)} billNo={detailBill} />
      <PayPurchaseModal open={!!payBill} onClose={() => setPayBill(null)} bill={payBill} />
      <ConfirmDialog
        open={!!toDelete}
        title="Delete purchase?"
        message={`${toDelete?.bill_no ?? ''} and its items, expenses and payments will be removed.`}
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.bill_no)}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
