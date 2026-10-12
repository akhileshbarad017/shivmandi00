import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { logActivity } from '../services/activity.js';
import { todayISO } from '../utils/date.js';
import { HttpError } from '../utils/http.js';

interface VehicleRow {
  id: number;
  vehicle_no: string;
  driver_name: string | null;
  driver_phone: string | null;
  owner_name: string | null;
  vehicle_type: string;
  capacity_kg: number;
  status: string;
  notes: string | null;
  created_at: string;
}

const vehicleSchema = z.object({
  vehicle_no: z.string().trim().min(1, 'Vehicle number is required'),
  driver_name: z.string().trim().max(80).optional().default(''),
  driver_phone: z.string().trim().max(20).optional().default(''),
  owner_name: z.string().trim().max(80).optional().default(''),
  vehicle_type: z.string().trim().max(40).optional().default('Tempo'),
  capacity_kg: z.coerce.number().min(0).default(0),
  status: z.enum(['ACTIVE', 'MAINTENANCE', 'IDLE']).default('ACTIVE'),
  notes: z.string().trim().max(300).optional().default(''),
});

const updateSchema = vehicleSchema.partial();

function normalizeNo(value: string): string {
  return value.toUpperCase().replace(/\s+/g, '');
}

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid vehicle id');
  return id;
}

export const vehiclesRouter = Router();
vehiclesRouter.use(requireAuth);

vehiclesRouter.get('/', (_req, res) => {
  const db = getDb();
  const today = todayISO();

  const vehicles = db
    .prepare('SELECT * FROM vehicles ORDER BY vehicle_no')
    .all() as VehicleRow[];

  const tripsStmt = db.prepare(
    'SELECT COUNT(*) AS n, MAX(date) AS last FROM purchases WHERE vehicle_no = ?',
  );
  const tripsTodayStmt = db.prepare(
    'SELECT COUNT(*) AS n FROM purchases WHERE vehicle_no = ? AND date = ?',
  );

  const items = vehicles.map((vehicle) => {
    const trips = tripsStmt.get(vehicle.vehicle_no) as { n: number; last: string | null };
    const todayTrips = tripsTodayStmt.get(vehicle.vehicle_no, today) as { n: number };
    return {
      ...vehicle,
      capacity_kg: Number(vehicle.capacity_kg ?? 0),
      trips_today: todayTrips.n,
      trips_total: trips.n,
      last_trip: trips.last,
    };
  });

  const seen = db
    .prepare(
      `SELECT DISTINCT vehicle_no FROM purchases
        WHERE vehicle_no IS NOT NULL AND vehicle_no != ''
          AND vehicle_no NOT IN (SELECT vehicle_no FROM vehicles)
        ORDER BY vehicle_no`,
    )
    .all() as Array<{ vehicle_no: string }>;

  res.json({
    success: true,
    items,
    unlisted: seen.map((row) => row.vehicle_no),
    summary: {
      total: items.length,
      active: items.filter((vehicle) => vehicle.status === 'ACTIVE').length,
      trips_today: items.reduce((sum, vehicle) => sum + vehicle.trips_today, 0),
    },
  });
});

vehiclesRouter.post('/', (req, res) => {
  const data = vehicleSchema.parse(req.body ?? {});
  const vehicleNo = normalizeNo(data.vehicle_no);
  const db = getDb();

  try {
    const result = db
      .prepare(
        `INSERT INTO vehicles (vehicle_no, driver_name, driver_phone, owner_name, vehicle_type, capacity_kg, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        vehicleNo,
        data.driver_name,
        data.driver_phone,
        data.owner_name,
        data.vehicle_type,
        data.capacity_kg,
        data.status,
        data.notes,
      );
    logActivity(req.user?.name ?? null, 'vehicle.create', vehicleNo);
    res.status(201).json({ success: true, id: Number(result.lastInsertRowid), message: 'Vehicle added' });
  } catch (error) {
    if (String(error).includes('UNIQUE')) throw new HttpError(409, 'This vehicle number already exists');
    throw error;
  }
});

vehiclesRouter.patch('/:id', (req, res) => {
  const id = parseId(req.params.id);
  const data = updateSchema.parse(req.body ?? {});

  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    values.push(key === 'vehicle_no' ? normalizeNo(String(value)) : value);
  }
  if (fields.length === 0) throw new HttpError(400, 'Nothing to update');

  values.push(id);
  const result = getDb().prepare(`UPDATE vehicles SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  if (result.changes === 0) throw new HttpError(404, 'Vehicle not found');

  logActivity(req.user?.name ?? null, 'vehicle.update', `#${id}`);
  res.json({ success: true, id, message: 'Vehicle updated' });
});

vehiclesRouter.delete('/:id', (req, res) => {
  const id = parseId(req.params.id);
  const result = getDb().prepare('DELETE FROM vehicles WHERE id = ?').run(id);
  if (result.changes === 0) throw new HttpError(404, 'Vehicle not found');

  logActivity(req.user?.name ?? null, 'vehicle.delete', `#${id}`);
  res.json({ success: true, message: 'Vehicle removed' });
});
