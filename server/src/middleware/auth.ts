import type { NextFunction, Request, Response } from 'express';
import { resolveSession, safeEqual } from '../auth/session.js';
import { HttpError } from '../utils/http.js';

/** Populate req.user / req.session from the session cookie. */
export function attachSession(req: Request, _res: Response, next: NextFunction): void {
  const resolved = resolveSession(req);
  req.user = resolved?.user ?? null;
  req.session = resolved?.session ?? null;
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) throw new HttpError(401, 'Authentication required');
  next();
}

/** Double-submit CSRF check for state-changing requests. */
export function requireCsrf(req: Request, _res: Response, next: NextFunction): void {
  if (!req.session) throw new HttpError(401, 'Authentication required');
  const token = req.get('x-csrf-token');
  if (!token || !safeEqual(token, req.session.csrfToken)) {
    throw new HttpError(403, 'Invalid or missing CSRF token');
  }
  next();
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_EXEMPT = new Set(['POST /api/auth/login']);

export function csrfGuard(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) return next();
  if (CSRF_EXEMPT.has(`${req.method} ${req.path}`)) return next();
  requireCsrf(req, _res, next);
}
