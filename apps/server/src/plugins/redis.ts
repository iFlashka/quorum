import { Redis, type RedisOptions } from 'ioredis';

export interface RedisClients {
  /** Команды (GET/SET/SADD/...). Безопасно вызывать отовсюду. */
  cmd: Redis;
  /**
   * Отдельный коннект под Pub/Sub. На subscribe-клиенте нельзя выполнять команды
   * не относящиеся к подпискам — поэтому он отдельный.
   */
  sub: Redis;
  close: () => Promise<void>;
}

/**
 * Создаёт пару клиентов под обычные команды и под подписки. ioredis сам делает
 * lazy reconnect; нам достаточно `lazyConnect: false` (сразу коннектится),
 * чтобы при старте сервера падать громко если Redis недоступен.
 */
export function createRedisClients(url: string): RedisClients {
  const opts: RedisOptions = {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  };
  const cmd = new Redis(url, opts);
  const sub = new Redis(url, opts);

  const close = async (): Promise<void> => {
    await Promise.allSettled([cmd.quit(), sub.quit()]);
  };

  return { cmd, sub, close };
}
