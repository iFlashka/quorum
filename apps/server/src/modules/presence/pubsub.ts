/**
 * Cross-node bridge для presence-событий. В нашем pet-варианте обычно одна нода,
 * но архитектура честная: при подключении/отключении WS-сессии нода пишет
 * в Redis Pub/Sub-канал `presence:events`, и все ноды (включая ту, что
 * опубликовала) ретранслируют событие через локальный EventBus в свои WS.
 *
 * Поле `instanceId` в payload позволяет, при желании, отфильтровывать
 * собственные события — но мы не фильтруем: локальный broadcast идёт
 * по тому же каналу, что и foreign-broadcast, чтобы код был один.
 */

import { z } from 'zod';
import type { Redis } from 'ioredis';
import { UserStatusSchema } from '@quorum/shared';

const CHANNEL = 'presence:events';

export const PresenceEventSchema = z.object({
  userId: z.string().uuid(),
  status: UserStatusSchema,
  /** Идентификатор серверной ноды-источника (чисто для отладки). */
  instanceId: z.string(),
});
export type PresenceEvent = z.infer<typeof PresenceEventSchema>;

export type PresenceEventListener = (event: PresenceEvent) => void;

export class PresencePubsub {
  private readonly listeners = new Set<PresenceEventListener>();
  private subscribed = false;

  constructor(
    private readonly cmd: Redis,
    private readonly sub: Redis,
    private readonly instanceId: string,
  ) {}

  async start(): Promise<void> {
    if (this.subscribed) return;
    await this.sub.subscribe(CHANNEL);
    this.sub.on('message', (channel, payload) => {
      if (channel !== CHANNEL) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch {
        return;
      }
      const result = PresenceEventSchema.safeParse(parsed);
      if (!result.success) return;
      for (const fn of this.listeners) {
        try {
          fn(result.data);
        } catch {
          // Один слушатель не должен ронять остальных.
        }
      }
    });
    this.subscribed = true;
  }

  async stop(): Promise<void> {
    if (!this.subscribed) return;
    await this.sub.unsubscribe(CHANNEL);
    this.subscribed = false;
    this.listeners.clear();
  }

  async publish(userId: string, status: PresenceEvent['status']): Promise<void> {
    const payload: PresenceEvent = { userId, status, instanceId: this.instanceId };
    await this.cmd.publish(CHANNEL, JSON.stringify(payload));
  }

  on(listener: PresenceEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
