import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { logActivity } from '../services/activity.js';
import { nextRef } from '../services/numbering.js';
import { todayISO } from '../utils/date.js';
import { HttpError } from '../utils/http.js';

const createSchema = z.object({
  vehicle_no: z.string().trim().min(1, 'Vehicle number is required').max(20),
  party_name: z.string().trim().max(120).optional().default(''),
  commodity_name: z.string().trim().max(120).optional().default(''),
  notes: z.string().trim().max(300).optional().default(''),
});

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid gate id');
  return id;
}

function nowTime(): string {
  return new Date().toTimeString().slice(0, 5);
}

export const gateRouter = Router();
gateRouter.use(requireAuth);

gateRouter.get('/', (req, res) => {
  const where: string[] = [];
  const args: unknown[] = [];
  if (req.query.status) {
    where.push('status = ?');
    args.push(String(req.query.status));
  }
  if (req.query.q) {
    where.push('(token_no LIKE ? OR vehicle_no LIKE ? OR party_name LIKE ?)');
    args.push(`%${req.query.q}%`, `%${req.query.q}%`, `%${req.query.q}%`);
  }
  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const db = getDb();
  const items = db
    .prepare(`SELECT * FROM gate_entries ${clause} ORDER BY id DESC LIMIT 300`)
    .all(...args) as Array<Record<string, unknown>>;

  const today = todayISO();
  const todayCount = (db
    .prepare('SELECT COUNT(*) AS n FROM gate_entries WHERE substr(created_at, 1, 10) = ?')
    .get(today) as { n: number }).n;

  res.json({
    success: true,
    items,
    summary: {
      inside: items.filter((row) => row.status === 'IN').length,
      cleared: items.filter((row) => row.status === 'CLEARED').length,
      today: todayCount,
      total: items.length,
    },
  });
});

gateRouter.post('/', (req, res) => {
  const data = createSchema.parse(req.body ?? {});
  const db = getDb();

  const tokenNo = db.transaction(() => {
    const no = nextRef('gate');
    db.prepare(
      `INSERT INTO gate_entries (token_no, vehicle_no, party_name, commodity_name, in_time, status, notes)
       VALUES (?, ?, ?, ?, ?, 'IN', ?)`,
    ).run(no, data.vehicle_no.toUpperCase(), data.party_name, data.commodity_name, nowTime(), data.notes);
    return no;
  })();

  logActivity(req.user?.name ?? null, 'gate.in', `${tokenNo} · ${data.vehicle_no}`);
  res.status(201).json({ success: true, token_no: tokenNo, message: 'Gate entry added' });
});

gateRouter.patch('/:id/clear', (req, res) => {
  const id = parseId(req.params.id);
  const result = getDb()
    .prepare("UPDATE gate_entries SET status = 'CLEARED', out_time = ? WHERE id = ?")
    .run(nowTime(), id);
  if (result.changes === 0) throw new HttpError(404, 'Gate entry not found');
  logActivity(req.user?.name ?? null, 'gate.clear', `#${id}`);
  res.json({ success: true, message: 'Vehicle cleared' });
});

gateRouter.delete('/:id', (req, res) => {
  const id = parseId(req.params.id);
  const result = getDb().prepare('DELETE FROM gate_entries WHERE id = ?').run(id);
  if (result.changes === 0) throw new HttpError(404, 'Gate entry not found');
  logActivity(req.user?.name ?? null, 'gate.delete', `#${id}`);
  res.json({ success: true, message: 'Gate entry deleted' });
});
