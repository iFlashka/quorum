import { z } from 'zod';

const TtlSchema = z
  .string()
  .regex(/^\d+\s*(ms|s|m|h|d|w|y)$/, 'must be a duration like "15m", "30d", "12h"');

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'must be at least 32 chars'),
  JWT_ACCESS_TTL: TtlSchema.default('15m'),
  JWT_REFRESH_TTL: TtlSchema.default('30d'),

  /** Корень для локальных uploads. Относительный путь — от `apps/server`. */
  UPLOADS_DIR: z.string().default('../../infra/data/uploads'),
  /** Максимальный размер одной загрузки. По умолчанию 25 МБ как в PROJECT.md. */
  UPLOAD_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(25 * 1024 * 1024),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
