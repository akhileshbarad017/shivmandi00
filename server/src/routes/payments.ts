import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { logActivity } from '../services/activity.js';
import { nextRef } from '../services/numbering.js';
import { todayISO } from '../utils/date.js';
import { HttpError } from '../utils/http.js';
import { money, round2 } from '../utils/money.js';

interface ContactRow {
  id: number;
  name: string;
  type: string;
  balance: number;
}

interface PaymentRow {
  id: number;
  voucher_no: string;
  date: string;
  party_id: number | null;
  party_name: string;
  type: string;
  mode: string;
  amount: number;
  status: string;
  bill_ref: string | null;
  notes: string | null;
  created_at: string;
}

const createSchema = z.object({
  type: z.enum(['receipt', 'payment']).default('receipt'),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  party_id: z.coerce.number().int().positive().optional(),
  party_name: z.string().trim().max(120).optional().default(''),
  mode: z.enum(['Cash', 'Bank', 'UPI', 'Cheque']).default('Cash'),
  date: z.string().trim().optional(),
  notes: z.string().trim().max(300).optional().default(''),
});

function balanceDelta(contactType: string, isReceipt: boolean, amount: number): number {
  const isBuyer = contactType === 'buyer';
  return isBuyer === isReceipt ? -amount : amount;
}

export const paymentsRouter = Router();
paymentsRouter.use(requireAuth);

paymentsRouter.get('/', (req, res) => {
  const db = getDb();
  const type = String(req.query.type ?? 'money');
  const where = ["type IN ('receipt', 'payment')"];
  const args: unknown[] = [];

  if (type === 'receipt' || type === 'payment') {
    where.push('type = ?');
    args.push(type);
  }
  if (req.query.from) {
    where.push('date >= ?');
    args.push(String(req.query.from));
  }
  if (req.query.to) {
    where.push('date <= ?');
    args.push(String(req.query.to));
  }
  if (req.query.q) {
    where.push('(party_name LIKE ? OR voucher_no LIKE ?)');
    args.push(`%${req.query.q}%`, `%${req.query.q}%`);
  }

  const items = db
    .prepare(
      `SELECT * FROM payments WHERE ${where.join(' AND ')}
        ORDER BY date DESC, id DESC LIMIT 300`,
    )
    .all(...args) as PaymentRow[];

  const inflow = round2(items.filter((row) => row.type === 'receipt').reduce((sum, row) => sum + row.amount, 0));
  const outflow = round2(items.filter((row) => row.type === 'payment').reduce((sum, row) => sum + row.amount, 0));

  res.json({
    success: true,
    items: items.map((row) => ({ ...row, amount: money(row.amount) })),
    summary: { entries: items.length, inflow, outflow, net: round2(inflow - outflow) },
  });
});

paymentsRouter.post('/', (req, res) => {
  const data = createSchema.parse(req.body ?? {});
  const date = data.date ?? todayISO();
  const db = getDb();
  const isReceipt = data.type === 'receipt';

  const contact = data.party_id
    ? (db.prepare('SELECT id, name, type, balance FROM contacts WHERE id = ?').get(data.party_id) as
        | ContactRow
        | undefined)
    : undefined;
  if (data.party_id && !contact) throw new HttpError(404, 'Party not found');

  const partyName = contact?.name ?? (data.party_name || (isReceipt ? 'Cash receipt' : 'Cash payment'));

  const result = db.transaction(() => {
    const voucherNo = nextRef(isReceipt ? 'receipt' : 'payment');
    db.prepare(
      `INSERT INTO payments (voucher_no, date, party_id, party_name, type, mode, amount, status, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?)`,
    ).run(
      voucherNo,
      date,
      contact?.id ?? null,
      partyName,
      data.type,
      data.mode,
      data.amount,
      data.notes,
      req.user?.name ?? null,
    );

    let balance: number | null = null;
    if (contact) {
      const delta = balanceDelta(contact.type, isReceipt, data.amount);
      balance = round2(Math.max(0, contact.balance + delta));
      db.prepare("UPDATE contacts SET balance = ?, updated_at = datetime('now') WHERE id = ?").run(
        balance,
        contact.id,
      );
    }
    return { voucherNo, balance };
  });

  const { voucherNo, balance } = result();
  logActivity(req.user?.name ?? null, isReceipt ? 'payment.receipt' : 'payment.payout', partyName, data.amount);

  res.status(201).json({
    success: true,
    id: voucherNo,
    voucher_no: voucherNo,
    balance,
    message: isReceipt ? 'Receipt recorded' : 'Payment recorded',
  });
});

paymentsRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid id');
  const db = getDb();

  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(id) as PaymentRow | undefined;
  if (!payment) throw new HttpError(404, 'Entry not found');
  if (payment.bill_ref) {
    throw new HttpError(409, 'This entry belongs to a bill — delete the bill instead');
  }

  db.transaction(() => {
    db.prepare('DELETE FROM payments WHERE id = ?').run(id);

    if (payment.party_id && (payment.type === 'receipt' || payment.type === 'payment')) {
      const contact = db.prepare('SELECT id, type, balance FROM contacts WHERE id = ?').get(payment.party_id) as
        | ContactRow
        | undefined;
      if (contact) {
        const delta = balanceDelta(contact.type, payment.type === 'receipt', payment.amount);
        db.prepare("UPDATE contacts SET balance = ?, updated_at = datetime('now') WHERE id = ?").run(
          round2(Math.max(0, contact.balance - delta)),
          contact.id,
        );
      }
    }
  })();

  logActivity(req.user?.name ?? null, 'payment.delete', payment.voucher_no);
  res.json({ success: true, message: 'Entry deleted' });
});
