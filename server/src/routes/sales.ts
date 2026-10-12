import { Router } from 'express';
import { z } from 'zod';
import type Database from 'libsql';
import { getDb } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { logActivity } from '../services/activity.js';
import { nextRef, peekRef } from '../services/numbering.js';
import { touchParty } from '../services/parties.js';
import { getNumberSetting } from '../services/settings.js';
import { todayISO } from '../utils/date.js';
import { HttpError } from '../utils/http.js';
import { money, round2 } from '../utils/money.js';

interface CommodityRow {
  id: number;
  name: string;
  default_rate: number;
  rate_20kg: number;
}

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
  cess: number;
  gst: number;
  prev_balance: number;
  total_amount: number;
  paid_amount: number;
  balance_due: number;
  payment_mode: string;
  status: string;
  vehicle_no: string | null;
  notes: string | null;
  created_at: string;
}

const itemSchema = z.object({
  product_id: z.coerce.number().int().positive('Choose a product'),
  unit: z.enum(['KG', 'CRATE20']).default('KG'),
  qty: z.coerce.number().positive('Quantity must be greater than zero'),
  rate: z.coerce.number().min(0).default(0),
  bags: z.coerce.number().min(0).default(0),
});

const createSchema = z.object({
  party_id: z.coerce.number().int().positive().optional(),
  buyer_name: z.string().trim().max(120).optional().default(''),
  buyer_phone: z.string().trim().max(20).optional().default(''),
  date: z.string().trim().optional(),
  vehicle_no: z.string().trim().max(20).optional().default(''),
  payment_type: z.enum(['Cash', 'Credit', 'UPI', 'Bank']).default('Credit'),
  channel: z.enum(['counter', 'pos']).default('counter'),
  discount: z.coerce.number().min(0).default(0),
  paid: z.coerce.number().min(0).optional(),
  notes: z.string().trim().max(300).optional().default(''),
  items: z.array(itemSchema).min(1, 'Add at least one item'),
});

const returnSchema = z.object({
  invoice_no: z.string().trim().max(40).optional().default(''),
  party_id: z.coerce.number().int().positive().optional(),
  buyer_name: z.string().trim().max(120).optional().default(''),
  date: z.string().trim().optional(),
  reason: z.string().trim().max(200).optional().default(''),
  items: z.array(itemSchema).min(1, 'Add at least one item'),
});

function statusFor(due: number, paid: number): 'PAID' | 'PARTIAL' | 'PENDING' {
  if (due <= 0.005) return 'PAID';
  return paid > 0 ? 'PARTIAL' : 'PENDING';
}

export const salesRouter = Router();
salesRouter.use(requireAuth);

salesRouter.get('/next', (_req, res) => {
  res.json({ success: true, invoice_no: peekRef('sales_invoice') });
});

/** The customer's most recent bill (for "Repeat last bill"). */
salesRouter.get('/last', (req, res) => {
  const partyId = Number(req.query.party_id);
  if (!Number.isInteger(partyId) || partyId <= 0) throw new HttpError(400, 'Invalid customer');
  const db = getDb();
  const invoice = db
    .prepare(
      'SELECT id, invoice_no, invoice_date, payment_mode FROM sales_invoices WHERE buyer_id = ? ORDER BY invoice_date DESC, id DESC LIMIT 1',
    )
    .get(partyId) as { id: number; invoice_no: string; invoice_date: string; payment_mode: string } | undefined;

  if (!invoice) {
    res.json({ success: true, invoice: null, items: [] });
    return;
  }

  const items = (
    db
      .prepare(
        'SELECT commodity_id, commodity_name, unit, weight, rate FROM sales_items WHERE invoice_id = ? ORDER BY id',
      )
      .all(invoice.id) as Array<{
      commodity_id: number | null;
      commodity_name: string;
      unit: string;
      weight: number;
      rate: number;
    }>
  ).map((row) => ({
    product_id: row.commodity_id,
    commodity_name: row.commodity_name,
    unit: row.unit,
    qty: row.unit === 'CRATE20' ? round2(row.weight / 20) : row.weight,
    rate: money(row.rate),
  }));

  res.json({ success: true, invoice, items });
});

