import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { BillSlip } from '@/components/invoices/BillSlip';
import { ThermalReceipt } from '@/components/invoices/ThermalReceipt';
import { Button } from '@/components/ui/Button';
import { apiGet } from '@/lib/api';
import type { InvoiceDetail } from '@/lib/types';

export default function PrintBillPage() {
  const { invoiceNo = '' } = useParams();
  const [params] = useSearchParams();
  const thermal = params.get('format') === 'thermal';

  const query = useQuery({
    queryKey: ['invoice', invoiceNo],
    queryFn: () => apiGet<InvoiceDetail>(`/invoices/${invoiceNo}`),
    enabled: !!invoiceNo,
  });

  const data = query.data;
  const invoiceId = data?.invoice.invoice_no;
  const docClass = thermal ? 'mx-auto w-[80mm]' : 'mx-auto w-[7.5in]';
  const barClass = thermal ? 'mx-auto mb-3 flex w-[80mm]' : 'mx-auto mb-3 flex w-[7.5in]';

  // Auto-open the print dialog once the bill is ready.
  useEffect(() => {
    if (!data) return;
    const timer = setTimeout(() => window.print(), 500);
    return () => clearTimeout(timer);
  }, [data]);

  if (query.isLoading) {
    return <div className="grid min-h-dvh place-items-center text-sm">Loading bill…</div>;
  }
  if (!data) {
    return <div className="grid min-h-dvh place-items-center text-sm">Bill not found.</div>;
  }

  return (
    <>
      <div className="min-h-dvh overflow-x-auto bg-white p-4">
        <div className={`no-print ${barClass} items-center justify-between`}>
          <span className="text-sm font-medium">
            {thermal ? 'Thermal' : 'Bill'} {invoiceId}
          </span>
          <div className="flex gap-2">
            <Button variant="subtle" onClick={() => window.close()}>
              Close
            </Button>
            <Button icon={Printer} onClick={() => window.print()}>
              Print
            </Button>
          </div>
        </div>
        <div className={docClass}>{thermal ? <ThermalReceipt data={data} /> : <BillSlip data={data} />}</div>
      </div>

      {createPortal(
        <div className="bill-print">{thermal ? <ThermalReceipt data={data} /> : <BillSlip data={data} />}</div>,
        document.body,
      )}
    </>
  );
}
