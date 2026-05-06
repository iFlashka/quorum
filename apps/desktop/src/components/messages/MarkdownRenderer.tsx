import { useMemo } from 'react';
import type { PublicMember } from '@quorum/shared';
import { renderMarkdown } from '@/lib/markdown/render';

interface MarkdownRendererProps {
  content: string;
  /** Маппинг user-id → отображаемое имя (для рендера `<@uuid>` mentions). */
  userById?: Map<string, PublicMember>;
}

export function MarkdownRenderer({ content, userById }: MarkdownRendererProps): JSX.Element {
  const html = useMemo(() => renderMarkdown(content, userById), [content, userById]);

  return (
    <div
      className="prose-quorum text-[15px] leading-[1.375] whitespace-pre-wrap break-words text-text-primary"
      // sanitized DOMPurify-ом в renderMarkdown; ALLOWED_TAGS/ALLOWED_ATTR ограничены.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
