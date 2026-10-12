export type PartyType = 'farmer' | 'buyer' | 'supplier' | 'agent';

export interface Party {
  id: number;
  code: string | null;
  name: string;
  type: PartyType;
  phone: string | null;
  gstin: string | null;
  address: string | null;
  balance: number;
  usage_count?: number;
  status: string;
  created_at: string;
}

export interface PartyListResponse {
  items: Party[];
  counts: Record<string, number>;
  total?: number;
  limit?: number | null;
  offset?: number;
}

export interface LedgerEntry {
  date: string;
  type: string;
  ref: string;
  label: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface LedgerData {
  opening: number;
  entries: LedgerEntry[];
  totals: { debit: number; credit: number; balance: number };
  from: string | null;
  to: string | null;
}

export interface LedgerResponse extends LedgerData {
  party: Party;
}

export interface PartyProfileInvoiceItem {
  commodity_id: number | null;
  commodity_name: string;
  unit: string;
  bags: number;
  weight: number;
  rate: number;
  amount: number;
}

export interface PartyProfileInvoice {
  id: number;
  invoice_no: string;
  invoice_date: string;
  total_amount: number;
  paid_amount: number;
  balance_due: number;
  status: string;
  items: PartyProfileInvoiceItem[];
}

export interface PartyProfileResponse {
  party: Party;
  ledger: LedgerData;
  invoices: PartyProfileInvoice[];
  purchases: Array<{
    id: number;
    bill_no: string;
    date: string;
    goods_amount: number;
    commission_amount: number;
    net_amount: number;
    paid_amount: number;
    balance_due: number;
  }>;
  payments: Array<{
    id: number;
    voucher_no: string;
    date: string;
    type: string;
    mode: string;
    amount: number;
    notes: string | null;
  }>;
  stats: {
    total_billed: number;
    total_paid: number;
    total_pending: number;
    current_balance: number;
    sales_bills: number;
    purchase_bills: number;
    purchase_amount: number;
  };
  summary: { pending: number; type: PartyType; bills: number; transactions: number };
}

export interface BulkGenerationResponse {
  duplicate?: boolean;
  invoices: Array<{
    invoice_no: string;
    party_id: number | null;
    customer: string;
    total: number;
    paid: number;
    pending: number;
    status: string;
  }>;
  summary: { bills: number; total_sales: number; total_paid: number; total_pending: number };
}

export interface LastBillResponse {
  invoice: { invoice_no: string; invoice_date: string; payment_mode: string } | null;
  items: Array<{
    product_id: number | null;
    commodity_name: string;
    unit: string;
    qty: number;
    rate: number;
  }>;
}

export type StockState = 'OK' | 'LOW' | 'OUT';

export interface ProductStock {
  id: number;
  code: string;
  name: string;
  category: string;
  unit: string;
  rate: number;
  rate_20kg: number;
  min_level: number;
  emoji: string | null;
  status: string;
  purchased: number;
  sold: number;
  returned: number;
  adjusted: number;
  stock: number;
  value: number;
  state: StockState;
}

export interface ProductListResponse {
  items: ProductStock[];
  summary: { products: number; active: number; low: number; out: number; stock_value: number };
}

export interface StockAdjustment {
  id: number;
  date: string;
  commodity_id: number;
  commodity_name: string;
  qty: number;
  reason: string | null;
  notes: string | null;
  created_at: string;
}

export interface StockResponse {
  items: ProductStock[];
  adjustments: StockAdjustment[];
  summary: {
    products: number;
    stock_value: number;
    stock_qty: number;
    purchased: number;
    sold: number;
    low: number;
    out: number;
  };
}

export interface DashboardResponse {
  date: string;
  kpis: {
    today_sales: number;
    today_purchases: number;
    today_expenses: number;
    estimated_profit: number;
    stock_qty: number;
    stock_value: number;
    bills_today: number;
    sales_delta: number | null;
    purchase_delta: number | null;
  };
  money: {
    to_receive: number;
    receive_parties: number;
    to_pay: number;
    pay_parties: number;
  };
  weekly: Array<{ date: string; sales: number }>;
  recent_bills: Array<{
    invoice_no: string;
    buyer_name: string;
    total_amount: number;
    balance_due: number;
    status: string;
    invoice_date: string;
  }>;
}

export interface ReportSales {
  from: string;
  to: string;
  items: Array<{
    invoice_no: string;
    invoice_date: string;
    buyer_name: string;
    total_amount: number;
    paid_amount: number;
    balance_due: number;
    status: string;
  }>;
  summary: { bills: number; gross: number; received: number; outstanding: number };
}

export interface ReportPurchases {
  from: string;
  to: string;
  items: Array<{
    bill_no: string;
    date: string;
    supplier_name: string;
    goods_amount: number;
    expenses_amount: number;
    net_amount: number;
    paid_amount: number;
    balance_due: number;
  }>;
  summary: { bills: number; goods: number; expenses: number; net: number; paid: number };
}

export interface ReportPL {
  from: string;
  to: string;
  lines: Array<{ label: string; value: number; sign: number }>;
  summary: {
    sales: number;
    discounts: number;
    purchase: number;
    expense: number;
    gross: number;
    net: number;
    received: number;
    paid_out: number;
  };
  expense_heads: Array<{ head: string; total: number }>;
}

export interface ReportDaybook {
  date: string;
  items: Array<{
    time: string;
    type: string;
    ref: string;
    party: string;
    mode: string;
    in: number;
    out: number;
    balance: number;
  }>;
  summary: { entries: number; in: number; out: number; net: number };
}

export interface ReportBalanceSheet {
  items: Array<{ label: string; value: number; group: 'assets' | 'liabilities' }>;
  summary: { assets: number; liabilities: number; position: number };
}

export interface ReportCommodity {
  items: Array<ProductStock & { purchase_value: number; sale_value: number }>;
  summary: { products: number; stock_kg: number; stock_value: number };
}

export type EmployeeStatus = 'ACTIVE' | 'LEFT' | 'ON_LEAVE';
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'LEAVE';

export interface Employee {
  id: number;
  name: string;
  role: string;
  phone: string | null;
  salary: number;
  join_date: string | null;
  status: EmployeeStatus;
  open_tasks: number;
  advance_balance: number;
  today_status: AttendanceStatus | null;
}

export interface StaffTask {
  id: number;
  employee_id: number | null;
  title: string;
  due_date: string | null;
  status: 'OPEN' | 'DONE' | 'CANCELLED';
  notes: string | null;
  employee_name?: string | null;
}

export interface StaffResponse {
  items: Employee[];
  tasks: StaffTask[];
  summary: {
    total: number;
    present: number;
    not_marked: number;
    payroll: number;
    advances: number;
    net_payable: number;
    open_tasks: number;
  };
}

export interface AttendanceMonthResponse {
  employee: Employee;
  month: string;
  days: Record<string, { date: string; status: AttendanceStatus; check_in: string | null; check_out: string | null; notes: string | null }>;
  summary: { present: number; absent: number; half: number; leave: number };
}

export interface StaffAdvancesOverview {
  items: Array<{
    id: number;
    name: string;
    role: string;
    salary: number;
    advance: number;
    repayment: number;
    outstanding: number;
    net_payable: number;
    last_advance_date: string | null;
  }>;
  summary: { staff: number; advance: number; outstanding: number };
}

export interface AdvancesResponse {
  employee: Employee;
  items: Array<{ id: number; date: string; type: 'ADVANCE' | 'REPAYMENT'; amount: number; notes: string | null }>;
  summary: { advance: number; repayment: number; outstanding: number; net_payable: number };
}

export interface Arrival {
  id: number;
  arrival_no: string;
  date: string;
  farmer_id: number | null;
  farmer_name: string;
  commodity_id: number | null;
  commodity_name: string;
  bags: number;
  weight: number;
  rate: number;
  value: number;
  vehicle_no: string | null;
  status: 'PENDING' | 'AUCTIONED' | 'SOLD';
  notes: string | null;
}

export interface ArrivalsResponse {
  items: Arrival[];
  summary: { lots: number; weight: number; value: number; pending: number };
}

export interface GateEntry {
  id: number;
  token_no: string;
  vehicle_no: string;
  party_name: string | null;
  commodity_name: string | null;
  in_time: string | null;
  out_time: string | null;
  status: 'IN' | 'OUT' | 'CLEARED';
  notes: string | null;
  created_at: string;
}

export interface GateResponse {
  items: GateEntry[];
  summary: { inside: number; cleared: number; today: number; total: number };
}

export interface PaymentRow {
  id: number;
  voucher_no: string;
  date: string;
  party_id: number | null;
  party_name: string;
  type: 'receipt' | 'payment' | 'expense';
  mode: string;
  amount: number;
  status: string;
  bill_ref: string | null;
  notes: string | null;
}

export interface PaymentListResponse {
  items: PaymentRow[];
  summary: { entries: number; inflow: number; outflow: number; net: number };
}

export interface ExpenseRow extends PaymentRow {
  head: string | null;
  editable: boolean;
}

export interface ExpenseListResponse {
  items: ExpenseRow[];
  summary: {
    entries: number;
    total: number;
    today: number;
    by_head: Array<{ head: string; total: number }>;
  };
}

export interface WhatsappRow {
  id: number;
  invoice_no: string | null;
  party_name: string | null;
  phone: string | null;
  message: string | null;
  status: string;
  created_at: string;
}

export interface WhatsappListResponse {
  items: WhatsappRow[];
  summary: { sent: number; today: number };
}

export type SaleStatus = 'PAID' | 'PARTIAL' | 'PENDING' | 'CANCELLED';

export interface SaleListItem {
  id: number;
  invoice_no: string;
  invoice_date: string;
  buyer_id: number | null;
  buyer_name: string;
  buyer_phone: string | null;
  subtotal: number;
  discount: number;
  commission: number;
  gst: number;
  prev_balance: number;
  total_amount: number;
  paid_amount: number;
  balance_due: number;
  payment_mode: string;
  status: SaleStatus;
  vehicle_no: string | null;
  items: number;
  weight: number;
}

export interface SaleListResponse {
  items: SaleListItem[];
  summary: { bills: number; total: number; paid: number; due: number; weight: number };
}

export interface CreditRow {
  buyer_id: number;
  buyer_name: string;
  due: number;
  billed: number;
  paid: number;
  bills: number;
  last_date: string;
  oldest_date: string;
  age_days: number;
}

export interface CreditResponse {
  items: CreditRow[];
  summary: { customers: number; outstanding: number };
}

export interface ShopProfile {
  shop_name: string;
  tagline: string;
  owner_name: string;
  phone: string;
  address: string;
  city: string;
  shop_no: string;
  contact1_name: string;
  contact1_phone: string;
  contact2_name: string;
  contact2_phone: string;
  contact2_phone2: string;
  gstin: string;
  footer: string;
  upi: string;
  bank_name: string;
  bank_ac_no: string;
  bank_ifsc: string;
  bank_holder: string;
}

export interface InvoiceDetail {
  invoice: {
    id: number;
    invoice_no: string;
    invoice_date: string;
    buyer_id: number | null;
    buyer_name: string;
    buyer_phone: string | null;
    subtotal: number;
    discount: number;
    commission: number;
    gst: number;
    prev_balance: number;
    bill_amount: number;
    total_amount: number;
    total_due: number;
    paid_amount: number;
    balance_due: number;
    payment_mode: string;
    status: string;
    vehicle_no: string | null;
    notes: string | null;
  };
  items: Array<{
    commodity_name: string;
    unit: string;
    bags: number;
    weight: number;
    rate: number;
    amount: number;
  }>;
  buyer: {
    id: number;
    code: string | null;
    name: string;
    phone: string | null;
    address: string | null;
    gstin: string | null;
  } | null;
  last_receipt: { date: string; amount: number } | null;
  previous_bill: { invoice_no: string; invoice_date: string } | null;
  shop: ShopProfile;
  upi: { id: string; link: string | null; amount: number };
  summary: { grand_total: number; paid: number; due: number; status: string };
}

export interface SalesReturn {
  id: number;
  return_no: string;
  return_date: string;
  invoice_no: string | null;
  buyer_id: number | null;
  buyer_name: string;
  amount: number;
  reason: string | null;
  created_at: string;
}

export type PurchaseStatus = 'PAID' | 'PARTIAL' | 'UNPAID';

export interface PurchaseListItem {
  id: number;
  bill_no: string;
  date: string;
  supplier_id: number | null;
  supplier_name: string;
  vehicle_no: string | null;
  goods_amount: number;
  expenses_amount: number;
  commission_percent?: number;
  commission_amount?: number;
  net_amount: number;
  paid_amount: number;
  balance_due: number;
  payment_mode: string;
  items: number;
  status: PurchaseStatus;
}

export interface PurchaseListResponse {
  items: PurchaseListItem[];
  summary: {
    bills: number;
    goods: number;
    expenses: number;
    net: number;
    paid: number;
    due: number;
  };
}

export interface PurchaseItem {
  id: number;
  commodity_id: number | null;
  commodity_name: string;
  unit: string;
  weight: number;
  rate: number;
  amount: number;
}

export interface PurchaseDetailResponse {
  bill: PurchaseListItem & {
    commission_percent: number;
    commission_amount: number;
    driver_name: string | null;
    village: string | null;
    notes: string | null;
  };
  items: PurchaseItem[];
  payments: Array<{ id: number; voucher_no: string; date: string; mode: string; amount: number; notes: string | null }>;
  supplier: { id: number; name: string; phone: string | null; balance: number } | null;
  shop: ShopProfile;
}

export interface Vehicle {
  id: number;
  vehicle_no: string;
  driver_name: string | null;
  driver_phone: string | null;
  owner_name: string | null;
  vehicle_type: string;
  capacity_kg: number;
  status: 'ACTIVE' | 'MAINTENANCE' | 'IDLE';
  notes: string | null;
  trips_today: number;
  trips_total: number;
  last_trip: string | null;
}

export interface VehicleListResponse {
  items: Vehicle[];
  unlisted: string[];
  summary: { total: number; active: number; trips_today: number };
}

export const PARTY_TYPE_LABEL: Record<PartyType, string> = {
  farmer: 'Farmer',
  buyer: 'Buyer',
  supplier: 'Supplier',
  agent: 'Agent',
};

export const STOCK_STATE_LABEL: Record<StockState, string> = {
  OK: 'In stock',
  LOW: 'Low',
  OUT: 'Out',
};
