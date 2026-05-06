import type { FastifyPluginAsync } from 'fastify';
import {
  ListChannelsResponseSchema,
  ListGuildsResponseSchema,
  ListMembersResponseSchema,
} from '@quorum/shared';
import { z } from 'zod';
import { requireUser } from '../../plugins/auth-context.js';
import { AuthError } from '../auth/errors.js';
import type { GuildsService } from './service.js';

const GuildIdParamsSchema = z.object({ id: z.string().uuid() });

export const guildRoutes = (opts: { service: GuildsService }): FastifyPluginAsync => {
  const { service } = opts;
  const plugin: FastifyPluginAsync = (app) => {
    app.get('/guilds', async (request, reply) => {
      const me = requireUser(request);
      const guildList = await service.listForUser(me.id);
      return reply.send(ListGuildsResponseSchema.parse({ guilds: guildList }));
    });

    app.get('/guilds/:id/channels', async (request, reply) => {
      const me = requireUser(request);
      const { id } = GuildIdParamsSchema.parse(request.params);
      const channelsList = await service.listChannels(me.id, id);
      if (channelsList === null) throw new AuthError('unauthorized');
      return reply.send(ListChannelsResponseSchema.parse({ channels: channelsList }));
    });

    app.get('/guilds/:id/members', async (request, reply) => {
      const me = requireUser(request);
      const { id } = GuildIdParamsSchema.parse(request.params);
      const list = await service.listMembers(me.id, id);
      if (list === null) throw new AuthError('unauthorized');
      return reply.send(ListMembersResponseSchema.parse({ members: list }));
    });

    return Promise.resolve();
  };
  return plugin;
};
