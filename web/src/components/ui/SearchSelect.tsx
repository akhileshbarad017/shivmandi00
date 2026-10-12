import { useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface SearchOption {
  value: string;
  label: string;
}

/** Cap rendered options; typing narrows the list. */
const MAX_OPTIONS = 50;

interface SearchSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
}

/** A searchable dropdown/picker. */
export function SearchSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyLabel = 'No matches',
}: SearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => option.label.toLowerCase().includes(needle));
  }, [options, query]);
  const visible = filtered.slice(0, MAX_OPTIONS);

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          setQuery('');
        }}
        className="glass flex w-full min-w-0 items-center justify-between gap-2 rounded-xl px-3 py-3 text-left text-base"
      >
        <span className={cn('min-w-0 flex-1 truncate', !selected && 'muted')}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className="size-4 shrink-0 opacity-60" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="glass-strong absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-2xl p-2">
            <div className="mb-2 flex items-center gap-2 rounded-xl border border-[var(--border)] px-2.5 py-2">
              <Search className="size-4 shrink-0 opacity-60" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                className="w-full bg-transparent text-sm outline-none placeholder:opacity-50"
              />
            </div>
            {filtered.length === 0 ? (
              <p className="muted px-3 py-2 text-sm">{emptyLabel}</p>
            ) : (
              <div className="space-y-1">
                {visible.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className={cn(
                      'block w-full break-words rounded-xl px-3 py-2 text-left text-sm leading-snug transition',
                      option.value === value
                        ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white'
                        : 'hover:bg-[var(--surface-strong)]',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
                {filtered.length > visible.length && (
                  <p className="muted px-3 py-2 text-center text-xs">
                    Showing {visible.length} of {filtered.length} — keep typing to narrow.
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
