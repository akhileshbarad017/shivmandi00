import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Boxes, Plus, Receipt, ShoppingBasket, Trash2, User, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Select } from '@/components/ui/Field';
import { SaveFab } from '@/components/ui/SaveFab';
import { SearchSelect } from '@/components/ui/SearchSelect';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { useToast } from '@/components/ui/Toast';
import { apiGet } from '@/lib/api';
import { offlineWrite } from '@/lib/offline/outbox';
import { formatINR } from '@/lib/format';
import { PARTY_TYPE_LABEL, type PartyListResponse, type ProductListResponse } from '@/lib/types';

interface ItemRow {
  key: number;
  product_id: string;
  unit: 'KG' | 'CRATE20';
  weight: string;
  rate: string;
}

function lineAmount(unit: string, weight: number, rate: number): number {
  return unit === 'CRATE20' ? (weight / 20) * rate : weight * rate;
}

const todayISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export default function NewPurchasePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  const parties = useQuery({ queryKey: ['parties'], queryFn: () => apiGet<PartyListResponse>('/parties') });
  const products = useQuery({ queryKey: ['products'], queryFn: () => apiGet<ProductListResponse>('/products') });
  const next = useQuery({ queryKey: ['purchases', 'next'], queryFn: () => apiGet<{ bill_no: string }>('/purchases/next') });

  const suppliers = useMemo(
    () => (parties.data?.items ?? []).filter((party) => party.type !== 'buyer'),
    [parties.data?.items],
  );
  const productList = products.data?.items ?? [];

  const [supplierId, setSupplierId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [vehicleNo, setVehicleNo] = useState('');
  const [driverName, setDriverName] = useState('');
  const [village, setVillage] = useState('');
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [commissionPercent, setCommissionPercent] = useState('');
  const [paid, setPaid] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemRow[]>([
    { key: Date.now(), product_id: '', unit: 'KG', weight: '', rate: '' },
  ]);

  const productById = useMemo(
    () => new Map(productList.map((product) => [product.id, product])),
    [productList],
  );

  const itemAmounts = items.map((item) => {
    const product = productById.get(Number(item.product_id));
    const rate = Number(item.rate) || (item.unit === 'CRATE20' ? product?.rate_20kg ?? 0 : product?.rate ?? 0);
    return lineAmount(item.unit, Number(item.weight) || 0, rate);
  });
  const goodsAmount = itemAmounts.reduce((sum, value) => sum + value, 0);
  const percentValue = Number(commissionPercent) || 0;
  const commissionAmount = (goodsAmount * percentValue) / 100;
  const netAmount = goodsAmount - commissionAmount;
  const paidAmount = Number(paid) || 0;
  const balanceDue = Math.max(0, netAmount - paidAmount);

  const save = useMutation({
    mutationFn: () =>
      offlineWrite({
        method: 'POST',
        path: '/purchases',
        label: `Purchase · ${suppliers.find((s) => String(s.id) === supplierId)?.name ?? ''}`,
        body: {
          supplier_id: Number(supplierId),
          date,
          vehicle_no: vehicleNo,
          driver_name: driverName,
          village,
          payment_mode: paymentMode,
          commission_percent: percentValue,
          paid: paidAmount,
          notes,
          items: items.map((item) => {
            const product = productById.get(Number(item.product_id));
            const rate = Number(item.rate) || (item.unit === 'CRATE20' ? product?.rate_20kg ?? 0 : product?.rate ?? 0);
            return {
              product_id: Number(item.product_id),
              unit: item.unit,
              weight: Number(item.weight) || 0,
              rate,
            };
          }),
        },
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['purchases'] });
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
      void queryClient.invalidateQueries({ queryKey: ['parties'] });
      toast.notify(result.queued ? 'Saved offline — will sync when online' : 'Purchase saved', 'success');
      navigate('/purchases');
    },
    onError: (error: Error) => toast.notify(error.message, 'error'),
  });

  function updateItem(key: number, patch: Partial<ItemRow>) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  const canSave = !!supplierId && items.some((item) => item.product_id && Number(item.weight) > 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="New purchase"
        subtitle={`Inward bill${next.data ? ` · ${next.data.bill_no}` : ''}`}
        icon={ShoppingBasket}
        actions={
          <Button variant="subtle" onClick={() => navigate('/purchases')}>
            Cancel
          </Button>
        }
      />

      <section className="glass glass-card">
        <SectionHeader icon={User} title="Supplier & bill" subtitle="Party, vehicle & payment" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <FormField label="Supplier">
          <SearchSelect
            value={supplierId}
            onChange={setSupplierId}
            placeholder="Choose supplier…"
            searchPlaceholder="Search name, code, mobile…"
            emptyLabel="No parties found"
            options={suppliers.map((party) => ({
              value: String(party.id),
              label: `${party.name} · ${PARTY_TYPE_LABEL[party.type]}${party.code ? ` · ${party.code}` : ''}`,
            }))}
          />
        </FormField>
        <FormField label="Date">
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </FormField>
        <FormField label="Vehicle no.">
          <Input value={vehicleNo} onChange={(event) => setVehicleNo(event.target.value)} placeholder="MH-12-AB-4521" />
        </FormField>
        <FormField label="Driver">
          <Input value={driverName} onChange={(event) => setDriverName(event.target.value)} placeholder="Driver name" />
        </FormField>
        <FormField label="Village">
          <Input value={village} onChange={(event) => setVillage(event.target.value)} placeholder="Village" />
        </FormField>
        <FormField label="Payment mode">
          <Select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value)}>
            <option>Cash</option>
            <option>UPI</option>
            <option>Bank</option>
            <option>Cheque</option>
          </Select>
        </FormField>
        </div>
      </section>

      <section className="glass glass-card">
        <div className="mb-4 flex items-center justify-between gap-3">
          <SectionHeader icon={Boxes} title="Items" subtitle="Products, weight & rate" />
          <Button
            variant="subtle"
            size="sm"
            icon={Plus}
            className="shrink-0 whitespace-nowrap"
            onClick={() =>
              setItems((current) => [
                ...current,
                { key: Date.now() + Math.random(), product_id: '', unit: 'KG', weight: '', rate: '' },
              ])
            }
          >
            Add item
          </Button>
        </div>

        <div className="space-y-3">
          {items.map((item, index) => {
            const rate = Number(item.rate) || (item.unit === 'CRATE20'
              ? productById.get(Number(item.product_id))?.rate_20kg ?? 0
              : productById.get(Number(item.product_id))?.rate ?? 0);
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
                        {productList.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                  </div>
                  <div className="sm:col-span-3">
                    <FormField label="Unit">
                      <Select
                        value={item.unit}
                        onChange={(event) => updateItem(item.key, { unit: event.target.value as 'KG' | 'CRATE20' })}
                      >
                        <option value="KG">Per KG</option>
                        <option value="CRATE20">Per 20kg</option>
                      </Select>
                    </FormField>
                  </div>
                  <div className="sm:col-span-2">
                    <FormField label="Weight (kg)">
                      <Input value={item.weight} onChange={(event) => updateItem(item.key, { weight: event.target.value })} inputMode="decimal" />
                    </FormField>
                  </div>
                  <div className="sm:col-span-2">
                    <FormField label="Rate (₹)">
                      <Input
                        value={item.rate}
                        onChange={(event) => updateItem(item.key, { rate: event.target.value })}
                        inputMode="decimal"
                        placeholder={String(rate)}
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

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="glass glass-card">
          <SectionHeader icon={Wallet} title="Payment" subtitle="Commission & amount paid" />
          <div className="mt-3">
            <FormField label="Commission (%)" hint="Deducted from the payable">
              <Input
                value={commissionPercent}
                onChange={(event) => setCommissionPercent(event.target.value)}
                inputMode="decimal"
                placeholder="0"
              />
            </FormField>
            <FormField label="Paid now (₹)" className="mt-3">
              <Input value={paid} onChange={(event) => setPaid(event.target.value)} inputMode="decimal" placeholder="0" />
            </FormField>
            <FormField label="Notes" className="mt-3">
              <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional" />
            </FormField>
          </div>
        </section>

        <section className="glass glass-card">
          <SectionHeader icon={Receipt} title="Summary" subtitle="Net payable" />
          <div className="mt-3 space-y-1.5 text-sm">
            <Row label="Goods" value={formatINR(goodsAmount)} />
            {percentValue > 0 && (
              <Row label={`Commission (${percentValue}%)`} value={`− ${formatINR(commissionAmount)}`} />
            )}
          </div>
          <div className="mt-3 flex items-center justify-between rounded-xl bg-gradient-to-r from-brand-500/12 to-cyan/12 px-3.5 py-2.5">
            <span className="text-sm font-semibold">Net payable</span>
            <span className="font-display text-lg font-bold tabular-nums">{formatINR(netAmount)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2">
            <span className="muted text-sm">Paid</span>
            <span className="font-semibold tabular-nums">{formatINR(paidAmount)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between rounded-xl bg-warn/12 px-3.5 py-2">
            <span className="text-sm font-semibold">Balance</span>
            <span className="font-display text-base font-bold tabular-nums text-warn">{formatINR(balanceDue)}</span>
          </div>
        </section>
      </div>

      <SaveFab
        total={netAmount}
        label="Save"
        onSave={() => save.mutate()}
        loading={save.isPending}
        disabled={!canSave}
      />

      <div className="hidden items-center justify-end gap-3 lg:flex">
        <div className="mr-auto">
          <div className="muted text-xs uppercase tracking-wide">Net / Balance</div>
          <div className="font-semibold tabular-nums">
            {formatINR(netAmount)} <span className="text-warn">· {formatINR(balanceDue)}</span>
          </div>
        </div>
        <Button variant="subtle" onClick={() => navigate('/purchases')}>
          Cancel
        </Button>
        <Button className="min-w-[9rem]" loading={save.isPending} disabled={!canSave} onClick={() => save.mutate()}>
          Save purchase
        </Button>
      </div>
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
