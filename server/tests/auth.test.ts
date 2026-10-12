import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

let app: Express;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = path.join(os.tmpdir(), `shivmandi-test-${randomUUID()}.sqlite`);

  const [{ createApp }, { migrate }, { seed }] = await Promise.all([
    import('../src/app.js'),
    import('../src/db/migrate.js'),
    import('../src/db/seed.js'),
  ]);

  migrate();
  seed();
  app = createApp();
});

describe('auth flow', () => {
  it('rejects /me when signed out', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects bad credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identity: 'admin', password: 'nope' });
    expect(res.status).toBe(401);
  });

  it('logs in the owner and stays signed in', async () => {
    const agent = request.agent(app);

    const login = await agent
      .post('/api/auth/login')
      .send({ identity: 'admin', password: 'admin123' });

    expect(login.status).toBe(200);
    expect(login.body.user.name).toBe('Vijay Pandey');
    expect(typeof login.body.csrf).toBe('string');

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe('admin');
  });

  it('accepts mobile number as the login identity', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identity: '9054491496', password: 'admin123' });
    expect(res.status).toBe(200);
  });

  it('requires a CSRF token for logout and clears the session', async () => {
    const agent = request.agent(app);
    const login = await agent
      .post('/api/auth/login')
      .send({ identity: 'admin', password: 'admin123' });
    const csrf = login.body.csrf as string;

    const noCsrf = await agent.post('/api/auth/logout');
    expect(noCsrf.status).toBe(403);

    const withCsrf = await agent.post('/api/auth/logout').set('x-csrf-token', csrf);
    expect(withCsrf.status).toBe(200);

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(401);
  });
});
