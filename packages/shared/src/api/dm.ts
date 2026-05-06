import { z } from 'zod';
import {
  PublicDmChannelListEntrySchema,
  PublicDmChannelSchema,
  PublicDmMessageSchema,
} from '../domain/dm.js';
import { SendMessageRequestSchema } from './messages.js';

/** GET /dm */
export const ListDmChannelsResponseSchema = z.object({
  channels: z.array(PublicDmChannelListEntrySchema),
});
export type ListDmChannelsResponse = z.infer<typeof ListDmChannelsResponseSchema>;

/** POST /dm/with/:userId — body пустой, response с created/existing channel. */
export const OpenDmChannelResponseSchema = z.object({
  channel: PublicDmChannelSchema,
});
export type OpenDmChannelResponse = z.infer<typeof OpenDmChannelResponseSchema>;

/** GET /dm/:id/messages */
export const ListDmMessagesResponseSchema = z.object({
  messages: z.array(PublicDmMessageSchema),
  hasMore: z.boolean(),
});
export type ListDmMessagesResponse = z.infer<typeof ListDmMessagesResponseSchema>;

/** POST /dm/:id/messages — request совпадает с channel-сообщением. */
export const SendDmMessageRequestSchema = SendMessageRequestSchema;
export type SendDmMessageRequest = z.infer<typeof SendDmMessageRequestSchema>;

export const SendDmMessageResponseSchema = z.object({
  message: PublicDmMessageSchema,
});
export type SendDmMessageResponse = z.infer<typeof SendDmMessageResponseSchema>;

export const EditDmMessageRequestSchema = z.object({
  content: z.string().min(1).max(4000),
});
export type EditDmMessageRequest = z.infer<typeof EditDmMessageRequestSchema>;

export const EditDmMessageResponseSchema = SendDmMessageResponseSchema;
export type EditDmMessageResponse = z.infer<typeof EditDmMessageResponseSchema>;
