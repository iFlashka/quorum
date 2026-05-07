import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
  className,
}: CheckboxProps): JSX.Element {
  return (
    <label
      className={cn(
        'flex cursor-pointer select-none items-center gap-2.5',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[3px] border-2 transition-colors',
          'focus-visible:outline-2 focus-visible:outline-[var(--clr-blurple)] focus-visible:outline-offset-2',
          checked ? 'border-blurple bg-blurple' : 'border-int-muted bg-transparent',
        )}
      >
        {checked && <Check size={12} strokeWidth={3} className="text-white" />}
      </button>
      {label && <span className="text-[14px] text-text-normal">{label}</span>}
    </label>
  );
}
