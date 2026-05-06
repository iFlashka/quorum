import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadConfig } from '../config.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const sql = postgres(config.DATABASE_URL, { max: 1 });
  const db = drizzle(sql);

  const here = dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = join(here, 'migrations');

  console.log(`Running migrations from ${migrationsFolder}…`);
  await migrate(db, { migrationsFolder });
  console.log('Migrations applied.');

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
