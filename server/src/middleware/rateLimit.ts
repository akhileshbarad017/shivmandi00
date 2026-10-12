import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../utils/http.js';

interface Entry {
  count: number;
  reset: number;
}

/** Tiny in-memory fixed-window rate limiter, keyed by client IP. */
export function rateLimit(options: { windowMs?: number; max?: number } = {}) {
  const windowMs = options.windowMs ?? 60_000;
  const max = options.max ?? 30;
  const hits = new Map<string, Entry>();

  return (req: Request, _res: Response, next: NextFunction): void => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || entry.reset <= now) {
      hits.set(key, { count: 1, reset: now + windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      throw new HttpError(429, 'Too many attempts. Please wait a moment and try again.');
    }
    next();
  };
}
