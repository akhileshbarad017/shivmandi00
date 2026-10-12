import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { logActivity } from '../services/activity.js';
import { buildLedger } from '../services/ledger.js';
import { nextPaddedCode, nextRef } from '../services/numbering.js';
import { touchParty } from '../services/parties.js';
import { todayISO } from '../utils/date.js';
import { HttpError } from '../utils/http.js';
import { money, round2 } from '../utils/money.js';

const PARTY_TYPES = ['farmer', 'buyer', 'supplier', 'agent'] as const;

interface PartyRow {
  id: number;
  code: string | null;
  name: string;
  type: string;
  phone: string | null;
  gstin: string | null;
  address: string | null;
  balance: number;
  status: string;
  created_at: string;
}

const createSchema = z.object({
  name: z.string().trim().min(1, 'Party name is required'),
  type: z.enum(PARTY_TYPES),
  phone: z.string().trim().max(20).optional().default(''),
  gstin: z.string().trim().max(20).optional().default(''),
  address: z.string().trim().max(300).optional().default(''),
});

const updateSchema = createSchema.partial();

const paymentSchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  mode: z.enum(['Cash', 'Bank', 'UPI', 'Cheque']).default('Cash'),
  direction: z.enum(['in', 'out']).default('in'),
  date: z.string().trim().optional(),
  notes: z.string().trim().max(300).optional().default(''),
});

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid party id');
  return id;
}

function findParty(id: number): PartyRow {
  const party = getDb()
    .prepare('SELECT * FROM contacts WHERE id = ? AND status = ?')
    .get(id, 'ACTIVE') as PartyRow | undefined;
  if (!party) throw new HttpError(404, 'Party not found');
  return party;
}

export const partiesRouter = Router();
partiesRouter.use(requireAuth);

const SORTS: Record<string, string> = {
  name: "name COLLATE NOCASE ASC",
  balance: "balance DESC, name COLLATE NOCASE ASC",
  frequent: "usage_count DESC, last_used_at DESC, name COLLATE NOCASE ASC",
  recent: "created_at DESC, id DESC",
};

