/**
 * Чистая функция рендера markdown → safe HTML с заменой `<@uuid>` на span с
 * именем участника. Вынесено из MarkdownRenderer чтобы можно было тестировать
 * без mount React-компонента.
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { PublicMember } from '@quorum/shared';

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

const MENTION_RE = /<@([0-9a-f-]{36})>/gi;

export function renderMarkdown(
  content: string,
  userById?: Map<string, PublicMember>,
  meId?: string,
): string {
  const withMentions = content.replace(MENTION_RE, (_, uuid: string) => {
    const member = userById?.get(uuid);
    const name = member ? `@${member.username}` : '@unknown';
    const isMe = !!member && !!meId && member.userId === meId;
    const cls = isMe ? 'mention mention-me' : 'mention';
    return `<span class="${cls}">${escapeHtml(name)}</span>`;
  });

  const rendered = marked.parse(withMentions, MARKED_OPTIONS) as string;
  return DOMPurify.sanitize(rendered, DOMPURIFY_CONFIG);
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
