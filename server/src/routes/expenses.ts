import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { logActivity } from '../services/activity.js';
import { nextRef } from '../services/numbering.js';
import { todayISO } from '../utils/date.js';
import { HttpError } from '../utils/http.js';
import { money, round2 } from '../utils/money.js';

export const EXPENSE_HEADS = [
  'Hamali / Labour',
  'Transport',
  'Commission',
  'Bardana',
  'APMC Cess',
  'Tea / Refreshment',
  'Rent',
  'Electricity',
  'Salary',
  'Other',
] as const;

interface ExpenseRow {
  id: number;
  voucher_no: string;
  date: string;
  party_name: string;
  type: string;
  mode: string;
  head: string | null;
  amount: number;
  status: string;
  bill_ref: string | null;
  notes: string | null;
  created_at: string;
}

const createSchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  head: z.string().trim().min(1, 'Choose an expense head').max(80),
  mode: z.enum(['Cash', 'Bank', 'UPI', 'Cheque']).default('Cash'),
  date: z.string().trim().optional(),
  notes: z.string().trim().max(300).optional().default(''),
});

export const expensesRouter = Router();
expensesRouter.use(requireAuth);

expensesRouter.get('/', (req, res) => {
  const db = getDb();
  const where = ["type = 'expense'"];
  const args: unknown[] = [];

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
    .prepare(`SELECT * FROM payments WHERE ${where.join(' AND ')} ORDER BY date DESC, id DESC LIMIT 300`)
    .all(...args) as ExpenseRow[];

  const today = todayISO();
  const byHead = new Map<string, number>();
  for (const row of items) {
    const head = row.head ?? row.party_name ?? 'Other';
    byHead.set(head, round2((byHead.get(head) ?? 0) + row.amount));
  }

  res.json({
    success: true,
    items: items.map((row) => ({
      ...row,
      amount: money(row.amount),
      editable: row.bill_ref === null || row.bill_ref === '',
    })),
    summary: {
      entries: items.length,
      total: round2(items.reduce((sum, row) => sum + row.amount, 0)),
      today: round2(items.filter((row) => row.date === today).reduce((sum, row) => sum + row.amount, 0)),
      by_head: Array.from(byHead.entries())
        .map(([head, total]) => ({ head, total }))
        .sort((a, b) => b.total - a.total),
    },
  });
});

expensesRouter.post('/', (req, res) => {
  const data = createSchema.parse(req.body ?? {});
  const date = data.date ?? todayISO();
  const db = getDb();

  const voucherNo = db.transaction(() => {
    const no = nextRef('expense');
    db.prepare(
      `INSERT INTO payments (voucher_no, date, party_name, type, mode, head, amount, status, notes, created_by)
       VALUES (?, ?, ?, 'expense', ?, ?, ?, 'COMPLETED', ?, ?)`,
    ).run(no, date, data.head, data.mode, data.head, data.amount, data.notes, req.user?.name ?? null);
    return no;
  })();

  logActivity(req.user?.name ?? null, 'expense.create', `${data.head}`, data.amount);
  res.status(201).json({ success: true, voucher_no: voucherNo, message: 'Expense recorded' });
});

expensesRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid id');

  const row = getDb().prepare("SELECT id, voucher_no, bill_ref FROM payments WHERE id = ? AND type = 'expense'").get(id) as
    | { id: number; voucher_no: string; bill_ref: string | null }
    | undefined;
  if (!row) throw new HttpError(404, 'Expense not found');
  if (row.bill_ref) throw new HttpError(409, 'This expense belongs to a purchase bill — delete the bill instead');

  getDb().prepare('DELETE FROM payments WHERE id = ?').run(id);
  logActivity(req.user?.name ?? null, 'expense.delete', row.voucher_no);
  res.json({ success: true, message: 'Expense deleted' });
});
