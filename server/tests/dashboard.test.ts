import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { LEDGER_ACCOUNTS } from '../src/db/ledger-data.js';

let app: Express;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = path.join(os.tmpdir(), `shivmandi-dash-${randomUUID()}.sqlite`);

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

describe('dashboard', () => {
  it('requires authentication', async () => {
    expect((await request(app).get('/api/dashboard')).status).toBe(401);
  });

  it('returns KPIs, money, weekly chart and recent bills', async () => {
    const { agent, csrf } = await signIn('admin', 'admin123');

    const empty = await agent.get('/api/dashboard');
    expect(empty.status).toBe(200);
    expect(empty.body.kpis.today_sales).toBe(0);
    expect(empty.body.weekly).toHaveLength(7);
    expect(Array.isArray(empty.body.recent_bills)).toBe(true);

    const products = await agent.get('/api/products');
    const tomato = products.body.items.find((p: { name: string }) => p.name === 'Tomato');
    const supplier = await agent
      .post('/api/parties')
      .set('x-csrf-token', csrf)
      .send({ name: 'Dash Supplier', type: 'supplier' });
    const buyer = await agent
      .post('/api/parties')
      .set('x-csrf-token', csrf)
      .send({ name: 'Dash Buyer', type: 'buyer' });

    await agent
      .post('/api/sales')
      .set('x-csrf-token', csrf)
      .send({ party_id: buyer.body.id, payment_type: 'Credit', items: [{ product_id: tomato.id, qty: 10, rate: 40 }] });
    await agent
      .post('/api/purchases')
      .set('x-csrf-token', csrf)
      .send({ supplier_id: supplier.body.id, items: [{ product_id: tomato.id, weight: 10, rate: 20 }] });
    await agent.post('/api/expenses').set('x-csrf-token', csrf).send({ amount: 50, head: 'Transport' });

    const dash = await agent.get('/api/dashboard');
    expect(dash.body.kpis.today_sales).toBe(400);
    expect(dash.body.kpis.today_purchases).toBe(200);
    expect(dash.body.kpis.today_expenses).toBe(50);
    expect(dash.body.kpis.estimated_profit).toBe(150);
    expect(dash.body.kpis.bills_today).toBe(1);
    expect(dash.body.kpis.stock_qty).toBe(0); // bought 10, sold 10

    // Seeded ledger plus the new 'Dash Buyer' credit sale (400).
    const seededBuyers = LEDGER_ACCOUNTS.filter((account) => (account.amount ?? 0) > 0).length;
    expect(dash.body.money.to_receive).toBe(2510594 + 400);
    expect(dash.body.money.receive_parties).toBe(seededBuyers + 1);
    expect(dash.body.money.to_pay).toBe(200);

    const today = dash.body.date;
    const todayPoint = dash.body.weekly.find((p: { date: string }) => p.date === today);
    expect(todayPoint.sales).toBe(400);

    expect(dash.body.recent_bills[0].invoice_no).toMatch(/^S-/);
  });
});
