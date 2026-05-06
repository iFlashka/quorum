import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../plugins/auth-context.js';
import { AuthError } from '../auth/errors.js';
import type { AttachmentsService } from './service.js';

const ChannelIdParamsSchema = z.object({ id: z.string().uuid() });
const AttachmentIdParamsSchema = z.object({ id: z.string().uuid() });

interface Deps {
  service: AttachmentsService;
}

export const attachmentRoutes = ({ service }: Deps): FastifyPluginAsync => {
  const plugin: FastifyPluginAsync = (app) => {
    app.post('/channels/:id/attachments', async (request, reply) => {
      const me = requireUser(request);
      ChannelIdParamsSchema.parse(request.params);

      const file = await request.file();
      if (!file) throw new AuthError('unauthorized'); // нет файла в запросе

      const buffer = await file.toBuffer();
      const attachment = await service.upload(me.id, {
        filename: file.filename,
        mimeType: file.mimetype,
        data: buffer,
      });

      return reply.code(201).send({ attachment });
    });

    app.get('/attachments/:id', async (request, reply) => {
      const me = requireUser(request);
      const { id } = AttachmentIdParamsSchema.parse(request.params);

      const access = await service.getAccessible(me.id, id);
      if (!access) throw new AuthError('unauthorized');

      const inline =
        access.mimeType.startsWith('image/') || access.mimeType === 'application/pdf';
      void reply
        .header('Content-Type', access.mimeType)
        .header('Content-Length', access.sizeBytes)
        .header('X-Content-Type-Options', 'nosniff')
        .header(
          'Content-Disposition',
          `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(access.filename)}"`,
        );

      return reply.send(service.streamFile(access.storagePath));
    });

    return Promise.resolve();
  };
  return plugin;
};
