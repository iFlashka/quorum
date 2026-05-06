import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { LivekitTokenResponseSchema } from '@quorum/shared';
import { requireUser } from '../../plugins/auth-context.js';
import { AuthError } from '../auth/errors.js';
import type { LivekitService } from './service.js';
import type { MessagesService } from '../messages/service.js';
import type { DbClient } from '../../db/client.js';
import { users } from '../../db/schema.js';

const ChannelIdParamsSchema = z.object({ id: z.string().uuid() });

interface Deps {
  service: LivekitService;
  messages: MessagesService;
  db: DbClient;
}

export const livekitRoutes = ({ service, messages, db }: Deps): FastifyPluginAsync => {
  const plugin: FastifyPluginAsync = (app) => {
    app.post('/channels/:id/voice/token', async (request, reply) => {
      const me = requireUser(request);
      const { id } = ChannelIdParamsSchema.parse(request.params);

      const ctx = await messages.accessChannel(me.id, id);
      if (!ctx) throw new AuthError('unauthorized');
      if (ctx.channel.kind !== 'voice') {
        return reply
          .code(400)
          .send({ error: 'BadRequest', message: 'Канал не голосовой' });
      }

      const [user] = await db
        .select({ displayName: users.displayName, username: users.username })
        .from(users)
        .where(eq(users.id, me.id))
        .limit(1);
      if (!user) throw new AuthError('unauthorized');

      const issued = await service.issueToken({
        userId: me.id,
        displayName: user.displayName || user.username,
        channelId: id,
      });
      return reply.send(LivekitTokenResponseSchema.parse(issued));
    });
    return Promise.resolve();
  };
  return plugin;
};
