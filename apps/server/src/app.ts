import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { systemClock, type Clock } from './clock.js';
import type { AppConfig } from './config.js';
import type { DbPool } from './db/pool.js';
import { registerAuthRoutes } from './features/auth/routes.js';
import { ProcessingQueue } from './features/models/processing.js';
import { registerModelRoutes } from './features/models/routes.js';
import { registerModerationRoutes } from './features/moderation/routes.js';
import { registerExploreRoutes } from './features/explore/routes.js';
import { registerIssueRoutes } from './features/issues/routes.js';
import { registerSharingRoutes } from './features/sharing/routes.js';
import { registerStarRoutes } from './features/stars/routes.js';
import { registerDesignRoutes } from './features/designs/routes.js';
import { registerUploadRoutes } from './features/uploads/tus.js';
import { registerWeightRoutes } from './features/weights/routes.js';
import { registerUserRoutes } from './features/users/routes.js';
import { JobTracker } from './jobs/tracker.js';
import { registerHealthRoutes } from './observability/health.js';
import { registerAuth } from './plugins/auth.js';
import { registerErrorHandling } from './plugins/errors.js';
import { registerModelAccess } from './plugins/model-access.js';
import { registerRateLimits } from './plugins/rate-limits.js';
import { registerSecurityHeaders } from './plugins/security-headers.js';
import { registerStaticSpa } from './plugins/static-spa.js';
import { ensureStorageDirs } from './storage/paths.js';

declare module 'fastify' {
  interface FastifyInstance {
    processing: ProcessingQueue;
  }
}

export interface AppDeps {
  config: AppConfig;
  db: DbPool;
  clock?: Clock;
  /** Tests that don't exercise limits turn them off so fixtures can create many accounts. */
  rateLimitEnabled?: boolean;
  jobs?: JobTracker;
  /** Where log lines go; defaults to stdout. Tests capture it to check redaction. */
  logStream?: { write: (line: string) => void };
}

const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-share-link"]',
  'res.headers["set-cookie"]',
];

/** Builds the Fastify app without listening, so tests can drive it through `inject()`. */
export async function buildApp({
  config,
  db,
  clock = systemClock,
  rateLimitEnabled = true,
  jobs = new JobTracker(clock()),
  logStream,
}: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      ...(logStream ? { stream: logStream } : {}),
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
  await app.register(cookie);
  await registerRateLimits(app, { enabled: rateLimitEnabled });
  registerAuth(app, { jwtSecret: config.JWT_SECRET, clock });

  await ensureStorageDirs(config.STORAGE_DIR);
  const queue = new ProcessingQueue({
    pool: db,
    storageDir: config.STORAGE_DIR,
    clock,
    log: app.log,
  });
  app.decorate('processing', queue);
  const requireModelAccess = registerModelAccess(app, { db, clock });

  const routeDeps = { config, db, clock, rateLimitEnabled };
  registerHealthRoutes(app, { config, db, clock, jobs });
  registerAuthRoutes(app, routeDeps);
  registerUserRoutes(app, routeDeps);
  registerUploadRoutes(app, routeDeps);
  registerModelRoutes(app, { config, db, clock, queue, requireModelAccess });
  registerSharingRoutes(app, { ...routeDeps, requireModelAccess });
  registerIssueRoutes(app, { ...routeDeps, requireModelAccess });
  registerStarRoutes(app, { ...routeDeps, requireModelAccess });
  registerExploreRoutes(app, { db, clock });
  registerModerationRoutes(app, { ...routeDeps, requireModelAccess });
  registerWeightRoutes(app, { config, db, requireModelAccess });
  registerDesignRoutes(app, { db, clock });
  await registerStaticSpa(app, { config, db });

  return app;
}
