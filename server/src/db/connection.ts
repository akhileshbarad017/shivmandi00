import fs from 'node:fs';
import path from 'node:path';
import Database from 'libsql';
import { env } from '../env.js';

let instance: Database.Database | null = null;

type RawStatement = ReturnType<Database.Database['prepare']>;
type SqlMethod = 'run' | 'get' | 'all';

/**
 * libSQL returns an extra `_metadata` object on `get()` rows. Strip it so API
 * responses keep the exact column shape (better-sqlite3 compatibility).
 */
function stripMetadata<T>(row: T): T {
  if (row && typeof row === 'object' && '_metadata' in (row as Record<string, unknown>)) {
    const clone = { ...(row as Record<string, unknown>) };
    delete clone._metadata;
    return clone as T;
  }
  return row;
}

/**
 * A statement that prepares lazily on every execution.
 *
 * On a remote libSQL/Turso connection a prepared statement is bound to the
 * connection stream it was created on, so a statement prepared *before* a
 * transaction cannot be executed inside that transaction. Re-preparing at call
 * time keeps statements valid in any context (and behaves the same locally).
 */
function makeStatement(owner: Database.Database, sql: string): RawStatement {
  const exec = (method: SqlMethod, args: unknown[]): unknown => {
    const statement = owner.prepare(sql);
    const fn = statement[method] as unknown as (...params: unknown[]) => unknown;
    return fn.apply(statement, args);
  };

  return new Proxy({} as RawStatement, {
    get(_target, prop) {
      if (prop === 'run') return (...args: unknown[]) => exec('run', args);
      if (prop === 'get') return (...args: unknown[]) => stripMetadata(exec('get', args));
      if (prop === 'all') {
        return (...args: unknown[]) => (exec('all', args) as unknown[]).map(stripMetadata);
      }
      if (prop === 'source') return sql;
      if (prop === 'reader') return /^\s*(select|pragma|with|values)/i.test(sql);
      if (prop === 'columns') return () => owner.prepare(sql).columns();
      if (prop === 'raw') return () => makeStatement(owner, sql);
      if (prop === 'bind') return () => makeStatement(owner, sql);
      return undefined;
    },
  });
}

/** Wrap the libSQL database so `prepare()` returns safe, lazy statements. */
function wrapDatabase(raw: Database.Database): Database.Database {
  return new Proxy(raw, {
    get(target, prop, receiver) {
      if (prop === 'prepare') {
        return (sql: string) => makeStatement(target, sql);
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as Database.Database;
}

/** Open (once) and return the database connection — Turso when configured, else a local file. */
export function getDb(): Database.Database {
  if (instance) return instance;

  const remote = Boolean(env.libsqlUrl);
  if (!remote) fs.mkdirSync(path.dirname(env.dbPath), { recursive: true });

  const raw = remote
    ? new Database(env.libsqlUrl, {
        authToken: env.libsqlAuthToken,
        timeout: 5000,
      } as never)
    : new Database(env.dbPath);

  // WAL/busy-timeout only make sense for a local file.
  if (!remote) {
    try {
      raw.exec('PRAGMA journal_mode = WAL');
      raw.exec('PRAGMA busy_timeout = 5000');
    } catch {
      /* pragmas are best-effort */
    }
  }
  try {
    raw.exec('PRAGMA foreign_keys = ON');
  } catch {
    /* Turso may manage this server-side */
  }

  instance = wrapDatabase(raw);
  return instance;
}

export function closeDb(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
