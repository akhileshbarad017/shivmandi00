import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

let app: Express;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = path.join(os.tmpdir(), `shivmandi-sales-${randomUUID()}.sqlite`);

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

describe('sales', () => {
  it('creates a credit sale, updates stock, buyer balance and invoice detail', async () => {
    const { agent, csrf } = await signIn('admin', 'admin123');

    const products = await agent.get('/api/products');
    const tomato = products.body.items.find((p: { name: string }) => p.name === 'Tomato');
    const baselineStock = tomato.stock as number;

    const buyer = await agent
      .post('/api/parties')
      .set('x-csrf-token', csrf)
      .send({ name: 'Sales Test Buyer', type: 'buyer' });
    const buyerId = buyer.body.id as number;

    const sale = await agent
      .post('/api/sales')
      .set('x-csrf-token', csrf)
      .send({
        party_id: buyerId,
        payment_type: 'Credit',
        items: [{ product_id: tomato.id, unit: 'KG', qty: 10, rate: 40 }],
      });

    expect(sale.status).toBe(201);
    expect(sale.body.subtotal).toBe(400);
    expect(sale.body.total_amount).toBe(400);
    expect(sale.body.balance_due).toBe(400);
    expect(sale.body.status).toBe('PENDING');
    const invoiceNo = sale.body.invoice_no as string;

    // stock reduced by 10
    const stock = await agent.get('/api/stock');
    expect(stock.body.items.find((p: { id: number }) => p.id === tomato.id).stock).toBe(baselineStock - 10);

    // buyer balance 400
    const parties = await agent.get('/api/parties?type=buyer&q=Sales Test');
    expect(parties.body.items[0].balance).toBe(400);

    // invoice detail + upi
    const invoice = await agent.get(`/api/invoices/${invoiceNo}`);
    expect(invoice.status).toBe(200);
    expect(invoice.body.items).toHaveLength(1);
    expect(invoice.body.shop.shop_name).toBeTruthy();
    expect(invoice.body.upi.link).toContain('upi://pay');
    expect(invoice.body.previous_bill).toBeNull(); // first bill for this buyer

    // credit ageing report
    const credit = await agent.get('/api/sales/credit');
    expect(credit.body.items.some((row: { buyer_id: number }) => row.buyer_id === buyerId)).toBe(true);

    return { agent, csrf, tomato, buyerId, invoiceNo, baselineStock };
  });

  it('carries the previous balance without double-counting it', async () => {
    const { agent, csrf } = await signIn('admin', 'admin123');
    const products = await agent.get('/api/products');
    const tomato = products.body.items.find((p: { name: string }) => p.name === 'Tomato');

    const buyer = await agent
      .post('/api/parties')
      .set('x-csrf-token', csrf)
      .send({ name: `Running Balance Buyer ${Date.now()}`, type: 'buyer' });
    const buyerId = buyer.body.id as number;

    await agent
      .post('/api/sales')
      .set('x-csrf-token', csrf)
      .send({ party_id: buyerId, payment_type: 'Credit', items: [{ product_id: tomato.id, qty: 10, rate: 40 }] });

    const second = await agent
      .post('/api/sales')
      .set('x-csrf-token', csrf)
      .send({ party_id: buyerId, payment_type: 'Credit', items: [{ product_id: tomato.id, qty: 5, rate: 40 }] });

    // Second bill: own charge 200, carried balance 400, total due 600.
    expect(second.body.prev_balance).toBe(400);
    expect(second.body.total_amount).toBe(200);
    expect(second.body.balance_due).toBe(600);

    const detail = await agent.get(`/api/invoices/${second.body.invoice_no}`);
    expect(detail.body.invoice.bill_amount).toBe(200);
    expect(detail.body.invoice.total_due).toBe(600);
    expect(detail.body.invoice.balance_due).toBe(600);

    const parties = await agent.get('/api/parties?type=buyer&q=Running Balance');
    expect(parties.body.items[0].balance).toBe(600);

    // Khata must show 400 + 200 (not 400 + 600).
    const ledger = await agent.get(`/api/parties/${buyerId}/ledger`);
    expect(ledger.body.totals.balance).toBe(600);
    expect(ledger.body.totals.debit).toBe(600);
  });

  it('creates a walk-in cash sale that is fully paid', async () => {
    const { agent, csrf } = await signIn('admin', 'admin123');
    const products = await agent.get('/api/products');
    const onion = products.body.items.find((p: { name: string }) => p.name === 'Onion');

    const sale = await agent
      .post('/api/sales')
      .set('x-csrf-token', csrf)
      .send({
        buyer_name: 'Walk-in',
        payment_type: 'Cash',
        channel: 'pos',
        items: [{ product_id: onion.id, unit: 'KG', qty: 5, rate: 30 }],
      });

    expect(sale.status).toBe(201);
    expect(sale.body.invoice_no.startsWith('POS-')).toBe(true);
    expect(sale.body.status).toBe('PAID');
    expect(sale.body.balance_due).toBe(0);
  });

  it('records a return (restock + buyer credit) and deletes a sale', async () => {
    const { agent, csrf } = await signIn('admin', 'admin123');
    const products = await agent.get('/api/products');
    const tomato = products.body.items.find((p: { name: string }) => p.name === 'Tomato');
    const baseline = tomato.stock as number;

    const sale = await agent
      .post('/api/sales')
      .set('x-csrf-token', csrf)
      .send({ buyer_name: 'Return Buyer', payment_type: 'Credit', items: [{ product_id: tomato.id, qty: 20, rate: 25 }] });
    const invoiceNo = sale.body.invoice_no as string;
    const saleId = (await agent.get(`/api/sales/${invoiceNo}`)).body.invoice.id as number;

    const ret = await agent
      .post('/api/sales/returns')
      .set('x-csrf-token', csrf)
      .send({ invoice_no: invoiceNo, reason: 'Damaged', items: [{ product_id: tomato.id, qty: 5, rate: 25 }] });
    expect(ret.status).toBe(201);
    expect(ret.body.amount).toBe(125);

    const afterReturn = (await agent.get('/api/stock')).body.items.find((p: { id: number }) => p.id === tomato.id);
    expect(afterReturn.stock).toBe(baseline - 20 + 5);

    const returns = await agent.get('/api/sales/returns');
    expect(returns.body.items.length).toBeGreaterThanOrEqual(1);

    const removed = await agent.delete(`/api/sales/${saleId}`).set('x-csrf-token', csrf);
    expect(removed.status).toBe(200);

    const afterDelete = (await agent.get('/api/stock')).body.items.find((p: { id: number }) => p.id === tomato.id);
    expect(afterDelete.stock).toBe(baseline + 5);
  });
});
