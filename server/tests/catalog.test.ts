import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

let app: Express;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = path.join(os.tmpdir(), `shivmandi-catalog-${randomUUID()}.sqlite`);

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

describe('products', () => {
  it('creates, lists, updates and soft-deletes a product', async () => {
    const { agent, csrf } = await signIn('admin', 'admin123');

    const created = await agent
      .post('/api/products')
      .set('x-csrf-token', csrf)
      .send({ name: 'Green Peas', category: 'Vegetables', unit: 'kg', default_rate: 55, min_level: 30 });
    expect(created.status).toBe(201);
    expect(created.body.code).toBeTruthy();
    const id = created.body.id as number;

    const list = await agent.get('/api/products');
    expect(list.status).toBe(200);
    expect(list.body.items.some((p: { id: number }) => p.id === id)).toBe(true);

    const patched = await agent
      .patch(`/api/products/${id}`)
      .set('x-csrf-token', csrf)
      .send({ default_rate: 60 });
    expect(patched.status).toBe(200);

    const removed = await agent.delete(`/api/products/${id}`).set('x-csrf-token', csrf);
    expect(removed.status).toBe(200);

    const after = await agent.get('/api/products');
    expect(after.body.items.some((p: { id: number }) => p.id === id)).toBe(false);
  });

  it('requires a CSRF token for mutations', async () => {
    const { agent } = await signIn('admin', 'admin123');
    const res = await agent.post('/api/products').send({ name: 'No Csrf' });
    expect(res.status).toBe(403);
  });
});

describe('parties + khata', () => {
  it('creates a party and reflects payouts in the ledger', async () => {
    const { agent, csrf } = await signIn('admin', 'admin123');

    const created = await agent
      .post('/api/parties')
      .set('x-csrf-token', csrf)
      .send({ name: 'Test Buyer', type: 'buyer', phone: '9000000001', address: 'Pune' });
    expect(created.status).toBe(201);
    expect(created.body.code).toMatch(/^CUS-\d{4}$/);
    const id = created.body.id as number;

    const list = await agent.get('/api/parties?type=buyer&q=Test');
    expect(list.body.items[0].name).toBe('Test Buyer');

    const payout = await agent
      .post(`/api/parties/${id}/payment`)
      .set('x-csrf-token', csrf)
      .send({ amount: 1500, direction: 'out', mode: 'Cash' });
    expect(payout.status).toBe(201);
    expect(payout.body.balance).toBe(1500);

    const ledger = await agent.get(`/api/parties/${id}/ledger`);
    expect(ledger.status).toBe(200);
    expect(ledger.body.totals.balance).toBe(1500);
    expect(ledger.body.entries[0].label).toBe('Payment');
  });

  it('paginates, sorts by outstanding and tracks frequently used parties', async () => {
    const { agent, csrf } = await signIn('admin', 'admin123');

    const first = await agent.get('/api/parties?sort=balance&limit=5');
    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(5);
    expect(first.body.total).toBeGreaterThan(5);
    const balances = (first.body.items as Array<{ balance: number }>).map((row) => row.balance);
    expect(balances).toEqual([...balances].sort((a, b) => b - a));

    const second = await agent.get('/api/parties?sort=balance&limit=5&offset=5');
    const firstIds = new Set((first.body.items as Array<{ id: number }>).map((row) => row.id));
    expect((second.body.items as Array<{ id: number }>).every((row) => !firstIds.has(row.id))).toBe(true);

    // Opening a profile bumps usage, so the party shows under "frequent".
    const created = await agent
      .post('/api/parties')
      .set('x-csrf-token', csrf)
      .send({ name: `Frequent ${Date.now()}`, type: 'buyer' });
    const id = created.body.id as number;
    await agent.get(`/api/parties/${id}/profile`);

    const freq = await agent.get('/api/parties?sort=frequent&limit=50');
    const entry = (freq.body.items as Array<{ id: number; usage_count: number }>).find((row) => row.id === id);
    expect(entry).toBeTruthy();
    expect(entry!.usage_count).toBeGreaterThan(0);
  });
});

describe('stock', () => {
  it('derives stock from adjustments and removes them', async () => {
    const { agent, csrf } = await signIn('admin', 'admin123');

    const products = await agent.get('/api/products');
    const tomato = products.body.items.find((p: { name: string }) => p.name === 'Tomato');
    expect(tomato).toBeTruthy();

    const plus = await agent
      .post('/api/stock/adjust')
      .set('x-csrf-token', csrf)
      .send({ commodity_id: tomato.id, qty: 100, reason: 'Opening stock' });
    expect(plus.status).toBe(201);
    expect(plus.body.stock).toBe(100);

    const minus = await agent
      .post('/api/stock/adjust')
      .set('x-csrf-token', csrf)
      .send({ commodity_id: tomato.id, qty: -30, reason: 'Spoilage' });
    expect(minus.body.stock).toBe(70);

    const stock = await agent.get('/api/stock');
    const row = stock.body.items.find((p: { id: number }) => p.id === tomato.id);
    expect(row.stock).toBe(70);
    expect(stock.body.adjustments.length).toBeGreaterThanOrEqual(2);

    const removeId = stock.body.adjustments.find((a: { qty: number }) => a.qty === -30).id as number;
    const removed = await agent.delete(`/api/stock/adjustments/${removeId}`).set('x-csrf-token', csrf);
    expect(removed.status).toBe(200);

    const afterRow = (await agent.get('/api/stock')).body.items.find(
      (p: { id: number }) => p.id === tomato.id,
    );
    expect(afterRow.stock).toBe(100);
  });
});
