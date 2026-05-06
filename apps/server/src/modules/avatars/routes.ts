/**
 * Аватары — `POST /me/avatar` (multipart) для загрузки и `GET /avatars/:id`
 * для отдачи бинаря по URL'у который зашит в users.avatarUrl. GET
 * аутентифицирован — никто из публичной сети не может тащить аватары
 * по UUID-ам.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../plugins/auth-context.js';
import { AuthError } from '../auth/errors.js';
import {
  AvatarMimeError,
  AvatarSizeError,
  type AvatarsService,
} from './service.js';

const UserIdParamsSchema = z.object({ id: z.string().uuid() });

interface Deps {
  service: AvatarsService;
}

export const avatarRoutes = ({ service }: Deps): FastifyPluginAsync => {
  const plugin: FastifyPluginAsync = (app) => {
    app.post('/me/avatar', async (request, reply) => {
      const me = requireUser(request);
      const file = await request.file();
      if (!file) throw new AuthError('unauthorized');

      const buffer = await file.toBuffer();
      try {
        const result = await service.upload(me.id, {
          mimeType: file.mimetype,
          data: buffer,
        });
        return reply.code(201).send(result);
      } catch (err) {
        if (err instanceof AvatarMimeError) {
          return reply
            .code(415)
            .send({ error: 'avatar_mime_not_allowed', mimeType: err.mimeType });
        }
        if (err instanceof AvatarSizeError) {
          return reply
            .code(413)
            .send({ error: 'avatar_too_large', sizeBytes: err.sizeBytes });
        }
        throw err;
      }
    });

    app.get('/avatars/:id', async (request, reply) => {
      requireUser(request);
      const { id } = UserIdParamsSchema.parse(request.params);
      const rec = await service.resolve(id);
      if (!rec) {
        return reply.code(404).send({ error: 'avatar_not_found' });
      }
      void reply
        .header('Content-Type', rec.mimeType)
        .header('Content-Length', rec.sizeBytes)
        .header('Cache-Control', 'private, max-age=300')
        .header('X-Content-Type-Options', 'nosniff');
      return reply.send(service.streamFile(rec.storagePath));
    });

    return Promise.resolve();
  };
  return plugin;
};