salesRouter.get('/credit', (_req, res) => {
  // Base the ageing on the live buyer khata so digitised opening balances show up.
  const rows = getDb()
    .prepare(
      `SELECT c.id                          AS buyer_id,
              c.name                        AS buyer_name,
              c.balance                     AS due,
              COALESCE(SUM(s.total_amount), 0) AS billed,
              COALESCE(SUM(s.paid_amount), 0)  AS paid,
              COUNT(s.id)                   AS bills,
              MAX(s.invoice_date)           AS last_date,
              MIN(s.invoice_date)           AS oldest_date
         FROM contacts c
         LEFT JOIN sales_invoices s ON s.buyer_id = c.id AND s.status != 'CANCELLED'
        WHERE c.type = 'buyer' AND c.status = 'ACTIVE' AND c.balance > 0.005
        GROUP BY c.id
        ORDER BY due DESC`,
    )
    .all() as Array<{
    buyer_id: number;
    buyer_name: string;
    due: number;
    billed: number;
    paid: number;
    bills: number;
    last_date: string | null;
    oldest_date: string | null;
  }>;

  const today = Date.now();
  const items = rows.map((row) => ({
    buyer_id: row.buyer_id,
    buyer_name: row.buyer_name,
    due: money(row.due),
    billed: money(row.billed),
    paid: money(row.paid),
    bills: row.bills,
    last_date: row.last_date,
    oldest_date: row.oldest_date,
    age_days: row.oldest_date
      ? Math.max(0, Math.round((today - new Date(row.oldest_date).getTime()) / 86_400_000))
      : 0,
  }));

  res.json({
    success: true,
    items,
    summary: {
      customers: items.length,
      outstanding: round2(items.reduce((sum, row) => sum + row.due, 0)),
    },
  });
});

salesRouter.get('/returns', (_req, res) => {
  const items = getDb()
    .prepare('SELECT * FROM sales_returns ORDER BY return_date DESC, id DESC LIMIT 200')
    .all();
  res.json({ success: true, items });
});

