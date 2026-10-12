import type { Database } from 'libsql';
import { getDb } from './connection.js';
import { migrate } from './migrate.js';
import { seed } from './seed.js';

/**
 * Tables cleared before a fresh import, ordered children-first so foreign keys
 * stay satisfied while deleting.
 */
const TABLES = [
  'sales_return_items',
  'sales_returns',
  'sales_items',
  'sales_invoices',
  'purchase_expenses',
  'purchase_items',
  'purchases',
  'payments',
  'stock_adjustments',
  'arrivals',
  'gate_entries',
  'attendance',
  'tasks',
  'staff_advances',
  'whatsapp_log',
  'bulk_batches',
  'idempotency_keys',
  'activity_log',
  'crates',
  'employees',
  'vehicles',
  'commodities',
  'contacts',
  'sessions',
  'users',
  'document_sequences',
  'settings',
];

/** Delete every row from every table (and reset AUTOINCREMENT counters). */
export function reset(db: Database = getDb()): void {
  const hasSequence = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'")
    .get();
  db.transaction(() => {
    for (const table of TABLES) db.prepare(`DELETE FROM ${table}`).run();
    if (hasSequence) db.prepare('DELETE FROM sqlite_sequence').run();
  })();
}

getDb();
migrate();
reset();
const inserted = seed();
console.log(
  inserted
    ? 'Reset complete — real ledger data imported (169 accounts).'
    : 'Reset complete — data cleared but seeding was skipped.',
);
