import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { EmojiPathSchema } from '@quorum/shared';
import { requireUser } from '../../plugins/auth-context.js';
import type { ReactionsService } from './service.js';
import type { EventBus } from '../../realtime/event-bus.js';

const ParamsSchema = z.object({
  id: z.string().uuid(),
  msgId: z.string().uuid(),
  emoji: EmojiPathSchema,
});

interface Deps {
  service: ReactionsService;
  events: EventBus;
}

export const reactionRoutes = ({ service, events }: Deps): FastifyPluginAsync => {
  const plugin: FastifyPluginAsync = (app) => {
    app.put('/channels/:id/messages/:msgId/reactions/:emoji', async (request, reply) => {
      const me = requireUser(request);
      const params = ParamsSchema.parse({
        ...(request.params as Record<string, string>),
        emoji: decodeURIComponent((request.params as { emoji: string }).emoji),
      });
      const result = await service.add(me.id, params.id, params.msgId, params.emoji);
      events.publishToGuild(result.guildId, {
        t: 'reaction.add',
        channelId: params.id,
        messageId: params.msgId,
        userId: me.id,
        emoji: params.emoji,
      });
      return reply.code(204).send();
    });

    app.delete('/channels/:id/messages/:msgId/reactions/:emoji', async (request, reply) => {
      const me = requireUser(request);
      const params = ParamsSchema.parse({
        ...(request.params as Record<string, string>),
        emoji: decodeURIComponent((request.params as { emoji: string }).emoji),
      });
      const result = await service.remove(me.id, params.id, params.msgId, params.emoji);
      events.publishToGuild(result.guildId, {
        t: 'reaction.remove',
        channelId: params.id,
        messageId: params.msgId,
        userId: me.id,
        emoji: params.emoji,
      });
      return reply.code(204).send();
    });

    return Promise.resolve();
  };
  return plugin;
};
