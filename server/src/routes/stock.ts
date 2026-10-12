import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { logActivity } from '../services/activity.js';
import { liveStock, stockSummary } from '../services/stock.js';
import { todayISO } from '../utils/date.js';
import { HttpError } from '../utils/http.js';
import { money, round2 } from '../utils/money.js';

interface AdjustmentRow {
  id: number;
  date: string;
  commodity_id: number;
  commodity_name: string;
  qty: number;
  reason: string | null;
  notes: string | null;
  created_at: string;
}

const adjustSchema = z.object({
  commodity_id: z.coerce.number().int().positive('Choose a product'),
  qty: z.coerce.number().refine((value) => value !== 0, 'Quantity cannot be zero'),
  date: z.string().trim().optional(),
  reason: z.string().trim().max(120).optional().default('Manual correction'),
  notes: z.string().trim().max(300).optional().default(''),
});

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid id');
  return id;
}

export const stockRouter = Router();
stockRouter.use(requireAuth);

stockRouter.get('/', (req, res) => {
  const includeInactive = String(req.query.all ?? '') === '1';
  const db = getDb();
  const items = stockSummary(!includeInactive);

  const adjustments = db
    .prepare(
      `SELECT id, date, commodity_id, commodity_name, qty, reason, notes, created_at
         FROM stock_adjustments
        ORDER BY date DESC, id DESC
        LIMIT 20`,
    )
    .all() as AdjustmentRow[];

  const summary = {
    products: items.length,
    stock_value: money(items.reduce((sum, item) => sum + item.value, 0)),
    stock_qty: round2(items.reduce((sum, item) => sum + item.stock, 0)),
    purchased: round2(items.reduce((sum, item) => sum + item.purchased, 0)),
    sold: round2(items.reduce((sum, item) => sum + item.sold, 0)),
    low: items.filter((item) => item.state === 'LOW').length,
    out: items.filter((item) => item.state === 'OUT').length,
  };

  res.json({
    success: true,
    items,
    adjustments: adjustments.map((row) => ({ ...row, qty: round2(row.qty) })),
    summary,
  });
});

stockRouter.post('/adjust', (req, res) => {
  const data = adjustSchema.parse(req.body ?? {});
  const db = getDb();

  const commodity = db
    .prepare('SELECT id, name FROM commodities WHERE id = ?')
    .get(data.commodity_id) as { id: number; name: string } | undefined;
  if (!commodity) throw new HttpError(400, 'Product not found');

  const date = data.date ?? todayISO();
  const result = db
    .prepare(
      `INSERT INTO stock_adjustments (date, commodity_id, commodity_name, qty, reason, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(date, commodity.id, commodity.name, data.qty, data.reason, data.notes, req.user?.name ?? null);

  logActivity(req.user?.name ?? null, 'stock.adjust', `${commodity.name} ${data.qty > 0 ? '+' : ''}${data.qty}`);

  res.status(201).json({
    success: true,
    id: Number(result.lastInsertRowid),
    stock: liveStock(commodity.id),
    message: 'Stock adjusted',
  });
});

stockRouter.delete('/adjustments/:id', (req, res) => {
  const id = parseId(req.params.id);
  const result = getDb().prepare('DELETE FROM stock_adjustments WHERE id = ?').run(id);
  if (result.changes === 0) throw new HttpError(404, 'Adjustment not found');

  logActivity(req.user?.name ?? null, 'stock.adjust_delete', `#${id}`);
  res.json({ success: true, message: 'Adjustment removed' });
});
