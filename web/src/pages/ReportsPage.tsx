import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Boxes, Download, ReceiptText, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField, Input } from '@/components/ui/Field';
import { StatCard } from '@/components/ui/StatCard';
import { apiGet } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, formatINR, formatQty } from '@/lib/format';
import type {
  ReportBalanceSheet,
  ReportCommodity,
  ReportDaybook,
  ReportPL,
  ReportPurchases,
  ReportSales,
} from '@/lib/types';

const TABS = [
  { key: 'pl', label: 'Profit & Loss' },
  { key: 'sales', label: 'Sales' },
  { key: 'purchases', label: 'Purchases' },
  { key: 'daybook', label: 'Day Book' },
  { key: 'balance-sheet', label: 'Balance Sheet' },
  { key: 'commodity', label: 'Commodity' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const firstOfMonth = () => {
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return `${now.toISOString().slice(0, 7)}-01`;
};

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function RangeBar({
  from,
  to,
  setFrom,
  setTo,
}: {
  from: string;
  to: string;
  setFrom: (value: string) => void;
  setTo: (value: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:max-w-md">
      <FormField label="From">
        <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
      </FormField>
      <FormField label="To">
        <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
      </FormField>
    </div>
  );
}

export default function ReportsPage() {
  const [tab, setTab] = useState<TabKey>('pl');
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [date, setDate] = useState(today());

  return (
    <div className="space-y-4">
      <PageHeader title="Reports" subtitle="Business performance at a glance." icon={BarChart3} />

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

      {tab === 'daybook' ? (
        <FormField label="Date" className="lg:max-w-xs">
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </FormField>
      ) : (
        <RangeBar from={from} to={to} setFrom={setFrom} setTo={setTo} />
      )}

      {tab === 'pl' && <PlReport from={from} to={to} />}
      {tab === 'sales' && <SalesReport from={from} to={to} />}
      {tab === 'purchases' && <PurchasesReport from={from} to={to} />}
      {tab === 'daybook' && <DaybookReport date={date} />}
      {tab === 'balance-sheet' && <BalanceSheetReport />}
      {tab === 'commodity' && <CommodityReport />}
    </div>
  );
}

function PlReport({ from, to }: { from: string; to: string }) {
  const report = useQuery({
    queryKey: ['reports', 'pl', from, to],
    queryFn: () => apiGet<ReportPL>(`/reports/pl?from=${from}&to=${to}`),
  });
  const data = report.data;

  const columns: Column<{ head: string; total: number }>[] = [
    { key: 'head', header: 'Expense head' },
    { key: 'total', header: 'Amount', align: 'right', render: (row) => formatINR(row.total) },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Revenue" value={formatINR(data?.summary.sales ?? 0)} icon={ReceiptText} />
        <StatCard label="Cost of purchases" value={formatINR(data?.summary.purchase ?? 0)} icon={Boxes} tone="text-warn" />
        <StatCard label="Operating expenses" value={formatINR(data?.summary.expense ?? 0)} icon={Wallet} tone="text-danger" />
        <StatCard
          label="Net profit"
          value={formatINR(data?.summary.net ?? 0)}
          icon={BarChart3}
          tone={(data?.summary.net ?? 0) >= 0 ? 'text-ok' : 'text-danger'}
        />
      </div>

      <div className="glass glass-card space-y-2">
        {data?.lines.map((line) => (
          <div key={line.label} className="flex items-center justify-between text-sm">
            <span className="muted">{line.label}</span>
            <span className={line.sign < 0 ? 'text-danger' : ''}>
              {line.sign < 0 ? '− ' : ''}
              {formatINR(line.value)}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-[var(--border)] pt-2 text-sm">
          <span className="muted">Gross profit</span>
          <span className="font-semibold">{formatINR(data?.summary.gross ?? 0)}</span>
        </div>
        <div className="flex items-center justify-between text-base">
          <span className="font-medium">Net profit</span>
          <span className="font-display font-semibold text-ok">{formatINR(data?.summary.net ?? 0)}</span>
        </div>
      </div>

      <div>
        <h3 className="mb-2 font-display text-base font-semibold">Expenses by head</h3>
        <DataTable
          columns={columns}
          rows={data?.expense_heads ?? []}
          rowKey={(row) => row.head}
          empty={<EmptyState icon={Wallet} title="No expenses in range" />}
        />
      </div>
    </div>
  );
}

function SalesReport({ from, to }: { from: string; to: string }) {
  const report = useQuery({
    queryKey: ['reports', 'sales', from, to],
    queryFn: () => apiGet<ReportSales>(`/reports/sales?from=${from}&to=${to}`),
  });
  const data = report.data;
  const columns: Column<ReportSales['items'][number]>[] = [
    { key: 'invoice_date', header: 'Date', render: (row) => formatDate(row.invoice_date) },
    { key: 'invoice_no', header: 'Invoice' },
    { key: 'buyer_name', header: 'Buyer' },
    { key: 'total_amount', header: 'Total', align: 'right', render: (row) => formatINR(row.total_amount) },
    { key: 'paid_amount', header: 'Paid', align: 'right', render: (row) => formatINR(row.paid_amount) },
    {
      key: 'balance_due',
      header: 'Due',
      align: 'right',
      render: (row) => <span className={row.balance_due > 0 ? 'text-warn' : 'muted'}>{formatINR(row.balance_due)}</span>,
    },
    { key: 'status', header: 'Status', align: 'right', render: (row) => <Badge tone={row.status === 'PAID' ? 'ok' : 'warn'}>{row.status}</Badge> },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Bills" value={String(data?.summary.bills ?? 0)} icon={ReceiptText} />
        <StatCard label="Gross" value={formatINR(data?.summary.gross ?? 0)} icon={ReceiptText} tone="text-cyan" />
        <StatCard label="Received" value={formatINR(data?.summary.received ?? 0)} icon={ReceiptText} tone="text-ok" />
        <StatCard label="Outstanding" value={formatINR(data?.summary.outstanding ?? 0)} icon={ReceiptText} tone="text-warn" />
      </div>
      <DataTable columns={columns} rows={data?.items ?? []} rowKey={(row) => row.invoice_no} empty={<EmptyState icon={ReceiptText} title="No sales in range" />} />
    </div>
  );
}

function PurchasesReport({ from, to }: { from: string; to: string }) {
  const report = useQuery({
    queryKey: ['reports', 'purchases', from, to],
    queryFn: () => apiGet<ReportPurchases>(`/reports/purchases?from=${from}&to=${to}`),
  });
  const data = report.data;
  const columns: Column<ReportPurchases['items'][number]>[] = [
    { key: 'date', header: 'Date', render: (row) => formatDate(row.date) },
    { key: 'bill_no', header: 'Bill' },
    { key: 'supplier_name', header: 'Supplier' },
    { key: 'net_amount', header: 'Net', align: 'right', render: (row) => formatINR(row.net_amount) },
    { key: 'paid_amount', header: 'Paid', align: 'right', render: (row) => formatINR(row.paid_amount) },
    { key: 'balance_due', header: 'Due', align: 'right', render: (row) => <span className={row.balance_due > 0 ? 'text-warn' : 'muted'}>{formatINR(row.balance_due)}</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Bills" value={String(data?.summary.bills ?? 0)} icon={Boxes} />
        <StatCard label="Goods" value={formatINR(data?.summary.goods ?? 0)} icon={Boxes} tone="text-cyan" />
        <StatCard label="Expenses" value={formatINR(data?.summary.expenses ?? 0)} icon={Boxes} tone="text-warn" />
        <StatCard label="Net" value={formatINR(data?.summary.net ?? 0)} icon={Boxes} tone="text-ok" />
      </div>
      <DataTable columns={columns} rows={data?.items ?? []} rowKey={(row) => row.bill_no} empty={<EmptyState icon={Boxes} title="No purchases in range" />} />
    </div>
  );
}

function DaybookReport({ date }: { date: string }) {
  const report = useQuery({
    queryKey: ['reports', 'daybook', date],
    queryFn: () => apiGet<ReportDaybook>(`/reports/daybook?date=${date}`),
  });
  const data = report.data;
  const columns: Column<ReportDaybook['items'][number]>[] = [
    { key: 'time', header: 'Time' },
    { key: 'ref', header: 'Voucher' },
    { key: 'party', header: 'Party' },
    { key: 'mode', header: 'Mode', mobileHidden: true },
    { key: 'in', header: 'In', align: 'right', render: (row) => (row.in > 0 ? <span className="text-ok">{formatINR(row.in)}</span> : '—') },
    { key: 'out', header: 'Out', align: 'right', render: (row) => (row.out > 0 ? <span className="text-danger">{formatINR(row.out)}</span> : '—') },
    { key: 'balance', header: 'Balance', align: 'right', render: (row) => formatINR(row.balance) },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Entries" value={String(data?.summary.entries ?? 0)} icon={Wallet} />
        <StatCard label="In" value={formatINR(data?.summary.in ?? 0)} icon={Wallet} tone="text-ok" />
        <StatCard label="Out" value={formatINR(data?.summary.out ?? 0)} icon={Wallet} tone="text-danger" />
        <StatCard label="Net" value={formatINR(data?.summary.net ?? 0)} icon={Wallet} tone="text-cyan" />
      </div>
      <DataTable columns={columns} rows={data?.items ?? []} rowKey={(row) => `${row.ref}-${row.time}`} empty={<EmptyState icon={Wallet} title="No entries on this date" />} />
    </div>
  );
}

function BalanceSheetReport() {
  const report = useQuery({
    queryKey: ['reports', 'balance-sheet'],
    queryFn: () => apiGet<ReportBalanceSheet>('/reports/balance-sheet'),
  });
  const data = report.data;
  const assets = data?.items.filter((item) => item.group === 'assets') ?? [];
  const liabilities = data?.items.filter((item) => item.group === 'liabilities') ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Total assets" value={formatINR(data?.summary.assets ?? 0)} icon={Boxes} tone="text-cyan" />
        <StatCard label="Liabilities" value={formatINR(data?.summary.liabilities ?? 0)} icon={Wallet} tone="text-warn" />
        <StatCard label="Capital / position" value={formatINR(data?.summary.position ?? 0)} icon={BarChart3} tone="text-ok" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="glass glass-card space-y-2">
          <h3 className="font-display text-base font-semibold">Assets</h3>
          {assets.map((item) => (
            <div key={item.label} className="flex items-center justify-between text-sm">
              <span className="muted">{item.label}</span>
              <span>{formatINR(item.value)}</span>
            </div>
          ))}
        </div>
        <div className="glass glass-card space-y-2">
          <h3 className="font-display text-base font-semibold">Liabilities</h3>
          {liabilities.length === 0 ? (
            <p className="muted text-sm">None</p>
          ) : (
            liabilities.map((item) => (
              <div key={item.label} className="flex items-center justify-between text-sm">
                <span className="muted">{item.label}</span>
                <span className="text-warn">{formatINR(item.value)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function CommodityReport() {
  const report = useQuery({
    queryKey: ['reports', 'commodity'],
    queryFn: () => apiGet<ReportCommodity>('/reports/commodity'),
  });
  const data = report.data;
  const columns: Column<ReportCommodity['items'][number]>[] = [
    {
      key: 'name',
      header: 'Commodity',
      render: (row) => (
        <div className="flex items-center gap-2">
          <span>{row.emoji || '🧺'}</span>
          <span className="font-medium">{row.name}</span>
        </div>
      ),
    },
    { key: 'stock', header: 'Stock', align: 'right', render: (row) => formatQty(row.stock) },
    { key: 'purchase_value', header: 'Purchased ₹', align: 'right', render: (row) => formatINR(row.purchase_value) },
    { key: 'sale_value', header: 'Sold ₹', align: 'right', render: (row) => formatINR(row.sale_value) },
    { key: 'value', header: 'Stock value', align: 'right', render: (row) => formatINR(row.value) },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Products" value={String(data?.summary.products ?? 0)} icon={Boxes} />
        <StatCard label="Stock" value={`${formatQty(data?.summary.stock_kg ?? 0)} kg`} icon={Boxes} tone="text-cyan" />
        <StatCard label="Stock value" value={formatINR(data?.summary.stock_value ?? 0)} icon={Download} tone="text-ok" />
      </div>
      <DataTable columns={columns} rows={data?.items ?? []} rowKey={(row) => row.id} empty={<EmptyState icon={Boxes} title="No commodities" />} />
    </div>
  );
}
