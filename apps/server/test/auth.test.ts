/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig, type Config } from '../src/config.js';
import { createTestDb, type TestDb } from './setup-db.js';
import { guilds, invites, users } from '../src/db/schema.js';

const TEST_INVITE = 'TESTCODE';
const TEST_GUILD = 'Test Guild';

function buildTestEnv(databaseUrl: string): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    LOG_LEVEL: 'silent',
    DATABASE_URL: databaseUrl,
    REDIS_URL: 'redis://localhost:6379',
    JWT_ACCESS_SECRET: 'a'.repeat(48),
    JWT_REFRESH_SECRET: 'b'.repeat(48),
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '30d',
  };
}

describe('auth', () => {
  let testDb: TestDb;
  let app: FastifyInstance;
  let config: Config;

  beforeAll(async () => {
    testDb = await createTestDb();
    config = loadConfig(buildTestEnv(testDb.url));
    app = await buildApp({ config, db: testDb.db });
    await app.ready();
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await testDb.close();
  });

  beforeEach(async () => {
    await testDb.reset();
    // Сидим: владелец-юзер + гилда + пригодный invite.
    const [owner] = await testDb.db
      .insert(users)
      .values({
        username: 'ownerseed',
        passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0c2FsdA$dummy',
        displayName: 'Owner',
      })
      .returning();
    if (!owner) throw new Error('seed owner failed');

    const [guild] = await testDb.db
      .insert(guilds)
      .values({ name: TEST_GUILD, ownerId: owner.id })
      .returning();
    if (!guild) throw new Error('seed guild failed');

    await testDb.db.insert(invites).values({
      code: TEST_INVITE,
      guildId: guild.id,
      createdBy: owner.id,
      maxUses: 5,
    });
  });

  async function register(
    overrides: Partial<{
      username: string;
      password: string;
      displayName: string;
      inviteCode: string;
    }> = {},
  ): Promise<{ status: number; body: any }> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        username: overrides.username ?? 'alice',
        password: overrides.password ?? 'password123',
        displayName: overrides.displayName ?? 'Alice',
        inviteCode: overrides.inviteCode ?? TEST_INVITE,
      },
    });
    return { status: res.statusCode, body: res.json() };
  }

  it('register: без invite → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'alice', password: 'password123', displayName: 'Alice' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('register: с валидным invite → 201 + tokens, invite uses++', async () => {
    const r = await register();
    expect(r.status).toBe(201);
    expect(r.body.user.username).toBe('alice');
    expect(r.body.tokens.accessToken).toBeTypeOf('string');
    expect(r.body.tokens.refreshToken).toBeTypeOf('string');

    const inviteRows = await testDb.db.query.invites.findFirst({
      where: (i, { eq }) => eq(i.code, TEST_INVITE),
    });
    expect(inviteRows?.uses).toBe(1);
  });

  it('register: уже занятый username → 409', async () => {
    await register({ username: 'alice' });
    const r = await register({ username: 'alice' });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('username_taken');
  });

  it('register: неизвестный invite → 400', async () => {
    const r = await register({ inviteCode: 'NOSUCH00' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('invite_invalid');
  });

  it('register: исчерпанный invite → 410', async () => {
    // Сделаем invite с maxUses=1, истратим, повторим.
    await testDb.db.insert(invites).values({
      code: 'ONCE0001',
      guildId: (await testDb.db.query.guilds.findFirst())!.id,
      createdBy: (await testDb.db.query.users.findFirst())!.id,
      maxUses: 1,
    });
    await register({ username: 'first', inviteCode: 'ONCE0001' });
    const r = await register({ username: 'second', inviteCode: 'ONCE0001' });
    expect(r.status).toBe(410);
    expect(r.body.code).toBe('invite_exhausted');
  });

  it('login: верный пароль → 200, неверный → 401', async () => {
    await register({ username: 'bob', password: 'goodpass1' });

    const ok = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'bob', password: 'goodpass1' },
    });
    expect(ok.statusCode).toBe(200);

    const bad = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'bob', password: 'wrongpass1' },
    });
    expect(bad.statusCode).toBe(401);
    expect((bad.json()).code).toBe('invalid_credentials');
  });

  it('login: несуществующий юзер → 401 (одинаковое сообщение)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'ghost', password: 'whatever1' },
    });
    expect(res.statusCode).toBe(401);
    expect((res.json()).code).toBe('invalid_credentials');
  });

  it('refresh: валидный → новые tokens, старый ревочится', async () => {
    const r = await register({ username: 'carol' });
    const oldRefresh = r.body.tokens.refreshToken;

    const r1 = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: oldRefresh },
    });
    expect(r1.statusCode).toBe(200);
    const tokens1 = (r1.json()).tokens;
    expect(tokens1.refreshToken).not.toBe(oldRefresh);

    // Повторное использование старого → 401, и новый refresh тоже становится недействительным.
    const replay = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: oldRefresh },
    });
    expect(replay.statusCode).toBe(401);
    expect((replay.json()).code).toBe('refresh_replay');

    const reuseAfter = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: tokens1.refreshToken },
    });
    expect(reuseAfter.statusCode).toBe(401);
  });

  it('me: без токена → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('me: с access → 200 + список гилд', async () => {
    const r = await register({ username: 'dave' });
    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${r.body.tokens.accessToken}` },
    });
    expect(me.statusCode).toBe(200);
    const body = me.json();
    expect(body.user.username).toBe('dave');
    expect(body.guilds).toHaveLength(1);
    expect(body.guilds[0].memberRole).toBe('member');
  });

  it('logout: ревочит конкретный refresh', async () => {
    const r = await register({ username: 'eve' });
    const out = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      payload: { refreshToken: r.body.tokens.refreshToken },
    });
    expect(out.statusCode).toBe(204);

    const after = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: r.body.tokens.refreshToken },
    });
    expect(after.statusCode).toBe(401);
  });
});
