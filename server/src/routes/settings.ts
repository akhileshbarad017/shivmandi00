import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/connection.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { requireAuth } from '../middleware/auth.js';
import { logActivity } from '../services/activity.js';
import { getSettings, setSetting } from '../services/settings.js';
import { HttpError } from '../utils/http.js';

/** Keys the settings screen is allowed to write. */
export const EDITABLE_SETTINGS = [
  'org_name',
  'brand_title',
  'tagline',
  'app_user',
  'phone',
  'email',
  'gstin',
  'address',
  'market_city',
  'shop_no',
  'contact1_name',
  'contact1_phone',
  'contact2_name',
  'contact2_phone',
  'contact2_phone2',
  'fy_start',
  'language',
  'gst_percent',
  'upi_id',
  'invoice_footer',
  'bank_name',
  'bank_holder',
  'bank_ac_no',
  'bank_ifsc',
  'bank_branch',
  'theme',
  'skin',
  'low_stock_default',
] as const;

const accountSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80).optional(),
  username: z.string().trim().min(3, 'Username must be at least 3 characters').max(40).optional(),
  phone: z.string().trim().max(20).optional(),
  current_password: z.string().optional(),
  new_password: z.string().min(6, 'New password must be at least 6 characters').optional(),
});

export const settingsRouter = Router();

settingsRouter.get('/', requireAuth, (_req, res) => {
  res.json({ success: true, settings: getSettings() });
});

settingsRouter.post('/', requireAuth, (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const updated: string[] = [];

  for (const key of EDITABLE_SETTINGS) {
    if (key in body && body[key] !== undefined && body[key] !== null) {
      setSetting(key, String(body[key]));
      updated.push(key);
    }
  }

  if (updated.length === 0) {
    res.status(400).json({ success: false, error: 'Nothing to save' });
    return;
  }

  logActivity(req.user?.name ?? null, 'settings.update', updated.join(', '));
  res.json({ success: true, updated, message: 'Settings saved' });
});

/** The single owner account: profile + password change. */
settingsRouter.patch('/account', requireAuth, (req, res) => {
  const data = accountSchema.parse(req.body ?? {});
  const db = getDb();
  const user = db.prepare('SELECT id, username, password_hash FROM users WHERE id = ?').get(req.user!.id) as
    | { id: number; username: string; password_hash: string }
    | undefined;
  if (!user) throw new HttpError(404, 'Account not found');

  const fields: string[] = [];
  const values: unknown[] = [];

  if (data.name !== undefined) {
    fields.push('name = ?');
    values.push(data.name);
  }
  if (data.username !== undefined && data.username !== user.username) {
    const exists = db.prepare('SELECT 1 FROM users WHERE username = ? AND id != ?').get(data.username, user.id);
    if (exists) throw new HttpError(409, 'That username is already taken');
    fields.push('username = ?');
    values.push(data.username);
  }
  if (data.phone !== undefined) {
    fields.push('phone = ?');
    values.push(data.phone);
  }
  if (data.new_password) {
    if (!data.current_password || !verifyPassword(data.current_password, user.password_hash)) {
      throw new HttpError(400, 'Current password is incorrect');
    }
    fields.push('password_hash = ?');
    values.push(hashPassword(data.new_password));
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  }

  if (fields.length === 0) throw new HttpError(400, 'Nothing to update');

  fields.push("updated_at = datetime('now')");
  values.push(user.id);
  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  logActivity(req.user?.name ?? null, 'account.update', fields.join(', '));
  const fresh = db.prepare('SELECT id, username, name, phone FROM users WHERE id = ?').get(user.id);
  res.json({ success: true, user: fresh, message: 'Account updated' });
});
