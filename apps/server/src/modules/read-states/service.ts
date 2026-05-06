import { and, eq, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client.js';
import { messages, readStates } from '../../db/schema.js';
import { AuthError } from '../auth/errors.js';
import type { MessagesService } from '../messages/service.js';

export class ReadStatesService {
  constructor(
    private readonly db: DbClient,
    private readonly messagesService: MessagesService,
  ) {}

  async markRead(userId: string, channelId: string, messageId: string): Promise<void> {
    const ctx = await this.messagesService.accessChannel(userId, channelId);
    if (!ctx) throw new AuthError('unauthorized');

    // Проверяем что сообщение из этого канала.
    const [msg] = await this.db
      .select({ id: messages.id, channelId: messages.channelId })
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);
    if (msg?.channelId !== channelId) throw new AuthError('unauthorized');

    await this.db
      .insert(readStates)
      .values({
        userId,
        channelId,
        lastReadMessageId: messageId,
        lastReadAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [readStates.userId, readStates.channelId],
        // Не двигаем «назад» — only forward.
        set: {
          lastReadMessageId: messageId,
          lastReadAt: sql`now()`,
        },
        where: and(
          eq(readStates.userId, userId),
          eq(readStates.channelId, channelId),
          // если уже стоит более свежее сообщение — обновление не сработает.
          sql`${readStates.lastReadAt} < now()`,
        ),
      });
  }
}
