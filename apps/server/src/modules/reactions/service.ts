import { and, eq } from 'drizzle-orm';
import type { DbClient } from '../../db/client.js';
import { messages, reactions } from '../../db/schema.js';
import { AuthError } from '../auth/errors.js';
import type { MessagesService } from '../messages/service.js';

export class ReactionsService {
  constructor(
    private readonly db: DbClient,
    private readonly messagesService: MessagesService,
  ) {}

  /** Поставить (idempotent — повторный PUT не падает). */
  async add(
    userId: string,
    channelId: string,
    messageId: string,
    emoji: string,
  ): Promise<{ guildId: string }> {
    const ctx = await this.messagesService.accessChannel(userId, channelId);
    if (!ctx) throw new AuthError('unauthorized');

    const [msg] = await this.db
      .select({ id: messages.id, channelId: messages.channelId })
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);
    if (msg?.channelId !== channelId) throw new AuthError('unauthorized');

    await this.db
      .insert(reactions)
      .values({ messageId, userId, emoji })
      .onConflictDoNothing();

    return { guildId: ctx.channel.guildId };
  }

  /** Снять. Idempotent. */
  async remove(
    userId: string,
    channelId: string,
    messageId: string,
    emoji: string,
  ): Promise<{ guildId: string }> {
    const ctx = await this.messagesService.accessChannel(userId, channelId);
    if (!ctx) throw new AuthError('unauthorized');

    const [msg] = await this.db
      .select({ id: messages.id, channelId: messages.channelId })
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);
    if (msg?.channelId !== channelId) throw new AuthError('unauthorized');

    await this.db
      .delete(reactions)
      .where(
        and(
          eq(reactions.messageId, messageId),
          eq(reactions.userId, userId),
          eq(reactions.emoji, emoji),
        ),
      );

    return { guildId: ctx.channel.guildId };
  }
}