partiesRouter.get('/', (req, res) => {
  const type = String(req.query.type ?? 'all');
  const q = String(req.query.q ?? '').trim();
  const sort = SORTS[String(req.query.sort ?? 'name')] ?? SORTS.name;
  const limitRaw = Number(req.query.limit);
  const paginated = Number.isFinite(limitRaw) && limitRaw > 0;
  const limit = paginated ? Math.min(200, Math.max(1, Math.floor(limitRaw))) : null;
  const offset = Math.max(0, Math.floor(Number(req.query.offset) || 0));

  const where = ["status = 'ACTIVE'"];
  const args: unknown[] = [];

  if ((PARTY_TYPES as readonly string[]).includes(type)) {
    where.push('type = ?');
    args.push(type);
  }
  if (q) {
    where.push('(name LIKE ? OR phone LIKE ? OR address LIKE ? OR code LIKE ?)');
    args.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  const clause = where.join(' AND ');
  const db = getDb();
  const query =
    `SELECT id, code, name, type, phone, gstin, address, balance, status, usage_count, created_at
       FROM contacts
      WHERE ${clause}
      ORDER BY ${sort}` + (limit !== null ? ' LIMIT ? OFFSET ?' : '');
  const items = (limit !== null ? db.prepare(query).all(...args, limit, offset) : db.prepare(query).all(...args)) as PartyRow[];

  const total = Number((db.prepare(`SELECT COUNT(*) AS n FROM contacts WHERE ${clause}`).get(...args) as { n: number }).n);

  const countRows = db
    .prepare("SELECT type, COUNT(*) AS n FROM contacts WHERE status = 'ACTIVE' GROUP BY type")
    .all() as Array<{ type: string; n: number }>;

  const counts: Record<string, number> = { farmer: 0, buyer: 0, supplier: 0, agent: 0, total: 0 };
  for (const row of countRows) {
    counts[row.type] = row.n;
    counts.total = (counts.total ?? 0) + row.n;
  }

  res.json({
    success: true,
    items: items.map((party) => ({ ...party, balance: money(party.balance) })),
    counts,
    total,
    limit,
    offset,
  });
});

partiesRouter.get('/:id/profile', (req, res) => {
  const id = parseId(req.params.id);
  const party = findParty(id);
  touchParty(id);
  const db = getDb();

  const ledger = buildLedger(id, party.type);

  const invoices =
    party.type === 'buyer'
      ? db
          .prepare(
            `SELECT id, invoice_no, invoice_date, total_amount, paid_amount, balance_due, status
               FROM sales_invoices WHERE buyer_id = ?
              ORDER BY invoice_date DESC, id DESC LIMIT 200`,
          )
          .all(id)
      : [];

  // Attach the item lines to each invoice (item-level purchase history).
  const itemRows = db
    .prepare(
      `SELECT i.invoice_id, i.commodity_id, i.commodity_name, i.unit, i.bags, i.weight, i.rate, i.amount
         FROM sales_items i JOIN sales_invoices s ON s.id = i.invoice_id
        WHERE s.buyer_id = ?
        ORDER BY s.invoice_date DESC, s.id DESC, i.id`,
    )
    .all(id) as Array<{
    invoice_id: number;
    commodity_id: number | null;
    commodity_name: string;
    unit: string;
    bags: number;
    weight: number;
    rate: number;
    amount: number;
  }>;
  const itemsByInvoice = new Map<number, typeof itemRows>();
  for (const row of itemRows) {
    const list = itemsByInvoice.get(row.invoice_id) ?? [];
    list.push(row);
    itemsByInvoice.set(row.invoice_id, list);
  }

  const invoicesWithItems = (
    invoices as Array<{ id: number; total_amount: number; paid_amount: number; balance_due: number }>
  ).map((invoice) => ({
    ...invoice,
    total_amount: money(invoice.total_amount),
    paid_amount: money(invoice.paid_amount),
    balance_due: money(invoice.balance_due),
    items: (itemsByInvoice.get(invoice.id) ?? []).map((item) => ({
      commodity_id: item.commodity_id,
      commodity_name: item.commodity_name,
      unit: item.unit,
      bags: item.bags,
      weight: money(item.weight),
      rate: money(item.rate),
      amount: money(item.amount),
    })),
  }));

  const purchases =
    party.type === 'buyer'
      ? []
      : db
          .prepare(
            `SELECT id, bill_no, date, goods_amount, commission_amount, net_amount, paid_amount, balance_due
               FROM purchases WHERE supplier_id = ?
              ORDER BY date DESC, id DESC LIMIT 200`,
          )
          .all(id);

  const payments = db
    .prepare(
      `SELECT id, voucher_no, date, type, mode, amount, notes FROM payments WHERE party_id = ?
        ORDER BY date DESC, id DESC LIMIT 300`,
    )
    .all(id);

  // Totals across all bills (independent of paging).
  const totals = db
    .prepare(
      `SELECT COUNT(*) AS bills,
              COALESCE(SUM(total_amount), 0) AS billed,
              COALESCE(SUM(paid_amount), 0)  AS paid,
              COALESCE(SUM(balance_due), 0)  AS pending
         FROM sales_invoices WHERE buyer_id = ?`,
    )
    .get(id) as { bills: number; billed: number; paid: number; pending: number };

  const purchaseTotals = db
    .prepare(
      `SELECT COUNT(*) AS bills, COALESCE(SUM(net_amount), 0) AS amount
         FROM purchases WHERE supplier_id = ?`,
    )
    .get(id) as { bills: number; amount: number };

  res.json({
    success: true,
    party: { ...party, balance: money(party.balance) },
    ledger,
    invoices: invoicesWithItems,
    purchases,
    payments,
    stats: {
      total_billed: money(totals.billed),
      total_paid: money(totals.paid),
      total_pending: money(party.balance),
      current_balance: money(party.balance),
      sales_bills: totals.bills,
      purchase_bills: purchaseTotals.bills,
      purchase_amount: money(purchaseTotals.amount),
    },
    summary: {
      pending: money(party.balance),
      type: party.type,
      bills: invoices.length + purchases.length,
      transactions: ledger.entries.length,
    },
  });
});

partiesRouter.get('/:id/ledger', (req, res) => {
  const id = parseId(req.params.id);
  const party = findParty(id);
  const from = req.query.from ? String(req.query.from) : null;
  const to = req.query.to ? String(req.query.to) : null;

  const ledger = buildLedger(id, party.type, from, to);
  res.json({
    success: true,
    party: { ...party, balance: money(party.balance) },
    ...ledger,
  });
});

partiesRouter.post('/', (req, res) => {
  const data = createSchema.parse(req.body ?? {});
  const code = nextPaddedCode('customer', 4);
  const result = getDb()
    .prepare('INSERT INTO contacts (code, name, type, phone, gstin, address) VALUES (?, ?, ?, ?, ?, ?)')
    .run(code, data.name, data.type, data.phone, data.gstin, data.address);

  logActivity(req.user?.name ?? null, 'party.create', `${data.type}: ${data.name}`);
  res
    .status(201)
    .json({ success: true, id: Number(result.lastInsertRowid), code, message: 'Party added' });
});

partiesRouter.patch('/:id', (req, res) => {
  const id = parseId(req.params.id);
  findParty(id);
  const data = updateSchema.parse(req.body ?? {});

  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }
  if (fields.length === 0) throw new HttpError(400, 'Nothing to update');

  fields.push("updated_at = datetime('now')");
  values.push(id);
  getDb().prepare(`UPDATE contacts SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  logActivity(req.user?.name ?? null, 'party.update', `#${id}`);
  res.json({ success: true, id, message: 'Party updated' });
});

partiesRouter.delete('/:id', (req, res) => {
  const id = parseId(req.params.id);
  const party = findParty(id);
  getDb().prepare("UPDATE contacts SET status = 'INACTIVE', updated_at = datetime('now') WHERE id = ?").run(id);

  logActivity(req.user?.name ?? null, 'party.delete', party.name);
  res.json({ success: true, message: 'Party removed' });
});

partiesRouter.post('/:id/payment', (req, res) => {
  const id = parseId(req.params.id);
  const party = findParty(id);
  const data = paymentSchema.parse(req.body ?? {});
  const date = data.date ?? todayISO();
  const isBuyer = party.type === 'buyer';
  const isReceipt = data.direction === 'in';

  const db = getDb();
  const run = db.transaction(() => {
    const voucherNo = nextRef(isReceipt ? 'receipt' : 'payment');
    db.prepare(
      `INSERT INTO payments (voucher_no, date, party_id, party_name, type, mode, amount, status, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?)`,
    ).run(
      voucherNo,
      date,
      id,
      party.name,
      isReceipt ? 'receipt' : 'payment',
      data.mode,
      data.amount,
      data.notes,
      req.user?.name ?? null,
    );

    const delta = isBuyer === isReceipt ? -data.amount : data.amount;
    const next = Math.max(0, round2(party.balance + delta));
    db.prepare("UPDATE contacts SET balance = ?, updated_at = datetime('now') WHERE id = ?").run(next, id);

    return { voucherNo, balance: next };
  });

  const { voucherNo, balance } = run();
  touchParty(id);
  logActivity(
    req.user?.name ?? null,
    isReceipt ? 'payment.receipt' : 'payment.payout',
    `${party.name}`,
    data.amount,
  );

  res.status(201).json({
    success: true,
    id: Number(id),
    voucher_no: voucherNo,
    balance: money(balance),
    message: isReceipt ? 'Payment received' : 'Payment recorded',
  });
});
