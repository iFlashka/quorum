/**
 * Общий helper для тестов phase 2: testcontainer + Fastify + готовые юзеры/гилда/канал.
 * Возвращает регистратора-helper'a `register(username)` чтобы создавать тест-юзеров
 * и получать их access-токены — тесты получаются короче.
 */

import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { createTestDb, type TestDb } from '../setup-db.js';
import { channels, guilds, invites, members, users } from '../../src/db/schema.js';
import { hashPassword } from '../../src/modules/auth/password.js';

const TEST_INVITE = 'PHASE2X1';

export interface TestActor {
  id: string;
  username: string;
  accessToken: string;
  refreshToken: string;
}

export interface TestRig {
  testDb: TestDb;
  app: FastifyInstance;
  ownerId: string;
  guildId: string;
  textChannelId: string;
  voiceChannelId: string;
  inviteCode: string;
  /** Создать юзера через invite, вернуть его access-токен. */
  register: (username: string) => Promise<TestActor>;
  close: () => Promise<void>;
}

export async function setupRig(): Promise<TestRig> {
  const testDb = await createTestDb();
  const config = loadConfig({
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    LOG_LEVEL: 'silent',
    DATABASE_URL: testDb.url,
    REDIS_URL: 'redis://localhost:6379',
    JWT_ACCESS_SECRET: 'a'.repeat(48),
    JWT_REFRESH_SECRET: 'b'.repeat(48),
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '30d',
    UPLOADS_DIR: './test-uploads-dir',
  });
  const app = await buildApp({ config, db: testDb.db });
  await app.ready();

  // Сидим owner-юзера, гилду, два канала, invite.
  const passwordHash = await hashPassword('password123');
  const [owner] = await testDb.db
    .insert(users)
    .values({
      username: 'rigowner',
      passwordHash,
      displayName: 'Rig Owner',
    })
    .returning();
  if (!owner) throw new Error('failed to seed owner');

  const [guild] = await testDb.db
    .insert(guilds)
    .values({ name: 'Rig Guild', ownerId: owner.id })
    .returning();
  if (!guild) throw new Error('failed to seed guild');

  await testDb.db
    .insert(members)
    .values({ guildId: guild.id, userId: owner.id, role: 'owner' });

  const [textChannel] = await testDb.db
    .insert(channels)
    .values({ guildId: guild.id, kind: 'text', name: 'general', position: 0 })
    .returning();
  const [voiceChannel] = await testDb.db
    .insert(channels)
    .values({ guildId: guild.id, kind: 'voice', name: 'lounge', position: 1 })
    .returning();
  if (!textChannel || !voiceChannel) throw new Error('failed to seed channels');

  await testDb.db.insert(invites).values({
    code: TEST_INVITE,
    guildId: guild.id,
    createdBy: owner.id,
    maxUses: null,
  });

  const register = async (username: string): Promise<TestActor> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        username,
        password: 'password123',
        displayName: username,
        inviteCode: TEST_INVITE,
      },
    });
    if (res.statusCode !== 201) {
      throw new Error(`register ${username} failed: ${res.statusCode} ${res.body}`);
    }
    const body = res.json<{
      user: { id: string; username: string };
      tokens: { accessToken: string; refreshToken: string };
    }>();
    return {
      id: body.user.id,
      username: body.user.username,
      accessToken: body.tokens.accessToken,
      refreshToken: body.tokens.refreshToken,
    };
  };

  return {
    testDb,
    app,
    ownerId: owner.id,
    guildId: guild.id,
    textChannelId: textChannel.id,
    voiceChannelId: voiceChannel.id,
    inviteCode: TEST_INVITE,
    register,
    close: async () => {
      await app.close();
      await testDb.close();
    },
  };
}

export function authHeader(actor: TestActor): { authorization: string } {
  return { authorization: `Bearer ${actor.accessToken}` };
}
