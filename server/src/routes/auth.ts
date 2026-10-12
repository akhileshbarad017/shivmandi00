import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/connection.js';
import { verifyPassword } from '../auth/password.js';
import { createSession, destroySession, purgeExpiredSessions } from '../auth/session.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { logActivity } from '../services/activity.js';
import { HttpError } from '../utils/http.js';

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  name: string;
  phone: string | null;
  status: string;
}

const loginSchema = z.object({
  identity: z.string().trim().min(1, 'Please enter your username or mobile number'),
  password: z.string().min(1, 'Please enter your password'),
});

// Brute-force protection: generous enough for a busy counter, still throttles abuse.
const loginLimiter = rateLimit({
  windowMs: 5 * 60_000,
  max: Number(process.env.LOGIN_RATE_MAX ?? 100),
});

export const authRouter = Router();

/** Current session (401 when signed out, so the client can redirect). */
authRouter.get('/me', (req, res) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not signed in' });
    return;
  }
  res.json({
    success: true,
    user: req.user,
    csrf: req.session?.csrfToken ?? null,
  });
});

authRouter.post('/login', loginLimiter, (req, res) => {
  const { identity, password } = loginSchema.parse(req.body ?? {});
  const compact = identity.replace(/[\s-]/g, '');

  const user = getDb()
    .prepare(
      `SELECT * FROM users
        WHERE username = ? OR phone = ? OR lower(name) = lower(?)
        LIMIT 1`,
    )
    .get(identity, compact, identity) as UserRow | undefined;

  if (!user || user.status !== 'ACTIVE' || !verifyPassword(password, user.password_hash)) {
    throw new HttpError(401, 'Invalid credentials. Please check and try again.');
  }

  purgeExpiredSessions();
  const csrf = createSession(user.id, req, res);
  logActivity(user.name, 'login', 'signed in');

  res.json({
    success: true,
    user: { id: user.id, username: user.username, name: user.name, phone: user.phone },
    csrf,
  });
});

authRouter.post('/logout', (req, res) => {
  const name = req.user?.name ?? null;
  destroySession(req, res);
  if (name) logActivity(name, 'logout', 'signed out');
  res.json({ success: true, message: 'Signed out' });
});
