import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { shopProfile } from '../services/profile.js';
import { HttpError } from '../utils/http.js';
import { money } from '../utils/money.js';

interface InvoiceRow {
  id: number;
  invoice_no: string;
  invoice_date: string;
  buyer_id: number | null;
  buyer_name: string;
  buyer_phone: string | null;
  subtotal: number;
  discount: number;
  commission: number;
  gst: number;
  prev_balance: number;
  total_amount: number;
  paid_amount: number;
  balance_due: number;
  payment_mode: string;
  status: string;
  vehicle_no: string | null;
  notes: string | null;
}

function upiLink(upi: string, name: string, amount: number, note: string): string | null {
  if (!upi) return null;
  const params = new URLSearchParams({
    pa: upi,
    pn: name,
    am: amount.toFixed(2),
    cu: 'INR',
    tn: note,
  });
  return `upi://pay?${params.toString()}`;
}

export const invoicesRouter = Router();
invoicesRouter.use(requireAuth);

invoicesRouter.get('/', (req, res) => {
  const limit = Math.min(300, Math.max(1, Number(req.query.limit ?? 100)));
  const items = getDb()
    .prepare(
      `SELECT id, invoice_no, invoice_date, buyer_name, total_amount, paid_amount, balance_due, payment_mode, status
         FROM sales_invoices
        ORDER BY invoice_date DESC, id DESC
        LIMIT ?`,
    )
    .all(limit) as Array<Record<string, unknown>>;

  res.json({
    success: true,
    items: items.map((row) => ({
      ...row,
      total_amount: money(row.total_amount),
      paid_amount: money(row.paid_amount),
      balance_due: money(row.balance_due),
    })),
  });
});

invoicesRouter.get('/:invoiceNo', (req, res) => {
  const db = getDb();
  const invoice = db
    .prepare('SELECT * FROM sales_invoices WHERE invoice_no = ?')
    .get(req.params.invoiceNo) as InvoiceRow | undefined;
  if (!invoice) throw new HttpError(404, 'Invoice not found');

  const items = db
    .prepare(
      `SELECT commodity_name, unit, bags, weight, rate, amount
         FROM sales_items WHERE invoice_id = ? ORDER BY id`,
    )
    .all(invoice.id);

  const buyer = invoice.buyer_id
    ? db.prepare('SELECT id, code, name, phone, address, gstin FROM contacts WHERE id = ?').get(invoice.buyer_id)
    : null;

  // Most recent receipt from this customer, excluding the current bill's own receipt.
  const lastReceipt = invoice.buyer_id
    ? (db
        .prepare(
          `SELECT date, amount FROM payments
            WHERE party_id = ? AND type = 'receipt' AND (bill_ref IS NULL OR bill_ref != ?)
            ORDER BY date DESC, id DESC LIMIT 1`,
        )
        .get(invoice.buyer_id, invoice.invoice_no) as { date: string; amount: number } | undefined)
    : undefined;

  // The customer's most recent previous bill (for "Previous Bill No/Date").
  const previousBill = invoice.buyer_id
    ? (db
        .prepare(
          `SELECT invoice_no, invoice_date FROM sales_invoices
            WHERE buyer_id = ? AND id != ?
            ORDER BY invoice_date DESC, id DESC LIMIT 1`,
        )
        .get(invoice.buyer_id, invoice.id) as { invoice_no: string; invoice_date: string } | undefined)
    : undefined;

  const shop = shopProfile();
  const billAmount = money(invoice.total_amount);
  // Total payable on this bill = own charge + carried-forward balance.
  const totalDue = money(billAmount + invoice.prev_balance);
  const balanceDue = money(invoice.balance_due);
  // Top-up QR collects whatever is still outstanding.
  const upi = upiLink(shop.upi, shop.shop_name, balanceDue, invoice.invoice_no);

  res.json({
    success: true,
    invoice: {
      ...invoice,
      subtotal: money(invoice.subtotal),
      discount: money(invoice.discount),
      commission: money(invoice.commission),
      gst: money(invoice.gst),
      prev_balance: money(invoice.prev_balance),
      bill_amount: billAmount,
      total_amount: billAmount,
      total_due: totalDue,
      paid_amount: money(invoice.paid_amount),
      balance_due: balanceDue,
    },
    items,
    buyer,
    last_receipt: lastReceipt ? { date: lastReceipt.date, amount: money(lastReceipt.amount) } : null,
    previous_bill: previousBill
      ? { invoice_no: previousBill.invoice_no, invoice_date: previousBill.invoice_date }
      : null,
    shop,
    upi: { id: shop.upi, link: upi, amount: balanceDue },
    summary: {
      grand_total: totalDue,
      paid: money(invoice.paid_amount),
      due: balanceDue,
      status: invoice.status,
    },
  });
});
