/**
 * DM routes:
 *   - GET    /dm                          — список моих DM с last-message preview
 *   - POST   /dm/with/:userId             — создать или открыть DM
 *   - GET    /dm/:id/messages?limit&before
 *   - POST   /dm/:id/messages             — отправить (publishes dm.message.create)
 *   - PATCH  /dm/:id/messages/:msgId      — редактировать (publishes dm.message.update)
 *   - DELETE /dm/:id/messages/:msgId      — удалить (publishes dm.message.delete)
 *
 * После каждой write-операции событие публикуется через `EventBus.publishToUser`
 * обоим участникам DM-канала — UI patches cache реактивно.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  EditDmMessageRequestSchema,
  SendDmMessageRequestSchema,
} from '@quorum/shared';
import { requireUser } from '../../plugins/auth-context.js';
import { AuthError } from '../auth/errors.js';
import type { EventBus } from '../../realtime/event-bus.js';
import type { DmChannelsService } from './service.js';

const UserIdParams = z.object({ userId: z.string().uuid() });
const DmIdParams = z.object({ id: z.string().uuid() });
const DmMsgParams = z.object({ id: z.string().uuid(), msgId: z.string().uuid() });
const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().uuid().optional(),
});

interface Deps {
  service: DmChannelsService;
  events: EventBus;
}

export const dmRoutes = ({ service, events }: Deps): FastifyPluginAsync => {
  const plugin: FastifyPluginAsync = (app) => {
    app.get('/dm', async (request) => {
      const me = requireUser(request);
      const channels = await service.list(me.id);
      return { channels };
    });

    app.post('/dm/with/:userId', async (request, reply) => {
      const me = requireUser(request);
      const { userId } = UserIdParams.parse(request.params);
      const channel = await service.getOrCreate(me.id, userId);
      return reply.code(201).send({ channel });
    });

    app.get('/dm/:id/messages', async (request) => {
      const me = requireUser(request);
      const { id } = DmIdParams.parse(request.params);
      const { limit, before } = ListQuery.parse(request.query);
      const result = await service.listMessages(me.id, id, { limit, before });
      return result;
    });

    app.post('/dm/:id/messages', async (request, reply) => {
      const me = requireUser(request);
      const { id } = DmIdParams.parse(request.params);
      const body = SendDmMessageRequestSchema.parse(request.body);
      const message = await service.sendMessage(me.id, id, body);

      const recipients = await service.recipients(id);
      for (const userId of recipients) {
        events.publishToUser(userId, { t: 'dm.message.create', message });
      }
      return reply.code(201).send({ message });
    });

    app.patch('/dm/:id/messages/:msgId', async (request) => {
      const me = requireUser(request);
      const { id, msgId } = DmMsgParams.parse(request.params);
      const body = EditDmMessageRequestSchema.parse(request.body);
      const message = await service.editMessage(me.id, id, msgId, body.content);

      const recipients = await service.recipients(id);
      for (const userId of recipients) {
        events.publishToUser(userId, { t: 'dm.message.update', message });
      }
      return { message };
    });

    app.delete('/dm/:id/messages/:msgId', async (request, reply) => {
      const me = requireUser(request);
      const { id, msgId } = DmMsgParams.parse(request.params);
      await service.deleteMessage(me.id, id, msgId);

      const recipients = await service.recipients(id);
      for (const userId of recipients) {
        events.publishToUser(userId, {
          t: 'dm.message.delete',
          dmChannelId: id,
          messageId: msgId,
        });
      }
      return reply.code(204).send();
    });

    return Promise.resolve();
  };
  return plugin;
};

void AuthError; // переиспользуется через service-throws → Fastify-error-handler
