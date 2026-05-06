import type { PublicMember } from '@quorum/shared';

/**
 * Превращает читаемые `@username`-токены в формат сервера `<@uuid>`.
 *
 * - Матчим `@<username>` с лимитерами (начало строки или whitespace перед `@`).
 * - Username = [A-Za-z0-9_]+ (наш регистрационный regex), плюс дефисы.
 * - Если такого username среди members нет — оставляем как есть (юзер написал
 *   текст, не упоминание).
 *
 * Используется в MessageInput перед отправкой, чтобы в textarea пользователь
 * видел `@alice`, а на сервер уходило `<@uuid>`.
 */
export function serializeMentions(
  content: string,
  members: readonly PublicMember[],
): string {
  if (!content || members.length === 0) return content;

  const byUsername = new Map<string, string>();
  for (const m of members) byUsername.set(m.username.toLowerCase(), m.userId);

  return content.replace(/(^|\s)@([A-Za-z0-9_-]+)/g, (match, prefix: string, name: string) => {
    const userId = byUsername.get(name.toLowerCase());
    if (!userId) return match;
    return `${prefix}<@${userId}>`;
  });
}
