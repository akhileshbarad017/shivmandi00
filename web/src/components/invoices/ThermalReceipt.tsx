import { QRCodeSVG } from 'qrcode.react';
import { MapPin, Phone } from 'lucide-react';
import { formatBillDate, formatBillNumber } from '@/lib/format';
import type { InvoiceDetail } from '@/lib/types';

/** 80mm thermal receipt. */
export function ThermalReceipt({ data }: { data: InvoiceDetail }) {
  const { shop, invoice } = data;
  const contacts = [
    { name: shop.contact1_name, phone: shop.contact1_phone },
    { name: shop.contact2_name, phone: [shop.contact2_phone, shop.contact2_phone2].filter(Boolean).join(' | ') },
  ].filter((contact) => contact.name || contact.phone);

  return (
    <div className="thermal-receipt">
      <div className="t-center t-bold t-shop">{shop.shop_name}</div>
      {shop.address && <div className="t-center">{shop.address}</div>}
      {shop.city && (
        <div className="t-center t-icon-line">
          <MapPin className="size-3" strokeWidth={2.5} /> {shop.city}
        </div>
      )}

      {contacts.length > 0 && (
        <div className="t-contacts">
          {contacts.map((contact, index) => (
            <div key={index} className="t-contact">
              <span className="t-contact__head">
                <Phone className="size-3 fill-current" /> {contact.name}
              </span>
              <span>{contact.phone}</span>
            </div>
          ))}
        </div>
      )}

      <div className="t-sep" />
      <div className="t-row">
        <span>Bill No</span>
        <span>: {invoice.invoice_no}</span>
      </div>
      <div className="t-row">
        <span>Bill Date</span>
        <span>: {formatBillDate(invoice.invoice_date)}</span>
      </div>
      <div className="t-row">
        <span>Customer</span>
        <span>: {data.buyer?.name ?? invoice.buyer_name}</span>
      </div>
      {data.buyer?.code && (
        <div className="t-row">
          <span>Customer ID</span>
          <span>: {data.buyer.code}</span>
        </div>
      )}

      <div className="t-sep" />
      <table className="t-table">
        <thead>
          <tr>
            <th>Item</th>
            <th className="r">Qty</th>
            <th className="r">Rate</th>
            <th className="r">Amt</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, index) => (
            <tr key={index}>
              <td>{item.commodity_name}</td>
              <td className="r">{formatBillNumber(item.weight)}</td>
              <td className="r">{formatBillNumber(item.rate)}</td>
              <td className="r">{formatBillNumber(item.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="t-sep" />
      <div className="t-row">
        <span>Bill Amount</span>
        <span>: {formatBillNumber(invoice.bill_amount)}</span>
      </div>
      <div className="t-row t-bold">
        <span>Total</span>
        <span>: {formatBillNumber(invoice.total_due)}</span>
      </div>
      <div className="t-row">
        <span>Paid</span>
        <span>: {formatBillNumber(invoice.paid_amount)}</span>
      </div>
      <div className="t-row t-bold">
        <span>Pending</span>
        <span>: {formatBillNumber(invoice.balance_due)}</span>
      </div>

      <div className="t-sep" />
      {data.upi.link && (
        <div className="t-center t-qr">
          <QRCodeSVG value={data.upi.link} size={120} />
        </div>
      )}
      {shop.footer && <div className="t-center t-footer">{shop.footer}</div>}
    </div>
  );
}
