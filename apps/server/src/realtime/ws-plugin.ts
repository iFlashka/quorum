/**
 * WebSocket-плагин Quorum: /ws.
 *
 * Поток подключения:
 *   1. Клиент открывает ws://server/ws → сервер ждёт первого frame в течение 5s
 *   2. Клиент шлёт `{t: "hello", access: "..."}`
 *   3. Сервер валидирует access, отдаёт `{t: "ready", user, guilds, presence: []}`
 *      и подписывает коннект на EventBus.publishToGuild для каждой guild юзера
 *   4. Дальше двусторонний обмен JSON-frame'ами (см. shared/ws/events.ts)
 *   5. Heartbeat: клиент → `ping`, сервер → `pong`. Нет ping за 60s — close.
 */

import fp from 'fastify-plugin';
import websocket, { type WebSocket } from '@fastify/websocket';
import {
  ClientEventSchema,
  type ServerEvent,
  type PublicGuild,
  type PrivateUser,
} from '@quorum/shared';
import type { TokenService } from '../modules/auth/tokens.js';
import type { GuildsService } from '../modules/guilds/service.js';
import type { EventBus } from './event-bus.js';
import type { DbClient } from '../db/client.js';
import { eq } from 'drizzle-orm';
import { users } from '../db/schema.js';

const HELLO_TIMEOUT_MS = 5_000;
const HEARTBEAT_TIMEOUT_MS = 60_000;

const CLOSE_AUTH_FAILED = 4001;
const CLOSE_HELLO_TIMEOUT = 4002;
const CLOSE_HEARTBEAT_LOST = 4003;
const CLOSE_PROTOCOL_ERROR = 4004;

interface WsPluginOptions {
  tokens: TokenService;
  guilds: GuildsService;
  events: EventBus;
  db: DbClient;
}

export const wsPlugin = fp<WsPluginOptions>(async (app, opts) => {
  const { tokens, guilds, events, db } = opts;

  await app.register(websocket);

  app.get('/ws', { websocket: true }, (socket: WebSocket) => {

    let authenticatedUserId: string | null = null;
    const unsubscribers: (() => void)[] = [];
    let helloTimer: NodeJS.Timeout | null = setTimeout(() => {
      sendError(socket, 'hello_timeout', 'клиент не прислал hello за 5s');
      socket.close(CLOSE_HELLO_TIMEOUT, 'hello_timeout');
    }, HELLO_TIMEOUT_MS);
    let heartbeatTimer: NodeJS.Timeout | null = null;

    const armHeartbeat = (): void => {
      if (heartbeatTimer) clearTimeout(heartbeatTimer);
      heartbeatTimer = setTimeout(() => {
        socket.close(CLOSE_HEARTBEAT_LOST, 'heartbeat_lost');
      }, HEARTBEAT_TIMEOUT_MS);
    };

    socket.on('message', (raw: Buffer) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString()) as unknown;
      } catch {
        sendError(socket, 'invalid_json', 'сообщение не JSON');
        return;
      }

      const result = ClientEventSchema.safeParse(parsed);
      if (!result.success) {
        sendError(socket, 'invalid_payload', 'не подходит ни под одно событие');
        return;
      }
      const event = result.data;

      // Любое сообщение от клиента считается признаком жизни.
      armHeartbeat();

      if (!authenticatedUserId) {
        if (event.t !== 'hello') {
          sendError(socket, 'not_authenticated', 'жду hello first');
          socket.close(CLOSE_PROTOCOL_ERROR, 'not_authenticated');
          return;
        }
        if (helloTimer) {
          clearTimeout(helloTimer);
          helloTimer = null;
        }
        void handleHello(event.access);
        return;
      }

      switch (event.t) {
        case 'ping':
          send(socket, { t: 'pong' });
          break;
        case 'typing.start':
        case 'typing.stop':
          // Публикуем typing-событие во все гилды куда подписан юзер.
          // Достаточно того что это происходит на уровне канала: гилды получат
          // typing внутри своих listener'ов и проигнорируют чужие channelId.
          events.publishToUser(authenticatedUserId, {
            t: 'typing',
            channelId: event.channelId,
            userId: authenticatedUserId,
          });
          // FIXME(phase 2A.3): broadcast typing на guild-членов через guildId,
          // когда на месте Redis-presence. Пока — own connection echo.
          break;
        case 'presence.set':
          // PHASE 2A.3: апдейт user.status в БД + broadcast presence.update.
          // Сейчас просто эхо клиенту, чтобы UI оптимистично пометил.
          if (authenticatedUserId) {
            send(socket, {
              t: 'presence.update',
              userId: authenticatedUserId,
              status: event.status,
            });
          }
          break;
        case 'hello':
          // Уже аутентифицирован — игнорируем повторный hello.
          sendError(socket, 'already_authenticated', 'hello уже принят');
          break;
      }
    });

    socket.on('close', () => {
      if (helloTimer) clearTimeout(helloTimer);
      if (heartbeatTimer) clearTimeout(heartbeatTimer);
      for (const off of unsubscribers) off();
      unsubscribers.length = 0;
    });

    socket.on('error', () => {
      // Закроется через onclose; ничего не делаем.
    });

    // ---- helpers ----

    async function handleHello(access: string): Promise<void> {
      try {
        const claims = await tokens.verifyAccess(access);
        const userId = claims.sub;

        const [me] = await db
          .select()
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        if (!me) {
          send(socket, { t: 'auth_failed', reason: 'user_not_found' });
          socket.close(CLOSE_AUTH_FAILED, 'user_not_found');
          return;
        }

        const userGuilds: PublicGuild[] = await guilds.listForUser(userId);
        authenticatedUserId = userId;
        armHeartbeat();

        // Подписки на EventBus.
        const dispatch = (event: ServerEvent): void => send(socket, event);
        for (const g of userGuilds) {
          unsubscribers.push(events.subscribeGuild(g.id, dispatch));
        }
        unsubscribers.push(events.subscribeUser(userId, dispatch));

        const user: PrivateUser = {
          id: me.id,
          username: me.username,
          displayName: me.displayName,
          avatarUrl: me.avatarUrl,
          status: me.status,
          email: me.email,
        };

        send(socket, {
          t: 'ready',
          user,
          guilds: userGuilds,
          presence: [], // PHASE 2A.3
        });
      } catch (err) {
        app.log.warn({ err }, 'ws hello failed');
        send(socket, { t: 'auth_failed', reason: 'invalid_access' });
        socket.close(CLOSE_AUTH_FAILED, 'invalid_access');
      }
    }
  });
});

function send(socket: WebSocket, event: ServerEvent): void {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify(event));
}

function sendError(socket: WebSocket, code: string, message: string): void {
  send(socket, { t: 'error', code, message });
}
