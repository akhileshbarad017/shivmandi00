import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Check, IndianRupee, Pencil, Plus, Trash2, UserRound, Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { StatCard } from '@/components/ui/StatCard';
import { useToast } from '@/components/ui/Toast';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, formatINR } from '@/lib/format';
import type {
  AdvancesResponse,
  AttendanceMonthResponse,
  AttendanceStatus,
  Employee,
  StaffAdvancesOverview,
  StaffResponse,
} from '@/lib/types';

const ATTENDANCE_TONE: Record<AttendanceStatus, BadgeTone> = {
  PRESENT: 'ok',
  ABSENT: 'danger',
  HALF_DAY: 'warn',
  LEAVE: 'brand',
};

const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  HALF_DAY: 'Half day',
  LEAVE: 'Leave',
};

const CYCLE: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE'];

const currentMonth = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 7);

export default function StaffPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [attendanceFor, setAttendanceFor] = useState<Employee | null>(null);
  const [advancesFor, setAdvancesFor] = useState<Employee | null>(null);
  const [toDelete, setToDelete] = useState<Employee | null>(null);
  const [taskOpen, setTaskOpen] = useState(false);
  const [advancesOverviewOpen, setAdvancesOverviewOpen] = useState(false);

  const staff = useQuery({ queryKey: ['staff'], queryFn: () => apiGet<StaffResponse>('/staff') });

  const remove = useMutation({
    mutationFn: (id: number) => apiDelete(`/staff/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast.notify('Employee removed', 'success');
      setToDelete(null);
    },
    onError: (error: Error) => toast.notify(error.message, 'error'),
  });

  const completeTask = useMutation({
    mutationFn: (id: number) => apiPatch(`/staff/tasks/${id}`, { status: 'DONE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast.notify('Task completed', 'success');
    },
    onError: (error: Error) => toast.notify(error.message, 'error'),
  });

  const deleteTask = useMutation({
    mutationFn: (id: number) => apiDelete(`/staff/tasks/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['staff'] });
    },
    onError: (error: Error) => toast.notify(error.message, 'error'),
  });

  const summary = staff.data?.summary;

  const columns: Column<Employee>[] = [
    {
      key: 'name',
      header: 'Employee',
      render: (row) => (
        <div>
          <div className="font-medium">{row.name}</div>
          <div className="muted text-xs">{row.role}</div>
        </div>
      ),
    },
    { key: 'phone', header: 'Phone', render: (row) => row.phone || '—' },
    { key: 'salary', header: 'Salary', align: 'right', render: (row) => formatINR(row.salary) },
    {
      key: 'today_status',
      header: 'Today',
      align: 'center',
      render: (row) =>
        row.today_status ? (
          <Badge tone={ATTENDANCE_TONE[row.today_status]}>{ATTENDANCE_LABEL[row.today_status]}</Badge>
        ) : (
          <span className="muted text-xs">Not marked</span>
        ),
    },
    {
      key: 'advance_balance',
      header: 'Advance',
      align: 'right',
      mobileHidden: true,
      render: (row) => (row.advance_balance > 0 ? <span className="text-warn">{formatINR(row.advance_balance)}</span> : '—'),
    },
    { key: 'open_tasks', header: 'Tasks', align: 'right', mobileHidden: true, render: (row) => String(row.open_tasks) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1">
          <Button size="icon" variant="ghost" title="Attendance" onClick={() => setAttendanceFor(row)}>
            <CalendarDays className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" title="Advances" onClick={() => setAdvancesFor(row)}>
            <IndianRupee className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            title="Edit"
            onClick={() => {
              setEditing(row);
              setFormOpen(true);
            }}
          >
            <Pencil className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" title="Remove" onClick={() => setToDelete(row)}>
            <Trash2 className="size-4 text-danger" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Staff"
        subtitle="Team, attendance, advances and tasks."
        icon={UserRound}
        actions={
          <>
            <Button variant="subtle" icon={IndianRupee} onClick={() => setAdvancesOverviewOpen(true)}>
              Advances
            </Button>
            <Button
              icon={Plus}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              Add employee
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Staff" value={String(summary?.total ?? 0)} icon={Users} hint={`${summary?.present ?? 0} present`} />
        <StatCard label="Payroll" value={formatINR(summary?.payroll ?? 0)} icon={IndianRupee} tone="text-cyan" />
        <StatCard label="Advances" value={formatINR(summary?.advances ?? 0)} icon={IndianRupee} tone="text-warn" />
        <StatCard label="Open tasks" value={String(summary?.open_tasks ?? 0)} icon={Check} tone="text-ok" />
      </div>

      <DataTable
        columns={columns}
        rows={staff.data?.items ?? []}
        rowKey={(row) => row.id}
        empty={<EmptyState icon={UserRound} title="No employees" description="Add your first team member." />}
      />

      <div className="flex items-center justify-between pt-2">
        <h2 className="font-display text-lg font-semibold">Open tasks</h2>
        <Button variant="subtle" icon={Plus} onClick={() => setTaskOpen(true)}>
          Add task
        </Button>
      </div>

      <div className="glass glass-card">
        {(staff.data?.tasks.length ?? 0) === 0 ? (
          <p className="muted py-6 text-center text-sm">No open tasks.</p>
        ) : (
          <div className="space-y-2">
            {staff.data?.tasks.map((task) => (
              <div key={task.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] p-3">
                <button
                  type="button"
                  onClick={() => completeTask.mutate(task.id)}
                  title="Mark done"
                  className="grid size-6 shrink-0 place-items-center rounded-full border border-[var(--border-strong)] hover:bg-ok/15"
                >
                  <Check className="size-3.5 opacity-50" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{task.title}</div>
                  <div className="muted text-xs">
                    {task.employee_name ?? 'Unassigned'}
                    {task.due_date ? ` · due ${formatDate(task.due_date)}` : ''}
                  </div>
                </div>
                <Button size="icon" variant="ghost" title="Delete" onClick={() => deleteTask.mutate(task.id)}>
                  <Trash2 className="size-4 text-danger" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {formOpen && <EmployeeModal employee={editing} onClose={() => setFormOpen(false)} />}
      {attendanceFor && <AttendanceModal employee={attendanceFor} onClose={() => setAttendanceFor(null)} />}
      {advancesFor && <AdvancesModal employee={advancesFor} onClose={() => setAdvancesFor(null)} />}
      {taskOpen && <TaskModal employees={staff.data?.items ?? []} onClose={() => setTaskOpen(false)} />}
      {advancesOverviewOpen && <AdvancesOverviewModal onClose={() => setAdvancesOverviewOpen(false)} />}
      <ConfirmDialog
        open={!!toDelete}
        title="Remove employee?"
        message={`${toDelete?.name ?? ''} will be marked as left.`}
        confirmLabel="Remove"
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}

function EmployeeModal({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(employee?.name ?? '');
  const [role, setRole] = useState(employee?.role ?? 'Staff');
  const [phone, setPhone] = useState(employee?.phone ?? '');
  const [salary, setSalary] = useState(employee ? String(employee.salary) : '');
  const [status, setStatus] = useState(employee?.status ?? 'ACTIVE');

  const save = useMutation({
    mutationFn: () => {
      const payload = { name, role, phone, salary: Number(salary) || 0, status };
      return employee ? apiPatch(`/staff/${employee.id}`, payload) : apiPost('/staff', payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast.notify(employee ? 'Employee updated' : 'Employee added', 'success');
      onClose();
    },
    onError: (error: Error) => toast.notify(error.message, 'error'),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={employee ? 'Edit employee' : 'Add employee'}
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} disabled={name.trim().length === 0} onClick={() => save.mutate()}>
            {employee ? 'Save changes' : 'Add employee'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Name" className="sm:col-span-2">
          <Input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        </FormField>
        <FormField label="Role">
          <Input value={role} onChange={(event) => setRole(event.target.value)} placeholder="Designation" />
        </FormField>
        <FormField label="Phone">
          <Input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" />
        </FormField>
        <FormField label="Monthly salary (₹)">
          <Input value={salary} onChange={(event) => setSalary(event.target.value)} inputMode="decimal" />
        </FormField>
        <FormField label="Status">
          <Select value={status} onChange={(event) => setStatus(event.target.value as Employee['status'])}>
            <option value="ACTIVE">Active</option>
            <option value="ON_LEAVE">On leave</option>
            <option value="LEFT">Left</option>
          </Select>
        </FormField>
      </div>
    </Modal>
  );
}

function AttendanceModal({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [month, setMonth] = useState(currentMonth());

  const attendance = useQuery({
    queryKey: ['attendance', employee.id, month],
    queryFn: () => apiGet<AttendanceMonthResponse>(`/staff/attendance?employee_id=${employee.id}&month=${month}`),
  });

  const mark = useMutation({
    mutationFn: (payload: { date: string; status: AttendanceStatus }) =>
      apiPost('/staff/attendance', { employee_id: employee.id, date: payload.date, status: payload.status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['attendance', employee.id, month] });
      void queryClient.invalidateQueries({ queryKey: ['staff'] });
    },
    onError: (error: Error) => toast.notify(error.message, 'error'),
  });

  const [year, monthNum] = month.split('-').map(Number);
  const firstWeekday = (new Date(year!, monthNum! - 1, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year!, monthNum!, 0).getDate();
  const days = attendance.data?.days ?? {};
  const summary = attendance.data?.summary;

  const shiftMonth = (delta: number) => {
    const date = new Date(year!, monthNum! - 1 + delta, 1);
    setMonth(date.toISOString().slice(0, 7));
  };

  const cycle = (date: string, existing?: AttendanceStatus) => {
    const index = existing ? CYCLE.indexOf(existing) : -1;
    const next = CYCLE[(index + 1) % CYCLE.length]!;
    mark.mutate({ date, status: next });
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`${employee.name} — attendance`}
      description="Tap a day to cycle Present → Absent → Half day → Leave."
    >
      <div className="mb-3 flex items-center justify-between">
        <Button variant="subtle" size="icon" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
          ←
        </Button>
        <span className="font-display text-base font-semibold">{month}</span>
        <Button variant="subtle" size="icon" aria-label="Next month" onClick={() => shiftMonth(1)}>
          →
        </Button>
      </div>

      {summary && (
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          <Badge tone="ok">Present {summary.present}</Badge>
          <Badge tone="danger">Absent {summary.absent}</Badge>
          <Badge tone="warn">Half {summary.half}</Badge>
          <Badge tone="brand">Leave {summary.leave}</Badge>
        </div>
      )}

      <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((day) => (
          <div key={day} className="muted py-1 font-semibold uppercase">
            {day}
          </div>
        ))}
        {Array.from({ length: firstWeekday }).map((_, index) => (
          <div key={`pad-${index}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, index) => {
          const dayNum = index + 1;
          const date = `${year}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
          const status = days[date]?.status;
          return (
            <button
              key={date}
              type="button"
              onClick={() => cycle(date, status)}
              className={cn(
                'flex aspect-square min-h-11 flex-col items-center justify-center rounded-xl border text-xs transition',
                status === 'PRESENT' && 'border-ok/40 bg-ok/15 text-ok',
                status === 'ABSENT' && 'border-danger/40 bg-danger/15 text-danger',
                status === 'HALF_DAY' && 'border-warn/40 bg-warn/15 text-warn',
                status === 'LEAVE' && 'border-brand-400/40 bg-brand-500/15 text-brand-500',
                !status && 'border-[var(--border)] hover:bg-[var(--surface-strong)]',
              )}
            >
              <span className="font-medium">{dayNum}</span>
              {status && <span className="text-xs">{status.slice(0, 2)}</span>}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

function AdvancesModal({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [type, setType] = useState<'ADVANCE' | 'REPAYMENT'>('ADVANCE');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');

  const advances = useQuery({
    queryKey: ['advances', employee.id],
    queryFn: () => apiGet<AdvancesResponse>(`/staff/advances?employee_id=${employee.id}`),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['advances', employee.id] });
    void queryClient.invalidateQueries({ queryKey: ['staff'] });
  };

  const add = useMutation({
    mutationFn: () => apiPost('/staff/advances', { employee_id: employee.id, type, amount: Number(amount), date: date || undefined, notes }),
    onSuccess: () => {
      invalidate();
      setAmount('');
      setNotes('');
      toast.notify('Saved', 'success');
    },
    onError: (error: Error) => toast.notify(error.message, 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiDelete(`/staff/advances/${id}`),
    onSuccess: () => {
      invalidate();
    },
    onError: (error: Error) => toast.notify(error.message, 'error'),
  });

  const summary = advances.data?.summary;

  return (
    <Modal
      open
      onClose={onClose}
      title={`${employee.name} — advances`}
      description={summary ? `Outstanding ${formatINR(summary.outstanding)} · Net payable ${formatINR(summary.net_payable)}` : undefined}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Type">
          <Select value={type} onChange={(event) => setType(event.target.value as 'ADVANCE' | 'REPAYMENT')}>
            <option value="ADVANCE">Advance</option>
            <option value="REPAYMENT">Repayment</option>
          </Select>
        </FormField>
        <FormField label="Amount (₹)">
          <Input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" />
        </FormField>
        <FormField label="Date">
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </FormField>
        <FormField label="Notes">
          <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional" />
        </FormField>
      </div>
      <div className="mt-3 flex justify-end">
        <Button size="sm" loading={add.isPending} disabled={!Number(amount)} onClick={() => add.mutate()}>
          Add entry
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        {(advances.data?.items.length ?? 0) === 0 ? (
          <p className="muted py-4 text-center text-sm">No advances yet.</p>
        ) : (
          advances.data?.items.map((row) => (
            <div key={row.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] p-2.5 text-sm">
              <Badge tone={row.type === 'ADVANCE' ? 'warn' : 'ok'}>{row.type === 'ADVANCE' ? 'Advance' : 'Repaid'}</Badge>
              <span className="flex-1">{formatINR(row.amount)}</span>
              <span className="muted text-xs">{formatDate(row.date)}</span>
              <Button size="icon" variant="ghost" title="Delete" onClick={() => remove.mutate(row.id)}>
                <Trash2 className="size-4 text-danger" />
              </Button>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}

function TaskModal({ employees, onClose }: { employees: Employee[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [dueDate, setDueDate] = useState('');

  const save = useMutation({
    mutationFn: () =>
      apiPost('/staff/tasks', { title, employee_id: employeeId ? Number(employeeId) : undefined, due_date: dueDate }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast.notify('Task added', 'success');
      onClose();
    },
    onError: (error: Error) => toast.notify(error.message, 'error'),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Add task"
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} disabled={title.trim().length === 0} onClick={() => save.mutate()}>
            Add task
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <FormField label="Task">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Clean crates" autoFocus />
        </FormField>
        <FormField label="Assign to">
          <Select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
            <option value="">Unassigned</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Due date">
          <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}

function AdvancesOverviewModal({ onClose }: { onClose: () => void }) {
  const overview = useQuery({
    queryKey: ['advances-overview'],
    queryFn: () => apiGet<StaffAdvancesOverview>('/staff/advances-overview'),
  });

  const rows = overview.data?.items ?? [];

  const columns: Column<StaffAdvancesOverview['items'][number]>[] = [
    {
      key: 'name',
      header: 'Staff',
      render: (row) => (
        <div>
          <div className="font-medium">{row.name}</div>
          <div className="muted text-xs">{row.role}</div>
        </div>
      ),
    },
    { key: 'advance', header: 'Advance', align: 'right', render: (row) => formatINR(row.advance) },
    {
      key: 'last_advance_date',
      header: 'Date',
      mobileHidden: true,
      render: (row) => (row.last_advance_date ? formatDate(row.last_advance_date) : '—'),
    },
    { key: 'repayment', header: 'Recovered', align: 'right', render: (row) => formatINR(row.repayment) },
    {
      key: 'outstanding',
      header: 'Remaining',
      align: 'right',
      render: (row) => (
        <span className={row.outstanding > 0 ? 'text-warn' : 'muted'}>{formatINR(row.outstanding)}</span>
      ),
    },
    {
      key: 'net_payable',
      header: 'Net salary',
      align: 'right',
      render: (row) => formatINR(row.net_payable),
    },
  ];

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Staff advances"
      description="Advances taken and what remains to recover from salary."
    >
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        empty={<p className="muted py-6 text-center text-sm">No advances recorded.</p>}
      />
    </Modal>
  );
}