salesRouter.post('/returns', (req, res) => {
  const data = returnSchema.parse(req.body ?? {});
  const db = getDb();
  const date = data.date ?? todayISO();

  let buyerId = data.party_id ?? null;
  let buyerName = data.buyer_name;

  if (data.invoice_no) {
    const invoice = db
      .prepare('SELECT id, buyer_id, buyer_name FROM sales_invoices WHERE invoice_no = ?')
      .get(data.invoice_no) as { id: number; buyer_id: number | null; buyer_name: string } | undefined;
    if (!invoice) throw new HttpError(404, 'Invoice not found');
    buyerId = invoice.buyer_id;
    buyerName = invoice.buyer_name;
  }
  if (!buyerName) buyerName = 'Walk-in customer';

  const prepared = data.items.map((item) => {
    const commodity = db
      .prepare('SELECT id, name, default_rate, rate_20kg FROM commodities WHERE id = ?')
      .get(item.product_id) as CommodityRow | undefined;
    if (!commodity) throw new HttpError(400, 'Product not found');
    const rate = item.rate > 0 ? item.rate : item.unit === 'CRATE20' ? commodity.rate_20kg : commodity.default_rate;
    const weight = item.unit === 'CRATE20' ? item.qty * 20 : item.qty;
    return {
      commodity,
      unit: item.unit,
      weight,
      rate: money(rate),
      amount: money(item.qty * rate),
    };
  });

  const amount = round2(prepared.reduce((sum, item) => sum + item.amount, 0));

  const returnNo = db.transaction(() => {
    const no = nextRef('sales_return');
    const insert = db
      .prepare(
        `INSERT INTO sales_returns (return_no, return_date, invoice_no, buyer_id, buyer_name, amount, reason, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(no, date, data.invoice_no, buyerId, buyerName, amount, data.reason, req.user?.name ?? null);
    const returnId = Number(insert.lastInsertRowid);

    const insItem = db.prepare(
      `INSERT INTO sales_return_items (return_id, commodity_id, commodity_name, unit, weight, rate, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const item of prepared) {
      insItem.run(returnId, item.commodity.id, item.commodity.name, item.unit, item.weight, item.rate, item.amount);
    }

    if (buyerId) {
      const buyer = db.prepare('SELECT balance FROM contacts WHERE id = ?').get(buyerId) as
        | { balance: number }
        | undefined;
      if (buyer) {
        db.prepare("UPDATE contacts SET balance = ?, updated_at = datetime('now') WHERE id = ?").run(
          round2(Math.max(0, buyer.balance - amount)),
          buyerId,
        );
      }
    }
    return no;
  })();

  logActivity(req.user?.name ?? null, 'sale.return', `${returnNo} · ${buyerName}`, amount);
  res.status(201).json({ success: true, return_no: returnNo, amount, message: 'Return recorded' });
});

salesRouter.get('/', (req, res) => {
  const where: string[] = [];
  const args: unknown[] = [];

  if (req.query.from) {
    where.push('s.invoice_date >= ?');
    args.push(String(req.query.from));
  }
  if (req.query.to) {
    where.push('s.invoice_date <= ?');
    args.push(String(req.query.to));
  }
  if (req.query.buyer_id) {
    where.push('s.buyer_id = ?');
    args.push(Number(req.query.buyer_id));
  }
  if (req.query.vehicle_no) {
    where.push('s.vehicle_no = ?');
    args.push(String(req.query.vehicle_no));
  }
  if (req.query.q) {
    where.push('(s.invoice_no LIKE ? OR s.buyer_name LIKE ?)');
    args.push(`%${req.query.q}%`, `%${req.query.q}%`);
  }

  const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 200)));
  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const rows = getDb()
    .prepare(
      `SELECT s.*,
              (SELECT COUNT(*) FROM sales_items i WHERE i.invoice_id = s.id) AS items,
              (SELECT COALESCE(SUM(weight), 0) FROM sales_items i WHERE i.invoice_id = s.id) AS weight
         FROM sales_invoices s ${clause}
        ORDER BY s.invoice_date DESC, s.id DESC
        LIMIT ?`,
    )
    .all(...args, limit) as Array<InvoiceRow & { items: number; weight: number }>;

  const items = rows.map((row) => ({
    ...row,
    subtotal: money(row.subtotal),
    discount: money(row.discount),
    commission: money(row.commission),
    gst: money(row.gst),
    prev_balance: money(row.prev_balance),
    total_amount: money(row.total_amount),
    paid_amount: money(row.paid_amount),
    balance_due: money(row.balance_due),
    weight: round2(row.weight),
  }));

  const statusFilter = req.query.status ? String(req.query.status) : '';
  const filtered = statusFilter ? items.filter((row) => row.status === statusFilter) : items;

  res.json({
    success: true,
    items: filtered,
    summary: {
      bills: filtered.length,
      total: round2(filtered.reduce((sum, row) => sum + row.total_amount, 0)),
      paid: round2(filtered.reduce((sum, row) => sum + row.paid_amount, 0)),
      due: round2(filtered.reduce((sum, row) => sum + row.balance_due, 0)),
      weight: round2(filtered.reduce((sum, row) => sum + row.weight, 0)),
    },
  });
});

salesRouter.get('/:invoiceNo', (req, res) => {
  const db = getDb();
  const invoice = db
    .prepare('SELECT * FROM sales_invoices WHERE invoice_no = ?')
    .get(req.params.invoiceNo) as InvoiceRow | undefined;
  if (!invoice) throw new HttpError(404, 'Invoice not found');

  const items = db
    .prepare(
      `SELECT id, commodity_id, commodity_name, lot_no, unit, bags, weight, rate, amount
         FROM sales_items WHERE invoice_id = ? ORDER BY id`,
    )
    .all(invoice.id);

  const buyer = invoice.buyer_id
    ? db.prepare('SELECT id, name, phone, address, gstin, balance FROM contacts WHERE id = ?').get(invoice.buyer_id)
    : null;

  const payments = db
    .prepare(
      `SELECT id, voucher_no, date, mode, amount FROM payments
        WHERE bill_ref = ? AND type = 'receipt' ORDER BY date, id`,
    )
    .all(invoice.invoice_no);

  res.json({ success: true, invoice, items, buyer, payments });
});

