import { cn } from '@/lib/utils';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function Toggle({ checked, onChange, label, disabled, className }: ToggleProps): JSX.Element {
  return (
    <label
      className={cn(
        'flex cursor-pointer select-none items-center gap-3',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-10 rounded-[12px] transition-colors duration-200',
          'focus-visible:outline-2 focus-visible:outline-[var(--clr-blurple)] focus-visible:outline-offset-2',
          checked ? 'bg-status-online' : 'bg-int-muted',
        )}
      >
        <span
          className={cn(
            'absolute top-[3px] left-[3px] h-[18px] w-[18px] rounded-full bg-white shadow-mid transition-transform duration-200',
            checked && 'translate-x-4',
          )}
        />
      </button>
      {label && <span className="text-[14px] text-text-normal">{label}</span>}
    </label>
  );
}
