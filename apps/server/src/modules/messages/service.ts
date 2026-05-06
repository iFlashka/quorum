import { and, asc, desc, eq, inArray, isNull, lt, gt } from 'drizzle-orm';
import type { DbClient } from '../../db/client.js';
import {
  attachments,
  channels,
  members,
  mentions,
  messages,
  reactions,
  users,
  type Channel,
  type Message,
} from '../../db/schema.js';
import type {
  PublicAttachment,
  PublicMessage,
  PublicMessageAuthor,
  PublicMessagePreview,
  PublicReaction,
  SendMessageRequest,
} from '@quorum/shared';
import { AuthError } from '../auth/errors.js';

/** Регэксп для денормализации mentions из `<@uuid>`-вставок в content. */
const MENTION_RE = /<@([0-9a-fA-F-]{36})>/g;

export interface MessageContext {
  channel: Channel;
  memberRole: 'owner' | 'admin' | 'member';
}

export class MessagesService {
  constructor(private readonly db: DbClient) {}

  /** Проверка что юзер — member канала; иначе null. */
  async accessChannel(userId: string, channelId: string): Promise<MessageContext | null> {
    const [row] = await this.db
      .select({ channel: channels, memberRole: members.role })
      .from(channels)
      .innerJoin(
        members,
        and(eq(members.guildId, channels.guildId), eq(members.userId, userId)),
      )
      .where(eq(channels.id, channelId))
      .limit(1);

    if (!row) return null;
    return { channel: row.channel, memberRole: row.memberRole };
  }

  async send(
    ctx: MessageContext,
    authorId: string,
    req: SendMessageRequest,
    currentViewerId: string,
  ): Promise<PublicMessage> {
    if (ctx.channel.kind !== 'text') throw new AuthError('unauthorized');

    const mentionedUserIds = extractMentionedUserIds(req.content);

    return this.db.transaction(async (tx) => {
      // Если есть replyTo — убедимся что он в этом же канале.
      if (req.replyToMessageId) {
        const [reply] = await tx
          .select({ id: messages.id, channelId: messages.channelId })
          .from(messages)
          .where(eq(messages.id, req.replyToMessageId))
          .limit(1);
        if (reply?.channelId !== ctx.channel.id) {
          throw new AuthError('unauthorized');
        }
      }

      const [row] = await tx
        .insert(messages)
        .values({
          channelId: ctx.channel.id,
          authorId,
          content: req.content,
          replyToMessageId: req.replyToMessageId ?? null,
        })
        .returning();
      if (!row) throw new Error('failed_to_insert_message');

      // Денормализуем mentions — нужны для уведомлений в фазе 3.
      if (mentionedUserIds.length > 0) {
        await tx
          .insert(mentions)
          .values(
            mentionedUserIds.map((mUserId) => ({
              messageId: row.id,
              mentionedUserId: mUserId,
            })),
          )
          .onConflictDoNothing();
      }

      // Привязываем уже-загруженные attachments. Защита: только те которые ещё
      // не привязаны (`messageId IS NULL`) и принадлежат отправителю — иначе
      // можно было бы «угнать» чужой uploaded attachment.
      if (req.attachmentIds && req.attachmentIds.length > 0) {
        await tx
          .update(attachments)
          .set({ messageId: row.id })
          .where(
            and(
              inArray(attachments.id, req.attachmentIds),
              isNull(attachments.messageId),
              eq(attachments.uploaderId, authorId),
            ),
          );
      }

      const hydrated = await this.hydrateMessages(tx as unknown as DbClient, [row], currentViewerId);
      const ready = hydrated[0];
      if (!ready) throw new Error('failed_to_hydrate_message');
      return ready;
    });
  }

  async edit(
    ctx: MessageContext,
    userId: string,
    messageId: string,
    content: string,
    viewerId: string,
  ): Promise<PublicMessage> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(messages)
        .where(eq(messages.id, messageId))
        .limit(1);

      if (existing?.channelId !== ctx.channel.id) {
        throw new AuthError('unauthorized');
      }
      if (existing.authorId !== userId) {
        // Edit разрешён только автору, никогда никому ещё.
        throw new AuthError('unauthorized');
      }

      await tx
        .update(messages)
        .set({ content, editedAt: new Date() })
        .where(eq(messages.id, messageId));

