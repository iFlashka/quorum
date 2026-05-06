import { relations, sql } from 'drizzle-orm';
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const memberRoleEnum = pgEnum('member_role', ['owner', 'admin', 'member']);
export const channelKindEnum = pgEnum('channel_kind', ['text', 'voice']);
export const userStatusEnum = pgEnum('user_status', ['online', 'idle', 'dnd', 'offline']);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: text('username').notNull(),
    email: text('email'),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name').notNull(),
    avatarUrl: text('avatar_url'),
    status: userStatusEnum('status').notNull().default('offline'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('users_username_key').on(sql`lower(${t.username})`),
    uniqueIndex('users_email_key').on(sql`lower(${t.email})`),
  ],
);

export const guilds = pgTable('guilds', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  iconUrl: text('icon_url'),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const members = pgTable(
  'members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: uuid('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: memberRoleEnum('role').notNull().default('member'),
    nickname: text('nickname'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('members_guild_user_key').on(t.guildId, t.userId),
    index('members_user_idx').on(t.userId),
  ],
);

export const channels = pgTable(
  'channels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: uuid('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    kind: channelKindEnum('kind').notNull(),
    name: text('name').notNull(),
    topic: text('topic'),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('channels_guild_name_key').on(t.guildId, t.name)],
);

export const invites = pgTable(
  'invites',
  {
    code: text('code').primaryKey(),
    guildId: uuid('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    maxUses: integer('max_uses'),
    uses: integer('uses').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('invites_guild_idx').on(t.guildId)],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('refresh_tokens_hash_key').on(t.tokenHash),
    index('refresh_tokens_user_idx').on(t.userId, t.expiresAt),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  members: many(members),
  refreshTokens: many(refreshTokens),
}));

export const guildsRelations = relations(guilds, ({ one, many }) => ({
  owner: one(users, { fields: [guilds.ownerId], references: [users.id] }),
  members: many(members),
  channels: many(channels),
  invites: many(invites),
}));

export const membersRelations = relations(members, ({ one }) => ({
  guild: one(guilds, { fields: [members.guildId], references: [guilds.id] }),
  user: one(users, { fields: [members.userId], references: [users.id] }),
}));

export const channelsRelations = relations(channels, ({ one }) => ({
  guild: one(guilds, { fields: [channels.guildId], references: [guilds.id] }),
}));

export const invitesRelations = relations(invites, ({ one }) => ({
  guild: one(guilds, { fields: [invites.guildId], references: [guilds.id] }),
  createdByUser: one(users, { fields: [invites.createdBy], references: [users.id] }),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Guild = typeof guilds.$inferSelect;
export type Member = typeof members.$inferSelect;
export type Channel = typeof channels.$inferSelect;
export type Invite = typeof invites.$inferSelect;
export type RefreshToken = typeof refreshTokens.$inferSelect;
