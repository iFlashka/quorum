// Reaper (контейнер автоочистки testcontainers) на Windows + Docker Desktop часто
// не доступен по сокету. Отключаем — чистка будет через явный container.stop().
process.env.TESTCONTAINERS_RYUK_DISABLED ??= 'true';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as schema from '../src/db/schema.js';
import type { DbClient } from '../src/db/client.js';

export interface TestDb {
  db: DbClient;
  url: string;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

/**
 * Поднимает реальный postgres в Docker через testcontainers, применяет миграции,
 * возвращает Drizzle-клиент и helper для очистки между тестами.
 *
 * Ожидает запущенный Docker. На первый запуск ~5-10s warmup, последующие ~2s
 * (если образ закэширован).
 */
export async function createTestDb(): Promise<TestDb> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('quorum_test')
    .withUsername('quorum_test')
    .withPassword('quorum_test')
    .start();

  const url = container.getConnectionUri();
  const sql = postgres(url, { max: 5 });
  const db = drizzle(sql, { schema, casing: 'snake_case' });

  const here = dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = join(here, '..', 'src', 'db', 'migrations');
  await migrate(db, { migrationsFolder });

  const reset = async (): Promise<void> => {
    // Чистим все user-таблицы. Порядок неважен — `cascade` сам разрулит FK.
    await sql.unsafe(`
      truncate
        refresh_tokens,
        invites,
        channels,
        members,
        guilds,
        users
      restart identity cascade;
    `);
  };

  const close = async (): Promise<void> => {
    await sql.end({ timeout: 5 });
    await container.stop();
  };

  return { db, url, reset, close };
}
