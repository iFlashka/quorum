import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) {
  // drizzle-kit вызывается из CLI; читаем .env вручную через dotenv-cli либо --env-file=.env
  throw new Error('DATABASE_URL is not set. Run drizzle-kit through the workspace scripts.');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  casing: 'snake_case',
});
