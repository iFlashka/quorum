import Fastify, { type FastifyError, type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { type Config } from './config.js';
import { healthRoutes } from './routes/health.js';

export interface BuildAppOptions {
  config: Config;
}

export async function buildApp({ config }: BuildAppOptions): Promise<FastifyInstance> {
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
  });

  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    request.log.error({ err: error }, 'request failed');
    const status = error.statusCode ?? 500;
    void reply.status(status).send({
      error: status >= 500 ? 'Internal Server Error' : error.name,
      message: status >= 500 && !isDev ? 'Something went wrong' : error.message,
    });
  });

  await app.register(healthRoutes);

  return app;
}
