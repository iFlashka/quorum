import { z } from 'zod';
import { PublicChannelSchema, PublicMemberSchema } from '../domain/channel.js';
import { PublicGuildSchema } from '../domain/user.js';

export const ListGuildsResponseSchema = z.object({
  guilds: z.array(PublicGuildSchema),
});
export type ListGuildsResponse = z.infer<typeof ListGuildsResponseSchema>;

export const ListChannelsResponseSchema = z.object({
  channels: z.array(PublicChannelSchema),
});
export type ListChannelsResponse = z.infer<typeof ListChannelsResponseSchema>;

export const ListMembersResponseSchema = z.object({
  members: z.array(PublicMemberSchema),
});
export type ListMembersResponse = z.infer<typeof ListMembersResponseSchema>;
