import { z } from 'zod';
import {
  PublicAttachmentSchema,
  PublicMessageAuthorSchema,
  PublicMessagePreviewSchema,
  PublicReactionSchema,
} from './message.js';

/**
 * DM-канал (личные сообщения 1:1). user_a/user_b приведены к каноническому
 * порядку (a < b) — потому что одна пара = один канал.
 */
export const PublicDmChannelSchema = z.object({
  id: z.string().uuid(),
  userAId: z.string().uuid(),
  userBId: z.string().uuid(),
  createdAt: z.string().datetime(),
});
export type PublicDmChannel = z.infer<typeof PublicDmChannelSchema>;

/**
 * DM-канал в `GET /dm` списке — расширенный с last-message preview для
 * рендера sidebar'а.
 */
export const PublicDmChannelListEntrySchema = PublicDmChannelSchema.extend({
  lastMessageId: z.string().uuid().nullable(),
  lastMessageAt: z.string().datetime().nullable(),
  lastMessagePreview: z.string().nullable(),
});
export type PublicDmChannelListEntry = z.infer<typeof PublicDmChannelListEntrySchema>;

/**
 * Тип сообщения. 'text' — обычное; 'call_started'/'call_ended' — системные
 * пометки от CallsService в DM-канал (1:1 звонок принят / завершён).
 */
export const DmMessageKindSchema = z.union([
  z.literal('text'),
  z.literal('call_started'),
  z.literal('call_ended'),
]);
export type DmMessageKind = z.infer<typeof DmMessageKindSchema>;

/**
 * Сообщение в DM. Структура совпадает с PublicMessage кроме того что вместо
 * channelId — dmChannelId (один из двух всегда непустой, никогда оба).
 * Дублируем форму чтобы клиент мог разводить flows по типу target'а.
 */
export const PublicDmMessageSchema = z.object({
  id: z.string().uuid(),
  dmChannelId: z.string().uuid(),
  kind: DmMessageKindSchema,
  author: PublicMessageAuthorSchema,
  content: z.string(),
  replyToMessageId: z.string().uuid().nullable(),
  replyToPreview: PublicMessagePreviewSchema.nullable(),
  mentionedUserIds: z.array(z.string().uuid()),
  attachments: z.array(PublicAttachmentSchema),
  reactions: z.array(PublicReactionSchema),
  editedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type PublicDmMessage = z.infer<typeof PublicDmMessageSchema>;
