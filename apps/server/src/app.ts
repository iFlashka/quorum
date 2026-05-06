import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { type Config } from './config.js';
import { healthRoutes } from './routes/health.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { authContextPlugin } from './plugins/auth-context.js';
import type { DbClient } from './db/client.js';
import { TokenService } from './modules/auth/tokens.js';
import { AuthService } from './modules/auth/service.js';
import { authRoutes } from './modules/auth/routes.js';

export interface BuildAppOptions {
  config: Config;
  db: DbClient;
}

export async function buildApp({ config, db }: BuildAppOptions): Promise<FastifyInstance> {
  const isDev = config.NODE_ENV === 'development';

  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      ...(isDev
        ? {
            transport: {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' },
            },
          }
        : {}),
    },
    disableRequestLogging: false,
    trustProxy: !isDev,
  });

  const tokens = new TokenService({ db, config });
  const authService = new AuthService({ db, tokens });

  await app.register(sensible);
  await app.register(cors, {
    // В Tauri webview origin — `http://tauri.localhost` (Win/Linux) или `tauri://localhost` (mac).
    // Для dev-веба добавляем `http://localhost:1420` (Vite). В проде ограничим явным списком через ENV.
    origin: isDev
      ? [/^http:\/\/(localhost|127\.0\.0\.1):\d+$/, 'http://tauri.localhost', 'tauri://localhost']
      : ['http://tauri.localhost', 'tauri://localhost'],
    credentials: false,
  });
  await app.register(errorHandlerPlugin);
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    skipOnError: true,
  });
  await app.register(authContextPlugin, { tokens });

  await app.register(healthRoutes);
  await app.register(authRoutes({ service: authService }));

  return app;
}
