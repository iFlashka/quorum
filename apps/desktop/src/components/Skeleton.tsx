import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ className, style }: SkeletonProps): JSX.Element {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-[4px] bg-white/[0.06]', className)}
      style={style}
    />
  );
}
