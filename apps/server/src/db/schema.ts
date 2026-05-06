import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
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

/**
 * 1:1 личные сообщения (DM). user_a_id < user_b_id канонически чтобы пара
 * была уникальной — UNIQUE-индекс на (user_a, user_b) гарантирует один
 * DM-канал на пару пользователей.
 */
export const dmChannels = pgTable(
  'dm_channels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userAId: uuid('user_a_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userBId: uuid('user_b_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('dm_channels_pair_key').on(t.userAId, t.userBId),
    index('dm_channels_user_a_idx').on(t.userAId),
    index('dm_channels_user_b_idx').on(t.userBId),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * Канал-гилды. NULL когда сообщение — DM (тогда `dmChannelId` непустой).
     * Ровно одно из (channelId, dmChannelId) должно быть заполнено —
     * проверяется CHECK-constraint'ом в миграции.
     */
    channelId: uuid('channel_id').references(() => channels.id, {
      onDelete: 'cascade',
    }),
    /** DM-канал. NULL для гилд-сообщений. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- forward-ref на dmChannels
    dmChannelId: uuid('dm_channel_id').references((): any => dmChannels.id, {
      onDelete: 'cascade',
    }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    content: text('content').notNull(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- self-ref на messages
    replyToMessageId: uuid('reply_to_message_id').references((): any => messages.id, {
      onDelete: 'set null',
    }),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('messages_channel_created_idx').on(t.channelId, t.createdAt.desc()),
    index('messages_dm_channel_created_idx').on(t.dmChannelId, t.createdAt.desc()),
    index('messages_author_idx').on(t.authorId),
  ],
);

export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * NULL пока attachment не привязан к сообщению (между POST /attachments
     * и POST /messages). После привязки — id сообщения, и при удалении
     * сообщения attachment чистится cascade'ом.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- forward-ref на messages
    messageId: uuid('message_id').references((): any => messages.id, { onDelete: 'cascade' }),
    /** Кто залил файл — нужен чтобы нельзя было «угнать» чужой uploaded attachment. */
    uploaderId: uuid('uploader_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    storagePath: text('storage_path').notNull(),
    width: integer('width'),
    height: integer('height'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('attachments_message_idx').on(t.messageId),
    index('attachments_uploader_pending_idx').on(t.uploaderId, t.createdAt),
  ],
);

export const reactions = pgTable(
  'reactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('reactions_message_user_emoji_key').on(t.messageId, t.userId, t.emoji),
    index('reactions_message_idx').on(t.messageId),
  ],
);

export const mentions = pgTable(
  'mentions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    mentionedUserId: uuid('mentioned_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('mentions_message_user_key').on(t.messageId, t.mentionedUserId),
    index('mentions_user_idx').on(t.mentionedUserId),
  ],
);

export const readStates = pgTable(
  'read_states',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    lastReadMessageId: uuid('last_read_message_id').references(() => messages.id, {
      onDelete: 'set null',
    }),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.channelId] })],
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

export const channelsRelations = relations(channels, ({ one, many }) => ({
  guild: one(guilds, { fields: [channels.guildId], references: [guilds.id] }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  channel: one(channels, { fields: [messages.channelId], references: [channels.id] }),
  dmChannel: one(dmChannels, {
    fields: [messages.dmChannelId],
    references: [dmChannels.id],
  }),
  author: one(users, { fields: [messages.authorId], references: [users.id] }),
  replyTo: one(messages, {
    fields: [messages.replyToMessageId],
    references: [messages.id],
    relationName: 'replyTo',
  }),
  attachments: many(attachments),
  reactions: many(reactions),
  mentions: many(mentions),
}));

export const dmChannelsRelations = relations(dmChannels, ({ one, many }) => ({
  userA: one(users, { fields: [dmChannels.userAId], references: [users.id] }),
  userB: one(users, { fields: [dmChannels.userBId], references: [users.id] }),
  messages: many(messages),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  message: one(messages, { fields: [attachments.messageId], references: [messages.id] }),
}));

export const reactionsRelations = relations(reactions, ({ one }) => ({
  message: one(messages, { fields: [reactions.messageId], references: [messages.id] }),
  user: one(users, { fields: [reactions.userId], references: [users.id] }),
}));

export const mentionsRelations = relations(mentions, ({ one }) => ({
  message: one(messages, { fields: [mentions.messageId], references: [messages.id] }),
  user: one(users, { fields: [mentions.mentionedUserId], references: [users.id] }),
}));

export const readStatesRelations = relations(readStates, ({ one }) => ({
  user: one(users, { fields: [readStates.userId], references: [users.id] }),
  channel: one(channels, { fields: [readStates.channelId], references: [channels.id] }),
  lastMessage: one(messages, {
    fields: [readStates.lastReadMessageId],
    references: [messages.id],
  }),
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
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Attachment = typeof attachments.$inferSelect;
export type Reaction = typeof reactions.$inferSelect;
export type Mention = typeof mentions.$inferSelect;
export type ReadState = typeof readStates.$inferSelect;
