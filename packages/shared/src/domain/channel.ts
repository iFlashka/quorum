import { z } from 'zod';
import { ChannelKindSchema } from './user.js';

export const PublicChannelSchema = z.object({
  id: z.string().uuid(),
  guildId: z.string().uuid(),
  kind: ChannelKindSchema,
  name: z.string(),
  topic: z.string().nullable(),
  position: z.number().int(),
});
export type PublicChannel = z.infer<typeof PublicChannelSchema>;

export const PublicMemberSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  guildId: z.string().uuid(),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().url().nullable(),
  role: z.enum(['owner', 'admin', 'member']),
  nickname: z.string().nullable(),
  status: z.enum(['online', 'idle', 'dnd', 'offline']),
  joinedAt: z.string().datetime(),
});
export type PublicMember = z.infer<typeof PublicMemberSchema>;
