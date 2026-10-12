import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { logActivity } from '../services/activity.js';
import { nextRef, peekRef } from '../services/numbering.js';
import { touchParty } from '../services/parties.js';
import { shopProfile } from '../services/profile.js';
import { todayISO } from '../utils/date.js';
import { HttpError } from '../utils/http.js';
import { money, round2 } from '../utils/money.js';

interface CommodityRow {
  id: number;
  name: string;
  default_rate: number;
  rate_20kg: number;
}

interface PurchaseRow {
  id: number;
  bill_no: string;
  date: string;
  supplier_id: number | null;
  supplier_name: string;
  vehicle_no: string | null;
  driver_name: string | null;
  village: string | null;
  goods_amount: number;
  expenses_amount: number;
  commission_percent: number;
  commission_amount: number;
  net_amount: number;
  paid_amount: number;
  balance_due: number;
  payment_mode: string;
  notes: string | null;
  created_at: string;
}

const itemSchema = z.object({
  product_id: z.coerce.number().int().positive('Choose a product'),
  unit: z.enum(['KG', 'CRATE20']).default('KG'),
  weight: z.coerce.number().positive('Weight must be greater than zero'),
  rate: z.coerce.number().min(0).default(0),
});

const createSchema = z.object({
  supplier_id: z.coerce.number().int().positive('Choose a supplier'),
  date: z.string().trim().optional(),
  vehicle_no: z.string().trim().max(20).optional().default(''),
  driver_name: z.string().trim().max(80).optional().default(''),
  village: z.string().trim().max(120).optional().default(''),
  notes: z.string().trim().max(300).optional().default(''),
  payment_mode: z.enum(['Cash', 'Bank', 'UPI', 'Cheque']).default('Cash'),
  commission_percent: z.coerce.number().min(0).max(100).default(0),
  paid: z.coerce.number().min(0).default(0),
  items: z.array(itemSchema).min(1, 'Add at least one item'),
});

const paySchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  mode: z.enum(['Cash', 'Bank', 'UPI', 'Cheque']).default('Cash'),
  date: z.string().trim().optional(),
  notes: z.string().trim().max(300).optional().default(''),
});

function lineAmount(unit: string, weight: number, rate: number): number {
  return unit === 'CRATE20' ? money((weight / 20) * rate) : money(weight * rate);
}

function findPurchase(billNo: string): PurchaseRow {
  const row = getDb().prepare('SELECT * FROM purchases WHERE bill_no = ?').get(billNo) as
    | PurchaseRow
    | undefined;
  if (!row) throw new HttpError(404, 'Purchase bill not found');
  return row;
}

export const purchasesRouter = Router();
purchasesRouter.use(requireAuth);

purchasesRouter.get('/next', (_req, res) => {
  res.json({ success: true, bill_no: peekRef('purchase') });
});

