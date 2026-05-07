import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        'flex h-[36px] w-[36px] items-center justify-center rounded-[4px]',
        'text-int-normal transition-colors',
        'hover:bg-bg-7 hover:text-int-hover',
        'active:text-int-active',
        'disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
);
IconButton.displayName = 'IconButton';
