import { z } from 'zod';

export const PublicAttachmentSchema = z.object({
  id: z.string().uuid(),
  messageId: z.string().uuid(),
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  /** Относительный URL для скачивания (например `/attachments/{id}`). */
  url: z.string(),
});
export type PublicAttachment = z.infer<typeof PublicAttachmentSchema>;

export const PublicReactionSchema = z.object({
  emoji: z.string(),
  count: z.number().int().nonnegative(),
  /** Поставил ли реакцию текущий пользователь. */
  reactedByMe: z.boolean(),
  /** Список user-id, которые поставили эмодзи. Может урезаться в больших чатах. */
  userIds: z.array(z.string().uuid()),
});
export type PublicReaction = z.infer<typeof PublicReactionSchema>;

export const PublicMessageAuthorSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().url().nullable(),
});
export type PublicMessageAuthor = z.infer<typeof PublicMessageAuthorSchema>;

/**
 * Прелоад родительского сообщения для рендера reply-context.
 * Сервер заполняет при выдаче message с replyToMessageId — иначе клиент
 * делал бы N запросов на reply-цепочки.
 */
export const PublicMessagePreviewSchema = z.object({
  id: z.string().uuid(),
  author: PublicMessageAuthorSchema,
  /** Первая строка/обрезанная версия content. Markdown не рендерится. */
  contentPreview: z.string(),
  /** True если оригинал удалён — UI рендерит «Сообщение удалено». */
  deleted: z.boolean(),
});
export type PublicMessagePreview = z.infer<typeof PublicMessagePreviewSchema>;

export const PublicMessageSchema = z.object({
  id: z.string().uuid(),
  channelId: z.string().uuid(),
  author: PublicMessageAuthorSchema,
  content: z.string(),
  replyToMessageId: z.string().uuid().nullable(),
  /** Прелоад родительского сообщения (если есть replyToMessageId). */
  replyToPreview: PublicMessagePreviewSchema.nullable(),
  /** Прелоад для замьюшенных пользователей — клиент рендерит из этого, не делает доп. запросы. */
  mentionedUserIds: z.array(z.string().uuid()),
  attachments: z.array(PublicAttachmentSchema),
  reactions: z.array(PublicReactionSchema),
  editedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type PublicMessage = z.infer<typeof PublicMessageSchema>;
