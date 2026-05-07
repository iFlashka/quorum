import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

// ── Input ──────────────────────────────────────────────────────────────────

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-[4px] bg-bg-2 px-3 text-[15px] text-text-normal',
        'placeholder:text-int-muted border-none outline-none transition-shadow',
        error
          ? 'shadow-[0_0_0_2.5px_var(--clr-pink)]'
          : 'focus:shadow-[0_0_0_2.5px_var(--clr-blurple)]',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

// ── Textarea ───────────────────────────────────────────────────────────────

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'min-h-[80px] w-full resize-y rounded-[4px] bg-bg-2 px-3 py-2.5',
        'text-[15px] text-text-normal placeholder:text-int-muted',
        'border-none outline-none transition-shadow',
        error
          ? 'shadow-[0_0_0_2.5px_var(--clr-pink)]'
          : 'focus:shadow-[0_0_0_2.5px_var(--clr-blurple)]',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

// ── Field wrapper ──────────────────────────────────────────────────────────

interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}

export function Field({ label, hint, error, children, className }: FieldProps): JSX.Element {
  return (
    <div className={cn('flex flex-col gap-[7px]', className)}>
      {label && (
        <label className="text-[12px] font-bold uppercase tracking-[0.06em] text-text-muted">
          {label}
        </label>
      )}
      {children}
      {(hint || error) && (
        <span className={cn('text-[12px]', error ? 'text-[var(--clr-pink)]' : 'text-text-muted')}>
          {error ?? hint}
        </span>
      )}
    </div>
  );
}
