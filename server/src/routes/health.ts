import { Router } from 'express';
import { getDb } from '../db/connection.js';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  let db = 'down';
  try {
    getDb().prepare('SELECT 1').get();
    db = 'up';
  } catch {
    db = 'down';
  }

  res.json({
    success: true,
    app: 'shivmandi-rewrite',
    version: '0.1.0',
    db,
    time: new Date().toISOString(),
  });
});
