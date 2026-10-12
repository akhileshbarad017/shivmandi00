import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { env } from '../env.js';
import { getDb } from '../db/connection.js';

export const SESSION_COOKIE = 'sid';

export interface SessionUser {
  id: number;
  username: string;
  name: string;
  phone: string | null;
}

export interface SessionRecord {
  id: string;
  userId: number;
  csrfToken: string;
  expiresAt: string;
}

export interface ResolvedSession {
  user: SessionUser;
  session: SessionRecord;
}

interface SessionRow {
  sid: string;
  user_id: number;
  csrf_token: string;
  expires_at: string;
  id: number;
  username: string;
  name: string;
  phone: string | null;
  status: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Create a session row + set the httpOnly cookie. Returns the CSRF token. */
export function createSession(userId: number, req: Request, res: Response): string {
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(24).toString('base64url');
  const ttlMs = env.sessionTtlHours * 3_600_000;
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  getDb()
    .prepare(
      `INSERT INTO sessions (id, user_id, csrf_token, ip, user_agent, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(sha256(token), userId, csrfToken, req.ip ?? null, req.get('user-agent') ?? null, expiresAt);

  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.cookieSecure,
    path: '/',
    maxAge: ttlMs,
  });

  return csrfToken;
}

export function destroySession(req: Request, res: Response): void {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) getDb().prepare('DELETE FROM sessions WHERE id = ?').run(sha256(token));
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Resolve the current user from the session cookie, or null. */
export function resolveSession(req: Request): ResolvedSession | null {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;

  const row = getDb()
    .prepare(
      `SELECT s.id AS sid, s.user_id, s.csrf_token, s.expires_at,
              u.id, u.username, u.name, u.phone, u.status
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.id = ?`,
    )
    .get(sha256(token)) as SessionRow | undefined;

  if (!row || row.status !== 'ACTIVE') return null;

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    getDb().prepare('DELETE FROM sessions WHERE id = ?').run(row.sid);
    return null;
  }

  return {
    user: {
      id: row.id,
      username: row.username,
      name: row.name,
      phone: row.phone,
    },
    session: {
      id: row.sid,
      userId: row.user_id,
      csrfToken: row.csrf_token,
      expiresAt: row.expires_at,
    },
  };
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Housekeeping: drop expired sessions. */
export function purgeExpiredSessions(): void {
  getDb().prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
}
