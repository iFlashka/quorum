import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as schema from '../src/db/schema.js';
import type { DbClient } from '../src/db/client.js';

export interface TestDb {
  db: DbClient;
  client: PGlite;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite();
  // Drizzle с PGlite использует тот же schema/relations API.
  // Тип PgliteDatabase отличается от PostgresJsDatabase, но публичный query-API совпадает —
  // поэтому приводим через unknown.
  const db = drizzle(client, { schema, casing: 'snake_case' }) as unknown as DbClient;

  const here = dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = join(here, '..', 'src', 'db', 'migrations');

  await migrate(db as unknown as Parameters<typeof migrate>[0], { migrationsFolder });

  const reset = async (): Promise<void> => {
    await client.exec(`
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
    await client.close();
  };

  return { db, client, reset, close };
}
