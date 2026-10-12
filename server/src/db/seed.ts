import type { Database } from 'libsql';
import { hashPassword } from '../auth/password.js';
import { SEQUENCE_DEFS } from '../services/numbering.js';
import { getDb } from './connection.js';
import { LEDGER_ACCOUNTS } from './ledger-data.js';

const SETTINGS: Record<string, string> = {
  org_name: 'VIJAY PANDEY & COMPANY',
  brand_title: 'VIJAY PANDEY & COMPANY',
  tagline: 'Wholesale Vegetable Merchant',
  app_user: 'Vijay Pandey',
  phone: '9054491496',
  email: '',
  gstin: '',
  address: 'Sardar Vallabhbhai Patel Vegetable & Fruits Market',
  market_city: 'Chikhli, Thala, Gujarat 396409',
  shop_no: 'B-31, 32',
  contact1_name: 'Prince Pandey',
  contact1_phone: '9054491496',
  contact2_name: 'Vijay Pandey',
  contact2_phone: '9427128816',
  contact2_phone2: '9913481066',
  fy_start: '2026-04-01',
  language: 'English',
  currency: 'INR',
  gst_percent: '0',
  upi_id: 'pandeydhruv009@okhdfcbank',
  invoice_footer: 'આગલું બિલ ચૂકવ્યા પછી જ બીજો માલ લઈ જવો',
  bank_name: '',
  bank_holder: '',
  bank_ac_no: '',
  bank_ifsc: '',
  bank_branch: '',
  theme: 'system',
  skin: 'blue',
  low_stock_default: '60',
  opening_cash: '0',
  opening_bank: '0',
};

/** Single-owner system: one account runs the whole shop. */
const OWNER = {
  username: 'admin',
  password: 'admin123',
  name: 'Vijay Pandey',
  role: 'owner',
  phone: '9054491496',
};

const COMMODITIES: Array<[string, string, string, string, number, number, string]> = [
  // code, name, category, unit, rate, min_level, emoji
  ['TOM01', 'Tomato', 'Vegetables', 'kg', 38, 60, '🍅'],
  ['ONI01', 'Onion', 'Vegetables', 'kg', 24.5, 80, '🧅'],
  ['POT01', 'Potato', 'Vegetables', 'kg', 18, 100, '🥔'],
  ['CHI01', 'Green Chilli', 'Spices', 'kg', 65, 40, '🌶️'],
  ['BRN01', 'Brinjal', 'Vegetables', 'kg', 28, 60, '🍆'],
  ['BAN01', 'Banana', 'Fruits', 'dozen', 45, 40, '🍌'],
  ['CAU01', 'Cauliflower', 'Vegetables', 'piece', 25, 60, '🥦'],
  ['GAR01', 'Garlic', 'Spices', 'kg', 140, 40, '🧄'],
];

const VEHICLES: Array<[string, string, string, string, number]> = [
  // vehicle_no, driver, phone, type, capacity_kg
  ['MH-12-AB-4521', 'Ganesh Pawar', '9822001100', 'Tempo', 1500],
  ['MH-15-CD-9821', 'Imran Shaikh', '9822002200', 'Truck', 5000],
  ['MH-14-GH-1122', 'Sunil Jadhav', '9822003300', 'Pickup', 800],
];

const EMPLOYEES: Array<[string, string, string, number, string]> = [
  // name, role, phone, salary, join_date
  ['Mahendra Joshi', 'Head Accountant', '9822441199', 32000, '2024-01-15'],
  ['Anil Shinde', 'Gate & Weighing In-charge', '9890123456', 22000, '2024-06-01'],
  ['Raju Jadhav', 'Floor Supervisor & Auctioneer', '9765432109', 25000, '2024-03-10'],
];



/**
 * Populate shop master data (settings, owner, commodities, vehicles, staff,
 * document sequences) and the real khata accounts from the ledger workbook.
 * No-op (returns false) when users already exist, so it is safe to call on
 * every boot.
 */
export function seed(db: Database = getDb()): boolean {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
  if (n > 0) return false;

  const run = db.transaction(() => {
    const setSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    for (const [key, value] of Object.entries(SETTINGS)) setSetting.run(key, value);

    db.prepare('INSERT INTO users (username, password_hash, name, role, phone) VALUES (?, ?, ?, ?, ?)').run(
      OWNER.username,
      hashPassword(OWNER.password),
      OWNER.name,
      OWNER.role,
      OWNER.phone,
    );

    const insCommodity = db.prepare(
      `INSERT INTO commodities (code, name, category, unit, default_rate, rate_20kg, min_level, emoji)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const [code, name, category, unit, rate, minLevel, emoji] of COMMODITIES) {
      insCommodity.run(code, name, category, unit, rate, rate * 20, minLevel, emoji);
    }

    // Real shop ledger: every account is a buyer with an opening receivable,
    // loaded from the digitised khata (see ledger-data.ts).
    const insContact = db.prepare(
      `INSERT INTO contacts (code, name, type, balance, opening_balance, notes)
       VALUES (?, ?, 'buyer', ?, ?, ?)`,
    );
    let contactCount = 0;
    for (const account of LEDGER_ACCOUNTS) {
      contactCount += 1;
      const code = `CUS-${String(contactCount).padStart(4, '0')}`;
      const amount = account.amount ?? 0;
      const note = `Ledger p.${account.page} ${account.side} #${account.row} · ${account.status}`;
      insContact.run(code, account.name, amount, amount, note);
    }

    const insVehicle = db.prepare(
      'INSERT INTO vehicles (vehicle_no, driver_name, driver_phone, vehicle_type, capacity_kg) VALUES (?, ?, ?, ?, ?)',
    );
    for (const [no, driver, phone, type, cap] of VEHICLES) insVehicle.run(no, driver, phone, type, cap);

    const insEmployee = db.prepare(
      'INSERT INTO employees (name, role, phone, salary, join_date) VALUES (?, ?, ?, ?, ?)',
    );
    for (const [name, role, phone, salary, joinDate] of EMPLOYEES) {
      insEmployee.run(name, role, phone, salary, joinDate);
    }

    const insSeq = db.prepare(
      'INSERT OR IGNORE INTO document_sequences (scope, prefix, next_value) VALUES (?, ?, ?)',
    );
    for (const [scope, prefix, nextValue] of SEQUENCE_DEFS) insSeq.run(scope, prefix, nextValue);

    // Continue customer codes after the seeded contacts.
    db.prepare("UPDATE document_sequences SET next_value = ? WHERE scope = 'customer'").run(contactCount + 1);
  });

  run();
  return true;
}
