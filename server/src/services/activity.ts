import { getDb } from '../db/connection.js';

/** Best-effort audit log; never throws into the request path. */
export function logActivity(
  actor: string | null,
  action: string,
  detail: string,
  amount = 0,
): void {
  try {
    getDb()
      .prepare('INSERT INTO activity_log (actor, action, detail, amount) VALUES (?, ?, ?, ?)')
      .run(actor, action, detail, amount);
  } catch {
    // ignore
  }
}
