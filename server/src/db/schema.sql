-- ============================================================
-- ShivMandi ERP — SQLite schema
-- All money stored as REAL (INR), all timestamps as ISO text.
-- ============================================================

-- ---------- Settings & identity ----------

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'owner',
  phone         TEXT,
  status        TEXT NOT NULL DEFAULT 'ACTIVE'
                  CHECK (status IN ('ACTIVE', 'DISABLED')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,             -- sha256 of the session token
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  ip         TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

CREATE TABLE IF NOT EXISTS document_sequences (
  scope      TEXT PRIMARY KEY,             -- e.g. 'sales_invoice'
  prefix     TEXT NOT NULL,
  next_value INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS bulk_batches (
  id            TEXT PRIMARY KEY,             -- client idempotency key
  invoices_json TEXT NOT NULL DEFAULT '[]',
  bill_count    INTEGER NOT NULL DEFAULT 0,
  total_sales   REAL NOT NULL DEFAULT 0,
  total_paid    REAL NOT NULL DEFAULT 0,
  total_pending REAL NOT NULL DEFAULT 0,
  created_by    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Generic idempotency ledger for mutating requests (offline retries/replays).
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id            TEXT PRIMARY KEY,             -- "<userId|anon>:<client key>"
  user_id       INTEGER,
  method        TEXT NOT NULL,
  path          TEXT NOT NULL,
  status_code   INTEGER NOT NULL,
  response_json TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_idempotency_created ON idempotency_keys (created_at);

CREATE TABLE IF NOT EXISTS activity_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  actor      TEXT,
  action     TEXT NOT NULL,
  detail     TEXT,
  amount     REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- Master data ----------

CREATE TABLE IF NOT EXISTS contacts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL
               CHECK (type IN ('farmer', 'buyer', 'supplier', 'agent')),
  phone      TEXT,
  gstin      TEXT,
  address    TEXT,
  balance    REAL NOT NULL DEFAULT 0,
  opening_balance REAL NOT NULL DEFAULT 0,
  notes      TEXT,
  usage_count   INTEGER NOT NULL DEFAULT 0,
  last_used_at  TEXT,
  status     TEXT NOT NULL DEFAULT 'ACTIVE'
               CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_contacts_type ON contacts (type, status);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts (name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_code ON contacts (code) WHERE code IS NOT NULL AND code != '';

CREATE TABLE IF NOT EXISTS commodities (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'Vegetables',
  unit         TEXT NOT NULL DEFAULT 'kg',
  default_rate REAL NOT NULL DEFAULT 0,
  rate_20kg    REAL NOT NULL DEFAULT 0,
  min_level    REAL NOT NULL DEFAULT 0,
  emoji        TEXT,
  status       TEXT NOT NULL DEFAULT 'ACTIVE'
                 CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vehicles (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_no    TEXT NOT NULL UNIQUE,
  driver_name   TEXT,
  driver_phone  TEXT,
  owner_name    TEXT,
  vehicle_type  TEXT NOT NULL DEFAULT 'Tempo',
  capacity_kg   REAL NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'ACTIVE'
                  CHECK (status IN ('ACTIVE', 'MAINTENANCE', 'IDLE')),
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS employees (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'Staff',
  phone      TEXT,
  salary     REAL NOT NULL DEFAULT 0,
  join_date  TEXT,
  status     TEXT NOT NULL DEFAULT 'ACTIVE'
               CHECK (status IN ('ACTIVE', 'LEFT', 'ON_LEAVE')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS crates (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  code          TEXT,
  total_qty     INTEGER NOT NULL DEFAULT 0,
  in_mandi      INTEGER NOT NULL DEFAULT 0,
  with_farmers  INTEGER NOT NULL DEFAULT 0,
  with_buyers   INTEGER NOT NULL DEFAULT 0,
  rate_per_day  REAL NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- Purchases (inward) ----------

CREATE TABLE IF NOT EXISTS purchases (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_no         TEXT NOT NULL UNIQUE,
  date            TEXT NOT NULL,
  supplier_id     INTEGER REFERENCES contacts(id),
  supplier_name   TEXT NOT NULL,
  vehicle_no      TEXT,
  driver_name     TEXT,
  village         TEXT,
  goods_amount      REAL NOT NULL DEFAULT 0,
  expenses_amount   REAL NOT NULL DEFAULT 0,
  commission_percent REAL NOT NULL DEFAULT 0,
  commission_amount  REAL NOT NULL DEFAULT 0,
  net_amount        REAL NOT NULL DEFAULT 0,
  paid_amount     REAL NOT NULL DEFAULT 0,
  balance_due     REAL NOT NULL DEFAULT 0,
  payment_mode    TEXT NOT NULL DEFAULT 'Cash',
  notes           TEXT,
  created_by      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases (date);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases (supplier_id);

CREATE TABLE IF NOT EXISTS purchase_items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id    INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  commodity_id   INTEGER REFERENCES commodities(id),
  commodity_name TEXT NOT NULL,
  unit           TEXT NOT NULL DEFAULT 'kg',
  bags           INTEGER NOT NULL DEFAULT 0,
  weight         REAL NOT NULL DEFAULT 0,
  rate           REAL NOT NULL DEFAULT 0,
  amount         REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items (purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_commodity ON purchase_items (commodity_id);

CREATE TABLE IF NOT EXISTS purchase_expenses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  head        TEXT NOT NULL,
  amount      REAL NOT NULL DEFAULT 0,
  notes       TEXT
);
CREATE INDEX IF NOT EXISTS idx_purchase_expenses_purchase ON purchase_expenses (purchase_id);

-- ---------- Sales (outward) ----------

CREATE TABLE IF NOT EXISTS sales_invoices (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no     TEXT NOT NULL UNIQUE,
  invoice_date   TEXT NOT NULL,
  buyer_id       INTEGER REFERENCES contacts(id),
  buyer_name     TEXT NOT NULL,
  buyer_phone    TEXT,
  subtotal       REAL NOT NULL DEFAULT 0,
  discount       REAL NOT NULL DEFAULT 0,
  commission     REAL NOT NULL DEFAULT 0,
  cess           REAL NOT NULL DEFAULT 0,
  gst            REAL NOT NULL DEFAULT 0,
  prev_balance   REAL NOT NULL DEFAULT 0,
  total_amount   REAL NOT NULL DEFAULT 0,
  paid_amount    REAL NOT NULL DEFAULT 0,
  balance_due    REAL NOT NULL DEFAULT 0,
  payment_mode   TEXT NOT NULL DEFAULT 'Cash',
  status         TEXT NOT NULL DEFAULT 'PAID'
                   CHECK (status IN ('PAID', 'PARTIAL', 'PENDING', 'CANCELLED')),
  vehicle_no     TEXT,
  notes          TEXT,
  created_by     TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales_invoices (invoice_date);
CREATE INDEX IF NOT EXISTS idx_sales_buyer ON sales_invoices (buyer_id);

CREATE TABLE IF NOT EXISTS sales_items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id     INTEGER NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
  commodity_id   INTEGER REFERENCES commodities(id),
  commodity_name TEXT NOT NULL,
  lot_no         TEXT,
  unit           TEXT NOT NULL DEFAULT 'KG',
  bags           INTEGER NOT NULL DEFAULT 0,
  weight         REAL NOT NULL DEFAULT 0,
  rate           REAL NOT NULL DEFAULT 0,
  amount         REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sales_items_invoice ON sales_items (invoice_id);
CREATE INDEX IF NOT EXISTS idx_sales_items_commodity ON sales_items (commodity_id);

CREATE TABLE IF NOT EXISTS sales_returns (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  return_no   TEXT NOT NULL UNIQUE,
  return_date TEXT NOT NULL,
  invoice_id  INTEGER REFERENCES sales_invoices(id),
  invoice_no  TEXT,
  buyer_id    INTEGER REFERENCES contacts(id),
  buyer_name  TEXT NOT NULL,
  amount      REAL NOT NULL DEFAULT 0,
  reason      TEXT,
  created_by  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sales_return_items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id      INTEGER NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
  commodity_id   INTEGER REFERENCES commodities(id),
  commodity_name TEXT NOT NULL,
  unit           TEXT NOT NULL DEFAULT 'KG',
  weight         REAL NOT NULL DEFAULT 0,
  rate           REAL NOT NULL DEFAULT 0,
  amount         REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_return_items_return ON sales_return_items (return_id);

-- ---------- Money ----------

CREATE TABLE IF NOT EXISTS payments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  voucher_no TEXT NOT NULL UNIQUE,
  date       TEXT NOT NULL,
  party_id   INTEGER REFERENCES contacts(id),
  party_name TEXT NOT NULL,
  type       TEXT NOT NULL
               CHECK (type IN ('receipt', 'payment', 'expense')),
  mode       TEXT NOT NULL DEFAULT 'Cash'
               CHECK (mode IN ('Cash', 'Bank', 'UPI', 'Cheque')),
  head       TEXT,
  amount     REAL NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'COMPLETED'
               CHECK (status IN ('COMPLETED', 'PENDING', 'CANCELLED')),
  bill_ref   TEXT,
  notes      TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments (date);
CREATE INDEX IF NOT EXISTS idx_payments_type ON payments (type);
CREATE INDEX IF NOT EXISTS idx_payments_party ON payments (party_id);
CREATE INDEX IF NOT EXISTS idx_payments_bill_ref ON payments (bill_ref);

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  date           TEXT NOT NULL,
  commodity_id   INTEGER NOT NULL REFERENCES commodities(id),
  commodity_name TEXT NOT NULL,
  qty            REAL NOT NULL DEFAULT 0,   -- signed: + add, - reduce
  reason         TEXT,
  notes          TEXT,
  created_by     TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_stock_adj_commodity ON stock_adjustments (commodity_id);

-- ---------- Mandi operations ----------

CREATE TABLE IF NOT EXISTS arrivals (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  arrival_no     TEXT NOT NULL UNIQUE,
  date           TEXT NOT NULL,
  farmer_id      INTEGER REFERENCES contacts(id),
  farmer_name    TEXT NOT NULL,
  commodity_id   INTEGER REFERENCES commodities(id),
  commodity_name TEXT NOT NULL,
  bags           INTEGER NOT NULL DEFAULT 0,
  weight         REAL NOT NULL DEFAULT 0,
  rate           REAL NOT NULL DEFAULT 0,
  vehicle_no     TEXT,
  status         TEXT NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN ('PENDING', 'AUCTIONED', 'SOLD')),
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_arrivals_date ON arrivals (date);

CREATE TABLE IF NOT EXISTS gate_entries (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  token_no       TEXT NOT NULL UNIQUE,
  vehicle_no     TEXT NOT NULL,
  party_name     TEXT,
  commodity_name TEXT,
  in_time        TEXT,
  out_time       TEXT,
  status         TEXT NOT NULL DEFAULT 'IN'
                   CHECK (status IN ('IN', 'OUT', 'CLEARED')),
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- Staff ----------

CREATE TABLE IF NOT EXISTS attendance (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'PRESENT'
                CHECK (status IN ('PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE')),
  check_in    TEXT,
  check_out   TEXT,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (employee_id, date)
);

CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  due_date    TEXT,
  status      TEXT NOT NULL DEFAULT 'OPEN'
                CHECK (status IN ('OPEN', 'DONE', 'CANCELLED')),
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS staff_advances (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'ADVANCE'
                CHECK (type IN ('ADVANCE', 'REPAYMENT')),
  amount      REAL NOT NULL DEFAULT 0,
  notes       TEXT,
  created_by  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_staff_advances_employee ON staff_advances (employee_id);

-- ---------- Messaging ----------

CREATE TABLE IF NOT EXISTS whatsapp_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no TEXT,
  party_name TEXT,
  phone      TEXT,
  message    TEXT,
  status     TEXT NOT NULL DEFAULT 'SENT',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
