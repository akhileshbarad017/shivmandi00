import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

let app: Express;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = path.join(os.tmpdir(), `shivmandi-reports-${randomUUID()}.sqlite`);

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

describe('reports', () => {
  it('builds P&L, daybook, balance sheet and commodity reports', async () => {
    const { agent, csrf } = await signIn('admin', 'admin123');

    const products = await agent.get('/api/products');
    const tomato = products.body.items.find((p: { name: string }) => p.name === 'Tomato');
    const supplier = await agent
      .post('/api/parties')
      .set('x-csrf-token', csrf)
      .send({ name: 'Report Supplier', type: 'supplier' });

    await agent
      .post('/api/sales')
      .set('x-csrf-token', csrf)
      .send({ buyer_name: 'Report Buyer', payment_type: 'Cash', items: [{ product_id: tomato.id, qty: 10, rate: 40 }] });
    await agent
      .post('/api/purchases')
      .set('x-csrf-token', csrf)
      .send({ supplier_id: supplier.body.id, items: [{ product_id: tomato.id, weight: 10, rate: 20 }] });
    await agent.post('/api/expenses').set('x-csrf-token', csrf).send({ amount: 50, head: 'Transport' });

    const pl = await agent.get('/api/reports/pl');
    expect(pl.body.summary.sales).toBe(400);
    expect(pl.body.summary.purchase).toBe(200);
    expect(pl.body.summary.expense).toBe(50);
    expect(pl.body.summary.net).toBe(150);
    expect(pl.body.expense_heads.some((r: { head: string }) => r.head === 'Transport')).toBe(true);

    const sales = await agent.get('/api/reports/sales');
    expect(sales.body.summary.gross).toBe(400);

    const purchases = await agent.get('/api/reports/purchases');
    expect(purchases.body.summary.net).toBe(200);

    const daybook = await agent.get('/api/reports/daybook');
    expect(daybook.body.summary.entries).toBeGreaterThanOrEqual(2);

    const sheet = await agent.get('/api/reports/balance-sheet');
    expect(sheet.body.summary.assets).toBeGreaterThan(0);
    expect(sheet.body.summary.liabilities).toBe(200);

    const commodity = await agent.get('/api/reports/commodity');
    expect(commodity.body.items.length).toBeGreaterThan(0);
    const tomatoRow = commodity.body.items.find((r: { name: string }) => r.name === 'Tomato');
    expect(tomatoRow.purchase_value).toBe(200);
    expect(tomatoRow.sale_value).toBe(400);
  });

});

describe('settings & account', () => {
  it('saves settings and updates the owner account', async () => {
    const { agent, csrf } = await signIn('admin', 'admin123');

    const save = await agent
      .post('/api/settings')
      .set('x-csrf-token', csrf)
      .send({ org_name: 'Test Mandi', commission_percent: '4' });
    expect(save.status).toBe(200);
    expect((await agent.get('/api/settings')).body.settings.org_name).toBe('Test Mandi');

    const account = await agent
      .patch('/api/settings/account')
      .set('x-csrf-token', csrf)
      .send({ name: 'Owner One', phone: '9000000000' });
    expect(account.status).toBe(200);
    expect(account.body.user.name).toBe('Owner One');

    const bad = await agent
      .patch('/api/settings/account')
      .set('x-csrf-token', csrf)
      .send({ current_password: 'wrong', new_password: 'newpass123' });
    expect(bad.status).toBe(400);
  });
});
