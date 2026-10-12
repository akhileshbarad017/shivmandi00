import fs from 'node:fs';
import path from 'node:path';
import type { Database } from 'libsql';
import { SERVER_ROOT } from '../env.js';
import { ensureContactCodes, ensureSequences } from '../services/numbering.js';
import { getDb } from './connection.js';

const SCHEMA_PATH = path.join(SERVER_ROOT, 'src', 'db', 'schema.sql');

function hasColumn(db: Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function addColumn(db: Database, table: string, column: string, definition: string): void {
  if (!hasColumn(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/** Create every table/index and ensure columns/sequences/codes exist (idempotent). */
export function migrate(db: Database = getDb()): void {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schema);
  // Purchases: commission stored as a percentage of goods (deducted).
  addColumn(db, 'purchases', 'commission_percent', 'REAL NOT NULL DEFAULT 0');
  addColumn(db, 'purchases', 'commission_amount', 'REAL NOT NULL DEFAULT 0');
  addColumn(db, 'contacts', 'opening_balance', 'REAL NOT NULL DEFAULT 0');
  addColumn(db, 'contacts', 'notes', 'TEXT');
  addColumn(db, 'contacts', 'usage_count', 'INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'contacts', 'last_used_at', 'TEXT');
  ensureSequences();
  ensureContactCodes();
}
