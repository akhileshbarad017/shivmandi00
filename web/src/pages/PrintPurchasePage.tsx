import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { PurchaseBillSlip } from '@/components/purchases/PurchaseBillSlip';
import { Button } from '@/components/ui/Button';
import { apiGet } from '@/lib/api';
import type { PurchaseDetailResponse } from '@/lib/types';

export default function PrintPurchasePage() {
  const { billNo = '' } = useParams();
  const query = useQuery({
    queryKey: ['purchase', billNo],
    queryFn: () => apiGet<PurchaseDetailResponse>(`/purchases/${billNo}`),
    enabled: !!billNo,
  });

  const data = query.data;

  useEffect(() => {
    if (!data) return;
    const timer = setTimeout(() => window.print(), 500);
    return () => clearTimeout(timer);
  }, [data]);

  if (query.isLoading) {
    return <div className="grid min-h-dvh place-items-center text-sm">Loading bill…</div>;
  }
  if (!data) {
    return <div className="grid min-h-dvh place-items-center text-sm">Purchase bill not found.</div>;
  }

  return (
    <>
      <div className="min-h-dvh overflow-x-auto bg-white p-4">
        <div className="no-print mx-auto mb-3 flex w-[7.5in] items-center justify-between">
          <span className="text-sm font-medium">Purchase {data.bill.bill_no}</span>
          <div className="flex gap-2">
            <Button variant="subtle" onClick={() => window.close()}>
              Close
            </Button>
            <Button icon={Printer} onClick={() => window.print()}>
              Print
            </Button>
          </div>
        </div>
        <div className="mx-auto w-[7.5in]">
          <PurchaseBillSlip data={data} />
        </div>
      </div>

      {createPortal(
        <div className="bill-print">
          <PurchaseBillSlip data={data} />
        </div>,
        document.body,
      )}
    </>
  );
}
