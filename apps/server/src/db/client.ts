import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export type DbClient = ReturnType<typeof drizzle<typeof schema>>;

export function createPostgresDb(url: string): { db: DbClient; close: () => Promise<void> } {
  const sql = postgres(url, { max: 10, prepare: false });
  const db = drizzle(sql, { schema, casing: 'snake_case' });
  return {
    db,
    close: async () => {
      await sql.end();
    },
  };
}