purchasesRouter.get('/', (req, res) => {
  const db = getDb();
  const where: string[] = [];
  const args: unknown[] = [];

  if (req.query.from) {
    where.push('p.date >= ?');
    args.push(String(req.query.from));
  }
  if (req.query.to) {
    where.push('p.date <= ?');
    args.push(String(req.query.to));
  }
  if (req.query.supplier_id) {
    where.push('p.supplier_id = ?');
    args.push(Number(req.query.supplier_id));
  }
  if (req.query.vehicle_no) {
    where.push('p.vehicle_no = ?');
    args.push(String(req.query.vehicle_no));
  }
  if (req.query.q) {
    where.push('(p.bill_no LIKE ? OR p.supplier_name LIKE ?)');
    args.push(`%${req.query.q}%`, `%${req.query.q}%`);
  }

  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT p.*, (SELECT COUNT(*) FROM purchase_items i WHERE i.purchase_id = p.id) AS items
         FROM purchases p ${clause}
        ORDER BY p.date DESC, p.id DESC
        LIMIT 500`,
    )
    .all(...args) as Array<PurchaseRow & { items: number }>;

  const items = rows.map((row) => {
    const due = money(row.balance_due);
    const paid = money(row.paid_amount);
    return {
      id: row.id,
      bill_no: row.bill_no,
      date: row.date,
      supplier_id: row.supplier_id,
      supplier_name: row.supplier_name,
      vehicle_no: row.vehicle_no,
      goods_amount: money(row.goods_amount),
      expenses_amount: money(row.expenses_amount),
      net_amount: money(row.net_amount),
      paid_amount: paid,
      balance_due: due,
      payment_mode: row.payment_mode,
      items: row.items,
      status: due <= 0.005 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID',
    };
  });

  const statusFilter = req.query.status ? String(req.query.status) : '';
  const filtered = statusFilter ? items.filter((row) => row.status === statusFilter) : items;

  const summary = {
    bills: filtered.length,
    goods: round2(filtered.reduce((sum, row) => sum + row.goods_amount, 0)),
    expenses: round2(filtered.reduce((sum, row) => sum + row.expenses_amount, 0)),
    net: round2(filtered.reduce((sum, row) => sum + row.net_amount, 0)),
    paid: round2(filtered.reduce((sum, row) => sum + row.paid_amount, 0)),
    due: round2(filtered.reduce((sum, row) => sum + row.balance_due, 0)),
  };

  res.json({ success: true, items: filtered, summary });
});

purchasesRouter.get('/:billNo', (req, res) => {
  const db = getDb();
  const billNo = req.params.billNo;
  const purchase = findPurchase(billNo);

  const items = db
    .prepare(
      `SELECT id, commodity_id, commodity_name, unit, weight, rate, amount
         FROM purchase_items WHERE purchase_id = ? ORDER BY id`,
    )
    .all(purchase.id);

  const payments = db
    .prepare(
      `SELECT id, voucher_no, date, mode, amount, notes FROM payments
        WHERE bill_ref = ? AND type = 'payment' ORDER BY date, id`,
    )
    .all(billNo);

  const supplier = purchase.supplier_id
    ? db.prepare('SELECT id, name, phone, balance FROM contacts WHERE id = ?').get(purchase.supplier_id)
    : null;

  res.json({
    success: true,
    bill: {
      ...purchase,
      goods_amount: money(purchase.goods_amount),
      commission_percent: Number(purchase.commission_percent ?? 0),
      commission_amount: money(purchase.commission_amount),
      net_amount: money(purchase.net_amount),
      paid_amount: money(purchase.paid_amount),
      balance_due: money(purchase.balance_due),
    },
    items,
    payments,
    supplier,
    shop: shopProfile(),
  });
});

purchasesRouter.post('/', (req, res) => {
  const data = createSchema.parse(req.body ?? {});
  const db = getDb();
  const date = data.date ?? todayISO();

  const supplier = db
    .prepare('SELECT id, name, balance FROM contacts WHERE id = ?')
    .get(data.supplier_id) as { id: number; name: string; balance: number } | undefined;
  if (!supplier) throw new HttpError(400, 'Supplier not found');

  const prepared = data.items.map((item) => {
    const commodity = db
      .prepare('SELECT id, name, default_rate, rate_20kg FROM commodities WHERE id = ?')
      .get(item.product_id) as CommodityRow | undefined;
    if (!commodity) throw new HttpError(400, 'Product not found');
    const rate = item.rate > 0 ? item.rate : item.unit === 'CRATE20' ? commodity.rate_20kg : commodity.default_rate;
    return {
      commodity,
      unit: item.unit,
      weight: item.weight,
      rate: money(rate),
      amount: lineAmount(item.unit, item.weight, rate),
    };
  });

  const goodsAmount = round2(prepared.reduce((sum, item) => sum + item.amount, 0));
  // Commission is entered by the user and deducted from the payable.
  const commissionPercent = money(data.commission_percent);
  const commissionAmount = round2((goodsAmount * commissionPercent) / 100);
  const netAmount = round2(goodsAmount - commissionAmount);
  const paid = money(data.paid);
  const due = round2(Math.max(0, netAmount - paid));

  const result = db.transaction(() => {
    const billNo = nextRef('purchase');
    const insert = db
      .prepare(
        `INSERT INTO purchases
           (bill_no, date, supplier_id, supplier_name, vehicle_no, driver_name, village,
            goods_amount, expenses_amount, commission_percent, commission_amount, net_amount,
            paid_amount, balance_due, payment_mode, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        billNo,
        date,
        supplier.id,
        supplier.name,
        data.vehicle_no,
        data.driver_name,
        data.village,
        goodsAmount,
        commissionPercent,
        commissionAmount,
        netAmount,
        paid,
        due,
        data.payment_mode,
        data.notes,
        req.user?.name ?? null,
      );
    const purchaseId = Number(insert.lastInsertRowid);

    const insItem = db.prepare(
      `INSERT INTO purchase_items (purchase_id, commodity_id, commodity_name, unit, weight, rate, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const item of prepared) {
      insItem.run(
        purchaseId,
        item.commodity.id,
        item.commodity.name,
        item.unit,
        item.weight,
        item.rate,
        item.amount,
      );
    }

    if (paid > 0) {
      db.prepare(
        `INSERT INTO payments (voucher_no, date, party_id, party_name, type, mode, amount, status, bill_ref, created_by)
         VALUES (?, ?, ?, ?, 'payment', ?, ?, 'COMPLETED', ?, ?)`,
      ).run(
        nextRef('payment'),
        date,
        supplier.id,
        supplier.name,
        data.payment_mode,
        paid,
        billNo,
        req.user?.name ?? null,
      );
    }

    if (due > 0) {
      const next = round2(supplier.balance + due);
      db.prepare("UPDATE contacts SET balance = ?, updated_at = datetime('now') WHERE id = ?").run(
        next,
        supplier.id,
      );
    }
    touchParty(supplier.id, db);

    return billNo;
  });

  const billNo = result();
  logActivity(req.user?.name ?? null, 'purchase.create', `${billNo} · ${supplier.name}`, netAmount);

  res.status(201).json({
    success: true,
    bill_no: billNo,
    goods_amount: goodsAmount,
    commission_percent: commissionPercent,
    commission_amount: commissionAmount,
    net_amount: netAmount,
    paid,
    balance_due: due,
    message: 'Purchase saved',
  });
});

purchasesRouter.post('/:billNo/pay', (req, res) => {
  const billNo = req.params.billNo;
  const purchase = findPurchase(billNo);
  const data = paySchema.parse(req.body ?? {});
  const date = data.date ?? todayISO();
  const db = getDb();

  const result = db.transaction(() => {
    const voucherNo = nextRef('payment');
    db.prepare(
      `INSERT INTO payments (voucher_no, date, party_id, party_name, type, mode, amount, status, bill_ref, notes, created_by)
       VALUES (?, ?, ?, ?, 'payment', ?, ?, 'COMPLETED', ?, ?, ?)`,
    ).run(
      voucherNo,
      date,
      purchase.supplier_id,
      purchase.supplier_name,
      data.mode,
      data.amount,
      billNo,
      data.notes,
      req.user?.name ?? null,
    );

    const paid = round2(purchase.paid_amount + data.amount);
    const due = round2(Math.max(0, purchase.net_amount - paid));
    db.prepare('UPDATE purchases SET paid_amount = ?, balance_due = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
      paid,
      due,
      purchase.id,
    );

    if (purchase.supplier_id) {
      const supplier = db
        .prepare('SELECT balance FROM contacts WHERE id = ?')
        .get(purchase.supplier_id) as { balance: number } | undefined;
      if (supplier) {
        const next = round2(Math.max(0, supplier.balance - data.amount));
        db.prepare("UPDATE contacts SET balance = ?, updated_at = datetime('now') WHERE id = ?").run(
          next,
          purchase.supplier_id,
        );
      }
    }

    return { voucherNo, paid, due };
  });

  const { voucherNo, paid, due } = result();
  logActivity(req.user?.name ?? null, 'purchase.pay', `${billNo}`, data.amount);

  res.status(201).json({
    success: true,
    voucher_no: voucherNo,
    paid,
    due,
    message: 'Payment recorded',
  });
});

purchasesRouter.delete('/:billNo/payments/:id', (req, res) => {
  const billNo = req.params.billNo;
  const purchase = findPurchase(billNo);
  const paymentId = Number(req.params.id);
  const db = getDb();

  const payment = db
    .prepare("SELECT id, amount FROM payments WHERE id = ? AND bill_ref = ? AND type = 'payment'")
    .get(paymentId, billNo) as { id: number; amount: number } | undefined;
  if (!payment) throw new HttpError(404, 'Payment not found');

  db.transaction(() => {
    db.prepare('DELETE FROM payments WHERE id = ?').run(paymentId);
    const paid = round2(Math.max(0, purchase.paid_amount - payment.amount));
    const due = round2(Math.max(0, purchase.net_amount - paid));
    db.prepare('UPDATE purchases SET paid_amount = ?, balance_due = ? WHERE id = ?').run(paid, due, purchase.id);

    if (purchase.supplier_id) {
      const supplier = db
        .prepare('SELECT balance FROM contacts WHERE id = ?')
        .get(purchase.supplier_id) as { balance: number } | undefined;
      if (supplier) {
        db.prepare("UPDATE contacts SET balance = ?, updated_at = datetime('now') WHERE id = ?").run(
          round2(supplier.balance + payment.amount),
          purchase.supplier_id,
        );
      }
    }
  })();

  logActivity(req.user?.name ?? null, 'purchase.payment_delete', `${billNo}`);
  res.json({ success: true, message: 'Payment deleted' });
});

purchasesRouter.delete('/:billNo', (req, res) => {
  const billNo = req.params.billNo;
  const purchase = findPurchase(billNo);
  const db = getDb();

  db.transaction(() => {
    db.prepare('DELETE FROM purchase_items WHERE purchase_id = ?').run(purchase.id);
    db.prepare('DELETE FROM purchase_expenses WHERE purchase_id = ?').run(purchase.id);
    db.prepare('DELETE FROM payments WHERE bill_ref = ?').run(billNo);
    db.prepare('DELETE FROM purchases WHERE id = ?').run(purchase.id);

    if (purchase.supplier_id && purchase.balance_due > 0) {
      const supplier = db
        .prepare('SELECT balance FROM contacts WHERE id = ?')
        .get(purchase.supplier_id) as { balance: number } | undefined;
      if (supplier) {
        db.prepare("UPDATE contacts SET balance = ?, updated_at = datetime('now') WHERE id = ?").run(
          round2(Math.max(0, supplier.balance - purchase.balance_due)),
          purchase.supplier_id,
        );
      }
    }
  })();

  logActivity(req.user?.name ?? null, 'purchase.delete', billNo);
  res.json({ success: true, message: 'Purchase deleted' });
});
