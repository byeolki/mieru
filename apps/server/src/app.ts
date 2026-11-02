import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { AppConfig } from './config.js';
import type { DbPool } from './db/pool.js';
import { registerHealthRoutes } from './observability/health.js';
import { registerErrorHandling } from './plugins/errors.js';
import { registerSecurityHeaders } from './plugins/security-headers.js';

export interface AppDeps {
  config: AppConfig;
  db: DbPool;
}

const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-share-link"]',
  'res.headers["set-cookie"]',
];

/** Builds the Fastify app without listening, so tests can drive it through `inject()`. */
export async function buildApp({ config, db }: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
      serializers: {
        req: (request: { method: string; url: string; headers: Record<string, unknown> }) => ({
          method: request.method,
          // Download tickets and share tokens travel in query strings; keep them out of logs.
          url: request.url.replace(/([?&](?:ticket|token)=)[^&]+/g, '$1[redacted]'),
          headers: request.headers,
        }),
      },
    },
    // Trust exactly TRUST_PROXY hops (Cloudflare tunnel -> Traefik) so request.ip is the real client.
    trustProxy: (_address: string, hop: number) => hop < config.TRUST_PROXY,
    bodyLimit: 1024 * 1024,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandling(app);
  await registerSecurityHeaders(app);
  registerHealthRoutes(app, { db, storageDir: config.STORAGE_DIR });

  return app;
}
