/**
 * Membership голосовых каналов — кто сейчас в каком voice-channel.
 *
 * Источник истины — этот in-memory сервис, обновляется клиентами через
 * `voice.channel.join/leave` WS-события. Сервер валидирует:
 *   - канал существует и kind=voice;
 *   - юзер — member гилды.
 *
 * При изменении broadcast'ится `voice.channel.state` всем подписчикам
 * этой гилды через `EventBus.publishToGuild`. Все клиенты видят полный
 * снапшот участников канала, не только разности.
 *
 * Disconnect-handler (вызывается из ws-plugin) убирает юзера из всех
 * каналов, чтобы не залипали призраки.
 */

import { eq } from 'drizzle-orm';
import type { DbClient } from '../../db/client.js';
import { channels, members } from '../../db/schema.js';
import type { EventBus } from '../../realtime/event-bus.js';

export class VoiceChannelMembershipService {
  /** channelId → Set<userId>. */
  private readonly byChannel = new Map<string, Set<string>>();
  /** userId → Set<channelId>, для быстрого disconnect-cleanup. */
  private readonly byUser = new Map<string, Set<string>>();
  /** channelId → guildId, кешируем чтобы не ходить в БД каждый broadcast. */
  private readonly guildOfChannel = new Map<string, string>();

  constructor(
    private readonly db: DbClient,
    private readonly events: EventBus,
  ) {}

  async join(userId: string, channelId: string): Promise<void> {
    const guildId = await this.resolveAndAuthorize(userId, channelId);
    if (!guildId) return;

    let users = this.byChannel.get(channelId);
    if (!users) {
      users = new Set();
      this.byChannel.set(channelId, users);
    }
    if (users.has(userId)) return;
    users.add(userId);

    let userChannels = this.byUser.get(userId);
    if (!userChannels) {
      userChannels = new Set();
      this.byUser.set(userId, userChannels);
    }
    userChannels.add(channelId);

    this.broadcastState(channelId, guildId);
  }

  leave(userId: string, channelId: string): void {
    const users = this.byChannel.get(channelId);
    if (!users?.has(userId)) return;
    users.delete(userId);
    if (users.size === 0) this.byChannel.delete(channelId);

    const userChannels = this.byUser.get(userId);
    if (userChannels) {
      userChannels.delete(channelId);
      if (userChannels.size === 0) this.byUser.delete(userId);
    }

    const guildId = this.guildOfChannel.get(channelId);
    if (guildId) this.broadcastState(channelId, guildId);
  }

  /** Вызывается из WS-плагина при разрыве соединения юзера. */
  onUserDisconnected(userId: string): void {
    const userChannels = this.byUser.get(userId);
    if (!userChannels) return;
    const channelIds = Array.from(userChannels);
    for (const channelId of channelIds) {
      this.leave(userId, channelId);
    }
  }

  /**
   * Снапшот всех каналов и их участников из гилд юзера. Используется при
   * `ready`, чтобы новый WS-коннект сразу увидел кто где сидит.
   */
  async snapshotForUser(userId: string): Promise<
    { channelId: string; guildId: string; participantIds: string[] }[]
  > {
    const userGuilds = await this.db
      .select({ guildId: members.guildId })
      .from(members)
      .where(eq(members.userId, userId));
    const guildSet = new Set(userGuilds.map((r) => r.guildId));
    const out: { channelId: string; guildId: string; participantIds: string[] }[] = [];
    for (const [channelId, occupants] of this.byChannel) {
      const guildId = this.guildOfChannel.get(channelId);
      if (!guildId || !guildSet.has(guildId)) continue;
      out.push({
        channelId,
        guildId,
        participantIds: Array.from(occupants),
      });
    }
    return out;
  }

  /** Только для тестов и graceful shutdown. */
  shutdown(): void {
    this.byChannel.clear();
    this.byUser.clear();
    this.guildOfChannel.clear();
  }

  // ---- internals ----

  private async resolveAndAuthorize(
    userId: string,
    channelId: string,
  ): Promise<string | null> {
    const cached = this.guildOfChannel.get(channelId);
    if (cached) {
      // Если канал уже знаком, проверим только membership (могло измениться).
      const isMember = await this.isMember(userId, cached);
      return isMember ? cached : null;
    }
    const [row] = await this.db
      .select({ id: channels.id, guildId: channels.guildId, kind: channels.kind })
      .from(channels)
      .where(eq(channels.id, channelId))
      .limit(1);
    if (row?.kind !== 'voice') return null;
    const isMember = await this.isMember(userId, row.guildId);
    if (!isMember) return null;
    this.guildOfChannel.set(channelId, row.guildId);
    return row.guildId;
  }

  private async isMember(userId: string, guildId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: members.id })
      .from(members)
      .where(eq(members.userId, userId))
      .limit(1000);
    void row;
    // Для простоты тянем все членства юзера. Их обычно мало. Можно оптимизировать
    // под отдельный where(and(...)) запрос — но для 5–10 юзеров не критично.
    const all = await this.db
      .select({ guildId: members.guildId })
      .from(members)
      .where(eq(members.userId, userId));
    return all.some((r) => r.guildId === guildId);
  }

  private broadcastState(channelId: string, guildId: string): void {
    const occupants = this.byChannel.get(channelId);
    const participantIds = occupants ? Array.from(occupants) : [];
    this.events.publishToGuild(guildId, {
      t: 'voice.channel.state',
      channelId,
      guildId,
      participantIds,
    });
  }
}
