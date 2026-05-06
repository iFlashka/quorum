import { z } from 'zod';

export const UserStatusSchema = z.enum(['online', 'idle', 'dnd', 'offline']);
export type UserStatus = z.infer<typeof UserStatusSchema>;

export const MemberRoleSchema = z.enum(['owner', 'admin', 'member']);
export type MemberRole = z.infer<typeof MemberRoleSchema>;

export const ChannelKindSchema = z.enum(['text', 'voice']);
export type ChannelKind = z.infer<typeof ChannelKindSchema>;

export const PublicUserSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().url().nullable(),
  status: UserStatusSchema,
});
export type PublicUser = z.infer<typeof PublicUserSchema>;

export const PrivateUserSchema = PublicUserSchema.extend({
  email: z.string().email().nullable(),
});
export type PrivateUser = z.infer<typeof PrivateUserSchema>;

export const PublicGuildSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  iconUrl: z.string().url().nullable(),
  memberRole: MemberRoleSchema,
});
export type PublicGuild = z.infer<typeof PublicGuildSchema>;
