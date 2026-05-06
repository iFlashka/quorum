/**
 * GET /unfurl?url=... — резолвит OG/Twitter-meta для embed-карточки.
 * Аутентифицирован — публично пулять unfurl-запросы наш сервер не должен
 * (защита от использования его как SSRF-прокси).
 *
 * Ответ:
 *   200 + UnfurlData при успехе
 *   404 если ничего не нашли (no og, не html и т.п.)
 *   400 если URL невалидный / внутренний
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../plugins/auth-context.js';
import type { UnfurlService } from './service.js';

const QuerySchema = z.object({ url: z.string().url() });

interface Deps {
  service: UnfurlService;
}

export const unfurlRoutes = ({ service }: Deps): FastifyPluginAsync => {
  const plugin: FastifyPluginAsync = (app) => {
    app.get('/unfurl', async (request, reply) => {
      requireUser(request);
      const parsed = QuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_url' });
      }
      const data = await service.fetch(parsed.data.url);
      if (!data) return reply.code(404).send({ error: 'not_found' });
      return reply.send(data);
    });
    return Promise.resolve();
  };
  return plugin;
};
