import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { logActivity } from '../services/activity.js';
import { todayISO } from '../utils/date.js';
import { HttpError } from '../utils/http.js';
import { money, round2 } from '../utils/money.js';

const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE'] as const;
const EMPLOYEE_STATUSES = ['ACTIVE', 'LEFT', 'ON_LEAVE'] as const;

interface EmployeeRow {
  id: number;
  name: string;
  role: string;
  phone: string | null;
  salary: number;
  join_date: string | null;
  status: string;
}

const employeeSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  role: z.string().trim().max(80).optional().default('Staff'),
  phone: z.string().trim().max(20).optional().default(''),
  salary: z.coerce.number().min(0).default(0),
  join_date: z.string().trim().optional().default(''),
  status: z.enum(EMPLOYEE_STATUSES).default('ACTIVE'),
});

const attendanceSchema = z.object({
  employee_id: z.coerce.number().int().positive('Choose an employee'),
  status: z.enum(ATTENDANCE_STATUSES),
  date: z.string().trim().optional(),
  check_in: z.string().trim().max(20).optional().default(''),
  check_out: z.string().trim().max(20).optional().default(''),
  notes: z.string().trim().max(200).optional().default(''),
});

const advanceSchema = z.object({
  employee_id: z.coerce.number().int().positive('Choose an employee'),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  type: z.enum(['ADVANCE', 'REPAYMENT']).default('ADVANCE'),
  date: z.string().trim().optional(),
  notes: z.string().trim().max(200).optional().default(''),
});

const taskSchema = z.object({
  title: z.string().trim().min(1, 'Task title is required'),
  employee_id: z.coerce.number().int().positive().optional(),
  due_date: z.string().trim().optional().default(''),
  status: z.enum(['OPEN', 'DONE', 'CANCELLED']).default('OPEN'),
  notes: z.string().trim().max(200).optional().default(''),
});

function parseId(raw: string, label = 'id'): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, `Invalid ${label}`);
  return id;
}

export const staffRouter = Router();
staffRouter.use(requireAuth);

staffRouter.get('/', (_req, res) => {
  const db = getDb();
  const today = todayISO();

  const employees = db
    .prepare(
      `SELECT e.*,
              (SELECT COUNT(*) FROM tasks t WHERE t.employee_id = e.id AND t.status = 'OPEN') AS open_tasks,
              (SELECT COALESCE(SUM(CASE WHEN a.type = 'ADVANCE' THEN a.amount ELSE -a.amount END), 0)
                 FROM staff_advances a WHERE a.employee_id = e.id) AS advance_balance
         FROM employees e
        WHERE e.status != 'LEFT'
        ORDER BY e.name`,
    )
    .all() as Array<EmployeeRow & { open_tasks: number; advance_balance: number }>;

  const attendanceToday = new Map<number, string>();
  for (const row of db
    .prepare('SELECT employee_id, status FROM attendance WHERE date = ?')
    .all(today) as Array<{ employee_id: number; status: string }>) {
    attendanceToday.set(row.employee_id, row.status);
  }

  const items = employees.map((employee) => ({
    ...employee,
    salary: money(employee.salary),
    advance_balance: money(employee.advance_balance),
    today_status: attendanceToday.get(employee.id) ?? null,
  }));

  const tasks = db
    .prepare(
      `SELECT t.*, e.name AS employee_name FROM tasks t
        LEFT JOIN employees e ON e.id = t.employee_id
        WHERE t.status = 'OPEN'
        ORDER BY (t.due_date IS NULL OR t.due_date = ''), t.due_date, t.id`,
    )
    .all();

  const payroll = round2(items.filter((e) => e.status === 'ACTIVE').reduce((sum, e) => sum + e.salary, 0));
  const advances = round2(items.reduce((sum, e) => sum + e.advance_balance, 0));

  res.json({
    success: true,
    items,
    tasks,
    summary: {
      total: items.length,
      present: items.filter((e) => e.today_status === 'PRESENT' || e.today_status === 'HALF_DAY').length,
      not_marked: items.filter((e) => !e.today_status).length,
      payroll,
      advances,
      net_payable: round2(payroll - advances),
      open_tasks: tasks.length,
    },
  });
});

staffRouter.get('/attendance', (req, res) => {
  const employeeId = Number(req.query.employee_id);
  const month = String(req.query.month ?? todayISO().slice(0, 7));
  if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, 'Invalid month');

  const db = getDb();
  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(employeeId) as EmployeeRow | undefined;
  if (!employee) throw new HttpError(404, 'Employee not found');

  const rows = db
    .prepare('SELECT date, status, check_in, check_out, notes FROM attendance WHERE employee_id = ? AND date LIKE ?')
    .all(employeeId, `${month}%`) as Array<Record<string, unknown>>;

  const days: Record<string, unknown> = {};
  const summary = { present: 0, absent: 0, half: 0, leave: 0 };
  for (const row of rows) {
    days[String(row.date)] = row;
    if (row.status === 'PRESENT') summary.present += 1;
    else if (row.status === 'ABSENT') summary.absent += 1;
    else if (row.status === 'HALF_DAY') summary.half += 1;
    else if (row.status === 'LEAVE') summary.leave += 1;
  }

  res.json({ success: true, employee, month, days, summary });
});

