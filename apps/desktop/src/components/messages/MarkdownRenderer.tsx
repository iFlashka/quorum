import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { PublicMember } from '@quorum/shared';

interface MarkdownRendererProps {
  content: string;
  /** Маппинг user-id → отображаемое имя (для рендера `<@uuid>` mentions). */
  userById?: Map<string, PublicMember>;
}

const MARKED_OPTIONS = {
  gfm: true,
  breaks: true,
};

const DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'b',
    'strong',
    'i',
    'em',
    's',
    'del',
    'u',
    'code',
    'pre',
    'a',
    'blockquote',
    'ul',
    'ol',
    'li',
    'p',
    'br',
    'span',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
  ALLOWED_URI_REGEXP: /^(https?:|mailto:|#)/i,
};

/** Регэксп замены `<@uuid>` на span с именем. Применяется ДО marked, на raw тексте. */
const MENTION_RE = /<@([0-9a-f-]{36})>/gi;

export function MarkdownRenderer({ content, userById }: MarkdownRendererProps): JSX.Element {
  const html = useMemo(() => {
    const withMentions = content.replace(MENTION_RE, (_, uuid: string) => {
      const member = userById?.get(uuid);
      const name = member ? `@${member.username}` : '@unknown';
      return `<span class="mention">${escapeHtml(name)}</span>`;
    });

    const rendered = marked.parse(withMentions, MARKED_OPTIONS) as string;
    const safe = DOMPurify.sanitize(rendered, DOMPURIFY_CONFIG);
    return safe;
  }, [content, userById]);

  return (
    <div
      className="prose-quorum text-[15px] leading-[1.375] whitespace-pre-wrap break-words text-text-primary"
      // sanitized DOMPurify-ом выше; ALLOWED_TAGS/ALLOWED_ATTR ограничены.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
