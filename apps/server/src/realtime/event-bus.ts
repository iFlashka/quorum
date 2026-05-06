import type { ServerEvent } from '@quorum/shared';

/**
 * EventBus — in-memory брокер событий между REST-роутами и WebSocket-коннекциями.
 *
 * Сейчас один процесс — всё в памяти. Если будем горизонтально масштабировать:
 *   1. Под каждой нодой свой EventBus
 *   2. Cross-node bridge через Redis pub/sub (каждая нода subscribe на канал
 *      `events:guild:{id}`, при `publishToGuild` → publish в redis +
 *      локальный broadcast на свои сокеты)
 *
 * Для 5–10 друзей не понадобится — один процесс.
 */

type Listener = (event: ServerEvent) => void;

export class EventBus {
  /** guildId → set listeners (по одному на каждое открытое WS-соединение). */
  private readonly byGuild = new Map<string, Set<Listener>>();
  /** userId → set listeners (для личных событий — например, replays при auth). */
  private readonly byUser = new Map<string, Set<Listener>>();

  subscribeGuild(guildId: string, listener: Listener): () => void {
    let set = this.byGuild.get(guildId);
    if (!set) {
      set = new Set();
      this.byGuild.set(guildId, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.byGuild.delete(guildId);
    };
  }

  subscribeUser(userId: string, listener: Listener): () => void {
    let set = this.byUser.get(userId);
    if (!set) {
      set = new Set();
      this.byUser.set(userId, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.byUser.delete(userId);
    };
  }

  publishToGuild(guildId: string, event: ServerEvent): void {
    const set = this.byGuild.get(guildId);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(event);
      } catch (err) {
        // Один слушатель не должен ломать остальных. Лог опускаем — пускай
        // Fastify-плагин WS сам логирует ошибки своих сокетов.
        void err;
      }
    }
  }

  publishToUser(userId: string, event: ServerEvent): void {
    const set = this.byUser.get(userId);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(event);
      } catch (err) {
        void err;
      }
    }
  }
}
