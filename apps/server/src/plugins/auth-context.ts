import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { TokenInvalidError, type TokenService } from '../modules/auth/tokens.js';
import { AuthError } from '../modules/auth/errors.js';

export interface AuthenticatedUser {
  id: string;
  username: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthenticatedUser | null;
  }
}

interface AuthContextOptions {
  tokens: TokenService;
}

const plugin: FastifyPluginAsync<AuthContextOptions> = (app, opts) => {
  const { tokens } = opts;

  app.addHook('onRequest', async (request) => {
    request.user = null;
    const auth = request.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return;
    const token = auth.slice('Bearer '.length).trim();
    if (!token) return;
    try {
      const claims = await tokens.verifyAccess(token);
      request.user = { id: claims.sub, username: claims.username };
    } catch (err) {
      if (err instanceof TokenInvalidError) return; // requireUser потом бросит 401
      throw err;
    }
  });

  return Promise.resolve();
};

export const authContextPlugin = fp(plugin, { name: 'auth-context' });

/** Helper для эндпоинтов, требующих авторизации. */
export function requireUser(req: FastifyRequest): AuthenticatedUser {
  if (!req.user) throw new AuthError('unauthorized');
  return req.user;
}
