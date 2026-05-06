import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { MarkReadRequestSchema } from '@quorum/shared';
import { requireUser } from '../../plugins/auth-context.js';
import type { ReadStatesService } from './service.js';

const ChannelIdParamsSchema = z.object({ id: z.string().uuid() });

export const readStateRoutes = (opts: { service: ReadStatesService }): FastifyPluginAsync => {
  const { service } = opts;
  const plugin: FastifyPluginAsync = (app) => {
    app.post('/channels/:id/read', async (request, reply) => {
      const me = requireUser(request);
      const { id } = ChannelIdParamsSchema.parse(request.params);
      const body = MarkReadRequestSchema.parse(request.body);
      await service.markRead(me.id, id, body.messageId);
      return reply.code(204).send();
    });
    return Promise.resolve();
  };
  return plugin;
};
