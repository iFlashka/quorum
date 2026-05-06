import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPostgresDb } from './db/client.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const { db, close } = createPostgresDb(config.DATABASE_URL);
  const app = await buildApp({ config, db });

  try {
    await app.listen({ host: config.HOST, port: config.PORT });
  } catch (err) {
    app.log.error({ err }, 'failed to start server');
    await close();
    process.exit(1);
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      await close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void main();
