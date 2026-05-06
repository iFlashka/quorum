/**
 * Низкоуровневое хранилище presence в Redis.
 *
 * Модель:
 *   - Каждый WS-коннект юзера держит свой `sessionId` (uuid v4).
 *   - Ключ `presence:user:{userId}` = SET строк sessionId, TTL 60s.
 *   - Юзер считается online, если SET существует и непустой.
 *   - TTL продлевается heartbeat'ом раз в 30s, пока коннект живой.
 *   - На graceful disconnect SREM убирает sessionId; если SET опустел — DEL.
 *   - Если нода/процесс умер без onclose → ключ испарится через 60s сам.
 */

import type { Redis } from 'ioredis';

const KEY_TTL_SECONDS = 60;

const userKey = (userId: string): string => `presence:user:${userId}`;

export class PresenceStore {
  constructor(private readonly redis: Redis) {}

  /**
   * Регистрирует, что у юзера появилась новая сессия.
   * Возвращает `becameOnline=true` если это был его первый активный коннект
   * (нужно отправить broadcast `presence.update`).
   */
  async addSession(userId: string, sessionId: string): Promise<{ becameOnline: boolean }> {
    const key = userKey(userId);
    const pipeline = this.redis.multi();
    pipeline.scard(key);
    pipeline.sadd(key, sessionId);
    pipeline.expire(key, KEY_TTL_SECONDS);
    const results = await pipeline.exec();
    if (!results) throw new Error('redis pipeline returned null');
    const before = (results[0]?.[1] as number | null) ?? 0;
    return { becameOnline: before === 0 };
  }

  /**
   * Удаляет сессию. Возвращает `becameOffline=true` если это был последний
   * коннект юзера и теперь он offline.
   */
  async removeSession(userId: string, sessionId: string): Promise<{ becameOffline: boolean }> {
    const key = userKey(userId);
    const pipeline = this.redis.multi();
    pipeline.srem(key, sessionId);
    pipeline.scard(key);
    const results = await pipeline.exec();
    if (!results) throw new Error('redis pipeline returned null');
    const remaining = (results[1]?.[1] as number | null) ?? 0;
    if (remaining === 0) {
      // Прибираем пустой ключ, чтобы EXISTS отвечал быстро.
      await this.redis.del(key);
      return { becameOffline: true };
    }
    return { becameOffline: false };
  }

  /** Продлевает TTL на ключе. Если ключа уже нет — ничего не делает. */
  async heartbeat(userId: string): Promise<void> {
    await this.redis.expire(userKey(userId), KEY_TTL_SECONDS);
  }

  /** Возвращает подмножество online-userId из заданного списка. */
  async filterOnline(userIds: readonly string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const pipeline = this.redis.pipeline();
    for (const id of userIds) pipeline.exists(userKey(id));
    const results = await pipeline.exec();
    if (!results) throw new Error('redis pipeline returned null');

    const online = new Set<string>();
    for (let i = 0; i < userIds.length; i++) {
      const exists = results[i]?.[1] as number | null;
      if (exists === 1) online.add(userIds[i]!);
    }
    return online;
  }
}
