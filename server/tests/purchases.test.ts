import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

let app: Express;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = path.join(os.tmpdir(), `shivmandi-purchase-${randomUUID()}.sqlite`);

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

async function context() {
  const { agent, csrf } = await signIn('admin', 'admin123');
  const products = await agent.get('/api/products');
  const tomato = products.body.items.find((p: { name: string }) => p.name === 'Tomato');
  const commissionAgent = await agent
    .post('/api/parties')
    .set('x-csrf-token', csrf)
    .send({ name: `Commission Agent ${Date.now()}`, type: 'agent' });
  const supplier = await agent
    .post('/api/parties')
    .set('x-csrf-token', csrf)
    .send({ name: `Supplier ${Date.now()}`, type: 'supplier' });
  return {
    agent,
    csrf,
    tomato,
    commissionAgent: { id: commissionAgent.body.id as number },
    supplier: { id: supplier.body.id as number },
  };
}

describe('purchases', () => {
  it('deducts commission for a farmer/agent and updates stock', async () => {
    const { agent, csrf, tomato, commissionAgent } = await context();

    const stockBefore = (await agent.get('/api/stock')).body.items.find(
      (p: { id: number }) => p.id === tomato.id,
    ).stock as number;

    const created = await agent
      .post('/api/purchases')
      .set('x-csrf-token', csrf)
      .send({
        supplier_id: commissionAgent.id,
        items: [{ product_id: tomato.id, unit: 'KG', weight: 100, rate: 20 }],
        commission_percent: 5,
        paid: 500,
        payment_mode: 'Cash',
      });

    expect(created.status).toBe(201);
    expect(created.body.goods_amount).toBe(2000);
    expect(created.body.commission_percent).toBe(5);
    expect(created.body.commission_amount).toBe(100);
    expect(created.body.net_amount).toBe(1900); // 2000 - 100 (deducted)
    expect(created.body.balance_due).toBe(1400); // 1900 - 500
    const billNo = created.body.bill_no as string;

    // stock increased by 100
    const stock = await agent.get('/api/stock');
    const tomatoStock = stock.body.items.find((p: { id: number }) => p.id === tomato.id);
    expect(tomatoStock.stock).toBe(stockBefore + 100);

    // agent payable = 1400
    const parties = await agent.get('/api/parties?type=agent');
    expect(parties.body.items.find((p: { id: number }) => p.id === commissionAgent.id).balance).toBe(1400);

    // detail
    const detail = await agent.get(`/api/purchases/${billNo}`);
    expect(detail.body.items).toHaveLength(1);
    expect(detail.body.bill.commission_percent).toBe(5);
    expect(detail.body.bill.commission_amount).toBe(100);
    expect(detail.body.payments).toHaveLength(1);

    // list + status
    const list = await agent.get('/api/purchases?status=PARTIAL');
    expect(list.body.items.some((b: { bill_no: string }) => b.bill_no === billNo)).toBe(true);
  });

  it('ignores commission for a supplier and supports payments', async () => {
    const { agent, csrf, tomato, supplier } = await context();

    const stockBefore = (await agent.get('/api/stock')).body.items.find(
      (p: { id: number }) => p.id === tomato.id,
    ).stock as number;

    const created = await agent
      .post('/api/purchases')
      .set('x-csrf-token', csrf)
      .send({
        supplier_id: supplier.id,
        items: [{ product_id: tomato.id, weight: 50, rate: 10 }],
        paid: 0,
      });
    const billNo = created.body.bill_no as string;
    expect(created.body.commission_amount).toBe(0);
    expect(created.body.net_amount).toBe(500);
    expect(created.body.balance_due).toBe(500);

    const pay = await agent
      .post(`/api/purchases/${billNo}/pay`)
      .set('x-csrf-token', csrf)
      .send({ amount: 200, mode: 'UPI' });
    expect(pay.status).toBe(201);
    expect(pay.body.paid).toBe(200);
    expect(pay.body.due).toBe(300);

    const detail = await agent.get(`/api/purchases/${billNo}`);
    const paymentId = detail.body.payments[0].id as number;

    const reverse = await agent
      .delete(`/api/purchases/${billNo}/payments/${paymentId}`)
      .set('x-csrf-token', csrf);
    expect(reverse.status).toBe(200);

    const afterReverse = await agent.get(`/api/purchases/${billNo}`);
    expect(afterReverse.body.bill.paid_amount).toBe(0);
    expect(afterReverse.body.bill.balance_due).toBe(500);

    const removed = await agent.delete(`/api/purchases/${billNo}`).set('x-csrf-token', csrf);
    expect(removed.status).toBe(200);

    const gone = await agent.get(`/api/purchases/${billNo}`);
    expect(gone.status).toBe(404);

    const stock = await agent.get('/api/stock');
    const tomatoStock = stock.body.items.find((p: { id: number }) => p.id === tomato.id);
    expect(tomatoStock.stock).toBe(stockBefore);
  });
});

describe('vehicles', () => {
  it('creates, de-duplicates, updates and deletes', async () => {
    const { agent, csrf } = await signIn('admin', 'admin123');

    const created = await agent
      .post('/api/vehicles')
      .set('x-csrf-token', csrf)
      .send({ vehicle_no: 'mh 99 xx 1234', driver_name: 'Test Driver', capacity_kg: 2000 });
    expect(created.status).toBe(201);

    const duplicate = await agent
      .post('/api/vehicles')
      .set('x-csrf-token', csrf)
      .send({ vehicle_no: 'MH99XX1234' });
    expect(duplicate.status).toBe(409);

    const list = await agent.get('/api/vehicles');
    const vehicle = list.body.items.find((v: { vehicle_no: string }) => v.vehicle_no === 'MH99XX1234');
    expect(vehicle).toBeTruthy();

    const patched = await agent
      .patch(`/api/vehicles/${vehicle.id}`)
      .set('x-csrf-token', csrf)
      .send({ status: 'MAINTENANCE' });
    expect(patched.status).toBe(200);

    const removed = await agent.delete(`/api/vehicles/${vehicle.id}`).set('x-csrf-token', csrf);
    expect(removed.status).toBe(200);
  });
});
