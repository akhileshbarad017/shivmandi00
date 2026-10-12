import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { logActivity } from '../services/activity.js';
import { getSetting } from '../services/settings.js';
import { formatINR } from '../utils/money.js';
import { HttpError } from '../utils/http.js';

interface InvoiceRow {
  invoice_no: string;
  buyer_name: string;
  total_amount: number;
  balance_due: number;
}

const createSchema = z.object({
  invoice_no: z.string().trim().max(40).optional().default(''),
  party_name: z.string().trim().max(120).optional().default(''),
  phone: z.string().trim().max(20).optional().default(''),
  message: z.string().trim().max(1000).optional().default(''),
});

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

function buildMessage(invoice: InvoiceRow, shop: string): string {
  const lines = [
    `Namaste ${invoice.buyer_name},`,
    `Your bill ${invoice.invoice_no} is ready.`,
    `Total: ${formatINR(invoice.total_amount)}`,
  ];
  if (invoice.balance_due > 0.005) lines.push(`Balance due: ${formatINR(invoice.balance_due)}`);
  lines.push(`— ${shop}`);
  return lines.join('\n');
}

export const whatsappRouter = Router();
whatsappRouter.use(requireAuth);

whatsappRouter.get('/', (_req, res) => {
  const items = getDb()
    .prepare('SELECT * FROM whatsapp_log ORDER BY created_at DESC, id DESC LIMIT 200')
    .all() as Array<Record<string, unknown>>;

  const today = new Date().toISOString().slice(0, 10);
  res.json({
    success: true,
    items,
    summary: {
      sent: items.length,
      today: items.filter((row) => String(row.created_at).slice(0, 10) === today).length,
    },
  });
});

whatsappRouter.post('/', (req, res) => {
  const data = createSchema.parse(req.body ?? {});
  const db = getDb();
  const shop = getSetting('org_name', 'Shiv Bhole Vegetable');

  let partyName = data.party_name;
  let phone = data.phone;
  let message = data.message;

  if (data.invoice_no) {
    const invoice = db
      .prepare(
        'SELECT invoice_no, buyer_name, total_amount, balance_due FROM sales_invoices WHERE invoice_no = ?',
      )
      .get(data.invoice_no) as InvoiceRow | undefined;
    if (!invoice) throw new HttpError(404, 'Invoice not found');
    partyName = partyName || invoice.buyer_name;
    if (!message) message = buildMessage(invoice, shop);
  }

  if (!message) throw new HttpError(400, 'Nothing to send');

  const normalized = normalizePhone(phone);
  const result = db
    .prepare(
      `INSERT INTO whatsapp_log (invoice_no, party_name, phone, message, status)
       VALUES (?, ?, ?, ?, 'SENT')`,
    )
    .run(data.invoice_no, partyName, normalized, message);

  logActivity(req.user?.name ?? null, 'whatsapp.send', partyName || data.invoice_no);

  res.status(201).json({
    success: true,
    id: Number(result.lastInsertRowid),
    message,
    wa_url: normalized ? `https://wa.me/${normalized}?text=${encodeURIComponent(message)}` : null,
  });
});

whatsappRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid id');
  const result = getDb().prepare('DELETE FROM whatsapp_log WHERE id = ?').run(id);
  if (result.changes === 0) throw new HttpError(404, 'Log entry not found');
  res.json({ success: true, message: 'Log entry removed' });
});
