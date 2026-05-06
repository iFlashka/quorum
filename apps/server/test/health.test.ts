import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createTestDb, type TestDb } from './setup-db.js';

describe('GET /health', () => {
  let app: FastifyInstance;
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await createTestDb();
    const config = loadConfig({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: 'postgres://test:test@localhost:5432/test',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'a'.repeat(48),
      JWT_REFRESH_SECRET: 'b'.repeat(48),
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL: '30d',
    });
    app = await buildApp({ config, db: testDb.db });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await testDb.close();
  });

  it('returns 200 with status ok', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    const body: { status: string; uptimeSeconds: number; timestamp: string } = response.json();
    expect(body.status).toBe('ok');
    expect(typeof body.uptimeSeconds).toBe('number');
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
