import { useMemo } from 'react';
import type { PublicMember } from '@quorum/shared';
import { useAuth } from '@/auth/store';
import { renderMarkdown } from '@/lib/markdown/render';

interface MarkdownRendererProps {
  content: string;
  /** Маппинг user-id → отображаемое имя (для рендера `<@uuid>` mentions). */
  userById?: Map<string, PublicMember>;
}

export function MarkdownRenderer({ content, userById }: MarkdownRendererProps): JSX.Element {
  const meId = useAuth((s) => s.user?.id);
  const html = useMemo(() => renderMarkdown(content, userById, meId), [content, userById, meId]);

  return (
    <div
      className="prose-quorum text-[16px] leading-[1.375] whitespace-pre-wrap break-words text-text-primary"
      // sanitized DOMPurify-ом в renderMarkdown; ALLOWED_TAGS/ALLOWED_ATTR ограничены.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
