import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { logActivity } from '../services/activity.js';
import { nextRef } from '../services/numbering.js';
import { todayISO } from '../utils/date.js';
import { HttpError } from '../utils/http.js';
import { money, round2 } from '../utils/money.js';

const createSchema = z.object({
  date: z.string().trim().optional(),
  farmer_id: z.coerce.number().int().positive().optional(),
  farmer_name: z.string().trim().max(120).optional().default(''),
  commodity_id: z.coerce.number().int().positive('Choose a commodity'),
  bags: z.coerce.number().min(0).default(0),
  weight: z.coerce.number().positive('Weight must be greater than zero'),
  rate: z.coerce.number().min(0).default(0),
  vehicle_no: z.string().trim().max(20).optional().default(''),
  notes: z.string().trim().max(300).optional().default(''),
});

const patchSchema = z.object({
  status: z.enum(['PENDING', 'AUCTIONED', 'SOLD']).optional(),
  rate: z.coerce.number().min(0).optional(),
  notes: z.string().trim().max(300).optional(),
});

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid arrival id');
  return id;
}

export const arrivalsRouter = Router();
arrivalsRouter.use(requireAuth);

arrivalsRouter.get('/', (req, res) => {
  const where: string[] = [];
  const args: unknown[] = [];
  if (req.query.date) {
    where.push('date = ?');
    args.push(String(req.query.date));
  }
  if (req.query.from) {
    where.push('date >= ?');
    args.push(String(req.query.from));
  }
  if (req.query.to) {
    where.push('date <= ?');
    args.push(String(req.query.to));
  }
  if (req.query.status) {
    where.push('status = ?');
    args.push(String(req.query.status));
  }
  if (req.query.q) {
    where.push('(arrival_no LIKE ? OR farmer_name LIKE ? OR commodity_name LIKE ?)');
    args.push(`%${req.query.q}%`, `%${req.query.q}%`, `%${req.query.q}%`);
  }
  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const items = getDb()
    .prepare(`SELECT * FROM arrivals ${clause} ORDER BY date DESC, id DESC LIMIT 300`)
    .all(...args) as Array<Record<string, unknown>>;

  const valued: Array<Record<string, unknown>> = items.map((row) => ({
    ...row,
    weight: round2(Number(row.weight)),
    rate: money(row.rate),
    value: money(Number(row.weight) * Number(row.rate)),
  }));

  res.json({
    success: true,
    items: valued,
    summary: {
      lots: valued.length,
      weight: round2(valued.reduce((sum, row) => sum + Number(row.weight), 0)),
      value: round2(valued.reduce((sum, row) => sum + Number(row.value), 0)),
      pending: valued.filter((row) => row.status === 'PENDING').length,
    },
  });
});

arrivalsRouter.post('/', (req, res) => {
  const data = createSchema.parse(req.body ?? {});
  const db = getDb();
  const date = data.date ?? todayISO();

  const commodity = db.prepare('SELECT id, name FROM commodities WHERE id = ?').get(data.commodity_id) as
    | { id: number; name: string }
    | undefined;
  if (!commodity) throw new HttpError(400, 'Commodity not found');

  let farmerName = data.farmer_name;
  if (data.farmer_id) {
    const farmer = db.prepare('SELECT name FROM contacts WHERE id = ?').get(data.farmer_id) as
      | { name: string }
      | undefined;
    if (farmer) farmerName = farmer.name;
  }
  if (!farmerName) farmerName = 'Unknown farmer';

  const arrivalNo = db.transaction(() => {
    const no = nextRef('arrival');
    db.prepare(
      `INSERT INTO arrivals (arrival_no, date, farmer_id, farmer_name, commodity_id, commodity_name, bags, weight, rate, vehicle_no, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      no,
      date,
      data.farmer_id ?? null,
      farmerName,
      commodity.id,
      commodity.name,
      data.bags,
      data.weight,
      data.rate,
      data.vehicle_no,
      data.notes,
    );
    return no;
  })();

  logActivity(req.user?.name ?? null, 'arrival.create', `${arrivalNo} · ${farmerName}`, data.weight);
  res.status(201).json({ success: true, arrival_no: arrivalNo, message: 'Arrival recorded' });
});

arrivalsRouter.patch('/:id', (req, res) => {
  const id = parseId(req.params.id);
  const data = patchSchema.parse(req.body ?? {});
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    values.push(value);
  }
  if (fields.length === 0) throw new HttpError(400, 'Nothing to update');
  values.push(id);
  const result = getDb().prepare(`UPDATE arrivals SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  if (result.changes === 0) throw new HttpError(404, 'Arrival not found');
  res.json({ success: true, id, message: 'Arrival updated' });
});

arrivalsRouter.delete('/:id', (req, res) => {
  const id = parseId(req.params.id);
  const result = getDb().prepare('DELETE FROM arrivals WHERE id = ?').run(id);
  if (result.changes === 0) throw new HttpError(404, 'Arrival not found');
  logActivity(req.user?.name ?? null, 'arrival.delete', `#${id}`);
  res.json({ success: true, message: 'Arrival deleted' });
});