staffRouter.get('/attendance-year', (req, res) => {
  const year = Number(req.query.year ?? todayISO().slice(0, 4));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new HttpError(400, 'Invalid year');
  const employeeId = req.query.employee_id ? Number(req.query.employee_id) : null;
  const db = getDb();

  const employees = (employeeId
    ? db.prepare('SELECT * FROM employees WHERE id = ?').all(employeeId)
    : db.prepare("SELECT * FROM employees WHERE status != 'LEFT' ORDER BY name").all()) as EmployeeRow[];
  if (employees.length === 0) throw new HttpError(404, 'No employees');

  const items = employees.map((employee) => {
    const months = Array.from({ length: 12 }, () => ({ present: 0, absent: 0, half: 0, leave: 0 }));
    const rows = db
      .prepare("SELECT date, status FROM attendance WHERE employee_id = ? AND date LIKE ?")
      .all(employee.id, `${year}-%`) as Array<{ date: string; status: string }>;
    for (const row of rows) {
      const monthIndex = Number(row.date.slice(5, 7)) - 1;
      const bucket = months[monthIndex];
      if (!bucket) continue;
      if (row.status === 'PRESENT') bucket.present += 1;
      else if (row.status === 'ABSENT') bucket.absent += 1;
      else if (row.status === 'HALF_DAY') bucket.half += 1;
      else if (row.status === 'LEAVE') bucket.leave += 1;
    }
    const advance = db
      .prepare("SELECT COALESCE(SUM(CASE WHEN type = 'ADVANCE' THEN amount ELSE -amount END), 0) AS b FROM staff_advances WHERE employee_id = ?")
      .get(employee.id) as { b: number };
    const totals = months.reduce(
      (acc, month) => ({
        present: acc.present + month.present,
        absent: acc.absent + month.absent,
        half: acc.half + month.half,
        leave: acc.leave + month.leave,
      }),
      { present: 0, absent: 0, half: 0, leave: 0 },
    );
    return { employee, months, totals, advance: money(advance.b) };
  });

  res.json({ success: true, year, items });
});

staffRouter.get('/advances-overview', (_req, res) => {
  const db = getDb();
  const employees = db
    .prepare("SELECT * FROM employees WHERE status != 'LEFT' ORDER BY name")
    .all() as EmployeeRow[];

  const items = employees.map((employee) => {
    const advance = round2(
      (db
        .prepare("SELECT COALESCE(SUM(amount), 0) AS v FROM staff_advances WHERE employee_id = ? AND type = 'ADVANCE'")
        .get(employee.id) as { v: number }).v,
    );
    const repayment = round2(
      (db
        .prepare("SELECT COALESCE(SUM(amount), 0) AS v FROM staff_advances WHERE employee_id = ? AND type = 'REPAYMENT'")
        .get(employee.id) as { v: number }).v,
    );
    const last = db
      .prepare("SELECT MAX(date) AS d FROM staff_advances WHERE employee_id = ? AND type = 'ADVANCE'")
      .get(employee.id) as { d: string | null };
    const outstanding = round2(advance - repayment);

    return {
      id: employee.id,
      name: employee.name,
      role: employee.role,
      salary: money(employee.salary),
      advance,
      repayment,
      outstanding,
      net_payable: round2(Number(employee.salary) - outstanding),
      last_advance_date: last.d,
    };
  });

  res.json({
    success: true,
    items,
    summary: {
      staff: items.length,
      advance: round2(items.reduce((sum, row) => sum + row.advance, 0)),
      outstanding: round2(items.reduce((sum, row) => sum + row.outstanding, 0)),
    },
  });
});

staffRouter.get('/advances', (req, res) => {
  const employeeId = Number(req.query.employee_id);
  const db = getDb();
  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(employeeId) as EmployeeRow | undefined;
  if (!employee) throw new HttpError(404, 'Employee not found');

  const items = db
    .prepare('SELECT * FROM staff_advances WHERE employee_id = ? ORDER BY date DESC, id DESC')
    .all(employeeId) as Array<Record<string, unknown>>;

  const advance = round2(
    items.filter((r) => r.type === 'ADVANCE').reduce((sum, r) => sum + Number(r.amount), 0),
  );
  const repayment = round2(
    items.filter((r) => r.type === 'REPAYMENT').reduce((sum, r) => sum + Number(r.amount), 0),
  );

  res.json({
    success: true,
    employee,
    items: items.map((row) => ({ ...row, amount: money(row.amount) })),
    summary: {
      advance,
      repayment,
      outstanding: round2(advance - repayment),
      net_payable: round2(Number(employee.salary) - (advance - repayment)),
    },
  });
});

