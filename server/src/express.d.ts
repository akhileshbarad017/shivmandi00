import type { SessionRecord, SessionUser } from './auth/session.js';

declare global {
  namespace Express {
    interface Request {
      cookies: Record<string, string>;
      user: SessionUser | null;
      session: SessionRecord | null;
    }
  }
}

export {};
