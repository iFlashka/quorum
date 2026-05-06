/**
 * Контракт WebSocket-протокола Quorum.
 * Все события — JSON-frames в обе стороны. Дискриминатор — поле `t` (type).
 *
 * Поток подключения:
 *   1. Клиент открывает ws://server/ws
 *   2. Клиент шлёт `hello` с access-токеном
 *   3. Сервер отвечает `ready` + текущим срезом state, либо `auth_failed`
 *   4. Дальше — события в обе стороны до закрытия соединения
 *
 * Heartbeat: клиент шлёт `ping` каждые 30s; сервер отвечает `pong`.
 * Если клиент не ответил на pong 60s — сервер отключает.
 */

import { z } from 'zod';
import { PublicGuildSchema, PrivateUserSchema, UserStatusSchema } from '../domain/user.js';
import { PublicMessageSchema } from '../domain/message.js';

// ---------- Client → Server ----------

export const ClientHelloSchema = z.object({
  t: z.literal('hello'),
  access: z.string().min(20),
});

export const ClientPingSchema = z.object({
  t: z.literal('ping'),
});

export const ClientTypingStartSchema = z.object({
  t: z.literal('typing.start'),
  channelId: z.string().uuid(),
});

export const ClientTypingStopSchema = z.object({
  t: z.literal('typing.stop'),
  channelId: z.string().uuid(),
});

export const ClientPresenceSetSchema = z.object({
  t: z.literal('presence.set'),
  status: UserStatusSchema.exclude(['offline']),
});

export const ClientEventSchema = z.discriminatedUnion('t', [
  ClientHelloSchema,
  ClientPingSchema,
  ClientTypingStartSchema,
  ClientTypingStopSchema,
  ClientPresenceSetSchema,
]);
export type ClientEvent = z.infer<typeof ClientEventSchema>;

// ---------- Server → Client ----------

export const ServerReadySchema = z.object({
  t: z.literal('ready'),
  user: PrivateUserSchema,
  guilds: z.array(PublicGuildSchema),
  /** Срез presence для членов всех гилд пользователя. */
  presence: z.array(
    z.object({ userId: z.string().uuid(), status: UserStatusSchema }),
  ),
});

export const ServerAuthFailedSchema = z.object({
  t: z.literal('auth_failed'),
  reason: z.string(),
});

export const ServerPongSchema = z.object({
  t: z.literal('pong'),
});

export const ServerMessageCreateSchema = z.object({
  t: z.literal('message.create'),
  message: PublicMessageSchema,
});

export const ServerMessageUpdateSchema = z.object({
  t: z.literal('message.update'),
  message: PublicMessageSchema,
});

export const ServerMessageDeleteSchema = z.object({
  t: z.literal('message.delete'),
  channelId: z.string().uuid(),
  messageId: z.string().uuid(),
});

export const ServerReactionAddSchema = z.object({
  t: z.literal('reaction.add'),
  channelId: z.string().uuid(),
  messageId: z.string().uuid(),
  userId: z.string().uuid(),
  emoji: z.string(),
});

export const ServerReactionRemoveSchema = z.object({
  t: z.literal('reaction.remove'),
  channelId: z.string().uuid(),
  messageId: z.string().uuid(),
  userId: z.string().uuid(),
  emoji: z.string(),
});

export const ServerTypingSchema = z.object({
  t: z.literal('typing'),
  channelId: z.string().uuid(),
  userId: z.string().uuid(),
});

export const ServerPresenceUpdateSchema = z.object({
  t: z.literal('presence.update'),
  userId: z.string().uuid(),
  status: UserStatusSchema,
});

export const ServerErrorSchema = z.object({
  t: z.literal('error'),
  code: z.string(),
  message: z.string(),
});

export const ServerEventSchema = z.discriminatedUnion('t', [
  ServerReadySchema,
  ServerAuthFailedSchema,
  ServerPongSchema,
  ServerMessageCreateSchema,
  ServerMessageUpdateSchema,
  ServerMessageDeleteSchema,
  ServerReactionAddSchema,
  ServerReactionRemoveSchema,
  ServerTypingSchema,
  ServerPresenceUpdateSchema,
  ServerErrorSchema,
]);
export type ServerEvent = z.infer<typeof ServerEventSchema>;

// Тип-helper'ы для конкретных событий, чтобы не писать огромные дискриминаторы.
export type ServerReady = z.infer<typeof ServerReadySchema>;
export type ServerMessageCreate = z.infer<typeof ServerMessageCreateSchema>;
export type ServerMessageUpdate = z.infer<typeof ServerMessageUpdateSchema>;
export type ServerMessageDelete = z.infer<typeof ServerMessageDeleteSchema>;
export type ServerReactionAdd = z.infer<typeof ServerReactionAddSchema>;
export type ServerReactionRemove = z.infer<typeof ServerReactionRemoveSchema>;
export type ServerTyping = z.infer<typeof ServerTypingSchema>;
export type ServerPresenceUpdate = z.infer<typeof ServerPresenceUpdateSchema>;
