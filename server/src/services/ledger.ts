import { getDb } from '../db/connection.js';
import { money, round2 } from '../utils/money.js';

export interface LedgerEntry {
  date: string;
  type: string;
  ref: string;
  label: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface LedgerResult {
  opening: number;
  entries: LedgerEntry[];
  totals: { debit: number; credit: number; balance: number };
  from: string | null;
  to: string | null;
}

interface Movement {
  date: string;
  type: string;
  ref: string;
  label: string;
  debit: number;
  credit: number;
}

interface Row {
  ref: string;
  date: string;
  amount: number;
  type?: string;
}

/**
 * Build a party khata statement.
 *
 * Buyers: sales are debits, receipts/returns are credits; balance is receivable.
 * Suppliers/farmers/agents: purchases are credits, payouts are debits; balance is payable.
 */
export function buildLedger(
  partyId: number,
  partyType: string,
  from?: string | null,
  to?: string | null,
): LedgerResult {
  const db = getDb();
  const isBuyer = partyType === 'buyer';
  const movements: Movement[] = [];

  // Bring the digitised book balance into the khata as the starting point.
  const account = db.prepare('SELECT opening_balance FROM contacts WHERE id = ?').get(partyId) as
    | { opening_balance: number }
    | undefined;
  const openingBalance = money(account?.opening_balance ?? 0);
  if (openingBalance !== 0) {
    movements.push({
      date: '',
      type: 'opening',
      ref: '',
      label: 'Opening balance',
      debit: isBuyer && openingBalance > 0 ? openingBalance : 0,
      credit: !isBuyer && openingBalance > 0 ? openingBalance : 0,
    });
  }

  if (isBuyer) {
    const invoices = db
      .prepare(
        `SELECT invoice_no AS ref, invoice_date AS date, total_amount AS amount
           FROM sales_invoices
          WHERE buyer_id = ? AND status != 'CANCELLED'`,
      )
      .all(partyId) as Row[];
    for (const row of invoices) {
      movements.push({
        date: row.date,
        type: 'sale',
        ref: row.ref,
        label: 'Sale invoice',
        debit: money(row.amount),
        credit: 0,
      });
    }

    const returns = db
      .prepare(
        'SELECT return_no AS ref, return_date AS date, amount FROM sales_returns WHERE buyer_id = ?',
      )
      .all(partyId) as Row[];
    for (const row of returns) {
      movements.push({
        date: row.date,
        type: 'return',
        ref: row.ref,
        label: 'Sales return',
        debit: 0,
        credit: money(row.amount),
      });
    }
  } else {
    const purchases = db
      .prepare('SELECT bill_no AS ref, date, net_amount AS amount FROM purchases WHERE supplier_id = ?')
      .all(partyId) as Row[];
    for (const row of purchases) {
      movements.push({
        date: row.date,
        type: 'purchase',
        ref: row.ref,
        label: 'Purchase bill',
        debit: 0,
        credit: money(row.amount),
      });
    }
  }

  const payments = db
    .prepare('SELECT voucher_no AS ref, date, type, amount FROM payments WHERE party_id = ?')
    .all(partyId) as Array<Row & { type: string }>;
  for (const row of payments) {
    const isReceipt = row.type === 'receipt';
    const debit = isBuyer ? (isReceipt ? 0 : money(row.amount)) : isReceipt ? 0 : money(row.amount);
    const credit = isBuyer ? (isReceipt ? money(row.amount) : 0) : isReceipt ? money(row.amount) : 0;
    movements.push({
      date: row.date,
      type: row.type,
      ref: row.ref,
      label: isReceipt ? 'Receipt' : 'Payment',
      debit,
      credit,
    });
  }

  movements.sort((a, b) => (a.date === b.date ? a.ref.localeCompare(b.ref) : a.date.localeCompare(b.date)));

  let running = 0;
  const signed: LedgerEntry[] = movements.map((movement) => {
    const delta = isBuyer
      ? movement.debit - movement.credit
      : movement.credit - movement.debit;
    running = round2(running + delta);
    return { ...movement, balance: running };
  });

  const inRange = signed.filter((entry) => {
    if (from && entry.date < from) return false;
    if (to && entry.date > to) return false;
    return true;
  });

  const opening = inRange.length > 0 ? round2(inRange[0]!.balance - contribution(inRange[0]!, isBuyer)) : round2(running);
  const debit = round2(inRange.reduce((sum, entry) => sum + entry.debit, 0));
  const credit = round2(inRange.reduce((sum, entry) => sum + entry.credit, 0));

  return {
    opening,
    entries: inRange,
    totals: { debit, credit, balance: signed.length > 0 ? signed[signed.length - 1]!.balance : 0 },
    from: from ?? null,
    to: to ?? null,
  };
}

function contribution(entry: LedgerEntry, isBuyer: boolean): number {
  return isBuyer ? entry.debit - entry.credit : entry.credit - entry.debit;
}