interface SaleInput {
  party_id?: number;
  buyer_name?: string;
  buyer_phone?: string;
  vehicle_no?: string;
  payment_type: string;
  channel?: 'counter' | 'pos';
  discount?: number;
  paid?: number;
  notes?: string;
  items: Array<{ product_id: number; unit: 'KG' | 'CRATE20'; qty: number; rate: number; bags?: number }>;
}

interface PersistedSale {
  invoice_no: string;
  invoice_id: number;
  subtotal: number;
  discount: number;
  gst: number;
  prev_balance: number;
  total_amount: number;
  paid_amount: number;
  balance_due: number;
  status: string;
  buyer_id: number | null;
  buyer_name: string;
}

/** Create one sale. Must be called inside a transaction. */
function persistSale(
  db: Database.Database,
  data: SaleInput,
  actor: string | null,
  date: string,
): PersistedSale {
  let buyerId: number | null = null;
  let buyerName = (data.buyer_name ?? '').trim();
  let buyerPhone = data.buyer_phone ?? '';
  let prevBalance = 0;

  if (data.party_id) {
    const buyer = db
      .prepare('SELECT id, name, phone, balance FROM contacts WHERE id = ? AND status = ?')
      .get(data.party_id, 'ACTIVE') as
      | { id: number; name: string; phone: string | null; balance: number }
      | undefined;
    if (!buyer) throw new HttpError(400, 'Buyer not found');
    buyerId = buyer.id;
    buyerName = buyer.name;
    buyerPhone = buyer.phone ?? buyerPhone;
    prevBalance = money(buyer.balance);
  }
  if (!buyerName) buyerName = 'Walk-in customer';

  const prepared = data.items.map((item) => {
    const commodity = db
      .prepare('SELECT id, name, default_rate, rate_20kg FROM commodities WHERE id = ?')
      .get(item.product_id) as CommodityRow | undefined;
    if (!commodity) throw new HttpError(400, 'Product not found');
    const rate = item.rate > 0 ? item.rate : item.unit === 'CRATE20' ? commodity.rate_20kg : commodity.default_rate;
    const weight = item.unit === 'CRATE20' ? item.qty * 20 : item.qty;
    return {
      commodity,
      unit: item.unit,
      bags: item.bags ?? 0,
      weight,
      rate: money(rate),
      amount: money(item.qty * rate),
    };
  });

  const subtotal = round2(prepared.reduce((sum, item) => sum + item.amount, 0));
  const discount = money(data.discount ?? 0);
  const gst = money((subtotal * getNumberSetting('gst_percent', 0)) / 100);
  // This bill's own charge; the previous balance is tracked separately so it is
  // never double-counted as revenue or in the khata statement.
  const total = round2(subtotal - discount + gst);
  const totalDue = round2(total + prevBalance);
  const rawPaid = data.paid ?? (data.payment_type === 'Credit' ? 0 : totalDue);
  const paid = money(Math.min(Math.max(0, rawPaid), totalDue));
  const due = round2(Math.max(0, totalDue - paid));
  const status = statusFor(due, paid);

  const no = data.channel === 'pos' ? nextRef('pos') : nextRef('sales_invoice');
  const insert = db
    .prepare(
      `INSERT INTO sales_invoices
         (invoice_no, invoice_date, buyer_id, buyer_name, buyer_phone, subtotal, discount, commission, cess, gst,
          prev_balance, total_amount, paid_amount, balance_due, payment_mode, status, vehicle_no, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      no,
      date,
      buyerId,
      buyerName,
      buyerPhone,
      subtotal,
      discount,
      0,
      0,
      gst,
      prevBalance,
      total,
      paid,
      due,
      data.payment_type,
      status,
      data.vehicle_no ?? '',
      data.notes ?? '',
      actor,
    );
  const invoiceId = Number(insert.lastInsertRowid);

  const insItem = db.prepare(
    `INSERT INTO sales_items (invoice_id, commodity_id, commodity_name, lot_no, unit, bags, weight, rate, amount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const item of prepared) {
    insItem.run(invoiceId, item.commodity.id, item.commodity.name, null, item.unit, item.bags, item.weight, item.rate, item.amount);
  }

  if (paid > 0) {
    db.prepare(
      `INSERT INTO payments (voucher_no, date, party_id, party_name, type, mode, amount, status, bill_ref, created_by)
       VALUES (?, ?, ?, ?, 'receipt', ?, ?, 'COMPLETED', ?, ?)`,
    ).run(
      nextRef('receipt'),
      date,
      buyerId,
      buyerName,
      data.payment_type === 'Credit' ? 'Cash' : data.payment_type,
      paid,
      no,
      actor,
    );
  }

  if (buyerId) {
    db.prepare("UPDATE contacts SET balance = ?, updated_at = datetime('now') WHERE id = ?").run(due, buyerId);
    touchParty(buyerId, db);
  }

  return {
    invoice_no: no,
    invoice_id: invoiceId,
    subtotal,
    discount,
    gst,
    prev_balance: prevBalance,
    total_amount: total,
    paid_amount: paid,
    balance_due: due,
    status,
    buyer_id: buyerId,
    buyer_name: buyerName,
  };
}

salesRouter.post('/', (req, res) => {
  const data = createSchema.parse(req.body ?? {});
  const db = getDb();
  const date = data.date ?? todayISO();
  const actor = req.user?.name ?? null;

  const result = db.transaction(() => persistSale(db, data, actor, date))();
  logActivity(actor, 'sale.create', `${result.invoice_no} · ${result.buyer_name}`, result.total_amount);

  res.status(201).json({ success: true, ...result, message: 'Sale saved' });
});

const bulkCustomerSchema = z.object({
  party_id: z.coerce.number().int().positive('Choose a customer'),
  paid: z.coerce.number().min(0).optional(),
  payment_type: z.enum(['Cash', 'Credit', 'UPI', 'Bank']).optional(),
  items: z.array(itemSchema).min(1, 'Add at least one item'),
});

const bulkSchema = z.object({
  idempotency_key: z.string().trim().min(6, 'Missing idempotency key'),
  date: z.string().trim().optional(),
  payment_type: z.enum(['Cash', 'Credit', 'UPI', 'Bank']).default('Cash'),
  notes: z.string().trim().max(300).optional().default(''),
  customers: z.array(bulkCustomerSchema).min(1, 'Select at least one customer'),
});

/** Generate one separate bill per customer in a single transaction. */
salesRouter.post('/bulk', (req, res) => {
  const data = bulkSchema.parse(req.body ?? {});
  const db = getDb();
  const actor = req.user?.name ?? null;

  const existing = db
    .prepare('SELECT * FROM bulk_batches WHERE id = ?')
    .get(data.idempotency_key) as
    | { invoices_json: string; bill_count: number; total_sales: number; total_paid: number; total_pending: number }
    | undefined;

  if (existing) {
    res.json({
      success: true,
      duplicate: true,
      invoices: JSON.parse(existing.invoices_json),
      summary: {
        bills: existing.bill_count,
        total_sales: money(existing.total_sales),
        total_paid: money(existing.total_paid),
        total_pending: money(existing.total_pending),
      },
    });
    return;
  }

  const date = data.date ?? todayISO();

  const result = db.transaction(() => {
    const invoices: Array<Record<string, unknown>> = [];
    let totalSales = 0;
    let totalPaid = 0;
    let totalPending = 0;

    for (const customer of data.customers) {
      const sale = persistSale(
        db,
        {
          party_id: customer.party_id,
          payment_type: customer.payment_type ?? data.payment_type,
          paid: customer.paid,
          notes: data.notes,
          items: customer.items,
        },
        actor,
        date,
      );
      totalSales = round2(totalSales + sale.total_amount);
      totalPaid = round2(totalPaid + sale.paid_amount);
      totalPending = round2(totalPending + sale.balance_due);
      invoices.push({
        invoice_no: sale.invoice_no,
        party_id: sale.buyer_id,
        customer: sale.buyer_name,
        total: sale.total_amount,
        paid: sale.paid_amount,
        pending: sale.balance_due,
        status: sale.status,
      });
    }

    db.prepare(
      `INSERT INTO bulk_batches (id, invoices_json, bill_count, total_sales, total_paid, total_pending, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(data.idempotency_key, JSON.stringify(invoices), invoices.length, totalSales, totalPaid, totalPending, actor);

    return { invoices, totalSales, totalPaid, totalPending };
  })();

  logActivity(actor, 'sale.bulk', `${result.invoices.length} bills`, result.totalSales);

  res.status(201).json({
    success: true,
    invoices: result.invoices,
    summary: {
      bills: result.invoices.length,
      total_sales: result.totalSales,
      total_paid: result.totalPaid,
      total_pending: result.totalPending,
    },
  });
});

const billPaymentSchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  mode: z.enum(['Cash', 'Bank', 'UPI', 'Cheque']).default('Cash'),
  date: z.string().trim().optional(),
  notes: z.string().trim().max(300).optional().default(''),
});

/** Record a payment against a specific bill (updates the invoice + ledger). */
salesRouter.post('/:invoiceNo/payment', (req, res) => {
  const db = getDb();
  const invoice = db
    .prepare('SELECT * FROM sales_invoices WHERE invoice_no = ?')
    .get(req.params.invoiceNo) as InvoiceRow | undefined;
  if (!invoice) throw new HttpError(404, 'Invoice not found');

  const data = billPaymentSchema.parse(req.body ?? {});
  const date = data.date ?? todayISO();

  const result = db.transaction(() => {
    db.prepare(
      `INSERT INTO payments (voucher_no, date, party_id, party_name, type, mode, amount, status, bill_ref, notes, created_by)
       VALUES (?, ?, ?, ?, 'receipt', ?, ?, 'COMPLETED', ?, ?, ?)`,
    ).run(
      nextRef('receipt'),
      date,
      invoice.buyer_id,
      invoice.buyer_name,
      data.mode,
      data.amount,
      invoice.invoice_no,
      data.notes,
      req.user?.name ?? null,
    );

    const totalDue = round2(invoice.total_amount + invoice.prev_balance);
    const paid = round2(invoice.paid_amount + data.amount);
    const due = round2(Math.max(0, totalDue - paid));
    const status = statusFor(due, paid);
    db.prepare("UPDATE sales_invoices SET paid_amount = ?, balance_due = ?, status = ?, updated_at = datetime('now') WHERE id = ?").run(
      paid,
      due,
      status,
      invoice.id,
    );

    if (invoice.buyer_id) {
      const buyer = db.prepare('SELECT balance FROM contacts WHERE id = ?').get(invoice.buyer_id) as
        | { balance: number }
        | undefined;
      if (buyer) {
        db.prepare("UPDATE contacts SET balance = ?, updated_at = datetime('now') WHERE id = ?").run(
          round2(Math.max(0, buyer.balance - data.amount)),
          invoice.buyer_id,
        );
      }
      touchParty(invoice.buyer_id, db);
    }

    return { paid, due, status };
  })();

  logActivity(req.user?.name ?? null, 'sale.payment', invoice.invoice_no, data.amount);
  res.status(201).json({ success: true, ...result, message: 'Payment recorded' });
});

salesRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid invoice id');
  const db = getDb();
  const invoice = db.prepare('SELECT * FROM sales_invoices WHERE id = ?').get(id) as InvoiceRow | undefined;
  if (!invoice) throw new HttpError(404, 'Invoice not found');

  db.transaction(() => {
    db.prepare('DELETE FROM sales_items WHERE invoice_id = ?').run(id);
    db.prepare('DELETE FROM payments WHERE bill_ref = ?').run(invoice.invoice_no);
    db.prepare('DELETE FROM sales_invoices WHERE id = ?').run(id);

    if (invoice.buyer_id) {
      // Remove exactly what this bill added to the khata (bill charge minus paid).
      const reversal = round2(invoice.total_amount - invoice.paid_amount);
      const buyer = db.prepare('SELECT balance FROM contacts WHERE id = ?').get(invoice.buyer_id) as
        | { balance: number }
        | undefined;
      if (buyer) {
        db.prepare("UPDATE contacts SET balance = ?, updated_at = datetime('now') WHERE id = ?").run(
          round2(Math.max(0, buyer.balance - reversal)),
          invoice.buyer_id,
        );
      }
    }
  })();

  logActivity(req.user?.name ?? null, 'sale.delete', invoice.invoice_no);
  res.json({ success: true, message: 'Invoice deleted' });
});
