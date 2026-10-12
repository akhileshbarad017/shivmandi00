import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { isProd } from '../env.js';
import { HttpError } from '../utils/http.js';

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ success: false, error: 'Not found' });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({ success: false, error: err.message });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({ success: false, error: err.issues[0]?.message ?? 'Invalid request' });
    return;
  }

  console.error('[error]', err);
  const message = isProd ? 'Internal server error' : String((err as Error)?.message ?? err);
  res.status(500).json({ success: false, error: message });
}
