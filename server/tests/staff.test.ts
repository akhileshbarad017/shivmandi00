import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

let app: Express;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = path.join(os.tmpdir(), `shivmandi-staff-${randomUUID()}.sqlite`);

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

describe('staff', () => {
  it('manages employees, attendance, advances and tasks', async () => {
    const { agent, csrf } = await signIn('admin', 'admin123');

    const seeded = await agent.get('/api/staff');
    expect(seeded.body.items.length).toBe(3);

    const created = await agent
      .post('/api/staff')
      .set('x-csrf-token', csrf)
      .send({ name: 'E2E Employee', role: 'Loader', salary: 18000 });
    const employeeId = created.body.id as number;

    const attendance = await agent
      .post('/api/staff/attendance')
      .set('x-csrf-token', csrf)
      .send({ employee_id: employeeId, status: 'PRESENT' });
    expect(attendance.status).toBe(201);

    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    const monthView = await agent.get(`/api/staff/attendance?employee_id=${employeeId}&month=${month}`);
    expect(monthView.body.days[today].status).toBe('PRESENT');
    expect(monthView.body.summary.present).toBe(1);

    const yearView = await agent.get(`/api/staff/attendance-year?year=${today.slice(0, 4)}`);
    expect(yearView.body.items.length).toBeGreaterThanOrEqual(4);

    const advance = await agent
      .post('/api/staff/advances')
      .set('x-csrf-token', csrf)
      .send({ employee_id: employeeId, amount: 1000, type: 'ADVANCE' });
    expect(advance.status).toBe(201);
    const advances = await agent.get(`/api/staff/advances?employee_id=${employeeId}`);
    expect(advances.body.summary.outstanding).toBe(1000);

    const overview = await agent.get('/api/staff/advances-overview');
    expect(overview.body.items.find((e: { id: number }) => e.id === employeeId).outstanding).toBe(1000);

    const task = await agent
      .post('/api/staff/tasks')
      .set('x-csrf-token', csrf)
      .send({ title: 'Clean crates', employee_id: employeeId });
    expect(task.status).toBe(201);

    const list = await agent.get('/api/staff');
    expect(list.body.tasks.some((t: { title: string }) => t.title === 'Clean crates')).toBe(true);

    await agent.patch(`/api/staff/tasks/${task.body.id}`).set('x-csrf-token', csrf).send({ status: 'DONE' });
    const after = await agent.get('/api/staff');
    expect(after.body.tasks.some((t: { title: string }) => t.title === 'Clean crates')).toBe(false);

    const removed = await agent.delete(`/api/staff/${employeeId}`).set('x-csrf-token', csrf);
    expect(removed.status).toBe(200);
    const finalList = await agent.get('/api/staff');
    expect(finalList.body.items.some((e: { id: number }) => e.id === employeeId)).toBe(false);
  });
});

describe('arrivals & gate', () => {
  it('records arrivals and gate entries', async () => {
    const { agent, csrf } = await signIn('admin', 'admin123');

    const products = await agent.get('/api/products');
    const tomato = products.body.items.find((p: { name: string }) => p.name === 'Tomato');

    const arrival = await agent
      .post('/api/arrivals')
      .set('x-csrf-token', csrf)
      .send({ commodity_id: tomato.id, farmer_name: 'Ramesh Yadav', bags: 20, weight: 500, rate: 30, vehicle_no: 'MH12AB0001' });
    expect(arrival.status).toBe(201);
    expect(arrival.body.arrival_no).toMatch(/^ARR-/);

    const arrivals = await agent.get('/api/arrivals');
    expect(arrivals.body.items[0].value).toBe(15000);
    expect(arrivals.body.summary.pending).toBe(1);

    const firstId = arrivals.body.items[0].id as number;
    const auctioned = await agent
      .patch(`/api/arrivals/${firstId}`)
      .set('x-csrf-token', csrf)
      .send({ status: 'AUCTIONED' });
    expect(auctioned.status).toBe(200);
    expect((await agent.get('/api/arrivals')).body.summary.pending).toBe(0);

    const gate = await agent
      .post('/api/gate')
      .set('x-csrf-token', csrf)
      .send({ vehicle_no: 'mh12ab0001', party_name: 'Ramesh Yadav', commodity_name: 'Tomato' });
    expect(gate.status).toBe(201);
    expect(gate.body.token_no).toMatch(/^GT-/);

    const gateList = await agent.get('/api/gate');
    expect(gateList.body.summary.inside).toBe(1);
    const gateId = gateList.body.items[0].id as number;

    const clear = await agent.patch(`/api/gate/${gateId}/clear`).set('x-csrf-token', csrf);
    expect(clear.status).toBe(200);
    expect((await agent.get('/api/gate')).body.summary.cleared).toBe(1);

    expect((await agent.delete(`/api/gate/${gateId}`).set('x-csrf-token', csrf)).status).toBe(200);
  });
});
