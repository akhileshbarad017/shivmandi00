import type { Database } from 'libsql';
import { getDb } from '../db/connection.js';

/**
 * Record that a party was just used (billed, paid, or opened). Powers the
 * "frequently used" ordering so regular customers surface first.
 */
export function touchParty(id: number | null | undefined, db: Database = getDb()): void {
  if (!id) return;
  db.prepare(
    "UPDATE contacts SET usage_count = usage_count + 1, last_used_at = datetime('now') WHERE id = ?",
  ).run(id);
}
