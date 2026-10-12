import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { InvoiceView } from '@/components/invoices/InvoiceView';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { SearchInput } from '@/components/ui/SearchInput';
import { apiGet } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, formatINR } from '@/lib/format';
import { useDebounce } from '@/lib/useDebounce';

interface InvoiceListRow {
  id: number;
  invoice_no: string;
  invoice_date: string;
  buyer_name: string;
  total_amount: number;
  paid_amount: number;
  balance_due: number;
  payment_mode: string;
  status: string;
}

const STATUS_TONE: Record<string, BadgeTone> = {
  PAID: 'ok',
  PARTIAL: 'warn',
  PENDING: 'danger',
  CANCELLED: 'muted',
};

export default function InvoicesPage() {
  const [search, setSearch] = useState('');
  const q = useDebounce(search, 300).toLowerCase();
  const [invoiceNo, setInvoiceNo] = useState<string | null>(null);

  const invoices = useQuery({
    queryKey: ['invoices'],
    queryFn: () => apiGet<{ items: InvoiceListRow[] }>('/invoices'),
  });

  const rows = (invoices.data?.items ?? []).filter((row) =>
    `${row.invoice_no} ${row.buyer_name}`.toLowerCase().includes(q),
  );

  const columns: Column<InvoiceListRow>[] = [
    { key: 'invoice_no', header: 'Invoice', render: (row) => <span className="font-medium">{row.invoice_no}</span> },
    { key: 'invoice_date', header: 'Date', render: (row) => formatDate(row.invoice_date) },
    { key: 'buyer_name', header: 'Buyer' },
    { key: 'payment_mode', header: 'Mode', mobileHidden: true },
    { key: 'total_amount', header: 'Total', align: 'right', render: (row) => formatINR(row.total_amount) },
    {
      key: 'balance_due',
      header: 'Balance',
      align: 'right',
      render: (row) => <span className={cn(row.balance_due > 0 ? 'text-warn' : 'muted')}>{formatINR(row.balance_due)}</span>,
    },
    { key: 'status', header: 'Status', align: 'right', render: (row) => <Badge tone={STATUS_TONE[row.status] ?? 'muted'}>{row.status}</Badge> },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Invoices" subtitle="Browse, print and share bills with UPI QR." icon={FileText} />

      <SearchInput value={search} onChange={setSearch} placeholder="Search invoice or buyer…" className="sm:max-w-sm" />

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        onRowClick={(row) => setInvoiceNo(row.invoice_no)}
        empty={
          invoices.isLoading ? (
            <EmptyState icon={FileText} title="Loading invoices…" />
          ) : (
            <EmptyState icon={FileText} title="No invoices yet" description="Create a sale to generate bills." />
          )
        }
      />

      <InvoiceView open={!!invoiceNo} onClose={() => setInvoiceNo(null)} invoiceNo={invoiceNo} />
    </div>
  );
}
