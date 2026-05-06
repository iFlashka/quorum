import type { FastifyPluginAsync } from 'fastify';
import {
  AuthSuccessResponseSchema,
  LoginRequestSchema,
  LogoutRequestSchema,
  MeResponseSchema,
  RefreshRequestSchema,
  RefreshResponseSchema,
  RegisterRequestSchema,
  UpdateMeRequestSchema,
  UpdateMeResponseSchema,
  type AuthSuccessResponse,
  type MeResponse,
  type RefreshResponse,
  type UpdateMeResponse,
} from '@quorum/shared';
import { AuthError } from './errors.js';
import type { AuthService } from './service.js';
import { requireUser } from '../../plugins/auth-context.js';

interface AuthRoutesOptions {
  service: AuthService;
}

export const authRoutes = (opts: AuthRoutesOptions): FastifyPluginAsync => {
  const { service } = opts;
  const plugin: FastifyPluginAsync = (app) => {
    app.post(
      '/auth/register',
      { config: { rateLimit: { max: 3, timeWindow: '1 minute' } } },
      async (request, reply) => {
      const body = RegisterRequestSchema.parse(request.body);
      const ua = request.headers['user-agent'] ?? undefined;
      const result = await service.register(body, ua);
      const response: AuthSuccessResponse = AuthSuccessResponseSchema.parse({
        user: result.user,
        tokens: {
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
          accessTokenExpiresAt: result.tokens.accessTokenExpiresAt.toISOString(),
          refreshTokenExpiresAt: result.tokens.refreshTokenExpiresAt.toISOString(),
        },
      });
      return reply.code(201).send(response);
    });

    app.post(
      '/auth/login',
      { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
      async (request, reply) => {
      const body = LoginRequestSchema.parse(request.body);
      const ua = request.headers['user-agent'] ?? undefined;
      const result = await service.login(body, ua);
      const response: AuthSuccessResponse = AuthSuccessResponseSchema.parse({
        user: result.user,
        tokens: {
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
          accessTokenExpiresAt: result.tokens.accessTokenExpiresAt.toISOString(),
          refreshTokenExpiresAt: result.tokens.refreshTokenExpiresAt.toISOString(),
        },
      });
      return reply.code(200).send(response);
    });

    app.post(
      '/auth/refresh',
      { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
      async (request, reply) => {
      const body = RefreshRequestSchema.parse(request.body);
      const ua = request.headers['user-agent'] ?? undefined;
      const result = await service.refresh(body.refreshToken, ua);
      const response: RefreshResponse = RefreshResponseSchema.parse({
        tokens: {
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
          accessTokenExpiresAt: result.tokens.accessTokenExpiresAt.toISOString(),
          refreshTokenExpiresAt: result.tokens.refreshTokenExpiresAt.toISOString(),
        },
      });
      return reply.code(200).send(response);
    });

    app.post('/auth/logout', async (request, reply) => {
      const body = LogoutRequestSchema.parse(request.body);
      await service.logout(body.refreshToken);
      return reply.code(204).send();
    });

    app.get('/auth/me', async (request, reply) => {
      const me = requireUser(request);
      const data = await service.getMeWithGuilds(me.id);
      const response: MeResponse = MeResponseSchema.parse(data);
      return reply.code(200).send(response);
    });

    app.patch('/users/me', async (request, reply) => {
      const me = requireUser(request);
      const body = UpdateMeRequestSchema.parse(request.body);
      const user = await service.updateMe(me.id, body);
      const response: UpdateMeResponse = UpdateMeResponseSchema.parse({ user });
      return reply.code(200).send(response);
    });

    return Promise.resolve();
  };

  return plugin;
};

export { AuthError };
