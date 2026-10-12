import { QRCodeSVG } from 'qrcode.react';
import { MapPin, Phone } from 'lucide-react';
import { formatBillDate, formatBillNumber } from '@/lib/format';
import type { InvoiceDetail } from '@/lib/types';

/** The fixed-size (7.5in x 6in) bill. Shared by the modal preview and the print route. */
export function BillSlip({ data }: { data: InvoiceDetail }) {
  const { shop, invoice } = data;
  const contacts = [
    { name: shop.contact1_name, phone: shop.contact1_phone },
    { name: shop.contact2_name, phone: [shop.contact2_phone, shop.contact2_phone2].filter(Boolean).join(' | ') },
  ].filter((contact) => contact.name || contact.phone);

  return (
    <div className="bill-slip">
      {/* Header / business name */}
      <div className="bill-slip__band px-2 py-1.5">
        <div className="font-display text-[17px] font-bold tracking-wide">{shop.shop_name}</div>
      </div>

      {/* Shop + market + city */}
      <div className="border-b border-black px-2 py-1 text-center leading-snug">
        {shop.shop_no && <div>SHOP NUMBER {shop.shop_no}</div>}
        <div>{shop.address}</div>
        {shop.city && (
          <div className="flex items-center justify-center gap-1">
            <MapPin className="size-3" strokeWidth={2.5} />
            <span>{shop.city}</span>
          </div>
        )}
      </div>

      {/* Contacts */}
      {contacts.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-0.5 border-b border-black px-2 py-1">
          {contacts.map((contact, index) => (
            <span key={index} className="inline-flex items-center gap-1.5">
              <Phone className="size-3.5 fill-current" />
              <span>
                {contact.name}
                {contact.name && contact.phone ? ' : ' : ''}
                {contact.phone}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Customer + bill meta */}
      <div className="flex items-stretch border-b border-black">
        <div className="flex flex-1 flex-col justify-center px-2 py-1.5">
          <span className="text-[14px] font-bold uppercase leading-tight">
            {data.buyer?.name ?? invoice.buyer_name}
          </span>
          {data.buyer?.code && <span className="text-[9px]">Customer ID : {data.buyer.code}</span>}
        </div>
        <div className="w-[2.5in] border-l border-black">
          <div className="flex justify-between border-b border-black px-2 py-1">
            <span>Bill No</span>
            <span>: {invoice.invoice_no}</span>
          </div>
          <div className="flex justify-between px-2 py-1">
            <span>Bill Date</span>
            <span>: {formatBillDate(invoice.invoice_date)}</span>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-hidden">
        <table>
          <thead>
            <tr className="bill-slip__band">
              <th className="w-8">Sr</th>
              <th className="text-left">Particular</th>
              <th className="w-20">Weight (Kg)</th>
              <th className="w-16">Rate (₹)</th>
              <th className="w-20 text-right">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item, index) => (
              <tr key={index}>
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

      {/* QR + totals */}
      <div className="flex border-t border-black">
        <div className="flex w-[1.4in] items-center justify-center border-r border-black p-1.5">
          {data.upi.link ? (
            <QRCodeSVG value={data.upi.link} size={78} />
          ) : (
            <span className="text-center text-[9px]">Set a UPI ID in Settings</span>
          )}
        </div>
        <div className="flex flex-1 items-center justify-end p-1.5">
          <div className="bill-totals">
            <div className="bill-totals__row">
              <span>Total Amount</span>
              <span className="tabular-nums">{formatBillNumber(invoice.bill_amount)}</span>
            </div>
            <div className="bill-totals__row">
              <span>Paid Amount</span>
              <span className="tabular-nums">{formatBillNumber(invoice.paid_amount)}</span>
            </div>
            <div className="bill-totals__row">
              <span>Previous Pending</span>
              <span className="tabular-nums">{formatBillNumber(invoice.prev_balance)}</span>
            </div>
            <div className="bill-totals__row bill-totals__row--strong">
              <span>Total Unpaid Amount</span>
              <span className="tabular-nums">{formatBillNumber(invoice.balance_due)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      {shop.footer && (
        <div className="bill-slip__band px-2 py-1.5 text-center text-[11px] font-semibold">{shop.footer}</div>
      )}
    </div>
  );
}