      // Перепарсим mentions: добавляем новые, удаляем те которые ушли из текста.
      const newMentions = extractMentionedUserIds(content);
      await tx.delete(mentions).where(eq(mentions.messageId, messageId));
      if (newMentions.length > 0) {
        await tx
          .insert(mentions)
          .values(newMentions.map((m) => ({ messageId, mentionedUserId: m })))
          .onConflictDoNothing();
      }

      const [updated] = await tx.select().from(messages).where(eq(messages.id, messageId));
      if (!updated) throw new Error('failed_to_reload_message');
      const hydrated = await this.hydrateMessages(
        tx as unknown as DbClient,
        [updated],
        viewerId,
      );
      const ready = hydrated[0];
      if (!ready) throw new Error('failed_to_hydrate_message');
      return ready;
    });
  }

  async delete(ctx: MessageContext, userId: string, messageId: string): Promise<void> {
    const [existing] = await this.db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);
    if (existing?.channelId !== ctx.channel.id) {
      throw new AuthError('unauthorized');
    }

    const isAuthor = existing.authorId === userId;
    const canModerate = ctx.memberRole === 'owner' || ctx.memberRole === 'admin';
    if (!isAuthor && !canModerate) throw new AuthError('unauthorized');

    await this.db.delete(messages).where(eq(messages.id, messageId));
  }

  /**
   * Cursor-pagination: если `before` — берём messages с createdAt < before.createdAt.
   * Если `after` — > after.createdAt. Иначе — самые свежие.
   * Возвращает в порядке от старых к новым (asc), как ожидает UI.
   */
  async list(
    ctx: MessageContext,
    viewerId: string,
    opts: { before?: string; after?: string; limit: number },
  ): Promise<{ messages: PublicMessage[]; hasMore: boolean }> {
    let cursor: { createdAt: Date; id: string } | null = null;
    if (opts.before) {
      const [c] = await this.db
        .select({ createdAt: messages.createdAt, id: messages.id })
        .from(messages)
        .where(eq(messages.id, opts.before))
        .limit(1);
      cursor = c ?? null;
    } else if (opts.after) {
      const [c] = await this.db
        .select({ createdAt: messages.createdAt, id: messages.id })
        .from(messages)
        .where(eq(messages.id, opts.after))
        .limit(1);
      cursor = c ?? null;
    }

    const limitPlus = opts.limit + 1; // +1 чтобы определить hasMore без второго запроса

    const conditions = [eq(messages.channelId, ctx.channel.id)];
    if (opts.before && cursor) conditions.push(lt(messages.createdAt, cursor.createdAt));
    if (opts.after && cursor) conditions.push(gt(messages.createdAt, cursor.createdAt));

    const rows = await this.db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(limitPlus);

    const hasMore = rows.length > opts.limit;
    const slice = hasMore ? rows.slice(0, opts.limit) : rows;
    // Возвращаем в порядке asc (старые вверху, новые внизу).
    slice.reverse();

    const hydrated = await this.hydrateMessages(this.db, slice, viewerId);
    return { messages: hydrated, hasMore };
  }

  /**
   * «Гидратация» — догружает author, attachments, reactions, mentions для списка messages
   * единым набором запросов, возвращает PublicMessage[].
   *
   * `runner` — root DbClient или транзакция (поверх transaction-callback). Публичный
   * select/from-API совпадает; при необходимости вызовы внутри транзакции прокидывают
   * tx через `as unknown as DbClient`.
   */
  private async hydrateMessages(
    runner: DbClient,
    rows: Message[],
    viewerId: string,
  ): Promise<PublicMessage[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const authorIds = new Set(rows.map((r) => r.authorId));
    const replyToIds = Array.from(
      new Set(rows.map((r) => r.replyToMessageId).filter((v): v is string => !!v)),
    );

    // Reply-родители: нужны строки messages + их authors. Author-id'ы дополним
    // в общий запрос `users`, чтобы не делать ещё один round-trip.
    const replyRowsP =
      replyToIds.length > 0
        ? runner.select().from(messages).where(inArray(messages.id, replyToIds))
        : Promise.resolve([] as Message[]);
    const replyRows = await replyRowsP;
    for (const r of replyRows) authorIds.add(r.authorId);

    const [authorRows, attRows, rxRows, mentionRows] = await Promise.all([
      runner
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .where(inArray(users.id, Array.from(authorIds))),
      runner
        .select()
        .from(attachments)
        .where(inArray(attachments.messageId, ids))
        .orderBy(asc(attachments.createdAt)),
      runner
        .select()
        .from(reactions)
        .where(inArray(reactions.messageId, ids)),
      runner
        .select()
        .from(mentions)
        .where(inArray(mentions.messageId, ids)),
    ]);

    const authorMap = new Map<string, PublicMessageAuthor>(
      authorRows.map((a) => [a.id, a]),
    );

    const attachmentsByMsg = new Map<string, PublicAttachment[]>();
    for (const a of attRows) {
      // Все attachments в этой выборке привязаны к одному из ids — messageId не null.
      if (a.messageId === null) continue;
      const arr = attachmentsByMsg.get(a.messageId) ?? [];
      arr.push({
        id: a.id,
        messageId: a.messageId,
        filename: a.filename,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        width: a.width,
        height: a.height,
        url: `/attachments/${a.id}`,
      });
      attachmentsByMsg.set(a.messageId, arr);
    }

    const reactionsByMsg = new Map<string, Map<string, PublicReaction>>();
    for (const rx of rxRows) {
      const byEmoji = reactionsByMsg.get(rx.messageId) ?? new Map<string, PublicReaction>();
      const existing = byEmoji.get(rx.emoji) ?? {
        emoji: rx.emoji,
        count: 0,
        reactedByMe: false,
        userIds: [],
      };
      existing.count += 1;
      existing.userIds.push(rx.userId);
      if (rx.userId === viewerId) existing.reactedByMe = true;
      byEmoji.set(rx.emoji, existing);
      reactionsByMsg.set(rx.messageId, byEmoji);
    }

    const mentionsByMsg = new Map<string, string[]>();
    for (const m of mentionRows) {
      const arr = mentionsByMsg.get(m.messageId) ?? [];
      arr.push(m.mentionedUserId);
      mentionsByMsg.set(m.messageId, arr);
    }

    // Карта preview родительских сообщений по их id.
    const replyPreviewById = new Map<string, PublicMessagePreview>();
    for (const r of replyRows) {
      const author = authorMap.get(r.authorId);
      if (!author) continue;
      replyPreviewById.set(r.id, {
        id: r.id,
        author,
        contentPreview: makePreview(r.content),
        deleted: false,
      });
    }

    return rows.map((row) => {
      const author = authorMap.get(row.authorId);
      if (!author) throw new Error(`author_not_found:${row.authorId}`);
      const reactionsForMsg = Array.from(reactionsByMsg.get(row.id)?.values() ?? []).sort(
        (a, b) => a.emoji.localeCompare(b.emoji),
      );
      // Если row.replyToMessageId есть, но строка-родитель не нашлась — это
      // удалённый message (FK SET NULL не задействован — реальный delete
      // оставляет id ссылающимся на null-строку).
      let replyToPreview: PublicMessagePreview | null = null;
      if (row.replyToMessageId) {
        replyToPreview =
          replyPreviewById.get(row.replyToMessageId) ?? {
            id: row.replyToMessageId,
            author: { id: '', username: '', displayName: '', avatarUrl: null },
            contentPreview: '',
            deleted: true,
          };
      }
      return {
        id: row.id,
        channelId: row.channelId,
        author,
        content: row.content,
        replyToMessageId: row.replyToMessageId,
        replyToPreview,
        mentionedUserIds: mentionsByMsg.get(row.id) ?? [],
        attachments: attachmentsByMsg.get(row.id) ?? [],
        reactions: reactionsForMsg,
        editedAt: row.editedAt ? row.editedAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }
}

const REPLY_PREVIEW_LIMIT = 80;
function makePreview(content: string): string {
  // Сворачиваем `<@uuid>` в `@…` чтобы UUID не торчали в превью; берём первую
  // строку и обрезаем по REPLY_PREVIEW_LIMIT с многоточием.
  const cleaned = content.replace(/<@[0-9a-f-]{36}>/gi, '@…').replace(/\n+/g, ' ').trim();
  if (cleaned.length <= REPLY_PREVIEW_LIMIT) return cleaned;
  return cleaned.slice(0, REPLY_PREVIEW_LIMIT - 1) + '…';
}

function extractMentionedUserIds(content: string): string[] {
  const out = new Set<string>();
  for (const match of content.matchAll(MENTION_RE)) {
    out.add(match[1]!);
  }
  return Array.from(out);
}

