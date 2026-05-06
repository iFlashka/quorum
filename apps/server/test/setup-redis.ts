// Reaper отключаем по той же причине, что и для postgres-testcontainer на Windows.
process.env.TESTCONTAINERS_RYUK_DISABLED ??= 'true';

import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { createRedisClients, type RedisClients } from '../src/plugins/redis.js';

export interface TestRedis {
  url: string;
  clients: RedisClients;
  /** Стирает все ключи в текущей DB. */
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

/**
 * Поднимает redis:7-alpine в Docker через testcontainers и возвращает уже
 * подключённую пару клиентов (cmd + sub).
 */
export async function createTestRedis(): Promise<TestRedis> {
  const container: StartedTestContainer = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .start();

  const url = `redis://${container.getHost()}:${container.getMappedPort(6379)}`;
  const clients = createRedisClients(url);

  const reset = async (): Promise<void> => {
    await clients.cmd.flushdb();
  };

  const close = async (): Promise<void> => {
    await clients.close();
    await container.stop();
  };

  return { url, clients, reset, close };
}
