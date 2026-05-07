import { cn } from '@/lib/utils';

// ── Badge ──────────────────────────────────────────────────────────────────

type BadgeVariant = 'red' | 'green' | 'gray';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = 'red', children, className }: BadgeProps): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-4 text-white',
        variant === 'red'   && 'bg-danger',
        variant === 'green' && 'bg-positive',
        variant === 'gray'  && 'bg-n-40',
        className,
      )}
    >
      {children}
    </span>
  );
}

// ── Tag ────────────────────────────────────────────────────────────────────

type TagVariant = 'bot' | 'mod' | 'nitro' | 'staff';

const TAG_LABELS: Record<TagVariant, string> = {
  bot:   'BOT',
  mod:   'MOD',
  nitro: 'NITRO',
  staff: 'STAFF',
};

interface TagProps {
  variant: TagVariant;
  children?: React.ReactNode;
  className?: string;
}

export function Tag({ variant, children, className }: TagProps): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex h-[15px] items-center rounded-[3px] px-1 text-[10px] font-medium text-white',
        variant === 'bot'   && 'bg-blurple',
        variant === 'mod'   && 'bg-[var(--clr-idle)]',
        variant === 'nitro' && 'bg-pink',
        variant === 'staff' && 'bg-positive',
        className,
      )}
    >
      {children ?? TAG_LABELS[variant]}
    </span>
  );
}
