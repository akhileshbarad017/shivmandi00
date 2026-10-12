import type { NextFunction, Request, Response } from 'express';
import { getDb } from '../db/connection.js';

const MUTATING = new Set(['POST', 'PATCH', 'DELETE']);
const HEADER = 'idempotency-key';

interface StoredRow {
  status_code: number;
  response_json: string;
}

function scopedId(req: Request, key: string): string {
  return `${req.user?.id ?? 'anon'}:${key}`;
}

/**
 * Replays the stored response for a repeated `Idempotency-Key`, and records the
 * response of the first successful attempt. This makes offline retries and
 * sync replays safe (no duplicate bills/payments).
 */
export function idempotencyGuard(req: Request, res: Response, next: NextFunction): void {
  if (!MUTATING.has(req.method)) {
    next();
    return;
  }
  const key = req.header(HEADER);
  if (!key || key.length < 6) {
    next();
    return;
  }

  const id = scopedId(req, key);
  const db = getDb();
  const existing = db
    .prepare('SELECT status_code, response_json FROM idempotency_keys WHERE id = ?')
    .get(id) as StoredRow | undefined;

  if (existing) {
    res.status(existing.status_code).json(JSON.parse(existing.response_json));
    return;
  }

  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    try {
      if (res.statusCode < 500) {
        db.prepare(
          `INSERT OR IGNORE INTO idempotency_keys (id, user_id, method, path, status_code, response_json)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          req.user?.id ?? null,
          req.method,
          req.baseUrl + req.path,
          res.statusCode,
          JSON.stringify(body),
        );
      }
    } catch {
      /* never let persistence break the response */
    }
    return originalJson(body);
  };

  next();
}

/** Drop idempotency records older than the retention window. */
export function pruneIdempotency(days = 7): void {
  try {
    getDb()
      .prepare(`DELETE FROM idempotency_keys WHERE created_at <= datetime('now', ?)`)
      .run(`-${days} days`);
  } catch {
    /* ignore */
  }
}
