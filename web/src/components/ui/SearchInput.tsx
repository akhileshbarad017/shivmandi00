import { Search, X } from 'lucide-react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onFocus?: () => void;
  onBlur?: () => void;
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className,
  onFocus,
  onBlur,
}: SearchInputProps) {
  return (
    <div
      className={`glass flex items-center gap-2 rounded-xl px-3 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-400/30 ${
        className ?? ''
      }`}
    >
      <Search className="size-4 shrink-0 opacity-60" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        className="w-full bg-transparent py-2.5 text-base outline-none placeholder:opacity-50"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="muted -my-2 grid size-11 shrink-0 place-items-center rounded-full hover:text-[var(--text)]"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
