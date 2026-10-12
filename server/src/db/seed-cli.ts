import { getDb } from './connection.js';
import { migrate } from './migrate.js';
import { seed } from './seed.js';

getDb();
migrate();
const inserted = seed();
console.log(inserted ? 'Seeded demo data.' : 'Database already seeded — skipped.');
