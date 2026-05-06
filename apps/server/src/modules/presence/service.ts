/**
 * Сервис presence: связывает store + pubsub + EventBus + db-членство.
 *
 * Жизненный цикл WS-сессии:
 *   1. WS hello прошёл → service.connect(userId, sessionId)
 *      - SADD сессии, EXPIRE 60s
 *      - если был оффлайн до этого — publish('online') в Redis
 *   2. Каждые 30s сервер дёргает service.heartbeat(userId)
 *   3. WS close → service.disconnect(userId, sessionId)
 *      - SREM сессии; если набор опустел — publish('offline')
 *
 * Cross-node fan-out:
 *   - service подписывается на Redis Pub/Sub-канал presence:events
 *   - каждое событие → resolveGuildIds(userId) → eventBus.publishToGuild(guildId, presence.update)
 *   - в результате все WS-коннекты получают presence.update только если у них
 *     с этим юзером есть общая гилда.
 */

import { eq, inArray } from 'drizzle-orm';
import type { UserStatus } from '@quorum/shared';
import type { DbClient } from '../../db/client.js';
import { members } from '../../db/schema.js';
import type { EventBus } from '../../realtime/event-bus.js';
import type { PresenceStore } from './store.js';
import type { PresencePubsub } from './pubsub.js';

interface PresenceServiceDeps {
  db: DbClient;
  store: PresenceStore;
  pubsub: PresencePubsub;
  events: EventBus;
}

export class PresenceService {
  private readonly db: DbClient;
  private readonly store: PresenceStore;
  private readonly pubsub: PresencePubsub;
  private readonly events: EventBus;
  private offEvent: (() => void) | null = null;

  constructor(deps: PresenceServiceDeps) {
    this.db = deps.db;
    this.store = deps.store;
    this.pubsub = deps.pubsub;
    this.events = deps.events;
  }

  async start(): Promise<void> {
    await this.pubsub.start();
    this.offEvent = this.pubsub.on((event) => {
      void this.fanOutToGuilds(event.userId, event.status);
    });
  }

  async stop(): Promise<void> {
    if (this.offEvent) {
      this.offEvent();
      this.offEvent = null;
    }
    await this.pubsub.stop();
  }

  async connect(userId: string, sessionId: string): Promise<void> {
    const { becameOnline } = await this.store.addSession(userId, sessionId);
    if (becameOnline) {
      await this.pubsub.publish(userId, 'online');
    }
  }

  async disconnect(userId: string, sessionId: string): Promise<void> {
    const { becameOffline } = await this.store.removeSession(userId, sessionId);
    if (becameOffline) {
      await this.pubsub.publish(userId, 'offline');
    }
  }

  async heartbeat(userId: string): Promise<void> {
    await this.store.heartbeat(userId);
  }

  /**
   * Срез presence для всех members гилд, в которых состоит юзер. Используется
   * чтобы наполнить поле `presence` в `ready`-событии при WS-подключении.
   */
  async getInitialPresenceFor(
    userId: string,
  ): Promise<{ userId: string; status: UserStatus }[]> {
    const guildIds = await this.guildsOf(userId);
    if (guildIds.length === 0) return [];

    const memberRows = await this.db
      .select({ userId: members.userId })
      .from(members)
      .where(inArray(members.guildId, guildIds));

    const distinctUserIds = Array.from(new Set(memberRows.map((m) => m.userId)));
    const online = await this.store.filterOnline(distinctUserIds);

    return distinctUserIds.map((id) => ({
      userId: id,
      status: online.has(id) ? ('online' as const) : ('offline' as const),
    }));
  }

  /**
   * Раскидывает presence.update во все гилды, где состоит userId. WS-коннекты
   * подписаны на гилды через EventBus и получат событие только если у них
   * с этим юзером есть общая гилда.
   */
  private async fanOutToGuilds(userId: string, status: UserStatus): Promise<void> {
    const guildIds = await this.guildsOf(userId);
    for (const guildId of guildIds) {
      this.events.publishToGuild(guildId, { t: 'presence.update', userId, status });
    }
  }

  private async guildsOf(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ guildId: members.guildId })
      .from(members)
      .where(eq(members.userId, userId));
    return rows.map((r) => r.guildId);
  }
}
