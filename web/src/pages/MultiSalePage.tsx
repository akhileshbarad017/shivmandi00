import { useMemo, useRef, useState, type RefObject } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ExternalLink,
  MessageCircle,
  Save,
  ShoppingBasket,
  Users,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Select } from '@/components/ui/Field';
import { SaveFab } from '@/components/ui/SaveFab';
import { SearchInput } from '@/components/ui/SearchInput';
import { useToast } from '@/components/ui/Toast';
import { apiGet } from '@/lib/api';
import { offlineWrite } from '@/lib/offline/outbox';
import { cn } from '@/lib/cn';
import { formatINR } from '@/lib/format';
import type { BulkGenerationResponse, PartyListResponse, ProductListResponse } from '@/lib/types';

interface Cell {
  qty: string;
  rate: string;
}

type StepState = 'done' | 'active' | 'todo';
type CellTone = 'idle' | 'warn' | 'ok';

const todayISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
/** Max customer chips rendered before search narrows the list. */
const CUSTOMER_CHIP_LIMIT = 60;
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();

export default function MultiSalePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  const products = useQuery({ queryKey: ['products'], queryFn: () => apiGet<ProductListResponse>('/products') });
  const parties = useQuery({ queryKey: ['parties'], queryFn: () => apiGet<PartyListResponse>('/parties') });

  const customersRef = useRef<HTMLElement>(null);
  const productsRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLElement>(null);

  const buyers = useMemo(() => (parties.data?.items ?? []).filter((p) => p.type === 'buyer'), [parties.data?.items]);
  const productList = products.data?.items ?? [];
  const productById = useMemo(() => new Map(productList.map((p) => [p.id, p])), [productList]);
  const buyerById = useMemo(() => new Map(buyers.map((b) => [b.id, b])), [buyers]);

  const [date, setDate] = useState(todayISO());
  const [paymentType, setPaymentType] = useState('Credit');
  const [customerQuery, setCustomerQuery] = useState('');
  const [showSuggest, setShowSuggest] = useState(false);
  const [customers, setCustomers] = useState<number[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [paid, setPaid] = useState<Record<number, string>>({});
  const [focus, setFocus] = useState<{ productId?: number; partyId?: number }>({});
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<BulkGenerationResponse | null>(null);
  const batchKey = useRef(uid());

  const key = (productId: number, partyId: number) => `${productId}:${partyId}`;

  function cellQty(productId: number, partyId: number): number {
    return Number(cells[key(productId, partyId)]?.qty) || 0;
  }
  function cellRate(productId: number, partyId: number): number {
    return Number(cells[key(productId, partyId)]?.rate) || 0;
  }
  function cellAmount(productId: number, partyId: number): number {
    return cellQty(productId, partyId) * cellRate(productId, partyId);
  }
  function cellTone(productId: number, partyId: number): CellTone {
    const qty = cellQty(productId, partyId);
    if (qty <= 0) return 'idle';
    return cellRate(productId, partyId) > 0 ? 'ok' : 'warn';
  }
  function customerSubtotal(partyId: number): number {
    return selectedProducts.reduce((sum, productId) => sum + cellAmount(productId, partyId), 0);
  }
  function customerPrev(partyId: number): number {
    return buyerById.get(partyId)?.balance ?? 0;
  }
  function customerPaid(partyId: number): number {
    return Number(paid[partyId]) || 0;
  }
  function customerNewPending(partyId: number): number {
    return Math.max(0, customerPrev(partyId) + customerSubtotal(partyId) - customerPaid(partyId));
  }

  // Buyers matching the search box (name / code / mobile).
  const matchedBuyers = useMemo(() => {
    const query = customerQuery.trim().toLowerCase();
    if (!query) return buyers;
    const digits = query.replace(/\D/g, '');
    return buyers.filter(
      (buyer) =>
        buyer.name.toLowerCase().includes(query) ||
        (buyer.code ?? '').toLowerCase().includes(query) ||
        (digits.length > 0 && (buyer.phone ?? '').replace(/\D/g, '').includes(digits)),
    );
  }, [buyers, customerQuery]);

  // Auto-suggestions shown under the search box while typing.
  const suggestions = useMemo(() => matchedBuyers.slice(0, 8), [matchedBuyers]);

  // Chips render selected first; when idle we cap the list to keep it snappy.
  const visibleBuyers = useMemo(() => {
    const selected = new Set(customers);
    const sorted = [...matchedBuyers].sort((a, b) => {
      const diff = (selected.has(a.id) ? 0 : 1) - (selected.has(b.id) ? 0 : 1);
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    });
    return customerQuery.trim() ? sorted : sorted.slice(0, CUSTOMER_CHIP_LIMIT);
  }, [matchedBuyers, customers, customerQuery]);

  const hiddenBuyerCount = matchedBuyers.length - visibleBuyers.length;

  const grandTotal = customers.reduce((sum, partyId) => sum + customerSubtotal(partyId), 0);
  const grandPending = customers.reduce((sum, partyId) => sum + customerNewPending(partyId), 0);
  const filledCells = useMemo(
    () => Object.values(cells).filter((cell) => Number(cell.qty) > 0 && Number(cell.rate) > 0).length,
    [cells],
  );
  const billCount = customers.filter((partyId) =>
    selectedProducts.some((productId) => cellQty(productId, partyId) > 0),
  ).length;
  const nothingSelected = customers.length === 0 || selectedProducts.length === 0;
  const missingRates = selectedProducts.reduce(
    (sum, productId) => sum + customers.filter((partyId) => cellTone(productId, partyId) === 'warn').length,
    0,
  );

  const step1: StepState = customers.length > 0 ? 'done' : 'active';
  const step2: StepState = selectedProducts.length > 0 ? 'done' : customers.length > 0 ? 'active' : 'todo';
  const step3: StepState = customers.length > 0 && selectedProducts.length > 0 ? 'active' : 'todo';

  function toggleCustomer(id: number) {
    setCustomers((current) => (current.includes(id) ? current.filter((c) => c !== id) : [...current, id]));
  }
  function toggleProduct(id: number) {
    setSelectedProducts((current) => (current.includes(id) ? current.filter((p) => p !== id) : [...current, id]));
  }
  function setCell(productId: number, partyId: number, patch: Partial<Cell>) {
    const k = key(productId, partyId);
    setCells((current) => ({ ...current, [k]: { qty: '', rate: '', ...current[k], ...patch } }));
  }
  function scrollTo(ref: RefObject<HTMLElement | null>) {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function generate() {
    const blocks = customers
      .map((partyId) => ({
        party_id: partyId,
        paid: customerPaid(partyId),
        payment_type: paymentType,
        items: selectedProducts
          .filter((productId) => cellQty(productId, partyId) > 0)
          .map((productId) => ({
            product_id: productId,
            unit: 'KG' as const,
            qty: cellQty(productId, partyId),
            rate: cellRate(productId, partyId),
          })),
      }))
      .filter((block) => block.items.length > 0);

    if (blocks.length === 0) {
      toast.notify('Add quantities for at least one customer', 'error');
      return;
    }

    setBusy(true);
    try {
      const result = await offlineWrite<BulkGenerationResponse>({
        method: 'POST',
        path: '/sales/bulk',
        label: `Multi sale · ${blocks.length} bill${blocks.length === 1 ? '' : 's'}`,
        body: {
          idempotency_key: batchKey.current,
          date,
          payment_type: paymentType,
          customers: blocks,
        },
      });
      if (result.queued) {
        toast.notify('Batch saved offline — will sync when online', 'success');
        resetBatch();
        return;
      }
      const res = result.data!;
      setResults(res);
      void queryClient.invalidateQueries({ queryKey: ['sales'] });
      void queryClient.invalidateQueries({ queryKey: ['parties'] });
      toast.notify(res.duplicate ? 'Batch already generated' : `${res.summary.bills} bills generated`, 'success');
    } catch (error) {
      toast.notify(error instanceof Error ? error.message : 'Could not generate bills', 'error');
    } finally {
      setBusy(false);
    }
  }

  function resetBatch() {
    setResults(null);
    setCustomers([]);
    setSelectedProducts([]);
    setCells({});
    setPaid({});
    batchKey.current = uid();
  }

  function whatsapp(invoice: BulkGenerationResponse['invoices'][number]): string | null {
    const phone = invoice.party_id ? buyerById.get(invoice.party_id)?.phone : '';
    if (!phone) return null;
    const text = `Namaste ${invoice.customer}, bill ${invoice.invoice_no} total ${formatINR(invoice.total)} (pending ${formatINR(invoice.pending)}). — Vijay Pandey & Company`;
    return `https://wa.me/91${phone.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(text)}`;
  }

  if (results) {
    return (
      <div className="space-y-4">
        <PageHeader title="Bills generated" subtitle="Send each bill to its customer." icon={CheckCircle2} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Summary label="Bills" value={String(results.summary.bills)} tone="text-brand-500" />
          <Summary label="Total sales" value={formatINR(results.summary.total_sales)} />
          <Summary label="Payments" value={formatINR(results.summary.total_paid)} tone="text-ok" />
          <Summary label="Pending" value={formatINR(results.summary.total_pending)} tone="text-warn" />
        </div>

        <div className="glass glass-card divide-y divide-[var(--border)]">
          {results.invoices.map((invoice) => (
            <div key={invoice.invoice_no} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-600 text-xs font-bold text-white">
                  {initials(invoice.customer)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{invoice.customer}</span>
                    <StatusBadge invoice={invoice} />
                  </div>
                  <div className="muted truncate text-xs">{invoice.invoice_no}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Chip label="Total" value={formatINR(invoice.total)} />
                    {invoice.paid > 0 && <Chip label="Paid" value={formatINR(invoice.paid)} tone="ok" />}
                    {invoice.pending > 0 && <Chip label="Pending" value={formatINR(invoice.pending)} tone="warn" />}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 sm:ml-auto">
                {whatsapp(invoice) && (
                  <a href={whatsapp(invoice)!} target="_blank" rel="noreferrer" className="flex-1 sm:flex-none">
                    <Button size="sm" variant="subtle" icon={MessageCircle} className="w-full">
                      WhatsApp
                    </Button>
                  </a>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  icon={ExternalLink}
                  className="flex-1 sm:flex-none"
                  onClick={() => window.open(`/print/${encodeURIComponent(invoice.invoice_no)}`, '_blank')}
                >
                  Bill
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="subtle" onClick={() => navigate('/sales')}>
            Go to sales
          </Button>
          <Button onClick={resetBatch}>New batch</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Bulk billing" subtitle="Bill many customers at once." icon={Users} />

      {/* Stepper */}
      <section className="glass glass-card flex items-start gap-1.5 sm:items-center sm:gap-3">
        <Step index={1} label="Customers" count={customers.length} state={step1} onClick={() => scrollTo(customersRef)} />
        <span className="mt-3 hidden h-0.5 flex-1 rounded-full bg-[var(--border-strong)] sm:block sm:flex-1" />
        <Step index={2} label="Vegetables" count={selectedProducts.length} state={step2} onClick={() => scrollTo(productsRef)} />
        <span className="mt-3 hidden h-0.5 flex-1 rounded-full bg-[var(--border-strong)] sm:block sm:flex-1" />
        <Step index={3} label="Billing" count={billCount} state={step3} onClick={() => scrollTo(gridRef)} />
      </section>

      <section className="glass glass-card grid gap-3 sm:grid-cols-2">
        <FormField label="Date">
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </FormField>
        <FormField label="Payment type">
          <Select value={paymentType} onChange={(event) => setPaymentType(event.target.value)}>
            <option>Credit</option>
            <option>Cash</option>
            <option>UPI</option>
            <option>Bank</option>
          </Select>
        </FormField>
      </section>

      <section className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat label="Customers" value={String(customers.length)} hint={`${selectedProducts.length} items`} tone="text-brand-500" />
        <Stat label="Filled" value={String(filledCells)} hint="qty × rate" />
        <Stat label="Total" value={formatINR(grandTotal)} hint={`pending ${formatINR(grandPending)}`} />
      </section>

      {/* Customers */}
      <section ref={customersRef} className="glass glass-card scroll-mt-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-brand-500/10 text-brand-500">
              <Users className="size-4" />
            </span>
            <h2 className="font-display text-base font-semibold">Customers</h2>
          </div>
          <div className="flex items-center gap-3">
            {customers.length > 0 && (
              <button
                type="button"
                onClick={() => setCustomers([])}
                className="muted text-xs font-semibold transition hover:text-danger"
              >
                Clear
              </button>
            )}
            <span className="muted text-xs">{customers.length} selected</span>
          </div>
        </div>

        {/* Search with auto-suggestions */}
        <div className="relative mb-3">
          <SearchInput
            value={customerQuery}
            onChange={(value) => {
              setCustomerQuery(value);
              setShowSuggest(true);
            }}
            onFocus={() => setShowSuggest(true)}
            onBlur={() => window.setTimeout(() => setShowSuggest(false), 120)}
            placeholder="Search name, customer ID or mobile…"
          />
          {showSuggest && customerQuery.trim().length > 0 && (
            <div
              className="absolute inset-x-0 top-full z-50 mt-1 max-h-72 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface-solid)] p-1 shadow-[var(--shadow)]"
              onMouseDown={(event) => event.preventDefault()}
            >
              {suggestions.map((buyer) => {
                const active = customers.includes(buyer.id);
                return (
                  <button
                    key={buyer.id}
                    type="button"
                    onClick={() => {
                      toggleCustomer(buyer.id);
                      setShowSuggest(false);
                    }}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition hover:bg-[var(--surface)]',
                      active && 'bg-brand-500/10',
                    )}
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-500/12 text-xs font-bold text-brand-500">
                      {initials(buyer.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{buyer.name}</span>
                      <span className="muted block truncate text-xs">
                        {[buyer.code, buyer.phone].filter(Boolean).join(' · ') || '—'}
                      </span>
                    </span>
                    {buyer.balance > 0 && (
                      <span className="shrink-0 text-xs font-semibold text-warn tabular-nums">
                        {formatINR(buyer.balance)}
                      </span>
                    )}
                    {active ? (
                      <CheckCircle2 className="size-4 shrink-0 text-brand-500" />
                    ) : (
                      <span className="grid size-4 shrink-0 place-items-center rounded-full border border-[var(--border-strong)] text-brand-500">
                        +
                      </span>
                    )}
                  </button>
                );
              })}
              {suggestions.length === 0 && (
                <p className="muted px-3 py-4 text-center text-sm">No customer matches “{customerQuery}”.</p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {visibleBuyers.map((buyer) => {
            const active = customers.includes(buyer.id);
            return (
              <button
                key={buyer.id}
                type="button"
                onClick={() => toggleCustomer(buyer.id)}
                className={cn(
                  'group inline-flex min-h-11 max-w-full items-center gap-2 rounded-full py-1 pl-1 pr-3 text-xs font-semibold transition active:scale-95',
                  active
                    ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow'
                    : 'glass muted hover:text-[var(--text)]',
                )}
              >
                <span
                  className={cn(
                    'grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold',
                    active ? 'bg-white/25 text-white' : 'bg-brand-500/12 text-brand-500',
                  )}
                >
                  {initials(buyer.name)}
                </span>
                <span className="truncate">{buyer.name}</span>
                {active && <CheckCircle2 className="size-3.5 shrink-0" />}
              </button>
            );
          })}
          {buyers.length === 0 && <p className="muted text-sm">No buyers yet.</p>}
          {buyers.length > 0 && matchedBuyers.length === 0 && (
            <p className="muted text-sm">No customer matches “{customerQuery}”.</p>
          )}
        </div>

        {hiddenBuyerCount > 0 && (
          <p className="muted mt-3 text-xs">
            Showing {visibleBuyers.length} of {matchedBuyers.length} — search to find the rest.
          </p>
        )}
      </section>

      {/* Products */}
      <section ref={productsRef} className="glass glass-card scroll-mt-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-brand-500/10 text-brand-500">
              <ShoppingBasket className="size-4" />
            </span>
            <h2 className="font-display text-base font-semibold">Vegetables</h2>
          </div>
          <span className="muted text-xs">{selectedProducts.length} selected</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {productList.map((product) => {
            const active = selectedProducts.includes(product.id);
            return (
              <button
                key={product.id}
                type="button"
                onClick={() => toggleProduct(product.id)}
                className={cn(
                  'inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition active:scale-95',
                  active
                    ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow'
                    : 'glass muted hover:text-[var(--text)]',
                )}
              >
                <span>{product.emoji || '🧺'}</span>
                {product.name}
              </button>
            );
          })}
        </div>
      </section>

      {/* Matrix */}
      {customers.length > 0 && selectedProducts.length > 0 ? (
        <section ref={gridRef} className="glass glass-card scroll-mt-4 overflow-hidden !p-0">
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <h2 className="font-display text-base font-semibold">Billing grid</h2>
            {missingRates > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-warn/15 px-2.5 py-1 text-xs font-semibold text-warn">
                <AlertTriangle className="size-3.5" /> {missingRates} rate missing
              </span>
            ) : (
              <span className="muted text-xs">Tap a cell to type qty &amp; rate</span>
            )}
          </div>
          <div className="max-h-[62vh] overflow-auto border-t border-[var(--border)]">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-30 min-w-[8rem] border-b border-[var(--border)] bg-[var(--surface-solid)] px-3 py-2.5 text-left font-semibold">
                    Product
                  </th>
                  {customers.map((partyId) => (
                    <th
                      key={partyId}
                      className={cn(
                        'sticky top-0 z-20 min-w-[8.5rem] border-b border-[var(--border)] bg-[var(--surface-solid)] px-2 py-2.5 text-left font-semibold transition',
                        focus.partyId === partyId && 'text-brand-600',
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-500/12 text-xs font-bold text-brand-500">
                          {initials(buyerById.get(partyId)?.name ?? '')}
                        </span>
                        <span className="max-w-[6.5rem] truncate" title={buyerById.get(partyId)?.name}>
                          {buyerById.get(partyId)?.name}
                        </span>
                      </div>
                      <div className="muted mt-0.5 text-xs font-normal tabular-nums">
                        {formatINR(customerSubtotal(partyId))}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedProducts.map((productId, index) => {
                  const rowActive = focus.productId === productId;
                  return (
                    <tr
                      key={productId}
                      className={cn(
                        'border-b border-[var(--border)]',
                        index % 2 === 1 && 'bg-[var(--surface)]/40',
                        rowActive && 'bg-brand-500/[0.06]',
                      )}
                    >
                      <td
                        className={cn(
                          'sticky left-0 z-10 px-3 py-2.5',
                          rowActive ? 'bg-brand-500/[0.10]' : 'bg-[var(--surface-solid)]',
                        )}
                      >
                        <div className="flex items-center gap-2 font-medium">
                          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-500/10 text-base">
                            {productById.get(productId)?.emoji || '🧺'}
                          </span>
                          <span className="truncate">{productById.get(productId)?.name}</span>
                        </div>
                      </td>
                      {customers.map((partyId) => {
                        const tone = cellTone(productId, partyId);
                        const colActive = focus.partyId === partyId;
                        return (
                          <td
                            key={partyId}
                            className={cn(
                              'px-1.5 py-2 align-top transition',
                              (rowActive || colActive) && 'bg-brand-500/[0.06]',
                            )}
                          >
                            <div className="flex flex-col gap-1.5">
                              <div className="relative">
                                <input
                                  value={cells[key(productId, partyId)]?.qty ?? ''}
                                  onChange={(event) => setCell(productId, partyId, { qty: event.target.value })}
                                  onFocus={() => setFocus({ productId, partyId })}
                                  inputMode="decimal"
                                  placeholder="Qty kg"
                                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 pr-7 text-xs outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                                />
                                <span className="muted pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs">
                                  kg
                                </span>
                              </div>
                              <div className="relative">
                                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-brand-500">
                                  ₹
                                </span>
                                <input
                                  value={cells[key(productId, partyId)]?.rate ?? ''}
                                  onChange={(event) => setCell(productId, partyId, { rate: event.target.value })}
                                  onFocus={() => setFocus({ productId, partyId })}
                                  inputMode="decimal"
                                  placeholder="Rate"
                                  className={cn(
                                    'w-full rounded-lg border bg-[var(--surface)] py-1.5 pl-6 pr-2 text-xs outline-none transition focus:ring-2 focus:ring-brand-400/20',
                                    tone === 'warn'
                                      ? 'border-warn/60 bg-warn/5 focus:border-warn'
                                      : tone === 'ok'
                                        ? 'border-ok/50 focus:border-brand-400'
                                        : 'border-[var(--border)] focus:border-brand-400',
                                  )}
                                />
                              </div>
                              <span
                                className={cn(
                                  'flex items-center justify-end gap-1 text-xs font-semibold tabular-nums',
                                  tone === 'warn' ? 'text-warn' : tone === 'ok' ? 'text-ok' : 'muted',
                                )}
                              >
                                {tone === 'warn' && <AlertTriangle className="size-3" />}
                                {tone === 'ok' && <CheckCircle2 className="size-3" />}
                                {formatINR(cellAmount(productId, partyId))}
                              </span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {/* Per-customer totals */}
                <tr className="border-t-2 border-[var(--border-strong)] bg-[var(--surface)]/60">
                  <td className="sticky left-0 z-10 bg-[var(--surface-solid)] px-3 py-2.5 font-semibold">
                    Prev. pending
                  </td>
                  {customers.map((partyId) => (
                    <td key={partyId} className="px-2 py-2.5 text-warn tabular-nums">
                      {formatINR(customerPrev(partyId))}
                    </td>
                  ))}
                </tr>
                <tr className="bg-[var(--surface)]/60">
                  <td className="sticky left-0 z-10 bg-[var(--surface-solid)] px-3 py-2.5 font-semibold">Subtotal</td>
                  {customers.map((partyId) => (
                    <td key={partyId} className="px-2 py-2.5 font-semibold tabular-nums">
                      {formatINR(customerSubtotal(partyId))}
                    </td>
                  ))}
                </tr>
                <tr className="bg-[var(--surface)]/60">
                  <td className="sticky left-0 z-10 bg-[var(--surface-solid)] px-3 py-2.5 font-semibold">Payment</td>
                  {customers.map((partyId) => (
                    <td key={partyId} className="px-1.5 py-2">
                      <input
                        value={paid[partyId] ?? ''}
                        onChange={(event) => setPaid({ ...paid, [partyId]: event.target.value })}
                        onFocus={() => setFocus({ partyId })}
                        inputMode="decimal"
                        placeholder="0"
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                      />
                    </td>
                  ))}
                </tr>
                <tr className="bg-warn/10">
                  <td className="sticky left-0 z-10 bg-[var(--surface-solid)] px-3 py-2.5 font-bold">New pending</td>
                  {customers.map((partyId) => (
                    <td key={partyId} className="px-2 py-2.5">
                      <span className="inline-flex rounded-full bg-warn/15 px-2 py-0.5 text-xs font-bold text-warn tabular-nums">
                        {formatINR(customerNewPending(partyId))}
                      </span>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="glass glass-card flex flex-col items-center gap-2 py-10 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-brand-500/10 text-2xl">🧮</span>
          <p className="text-sm font-medium">Select customers and vegetables</p>
          <p className="muted max-w-xs text-xs">
            Pick buyers and products above to open the billing grid, then enter quantity and rate for each cell.
          </p>
        </section>
      )}

      <SaveFab
        total={grandTotal}
        label="Generate"
        onSave={() => void generate()}
        loading={busy}
        disabled={nothingSelected || billCount === 0}
        hint={nothingSelected ? 'Select customers and vegetables to start billing' : undefined}
      />

      <div className="sticky bottom-4 z-30 hidden items-center justify-end gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 shadow-[var(--shadow)] backdrop-blur-xl lg:flex">
        <div className="mr-auto">
          <div className="muted text-xs uppercase tracking-wide">Grand total</div>
          <div className="font-semibold tabular-nums">{formatINR(grandTotal)}</div>
        </div>
        <Button icon={Save} loading={busy} disabled={nothingSelected || billCount === 0} onClick={() => void generate()}>
          Generate {billCount} bill{billCount === 1 ? '' : 's'}
        </Button>
      </div>
    </div>
  );
}

function Step({
  index,
  label,
  count,
  state,
  onClick,
}: {
  index: number;
  label: string;
  count: number;
  state: StepState;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-0 flex-1 flex-col items-center gap-1 sm:flex-none sm:flex-row sm:gap-2"
    >
      <span
        className={cn(
          'grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold transition',
          state === 'done' && 'bg-ok/15 text-ok',
          state === 'active' && 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow',
          state === 'todo' && 'bg-[var(--surface)] text-[var(--muted)]',
        )}
      >
        {state === 'done' ? <Check className="size-3.5" /> : index}
      </span>
      <span className="flex min-w-0 flex-col items-center sm:flex-row sm:gap-1">
        <span className={cn('max-w-full truncate text-xs font-semibold', state === 'todo' && 'muted')}>
          {label}
        </span>
        {count > 0 && (
          <span
            className={cn(
              'rounded-full px-1.5 text-xs font-bold tabular-nums',
              state === 'todo' ? 'muted bg-[var(--surface)]' : 'bg-brand-500/12 text-brand-600',
            )}
          >
            {count}
          </span>
        )}
      </span>
    </button>
  );
}

function StatusBadge({ invoice }: { invoice: BulkGenerationResponse['invoices'][number] }) {
  const kind = invoice.pending <= 0 ? 'paid' : invoice.paid > 0 ? 'partial' : 'pending';
  const label = kind === 'paid' ? 'Paid' : kind === 'partial' ? 'Partial' : 'Pending';
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide',
        kind === 'paid' && 'bg-ok/15 text-ok',
        kind === 'partial' && 'bg-warn/15 text-warn',
        kind === 'pending' && 'bg-danger/15 text-danger',
      )}
    >
      {label}
    </span>
  );
}

function Chip({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-xs',
        tone === 'ok' && 'border-ok/30 text-ok',
        tone === 'warn' && 'border-warn/30 text-warn',
      )}
    >
      <span className="muted">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="glass glass-card">
      <div className="muted text-xs">{label}</div>
      <div className={cn('font-display text-lg font-bold tabular-nums', tone)}>{value}</div>
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="glass glass-card px-3 py-2.5">
      <div className="muted text-xs font-semibold uppercase tracking-wide">{label}</div>
      <div className={cn('font-display text-base font-bold tabular-nums', tone)}>{value}</div>
      {hint && <div className="muted truncate text-xs">{hint}</div>}
    </div>
  );
}
