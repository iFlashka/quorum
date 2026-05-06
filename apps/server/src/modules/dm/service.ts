/**
 * DmChannelsService — управление личными каналами 1:1 и сообщениями в них.
 *
 * Канон пары: `userAId < userBId` (строковое UUID-сравнение).
 * Один канал на пару — UNIQUE-индекс гарантирует.
 *
 * Сообщения хранятся в той же таблице `messages`, но с `dm_channel_id`
 * вместо `channel_id`. Hydrate-логика дублирует MessagesService — было
 * соблазнительно вынести общий helper, но текущие два метода компактны
 * и инлайн-версия проще для последующих изменений.
 */

import { and, asc, desc, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import type { DbClient } from '../../db/client.js';
import {
  attachments,
  dmChannels,
  mentions,
  messages,
  reactions,
  users,
} from '../../db/schema.js';
import type {
  PublicAttachment,
  PublicDmChannel,
  PublicDmMessage,
  PublicMessageAuthor,
  PublicMessagePreview,
  PublicReaction,
  SendMessageRequest,
} from '@quorum/shared';
import { AuthError } from '../auth/errors.js';

const MENTION_RE = /<@([0-9a-fA-F-]{36})>/g;

interface DmListEntry extends PublicDmChannel {
  /** id последнего сообщения для preview/sort. */
  lastMessageId: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
}

export class DmChannelsService {
  constructor(private readonly db: DbClient) {}

  /** Канонический порядок пары. */
  private orderPair(a: string, b: string): { lo: string; hi: string } {
    return a < b ? { lo: a, hi: b } : { lo: b, hi: a };
  }

  /** Получить или создать DM-канал между двумя пользователями. */
  async getOrCreate(meId: string, peerId: string): Promise<PublicDmChannel> {
    if (meId === peerId) throw new Error('cannot_dm_self');
    const { lo, hi } = this.orderPair(meId, peerId);

    // Проверим что оба users существуют.
    const userRows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.id, [lo, hi]));
    if (userRows.length !== 2) throw new AuthError('not_found');

    const existing = await this.db
      .select()
      .from(dmChannels)
      .where(and(eq(dmChannels.userAId, lo), eq(dmChannels.userBId, hi)))
      .limit(1);
    if (existing.length > 0) {
      const row = existing[0]!;
      return {
        id: row.id,
        userAId: row.userAId,
        userBId: row.userBId,
        createdAt: row.createdAt.toISOString(),
      };
    }

    const [created] = await this.db
      .insert(dmChannels)
      .values({ userAId: lo, userBId: hi })
      .returning();
    if (!created) throw new Error('failed_to_create_dm');
    return {
      id: created.id,
      userAId: created.userAId,
      userBId: created.userBId,
      createdAt: created.createdAt.toISOString(),
    };
  }

  /**
   * Список DM-каналов пользователя — все где он user_a или user_b.
   * Возвращает сразу с last-message preview для рендера sidebar.
   */
  async list(meId: string): Promise<DmListEntry[]> {
    const rows = await this.db
      .select()
      .from(dmChannels)
      .where(or(eq(dmChannels.userAId, meId), eq(dmChannels.userBId, meId)));

    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    // Subquery бы ускорил, но для 5–10 friends-DM достаточно отдельного запроса.
    const lastMessages = await this.db
      .select({
        dmChannelId: messages.dmChannelId,
        id: messages.id,
        content: messages.content,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(inArray(messages.dmChannelId, ids))
      .orderBy(desc(messages.createdAt));

    const lastByDm = new Map<string, { id: string; createdAt: Date; content: string }>();
    for (const m of lastMessages) {
      if (!m.dmChannelId) continue;
      if (lastByDm.has(m.dmChannelId)) continue;
      lastByDm.set(m.dmChannelId, {
        id: m.id,
        createdAt: m.createdAt,
        content: m.content,
      });
    }

    const result: DmListEntry[] = rows.map((r) => {
      const last = lastByDm.get(r.id);
      return {
        id: r.id,
        userAId: r.userAId,
        userBId: r.userBId,
        createdAt: r.createdAt.toISOString(),
        lastMessageId: last?.id ?? null,
        lastMessageAt: last ? last.createdAt.toISOString() : null,
        lastMessagePreview: last ? makePreview(last.content) : null,
      };
    });

    // Сортируем по last-message-time desc, потом по createdAt.
    result.sort((a, b) => {
      const at = a.lastMessageAt ?? a.createdAt;
      const bt = b.lastMessageAt ?? b.createdAt;
      return bt.localeCompare(at);
    });
    return result;
  }

  /** True если пользователь — участник DM-канала. */
  async assertParticipant(meId: string, dmChannelId: string): Promise<boolean> {
    const [row] = await this.db
      .select()
      .from(dmChannels)
      .where(eq(dmChannels.id, dmChannelId))
      .limit(1);
    if (!row) return false;
    return row.userAId === meId || row.userBId === meId;
  }

  // ---- Messages ----

  async sendMessage(
    meId: string,
    dmChannelId: string,
    req: SendMessageRequest,
  ): Promise<PublicDmMessage> {
    const ok = await this.assertParticipant(meId, dmChannelId);
    if (!ok) throw new AuthError('forbidden');

    return this.db.transaction(async (tx) => {
      // replyTo должен быть в этом же DM-канале.
      if (req.replyToMessageId) {
        const [parent] = await (tx as unknown as DbClient)
          .select()
          .from(messages)
          .where(eq(messages.id, req.replyToMessageId))
          .limit(1);
        if (parent?.dmChannelId !== dmChannelId) {
          throw new AuthError('forbidden');
        }
      }

      const [row] = await (tx as unknown as DbClient)
        .insert(messages)
        .values({
          dmChannelId,
          authorId: meId,
          kind: 'text',
          content: req.content,
          replyToMessageId: req.replyToMessageId ?? null,
        })
        .returning();
      if (!row) throw new Error('failed_to_insert_dm_message');

      // Привязываем attachments если есть.
      if (req.attachmentIds && req.attachmentIds.length > 0) {
        await (tx as unknown as DbClient)
          .update(attachments)
          .set({ messageId: row.id })
          .where(
            and(
              inArray(attachments.id, req.attachmentIds),
              eq(attachments.uploaderId, meId),
              isNull(attachments.messageId),
            ),
          );
      }

      // mentions
      const mentioned = extractMentionedUserIds(req.content);
      if (mentioned.length > 0) {
        await (tx as unknown as DbClient)
          .insert(mentions)
          .values(mentioned.map((uid) => ({ messageId: row.id, mentionedUserId: uid })));
      }

      const hydrated = await this.hydrate(tx as unknown as DbClient, [row], meId);
      return hydrated[0]!;
    });
  }

  async listMessages(
    meId: string,
    dmChannelId: string,
    args: { limit: number; before?: string },
  ): Promise<{ messages: PublicDmMessage[]; hasMore: boolean }> {
    const ok = await this.assertParticipant(meId, dmChannelId);
    if (!ok) throw new AuthError('forbidden');

    const limit = Math.min(Math.max(args.limit, 1), 100);
    const conditions = [eq(messages.dmChannelId, dmChannelId)];

    if (args.before) {
      const [pivot] = await this.db
        .select({ createdAt: messages.createdAt })
        .from(messages)
        .where(eq(messages.id, args.before))
        .limit(1);
      if (pivot) conditions.push(lt(messages.createdAt, pivot.createdAt));
    }

    const rows = await this.db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const trimmed = hasMore ? rows.slice(0, limit) : rows;
    // Возвращаем в хронологическом порядке (oldest first).
    const ordered = trimmed.reverse();
    const hydrated = await this.hydrate(this.db, ordered, meId);
    return { messages: hydrated, hasMore };
  }

  async editMessage(
    meId: string,
    dmChannelId: string,
    messageId: string,
    content: string,
  ): Promise<PublicDmMessage> {
    const [row] = await this.db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);
    if (row?.dmChannelId !== dmChannelId) throw new AuthError('not_found');
    if (row.authorId !== meId) throw new AuthError('forbidden');

    const [updated] = await this.db
      .update(messages)
      .set({ content, editedAt: new Date() })
      .where(eq(messages.id, messageId))
      .returning();
    if (!updated) throw new Error('failed_to_update_dm_message');

    const hydrated = await this.hydrate(this.db, [updated], meId);
    return hydrated[0]!;
  }

  async deleteMessage(meId: string, dmChannelId: string, messageId: string): Promise<void> {
    const [row] = await this.db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);
    if (row?.dmChannelId !== dmChannelId) throw new AuthError('not_found');
    if (row.authorId !== meId) throw new AuthError('forbidden');
    await this.db.delete(messages).where(eq(messages.id, messageId));
  }

  /** Получить sender'ам список идентификаторов получателей DM-события. */
  async recipients(dmChannelId: string): Promise<string[]> {
    const [row] = await this.db
      .select()
      .from(dmChannels)
      .where(eq(dmChannels.id, dmChannelId))
      .limit(1);
    if (!row) return [];
    return [row.userAId, row.userBId];
  }

  // ---- internals ----

  private async hydrate(
    runner: DbClient,
    rows: typeof messages.$inferSelect[],
    viewerId: string,
  ): Promise<PublicDmMessage[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const authorIds = new Set(rows.map((r) => r.authorId));
    const replyToIds = Array.from(
      new Set(rows.map((r) => r.replyToMessageId).filter((v): v is string => !!v)),
    );

    const replyRows =
      replyToIds.length > 0
        ? await runner.select().from(messages).where(inArray(messages.id, replyToIds))
        : [];
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
      runner.select().from(reactions).where(inArray(reactions.messageId, ids)),
      runner.select().from(mentions).where(inArray(mentions.messageId, ids)),
    ]);

    const authorMap = new Map<string, PublicMessageAuthor>(
      authorRows.map((a) => [a.id, a]),
    );

    const attachmentsByMsg = new Map<string, PublicAttachment[]>();
    for (const a of attRows) {
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
      if (!row.dmChannelId) {
        throw new Error(`hydrateDm_received_channel_row:${row.id}`);
      }
      const kind =
        row.kind === 'call_started' || row.kind === 'call_ended' ? row.kind : 'text';
      return {
        id: row.id,
        dmChannelId: row.dmChannelId,
        kind,
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

  /**
   * System-сообщение от имени `authorId` в DM-канал между ним и `peerId`.
   * Создаёт DM-канал если не было. Используется CallsService для пометок
   * call_started/call_ended.
   */
  async insertSystemMessage(
    authorId: string,
    peerId: string,
    kind: 'call_started' | 'call_ended',
    content: string,
  ): Promise<PublicDmMessage> {
    const channel = await this.getOrCreate(authorId, peerId);
    const [row] = await this.db
      .insert(messages)
      .values({
        dmChannelId: channel.id,
        authorId,
        kind,
        content,
      })
      .returning();
    if (!row) throw new Error('failed_to_insert_system_message');
    const hydrated = await this.hydrate(this.db, [row], authorId);
    return hydrated[0]!;
  }
}

function extractMentionedUserIds(content: string): string[] {
  const out = new Set<string>();
  for (const match of content.matchAll(MENTION_RE)) {
    out.add(match[1]!);
  }
  return Array.from(out);
}

const REPLY_PREVIEW_LIMIT = 80;
function makePreview(content: string): string {
  const cleaned = content.replace(/<@[0-9a-f-]{36}>/gi, '@…').replace(/\n+/g, ' ').trim();
  if (cleaned.length <= REPLY_PREVIEW_LIMIT) return cleaned;
  return cleaned.slice(0, REPLY_PREVIEW_LIMIT - 1) + '…';
}

