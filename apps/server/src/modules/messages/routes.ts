import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  EditMessageRequestSchema,
  ListMessagesQuerySchema,
  ListMessagesResponseSchema,
  MessageResponseSchema,
  SendMessageRequestSchema,
} from '@quorum/shared';
import { requireUser } from '../../plugins/auth-context.js';
import { AuthError } from '../auth/errors.js';
import type { MessagesService } from './service.js';
import type { EventBus } from '../../realtime/event-bus.js';

const ChannelIdParamsSchema = z.object({ id: z.string().uuid() });
const MessageInChannelParamsSchema = z.object({
  id: z.string().uuid(),
  msgId: z.string().uuid(),
});

interface Deps {
  service: MessagesService;
  events: EventBus;
}

export const messageRoutes = ({ service, events }: Deps): FastifyPluginAsync => {
  const plugin: FastifyPluginAsync = (app) => {
    app.get('/channels/:id/messages', async (request, reply) => {
      const me = requireUser(request);
      const { id } = ChannelIdParamsSchema.parse(request.params);
      const ctx = await service.accessChannel(me.id, id);
      if (!ctx) throw new AuthError('unauthorized');

      const query = ListMessagesQuerySchema.parse(request.query);
      const data = await service.list(ctx, me.id, query);
      return reply.send(ListMessagesResponseSchema.parse(data));
    });

    app.post('/channels/:id/messages', async (request, reply) => {
      const me = requireUser(request);
      const { id } = ChannelIdParamsSchema.parse(request.params);
      const ctx = await service.accessChannel(me.id, id);
      if (!ctx) throw new AuthError('unauthorized');

      const body = SendMessageRequestSchema.parse(request.body);
      const message = await service.send(ctx, me.id, body, me.id);

      events.publishToGuild(ctx.channel.guildId, {
        t: 'message.create',
        message,
      });

      return reply.code(201).send(MessageResponseSchema.parse({ message }));
    });

    app.patch('/channels/:id/messages/:msgId', async (request, reply) => {
      const me = requireUser(request);
      const { id, msgId } = MessageInChannelParamsSchema.parse(request.params);
      const ctx = await service.accessChannel(me.id, id);
      if (!ctx) throw new AuthError('unauthorized');

      const body = EditMessageRequestSchema.parse(request.body);
      const message = await service.edit(ctx, me.id, msgId, body.content, me.id);

      events.publishToGuild(ctx.channel.guildId, {
        t: 'message.update',
        message,
      });

      return reply.send(MessageResponseSchema.parse({ message }));
    });

    app.delete('/channels/:id/messages/:msgId', async (request, reply) => {
      const me = requireUser(request);
      const { id, msgId } = MessageInChannelParamsSchema.parse(request.params);
      const ctx = await service.accessChannel(me.id, id);
      if (!ctx) throw new AuthError('unauthorized');

      await service.delete(ctx, me.id, msgId);

      events.publishToGuild(ctx.channel.guildId, {
        t: 'message.delete',
        channelId: id,
        messageId: msgId,
      });

      return reply.code(204).send();
    });

    return Promise.resolve();
  };
  return plugin;
};
