import { getDb } from '../db/connection.js';
import { HttpError } from '../utils/http.js';

interface SequenceRow {
  prefix: string;
  next_value: number;
}

/** Every reference series used by the app (single source of truth). */
export const SEQUENCE_DEFS: Array<[scope: string, prefix: string, nextValue: number]> = [
  ['sales_invoice', 'S-', 1001],
  ['purchase', 'P-', 801],
  ['receipt', 'RCT-', 401],
  ['payment', 'PMT-', 401],
  ['expense', 'EXP-', 401],
  ['sales_return', 'RET-', 101],
  ['arrival', 'ARR-', 101],
  ['gate', 'GT-', 501],
  ['crate', 'CR-', 11],
  ['pos', 'POS-', 1],
  ['customer', 'CUS-', 1],
];

/** Insert any missing sequences (idempotent; safe on existing databases). */
export function ensureSequences(): void {
  const db = getDb();
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO document_sequences (scope, prefix, next_value) VALUES (?, ?, ?)',
  );
  db.transaction(() => {
    for (const [scope, prefix, nextValue] of SEQUENCE_DEFS) stmt.run(scope, prefix, nextValue);
  })();
}

/**
 * Atomically consume the next reference number for a scope
 * (e.g. 'sales_invoice' -> 'S-1001'). Call inside a transaction.
 */
export function nextRef(scope: string): string {
  const db = getDb();
  const row = db
    .prepare('SELECT prefix, next_value FROM document_sequences WHERE scope = ?')
    .get(scope) as SequenceRow | undefined;

  if (!row) throw new HttpError(500, `Missing document sequence: ${scope}`);

  db.prepare('UPDATE document_sequences SET next_value = next_value + 1 WHERE scope = ?').run(scope);
  return `${row.prefix}${row.next_value}`;
}

/** Preview the next reference without consuming it. */
export function peekRef(scope: string): string {
  const row = getDb()
    .prepare('SELECT prefix, next_value FROM document_sequences WHERE scope = ?')
    .get(scope) as SequenceRow | undefined;
  if (!row) throw new HttpError(500, `Missing document sequence: ${scope}`);
  return `${row.prefix}${row.next_value}`;
}

/** Consume a zero-padded code, e.g. nextPaddedCode('customer', 4) -> 'CUS-0001'. */
export function nextPaddedCode(scope: string, pad: number): string {
  const db = getDb();
  const row = db
    .prepare('SELECT prefix, next_value FROM document_sequences WHERE scope = ?')
    .get(scope) as SequenceRow | undefined;
  if (!row) throw new HttpError(500, `Missing document sequence: ${scope}`);
  db.prepare('UPDATE document_sequences SET next_value = next_value + 1 WHERE scope = ?').run(scope);
  return `${row.prefix}${String(row.next_value).padStart(pad, '0')}`;
}

/**
 * Ensure the contacts.code column exists and every contact has a unique
 * customer code (CUS-0001, CUS-0002, ...). Idempotent.
 */
export function ensureContactCodes(): void {
  const db = getDb();

  const columns = db.prepare('PRAGMA table_info(contacts)').all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === 'code')) {
    db.exec('ALTER TABLE contacts ADD COLUMN code TEXT');
  }
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_code ON contacts (code) WHERE code IS NOT NULL AND code != ''",
  );

  ensureSequences();

  // Make sure the sequence continues past any codes that already exist.
  const maxRow = db
    .prepare("SELECT MAX(CAST(SUBSTR(code, 5) AS INTEGER)) AS m FROM contacts WHERE code LIKE 'CUS-%'")
    .get() as { m: number | null };
  const maxCode = Number(maxRow?.m ?? 0);
  const seq = db
    .prepare("SELECT next_value FROM document_sequences WHERE scope = 'customer'")
    .get() as { next_value: number } | undefined;
  if (seq && maxCode >= seq.next_value) {
    db.prepare("UPDATE document_sequences SET next_value = ? WHERE scope = 'customer'").run(maxCode + 1);
  }

  const missing = db
    .prepare("SELECT id FROM contacts WHERE code IS NULL OR code = '' ORDER BY id")
    .all() as Array<{ id: number }>;
  const update = db.prepare('UPDATE contacts SET code = ? WHERE id = ?');
  for (const row of missing) update.run(nextPaddedCode('customer', 4), row.id);
}
