import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { stockSummary } from '../services/stock.js';
import { todayISO } from '../utils/date.js';
import { money, round2 } from '../utils/money.js';

function scalar(sql: string, args: unknown[] = []): number {
  const row = getDb().prepare(sql).get(...args) as { v: number | null } | undefined;
  return Number(row?.v ?? 0);
}

function delta(today: number, previous: number): number | null {
  if (previous === 0) return null;
  return round2(((today - previous) / Math.abs(previous)) * 100);
}

function isoDaysAgo(days: number): string {
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  now.setDate(now.getDate() - days);
  return now.toISOString().slice(0, 10);
}

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get('/', (_req, res) => {
  const db = getDb();
  const today = todayISO();
  const yesterday = isoDaysAgo(1);

  const todaySales = round2(scalar('SELECT SUM(total_amount) AS v FROM sales_invoices WHERE invoice_date = ?', [today]));
  const todayPurchases = round2(scalar('SELECT SUM(net_amount) AS v FROM purchases WHERE date = ?', [today]));
  const todayExpenses = round2(
    scalar("SELECT SUM(amount) AS v FROM payments WHERE type = 'expense' AND date = ?", [today]),
  );
  const yesterdaySales = round2(scalar('SELECT SUM(total_amount) AS v FROM sales_invoices WHERE invoice_date = ?', [yesterday]));
  const yesterdayPurchases = round2(scalar('SELECT SUM(net_amount) AS v FROM purchases WHERE date = ?', [yesterday]));

  const stock = stockSummary(true);
  const stockQty = round2(stock.reduce((sum, item) => sum + item.stock, 0));
  const stockValue = round2(stock.reduce((sum, item) => sum + item.value, 0));

  // Receivable = live buyer khata balance (includes digitised opening balances).
  const toReceive = round2(
    scalar("SELECT SUM(balance) AS v FROM contacts WHERE type = 'buyer' AND status = 'ACTIVE' AND balance > 0"),
  );
  const receiveParties = Number(
    (db.prepare("SELECT COUNT(*) AS v FROM contacts WHERE type = 'buyer' AND status = 'ACTIVE' AND balance > 0").get() as { v: number }).v,
  );
  const toPay = round2(
    scalar("SELECT SUM(balance) AS v FROM contacts WHERE type IN ('farmer','supplier','agent') AND status = 'ACTIVE' AND balance > 0"),
  );
  const payParties = Number(
    (db.prepare("SELECT COUNT(*) AS v FROM contacts WHERE type IN ('farmer','supplier','agent') AND balance > 0").get() as { v: number }).v,
  );

  const weekly = Array.from({ length: 7 }, (_, index) => {
    const date = isoDaysAgo(6 - index);
    return {
      date,
      sales: round2(scalar('SELECT SUM(total_amount) AS v FROM sales_invoices WHERE invoice_date = ?', [date])),
    };
  });

  const recentBills = db
    .prepare(
      `SELECT invoice_no, buyer_name, total_amount, balance_due, status, invoice_date
         FROM sales_invoices
        ORDER BY invoice_date DESC, id DESC
        LIMIT 6`,
    )
    .all() as Array<Record<string, unknown>>;

  res.json({
    success: true,
    date: today,
    kpis: {
      today_sales: todaySales,
      today_purchases: todayPurchases,
      today_expenses: todayExpenses,
      estimated_profit: round2(todaySales - todayPurchases - todayExpenses),
      stock_qty: stockQty,
      stock_value: stockValue,
      bills_today: Number((db.prepare('SELECT COUNT(*) AS v FROM sales_invoices WHERE invoice_date = ?').get(today) as { v: number }).v),
      sales_delta: delta(todaySales, yesterdaySales),
      purchase_delta: delta(todayPurchases, yesterdayPurchases),
    },
    money: {
      to_receive: money(toReceive),
      receive_parties: receiveParties,
      to_pay: money(toPay),
      pay_parties: payParties,
    },
    weekly,
    recent_bills: recentBills.map((row) => ({
      ...row,
      total_amount: money(row.total_amount),
      balance_due: money(row.balance_due),
    })),
  });
});
