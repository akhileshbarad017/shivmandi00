import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, Plus, ReceiptText, RotateCcw, Trash2, User, Wallet } from 'lucide-react';
import { InvoiceView } from '@/components/invoices/InvoiceView';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Select } from '@/components/ui/Field';
import { SaveFab } from '@/components/ui/SaveFab';
import { SearchSelect } from '@/components/ui/SearchSelect';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { useToast } from '@/components/ui/Toast';
import { apiGet } from '@/lib/api';
import { offlineWrite } from '@/lib/offline/outbox';
import { cn } from '@/lib/cn';
import { formatINR } from '@/lib/format';
import type { LastBillResponse, PartyListResponse, ProductListResponse } from '@/lib/types';

interface ItemRow {
  key: number;
  product_id: string;
  unit: 'KG' | 'CRATE20';
  qty: string;
  rate: string;
}

interface SettingsResponse {
  settings: Record<string, string>;
}

const todayISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export default function NewSalePage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const parties = useQuery({ queryKey: ['parties'], queryFn: () => apiGet<PartyListResponse>('/parties') });
  const products = useQuery({ queryKey: ['products'], queryFn: () => apiGet<ProductListResponse>('/products') });
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => apiGet<SettingsResponse>('/settings') });

  const buyers = useMemo(() => (parties.data?.items ?? []).filter((party) => party.type === 'buyer'), [parties.data?.items]);
  const productList = products.data?.items ?? [];
  const productById = useMemo(() => new Map(productList.map((product) => [product.id, product])), [productList]);
  const rates = {
    gst: Number(settings.data?.settings.gst_percent ?? 0),
  };

  const [walkIn, setWalkIn] = useState(false);
  const [partyId, setPartyId] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [paymentType, setPaymentType] = useState('Cash');
  const [date, setDate] = useState(todayISO());
  const [vehicleNo, setVehicleNo] = useState('');
  const [discount, setDiscount] = useState('');
  const [paid, setPaid] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemRow[]>([
    { key: Date.now(), product_id: '', unit: 'KG', qty: '', rate: '' },
  ]);
  const [invoiceNo, setInvoiceNo] = useState<string | null>(null);

  const selectedBuyer = buyers.find((buyer) => String(buyer.id) === partyId);
  const prevBalance = walkIn ? 0 : selectedBuyer?.balance ?? 0;

  const itemAmounts = items.map((item) => {
    const product = productById.get(Number(item.product_id));
    const rate = Number(item.rate) || (item.unit === 'CRATE20' ? product?.rate_20kg ?? 0 : product?.rate ?? 0);
    return (Number(item.qty) || 0) * rate;
  });
  const subtotal = itemAmounts.reduce((sum, value) => sum + value, 0);
  const discountValue = Number(discount) || 0;
  const gst = (subtotal * rates.gst) / 100;
  const total = subtotal - discountValue + gst + prevBalance;
  const paidValue = paid === '' ? (paymentType === 'Credit' ? 0 : total) : Number(paid) || 0;
  const balance = Math.max(0, total - paidValue);

  const save = useMutation({
    mutationFn: () =>
      offlineWrite<{ invoice_no: string }>({
        method: 'POST',
        path: '/sales',
        label: walkIn ? `Sale · ${buyerName || 'walk-in'}` : `Sale · ${selectedBuyer?.name ?? ''}`,
        body: {
          party_id: walkIn ? undefined : Number(partyId) || undefined,
          buyer_name: walkIn ? buyerName : undefined,
          buyer_phone: walkIn ? buyerPhone : undefined,
          date,
          vehicle_no: vehicleNo,
          payment_type: paymentType,
          discount: discountValue,
          paid,
          notes,
          items: items.map((item) => {
            const product = productById.get(Number(item.product_id));
            const rate = Number(item.rate) || (item.unit === 'CRATE20' ? product?.rate_20kg ?? 0 : product?.rate ?? 0);
            return { product_id: Number(item.product_id), unit: item.unit, qty: Number(item.qty), rate };
          }),
        },
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['sales'] });
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
      void queryClient.invalidateQueries({ queryKey: ['parties'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      setItems([{ key: Date.now(), product_id: '', unit: 'KG', qty: '', rate: '' }]);
      setBuyerPhone('');
      setDiscount('');
      setPaid('');
      setNotes('');
      if (result.queued) {
        toast.notify('Saved offline — will sync when online', 'success');
        return;
      }
      toast.notify('Sale saved', 'success');
      setInvoiceNo(result.data?.invoice_no ?? null);
    },
    onError: (error: Error) => toast.notify(error.message, 'error'),
  });

  function updateItem(key: number, patch: Partial<ItemRow>) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  async function repeatLast() {
    try {
      const res = await apiGet<LastBillResponse>(`/sales/last?party_id=${partyId}`);
      if (!res.invoice || res.items.length === 0) {
        toast.notify('No previous bill found', 'info');
        return;
      }
      setItems(
        res.items.map((item, index) => ({
          key: Date.now() + index,
          product_id: item.product_id ? String(item.product_id) : '',
          unit: item.unit === 'CRATE20' ? 'CRATE20' : 'KG',
          qty: String(item.qty),
          rate: String(item.rate),
        })),
      );
      if (['Cash', 'UPI', 'Bank', 'Credit'].includes(res.invoice.payment_mode)) {
        setPaymentType(res.invoice.payment_mode);
      }
      toast.notify('Last bill loaded', 'success');
    } catch (error) {
      toast.notify(error instanceof Error ? error.message : 'Could not load last bill', 'error');
    }
  }

  const canSave =
    (walkIn ? buyerName.trim().length > 0 : !!partyId) &&
    items.some((item) => item.product_id && Number(item.qty) > 0 && (Number(item.rate) > 0 || productById.has(Number(item.product_id))));

  return (
    <div className="space-y-4">
      <PageHeader title="New sale" subtitle="Counter / bulk lot billing" icon={ReceiptText} />

      <section className="glass glass-card">
        <SectionHeader icon={User} title="Customer" subtitle="Registered buyer or walk-in" />
        <div className="mb-4 inline-flex rounded-full border border-[var(--border)] bg-[var(--surface)] p-1">
          <button
            type="button"
            onClick={() => setWalkIn(false)}
            className={cn(
              'inline-flex min-h-11 items-center rounded-full px-3.5 py-1.5 text-xs font-semibold transition',
              !walkIn ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow' : 'muted hover:text-[var(--text)]',
            )}
          >
            Registered buyer
          </button>
          <button
            type="button"
            onClick={() => setWalkIn(true)}
            className={cn(
              'inline-flex min-h-11 items-center rounded-full px-3.5 py-1.5 text-xs font-semibold transition',
              walkIn ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow' : 'muted hover:text-[var(--text)]',
            )}
          >
            Walk-in
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {walkIn ? (
            <>
              <FormField label="Buyer name">
                <Input value={buyerName} onChange={(event) => setBuyerName(event.target.value)} placeholder="Customer name" />
              </FormField>
              <FormField label="Buyer phone (for WhatsApp)">
                <Input value={buyerPhone} onChange={(event) => setBuyerPhone(event.target.value)} inputMode="tel" placeholder="Optional" />
              </FormField>
            </>
          ) : (
            <FormField label="Buyer" className="sm:col-span-2 lg:col-span-2">
              <SearchSelect
                value={partyId}
                onChange={setPartyId}
                placeholder="Choose buyer…"
                searchPlaceholder="Search name, code, mobile…"
                emptyLabel="No buyers found"
                options={buyers.map((buyer) => ({
                  value: String(buyer.id),
                  label: `${buyer.name}${buyer.code ? ` · ${buyer.code}` : ''}${
                    buyer.balance > 0 ? ` · due ${formatINR(buyer.balance)}` : ''
                  }`,
                }))}
              />
            </FormField>
          )}
          <FormField label="Date">
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </FormField>
          <FormField label="Payment type">
            <Select value={paymentType} onChange={(event) => setPaymentType(event.target.value)}>
              <option>Cash</option>
              <option>UPI</option>
              <option>Bank</option>
              <option>Credit</option>
            </Select>
          </FormField>
          <FormField label="Vehicle no.">
            <Input value={vehicleNo} onChange={(event) => setVehicleNo(event.target.value)} placeholder="MH-12-AB-4521" />
          </FormField>
          <FormField label="Notes">
            <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional" />
          </FormField>
        </div>

        {!walkIn && partyId && (
          <button
            type="button"
            onClick={() => void repeatLast()}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand-500/10 px-3 py-1.5 text-xs font-semibold text-brand-600"
          >
            <RotateCcw className="size-3.5" /> Repeat last bill
          </button>
        )}
      </section>

      <section className="glass glass-card">
        <div className="mb-4 flex items-center justify-between gap-3">
          <SectionHeader icon={Boxes} title="Items" subtitle="Products, quantity & rate" />
          <Button
            variant="subtle"
            size="sm"
            icon={Plus}
            className="shrink-0 whitespace-nowrap"
            onClick={() =>
              setItems((current) => [
                { key: Date.now() + Math.random(), product_id: '', unit: 'KG', qty: '', rate: '' },
                ...current,
              ])
            }
          >
            Add item
          </Button>
        </div>

        <div className="space-y-3">
          {items.map((item, index) => {
            const product = productById.get(Number(item.product_id));
            const placeholder = item.unit === 'CRATE20' ? product?.rate_20kg : product?.rate;
            return (
              <div
                key={item.key}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 transition hover:border-[var(--border-strong)]"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="grid size-6 place-items-center rounded-lg bg-brand-500/10 text-xs font-bold text-brand-500">
                    {index + 1}
                  </span>
                  {items.length > 1 && (
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Remove"
                      onClick={() => setItems((current) => current.filter((row) => row.key !== item.key))}
                    >
                      <Trash2 className="size-4 text-danger" />
                    </Button>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-12">
                  <div className="sm:col-span-5">
                    <FormField label="Product">
                      <Select value={item.product_id} onChange={(event) => updateItem(item.key, { product_id: event.target.value })}>
                        <option value="">Select…</option>
                        {productList.map((productOption) => (
                          <option key={productOption.id} value={productOption.id}>
                            {productOption.name}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                  </div>
                  <div className="sm:col-span-3">
                    <FormField label="Unit">
                      <Select value={item.unit} onChange={(event) => updateItem(item.key, { unit: event.target.value as 'KG' | 'CRATE20' })}>
                        <option value="KG">Per KG</option>
                        <option value="CRATE20">Per 20kg</option>
                      </Select>
                    </FormField>
                  </div>
                  <div className="sm:col-span-2">
                    <FormField label="Qty">
                      <Input value={item.qty} onChange={(event) => updateItem(item.key, { qty: event.target.value })} inputMode="decimal" />
                    </FormField>
                  </div>
                  <div className="sm:col-span-2">
                    <FormField label="Rate (₹)">
                      <Input
                        value={item.rate}
                        onChange={(event) => updateItem(item.key, { rate: event.target.value })}
                        inputMode="decimal"
                        placeholder={placeholder !== undefined ? String(placeholder) : '0'}
                      />
                    </FormField>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="muted text-xs">Amount</span>
                  <span className="rounded-full bg-brand-500/10 px-3 py-1 text-sm font-semibold tabular-nums text-brand-600">
                    {formatINR(itemAmounts[index] ?? 0)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="glass glass-card">
        <SectionHeader icon={Wallet} title="Bill summary" subtitle="Totals & payment" />
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Discount (₹)">
            <Input value={discount} onChange={(event) => setDiscount(event.target.value)} inputMode="decimal" placeholder="0" />
          </FormField>
          <FormField label={`Paid now (₹)${paymentType !== 'Credit' ? ' · auto full' : ''}`}>
            <Input value={paid} onChange={(event) => setPaid(event.target.value)} inputMode="decimal" placeholder={paymentType === 'Credit' ? '0' : 'Full'} />
          </FormField>
        </div>

        <div className="mt-4 space-y-1.5 text-sm">
          <Row label="Subtotal" value={formatINR(subtotal)} />
          {discountValue > 0 && <Row label="Discount" value={`− ${formatINR(discountValue)}`} />}
          {prevBalance > 0 && <Row label="Previous balance" value={formatINR(prevBalance)} />}
        </div>

        <div className="mt-3 flex items-center justify-between rounded-xl bg-gradient-to-r from-brand-500/12 to-cyan/12 px-3.5 py-2.5">
          <span className="text-sm font-semibold">Grand total</span>
          <span className="font-display text-lg font-bold tabular-nums">{formatINR(total)}</span>
        </div>

        <div className="mt-2 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2">
          <span className="muted text-sm">Paid now</span>
          <span className="font-semibold tabular-nums">{formatINR(paidValue)}</span>
        </div>

        <div className="mt-2 flex items-center justify-between rounded-xl bg-warn/12 px-3.5 py-2">
          <span className="text-sm font-semibold">Pending</span>
          <span className="font-display text-base font-bold tabular-nums text-warn">{formatINR(balance)}</span>
        </div>
      </section>

      <SaveFab
        total={total}
        label="Save & bill"
        onSave={() => save.mutate()}
        loading={save.isPending}
        disabled={!canSave}
      />

      <div className="hidden items-center justify-end gap-3 lg:flex">
        <div className="mr-auto">
          <div className="muted text-xs uppercase tracking-wide">Total / Balance</div>
          <div className="font-semibold tabular-nums">
            {formatINR(total)} <span className="text-warn">· {formatINR(balance)}</span>
          </div>
        </div>
        <Button className="min-w-[9rem]" loading={save.isPending} disabled={!canSave} onClick={() => save.mutate()}>
          Save &amp; bill
        </Button>
      </div>

      <InvoiceView open={!!invoiceNo} onClose={() => setInvoiceNo(null)} invoiceNo={invoiceNo} />
    </div>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="muted">{label}</span>
      <span className={`tabular-nums ${strong ? 'font-semibold' : ''} ${tone ?? ''}`}>{value}</span>
    </div>
  );
}


