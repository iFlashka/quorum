/**
 * Базовый skeleton-блок: серый пульсирующий прямоугольник. Используется для
 * placeholders в боковых колонках и в чате на время первой загрузки данных.
 *
 * Не делаем shimmer-анимацию — `animate-pulse` от Tailwind достаточно: тише,
 * меньше CPU, и совпадает с другими местами проекта.
 */

import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ className, style }: SkeletonProps): JSX.Element {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-md bg-bg-elevated', className)}
      style={style}
    />
  );
}
