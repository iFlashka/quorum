import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { resolve as resolvePath } from 'node:path';
import { type Config } from './config.js';
import { healthRoutes } from './routes/health.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { authContextPlugin } from './plugins/auth-context.js';
import type { DbClient } from './db/client.js';
import { TokenService } from './modules/auth/tokens.js';
import { AuthService } from './modules/auth/service.js';
import { authRoutes } from './modules/auth/routes.js';
import { GuildsService } from './modules/guilds/service.js';
import { guildRoutes } from './modules/guilds/routes.js';
import { MessagesService } from './modules/messages/service.js';
import { messageRoutes } from './modules/messages/routes.js';
import { ReactionsService } from './modules/reactions/service.js';
import { reactionRoutes } from './modules/reactions/routes.js';
import { ReadStatesService } from './modules/read-states/service.js';
import { readStateRoutes } from './modules/read-states/routes.js';
import { AttachmentsService } from './modules/attachments/service.js';
import { attachmentRoutes } from './modules/attachments/routes.js';
import { LocalStorage } from './storage/index.js';
import { EventBus } from './realtime/event-bus.js';
import { wsPlugin } from './realtime/ws-plugin.js';
import { createRedisClients, type RedisClients } from './plugins/redis.js';
import { PresenceStore } from './modules/presence/store.js';
import { PresencePubsub } from './modules/presence/pubsub.js';
import { PresenceService } from './modules/presence/service.js';
import { CallsService } from './modules/calls/service.js';
import { TurnService } from './modules/turn/service.js';
import { turnRoutes } from './modules/turn/routes.js';
import { LivekitService } from './modules/livekit/service.js';
import { livekitRoutes } from './modules/livekit/routes.js';
import { VoiceChannelMembershipService } from './modules/voice-channels/service.js';
import { randomUUID } from 'node:crypto';

export interface BuildAppOptions {
  config: Config;
  db: DbClient;
  /** Готовые Redis-клиенты — позволяет тестам подсунуть своих. */
  redis?: RedisClients;
}

export async function buildApp({ config, db, redis }: BuildAppOptions): Promise<FastifyInstance> {
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

  // ---- Сервисы и шины ----
  const tokens = new TokenService({ db, config });
  const authService = new AuthService({ db, tokens });
  const guildsService = new GuildsService(db);
  const messagesService = new MessagesService(db);
  const reactionsService = new ReactionsService(db, messagesService);
  const readStatesService = new ReadStatesService(db, messagesService);
  const storage = new LocalStorage(resolvePath(process.cwd(), config.UPLOADS_DIR));
  const attachmentsService = new AttachmentsService(db, storage);
  const events = new EventBus();

  const redisClients = redis ?? createRedisClients(config.REDIS_URL);
  const presenceStore = new PresenceStore(redisClients.cmd);
  const presencePubsub = new PresencePubsub(redisClients.cmd, redisClients.sub, randomUUID());
  const presenceService = new PresenceService({
    db,
    store: presenceStore,
    pubsub: presencePubsub,
    events,
  });
  await presenceService.start();

  const callsService = new CallsService(db, events);
  const turnService = new TurnService({
    sharedSecret: config.TURN_SHARED_SECRET,
    urls: config.TURN_PUBLIC_URLS.split(',').map((u) => u.trim()).filter(Boolean),
    ttlSeconds: config.TURN_TTL_SECONDS,
  });
  const livekitService = new LivekitService({
    apiKey: config.LIVEKIT_API_KEY,
    apiSecret: config.LIVEKIT_API_SECRET,
    wsUrl: config.LIVEKIT_WS_URL,
  });
  const voiceChannelsService = new VoiceChannelMembershipService(db, events);

  // ---- Плагины ----
  await app.register(sensible);
  await app.register(cors, {
    origin: isDev
      ? [/^http:\/\/(localhost|127\.0\.0\.1):\d+$/, 'http://tauri.localhost', 'tauri://localhost']
      : ['http://tauri.localhost', 'tauri://localhost'],
    credentials: false,
  });
  await app.register(errorHandlerPlugin);
  if (config.NODE_ENV !== 'test') {
    await app.register(rateLimit, {
      max: 300,
      timeWindow: '1 minute',
      skipOnError: true,
    });
  }
  await app.register(multipart, {
    limits: {
      fileSize: config.UPLOAD_MAX_BYTES,
      files: 1,
    },
  });
  await app.register(authContextPlugin, { tokens });

  // ---- Роуты ----
  await app.register(healthRoutes);
  await app.register(authRoutes({ service: authService }));
  await app.register(guildRoutes({ service: guildsService }));
  await app.register(messageRoutes({ service: messagesService, events }));
  await app.register(reactionRoutes({ service: reactionsService, events }));
  await app.register(readStateRoutes({ service: readStatesService }));
  await app.register(attachmentRoutes({ service: attachmentsService }));
  await app.register(turnRoutes({ service: turnService }));
  await app.register(livekitRoutes({ service: livekitService, messages: messagesService, db }));

  // ---- WebSocket ----
  await app.register(wsPlugin, {
    tokens,
    guilds: guildsService,
    events,
    db,
    presence: presenceService,
    calls: callsService,
    voiceChannels: voiceChannelsService,
  });

  // Прокидываем events наружу для тестов.
  app.decorate('events', events);
  app.decorate('guildsService', guildsService);
  app.decorate('presenceService', presenceService);
  app.decorate('callsService', callsService);
  app.decorate('turnService', turnService);
  app.decorate('livekitService', livekitService);
  app.decorate('voiceChannelsService', voiceChannelsService);

  app.addHook('onClose', async () => {
    callsService.shutdown();
    voiceChannelsService.shutdown();
    await presenceService.stop();
    // Если клиенты подсунули снаружи — пусть их и закрывают (тесты).
    if (!redis) await redisClients.close();
  });

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    events: EventBus;
    guildsService: GuildsService;
    presenceService: PresenceService;
    callsService: CallsService;
    turnService: TurnService;
    livekitService: LivekitService;
    voiceChannelsService: VoiceChannelMembershipService;
  }
}
