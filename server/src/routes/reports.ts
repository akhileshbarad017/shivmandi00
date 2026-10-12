import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { stockSummary } from '../services/stock.js';
import { todayISO } from '../utils/date.js';
import { HttpError } from '../utils/http.js';
import { money, round2 } from '../utils/money.js';

function range(req: { query: Record<string, unknown> }): { from: string; to: string } {
  const today = todayISO();
  const from = req.query.from ? String(req.query.from) : `${today.slice(0, 7)}-01`;
  const to = req.query.to ? String(req.query.to) : today;
  return { from, to };
}

function scalar(sql: string, args: unknown[] = []): number {
  const row = getDb().prepare(sql).get(...args) as { v: number | null } | undefined;
  return Number(row?.v ?? 0);
}

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

reportsRouter.get('/sales', (req, res) => {
  const { from, to } = range(req);
  const items = getDb()
    .prepare(
      `SELECT invoice_no, invoice_date, buyer_name, total_amount, paid_amount, balance_due, status
         FROM sales_invoices WHERE invoice_date BETWEEN ? AND ?
        ORDER BY invoice_date DESC, id DESC`,
    )
    .all(from, to) as Array<Record<string, unknown>>;

  const summary = {
    bills: items.length,
    gross: round2(items.reduce((sum, row) => sum + Number(row.total_amount), 0)),
    received: round2(items.reduce((sum, row) => sum + Number(row.paid_amount), 0)),
    outstanding: round2(items.reduce((sum, row) => sum + Number(row.balance_due), 0)),
  };

  res.json({ success: true, type: 'sales', from, to, items, summary });
});

reportsRouter.get('/purchases', (req, res) => {
  const { from, to } = range(req);
  const items = getDb()
    .prepare(
      `SELECT bill_no, date, supplier_name, goods_amount, expenses_amount, net_amount, paid_amount, balance_due
         FROM purchases WHERE date BETWEEN ? AND ?
        ORDER BY date DESC, id DESC`,
    )
    .all(from, to) as Array<Record<string, unknown>>;

  const summary = {
    bills: items.length,
    goods: round2(items.reduce((sum, row) => sum + Number(row.goods_amount), 0)),
    expenses: round2(items.reduce((sum, row) => sum + Number(row.expenses_amount), 0)),
    net: round2(items.reduce((sum, row) => sum + Number(row.net_amount), 0)),
    paid: round2(items.reduce((sum, row) => sum + Number(row.paid_amount), 0)),
  };

  res.json({ success: true, type: 'purchases', from, to, items, summary });
});

reportsRouter.get('/pl', (req, res) => {
  const { from, to } = range(req);

  const revenue = round2(scalar('SELECT SUM(total_amount) AS v FROM sales_invoices WHERE invoice_date BETWEEN ? AND ?', [from, to]));
  const discounts = round2(scalar('SELECT SUM(discount) AS v FROM sales_invoices WHERE invoice_date BETWEEN ? AND ?', [from, to]));
  const cogs = round2(scalar('SELECT SUM(net_amount) AS v FROM purchases WHERE date BETWEEN ? AND ?', [from, to]));
  const expenses = round2(
    scalar(
      "SELECT SUM(amount) AS v FROM payments WHERE type = 'expense' AND (bill_ref IS NULL OR bill_ref = '') AND date BETWEEN ? AND ?",
      [from, to],
    ),
  );
  const gross = round2(revenue - cogs);
  const net = round2(gross - expenses);
  const received = round2(scalar('SELECT SUM(paid_amount) AS v FROM sales_invoices WHERE invoice_date BETWEEN ? AND ?', [from, to]));
  const paidOut = round2(
    scalar("SELECT SUM(amount) AS v FROM payments WHERE type = 'payment' AND date BETWEEN ? AND ?", [from, to]),
  );

  const expenseHeads = getDb()
    .prepare(
      `SELECT COALESCE(head, party_name, 'Other') AS head, COALESCE(SUM(amount), 0) AS total
         FROM payments WHERE type = 'expense' AND (bill_ref IS NULL OR bill_ref = '')
           AND date BETWEEN ? AND ?
        GROUP BY head ORDER BY total DESC`,
    )
    .all(from, to) as Array<{ head: string; total: number }>;

  res.json({
    success: true,
    type: 'pl',
    from,
    to,
    lines: [
      { label: 'Sales revenue', value: revenue, sign: 1 },
      { label: 'Discounts given', value: discounts, sign: -1 },
      { label: 'Cost of purchases', value: cogs, sign: -1 },
      { label: 'Operating expenses', value: expenses, sign: -1 },
    ],
    summary: { sales: revenue, discounts, purchase: cogs, expense: expenses, gross, net, received, paid_out: paidOut },
    expense_heads: expenseHeads.map((row) => ({ head: row.head, total: money(row.total) })),
  });
});

