import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

let app: Express;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = path.join(os.tmpdir(), `shivmandi-bulk-${randomUUID()}.sqlite`);

  const [{ createApp }, { migrate }, { seed }] = await Promise.all([
    import('../src/app.js'),
    import('../src/db/migrate.js'),
    import('../src/db/seed.js'),
  ]);

  migrate();
  seed();
  app = createApp();
});

async function signIn() {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ identity: 'admin', password: 'admin123' });
  return { agent, csrf: res.body.csrf as string };
}

describe('bulk billing', () => {
  it('generates one bill per customer, is idempotent, and supports repeat/payment', async () => {
    const { agent, csrf } = await signIn();
    const products = await agent.get('/api/products');
    const tomato = products.body.items.find((p: { name: string }) => p.name === 'Tomato');
    const onion = products.body.items.find((p: { name: string }) => p.name === 'Onion');

    const buyerA = (await agent.post('/api/parties').set('x-csrf-token', csrf).send({ name: 'Bulk A', type: 'buyer' })).body.id;
    const buyerB = (await agent.post('/api/parties').set('x-csrf-token', csrf).send({ name: 'Bulk B', type: 'buyer' })).body.id;

    const key = `test-${randomUUID()}`;
    const bulk = await agent
      .post('/api/sales/bulk')
      .set('x-csrf-token', csrf)
      .send({
        idempotency_key: key,
        payment_type: 'Credit',
        customers: [
          { party_id: buyerA, items: [{ product_id: tomato.id, unit: 'KG', qty: 5, rate: 40 }] },
          { party_id: buyerB, items: [{ product_id: onion.id, unit: 'KG', qty: 10, rate: 25 }] },
        ],
      });

    expect(bulk.status).toBe(201);
    expect(bulk.body.summary.bills).toBe(2);
    expect(bulk.body.invoices).toHaveLength(2);
    expect(bulk.body.summary.total_sales).toBe(450); // 200 + 250
    expect(bulk.body.summary.total_pending).toBe(450);
    const invoiceA = bulk.body.invoices[0].invoice_no as string;

    // buyer A pending = 200
    const partyA = await agent.get('/api/parties?type=buyer&q=Bulk A');
    expect(partyA.body.items[0].balance).toBe(200);

    // Replay the same batch -> no duplicate bills
    const replay = await agent.post('/api/sales/bulk').set('x-csrf-token', csrf).send({
      idempotency_key: key,
      payment_type: 'Credit',
      customers: [
        { party_id: buyerA, items: [{ product_id: tomato.id, unit: 'KG', qty: 5, rate: 40 }] },
        { party_id: buyerB, items: [{ product_id: onion.id, unit: 'KG', qty: 10, rate: 25 }] },
      ],
    });
    expect(replay.status).toBe(200);
    expect(replay.body.duplicate).toBe(true);

    const list = await agent.get('/api/sales?q=Bulk');
    expect(list.body.items).toHaveLength(2); // still only two bills

    // Repeat last bill for buyer A
    const last = await agent.get(`/api/sales/last?party_id=${buyerA}`);
    expect(last.body.invoice.invoice_no).toBe(invoiceA);
    expect(last.body.items[0].product_id).toBe(tomato.id);
    expect(last.body.items[0].qty).toBe(5);

    // Pay part of bill A -> invoice + buyer balance update
    const pay = await agent.post(`/api/sales/${invoiceA}/payment`).set('x-csrf-token', csrf).send({ amount: 150 });
    expect(pay.status).toBe(201);
    expect(pay.body.paid).toBe(150);
    expect(pay.body.due).toBe(50);

    const partyA2 = await agent.get('/api/parties?type=buyer&q=Bulk A');
    expect(partyA2.body.items[0].balance).toBe(50);

    // Profile stats + item-level history
    const profile = await agent.get(`/api/parties/${buyerA}/profile`);
    expect(profile.status).toBe(200);
    expect(profile.body.stats.total_pending).toBe(50);
    expect(profile.body.invoices[0].items[0].commodity_name).toBe(tomato.name);
  });
});
