import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, MessageCircle, Printer } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { apiGet } from '@/lib/api';
import { formatDate, formatINR, formatQty } from '@/lib/format';
import type { PurchaseDetailResponse } from '@/lib/types';

interface PurchaseDetailModalProps {
  open: boolean;
  onClose: () => void;
  billNo: string | null;
}

export function PurchaseDetailModal({ open, onClose, billNo }: PurchaseDetailModalProps) {
  const query = useQuery({
    queryKey: ['purchase', billNo],
    queryFn: () => apiGet<PurchaseDetailResponse>(`/purchases/${billNo}`),
    enabled: open && !!billNo,
  });

  const data = query.data;

  const phone = data?.supplier?.phone ?? '';
  const whatsapp =
    data && phone
      ? `https://wa.me/91${phone.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(
          `Purchase bill ${data.bill.bill_no} (${formatDate(data.bill.date)}) — goods ${formatINR(
            data.bill.goods_amount,
          )}, net payable ${formatINR(data.bill.net_amount)}, balance ${formatINR(data.bill.balance_due)}. — ${data.shop.shop_name}`,
        )}`
      : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={data ? `Purchase ${data.bill.bill_no}` : 'Purchase'}
      description={data ? `${data.bill.supplier_name} · ${formatDate(data.bill.date)}` : undefined}
      footer={
        data ? (
          <div className="no-print flex w-full items-center justify-end gap-2">
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noreferrer">
                <Button variant="subtle" icon={MessageCircle}>
                  WhatsApp
                </Button>
              </a>
            )}
            <Button
              variant="ghost"
              icon={ExternalLink}
              onClick={() => window.open(`/print/purchase/${encodeURIComponent(data.bill.bill_no)}`, '_blank')}
            >
              Open print page
            </Button>
            <Button
              icon={Printer}
              onClick={() => window.open(`/print/purchase/${encodeURIComponent(data.bill.bill_no)}`, '_blank')}
            >
              Print
            </Button>
          </div>
        ) : undefined
      }
    >
      {query.isLoading || !data ? (
        <p className="muted py-8 text-center text-sm">Loading bill…</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Goods" value={formatINR(data.bill.goods_amount)} />
            <Stat
              label={`Commission${data.bill.commission_percent ? ` (${data.bill.commission_percent}%)` : ''}`}
              value={`− ${formatINR(data.bill.commission_amount)}`}
              tone="text-danger"
            />
            <Stat label="Net payable" value={formatINR(data.bill.net_amount)} />
            <Stat label="Balance" value={formatINR(data.bill.balance_due)} tone="text-warn" />
          </div>

          <Section title="Items">
            <div className="glass overflow-hidden rounded-2xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="muted border-b border-[var(--border)] text-left text-xs uppercase">
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2 text-right">Weight</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-3 py-2">{item.commodity_name}</td>
                      <td className="px-3 py-2 text-right">{formatQty(item.weight)}</td>
                      <td className="px-3 py-2 text-right">{formatINR(item.rate)}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatINR(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {data.payments.length > 0 && (
            <Section title="Payments">
              <div className="space-y-1 text-sm">
                {data.payments.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between">
                    <span className="muted">
                      {formatDate(payment.date)} · {payment.mode} · {payment.voucher_no}
                    </span>
                    <span className="font-medium">{formatINR(payment.amount)}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <div className="flex flex-wrap gap-2 text-xs">
            <Badge tone={data.bill.status === 'PAID' ? 'ok' : data.bill.status === 'PARTIAL' ? 'warn' : 'danger'}>
              {data.bill.status}
            </Badge>
            <Badge tone="muted">Paid {formatINR(data.bill.paid_amount)}</Badge>
            {data.bill.vehicle_no && <Badge tone="cyan">🚚 {data.bill.vehicle_no}</Badge>}
            {data.supplier && <Badge tone="brand">{data.supplier.name}</Badge>}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="glass glass-card py-3">
      <div className="muted text-xs">{label}</div>
      <div className={`font-display text-base font-semibold ${tone ?? ''}`}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="muted mb-2 text-xs font-semibold uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  );
}
