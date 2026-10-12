import Database from 'libsql';
import { env } from '../env.js';
import { getDb } from './connection.js';
import { migrate } from './migrate.js';

/**
 * One-time migration: copy the local SQLite file up to Turso.
 *
 *   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npm run db:push
 *
 * Rows are copied table-by-table; the remote DB is overwritten.
 */

// Parents before children (insert order).
const TABLES = [
  'settings',
  'users',
  'document_sequences',
  'commodities',
  'vehicles',
  'employees',
  'crates',
  'contacts',
  'purchases',
  'purchase_items',
  'purchase_expenses',
  'sales_invoices',
  'sales_items',
  'sales_returns',
  'sales_return_items',
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
];

type Row = Record<string, unknown>;
type Db = Database.Database;

function columnsOf(db: Db, table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

function insertTable(local: Db, remote: Db, table: string): number {
  const columns = columnsOf(local, table);
  if (columns.length === 0) return 0;
  const rows = local.prepare(`SELECT * FROM ${table}`).all() as Row[];
  if (rows.length === 0) return 0;

  const placeholders = columns.map(() => '?').join(', ');
  const insert = remote.prepare(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
  );
  const run = remote.transaction((items: Row[]) => {
    for (const row of items) insert.run(...columns.map((column) => row[column] ?? null));
  });
  run(rows);
  return rows.length;
}

if (!env.libsqlUrl) {
  console.error('Set TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN) before running db:push.');
  process.exit(1);
}

const local = new Database(env.dbPath);
console.log(`Local  : ${env.dbPath}`);
console.log(`Remote : ${env.libsqlUrl}`);

// Create the schema remotely (getDb() returns the Turso connection when configured).
getDb();
migrate();
const remote = getDb();

try {
  remote.exec('PRAGMA foreign_keys = OFF');
} catch {
  /* ignore — Turso may manage this server-side */
}

// Clear the remote tables children-first.
for (const table of [...TABLES].reverse()) {
  try {
    remote.prepare(`DELETE FROM ${table}`).run();
  } catch {
    /* table may not exist remotely */
  }
}

// Copy parents-first.
let total = 0;
for (const table of TABLES) {
  const count = insertTable(local, remote, table);
  total += count;
  console.log(`${table.padEnd(22)} ${count}`);
}

console.log(`\nDone — ${total} rows pushed to Turso.`);
