import { formatBillDate, formatBillNumber } from '@/lib/format';
import type { PurchaseDetailResponse } from '@/lib/types';

/** The fixed-size (7.5in x 6in) purchase bill. */
export function PurchaseBillSlip({ data }: { data: PurchaseDetailResponse }) {
  const contact2Phones = [data.shop.contact2_phone, data.shop.contact2_phone2].filter(Boolean).join(' | ');

  return (
    <div className="bill-slip">
      <div className="bill-slip__band px-2 py-1.5">
        <div className="font-display text-[16px] font-bold tracking-wide">{data.shop.shop_name}</div>
      </div>

      <div className="border-b border-black px-2 py-1 text-center leading-snug">
        {data.shop.shop_no && <div>SHOP NUMBER {data.shop.shop_no}</div>}
        <div>{data.shop.address}</div>
      </div>

      <div className="border-b border-black px-2 py-1 text-center leading-snug">
        {data.shop.contact1_name && (
          <div>
            {data.shop.contact1_name} | {data.shop.contact1_phone}
          </div>
        )}
        {data.shop.contact2_name && (
          <div>
            {data.shop.contact2_name} | {contact2Phones}
          </div>
        )}
      </div>

      <div className="flex items-stretch border-b border-black">
        <div className="flex flex-1 flex-col justify-center px-2 py-1.5">
          <span className="text-[14px] font-bold uppercase leading-tight">{data.bill.supplier_name}</span>
          <span className="text-[9px]">Purchase / Inward bill</span>
        </div>
        <div className="w-[2.5in] border-l border-black">
          <div className="flex justify-between border-b border-black px-2 py-1">
            <span>Bill No</span>
            <span>: {data.bill.bill_no}</span>
          </div>
          <div className="flex justify-between px-2 py-1">
            <span>Bill Date</span>
            <span>: {formatBillDate(data.bill.date)}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <table>
          <thead>
            <tr className="bill-slip__band">
              <th className="w-8">Sr</th>
              <th className="text-left">Particular</th>
              <th className="w-20">Weight</th>
              <th className="w-16">Rate</th>
              <th className="w-20 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item, index) => (
              <tr key={item.id}>
                <td className="text-center">{index + 1}</td>
                <td>{item.commodity_name}</td>
                <td className="text-right tabular-nums">{formatBillNumber(item.weight)}</td>
                <td className="text-right tabular-nums">{formatBillNumber(item.rate)}</td>
                <td className="text-right tabular-nums">{formatBillNumber(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex border-t border-black">
        <div className="w-[2.6in] border-r border-black px-2 py-1 text-[10px]">
          <div className="font-semibold">Supplier</div>
          <div>{data.bill.supplier_name}</div>
          {data.supplier?.phone && <div>{data.supplier.phone}</div>}
          {data.bill.vehicle_no && <div>Vehicle: {data.bill.vehicle_no}</div>}
        </div>
        <div className="flex flex-1 flex-col justify-center">
          <div className="flex justify-between border-b border-black px-2 py-1">
            <span>Goods</span>
            <span className="tabular-nums">{formatBillNumber(data.bill.goods_amount)}</span>
          </div>
          {data.bill.commission_amount > 0 && (
            <div className="flex justify-between border-b border-black px-2 py-1">
              <span>Commission ({data.bill.commission_percent}%)</span>
              <span className="tabular-nums">− {formatBillNumber(data.bill.commission_amount)}</span>
            </div>
          )}
          <div className="flex justify-between border-b border-black px-2 py-1 text-[11px] font-bold">
            <span>Net Payable</span>
            <span className="tabular-nums">{formatBillNumber(data.bill.net_amount)}</span>
          </div>
          <div className="flex justify-between border-b border-black px-2 py-0.5">
            <span>Paid</span>
            <span className="tabular-nums">{formatBillNumber(data.bill.paid_amount)}</span>
          </div>
          <div className="flex justify-between px-2 py-0.5 text-[11px] font-bold">
            <span>Balance</span>
            <span className="tabular-nums">{formatBillNumber(data.bill.balance_due)}</span>
          </div>
        </div>
      </div>

      {data.shop.footer && (
        <div className="bill-slip__band px-2 py-1.5 text-center text-[11px] font-semibold">
          {data.shop.footer}
        </div>
      )}
    </div>
  );
}
