import type { FastifyPluginAsync } from 'fastify';
import { TurnCredentialsResponseSchema } from '@quorum/shared';
import { requireUser } from '../../plugins/auth-context.js';
import type { TurnService } from './service.js';

interface Deps {
  service: TurnService;
}

export const turnRoutes = ({ service }: Deps): FastifyPluginAsync => {
  const plugin: FastifyPluginAsync = (app) => {
    app.get('/turn/credentials', async (request, reply) => {
      const me = requireUser(request);
      const res = service.generate(me.id);
      return reply.send(TurnCredentialsResponseSchema.parse(res));
    });
    return Promise.resolve();
  };
  return plugin;
};
