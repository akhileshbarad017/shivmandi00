import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

let app: Express;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = path.join(os.tmpdir(), `shivmandi-finance-${randomUUID()}.sqlite`);

  const [{ createApp }, { migrate }, { seed }] = await Promise.all([
    import('../src/app.js'),
    import('../src/db/migrate.js'),
    import('../src/db/seed.js'),
  ]);

  migrate();
  seed();
  app = createApp();
});

async function signIn(identity: string, password: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ identity, password });
  return { agent, csrf: res.body.csrf as string };
}

describe('payments & expenses', () => {
  it('records receipts/payments and keeps party balance in sync', async () => {
    const { agent, csrf } = await signIn('admin', 'admin123');

    const products = await agent.get('/api/products');
    const tomato = products.body.items.find((p: { name: string }) => p.name === 'Tomato');

    const buyer = await agent
      .post('/api/parties')
      .set('x-csrf-token', csrf)
      .send({ name: 'Finance Buyer', type: 'buyer' });

    // give the buyer a payable balance
    await agent
      .post('/api/sales')
      .set('x-csrf-token', csrf)
      .send({ party_id: buyer.body.id, payment_type: 'Credit', items: [{ product_id: tomato.id, qty: 10, rate: 40 }] });

    const balanceOf = async (id: number, type: string) => {
      const list = await agent.get(`/api/parties?type=${type}`);
      return list.body.items.find((p: { id: number }) => p.id === id).balance as number;
    };

    expect(await balanceOf(buyer.body.id, 'buyer')).toBe(400);

    const receipt = await agent
      .post('/api/payments')
      .set('x-csrf-token', csrf)
      .send({ type: 'receipt', amount: 100, party_id: buyer.body.id, mode: 'UPI' });
    expect(receipt.status).toBe(201);
    expect(await balanceOf(buyer.body.id, 'buyer')).toBe(300);

    // a payout/refund to a buyer increases their receivable
    const payout = await agent
      .post('/api/payments')
      .set('x-csrf-token', csrf)
      .send({ type: 'payment', amount: 50, party_id: buyer.body.id });
    expect(payout.status).toBe(201);
    expect(await balanceOf(buyer.body.id, 'buyer')).toBe(350);

    const list = await agent.get('/api/payments');
    expect(list.body.items.length).toBeGreaterThanOrEqual(2);
    expect(list.body.summary.inflow).toBe(100);
    expect(list.body.summary.outflow).toBe(50);

    // deleting the payout reverses the balance change
    const payoutId = list.body.items.find((row: { voucher_no: string }) => row.voucher_no === payout.body.voucher_no).id;
    const del = await agent.delete(`/api/payments/${payoutId}`).set('x-csrf-token', csrf);
    expect(del.status).toBe(200);
    expect(await balanceOf(buyer.body.id, 'buyer')).toBe(300);
  });

  it('records and deletes expenses', async () => {
    const { agent, csrf } = await signIn('admin', 'admin123');

    const created = await agent
      .post('/api/expenses')
      .set('x-csrf-token', csrf)
      .send({ amount: 250, head: 'Transport', mode: 'Cash' });
    expect(created.status).toBe(201);

    const list = await agent.get('/api/expenses');
    expect(list.body.summary.total).toBe(250);
    expect(list.body.summary.by_head.some((row: { head: string }) => row.head === 'Transport')).toBe(true);

    const expenseId = list.body.items[0].id as number;
    expect((await agent.delete(`/api/expenses/${expenseId}`).set('x-csrf-token', csrf)).status).toBe(200);
  });

  it('logs whatsapp bills and returns a wa.me link', async () => {
    const { agent, csrf } = await signIn('admin', 'admin123');

    const products = await agent.get('/api/products');
    const onion = products.body.items.find((p: { name: string }) => p.name === 'Onion');
    const sale = await agent
      .post('/api/sales')
      .set('x-csrf-token', csrf)
      .send({ buyer_name: 'WhatsApp Buyer', buyer_phone: '9876543210', payment_type: 'Credit', items: [{ product_id: onion.id, qty: 2, rate: 30 }] });
    const invoiceNo = sale.body.invoice_no as string;

    const sent = await agent
      .post('/api/whatsapp')
      .set('x-csrf-token', csrf)
      .send({ invoice_no: invoiceNo, phone: '9876543210' });
    expect(sent.status).toBe(201);
    expect(sent.body.message).toContain('Namaste');
    expect(sent.body.wa_url).toContain('https://wa.me/919876543210');

    const log = await agent.get('/api/whatsapp');
    expect(log.body.items.length).toBeGreaterThanOrEqual(1);
    expect((await agent.delete(`/api/whatsapp/${log.body.items[0].id}`).set('x-csrf-token', csrf)).status).toBe(200);
  });
});
