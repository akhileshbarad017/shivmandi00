import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { logActivity } from '../services/activity.js';
import { stockSummary } from '../services/stock.js';
import { HttpError } from '../utils/http.js';

const UNITS = ['kg', 'quintal', 'dozen', 'bag', 'crate', 'piece'] as const;
const CATEGORIES = ['Vegetables', 'Fruits', 'Spices', 'Grains', 'Other'] as const;

const createSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required'),
  code: z.string().trim().max(12).optional().default(''),
  category: z.enum(CATEGORIES).default('Vegetables'),
  unit: z.enum(UNITS).default('kg'),
  default_rate: z.coerce.number().min(0).default(0),
  rate_20kg: z.coerce.number().min(0).default(0),
  min_level: z.coerce.number().min(0).default(0),
  emoji: z.string().trim().max(4).optional().default(''),
});

const updateSchema = createSchema.partial();

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid product id');
  return id;
}

function generateCode(name: string): string {
  const db = getDb();
  const base = name.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase() || 'COM';
  for (let i = 0; i < 200; i += 1) {
    const candidate = i === 0 ? base : `${base}${i}`;
    if (!db.prepare('SELECT 1 FROM commodities WHERE code = ?').get(candidate)) return candidate;
  }
  return `${base}${Date.now() % 1000}`;
}

export const productsRouter = Router();
productsRouter.use(requireAuth);

productsRouter.get('/', (req, res) => {
  const includeInactive = String(req.query.all ?? '') === '1';
  const items = stockSummary(!includeInactive);

  const summary = {
    products: items.length,
    active: items.filter((item) => item.status === 'ACTIVE').length,
    low: items.filter((item) => item.state === 'LOW').length,
    out: items.filter((item) => item.state === 'OUT').length,
    stock_value: items.reduce((sum, item) => sum + item.value, 0),
  };

  res.json({ success: true, items, summary });
});

productsRouter.post('/', (req, res) => {
  const data = createSchema.parse(req.body ?? {});
  const code = data.code && data.code.length > 0 ? data.code.toUpperCase() : generateCode(data.name);

  try {
    const result = getDb()
      .prepare(
        `INSERT INTO commodities (code, name, category, unit, default_rate, rate_20kg, min_level, emoji)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        code,
        data.name,
        data.category,
        data.unit,
        data.default_rate,
        data.rate_20kg,
        data.min_level,
        data.emoji,
      );

    logActivity(req.user?.name ?? null, 'product.create', data.name);
    res.status(201).json({ success: true, id: Number(result.lastInsertRowid), code, message: 'Product added' });
  } catch (error) {
    if (String(error).includes('UNIQUE')) throw new HttpError(409, 'A product with this code already exists');
    throw error;
  }
});

productsRouter.patch('/:id', (req, res) => {
  const id = parseId(req.params.id);
  const data = updateSchema.parse(req.body ?? {});

  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (key === 'code' || value === undefined) continue;
    fields.push(`${key} = ?`);
    values.push(value);
  }
  if (fields.length === 0) throw new HttpError(400, 'Nothing to update');

  fields.push("updated_at = datetime('now')");
  values.push(id);
  const result = getDb().prepare(`UPDATE commodities SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  if (result.changes === 0) throw new HttpError(404, 'Product not found');

  logActivity(req.user?.name ?? null, 'product.update', `#${id}`);
  res.json({ success: true, id, message: 'Product updated' });
});

productsRouter.delete('/:id', (req, res) => {
  const id = parseId(req.params.id);
  const result = getDb()
    .prepare("UPDATE commodities SET status = 'INACTIVE', updated_at = datetime('now') WHERE id = ?")
    .run(id);
  if (result.changes === 0) throw new HttpError(404, 'Product not found');

  logActivity(req.user?.name ?? null, 'product.delete', `#${id}`);
  res.json({ success: true, message: 'Product removed' });
});
