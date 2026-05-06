import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket, type RawData } from 'ws';
import { setupRig, type TestActor, type TestRig } from './helpers/setup-app.js';
import type { ServerEvent } from '@quorum/shared';

interface OpenedClient {
  ws: WebSocket;
  /** Все полученные ServerEvent в порядке прихода. */
  inbox: ServerEvent[];
  /** Promise, резолвящийся когда придёт первое event с заданным `t`. */
  waitFor: <T extends ServerEvent['t']>(
    t: T,
    matcher?: (event: Extract<ServerEvent, { t: T }>) => boolean,
    timeoutMs?: number,
  ) => Promise<Extract<ServerEvent, { t: T }>>;
  close: () => Promise<void>;
}

describe('presence через Redis Pub/Sub', () => {
  let rig: TestRig;
  let alice: TestActor;
  let bob: TestActor;
  let baseUrl: string;

  beforeAll(async () => {
    rig = await setupRig();
    alice = await rig.register('alice');
    bob = await rig.register('bob');
    const addr = await rig.app.listen({ host: '127.0.0.1', port: 0 });
    baseUrl = addr.replace(/^http:\/\//, 'ws://') + '/ws';
  }, 90_000);

  afterAll(async () => {
    await rig.close();
  });

  async function openClient(actor: TestActor): Promise<OpenedClient> {
    const ws = new WebSocket(baseUrl);
    const inbox: ServerEvent[] = [];
    const waiters: ((event: ServerEvent) => void)[] = [];

    ws.on('message', (raw: RawData) => {
      // RawData может быть Buffer | ArrayBuffer | Buffer[]; приводим к строке явно.
      const text = Buffer.isBuffer(raw)
        ? raw.toString('utf8')
        : Array.isArray(raw)
          ? Buffer.concat(raw).toString('utf8')
          : Buffer.from(raw).toString('utf8');
      const event = JSON.parse(text) as ServerEvent;
      inbox.push(event);
      const snapshot = waiters.slice();
      for (const fn of snapshot) fn(event);
    });

    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });

    ws.send(JSON.stringify({ t: 'hello', access: actor.accessToken }));

    const waitFor = async <T extends ServerEvent['t']>(
      t: T,
      matcher?: (event: Extract<ServerEvent, { t: T }>) => boolean,
      timeoutMs = 3_000,
    ): Promise<Extract<ServerEvent, { t: T }>> => {
      // Сначала проверяем уже накопленные — событие могло прийти до setup'а ожидателя.
      for (const e of inbox) {
        if (e.t === t) {
          const candidate = e as Extract<ServerEvent, { t: T }>;
          if (!matcher || matcher(candidate)) return candidate;
        }
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiters.splice(waiters.indexOf(handler), 1);
          reject(
            new Error(
              `timeout waiting for "${t}" after ${timeoutMs}ms; inbox=${inbox
                .map((e) => e.t)
                .join(',')}`,
            ),
          );
        }, timeoutMs);
        const handler = (event: ServerEvent): void => {
          if (event.t !== t) return;
          const candidate = event as Extract<ServerEvent, { t: T }>;
          if (matcher && !matcher(candidate)) return;
          clearTimeout(timer);
          waiters.splice(waiters.indexOf(handler), 1);
          resolve(candidate);
        };
        waiters.push(handler);
      });
    };

    const close = async (): Promise<void> => {
      if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) {
        await new Promise<void>((resolve) => {
          ws.once('close', () => resolve());
          ws.close();
        });
      }
    };

    return { ws, inbox, waitFor, close };
  }

  it('initial ready содержит alice как online', async () => {
    const a = await openClient(alice);
    const ready = await a.waitFor('ready');
    const me = ready.presence.find((p) => p.userId === alice.id);
    expect(me?.status).toBe('online');
    await a.close();
  });

  it('alice видит bob → online когда bob подключается; → offline когда отваливается', async () => {
    const a = await openClient(alice);
    await a.waitFor('ready');

    const b = await openClient(bob);
    await b.waitFor('ready');

    const onBobOnline = await a.waitFor(
      'presence.update',
      (e) => e.userId === bob.id && e.status === 'online',
    );
    expect(onBobOnline.status).toBe('online');

    await b.close();
    const onBobOffline = await a.waitFor(
      'presence.update',
      (e) => e.userId === bob.id && e.status === 'offline',
    );
    expect(onBobOffline.status).toBe('offline');

    await a.close();
  });

  it('две сессии bob: closeOne — alice не видит offline, closeBoth — видит', async () => {
    const a = await openClient(alice);
    await a.waitFor('ready');

    const b1 = await openClient(bob);
    await b1.waitFor('ready');
    // первая сессия — переход offline → online, broadcast уйдёт
    await a.waitFor(
      'presence.update',
      (e) => e.userId === bob.id && e.status === 'online',
    );

    const b2 = await openClient(bob);
    await b2.waitFor('ready');
    // вторая сессия — broadcast НЕ должен уйти, потому что bob уже был online.

    // Закрываем первую — bob всё ещё online.
    await b1.close();
    // Маленькая пауза, чтобы возможные ложные broadcast'ы успели прилететь.
    await new Promise((r) => setTimeout(r, 250));
    const sawSpuriousOffline = a.inbox.some(
      (e) => e.t === 'presence.update' && e.userId === bob.id && e.status === 'offline',
    );
    expect(sawSpuriousOffline).toBe(false);

    // Закрываем вторую — теперь должен прийти offline.
    await b2.close();
    await a.waitFor(
      'presence.update',
      (e) => e.userId === bob.id && e.status === 'offline',
    );

    await a.close();
  });
});
