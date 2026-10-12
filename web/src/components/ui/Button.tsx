import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'subtle' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: LucideIcon;
  children?: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-lg hover:brightness-110 disabled:opacity-60',
  subtle:
    'glass text-[var(--text)] hover:bg-[var(--surface-strong)] disabled:opacity-50',
  ghost: 'text-[var(--text)] hover:bg-[var(--surface-strong)] disabled:opacity-50',
  danger: 'bg-danger/90 text-white hover:bg-danger disabled:opacity-60',
};

const SIZES: Record<Size, string> = {
  sm: 'h-11 px-3 text-xs',
  md: 'h-11 px-4 text-sm',
  icon: 'size-11',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon: Icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.98]',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        Icon && <Icon className="size-4 shrink-0" />
      )}
      {children}
    </button>
  );
}
