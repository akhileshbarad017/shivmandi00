import fs from 'node:fs';
import path from 'node:path';
import Database from 'libsql';
import { describe, expect, it } from 'vitest';
import { SERVER_ROOT } from '../src/env.js';
import { seed } from '../src/db/seed.js';
import { LEDGER_ACCOUNTS } from '../src/db/ledger-data.js';
import { SEQUENCE_DEFS } from '../src/services/numbering.js';

function memoryDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(fs.readFileSync(path.join(SERVER_ROOT, 'src', 'db', 'schema.sql'), 'utf8'));
  return db;
}

const EXPECTED_TABLES = [
  'settings', 'users', 'sessions', 'document_sequences', 'activity_log',
  'contacts', 'commodities', 'vehicles', 'employees', 'crates',
  'purchases', 'purchase_items', 'purchase_expenses',
  'sales_invoices', 'sales_items', 'sales_returns', 'sales_return_items',
  'payments', 'stock_adjustments',
  'arrivals', 'gate_entries',
  'attendance', 'tasks', 'staff_advances',
  'whatsapp_log',
];

describe('schema', () => {
  it('creates every expected table', () => {
    const db = memoryDb();
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((r) => (r as { name: string }).name);
    for (const table of EXPECTED_TABLES) {
      expect(names).toContain(table);
    }
    db.close();
  });
});

describe('seed', () => {
  it('inserts master data and the real ledger and is idempotent', () => {
    const db = memoryDb();

    expect(seed(db)).toBe(true);
    expect(seed(db)).toBe(false);

    const users = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
    expect(users.n).toBe(1);

    const commodities = db.prepare('SELECT COUNT(*) AS n FROM commodities').get() as { n: number };
    expect(commodities.n).toBe(8);

    const contacts = db.prepare('SELECT COUNT(*) AS n FROM contacts').get() as { n: number };
    expect(contacts.n).toBe(LEDGER_ACCOUNTS.length);
    expect(LEDGER_ACCOUNTS.length).toBe(169);

    const buyers = db.prepare("SELECT COUNT(*) AS n FROM contacts WHERE type = 'buyer'").get() as { n: number };
    expect(buyers.n).toBe(LEDGER_ACCOUNTS.length);

    const ledgerTotal = db
      .prepare('SELECT SUM(opening_balance) AS v FROM contacts')
      .get() as { v: number };
    expect(ledgerTotal.v).toBe(2510594);

    const sequences = db.prepare('SELECT COUNT(*) AS n FROM document_sequences').get() as { n: number };
    expect(sequences.n).toBe(SEQUENCE_DEFS.length);

    db.close();
  });

  it('stores hashed passwords and default settings', () => {
    const db = memoryDb();
    seed(db);

    const admin = db.prepare("SELECT password_hash, role FROM users WHERE username = 'admin'").get() as {
      password_hash: string;
      role: string;
    };
    expect(admin.role).toBe('owner');
    expect(admin.password_hash).toMatch(/^scrypt\$/);
    const others = db.prepare('SELECT COUNT(*) AS n FROM users WHERE username != ?').get('admin') as { n: number };
    expect(others.n).toBe(0);
    expect(admin.password_hash).not.toContain('admin123');

    const org = db.prepare("SELECT value FROM settings WHERE key = 'org_name'").get() as { value: string };
    expect(org.value).toBe('VIJAY PANDEY & COMPANY');

    db.close();
  });
});
