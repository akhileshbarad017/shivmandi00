import { createApp } from './app.js';
import { env } from './env.js';
import { getDb } from './db/connection.js';
import { migrate } from './db/migrate.js';
import { seed } from './db/seed.js';
import { pruneIdempotency } from './middleware/idempotency.js';

function bootstrap(): void {
  getDb();
  migrate();
  pruneIdempotency();
  const didSeed = seed();
  if (didSeed) console.log('[db] master + ledger data seeded');
}

bootstrap();

const app = createApp();
app.listen(env.port, () => {
  console.log(`[server] listening on http://localhost:${env.port}`);
});