reportsRouter.get('/daybook', (req, res) => {
  const date = req.query.date ? String(req.query.date) : todayISO();
  const items = getDb()
    .prepare("SELECT voucher_no, type, party_name, mode, amount, created_at FROM payments WHERE date = ? ORDER BY id")
    .all(date) as Array<Record<string, unknown>>;

  let balance = 0;
  const rows = items.map((row) => {
    const isIn = row.type === 'receipt';
    const amount = Number(row.amount);
    balance = round2(balance + (isIn ? amount : -amount));
    return {
      time: String(row.created_at).slice(11, 16),
      type: row.type,
      ref: row.voucher_no,
      party: row.party_name,
      mode: row.mode,
      in: isIn ? amount : 0,
      out: isIn ? 0 : amount,
      balance,
    };
  });

  res.json({
    success: true,
    type: 'daybook',
    date,
    items: rows,
    summary: {
      entries: rows.length,
      in: round2(rows.reduce((sum, row) => sum + row.in, 0)),
      out: round2(rows.reduce((sum, row) => sum + row.out, 0)),
      net: round2(rows.reduce((sum, row) => sum + row.in - row.out, 0)),
    },
  });
});

reportsRouter.get('/balance-sheet', (_req, res) => {
  const db = getDb();

  const cashIn = scalar("SELECT SUM(amount) AS v FROM payments WHERE type = 'receipt' AND mode = 'Cash'");
  const cashOut = scalar("SELECT SUM(amount) AS v FROM payments WHERE type IN ('payment','expense') AND mode = 'Cash'");
  const bankIn = scalar("SELECT SUM(amount) AS v FROM payments WHERE type = 'receipt' AND mode IN ('Bank','UPI','Cheque')");
  const bankOut = scalar("SELECT SUM(amount) AS v FROM payments WHERE type IN ('payment','expense') AND mode IN ('Bank','UPI','Cheque')");
  const receivables = scalar(
    "SELECT SUM(balance) AS v FROM contacts WHERE type = 'buyer' AND status = 'ACTIVE' AND balance > 0",
  );
  const payables = scalar(
    "SELECT SUM(balance) AS v FROM contacts WHERE type IN ('farmer','supplier','agent') AND status = 'ACTIVE' AND balance > 0",
  );
  const stockValue = round2(stockSummary(true).reduce((sum, item) => sum + item.value, 0));

  const cash = round2(cashIn - cashOut);
  const bank = round2(bankIn - bankOut);
  const assets = round2(cash + bank + receivables + stockValue);

  res.json({
    success: true,
    type: 'balance-sheet',
    items: [
      { label: 'Cash in hand', value: cash, group: 'assets' },
      { label: 'Bank & UPI', value: bank, group: 'assets' },
      { label: 'Receivables (udhaar)', value: round2(receivables), group: 'assets' },
      { label: 'Stock value', value: stockValue, group: 'assets' },
      { label: 'Payables (suppliers)', value: round2(payables), group: 'liabilities' },
    ],
    summary: { assets, liabilities: round2(payables), position: round2(assets - payables) },
  });
});

reportsRouter.get('/commodity', (_req, res) => {
  const items = stockSummary(false).map((item) => {
    const purchaseValue = scalar('SELECT SUM(amount) AS v FROM purchase_items WHERE commodity_id = ?', [item.id]);
    const saleValue = scalar('SELECT SUM(amount) AS v FROM sales_items WHERE commodity_id = ?', [item.id]);
    return { ...item, purchase_value: money(purchaseValue), sale_value: money(saleValue) };
  });

  res.json({
    success: true,
    type: 'commodity',
    items,
    summary: {
      products: items.length,
      stock_kg: round2(items.reduce((sum, item) => sum + item.stock, 0)),
      stock_value: round2(items.reduce((sum, item) => sum + item.value, 0)),
    },
  });
});

reportsRouter.get('/:action', (req, res) => {
  throw new HttpError(404, 'Unknown report type');
});
