import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** server/src -> server */
const here = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(here, '..');
/** server -> repository root */
export const ROOT = path.resolve(here, '../..');

// Load a local .env (if present) so dev/scripts pick up the Turso settings.
// Skipped under test so suites stay isolated from real data.
if (process.env.NODE_ENV !== 'test' && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(path.join(ROOT, '.env'));
  } catch {
    /* no .env file — fine in production / CI */
  }
}

function bool(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return value === '1' || value.toLowerCase() === 'true';
}

/**
 * Remote libSQL/Turso URL. When set, the app talks to Turso instead of a local
 * file — this is what lets the backend run on stateless free hosts and keep its
 * data. Accepts TURSO_DATABASE_URL or the generic LIBSQL_URL.
 */
const libsqlUrl = (process.env.TURSO_DATABASE_URL ?? process.env.LIBSQL_URL ?? '').trim();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  dbPath: process.env.DB_PATH ?? path.join(ROOT, 'data', 'mandi.sqlite'),
  /** Turso/libSQL connection (empty => local file at dbPath). */
  libsqlUrl,
  libsqlAuthToken: (process.env.TURSO_AUTH_TOKEN ?? process.env.LIBSQL_AUTH_TOKEN ?? '').trim(),
  sessionSecret: process.env.SESSION_SECRET ?? 'dev-insecure-secret-change-me',
  cookieSecure: bool(process.env.COOKIE_SECURE),
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? 720),
} as const;

export const isProd = env.nodeEnv === 'production';
export const isTest = env.nodeEnv === 'test';
