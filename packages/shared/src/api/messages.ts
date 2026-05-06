import { z } from 'zod';
import { PublicMessageSchema } from '../domain/message.js';

export const MAX_MESSAGE_LENGTH = 4000;

export const MessageContentSchema = z
  .string()
  .min(1, 'не может быть пустым')
  .max(MAX_MESSAGE_LENGTH, `не больше ${MAX_MESSAGE_LENGTH} символов`);

export const SendMessageRequestSchema = z.object({
  content: MessageContentSchema,
  replyToMessageId: z.string().uuid().nullable().optional(),
  /** id уже-загруженных вложений (см. POST /channels/:id/attachments). */
  attachmentIds: z.array(z.string().uuid()).max(10).optional(),
});
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;

export const EditMessageRequestSchema = z.object({
  content: MessageContentSchema,
});
export type EditMessageRequest = z.infer<typeof EditMessageRequestSchema>;

export const ListMessagesQuerySchema = z.object({
  before: z.string().uuid().optional(),
  after: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListMessagesQuery = z.infer<typeof ListMessagesQuerySchema>;

export const ListMessagesResponseSchema = z.object({
  messages: z.array(PublicMessageSchema),
  /** true если есть ещё более старые сообщения. */
  hasMore: z.boolean(),
});
export type ListMessagesResponse = z.infer<typeof ListMessagesResponseSchema>;

export const MessageResponseSchema = z.object({ message: PublicMessageSchema });
export type MessageResponse = z.infer<typeof MessageResponseSchema>;

export const MarkReadRequestSchema = z.object({
  messageId: z.string().uuid(),
});
export type MarkReadRequest = z.infer<typeof MarkReadRequestSchema>;