staffRouter.post('/', (req, res) => {
  const data = employeeSchema.parse(req.body ?? {});
  const result = getDb()
    .prepare('INSERT INTO employees (name, role, phone, salary, join_date, status) VALUES (?, ?, ?, ?, ?, ?)')
    .run(data.name, data.role, data.phone, data.salary, data.join_date, data.status);
  logActivity(req.user?.name ?? null, 'staff.create', data.name);
  res.status(201).json({ success: true, id: Number(result.lastInsertRowid), message: 'Employee added' });
});

staffRouter.patch('/:id', (req, res) => {
  const id = parseId(req.params.id, 'employee id');
  const data = employeeSchema.partial().parse(req.body ?? {});
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    values.push(value);
  }
  if (fields.length === 0) throw new HttpError(400, 'Nothing to update');
  values.push(id);
  const result = getDb().prepare(`UPDATE employees SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  if (result.changes === 0) throw new HttpError(404, 'Employee not found');
  logActivity(req.user?.name ?? null, 'staff.update', `#${id}`);
  res.json({ success: true, id, message: 'Employee updated' });
});

staffRouter.delete('/:id', (req, res) => {
  const id = parseId(req.params.id, 'employee id');
  const result = getDb().prepare("UPDATE employees SET status = 'LEFT' WHERE id = ?").run(id);
  if (result.changes === 0) throw new HttpError(404, 'Employee not found');
  logActivity(req.user?.name ?? null, 'staff.delete', `#${id}`);
  res.json({ success: true, message: 'Employee removed' });
});

staffRouter.post('/attendance', (req, res) => {
  const data = attendanceSchema.parse(req.body ?? {});
  const date = data.date ?? todayISO();
  const db = getDb();
  const employee = db.prepare('SELECT id FROM employees WHERE id = ?').get(data.employee_id);
  if (!employee) throw new HttpError(404, 'Employee not found');

  db.prepare(
    `INSERT INTO attendance (employee_id, date, status, check_in, check_out, notes)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(employee_id, date) DO UPDATE SET
       status = excluded.status, check_in = excluded.check_in,
       check_out = excluded.check_out, notes = excluded.notes`,
  ).run(data.employee_id, date, data.status, data.check_in, data.check_out, data.notes);

  res.status(201).json({ success: true, message: 'Attendance saved' });
});

staffRouter.post('/advances', (req, res) => {
  const data = advanceSchema.parse(req.body ?? {});
  const date = data.date ?? todayISO();
  const db = getDb();
  const employee = db.prepare('SELECT id FROM employees WHERE id = ?').get(data.employee_id);
  if (!employee) throw new HttpError(404, 'Employee not found');

  const result = db
    .prepare('INSERT INTO staff_advances (employee_id, date, type, amount, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .run(data.employee_id, date, data.type, data.amount, data.notes, req.user?.name ?? null);
  logActivity(req.user?.name ?? null, 'staff.advance', `${data.type} #${data.employee_id}`, data.amount);
  res.status(201).json({ success: true, id: Number(result.lastInsertRowid), message: 'Saved' });
});

staffRouter.delete('/advances/:id', (req, res) => {
  const id = parseId(req.params.id, 'advance id');
  const result = getDb().prepare('DELETE FROM staff_advances WHERE id = ?').run(id);
  if (result.changes === 0) throw new HttpError(404, 'Entry not found');
  res.json({ success: true, message: 'Entry deleted' });
});

staffRouter.post('/tasks', (req, res) => {
  const data = taskSchema.parse(req.body ?? {});
  const result = getDb()
    .prepare('INSERT INTO tasks (employee_id, title, due_date, status, notes) VALUES (?, ?, ?, ?, ?)')
    .run(data.employee_id ?? null, data.title, data.due_date, data.status, data.notes);
  logActivity(req.user?.name ?? null, 'staff.task', data.title);
  res.status(201).json({ success: true, id: Number(result.lastInsertRowid), message: 'Task added' });
});

staffRouter.patch('/tasks/:id', (req, res) => {
  const id = parseId(req.params.id, 'task id');
  const data = taskSchema.partial().parse(req.body ?? {});
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    values.push(value);
  }
  if (fields.length === 0) throw new HttpError(400, 'Nothing to update');
  values.push(id);
  const result = getDb().prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  if (result.changes === 0) throw new HttpError(404, 'Task not found');
  res.json({ success: true, id, message: 'Task updated' });
});

staffRouter.delete('/tasks/:id', (req, res) => {
  const id = parseId(req.params.id, 'task id');
  const result = getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id);
  if (result.changes === 0) throw new HttpError(404, 'Task not found');
  res.json({ success: true, message: 'Task deleted' });
});
