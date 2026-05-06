import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = (app) => {
  app.get('/health', () => ({
    status: 'ok' as const,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  }));
  return Promise.resolve();
};
