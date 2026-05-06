import { and, asc, eq } from 'drizzle-orm';
import type { DbClient } from '../../db/client.js';
import { channels, guilds, members, users } from '../../db/schema.js';
import type { PublicChannel, PublicGuild, PublicMember } from '@quorum/shared';

export class GuildsService {
  constructor(private readonly db: DbClient) {}

  /** Список гилд, в которых юзер — member. */
  async listForUser(userId: string): Promise<PublicGuild[]> {
    const rows = await this.db
      .select({
        id: guilds.id,
        name: guilds.name,
        iconUrl: guilds.iconUrl,
        memberRole: members.role,
      })
      .from(members)
      .innerJoin(guilds, eq(members.guildId, guilds.id))
      .where(eq(members.userId, userId));

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      iconUrl: r.iconUrl,
      memberRole: r.memberRole,
    }));
  }

  /** Каналы гилды, проверяя что юзер — её member. Иначе null. */
  async listChannels(userId: string, guildId: string): Promise<PublicChannel[] | null> {
    const member = await this.assertMember(userId, guildId);
    if (!member) return null;

    const rows = await this.db
      .select()
      .from(channels)
      .where(eq(channels.guildId, guildId))
      .orderBy(asc(channels.position), asc(channels.createdAt));

    return rows.map((c) => ({
      id: c.id,
      guildId: c.guildId,
      kind: c.kind,
      name: c.name,
      topic: c.topic,
      position: c.position,
    }));
  }

  /** Members гилды (включая текущего юзера). */
  async listMembers(userId: string, guildId: string): Promise<PublicMember[] | null> {
    const member = await this.assertMember(userId, guildId);
    if (!member) return null;

    const rows = await this.db
      .select({
        id: members.id,
        userId: members.userId,
        guildId: members.guildId,
        role: members.role,
        nickname: members.nickname,
        joinedAt: members.joinedAt,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        status: users.status,
      })
      .from(members)
      .innerJoin(users, eq(members.userId, users.id))
      .where(eq(members.guildId, guildId));

    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      guildId: r.guildId,
      username: r.username,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl,
      role: r.role,
      nickname: r.nickname,
      status: r.status,
      joinedAt: r.joinedAt.toISOString(),
    }));
  }

  /** Возвращает membership-запись если юзер в гилде, иначе undefined. */
  async assertMember(
    userId: string,
    guildId: string,
  ): Promise<{ id: string; role: 'owner' | 'admin' | 'member' } | undefined> {
    const [row] = await this.db
      .select({ id: members.id, role: members.role })
      .from(members)
      .where(and(eq(members.guildId, guildId), eq(members.userId, userId)))
      .limit(1);
    return row;
  }
}
