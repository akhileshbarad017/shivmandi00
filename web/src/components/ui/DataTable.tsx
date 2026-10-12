import type { ReactNode } from 'react';
import { m } from 'motion/react';
import { cn } from '@/lib/cn';
import { listContainer, listItem } from '@/lib/motion';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
  mobileHidden?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
}

function cellValue<T>(row: T, column: Column<T>): ReactNode {
  if (column.render) return column.render(row);
  const value = (row as Record<string, unknown>)[column.key];
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

const ALIGN: Record<string, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

export function DataTable<T>({ columns, rows, rowKey, empty, onRowClick }: DataTableProps<T>) {
  if (rows.length === 0 && empty) {
    return <div className="glass glass-card">{empty}</div>;
  }

  return (
    <>
      {/* Desktop / tablet */}
      <div className="glass hidden overflow-hidden rounded-2xl sm:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    'muted px-4 py-3 text-xs font-semibold uppercase tracking-wider',
                    ALIGN[column.align ?? 'left'],
                    column.className,
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <m.tbody variants={listContainer} initial="initial" animate="animate">
            {rows.map((row) => (
              <m.tr
                key={rowKey(row)}
                variants={listItem}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'border-b border-[var(--border)] last:border-0',
                  onRowClick && 'cursor-pointer hover:bg-[var(--surface-strong)]',
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn('px-4 py-3', ALIGN[column.align ?? 'left'], column.className)}
                  >
                    {cellValue(row, column)}
                  </td>
                ))}
              </m.tr>
            ))}
          </m.tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <m.div className="space-y-2 sm:hidden" variants={listContainer} initial="initial" animate="animate">
        {rows.map((row) => (
          <m.div
            key={rowKey(row)}
            variants={listItem}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={cn('glass glass-card', onRowClick && 'active:scale-[0.99]')}
          >
            {columns
              .filter((column) => !column.mobileHidden)
              .map((column) => (
                <div
                  key={column.key}
                  className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-2 last:border-0 first:pt-0 last:pb-0"
                >
                  <span className="muted shrink-0 text-xs font-medium">{column.header}</span>
                  <span className={cn('min-w-0 text-right', column.className)}>
                    {cellValue(row, column)}
                  </span>
                </div>
              ))}
          </m.div>
        ))}
      </m.div>
    </>
  );
}
