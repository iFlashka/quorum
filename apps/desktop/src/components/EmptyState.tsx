/**
 * Универсальный пустой стейт: иконка по центру + заголовок + подпись.
 * Discord-style — крупная серая иконка 48–56px на bg-elevated-кружочке,
 * под ней headline 18px semibold + 14px text-muted.
 */

import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  className,
}: EmptyStateProps): JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-1 flex-col items-center justify-center px-6 text-center',
        className,
      )}
    >
      <div className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-bg-elevated">
        <Icon size={36} strokeWidth={1.5} className="text-text-secondary" />
      </div>
      <h3 className="mt-5 text-[18px] font-semibold text-text-primary">{title}</h3>
      {description && (
        <p className="mt-1 max-w-[320px] text-[14px] text-text-secondary">{description}</p>
      )}
    </div>
  );
}
