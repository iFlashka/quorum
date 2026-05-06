import fp from 'fastify-plugin';
import type { FastifyError, FastifyPluginAsync } from 'fastify';
import { ZodError } from 'zod';
import { AuthError } from '../modules/auth/errors.js';

interface ErrorBody {
  error: string;
  code?: string;
  message: string;
  details?: unknown;
}

const plugin: FastifyPluginAsync = (app) => {
  const isDev = (process.env.NODE_ENV ?? 'development') === 'development';

  app.setErrorHandler((rawError, request, reply) => {
    if (rawError instanceof ZodError) {
      const body: ErrorBody = {
        error: 'ValidationError',
        code: 'invalid_body',
        message: 'Запрос не прошёл валидацию',
        details: rawError.flatten(),
      };
      return reply.status(400).send(body);
    }

    if (rawError instanceof AuthError) {
      const body: ErrorBody = {
        error: 'AuthError',
        code: rawError.code,
        message: rawError.message,
      };
      return reply.status(rawError.statusCode).send(body);
    }

    request.log.error({ err: rawError }, 'request failed');
    const error = rawError as FastifyError;
    const status = error.statusCode ?? 500;
    const body: ErrorBody = {
      error: status >= 500 ? 'InternalServerError' : (error.name ?? 'Error'),
      code: error.code,
      message:
        status >= 500 && !isDev
          ? 'Внутренняя ошибка сервера'
          : (error.message ?? 'unknown error'),
    };
    return reply.status(status).send(body);
  });

  return Promise.resolve();
};

export const errorHandlerPlugin = fp(plugin, { name: 'error-handler' });
