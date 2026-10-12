import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, ExternalLink, FileDown, MessageCircle, Printer, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { apiGet } from '@/lib/api';
import { offlineWrite } from '@/lib/offline/outbox';
import { formatBillNumber } from '@/lib/format';
import type { InvoiceDetail } from '@/lib/types';
import { BillSlip } from './BillSlip';

interface InvoiceViewProps {
  open: boolean;
  onClose: () => void;
  invoiceNo: string | null;
}

export function InvoiceView({ open, onClose, invoiceNo }: InvoiceViewProps) {
  const query = useQuery({
    queryKey: ['invoice', invoiceNo],
    queryFn: () => apiGet<InvoiceDetail>(`/invoices/${invoiceNo}`),
    enabled: open && !!invoiceNo,
  });

  const data = query.data;

  // Fit the fixed 7.5in slip to the available width on screen (print stays full size).
  const holderRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const element = holderRef.current;
    if (!element) return;
    const slipPx = 7.5 * 96;
    const update = () => setScale(Math.min(1, element.clientWidth / slipPx));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [data]);

  const [payOpen, setPayOpen] = useState(false);

  const whatsappPhone = data?.buyer?.phone ?? data?.invoice.buyer_phone ?? '';
  const whatsapp =
    data && whatsappPhone
      ? `https://wa.me/91${whatsappPhone.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(
          `Namaste ${data.buyer?.name ?? data.invoice.buyer_name}, bill ${data.invoice.invoice_no} total ${formatBillNumber(
            data.invoice.total_due,
          )} (pending ${formatBillNumber(data.invoice.balance_due)}). — ${data.shop.shop_name}`,
        )}`
      : null;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="lg"
        title={data ? `Bill ${data.invoice.invoice_no}` : 'Bill'}
        footer={
          <div className="no-print flex w-full flex-wrap items-center justify-end gap-2">
            {invoiceNo && (data?.invoice.balance_due ?? 0) > 0 && (
              <Button variant="subtle" icon={Banknote} onClick={() => setPayOpen(true)}>
                Payment
              </Button>
            )}
            {invoiceNo && (
              <Button
                variant="ghost"
                icon={Receipt}
                onClick={() => window.open(`/print/${encodeURIComponent(invoiceNo)}?format=thermal`, '_blank')}
              >
                Thermal
              </Button>
            )}
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noreferrer">
                <Button variant="subtle" icon={MessageCircle}>
                  WhatsApp
                </Button>
              </a>
            )}
            <Button variant="ghost" icon={FileDown} onClick={() => window.print()}>
              PDF
            </Button>
            {invoiceNo && (
              <Button
                variant="ghost"
                icon={ExternalLink}
                onClick={() => window.open(`/print/${encodeURIComponent(invoiceNo)}`, '_blank')}
              >
                Open
              </Button>
            )}
            <Button icon={Printer} onClick={() => window.print()}>
              Print
            </Button>
          </div>
        }
      >
        {query.isLoading || !data ? (
          <p className="muted py-8 text-center text-sm">Loading bill…</p>
        ) : (
          <div
            ref={holderRef}
            className="bill-holder relative w-full overflow-hidden"
            style={{ height: `calc(6in * ${scale})` }}
          >
            <div className="bill-scale" style={{ '--bill-scale': String(scale) } as CSSProperties}>
              <BillSlip data={data} />
            </div>
          </div>
        )}
      </Modal>

      {open && data && payOpen && (
        <BillPaymentModal
          invoiceNo={data.invoice.invoice_no}
          balance={data.invoice.balance_due}
          onClose={() => setPayOpen(false)}
        />
      )}

      {/* Print-only copy: a static, full-size bill directly under <body> (no modal clipping). */}
      {open &&
        data &&
        createPortal(
          <div className="bill-print">
            <BillSlip data={data} />
          </div>,
          document.body,
        )}
    </>
  );
}

function BillPaymentModal({
  invoiceNo,
  balance,
  onClose,
}: {
  invoiceNo: string;
  balance: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [amount, setAmount] = useState(String(balance));
  const [mode, setMode] = useState('Cash');

  const save = useMutation({
    mutationFn: () =>
      offlineWrite({
        method: 'POST',
        path: `/sales/${encodeURIComponent(invoiceNo)}/payment`,
        label: `Sale payment · ${invoiceNo}`,
        body: { amount: Number(amount), mode },
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['invoice', invoiceNo] });
      void queryClient.invalidateQueries({ queryKey: ['sales'] });
      void queryClient.invalidateQueries({ queryKey: ['parties'] });
      toast.notify(result.queued ? 'Saved offline — will sync when online' : 'Payment recorded', 'success');
      onClose();
    },
    onError: (error: Error) => toast.notify(error.message, 'error'),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Record payment"
      description={`Pending ${formatBillNumber(balance)}`}
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} disabled={!Number(amount) || Number(amount) <= 0} onClick={() => save.mutate()}>
            Save payment
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
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
      </div>
    </Modal>
  );
}
