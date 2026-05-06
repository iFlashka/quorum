/**
 * Discord-style мини-строка над сообщением, показывающая на какое сообщение
 * это reply: ↩-stub, мини-аватар автора, имя цветом по роли, preview content.
 *
 * Layout: padding-left ~56px чтобы ↩-визуал торчал в колонку avatar'а
 * родительского message; высота 16px, font 13px.
 */

import { CornerUpLeft } from 'lucide-react';
import type { PublicMember, PublicMessagePreview } from '@quorum/shared';
import { roleColorStyle } from '@/lib/role-color';
import { cn } from '@/lib/utils';

interface ReplyContextProps {
  preview: PublicMessagePreview;
  /** Map для резолва role родительского автора → цвет имени. */
  userById?: Map<string, PublicMember>;
}

export function ReplyContext({ preview, userById }: ReplyContextProps): JSX.Element {
  const member = userById?.get(preview.author.id);
  const initials = avatarInitials(
    preview.author.displayName || preview.author.username || '?',
  );
  const authorName = preview.author.displayName || preview.author.username;

  return (
    <div className="flex items-center gap-1.5 pt-1 pl-[56px] pr-4 text-[13px] leading-[1.125] text-text-muted">
      <CornerUpLeft
        size={20}
        strokeWidth={1.5}
        className="-ml-[24px] mr-[2px] shrink-0 self-end opacity-60"
      />
      {preview.deleted ? (
        <>
          <span className="italic">Оригинальное сообщение удалено</span>
        </>
      ) : (
        <>
          <span className="flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full bg-accent-primary text-[9px] font-semibold text-white">
            {initials}
          </span>
          <span
            className="shrink-0 font-medium text-text-secondary"
            style={roleColorStyle(member?.role)}
          >
            {authorName}
          </span>
          <span className={cn('truncate hover:text-text-secondary cursor-pointer')}>
            {preview.contentPreview}
          </span>
        </>
      )}
    </div>
  );
}

function avatarInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}
