import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center select-none font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[var(--clr-blurple)] focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:   'bg-blurple text-white hover:bg-blurple-hover active:bg-blurple-press',
        secondary: 'bg-bg-5 text-int-normal hover:bg-bg-6 hover:text-int-hover',
        danger:    'bg-[#da373c] text-white hover:bg-[#a12d31] active:bg-[#8a2527]',
        positive:  'bg-positive text-white hover:bg-[#1a6334] active:bg-[#145228]',
        ghost:     'border border-border-strong bg-transparent text-int-normal hover:bg-bg-6 hover:text-int-hover',
        link:      'h-auto p-0 text-text-link underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-[30px] rounded-[3px] px-3 text-[12px]',
        md: 'h-[38px] rounded-[4px] px-4 text-[14px]',
        lg: 'h-[44px] rounded-[4px] px-6 text-[16px]',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
